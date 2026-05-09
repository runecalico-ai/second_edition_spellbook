use crate::commands::{
    app_models_dir, ensure_resources_available, models_dir, LiveResourceProbe, ProvisioningState,
    ProvisioningTarget, EMBEDDING_DESTINATION, EMBEDDING_EXPECTED_FILES, EMBEDDING_URL,
};
use crate::error::AppError;
use crate::models::{
    EmbeddingsStatus, EmbeddingsStatusResponse, ReindexProgressEvent, ReindexResult,
    SemanticSearchResult, SpellSummary,
};
use fastembed::TextEmbedding;
use futures_util::StreamExt;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tokio::io::AsyncWriteExt;
use tokio::sync::watch;

// Runtime-generic `AppHandle` so `embeddings_download_model` can be dispatched
// through both the real Wry runtime and `tauri::test::MockRuntime` in
// command-boundary tests below (mirrors `commands/llm.rs::LlmCommandAppHandle`).
#[cfg(test)]
pub(crate) type EmbeddingsCommandAppHandle = tauri::AppHandle<tauri::test::MockRuntime>;
#[cfg(not(test))]
pub(crate) type EmbeddingsCommandAppHandle = tauri::AppHandle;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DownloadCleanupState {
    Running,
    Finished,
}

#[derive(Debug)]
pub(crate) struct ActiveEmbeddingDownload {
    session_epoch: u64,
    bytes_downloaded: u64,
    total_bytes: u64,
    cancel_tx: watch::Sender<bool>,
    completion_tx: watch::Sender<DownloadCleanupState>,
}

pub struct EmbeddingState {
    /// Populated when the embedding model is loaded (Task 3+).
    #[allow(dead_code)]
    pub(crate) model: Mutex<Option<Arc<Mutex<TextEmbedding>>>>,
    pub(crate) status: Mutex<EmbeddingsStatus>,
    pub(crate) last_error: Mutex<Option<String>>,
    pub(crate) download_state: Mutex<Option<ActiveEmbeddingDownload>>,
    download_epoch: AtomicU64,
}

impl Default for EmbeddingState {
    fn default() -> Self {
        Self {
            model: Mutex::new(None),
            status: Mutex::new(EmbeddingsStatus::NotProvisioned),
            last_error: Mutex::new(None),
            download_state: Mutex::new(None),
            download_epoch: AtomicU64::new(0),
        }
    }
}

type EmbeddingDownloadControl = (
    u64,
    watch::Sender<bool>,
    watch::Receiver<DownloadCleanupState>,
);
const EMBEDDING_DOWNLOAD_CANCELLED_MESSAGE: &str = "Embedding download cancelled";
const DOWNLOAD_CLEANUP_WAIT_POLL_INTERVAL: std::time::Duration =
    std::time::Duration::from_millis(10);
const DOWNLOAD_CLEANUP_WAIT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);
const DOWNLOAD_CONTROL_WAIT_POLL_INTERVAL: std::time::Duration =
    std::time::Duration::from_millis(10);
const DOWNLOAD_CONTROL_WAIT_TIMEOUT: std::time::Duration = std::time::Duration::from_millis(250);
type SpellEmbeddingRow = (i64, String, String);

fn set_embeddings_status(
    state: &EmbeddingState,
    status: EmbeddingsStatus,
    last_error: Option<String>,
) -> Result<(), AppError> {
    {
        let mut guard = state
            .status
            .lock()
            .map_err(|_| AppError::Search("embedding status lock poisoned".to_string()))?;
        *guard = status;
    }
    {
        let mut guard = state
            .last_error
            .lock()
            .map_err(|_| AppError::Search("embedding error lock poisoned".to_string()))?;
        *guard = last_error;
    }
    Ok(())
}

fn build_embeddings_status_response(
    state: &EmbeddingState,
) -> Result<EmbeddingsStatusResponse, AppError> {
    let state_value = *state
        .status
        .lock()
        .map_err(|_| AppError::Search("embedding status lock poisoned".to_string()))?;
    let error_message = state
        .last_error
        .lock()
        .map_err(|_| AppError::Search("embedding error lock poisoned".to_string()))?
        .clone();

    let download_progress = state
        .download_state
        .lock()
        .map_err(|_| AppError::Search("embedding download lock poisoned".to_string()))?
        .as_ref()
        .and_then(|download| {
            if download.total_bytes == 0 {
                None
            } else {
                Some(download.bytes_downloaded as f64 / download.total_bytes as f64)
            }
        });

    Ok(EmbeddingsStatusResponse {
        state: state_value,
        download_progress,
        error_message,
    })
}

fn current_download_control(
    state: &EmbeddingState,
) -> Result<Option<EmbeddingDownloadControl>, AppError> {
    let guard = state
        .download_state
        .lock()
        .map_err(|_| AppError::Search("embedding download lock poisoned".to_string()))?;
    Ok(guard.as_ref().map(|download| {
        (
            download.session_epoch,
            download.cancel_tx.clone(),
            download.completion_tx.subscribe(),
        )
    }))
}

fn ensure_no_active_embedding_download(state: &EmbeddingState) -> Result<(), AppError> {
    let active = state
        .download_state
        .lock()
        .map_err(|_| AppError::Search("embedding download lock poisoned".to_string()))?
        .is_some();
    if active {
        return Err(AppError::Validation(
            "Cannot run embedding operation while download is active".to_string(),
        ));
    }
    Ok(())
}

fn compose_spell_embedding_text(name: &str, description: &str) -> String {
    format!("{}\n\n{}", name.trim(), description.trim())
}

fn require_embedding_dimension(vector: &[f32]) -> Result<(), AppError> {
    if vector.len() != 384 {
        return Err(AppError::Search(format!(
            "Embedding dimension mismatch: expected 384, got {}",
            vector.len()
        )));
    }
    Ok(())
}

/// H-001: Task 3 Step 3.3 (`TextEmbedding::try_new` + `InitOptions` / `TextInitOptions`); startup wiring
/// (`initialize_embeddings_after_startup`, Task 7 plan) will call this from `spawn_blocking`.
#[allow(dead_code)]
fn load_embedding_model_blocking(
    models_root: &std::path::Path,
) -> Result<std::sync::Arc<fastembed::TextEmbedding>, AppError> {
    use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};

    let mut options = InitOptions::new(EmbeddingModel::AllMiniLML6V2);
    options.cache_dir = models_root.to_path_buf();

    TextEmbedding::try_new(options)
        .map(std::sync::Arc::new)
        .map_err(|e| AppError::Search(format!("failed to initialize fastembed runtime: {e}")))
}

async fn await_ready_model_with_timeout(
    state: std::sync::Arc<EmbeddingState>,
    timeout: std::time::Duration,
) -> Result<std::sync::Arc<std::sync::Mutex<fastembed::TextEmbedding>>, AppError> {
    let wait_for_ready = async move {
        loop {
            let status = *state
                .status
                .lock()
                .map_err(|_| AppError::Search("embedding status lock poisoned".to_string()))?;

            // M-001: Task 3 Step 3.3 — fail fast when status is Ready but the model slot is empty
            // (plan lines 964–971).
            if status == EmbeddingsStatus::Ready {
                let model = state
                    .model
                    .lock()
                    .map_err(|_| AppError::Search("embedding model lock poisoned".to_string()))?
                    .clone()
                    .ok_or_else(|| {
                        AppError::Search(
                            "embedding status is ready but model is not loaded".to_string(),
                        )
                    })?;
                return Ok(model);
            }

            if status == EmbeddingsStatus::Error {
                let last_error = state
                    .last_error
                    .lock()
                    .map_err(|_| AppError::Search("embedding error lock poisoned".to_string()))?
                    .clone()
                    .unwrap_or_else(|| "embedding state entered error without message".to_string());
                return Err(AppError::Search(last_error));
            }

            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }
    };

    tokio::time::timeout(timeout, wait_for_ready)
        .await
        .map_err(|_| {
            AppError::Search("timed out waiting for embedding model readiness".to_string())
        })?
}

/// M-002: Task 3 Step 3.3 — take `&mut TextEmbedding` (fastembed `embed` uses
/// `&mut self`); callers lock the outer `Mutex` in `spawn_blocking` (plan lines
/// 993–1003, adjusted for fastembed 5.13).
fn embed_spell_text(
    model: &mut fastembed::TextEmbedding,
    text: &str,
) -> Result<Vec<f32>, AppError> {
    let vectors = model
        .embed(vec![text.to_owned()], None)
        .map_err(|e| AppError::Search(format!("single embedding failed: {e}")))?;

    let vector = vectors
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Search("single embedding returned zero vectors".to_string()))?;
    require_embedding_dimension(&vector)?;
    Ok(vector)
}

/// M-002: Task 3 Step 3.3 — batch variant (plan lines 1005–1025).
fn embed_spell_texts_batch(
    model: &mut fastembed::TextEmbedding,
    texts: &[String],
) -> Result<Vec<Vec<f32>>, AppError> {
    let vectors = model
        .embed(texts.to_vec(), None)
        .map_err(|e| AppError::Search(format!("batch embedding failed: {e}")))?;

    if vectors.len() != texts.len() {
        return Err(AppError::Search(format!(
            "batch embedding cardinality mismatch: expected {}, got {}",
            texts.len(),
            vectors.len()
        )));
    }

    for vector in &vectors {
        require_embedding_dimension(vector)?;
    }

    Ok(vectors)
}

fn load_reindex_candidates(
    pool: &std::sync::Arc<crate::db::Pool>,
    force: bool,
) -> Result<Vec<SpellEmbeddingRow>, AppError> {
    let conn = pool.get()?;
    let sql = if force {
        "SELECT s.id, s.name, s.description
         FROM spell s
         ORDER BY s.id"
    } else {
        "SELECT s.id, s.name, s.description
         FROM spell s
         LEFT JOIN spell_vec v ON v.rowid = s.id
         WHERE v.rowid IS NULL
         ORDER BY s.id"
    };

    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row?);
    }
    Ok(out)
}

async fn upsert_embedding_chunk(
    pool: std::sync::Arc<crate::db::Pool>,
    rows: &[SpellEmbeddingRow],
    vectors: &[Vec<f32>],
) -> Result<(), AppError> {
    if rows.len() != vectors.len() {
        return Err(AppError::Search(format!(
            "upsert cardinality mismatch: rows={}, vectors={}",
            rows.len(),
            vectors.len()
        )));
    }

    let owned_rows = rows.to_vec();
    let owned_vectors = vectors.to_vec();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let tx = conn.unchecked_transaction()?;
        for (idx, row) in owned_rows.iter().enumerate() {
            let vector_json = serde_json::to_string(&owned_vectors[idx]).map_err(|e| {
                AppError::Search(format!("failed to serialize embedding vector: {e}"))
            })?;
            tx.execute(
                "DELETE FROM spell_vec WHERE rowid = ?1",
                rusqlite::params![row.0],
            )?;
            tx.execute(
                "INSERT INTO spell_vec(rowid, v) VALUES(?1, vec_f32(?2))",
                rusqlite::params![row.0, vector_json],
            )?;
        }
        tx.commit()?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Search(format!("embedding upsert task failed: {e}")))?
}

async fn embed_single_spell_row(
    state: std::sync::Arc<EmbeddingState>,
    pool: std::sync::Arc<crate::db::Pool>,
    spell_id: i64,
    name: String,
    description: String,
) -> Result<(), AppError> {
    let model = await_ready_model_with_timeout(state, std::time::Duration::from_secs(5)).await?;
    let text = compose_spell_embedding_text(&name, &description);

    let vector = tokio::task::spawn_blocking(move || {
        let mut guard = model
            .lock()
            .map_err(|_| AppError::Search("embedding model lock poisoned".to_string()))?;
        embed_spell_text(&mut *guard, &text)
    })
    .await
    .map_err(|e| AppError::Search(format!("single embedding task failed: {e}")))??;

    let rows = vec![(spell_id, name, description)];
    let vectors = vec![vector];
    upsert_embedding_chunk(pool, &rows, &vectors).await
}

pub async fn enqueue_spell_embedding_if_ready(
    state: Arc<EmbeddingState>,
    pool: Arc<crate::db::Pool>,
    spell_id: i64,
    name: String,
    description: String,
) -> Result<(), AppError> {
    let status = *state
        .status
        .lock()
        .map_err(|_| AppError::Search("embedding status lock poisoned".to_string()))?;

    if status != EmbeddingsStatus::Ready {
        let pool_for_cleanup = Arc::clone(&pool);
        tauri::async_runtime::spawn(async move {
            let cleanup = tokio::task::spawn_blocking(move || {
                let conn = pool_for_cleanup.get()?;
                conn.execute(
                    "DELETE FROM spell_vec WHERE rowid = ?1",
                    rusqlite::params![spell_id],
                )?;
                Ok::<(), AppError>(())
            })
            .await;

            match cleanup {
                Ok(Ok(())) => {
                    tracing::info!(
                        spell_id,
                        ?status,
                        "embedding skipped; stale vector invalidated"
                    )
                }
                Ok(Err(error)) => tracing::warn!(
                    spell_id,
                    ?status,
                    ?error,
                    "embedding skipped; stale vector invalidation failed (non-fatal)"
                ),
                Err(join_error) => tracing::warn!(
                    spell_id,
                    ?status,
                    ?join_error,
                    "embedding skipped; stale vector invalidation join failed (non-fatal)"
                ),
            }
        });
        return Ok(());
    }

    let state_for_task = Arc::clone(&state);
    tauri::async_runtime::spawn(async move {
        if let Err(error) =
            embed_single_spell_row(state_for_task, pool, spell_id, name, description).await
        {
            tracing::warn!(spell_id, ?error, "embedding write hook failed (non-fatal)");
        }
    });

    Ok(())
}

async fn embed_import_batch_rows(
    state: std::sync::Arc<EmbeddingState>,
    pool: std::sync::Arc<crate::db::Pool>,
    rows: Vec<SpellEmbeddingRow>,
) -> Result<(), AppError> {
    if rows.is_empty() {
        return Ok(());
    }

    let model = await_ready_model_with_timeout(state, std::time::Duration::from_secs(10)).await?;
    let texts: Vec<String> = rows
        .iter()
        .map(|(_, name, description)| compose_spell_embedding_text(name, description))
        .collect();
    let vectors = tokio::task::spawn_blocking(move || {
        let mut guard = model
            .lock()
            .map_err(|_| AppError::Search("embedding model lock poisoned".to_string()))?;
        embed_spell_texts_batch(&mut *guard, &texts)
    })
    .await
    .map_err(|e| AppError::Search(format!("batch embedding task failed: {e}")))??;

    upsert_embedding_chunk(pool, &rows, &vectors).await
}

pub async fn enqueue_import_embeddings_if_ready(
    state: Arc<EmbeddingState>,
    pool: Arc<crate::db::Pool>,
    rows: Vec<(i64, String, String)>,
) -> Result<(), AppError> {
    if rows.is_empty() {
        return Ok(());
    }

    let status = *state
        .status
        .lock()
        .map_err(|_| AppError::Search("embedding status lock poisoned".to_string()))?;

    if status != EmbeddingsStatus::Ready {
        let stale_ids: Vec<i64> = rows.iter().map(|(id, _, _)| *id).collect();
        let count = stale_ids.len();
        let pool_for_cleanup = Arc::clone(&pool);
        tauri::async_runtime::spawn(async move {
            let cleanup = tokio::task::spawn_blocking(move || {
                let conn = pool_for_cleanup.get()?;
                for spell_id in stale_ids {
                    conn.execute(
                        "DELETE FROM spell_vec WHERE rowid = ?1",
                        rusqlite::params![spell_id],
                    )?;
                }
                Ok::<(), AppError>(())
            })
            .await;

            match cleanup {
                Ok(Ok(())) => tracing::info!(
                    count,
                    ?status,
                    "import embeddings skipped; stale vectors invalidated"
                ),
                Ok(Err(error)) => tracing::warn!(
                    count,
                    ?status,
                    ?error,
                    "import embeddings skipped; stale vector invalidation failed (non-fatal)"
                ),
                Err(join_error) => tracing::warn!(
                    count,
                    ?status,
                    ?join_error,
                    "import embeddings skipped; stale vector invalidation join failed (non-fatal)"
                ),
            }
        });
        return Ok(());
    }

    let state_for_task = Arc::clone(&state);
    let count = rows.len();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = embed_import_batch_rows(state_for_task, pool, rows).await {
            tracing::warn!(count, ?error, "import embedding hook failed (non-fatal)");
        }
    });

    Ok(())
}

fn load_total_spell_count(pool: &Arc<crate::db::Pool>) -> Result<u32, AppError> {
    let conn = pool.get()?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM spell", [], |row| row.get(0))?;
    Ok(count.max(0) as u32)
}

fn load_reindex_candidate_count(pool: &Arc<crate::db::Pool>, force: bool) -> Result<u32, AppError> {
    if force {
        return load_total_spell_count(pool);
    }

    let conn = pool.get()?;
    let count: i64 = conn.query_row(
        "SELECT COUNT(*)
         FROM spell s
         LEFT JOIN spell_vec v ON v.rowid = s.id
         WHERE v.rowid IS NULL",
        [],
        |row| row.get(0),
    )?;
    Ok(count.max(0) as u32)
}

pub async fn search_spells_semantic_internal(
    embedding_state: Arc<EmbeddingState>,
    db: Arc<crate::db::Pool>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<SemanticSearchResult>, AppError> {
    let model =
        await_ready_model_with_timeout(embedding_state, std::time::Duration::from_secs(30)).await?;
    let query_text = query.trim().to_string();
    let query_vector = tokio::task::spawn_blocking(move || {
        let mut guard = model
            .lock()
            .map_err(|_| AppError::Search("embedding model lock poisoned".to_string()))?;
        embed_spell_text(&mut *guard, &query_text)
    })
    .await
    .map_err(|e| AppError::Search(format!("query embedding task failed: {e}")))??;

    let max_rows = limit.unwrap_or(10).clamp(1, 1000);

    tokio::task::spawn_blocking(move || {
        let conn = db.get()?;
        let query_json = serde_json::to_string(&query_vector)
            .map_err(|e| AppError::Search(format!("query vector serialization failed: {e}")))?;

        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.school, s.sphere, s.level, s.class_list, s.components, s.duration,
                    s.source, s.is_quest_spell, s.is_cantrip, s.tags,
                    vec_distance_cosine(v.v, ?) AS cosine_distance
             FROM spell_vec v
             JOIN spell s ON s.id = v.rowid
             ORDER BY cosine_distance ASC
             LIMIT ?",
        )?;

        let rows = stmt.query_map(rusqlite::params![query_json, max_rows], |row| {
            Ok(SemanticSearchResult {
                spell: SpellSummary {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    school: row.get(2)?,
                    sphere: row.get(3)?,
                    level: row.get(4)?,
                    class_list: row.get(5)?,
                    components: row.get(6)?,
                    duration: row.get(7)?,
                    source: row.get(8)?,
                    is_quest_spell: row.get(9)?,
                    is_cantrip: row.get(10)?,
                    tags: row.get(11)?,
                },
                cosine_distance: row.get(12)?,
            })
        })?;

        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok::<Vec<SemanticSearchResult>, AppError>(out)
    })
    .await
    .map_err(|e| AppError::Search(format!("semantic query task failed: {e}")))?
}

#[tauri::command]
pub async fn search_spells_semantic(
    state: tauri::State<'_, Arc<EmbeddingState>>,
    db: tauri::State<'_, Arc<crate::db::Pool>>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<SemanticSearchResult>, AppError> {
    search_spells_semantic_internal(state.inner().clone(), db.inner().clone(), query, limit).await
}

pub async fn reindex_embeddings_internal(
    app: EmbeddingsCommandAppHandle,
    state: Arc<EmbeddingState>,
    db: Arc<crate::db::Pool>,
    force: bool,
) -> Result<ReindexResult, AppError> {
    ensure_no_active_embedding_download(state.as_ref())?;
    let model = await_ready_model_with_timeout(state, std::time::Duration::from_secs(30)).await?;

    let pool_for_total = Arc::clone(&db);
    let total = tokio::task::spawn_blocking(move || load_total_spell_count(&pool_for_total))
        .await
        .map_err(|e| AppError::Search(format!("reindex total-count query task failed: {e}")))??;

    let pool_for_candidate_count = Arc::clone(&db);
    let candidate_count = tokio::task::spawn_blocking(move || {
        load_reindex_candidate_count(&pool_for_candidate_count, force)
    })
    .await
    .map_err(|e| AppError::Search(format!("reindex candidate-count query task failed: {e}")))??;

    let pool_for_rows = Arc::clone(&db);
    let rows = tokio::task::spawn_blocking(move || load_reindex_candidates(&pool_for_rows, force))
        .await
        .map_err(|e| AppError::Search(format!("reindex candidate query task failed: {e}")))??;

    if rows.len() as u32 != candidate_count {
        return Err(AppError::Search(format!(
            "reindex candidate mismatch: count query={}, row query={}",
            candidate_count,
            rows.len()
        )));
    }

    let initial_skipped = if force {
        0
    } else {
        total.saturating_sub(candidate_count)
    };

    if candidate_count == 0 {
        return Ok(ReindexResult {
            total,
            indexed: 0,
            skipped: initial_skipped,
            failed: 0,
        });
    }

    let mut indexed = 0_u32;
    let mut failed = 0_u32;

    for (offset, chunk) in rows.chunks(128).enumerate() {
        let texts: Vec<String> = chunk
            .iter()
            .map(|(_, name, description)| compose_spell_embedding_text(name, description))
            .collect();

        let model_for_chunk = Arc::clone(&model);
        match tokio::task::spawn_blocking(move || {
            let mut guard = model_for_chunk
                .lock()
                .map_err(|_| AppError::Search("embedding model lock poisoned".to_string()))?;
            embed_spell_texts_batch(&mut *guard, &texts)
        })
        .await
        {
            Ok(Ok(vectors)) => match upsert_embedding_chunk(Arc::clone(&db), chunk, &vectors).await
            {
                Ok(()) => {
                    indexed += chunk.len() as u32;
                }
                Err(error) => {
                    tracing::warn!(
                        ?error,
                        chunk_len = chunk.len(),
                        "reindex chunk upsert failed"
                    );
                    failed += chunk.len() as u32;
                }
            },
            Ok(Err(error)) => {
                tracing::warn!(?error, chunk_len = chunk.len(), "reindex chunk failed");
                failed += chunk.len() as u32;
            }
            Err(join_error) => {
                return Err(AppError::Search(format!(
                    "reindex embedding chunk task failed: {join_error}"
                )));
            }
        }

        let current = ((offset + 1) * 128).min(candidate_count as usize) as u32;
        app.emit(
            "embeddings://reindex-progress",
            ReindexProgressEvent {
                current,
                total: candidate_count,
            },
        )
        .map_err(|e| AppError::Search(format!("failed to emit reindex progress: {e}")))?;
    }

    let skipped = initial_skipped;

    Ok(ReindexResult {
        total,
        indexed,
        skipped,
        failed,
    })
}

#[tauri::command]
pub async fn reindex_embeddings(
    app: EmbeddingsCommandAppHandle,
    state: tauri::State<'_, Arc<EmbeddingState>>,
    db: tauri::State<'_, Arc<crate::db::Pool>>,
    provisioning: tauri::State<'_, Arc<ProvisioningState>>,
    force: bool,
) -> Result<ReindexResult, AppError> {
    let _lease = provisioning.start_download(ProvisioningTarget::Embeddings)?;
    reindex_embeddings_internal(app, state.inner().clone(), db.inner().clone(), force).await
}

#[cfg(test)]
fn test_pool() -> crate::db::Pool {
    crate::db::init_db(None, false).expect("test pool")
}

/// Used by later tasks for vault-relative bundle detection.
#[allow(dead_code)]
fn approved_embedding_bundle_present(vault_root: &std::path::Path) -> Result<bool, AppError> {
    let bundle_root = models_dir(vault_root).join(EMBEDDING_DESTINATION);
    match std::fs::metadata(bundle_root) {
        Ok(metadata) => Ok(metadata.is_dir()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(AppError::from(error)),
    }
}

fn begin_embedding_download(
    state: &EmbeddingState,
    total_bytes: u64,
) -> Result<watch::Receiver<bool>, AppError> {
    let session_epoch = state
        .download_epoch
        .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
        + 1;
    let (cancel_tx, cancel_rx) = watch::channel(false);
    let (completion_tx, _completion_rx) = watch::channel(DownloadCleanupState::Running);

    let mut guard = state
        .download_state
        .lock()
        .map_err(|_| AppError::Search("embedding download lock poisoned".to_string()))?;
    *guard = Some(ActiveEmbeddingDownload {
        session_epoch,
        bytes_downloaded: 0,
        total_bytes,
        cancel_tx,
        completion_tx,
    });
    Ok(cancel_rx)
}

fn update_download_progress(
    state: &EmbeddingState,
    bytes_downloaded: u64,
    total_bytes: u64,
) -> Result<(), AppError> {
    let mut guard = state
        .download_state
        .lock()
        .map_err(|_| AppError::Search("embedding download lock poisoned".to_string()))?;
    let active = guard
        .as_mut()
        .ok_or_else(|| AppError::Search("No active embedding download".to_string()))?;
    active.bytes_downloaded = bytes_downloaded;
    active.total_bytes = total_bytes;
    Ok(())
}

fn finish_download_session(state: &EmbeddingState) -> Result<(), AppError> {
    let completion_tx = {
        let mut guard = state
            .download_state
            .lock()
            .map_err(|_| AppError::Search("embedding download lock poisoned".to_string()))?;
        let completion = guard
            .as_ref()
            .map(|download| download.completion_tx.clone());
        *guard = None;
        completion
    };
    if let Some(tx) = completion_tx {
        tx.send_replace(DownloadCleanupState::Finished);
    }
    Ok(())
}

fn sha256_file(path: &std::path::Path) -> Result<String, AppError> {
    use sha2::{Digest, Sha256};
    use std::io::Read;

    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:X}", hasher.finalize()))
}

fn validate_embedding_bundle_layout(path: &std::path::Path) -> Result<(), AppError> {
    let expected_paths = EMBEDDING_EXPECTED_FILES
        .iter()
        .map(|expected| expected_relative_path(expected.relative_path))
        .collect::<std::collections::BTreeSet<_>>();
    let mut stack = vec![path.to_path_buf()];
    while let Some(current) = stack.pop() {
        for entry in std::fs::read_dir(&current)? {
            let entry = entry?;
            let entry_path = entry.path();
            let file_type = std::fs::symlink_metadata(&entry_path)?.file_type();
            if file_type.is_symlink() {
                return Err(AppError::Validation(format!(
                    "Symbolic links are not allowed in embedding bundle: {}",
                    entry_path.display()
                )));
            }

            let relative = entry_path.strip_prefix(path).map_err(|error| {
                AppError::Search(format!(
                    "Failed to derive embedding bundle relative path: {error}"
                ))
            })?;
            if file_type.is_dir() {
                stack.push(entry_path);
                continue;
            }

            let relative_display = relative.to_string_lossy().replace('\\', "/");
            if !expected_paths.contains(relative_display.as_str()) {
                // M-002: enforce closed-set inventory for side-loaded bundles.
                return Err(AppError::Validation(format!(
                    "Unexpected embedding bundle file: {}",
                    relative_display
                )));
            }
        }
    }

    for expected in EMBEDDING_EXPECTED_FILES {
        let relative = expected
            .relative_path
            .strip_prefix("embeddings/all-MiniLM-L6-v2/")
            .unwrap_or(expected.relative_path);
        let file_path = path.join(relative);
        if !file_path.is_file() {
            return Err(AppError::Validation(format!(
                "Missing required embedding bundle file: {}",
                expected.relative_path
            )));
        }

        let metadata = std::fs::metadata(&file_path)?;
        if metadata.len() != expected.size_bytes {
            return Err(AppError::Validation(format!(
                "Embedding file size mismatch for {}",
                expected.relative_path
            )));
        }

        let sha = sha256_file(&file_path)?;
        if !sha.eq_ignore_ascii_case(expected.sha256) {
            return Err(AppError::Validation(format!(
                "Embedding file hash mismatch for {}",
                expected.relative_path
            )));
        }
    }

    Ok(())
}

fn expected_relative_path(relative_path: &str) -> &str {
    relative_path
        .strip_prefix("embeddings/all-MiniLM-L6-v2/")
        .unwrap_or(relative_path)
}

fn embedding_file_url(relative_path: &str) -> Result<String, AppError> {
    let (repo_prefix, revision) = EMBEDDING_URL
        .split_once("/tree/")
        .ok_or_else(|| AppError::Search("Invalid embedding URL format".to_string()))?;
    Ok(format!(
        "{repo_prefix}/resolve/{revision}/{}",
        expected_relative_path(relative_path)
    ))
}

fn initial_resumed_bytes(resume_from: u64, expected_size: u64) -> u64 {
    resume_from.min(expected_size)
}

fn resumed_bytes_after_response(resume_from: u64, status: reqwest::StatusCode) -> u64 {
    if resume_from > 0 && status == reqwest::StatusCode::OK {
        0
    } else {
        resume_from
    }
}

async fn emit_download_progress(
    app: &EmbeddingsCommandAppHandle,
    bytes_downloaded: u64,
    total_bytes: u64,
) -> Result<(), AppError> {
    app.emit(
        "embeddings://download-progress",
        crate::models::EmbeddingsDownloadProgressEvent {
            bytes_downloaded,
            total_bytes,
        },
    )
    .map_err(|e| AppError::Search(format!("failed to emit embedding download progress: {e}")))
}

async fn wait_for_download_control_or_idle(
    state: &EmbeddingState,
) -> Result<Option<(watch::Sender<bool>, watch::Receiver<DownloadCleanupState>)>, AppError> {
    wait_for_download_control_or_idle_with_timeout(
        || current_download_control(state),
        DOWNLOAD_CONTROL_WAIT_TIMEOUT,
        DOWNLOAD_CONTROL_WAIT_POLL_INTERVAL,
    )
    .await
}

async fn wait_for_download_control_or_idle_with_timeout<F>(
    mut current_control: F,
    timeout: std::time::Duration,
    poll_interval: std::time::Duration,
) -> Result<Option<(watch::Sender<bool>, watch::Receiver<DownloadCleanupState>)>, AppError>
where
    F: FnMut() -> Result<Option<EmbeddingDownloadControl>, AppError>,
{
    let Some(target_epoch) = current_control()?.map(|value| value.0) else {
        return Ok(None);
    };

    // M-001: bounded stabilization wait avoids hangs if the target session vanishes.
    let deadline = tokio::time::Instant::now() + timeout;
    loop {
        if let Some((session_epoch, cancel_tx, completion_rx)) = current_control()? {
            if session_epoch == target_epoch {
                return Ok(Some((cancel_tx, completion_rx)));
            }
            return Ok(None);
        }
        if tokio::time::Instant::now() >= deadline {
            return Ok(None);
        }
        tokio::time::sleep(poll_interval).await;
    }
}

async fn wait_for_download_cleanup_or_idle(
    state: &EmbeddingState,
    completion_rx: watch::Receiver<DownloadCleanupState>,
) -> Result<(), AppError> {
    wait_for_download_cleanup_or_idle_with_timeout(
        state,
        completion_rx,
        DOWNLOAD_CLEANUP_WAIT_TIMEOUT,
        DOWNLOAD_CLEANUP_WAIT_POLL_INTERVAL,
    )
    .await
}

async fn wait_for_download_cleanup_or_idle_with_timeout(
    state: &EmbeddingState,
    mut completion_rx: watch::Receiver<DownloadCleanupState>,
    timeout: std::time::Duration,
    poll_interval: std::time::Duration,
) -> Result<(), AppError> {
    // M-006: bounded wait to avoid indefinite spin if cleanup completion signal/state clear fails.
    let deadline = tokio::time::Instant::now() + timeout;
    let mut channel_open = true;
    loop {
        if current_download_control(state)?.is_none() {
            return Ok(());
        }
        if tokio::time::Instant::now() >= deadline {
            return Err(AppError::Search(format!(
                "timed out waiting for embedding download cleanup after {:?}",
                timeout
            )));
        }
        if !channel_open {
            tokio::time::sleep(poll_interval).await;
            continue;
        }
        tokio::select! {
            changed = completion_rx.changed() => {
                if changed.is_err() {
                    channel_open = false;
                } else if *completion_rx.borrow_and_update() == DownloadCleanupState::Finished {
                    return Ok(());
                }
            }
            _ = tokio::time::sleep(poll_interval) => {}
        }
    }
}

async fn cancel_embedding_download_and_wait(state: &EmbeddingState) -> Result<(), AppError> {
    let Some((cancel_tx, completion_rx)) = wait_for_download_control_or_idle(state).await? else {
        return Ok(());
    };
    let _ = cancel_tx.send(true);
    wait_for_download_cleanup_or_idle(state, completion_rx).await
}

fn is_embedding_download_cancelled(error: &AppError) -> bool {
    // M-003: normalize cancellation handling to planned Search variant usage.
    matches!(error, AppError::Search(message) if message == EMBEDDING_DOWNLOAD_CANCELLED_MESSAGE)
}

fn copy_directory_recursive(
    source: &std::path::Path,
    destination: &std::path::Path,
) -> Result<(), AppError> {
    std::fs::create_dir_all(destination)?;
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        if std::fs::symlink_metadata(&source_path)?
            .file_type()
            .is_symlink()
        {
            return Err(AppError::Validation(format!(
                "Symbolic links are not allowed in embedding bundle copy: {}",
                source_path.display()
            )));
        }
        let destination_path = destination.join(entry.file_name());
        if source_path.is_dir() {
            copy_directory_recursive(&source_path, &destination_path)?;
        } else {
            std::fs::copy(&source_path, &destination_path)?;
        }
    }
    Ok(())
}

async fn download_embedding_bundle_with_resume(
    app: EmbeddingsCommandAppHandle,
    state: Arc<EmbeddingState>,
    models_root: std::path::PathBuf,
) -> Result<(), AppError> {
    ensure_no_active_embedding_download(state.as_ref())?;
    set_embeddings_status(state.as_ref(), EmbeddingsStatus::Downloading, None)?;

    let total_bytes: u64 = EMBEDDING_EXPECTED_FILES
        .iter()
        .map(|file| file.size_bytes)
        .sum();
    let mut cancel_rx = begin_embedding_download(state.as_ref(), total_bytes)?;

    let result = async {
        let client = reqwest::Client::new();
        let mut aggregate_downloaded = 0_u64;

        for expected in EMBEDDING_EXPECTED_FILES.iter() {
            let destination = models_root
                .join(EMBEDDING_DESTINATION)
                .join(expected_relative_path(expected.relative_path));
            if let Some(parent) = destination.parent() {
                tokio::fs::create_dir_all(parent).await?;
            }

            let staging = destination.with_extension("partial");
            let resume_from = initial_resumed_bytes(
                match tokio::fs::metadata(&staging).await {
                    Ok(metadata) => metadata.len(),
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => 0,
                    Err(error) => return Err(AppError::from(error)),
                },
                expected.size_bytes,
            );

            aggregate_downloaded = aggregate_downloaded.saturating_add(resume_from);
            let current = aggregate_downloaded.min(total_bytes);
            update_download_progress(state.as_ref(), current, total_bytes)?;
            emit_download_progress(&app, current, total_bytes).await?;

            let mut request = client.get(embedding_file_url(expected.relative_path)?);
            if resume_from > 0 {
                request = request.header(reqwest::header::RANGE, format!("bytes={resume_from}-"));
            }

            let response = request.send().await.map_err(|error| {
                AppError::Search(format!("embedding download request failed: {error}"))
            })?;
            if !response.status().is_success() {
                return Err(AppError::Search(format!(
                    "embedding download failed with status {}",
                    response.status()
                )));
            }

            let effective_resumed = resumed_bytes_after_response(resume_from, response.status());
            let mut file = if resume_from == 0 || response.status() == reqwest::StatusCode::OK {
                tokio::fs::File::create(&staging).await?
            } else {
                tokio::fs::OpenOptions::new()
                    .append(true)
                    .open(&staging)
                    .await?
            };

            if effective_resumed < resume_from {
                aggregate_downloaded =
                    aggregate_downloaded.saturating_sub(resume_from - effective_resumed);
                let current = aggregate_downloaded.min(total_bytes);
                update_download_progress(state.as_ref(), current, total_bytes)?;
                emit_download_progress(&app, current, total_bytes).await?;
            }

            let mut stream = response.bytes_stream();
            while let Some(next) = stream.next().await {
                if *cancel_rx.borrow_and_update() {
                    return Err(AppError::Search(
                        EMBEDDING_DOWNLOAD_CANCELLED_MESSAGE.to_string(),
                    ));
                }

                let chunk = next.map_err(|error| {
                    AppError::Search(format!("embedding stream failed: {error}"))
                })?;
                file.write_all(&chunk).await?;
                aggregate_downloaded = aggregate_downloaded.saturating_add(chunk.len() as u64);
                let current = aggregate_downloaded.min(total_bytes);
                update_download_progress(state.as_ref(), current, total_bytes)?;
                emit_download_progress(&app, current, total_bytes).await?;
            }

            tokio::fs::rename(&staging, &destination).await?;
        }

        tokio::task::spawn_blocking({
            let bundle_root = models_root.join(EMBEDDING_DESTINATION);
            move || validate_embedding_bundle_layout(&bundle_root)
        })
        .await
        .map_err(|error| {
            AppError::Search(format!(
                "embedding post-download validation task failed: {error}"
            ))
        })??;

        Ok::<(), AppError>(())
    }
    .await;

    finish_download_session(state.as_ref())?;

    match result {
        Ok(()) => set_embeddings_status(state.as_ref(), EmbeddingsStatus::Initializing, None),
        Err(error) if is_embedding_download_cancelled(&error) => {
            set_embeddings_status(state.as_ref(), EmbeddingsStatus::NotProvisioned, None)
        }
        Err(error) => {
            let message = error.to_string();
            set_embeddings_status(state.as_ref(), EmbeddingsStatus::Error, Some(message))?;
            Err(error)
        }
    }
}

async fn install_imported_embedding_bundle(
    state: Arc<EmbeddingState>,
    source: std::path::PathBuf,
) -> Result<(), AppError> {
    ensure_no_active_embedding_download(state.as_ref())?;

    tokio::task::spawn_blocking(move || {
        validate_embedding_bundle_layout(&source)?;
        let models_root = app_models_dir()?;
        let destination = models_root.join(EMBEDDING_DESTINATION);
        if destination.exists() {
            std::fs::remove_dir_all(&destination)?;
        }
        copy_directory_recursive(&source, &destination)
    })
    .await
    .map_err(|error| {
        AppError::Search(format!("embedding import install task failed: {error}"))
    })??;

    set_embeddings_status(state.as_ref(), EmbeddingsStatus::Initializing, None)
}

#[tauri::command]
pub async fn embeddings_status(
    state: tauri::State<'_, Arc<EmbeddingState>>,
) -> Result<EmbeddingsStatusResponse, AppError> {
    build_embeddings_status_response(state.inner().as_ref())
}

#[tauri::command]
pub async fn embeddings_download_model(
    app: EmbeddingsCommandAppHandle,
    embeddings_state: tauri::State<'_, Arc<EmbeddingState>>,
    provisioning: tauri::State<'_, Arc<ProvisioningState>>,
) -> Result<(), AppError> {
    let _lease = provisioning.start_download(ProvisioningTarget::Embeddings)?;

    let models_root = app_models_dir()?;
    tokio::task::spawn_blocking({
        let models_root = models_root.clone();
        move || {
            let probe = LiveResourceProbe::new(models_root.clone());
            ensure_resources_available(
                &probe,
                ProvisioningTarget::Embeddings.approved_asset(),
                &models_root,
            )
        }
    })
    .await
    .map_err(|e| AppError::Search(format!("embedding resource check task failed: {e}")))??;

    download_embedding_bundle_with_resume(app, embeddings_state.inner().clone(), models_root).await
}

#[tauri::command]
pub async fn embeddings_import_model_file(
    file_path: String,
    state: tauri::State<'_, Arc<EmbeddingState>>,
    provisioning: tauri::State<'_, Arc<ProvisioningState>>,
) -> Result<(), AppError> {
    let _lease = provisioning.start_download(ProvisioningTarget::Embeddings)?;
    let source = std::path::PathBuf::from(file_path);
    install_imported_embedding_bundle(state.inner().clone(), source).await
}

#[tauri::command]
pub async fn embeddings_cancel_download(
    state: tauri::State<'_, Arc<EmbeddingState>>,
) -> Result<(), AppError> {
    cancel_embedding_download_and_wait(state.inner().as_ref()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        EmbeddingsDownloadProgressEvent, EmbeddingsStatusResponse, ReindexProgressEvent,
        ReindexResult, SemanticSearchResult, SpellSummary,
    };
    use serde_json::Value;
    use std::sync::Arc;

    #[test]
    fn embeddings_status_serializes_to_spec_values() {
        assert_eq!(
            serde_json::to_string(&EmbeddingsStatus::NotProvisioned).unwrap(),
            "\"notProvisioned\""
        );
        assert_eq!(
            serde_json::to_string(&EmbeddingsStatus::Downloading).unwrap(),
            "\"downloading\""
        );
        assert_eq!(
            serde_json::to_string(&EmbeddingsStatus::Initializing).unwrap(),
            "\"initializing\""
        );
        assert_eq!(
            serde_json::to_string(&EmbeddingsStatus::Ready).unwrap(),
            "\"ready\""
        );
        assert_eq!(
            serde_json::to_string(&EmbeddingsStatus::Error).unwrap(),
            "\"error\""
        );
    }

    #[test]
    fn embedding_state_defaults_to_not_provisioned() {
        let state = EmbeddingState::default();
        assert!(state.model.lock().unwrap().is_none());
        assert!(state.download_state.lock().unwrap().is_none());
        assert!(state.last_error.lock().unwrap().is_none());
        assert_eq!(
            *state.status.lock().unwrap(),
            EmbeddingsStatus::NotProvisioned
        );
    }

    #[test]
    fn embeddings_status_response_serializes_with_camel_case_keys() {
        let response = EmbeddingsStatusResponse {
            state: EmbeddingsStatus::Downloading,
            download_progress: Some(0.5),
            error_message: Some("network error".to_string()),
        };

        let value = serde_json::to_value(response).unwrap();
        let object = value.as_object().unwrap();

        assert_eq!(
            object.get("state").and_then(Value::as_str),
            Some("downloading")
        );
        assert!(object.get("downloadProgress").is_some());
        assert!(object.get("errorMessage").is_some());
        assert!(object.get("download_progress").is_none());
        assert!(object.get("error_message").is_none());
    }

    #[test]
    fn download_progress_event_serializes_with_expected_keys() {
        let event = EmbeddingsDownloadProgressEvent {
            bytes_downloaded: 1024,
            total_bytes: 2048,
        };

        let value = serde_json::to_value(event).unwrap();
        let object = value.as_object().unwrap();

        assert_eq!(
            object.get("bytesDownloaded").and_then(Value::as_u64),
            Some(1024)
        );
        assert_eq!(object.get("totalBytes").and_then(Value::as_u64), Some(2048));
        assert!(object.get("bytes_downloaded").is_none());
        assert!(object.get("total_bytes").is_none());
    }

    #[test]
    fn reindex_progress_event_serializes_with_expected_keys() {
        let event = ReindexProgressEvent {
            current: 3,
            total: 10,
        };

        let value = serde_json::to_value(event).unwrap();
        let object = value.as_object().unwrap();

        assert_eq!(object.get("current").and_then(Value::as_u64), Some(3));
        assert_eq!(object.get("total").and_then(Value::as_u64), Some(10));
    }

    #[test]
    fn semantic_result_serializes_cosine_distance_in_camel_case() {
        let result = SemanticSearchResult {
            spell: SpellSummary {
                id: 1,
                name: "Shield".to_string(),
                school: Some("Abjuration".to_string()),
                sphere: None,
                level: 1,
                class_list: Some("Wizard".to_string()),
                components: Some("V,S".to_string()),
                duration: Some("5 rounds".to_string()),
                source: Some("PHB".to_string()),
                is_quest_spell: 0,
                is_cantrip: 0,
                tags: None,
            },
            cosine_distance: 0.123,
        };

        let value = serde_json::to_value(result).unwrap();
        assert!(value.get("cosineDistance").is_some());
    }

    #[test]
    fn reindex_result_non_force_skipped_tracks_preexisting_vectors() {
        let total = 10;
        let candidate_count = 4;
        let initial_skipped = total - candidate_count;

        let summary = ReindexResult {
            total,
            indexed: 3,
            skipped: initial_skipped,
            failed: 1,
        };

        assert_eq!(summary.skipped, 6);
        assert_eq!(summary.indexed + summary.failed, candidate_count);
        assert_eq!(
            summary.total,
            summary.skipped + summary.indexed + summary.failed
        );
    }

    #[test]
    fn reindex_result_force_mode_has_zero_initial_skipped() {
        let summary = ReindexResult {
            total: 10,
            indexed: 9,
            skipped: 0,
            failed: 1,
        };

        assert_eq!(summary.skipped, 0);
        assert_eq!(
            summary.total,
            summary.indexed + summary.skipped + summary.failed
        );
    }

    #[test]
    fn semantic_search_result_serializes_flattened_spell_and_cosine_distance() {
        let result = SemanticSearchResult {
            spell: SpellSummary {
                id: 7,
                name: "Magic Missile".to_string(),
                school: Some("Evocation".to_string()),
                sphere: None,
                level: 1,
                class_list: Some("Wizard".to_string()),
                components: Some("V,S".to_string()),
                duration: Some("Instantaneous".to_string()),
                source: Some("PHB".to_string()),
                is_quest_spell: 0,
                is_cantrip: 0,
                tags: Some("force".to_string()),
            },
            cosine_distance: 0.123,
        };

        let value = serde_json::to_value(result).unwrap();
        let object = value.as_object().unwrap();

        assert_eq!(object.get("id").and_then(Value::as_i64), Some(7));
        assert_eq!(
            object.get("name").and_then(Value::as_str),
            Some("Magic Missile")
        );
        assert!(object.get("spell").is_none());
        assert!(object.get("cosineDistance").is_some());
        assert!(object.get("cosine_distance").is_none());
    }

    #[test]
    fn reindex_result_serializes_with_expected_summary_keys() {
        let result = ReindexResult {
            total: 8,
            indexed: 6,
            skipped: 1,
            failed: 1,
        };

        let value = serde_json::to_value(result).unwrap();
        let object = value.as_object().unwrap();

        assert_eq!(object.len(), 4);
        assert_eq!(object.get("total").and_then(Value::as_u64), Some(8));
        assert_eq!(object.get("indexed").and_then(Value::as_u64), Some(6));
        assert_eq!(object.get("skipped").and_then(Value::as_u64), Some(1));
        assert_eq!(object.get("failed").and_then(Value::as_u64), Some(1));
    }

    #[tokio::test]
    async fn embeddings_status_reports_downloading_progress() {
        let state = Arc::new(EmbeddingState::default());
        let (cancel_tx, _cancel_rx) = tokio::sync::watch::channel(false);
        let (completion_tx, _completion_rx) =
            tokio::sync::watch::channel(DownloadCleanupState::Running);
        {
            *state.status.lock().unwrap() = EmbeddingsStatus::Downloading;
            *state.download_state.lock().unwrap() = Some(ActiveEmbeddingDownload {
                session_epoch: 1,
                bytes_downloaded: 128,
                total_bytes: 256,
                cancel_tx,
                completion_tx,
            });
        }

        let response = build_embeddings_status_response(state.as_ref()).unwrap();
        assert_eq!(response.state, EmbeddingsStatus::Downloading);
        assert_eq!(response.download_progress, Some(0.5));
    }

    #[test]
    fn embedding_bundle_validation_rejects_missing_required_file() {
        let tmp = tempfile::tempdir().unwrap();
        let err = validate_embedding_bundle_layout(tmp.path()).unwrap_err();
        assert!(err
            .to_string()
            .contains("Missing required embedding bundle file"));
    }

    #[test]
    fn embedding_text_composition_is_stable() {
        let text = compose_spell_embedding_text(" Shield ", " Blocks attacks. ");
        assert_eq!(text, "Shield\n\nBlocks attacks.");
    }

    #[test]
    fn vector_dimension_guard_rejects_non_384_vectors() {
        let err = require_embedding_dimension(&vec![0.0_f32; 128]).unwrap_err();
        assert!(err.to_string().contains("384"));
    }

    #[test]
    fn m_004_embedding_bundle_validation_rejects_size_mismatch() {
        let tmp = tempfile::tempdir().unwrap();
        let expected = &EMBEDDING_EXPECTED_FILES[0];
        let relative = expected_relative_path(expected.relative_path);
        let file_path = tmp.path().join(relative);
        std::fs::create_dir_all(file_path.parent().unwrap()).unwrap();
        std::fs::write(&file_path, b"tiny").unwrap();

        let err = validate_embedding_bundle_layout(tmp.path()).unwrap_err();
        assert!(err.to_string().contains("Embedding file size mismatch for"));
    }

    #[test]
    fn m_004_embedding_bundle_validation_rejects_hash_mismatch() {
        let tmp = tempfile::tempdir().unwrap();
        let expected = &EMBEDDING_EXPECTED_FILES[0];
        let relative = expected_relative_path(expected.relative_path);
        let file_path = tmp.path().join(relative);
        std::fs::create_dir_all(file_path.parent().unwrap()).unwrap();
        let file = std::fs::File::create(&file_path).unwrap();
        // M-004: match expected size so validation must exercise hash mismatch branch.
        file.set_len(expected.size_bytes).unwrap();

        let err = validate_embedding_bundle_layout(tmp.path()).unwrap_err();
        assert!(err.to_string().contains("Embedding file hash mismatch for"));
    }

    #[test]
    fn m_002_embedding_bundle_validation_rejects_extra_file() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("unexpected.bin"), b"not allowed").unwrap();

        let err = validate_embedding_bundle_layout(tmp.path()).unwrap_err();
        assert!(err.to_string().contains("Unexpected embedding bundle file"));
    }

    #[tokio::test]
    async fn cancel_wait_returns_none_when_no_active_download() {
        let state = EmbeddingState::default();
        assert!(wait_for_download_control_or_idle(&state)
            .await
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn cancel_wait_returns_controls_when_download_matches_epoch() {
        let state = EmbeddingState::default();
        let (cancel_tx, _cancel_rx) = tokio::sync::watch::channel(false);
        let (completion_tx, _completion_rx) =
            tokio::sync::watch::channel(DownloadCleanupState::Running);
        {
            *state.download_state.lock().unwrap() = Some(ActiveEmbeddingDownload {
                session_epoch: 1,
                bytes_downloaded: 0,
                total_bytes: 1,
                cancel_tx,
                completion_tx,
            });
        }

        assert!(wait_for_download_control_or_idle(&state)
            .await
            .unwrap()
            .is_some());
    }

    #[tokio::test]
    async fn m_001_cancel_wait_returns_none_when_target_session_disappears() {
        let (cancel_tx, _cancel_rx) = tokio::sync::watch::channel(false);
        let (completion_tx, _completion_rx) =
            tokio::sync::watch::channel(DownloadCleanupState::Running);
        let mut polls = vec![
            Some((1_u64, cancel_tx.clone(), completion_tx.subscribe())),
            None,
            None,
            None,
        ]
        .into_iter();

        let controls = wait_for_download_control_or_idle_with_timeout(
            move || Ok(polls.next().flatten()),
            std::time::Duration::from_millis(5),
            std::time::Duration::from_millis(1),
        )
        .await
        .expect("M-001 wait-loop should return without AppError");
        assert!(controls.is_none());
    }

    #[tokio::test]
    async fn m_001_cancel_wait_observes_stabilizing_target_session() {
        let (cancel_tx, _cancel_rx) = tokio::sync::watch::channel(false);
        let (completion_tx, _completion_rx) =
            tokio::sync::watch::channel(DownloadCleanupState::Running);
        let mut polls = vec![
            Some((1_u64, cancel_tx.clone(), completion_tx.subscribe())),
            None,
            Some((1_u64, cancel_tx.clone(), completion_tx.subscribe())),
        ]
        .into_iter();

        let controls = wait_for_download_control_or_idle_with_timeout(
            move || Ok(polls.next().flatten()),
            std::time::Duration::from_millis(20),
            std::time::Duration::from_millis(1),
        )
        .await
        .expect("M-001 wait-loop should return without AppError");
        assert!(controls.is_some());
    }

    #[tokio::test]
    async fn m_001_cancel_wait_returns_none_when_epoch_changes_during_stabilization() {
        let (cancel_tx, _cancel_rx) = tokio::sync::watch::channel(false);
        let (completion_tx, _completion_rx) =
            tokio::sync::watch::channel(DownloadCleanupState::Running);
        let mut polls = vec![
            Some((1_u64, cancel_tx.clone(), completion_tx.subscribe())),
            None,
            Some((2_u64, cancel_tx.clone(), completion_tx.subscribe())),
        ]
        .into_iter();

        let controls = wait_for_download_control_or_idle_with_timeout(
            move || Ok(polls.next().flatten()),
            std::time::Duration::from_millis(20),
            std::time::Duration::from_millis(1),
        )
        .await
        .expect("M-001 wait-loop should return without AppError");
        assert!(controls.is_none());
    }

    #[tokio::test]
    async fn m_006_cancel_wait_times_out_when_cleanup_never_finishes() {
        let state = EmbeddingState::default();
        let (cancel_tx, _cancel_rx) = tokio::sync::watch::channel(false);
        let (completion_tx, completion_rx) =
            tokio::sync::watch::channel(DownloadCleanupState::Running);
        {
            *state.download_state.lock().unwrap() = Some(ActiveEmbeddingDownload {
                session_epoch: 1,
                bytes_downloaded: 0,
                total_bytes: 1,
                cancel_tx,
                completion_tx,
            });
        }

        let result = wait_for_download_cleanup_or_idle_with_timeout(
            &state,
            completion_rx,
            std::time::Duration::from_millis(30),
            std::time::Duration::from_millis(1),
        )
        .await;

        match result {
            Err(AppError::Search(message)) => {
                assert!(message.contains("timed out waiting for embedding download cleanup"));
            }
            other => {
                panic!("M-006 expected Search timeout error when cleanup stalls, got: {other:?}")
            }
        }
    }

    #[tokio::test]
    async fn m_006_cancel_wait_preserves_successful_cleanup_behavior() {
        let state = EmbeddingState::default();
        let (cancel_tx, _cancel_rx) = tokio::sync::watch::channel(false);
        let (completion_tx, completion_rx) =
            tokio::sync::watch::channel(DownloadCleanupState::Running);
        {
            *state.download_state.lock().unwrap() = Some(ActiveEmbeddingDownload {
                session_epoch: 1,
                bytes_downloaded: 0,
                total_bytes: 1,
                cancel_tx,
                completion_tx: completion_tx.clone(),
            });
        }

        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(5)).await;
            completion_tx.send_replace(DownloadCleanupState::Finished);
        });

        wait_for_download_cleanup_or_idle_with_timeout(
            &state,
            completion_rx,
            std::time::Duration::from_millis(250),
            std::time::Duration::from_millis(1),
        )
        .await
        .expect("M-006 should still return Ok when cleanup completion is signaled");
    }

    #[test]
    fn initial_resumed_bytes_is_capped_to_expected_size() {
        assert_eq!(initial_resumed_bytes(120, 500), 120);
        assert_eq!(initial_resumed_bytes(700, 500), 500);
    }

    #[test]
    fn resumed_bytes_after_response_keeps_partial_content_for_206() {
        assert_eq!(
            resumed_bytes_after_response(120, reqwest::StatusCode::PARTIAL_CONTENT),
            120
        );
    }

    #[test]
    fn resumed_bytes_after_response_resets_for_200_restart() {
        assert_eq!(
            resumed_bytes_after_response(120, reqwest::StatusCode::OK),
            0
        );
    }

    #[test]
    fn m_003_cancellation_detection_uses_search_variant_message() {
        assert!(is_embedding_download_cancelled(&AppError::Search(
            EMBEDDING_DOWNLOAD_CANCELLED_MESSAGE.to_string()
        )));
        assert!(!is_embedding_download_cancelled(&AppError::Search(
            "some other search error".to_string()
        )));
        assert!(!is_embedding_download_cancelled(&AppError::Validation(
            EMBEDDING_DOWNLOAD_CANCELLED_MESSAGE.to_string()
        )));
    }

    #[tokio::test]
    async fn await_ready_model_errors_when_ready_without_model() {
        // M-001: matches Task 3 Step 3.3 fail-fast behavior (plan lines 964–971).
        let state = Arc::new(EmbeddingState::default());
        *state.status.lock().unwrap() = EmbeddingsStatus::Ready;

        let result = await_ready_model_with_timeout(
            Arc::clone(&state),
            std::time::Duration::from_millis(50),
        )
        .await;
        match result {
            Err(AppError::Search(message)) => {
                assert_eq!(message, "embedding status is ready but model is not loaded");
            }
            Ok(_) => panic!("expected error while model is absent, got model"),
            Err(other) => panic!("expected Search error while model absent, got: {other}"),
        }
    }

    /// M-004: Task 4 Step 4.4 expects `cargo test` PASS; on matrices where ORT
    /// blocks linking this crate's tests, `cargo check` remains the portable
    /// compile gate until the link matrix includes ONNX Runtime.
    ///
    /// M-005: Asserts `spell_vec` invalidation after the async cleanup spawned from
    /// `enqueue_spell_embedding_if_ready` when embeddings are not Ready.
    #[tokio::test]
    async fn post_write_hook_skips_when_not_ready() {
        let state = Arc::new(EmbeddingState::default());
        *state.status.lock().unwrap() = EmbeddingsStatus::NotProvisioned;

        let pool = Arc::new(test_pool());
        let vector_json =
            serde_json::to_string(&vec![0.0_f32; 384]).expect("serialize test vector");
        let spell_id: i64 = {
            let conn = pool.get().expect("test db connection");
            conn.query_row("SELECT IFNULL(MAX(id), 0) + 1 FROM spell", [], |row| {
                row.get(0)
            })
            .expect("next spell id")
        };
        {
            let conn = pool.get().expect("test db connection");
            let content_hash = format!("hash-embed-hook-test-{spell_id}");
            conn.execute(
                "INSERT INTO spell (id, name, level, description, content_hash) VALUES (?1, 'Shield', 1, 'Protects against attacks', ?2)",
                rusqlite::params![spell_id, content_hash],
            )
            .expect("insert spell for hook test");
            // M-005: `vec_f32` exists only when sqlite-vec is loaded; tests may use blob-backed
            // `spell_vec` from migration fallback (see `db/migrations` + `load_migrations`).
            match conn.execute(
                "INSERT INTO spell_vec(rowid, v) VALUES(?1, vec_f32(?2))",
                rusqlite::params![spell_id, vector_json],
            ) {
                Ok(_) => {}
                Err(_) => {
                    let bytes: Vec<u8> = vec![0.0_f32; 384]
                        .into_iter()
                        .flat_map(f32::to_le_bytes)
                        .collect();
                    conn.execute(
                        "INSERT INTO spell_vec(rowid, v) VALUES(?1, ?2)",
                        rusqlite::params![spell_id, bytes],
                    )
                    .expect("insert stale spell_vec row (blob fallback)");
                }
            }
            let count: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM spell_vec WHERE rowid = ?1",
                    rusqlite::params![spell_id],
                    |row| row.get(0),
                )
                .expect("count before");
            assert_eq!(count, 1, "precondition: stale vector row exists");
        }

        let result = enqueue_spell_embedding_if_ready(
            state,
            Arc::clone(&pool),
            spell_id,
            "Shield".to_string(),
            "Protects against attacks".to_string(),
        )
        .await;

        assert!(result.is_ok());

        for _ in 0..50 {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            let count: i64 = {
                let conn = pool.get().expect("test db connection");
                conn.query_row(
                    "SELECT COUNT(*) FROM spell_vec WHERE rowid = ?1",
                    rusqlite::params![spell_id],
                    |row| row.get(0),
                )
                .expect("count after")
            };
            if count == 0 {
                return;
            }
        }

        panic!("M-005: expected spell_vec row to be deleted after skip-path cleanup");
    }

    #[tokio::test]
    async fn import_hook_leaves_rows_for_reindex_when_embeddings_not_ready() {
        let state = Arc::new(EmbeddingState::default());
        *state.status.lock().unwrap() = EmbeddingsStatus::Initializing;

        let pool = Arc::new(test_pool());
        {
            let conn = pool.get().expect("test db connection");
            conn.execute(
                "INSERT INTO spell (id, name, level, description, content_hash) VALUES (101, 'Shield', 1, 'Protects against attacks', 'hash-shield')",
                [],
            )
            .expect("insert first spell");
            conn.execute(
                "INSERT INTO spell (id, name, level, description, content_hash) VALUES (102, 'Light', 1, 'Creates light', 'hash-light')",
                [],
            )
            .expect("insert second spell");
        }

        let result = enqueue_import_embeddings_if_ready(
            state,
            pool,
            vec![
                (
                    101,
                    "Shield".to_string(),
                    "Protects against attacks".to_string(),
                ),
                (102, "Light".to_string(), "Creates light".to_string()),
            ],
        )
        .await;

        assert!(result.is_ok());
    }
}

// M-005: Command-boundary state-transition tests.
//
// Background: prior tests in the `tests` module above cover helper behavior
// (`build_embeddings_status_response`, `wait_for_download_control_or_idle`,
// `validate_embedding_bundle_layout`, ...) and one validation failure path,
// but they do not exercise state transitions through the actual Tauri IPC
// commands `embeddings_download_model`, `embeddings_import_model_file`,
// `embeddings_cancel_download`. This module fills that gap by dispatching
// real `#[tauri::command]` calls through `tauri::test`'s mock runtime + smoke
// webview harness (the same shape used for the LLM smoke tests in
// `crate::lib`), and asserts that observable `EmbeddingState` /
// `ProvisioningState` transitions match the contract on each command path.
#[cfg(test)]
mod m005_command_boundary_tests {
    use super::*;
    use crate::commands::provisioning::{ProvisioningState, ProvisioningTarget};
    use crate::commands::vault::lock_vault_env_for_test;
    use crate::invoke_smoke_command;
    use crate::models::{EmbeddingsStatus, EmbeddingsStatusResponse};
    use std::ffi::OsString;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::{Arc, MutexGuard};
    use tokio::time::{timeout, Duration};

    const SPELLBOOK_DATA_DIR_ENV: &str = "SPELLBOOK_DATA_DIR";
    static M005_DATA_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

    // M-005: serialize env mutations across tests that exercise commands which
    // resolve `SPELLBOOK_DATA_DIR` (download/import paths).
    struct M005DataDirGuard {
        _env_lock: MutexGuard<'static, ()>,
        previous_data_dir: Option<OsString>,
        temp_data_dir: std::path::PathBuf,
    }

    impl M005DataDirGuard {
        fn acquire(test_name: &str) -> Self {
            let env_lock = lock_vault_env_for_test();
            let unique_id = M005_DATA_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
            let sanitized: String = test_name
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
                .collect();
            let temp_data_dir = std::env::temp_dir().join(format!(
                "spellbook-embeddings-m005-{}-{}-{}",
                sanitized,
                std::process::id(),
                unique_id
            ));
            std::fs::create_dir_all(&temp_data_dir).unwrap();
            let previous_data_dir = std::env::var_os(SPELLBOOK_DATA_DIR_ENV);
            std::env::set_var(SPELLBOOK_DATA_DIR_ENV, &temp_data_dir);
            Self {
                _env_lock: env_lock,
                previous_data_dir,
                temp_data_dir,
            }
        }
    }

    impl Drop for M005DataDirGuard {
        fn drop(&mut self) {
            match &self.previous_data_dir {
                Some(prev) => std::env::set_var(SPELLBOOK_DATA_DIR_ENV, prev),
                None => std::env::remove_var(SPELLBOOK_DATA_DIR_ENV),
            }
            let _ = std::fs::remove_dir_all(&self.temp_data_dir);
        }
    }

    struct EmbeddingsSmokeApp {
        _app: tauri::App<tauri::test::MockRuntime>,
        webview: tauri::WebviewWindow<tauri::test::MockRuntime>,
    }

    fn build_embeddings_smoke_app(
        embedding_state: Arc<EmbeddingState>,
        provisioning: Arc<ProvisioningState>,
    ) -> EmbeddingsSmokeApp {
        let app = tauri::test::mock_builder()
            .manage(embedding_state)
            .manage(provisioning)
            .invoke_handler(tauri::generate_handler![
                embeddings_status,
                embeddings_download_model,
                embeddings_import_model_file,
                embeddings_cancel_download,
            ])
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("M-005: failed to build embeddings smoke app");
        let webview = tauri::WebviewWindowBuilder::new(&app, "m005-main", Default::default())
            .build()
            .expect("M-005: failed to build embeddings smoke webview");
        EmbeddingsSmokeApp { _app: app, webview }
    }

    fn install_active_download(state: &EmbeddingState) -> watch::Receiver<bool> {
        let (cancel_tx, cancel_rx) = watch::channel(false);
        let (completion_tx, _completion_rx) = watch::channel(DownloadCleanupState::Running);
        *state.status.lock().unwrap() = EmbeddingsStatus::Downloading;
        *state.download_state.lock().unwrap() = Some(ActiveEmbeddingDownload {
            session_epoch: 1,
            bytes_downloaded: 0,
            total_bytes: 1024,
            cancel_tx,
            completion_tx,
        });
        cancel_rx
    }

    fn invoke_error_string(value: &serde_json::Value) -> String {
        value
            .as_str()
            .map(|s| s.to_string())
            .unwrap_or_else(|| value.to_string())
    }

    // M-005: `embeddings_status` IPC dispatch reflects the default state
    // transition (none yet) returned by `build_embeddings_status_response`.
    #[tokio::test]
    async fn m_005_embeddings_status_command_returns_default_state_through_ipc_boundary() {
        let embedding_state = Arc::new(EmbeddingState::default());
        let provisioning = Arc::new(ProvisioningState::default());
        let smoke =
            build_embeddings_smoke_app(Arc::clone(&embedding_state), Arc::clone(&provisioning));

        let response = invoke_smoke_command::<EmbeddingsStatusResponse>(
            smoke.webview.clone(),
            "embeddings_status",
            serde_json::json!({}),
        )
        .await
        .expect("M-005: embeddings_status must succeed for default state");

        assert_eq!(response.state, EmbeddingsStatus::NotProvisioned);
        assert!(response.download_progress.is_none());
        assert!(response.error_message.is_none());
    }

    // M-005: `embeddings_status` IPC dispatch surfaces the Downloading state
    // and progress fraction set by an active `ActiveEmbeddingDownload`,
    // proving the command boundary observes shared state mutations.
    #[tokio::test]
    async fn m_005_embeddings_status_command_reports_active_download_progress_through_ipc_boundary()
    {
        let embedding_state = Arc::new(EmbeddingState::default());
        let provisioning = Arc::new(ProvisioningState::default());
        let (cancel_tx, _cancel_rx) = watch::channel(false);
        let (completion_tx, _completion_rx) = watch::channel(DownloadCleanupState::Running);
        {
            *embedding_state.status.lock().unwrap() = EmbeddingsStatus::Downloading;
            *embedding_state.download_state.lock().unwrap() = Some(ActiveEmbeddingDownload {
                session_epoch: 1,
                bytes_downloaded: 256,
                total_bytes: 1024,
                cancel_tx,
                completion_tx,
            });
        }

        let smoke =
            build_embeddings_smoke_app(Arc::clone(&embedding_state), Arc::clone(&provisioning));

        let response = invoke_smoke_command::<EmbeddingsStatusResponse>(
            smoke.webview.clone(),
            "embeddings_status",
            serde_json::json!({}),
        )
        .await
        .expect("M-005: embeddings_status must succeed when download is active");

        assert_eq!(response.state, EmbeddingsStatus::Downloading);
        assert_eq!(response.download_progress, Some(0.25));
    }

    // M-005: `embeddings_cancel_download` is a no-op through the IPC boundary
    // when there is no active download (idle -> idle transition).
    #[tokio::test]
    async fn m_005_embeddings_cancel_download_command_is_noop_when_no_active_download() {
        let embedding_state = Arc::new(EmbeddingState::default());
        let provisioning = Arc::new(ProvisioningState::default());
        let smoke =
            build_embeddings_smoke_app(Arc::clone(&embedding_state), Arc::clone(&provisioning));

        invoke_smoke_command::<()>(
            smoke.webview.clone(),
            "embeddings_cancel_download",
            serde_json::json!({}),
        )
        .await
        .expect("M-005: cancel command must succeed as no-op when idle");

        assert!(embedding_state.download_state.lock().unwrap().is_none());
        assert_eq!(
            *embedding_state.status.lock().unwrap(),
            EmbeddingsStatus::NotProvisioned
        );
    }

    // M-005: `embeddings_cancel_download` drives the active download
    // Running -> Finished -> cleared transition through the IPC boundary.
    // An observer task simulates the download loop noticing the cancel
    // signal and calling `finish_download_session` (the same effect the
    // real download path produces), so the command awaits cleanup and
    // returns only after `download_state` is cleared.
    #[tokio::test]
    async fn m_005_embeddings_cancel_download_command_signals_and_clears_active_download_state() {
        let embedding_state = Arc::new(EmbeddingState::default());
        let provisioning = Arc::new(ProvisioningState::default());
        let mut cancel_rx = install_active_download(embedding_state.as_ref());

        let observer_state = Arc::clone(&embedding_state);
        let observer = tokio::spawn(async move {
            cancel_rx
                .changed()
                .await
                .expect("M-005: cancel watcher must observe cancel signal");
            assert!(*cancel_rx.borrow_and_update());
            finish_download_session(observer_state.as_ref())
                .expect("M-005: finish_download_session must succeed");
        });

        let smoke =
            build_embeddings_smoke_app(Arc::clone(&embedding_state), Arc::clone(&provisioning));

        timeout(
            Duration::from_secs(2),
            invoke_smoke_command::<()>(
                smoke.webview.clone(),
                "embeddings_cancel_download",
                serde_json::json!({}),
            ),
        )
        .await
        .expect("M-005: cancel command must complete after cleanup")
        .expect("M-005: cancel command must succeed");

        observer
            .await
            .expect("M-005: observer task must run to completion");

        assert!(embedding_state.download_state.lock().unwrap().is_none());

        let response = invoke_smoke_command::<EmbeddingsStatusResponse>(
            smoke.webview.clone(),
            "embeddings_status",
            serde_json::json!({}),
        )
        .await
        .expect("M-005: status after cancel must succeed");
        assert!(response.download_progress.is_none());
    }

    // M-005: `embeddings_download_model` rejects through the IPC boundary
    // when a cross-target provisioning lease (LLM) is already active; the
    // command must surface a Validation error and leave embedding state
    // unchanged (no Downloading transition).
    #[tokio::test]
    async fn m_005_embeddings_download_model_command_rejects_cross_target_provisioning_conflict() {
        let _data_dir_guard = M005DataDirGuard::acquire(
            "m_005_embeddings_download_model_command_rejects_cross_target_provisioning_conflict",
        );
        let embedding_state = Arc::new(EmbeddingState::default());
        let provisioning = Arc::new(ProvisioningState::default());
        let _llm_lease = provisioning
            .start_download(ProvisioningTarget::Llm)
            .expect("M-005: pre-acquired LLM provisioning lease must succeed");

        let smoke =
            build_embeddings_smoke_app(Arc::clone(&embedding_state), Arc::clone(&provisioning));

        let result = invoke_smoke_command::<()>(
            smoke.webview.clone(),
            "embeddings_download_model",
            serde_json::json!({}),
        )
        .await;

        let err = result.expect_err("M-005: download must fail while LLM provisioning is active");
        let err_str = invoke_error_string(&err);
        assert!(
            err_str.contains("Validation") && err_str.contains("LLM"),
            "M-005: expected cross-target provisioning Validation error, got: {err_str}"
        );

        assert_eq!(
            *embedding_state.status.lock().unwrap(),
            EmbeddingsStatus::NotProvisioned,
            "M-005: embedding status must not transition when download is rejected pre-flight"
        );
        assert!(
            embedding_state.download_state.lock().unwrap().is_none(),
            "M-005: no ActiveEmbeddingDownload must be installed when download is rejected"
        );
    }

    // M-005: `embeddings_download_model` rejects through the IPC boundary
    // when an embeddings provisioning lease is already active (re-entrant
    // download); the command must surface a Validation error.
    #[tokio::test]
    async fn m_005_embeddings_download_model_command_rejects_when_embeddings_lease_already_held() {
        let _data_dir_guard = M005DataDirGuard::acquire(
            "m_005_embeddings_download_model_command_rejects_when_embeddings_lease_already_held",
        );
        let embedding_state = Arc::new(EmbeddingState::default());
        let provisioning = Arc::new(ProvisioningState::default());
        let _embeddings_lease = provisioning
            .start_download(ProvisioningTarget::Embeddings)
            .expect("M-005: pre-acquired embeddings provisioning lease must succeed");

        let smoke =
            build_embeddings_smoke_app(Arc::clone(&embedding_state), Arc::clone(&provisioning));

        let result = invoke_smoke_command::<()>(
            smoke.webview.clone(),
            "embeddings_download_model",
            serde_json::json!({}),
        )
        .await;

        let err = result
            .expect_err("M-005: re-entrant download must fail while embeddings lease is active");
        let err_str = invoke_error_string(&err);
        assert!(
            err_str.contains("Validation") && err_str.contains("embeddings"),
            "M-005: expected re-entrant provisioning Validation error, got: {err_str}"
        );
    }

    // M-005: `embeddings_import_model_file` rejects through the IPC boundary
    // when an embedding download is already in flight; the command's own
    // provisioning lease succeeds, then `ensure_no_active_embedding_download`
    // fails inside `install_imported_embedding_bundle`, leaving the
    // pre-existing download state untouched.
    #[tokio::test]
    async fn m_005_embeddings_import_model_file_command_rejects_when_active_download_present() {
        let _data_dir_guard = M005DataDirGuard::acquire(
            "m_005_embeddings_import_model_file_command_rejects_when_active_download_present",
        );
        let embedding_state = Arc::new(EmbeddingState::default());
        let provisioning = Arc::new(ProvisioningState::default());
        let _cancel_rx = install_active_download(embedding_state.as_ref());

        let smoke =
            build_embeddings_smoke_app(Arc::clone(&embedding_state), Arc::clone(&provisioning));

        let result = invoke_smoke_command::<()>(
            smoke.webview.clone(),
            "embeddings_import_model_file",
            serde_json::json!({"filePath": "M-005-irrelevant-when-download-active"}),
        )
        .await;

        let err = result.expect_err(
            "M-005: import must fail while download is active (ensure_no_active_embedding_download)",
        );
        let err_str = invoke_error_string(&err);
        assert!(
            err_str.contains("Validation") && err_str.contains("download is active"),
            "M-005: expected active-download conflict Validation error, got: {err_str}"
        );

        assert_eq!(
            *embedding_state.status.lock().unwrap(),
            EmbeddingsStatus::Downloading,
            "M-005: embedding status must remain Downloading when import is rejected"
        );
        assert!(
            embedding_state.download_state.lock().unwrap().is_some(),
            "M-005: pre-existing ActiveEmbeddingDownload must not be cleared by failed import"
        );
    }

    // M-005: `embeddings_import_model_file` propagates filesystem errors
    // through the IPC boundary when the source path does not exist, and
    // does not transition embedding status away from NotProvisioned.
    #[tokio::test]
    async fn m_005_embeddings_import_model_file_command_returns_error_for_missing_path() {
        let _data_dir_guard = M005DataDirGuard::acquire(
            "m_005_embeddings_import_model_file_command_returns_error_for_missing_path",
        );
        let embedding_state = Arc::new(EmbeddingState::default());
        let provisioning = Arc::new(ProvisioningState::default());
        let smoke =
            build_embeddings_smoke_app(Arc::clone(&embedding_state), Arc::clone(&provisioning));

        let missing = std::env::temp_dir().join(format!(
            "spellbook-m005-missing-{}-{}",
            std::process::id(),
            M005_DATA_DIR_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));

        let result = invoke_smoke_command::<()>(
            smoke.webview.clone(),
            "embeddings_import_model_file",
            serde_json::json!({"filePath": missing.to_string_lossy()}),
        )
        .await;

        assert!(
            result.is_err(),
            "M-005: import must fail when source bundle path does not exist"
        );
        assert_eq!(
            *embedding_state.status.lock().unwrap(),
            EmbeddingsStatus::NotProvisioned,
            "M-005: embedding status must not transition on failed import"
        );
        assert!(
            embedding_state.download_state.lock().unwrap().is_none(),
            "M-005: failed import must not install an ActiveEmbeddingDownload"
        );
    }
}
