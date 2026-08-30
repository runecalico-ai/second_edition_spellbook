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
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tokio::io::AsyncWriteExt;
use tokio::sync::{watch, Mutex as AsyncMutex};

pub(crate) const EMBEDDING_INDEX_CHUNK_SIZE: usize = 128;

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
    pub(crate) model: Mutex<Option<Arc<Mutex<TextEmbedding>>>>,
    pub(crate) status: Mutex<EmbeddingsStatus>,
    pub(crate) last_error: Mutex<Option<String>>,
    pub(crate) download_state: Mutex<Option<ActiveEmbeddingDownload>>,
    download_epoch: AtomicU64,
    reindex_in_progress: AtomicBool,
    /// Monotonic per-spell generation to drop stale background embed tasks.
    spell_embed_generations: Mutex<HashMap<i64, u64>>,
    /// Spell ids edited/created/imported while a reindex guard is held.
    pending_reembed_spell_ids: Mutex<HashSet<i64>>,
    /// Single-flight guard for model load + Ready transition.
    finalize_lock: AsyncMutex<()>,
}

impl Default for EmbeddingState {
    fn default() -> Self {
        Self {
            model: Mutex::new(None),
            status: Mutex::new(EmbeddingsStatus::NotProvisioned),
            last_error: Mutex::new(None),
            download_state: Mutex::new(None),
            download_epoch: AtomicU64::new(0),
            reindex_in_progress: AtomicBool::new(false),
            spell_embed_generations: Mutex::new(HashMap::new()),
            pending_reembed_spell_ids: Mutex::new(HashSet::new()),
            finalize_lock: AsyncMutex::new(()),
        }
    }
}

pub(crate) fn cancel_spell_embedding_for_delete(state: &EmbeddingState, spell_id: i64) {
    bump_spell_embed_generation(state, spell_id);
    remove_pending_reembed(state, spell_id);
}

fn mark_spell_pending_reembed(state: &EmbeddingState, spell_id: i64) {
    bump_spell_embed_generation(state, spell_id);
    let mut pending = state
        .pending_reembed_spell_ids
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    pending.insert(spell_id);
}

fn mark_spells_pending_reembed(state: &EmbeddingState, spell_ids: impl IntoIterator<Item = i64>) {
    for spell_id in spell_ids {
        mark_spell_pending_reembed(state, spell_id);
    }
}

fn remove_pending_reembed(state: &EmbeddingState, spell_id: i64) {
    let mut pending = state
        .pending_reembed_spell_ids
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    pending.remove(&spell_id);
}

fn take_pending_reembed_spell_ids(state: &EmbeddingState) -> Vec<i64> {
    let mut pending = state
        .pending_reembed_spell_ids
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut ids: Vec<i64> = pending.drain().collect();
    ids.sort_unstable();
    ids
}

fn bump_spell_embed_generation(state: &EmbeddingState, spell_id: i64) -> u64 {
    let mut generations = state
        .spell_embed_generations
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let next = generations.get(&spell_id).copied().unwrap_or(0) + 1;
    generations.insert(spell_id, next);
    next
}

fn is_spell_embed_generation_current(
    state: &EmbeddingState,
    spell_id: i64,
    generation: u64,
) -> bool {
    state
        .spell_embed_generations
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .get(&spell_id)
        .copied()
        .unwrap_or(0)
        == generation
}

fn invalidate_spell_vec_rows_blocking(
    pool: &crate::db::Pool,
    spell_ids: &[i64],
) -> Result<(), AppError> {
    if spell_ids.is_empty() {
        return Ok(());
    }
    let conn = pool.get()?;
    for spell_id in spell_ids {
        conn.execute(
            "DELETE FROM spell_vec WHERE rowid = ?1",
            rusqlite::params![spell_id],
        )?;
    }
    Ok(())
}

async fn invalidate_spell_vec_rows(pool: Arc<crate::db::Pool>, spell_ids: Vec<i64>) {
    if spell_ids.is_empty() {
        return;
    }
    let count = spell_ids.len();
    let cleanup =
        tokio::task::spawn_blocking(move || invalidate_spell_vec_rows_blocking(&pool, &spell_ids))
            .await;
    match cleanup {
        Ok(Ok(())) => tracing::info!(count, "stale spell vectors invalidated"),
        Ok(Err(error)) => {
            tracing::warn!(?error, "stale spell vector invalidation failed (non-fatal)")
        }
        Err(join_error) => tracing::warn!(
            ?join_error,
            "stale spell vector invalidation join failed (non-fatal)"
        ),
    }
}

struct ReindexInProgressGuard {
    state: Arc<EmbeddingState>,
}

impl ReindexInProgressGuard {
    fn try_acquire(state: Arc<EmbeddingState>) -> Result<Self, AppError> {
        if state
            .reindex_in_progress
            .compare_exchange(
                false,
                true,
                std::sync::atomic::Ordering::SeqCst,
                std::sync::atomic::Ordering::SeqCst,
            )
            .is_err()
        {
            return Err(AppError::Validation(
                EMBEDDING_REINDEX_ALREADY_IN_PROGRESS_MESSAGE.to_string(),
            ));
        }
        Ok(Self { state })
    }
}

impl Drop for ReindexInProgressGuard {
    fn drop(&mut self) {
        self.state
            .reindex_in_progress
            .store(false, std::sync::atomic::Ordering::SeqCst);
    }
}

fn reindex_in_progress(state: &EmbeddingState) -> bool {
    state
        .reindex_in_progress
        .load(std::sync::atomic::Ordering::SeqCst)
}

type EmbeddingDownloadControl = (
    u64,
    watch::Sender<bool>,
    watch::Receiver<DownloadCleanupState>,
);
pub(crate) const EMBEDDING_REINDEX_ALREADY_IN_PROGRESS_MESSAGE: &str =
    "Embedding reindex is already in progress";
const EMBEDDING_DOWNLOAD_CANCELLED_MESSAGE: &str = "Embedding download cancelled";
const DOWNLOAD_CLEANUP_WAIT_POLL_INTERVAL: std::time::Duration =
    std::time::Duration::from_millis(10);
const DOWNLOAD_CLEANUP_WAIT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);
const DOWNLOAD_CONTROL_WAIT_POLL_INTERVAL: std::time::Duration =
    std::time::Duration::from_millis(10);
const DOWNLOAD_CONTROL_WAIT_TIMEOUT: std::time::Duration = std::time::Duration::from_millis(250);
type SpellEmbeddingRow = (i64, String, String);
type VersionedSpellEmbeddingRow = (i64, String, String, u64);

struct FilteredImportUpsert {
    rows: Vec<SpellEmbeddingRow>,
    vectors: Vec<Vec<f32>>,
}

fn filter_current_import_upserts(
    state: &EmbeddingState,
    rows: &[VersionedSpellEmbeddingRow],
    vectors: &[Vec<f32>],
) -> FilteredImportUpsert {
    let mut kept_rows = Vec::new();
    let mut kept_vectors = Vec::new();
    for (row, vector) in rows.iter().zip(vectors.iter()) {
        if is_spell_embed_generation_current(state, row.0, row.3) {
            kept_rows.push((row.0, row.1.clone(), row.2.clone()));
            kept_vectors.push(vector.clone());
        } else {
            tracing::info!(
                spell_id = row.0,
                generation = row.3,
                "import batch embedding skipped stale generation"
            );
        }
    }
    FilteredImportUpsert {
        rows: kept_rows,
        vectors: kept_vectors,
    }
}

fn assign_import_row_generations(
    state: &EmbeddingState,
    rows: Vec<SpellEmbeddingRow>,
) -> Vec<VersionedSpellEmbeddingRow> {
    rows.into_iter()
        .map(|(id, name, description)| {
            let generation = bump_spell_embed_generation(state, id);
            (id, name, description, generation)
        })
        .collect()
}

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

fn ensure_no_active_embedding_reindex(state: &EmbeddingState) -> Result<(), AppError> {
    if reindex_in_progress(state) {
        return Err(AppError::Validation(
            "Cannot run embedding download while reindex is in progress".to_string(),
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

/// H-001: Task 3 Step 3.3 (`TextEmbedding::try_new` + `InitOptions` / `TextInitOptions`).
fn load_embedding_model_blocking(
    models_root: &std::path::Path,
) -> Result<Arc<Mutex<fastembed::TextEmbedding>>, AppError> {
    use fastembed::{EmbeddingModel, InitOptions, TextEmbedding};

    let mut options = InitOptions::new(EmbeddingModel::AllMiniLML6V2);
    options.cache_dir = models_root.to_path_buf();

    TextEmbedding::try_new(options)
        .map(|model| Arc::new(Mutex::new(model)))
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

            if matches!(
                status,
                EmbeddingsStatus::NotProvisioned | EmbeddingsStatus::Downloading
            ) {
                return Err(AppError::Search(
                    "Embedding model is unavailable".to_string(),
                ));
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
        .embed(texts, None)
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

fn load_reindex_total_and_candidates(
    pool: &Arc<crate::db::Pool>,
    force: bool,
) -> Result<(u32, Vec<SpellEmbeddingRow>), AppError> {
    let conn = pool.get()?;
    let total: u32 = {
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM spell", [], |row| row.get(0))?;
        count.max(0) as u32
    };

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
    Ok((total, out))
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
            let spell_exists: bool = conn
                .query_row(
                    "SELECT 1 FROM spell WHERE id = ?1",
                    rusqlite::params![row.0],
                    |_| Ok(()),
                )
                .is_ok();
            if !spell_exists {
                continue;
            }
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
    generation: u64,
) -> Result<(), AppError> {
    let model =
        await_ready_model_with_timeout(state.clone(), std::time::Duration::from_secs(5)).await?;
    let text = compose_spell_embedding_text(&name, &description);

    let vector = tokio::task::spawn_blocking(move || {
        let mut guard = model
            .lock()
            .map_err(|_| AppError::Search("embedding model lock poisoned".to_string()))?;
        embed_spell_text(&mut guard, &text)
    })
    .await
    .map_err(|e| AppError::Search(format!("single embedding task failed: {e}")))??;

    if !is_spell_embed_generation_current(state.as_ref(), spell_id, generation) {
        tracing::info!(
            spell_id,
            generation,
            "embedding write hook dropped stale generation"
        );
        return Ok(());
    }

    if reindex_in_progress(state.as_ref()) {
        tracing::info!(
            spell_id,
            "embedding write hook deferred because reindex started"
        );
        mark_spell_pending_reembed(state.as_ref(), spell_id);
        return Ok(());
    }

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
    let (status, status_lock_poisoned) = match state.status.lock() {
        Ok(guard) => (*guard, false),
        Err(poisoned) => (*poisoned.into_inner(), true),
    };
    if status_lock_poisoned {
        tracing::warn!(
            "embedding status mutex was poisoned; using last status for spell embedding hook"
        );
    }

    if status == EmbeddingsStatus::Ready && reindex_in_progress(state.as_ref()) {
        tracing::info!(
            spell_id,
            "embedding write hook deferred until reindex completes"
        );
        mark_spell_pending_reembed(state.as_ref(), spell_id);
        return Ok(());
    }

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

    let generation = bump_spell_embed_generation(state.as_ref(), spell_id);
    let state_for_task = Arc::clone(&state);
    let pool_for_failure = Arc::clone(&pool);
    tauri::async_runtime::spawn(async move {
        match embed_single_spell_row(
            state_for_task,
            pool.clone(),
            spell_id,
            name,
            description,
            generation,
        )
        .await
        {
            Ok(()) => {}
            Err(error) => {
                tracing::warn!(spell_id, ?error, "embedding write hook failed (non-fatal)");
                invalidate_spell_vec_rows(pool_for_failure, vec![spell_id]).await;
            }
        }
    });

    Ok(())
}

async fn embed_import_batch_rows(
    state: std::sync::Arc<EmbeddingState>,
    pool: std::sync::Arc<crate::db::Pool>,
    rows: Vec<VersionedSpellEmbeddingRow>,
) -> Result<(), AppError> {
    if rows.is_empty() {
        return Ok(());
    }

    let model =
        await_ready_model_with_timeout(Arc::clone(&state), std::time::Duration::from_secs(10))
            .await?;

    for chunk in rows.chunks(EMBEDDING_INDEX_CHUNK_SIZE) {
        let chunk_spell_ids: Vec<i64> = chunk.iter().map(|row| row.0).collect();
        let texts: Vec<String> = chunk
            .iter()
            .map(|(_, name, description, _)| compose_spell_embedding_text(name, description))
            .collect();
        let model_for_chunk = Arc::clone(&model);
        let pool_for_invalidation = Arc::clone(&pool);
        let state_for_reindex = Arc::clone(&state);
        match tokio::task::spawn_blocking(move || {
            let mut guard = model_for_chunk
                .lock()
                .map_err(|_| AppError::Search("embedding model lock poisoned".to_string()))?;
            embed_spell_texts_batch(&mut guard, &texts)
        })
        .await
        {
            Ok(Ok(vectors)) => {
                if reindex_in_progress(state_for_reindex.as_ref()) {
                    tracing::info!(
                        chunk_len = chunk.len(),
                        "import batch embedding chunk deferred because reindex started"
                    );
                    mark_spells_pending_reembed(
                        state_for_reindex.as_ref(),
                        chunk.iter().map(|row| row.0),
                    );
                    continue;
                }
                let filtered =
                    filter_current_import_upserts(state_for_reindex.as_ref(), chunk, &vectors);
                if filtered.rows.is_empty() {
                    continue;
                }
                if let Err(error) = upsert_embedding_chunk(
                    Arc::clone(&pool),
                    &filtered.rows,
                    &filtered.vectors,
                )
                .await
                {
                    let filtered_spell_ids: Vec<i64> =
                        filtered.rows.iter().map(|row| row.0).collect();
                    tracing::warn!(
                        ?error,
                        chunk_len = filtered_spell_ids.len(),
                        "import batch embedding chunk upsert failed (non-fatal)"
                    );
                    invalidate_spell_vec_rows(pool_for_invalidation, filtered_spell_ids).await;
                }
            }
            Ok(Err(error)) => {
                tracing::warn!(
                    ?error,
                    chunk_len = chunk.len(),
                    "import batch embedding chunk failed (non-fatal)"
                );
                invalidate_spell_vec_rows(pool_for_invalidation, chunk_spell_ids).await;
            }
            Err(join_error) => {
                tracing::warn!(
                    ?join_error,
                    chunk_len = chunk.len(),
                    "import batch embedding chunk join failed (non-fatal)"
                );
                invalidate_spell_vec_rows(pool_for_invalidation, chunk_spell_ids).await;
            }
        }
    }

    Ok(())
}

pub async fn enqueue_import_embeddings_if_ready(
    state: Arc<EmbeddingState>,
    pool: Arc<crate::db::Pool>,
    rows: Vec<(i64, String, String)>,
) -> Result<(), AppError> {
    if rows.is_empty() {
        return Ok(());
    }

    let (status, status_lock_poisoned) = match state.status.lock() {
        Ok(guard) => (*guard, false),
        Err(poisoned) => (*poisoned.into_inner(), true),
    };
    if status_lock_poisoned {
        tracing::warn!("embedding status mutex was poisoned; using last status for import batch embedding hook");
    }

    if status == EmbeddingsStatus::Ready && reindex_in_progress(state.as_ref()) {
        tracing::info!(
            count = rows.len(),
            "import embeddings deferred until reindex completes"
        );
        mark_spells_pending_reembed(state.as_ref(), rows.iter().map(|(id, _, _)| *id));
        return Ok(());
    }

    if status != EmbeddingsStatus::Ready {
        let stale_ids: Vec<i64> = rows.iter().map(|(id, _, _)| *id).collect();
        let count = stale_ids.len();
        let pool_for_cleanup = Arc::clone(&pool);
        tauri::async_runtime::spawn(async move {
            let cleanup = tokio::task::spawn_blocking(move || {
                let conn = pool_for_cleanup.get()?;
                let tx = conn.unchecked_transaction()?;
                for spell_id in stale_ids {
                    tx.execute(
                        "DELETE FROM spell_vec WHERE rowid = ?1",
                        rusqlite::params![spell_id],
                    )?;
                }
                tx.commit()?;
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

    let versioned = assign_import_row_generations(state.as_ref(), rows);
    let state_for_task = Arc::clone(&state);
    let count = versioned.len();
    tauri::async_runtime::spawn(async move {
        if let Err(error) = embed_import_batch_rows(state_for_task, pool, versioned).await {
            tracing::warn!(count, ?error, "import embedding hook failed (non-fatal)");
        }
    });

    Ok(())
}

pub async fn search_spells_semantic_internal(
    embedding_state: Arc<EmbeddingState>,
    db: Arc<crate::db::Pool>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<SemanticSearchResult>, AppError> {
    let query_text = query.trim().to_string();
    if query_text.is_empty() {
        return Ok(Vec::new());
    }

    let model =
        await_ready_model_with_timeout(embedding_state, std::time::Duration::from_secs(30)).await?;
    let query_vector = tokio::task::spawn_blocking(move || {
        let mut guard = model
            .lock()
            .map_err(|_| AppError::Search("embedding model lock poisoned".to_string()))?;
        embed_spell_text(&mut guard, &query_text)
    })
    .await
    .map_err(|e| AppError::Search(format!("query embedding task failed: {e}")))??;

    let max_rows = limit.unwrap_or(10).clamp(1, 1000);

    tokio::task::spawn_blocking(move || {
        let conn = db.get()?;
        query_ranked_spells_by_cosine(&conn, &query_vector, max_rows)
    })
    .await
    .map_err(|e| AppError::Search(format!("semantic query task failed: {e}")))?
}

fn query_ranked_spells_by_cosine(
    conn: &rusqlite::Connection,
    query_vector: &[f32],
    max_rows: u32,
) -> Result<Vec<SemanticSearchResult>, AppError> {
    let query_json = serde_json::to_string(query_vector)
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
    Ok(out)
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

fn load_spell_embedding_rows_by_ids(
    pool: &crate::db::Pool,
    ids: &[i64],
) -> Result<Vec<SpellEmbeddingRow>, AppError> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let conn = pool.get()?;
    let mut rows = Vec::with_capacity(ids.len());
    for spell_id in ids {
        let loaded = conn.query_row(
            "SELECT id, name, description FROM spell WHERE id = ?1",
            rusqlite::params![spell_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        );
        match loaded {
            Ok(row) => rows.push(row),
            Err(rusqlite::Error::QueryReturnedNoRows) => {}
            Err(error) => return Err(error.into()),
        }
    }
    Ok(rows)
}

async fn reembed_pending_spells(state: Arc<EmbeddingState>, pool: Arc<crate::db::Pool>) {
    let ids = take_pending_reembed_spell_ids(state.as_ref());
    if ids.is_empty() {
        return;
    }
    let ids_for_retry = ids.clone();
    let pool_for_load = Arc::clone(&pool);
    let rows = match tokio::task::spawn_blocking(move || {
        load_spell_embedding_rows_by_ids(&pool_for_load, &ids)
    })
    .await
    {
        Ok(Ok(rows)) => rows,
        Ok(Err(error)) => {
            tracing::warn!(?error, "pending reembed load failed (non-fatal)");
            mark_spells_pending_reembed(state.as_ref(), ids_for_retry);
            return;
        }
        Err(join_error) => {
            tracing::warn!(?join_error, "pending reembed load join failed (non-fatal)");
            mark_spells_pending_reembed(state.as_ref(), ids_for_retry);
            return;
        }
    };
    let status = match state.status.lock() {
        Ok(guard) => *guard,
        Err(poisoned) => *poisoned.into_inner(),
    };
    if status != EmbeddingsStatus::Ready {
        mark_spells_pending_reembed(state.as_ref(), ids_for_retry);
        return;
    }
    for (spell_id, name, description) in rows {
        if let Err(error) = enqueue_spell_embedding_if_ready(
            Arc::clone(&state),
            Arc::clone(&pool),
            spell_id,
            name,
            description,
        )
        .await
        {
            tracing::warn!(spell_id, ?error, "pending reembed enqueue failed (non-fatal)");
        }
    }
}

pub async fn reindex_embeddings_internal(
    app: EmbeddingsCommandAppHandle,
    state: Arc<EmbeddingState>,
    db: Arc<crate::db::Pool>,
    force: bool,
) -> Result<ReindexResult, AppError> {
    ensure_no_active_embedding_download(state.as_ref())?;
    let result = {
        let _reindex_guard = ReindexInProgressGuard::try_acquire(Arc::clone(&state))?;
        run_reindex_chunks(app, Arc::clone(&state), Arc::clone(&db), force).await
    };
    reembed_pending_spells(Arc::clone(&state), db).await;
    result
}

async fn run_reindex_chunks(
    app: EmbeddingsCommandAppHandle,
    state: Arc<EmbeddingState>,
    db: Arc<crate::db::Pool>,
    force: bool,
) -> Result<ReindexResult, AppError> {
    let model =
        await_ready_model_with_timeout(Arc::clone(&state), std::time::Duration::from_secs(30))
            .await?;

    let pool_for_snapshot = Arc::clone(&db);
    let (total, rows) = tokio::task::spawn_blocking(move || {
        load_reindex_total_and_candidates(&pool_for_snapshot, force)
    })
    .await
    .map_err(|e| AppError::Search(format!("reindex snapshot query task failed: {e}")))??;

    let candidate_count = rows.len() as u32;

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

    for (offset, chunk) in rows.chunks(EMBEDDING_INDEX_CHUNK_SIZE).enumerate() {
        let texts: Vec<String> = chunk
            .iter()
            .map(|(_, name, description)| compose_spell_embedding_text(name, description))
            .collect();

        let model_for_chunk = Arc::clone(&model);
        match tokio::task::spawn_blocking(move || {
            let mut guard = model_for_chunk
                .lock()
                .map_err(|_| AppError::Search("embedding model lock poisoned".to_string()))?;
            embed_spell_texts_batch(&mut guard, &texts)
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
                tracing::warn!(
                    ?join_error,
                    chunk_len = chunk.len(),
                    "reindex chunk join failed (non-fatal)"
                );
                failed += chunk.len() as u32;
            }
        }

        let current =
            ((offset + 1) * EMBEDDING_INDEX_CHUNK_SIZE).min(candidate_count as usize) as u32;
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
    {
        let _lease = provisioning.start_download(ProvisioningTarget::Embeddings)?;
    }
    reindex_embeddings_internal(app, state.inner().clone(), db.inner().clone(), force).await
}

fn spell_vec_uses_sqlite_vec(conn: &rusqlite::Connection) -> bool {
    let Ok(sql): Result<String, _> = conn.query_row(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'spell_vec'",
        [],
        |row| row.get(0),
    ) else {
        return false;
    };
    sql.contains("vec0") || sql.contains("float[")
}

fn ensure_spell_vec_sqlite_vec_ready(pool: &crate::db::Pool) -> Result<(), AppError> {
    let conn = pool.get()?;
    if spell_vec_uses_sqlite_vec(&conn) {
        Ok(())
    } else {
        Err(AppError::Search(
            "semantic search requires sqlite-vec; spell_vec is blob-backed in this database"
                .to_string(),
        ))
    }
}

pub async fn finalize_embedding_provision(
    app: EmbeddingsCommandAppHandle,
    state: Arc<EmbeddingState>,
    pool: Arc<crate::db::Pool>,
) -> Result<(), AppError> {
    let _finalize_guard = state.finalize_lock.lock().await;
    ensure_no_active_embedding_download(state.as_ref())?;
    ensure_spell_vec_sqlite_vec_ready(&pool)?;
    set_embeddings_status(&state, EmbeddingsStatus::Initializing, None)?;
    let models_root = app_models_dir()?;
    let state_for_errors = Arc::clone(&state);
    let model = match tokio::task::spawn_blocking(move || {
        load_embedding_model_blocking(&models_root)
    })
    .await
    {
        Ok(Ok(model)) => model,
        Ok(Err(error)) => {
            let message = format!("embedding startup model load failed: {error}");
            set_embeddings_status(
                &state_for_errors,
                EmbeddingsStatus::Error,
                Some(message.clone()),
            )?;
            return Err(AppError::Search(message));
        }
        Err(join_error) => {
            let message = format!("embedding startup load task failed: {join_error}");
            set_embeddings_status(
                &state_for_errors,
                EmbeddingsStatus::Error,
                Some(message.clone()),
            )?;
            return Err(AppError::Search(message));
        }
    };

    {
        *state
            .model
            .lock()
            .map_err(|_| AppError::Search("embedding model lock poisoned".to_string()))? =
            Some(model);
    }

    set_embeddings_status(&state, EmbeddingsStatus::Ready, None)?;

    match reindex_embeddings_internal(app, Arc::clone(&state), pool, false).await {
        Ok(_) => {}
        Err(AppError::Validation(message))
            if message == EMBEDDING_REINDEX_ALREADY_IN_PROGRESS_MESSAGE =>
        {
            tracing::info!(
                ?message,
                "startup embeddings backfill skipped; reindex already active"
            );
        }
        Err(error) => tracing::warn!(?error, "startup embeddings backfill failed"),
    }

    Ok(())
}

pub async fn initialize_embeddings_after_startup(
    app: EmbeddingsCommandAppHandle,
    state: Arc<EmbeddingState>,
    pool: Arc<crate::db::Pool>,
) -> Result<(), AppError> {
    ensure_no_active_embedding_download(state.as_ref())?;
    let vault_root = crate::db::pool::app_data_dir()?;
    let bundle_root = models_dir(&vault_root).join(EMBEDDING_DESTINATION);
    let bundle_artifacts_present = match std::fs::metadata(&bundle_root) {
        Ok(metadata) if metadata.is_dir() => EMBEDDING_EXPECTED_FILES.iter().all(|expected| {
            bundle_root
                .join(expected_relative_path(expected.relative_path))
                .is_file()
        }),
        Ok(_) => false,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(AppError::from(error)),
    };

    if !bundle_artifacts_present {
        set_embeddings_status(&state, EmbeddingsStatus::NotProvisioned, None)?;
        return Ok(());
    }

    if approved_embedding_bundle_present(&vault_root)? {
        return finalize_embedding_provision(app, state, pool).await;
    }

    let message = match validate_embedding_bundle_layout(&bundle_root) {
        Err(error) => format!("embedding bundle validation failed: {error}"),
        Ok(()) => "embedding bundle validation failed".to_string(),
    };
    set_embeddings_status(&state, EmbeddingsStatus::Error, Some(message))?;
    Ok(())
}

#[cfg(test)]
mod test_support {
    use crate::commands::vault::lock_vault_env_for_test;
    use std::ffi::OsString;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::Arc;

    const SPELLBOOK_DATA_DIR_ENV: &str = "SPELLBOOK_DATA_DIR";
    static TEST_DATA_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

    pub struct TestDataDirGuard {
        previous_data_dir: Option<OsString>,
        temp_data_dir: std::path::PathBuf,
    }

    impl TestDataDirGuard {
        pub fn acquire(test_name: &str) -> Self {
            let env_lock = lock_vault_env_for_test();
            let unique_id = TEST_DATA_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
            let sanitized: String = test_name
                .chars()
                .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
                .collect();
            let temp_data_dir = std::env::temp_dir().join(format!(
                "spellbook-embeddings-test-{}-{}-{}",
                sanitized,
                std::process::id(),
                unique_id
            ));
            std::fs::create_dir_all(&temp_data_dir).unwrap();
            let previous_data_dir = std::env::var_os(SPELLBOOK_DATA_DIR_ENV);
            std::env::set_var(SPELLBOOK_DATA_DIR_ENV, &temp_data_dir);
            drop(env_lock);
            Self {
                previous_data_dir,
                temp_data_dir,
            }
        }
    }

    impl Drop for TestDataDirGuard {
        fn drop(&mut self) {
            let env_lock = lock_vault_env_for_test();
            match &self.previous_data_dir {
                Some(prev) => std::env::set_var(SPELLBOOK_DATA_DIR_ENV, prev),
                None => std::env::remove_var(SPELLBOOK_DATA_DIR_ENV),
            }
            drop(env_lock);
            let _ = std::fs::remove_dir_all(&self.temp_data_dir);
        }
    }

    pub struct IsolatedTestPool {
        pub pool: Arc<crate::db::Pool>,
        _guard: TestDataDirGuard,
    }

    impl IsolatedTestPool {
        pub fn new(test_name: &str) -> Self {
            let guard = TestDataDirGuard::acquire(test_name);
            let env_lock = lock_vault_env_for_test();
            let pool = Arc::new(crate::db::init_db(None, false).expect("test pool"));
            drop(env_lock);
            Self {
                pool,
                _guard: guard,
            }
        }
    }
}

fn approved_embedding_bundle_present(vault_root: &std::path::Path) -> Result<bool, AppError> {
    let bundle_root = models_dir(vault_root).join(EMBEDDING_DESTINATION);
    match std::fs::metadata(&bundle_root) {
        Ok(metadata) if metadata.is_dir() => {}
        Ok(_) => return Ok(false),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(AppError::from(error)),
    }

    for expected in EMBEDDING_EXPECTED_FILES {
        let relative = expected_relative_path(expected.relative_path);
        let file_path = bundle_root.join(relative);
        if !file_path.is_file() {
            return Ok(false);
        }
    }

    Ok(validate_embedding_bundle_layout(&bundle_root).is_ok())
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
        Ok(()) => {
            set_embeddings_status(state.as_ref(), EmbeddingsStatus::Initializing, None)?;
            Ok(())
        }
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

    Ok(())
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
    db: tauri::State<'_, Arc<crate::db::Pool>>,
    provisioning: tauri::State<'_, Arc<ProvisioningState>>,
) -> Result<(), AppError> {
    let _lease = provisioning.start_download(ProvisioningTarget::Embeddings)?;
    ensure_no_active_embedding_reindex(embeddings_state.inner().as_ref())?;

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

    download_embedding_bundle_with_resume(
        app.clone(),
        embeddings_state.inner().clone(),
        models_root,
    )
    .await?;
    drop(_lease);
    finalize_embedding_provision(app, embeddings_state.inner().clone(), db.inner().clone()).await
}

#[tauri::command]
pub async fn embeddings_import_model_file(
    app: EmbeddingsCommandAppHandle,
    file_path: String,
    state: tauri::State<'_, Arc<EmbeddingState>>,
    db: tauri::State<'_, Arc<crate::db::Pool>>,
    provisioning: tauri::State<'_, Arc<ProvisioningState>>,
) -> Result<(), AppError> {
    let _lease = provisioning.start_download(ProvisioningTarget::Embeddings)?;
    ensure_no_active_embedding_reindex(state.inner().as_ref())?;
    let source = std::path::PathBuf::from(file_path);
    install_imported_embedding_bundle(state.inner().clone(), source).await?;
    drop(_lease);
    finalize_embedding_provision(app, state.inner().clone(), db.inner().clone()).await
}

#[tauri::command]
pub async fn embeddings_cancel_download(
    state: tauri::State<'_, Arc<EmbeddingState>>,
) -> Result<(), AppError> {
    cancel_embedding_download_and_wait(state.inner().as_ref()).await
}

#[cfg(test)]
mod tests {
    use super::test_support::IsolatedTestPool;
    use super::*;
    use crate::models::{
        EmbeddingsDownloadProgressEvent, EmbeddingsStatusResponse, ReindexProgressEvent,
        ReindexResult, SemanticSearchResult, SpellSummary,
    };
    use serde_json::Value;
    use std::sync::Arc;

    #[test]
    fn embedding_index_chunk_size_is_128() {
        assert_eq!(EMBEDDING_INDEX_CHUNK_SIZE, 128);
        let rows: Vec<i32> = (0..300).collect();
        let chunks: Vec<&[i32]> = rows.chunks(EMBEDDING_INDEX_CHUNK_SIZE).collect();
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].len(), 128);
        assert_eq!(chunks[1].len(), 128);
        assert_eq!(chunks[2].len(), 44);
    }

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

    #[tokio::test]
    async fn semantic_search_returns_empty_for_blank_query_without_loading_model() {
        let state = Arc::new(EmbeddingState::default());
        let isolated = IsolatedTestPool::new("semantic_search_returns_empty_for_blank_query");
        let pool = Arc::clone(&isolated.pool);
        let results = search_spells_semantic_internal(state, pool, " \t".to_string(), Some(10))
            .await
            .expect("semantic search");
        assert!(results.is_empty());
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

    fn unit_axis_vector(axis: usize) -> Vec<f32> {
        let mut vector = vec![0.0_f32; 384];
        vector[axis] = 1.0;
        vector
    }

    #[test]
    fn semantic_ranking_orders_by_cosine_distance_asc_and_serializes_camel_case() {
        let isolated = IsolatedTestPool::new(
            "semantic_ranking_orders_by_cosine_distance_asc_and_serializes_camel_case",
        );
        let conn = isolated.pool.get().expect("test db connection");
        if !spell_vec_uses_sqlite_vec(&conn) {
            return;
        }

        let close_id: i64 = {
            conn.query_row("SELECT IFNULL(MAX(id), 0) + 1 FROM spell", [], |row| {
                row.get(0)
            })
            .expect("next spell id")
        };
        let far_id = close_id + 1;
        conn.execute(
            "INSERT INTO spell (id, name, level, description, content_hash) VALUES (?1, 'Close Spell', 1, 'Near the query vector', ?2)",
            rusqlite::params![close_id, format!("hash-rank-close-{close_id}")],
        )
        .expect("insert close spell");
        conn.execute(
            "INSERT INTO spell (id, name, level, description, content_hash) VALUES (?1, 'Far Spell', 1, 'Orthogonal to the query vector', ?2)",
            rusqlite::params![far_id, format!("hash-rank-far-{far_id}")],
        )
        .expect("insert far spell");

        let close_json = serde_json::to_string(&unit_axis_vector(0)).expect("close vector json");
        let far_json = serde_json::to_string(&unit_axis_vector(1)).expect("far vector json");
        conn.execute(
            "INSERT INTO spell_vec(rowid, v) VALUES(?1, vec_f32(?2))",
            rusqlite::params![close_id, close_json],
        )
        .expect("insert close vector");
        conn.execute(
            "INSERT INTO spell_vec(rowid, v) VALUES(?1, vec_f32(?2))",
            rusqlite::params![far_id, far_json],
        )
        .expect("insert far vector");

        let ranked = query_ranked_spells_by_cosine(&conn, &unit_axis_vector(0), 10)
            .expect("cosine ranking query");
        assert!(
            ranked.len() >= 2,
            "expected both inserted spells in ranking results, got {}",
            ranked.len()
        );
        assert_eq!(ranked[0].spell.name, "Close Spell");
        assert_eq!(ranked[1].spell.name, "Far Spell");
        assert!(
            ranked[0].cosine_distance < ranked[1].cosine_distance,
            "ORDER BY cosine_distance ASC: close {} should be less than far {}",
            ranked[0].cosine_distance,
            ranked[1].cosine_distance
        );

        let value = serde_json::to_value(&ranked[0]).unwrap();
        let object = value.as_object().unwrap();
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

    #[tokio::test]
    async fn await_ready_model_fail_fast_on_error() {
        let state = Arc::new(EmbeddingState::default());
        *state.last_error.lock().unwrap() = Some("onnx init failed".to_string());
        *state.status.lock().unwrap() = EmbeddingsStatus::Error;

        let result = await_ready_model_with_timeout(state, std::time::Duration::from_secs(1)).await;
        match result {
            Err(AppError::Search(message)) => assert_eq!(message, "onnx init failed"),
            Ok(_) => panic!("expected fail-fast error, got model"),
            Err(other) => panic!("expected Search error, got: {other}"),
        }
    }

    #[tokio::test]
    async fn await_ready_model_fail_fast_when_initializing_then_error() {
        let state = Arc::new(EmbeddingState::default());
        *state.status.lock().unwrap() = EmbeddingsStatus::Initializing;
        let state_for_error = Arc::clone(&state);
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_millis(40)).await;
            *state_for_error.last_error.lock().unwrap() =
                Some("load failed after init".to_string());
            *state_for_error.status.lock().unwrap() = EmbeddingsStatus::Error;
        });

        let result =
            await_ready_model_with_timeout(Arc::clone(&state), std::time::Duration::from_secs(2))
                .await;
        match result {
            Err(AppError::Search(message)) => assert_eq!(message, "load failed after init"),
            Ok(_) => panic!("expected error after Initializing, got model"),
            Err(other) => panic!("expected Search error, got: {other}"),
        }
    }

    #[tokio::test]
    async fn await_ready_model_times_out_while_initializing() {
        let state = Arc::new(EmbeddingState::default());
        *state.status.lock().unwrap() = EmbeddingsStatus::Initializing;

        let result =
            await_ready_model_with_timeout(state, std::time::Duration::from_millis(50)).await;
        match result {
            Err(AppError::Search(message)) => {
                assert_eq!(message, "timed out waiting for embedding model readiness");
            }
            Ok(_) => panic!("expected timeout, got model"),
            Err(other) => panic!("expected Search timeout, got: {other}"),
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

        let isolated = IsolatedTestPool::new("post_write_hook_skips_when_not_ready");
        let pool = Arc::clone(&isolated.pool);
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

        for _ in 0..100 {
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

    /// Task 9.7: `enqueue_spell_embedding_if_ready` must return `Ok(())` to the spell
    /// write caller even when the *spawned* background embedding task itself fails.
    ///
    /// `post_write_hook_skips_when_not_ready` above exercises the "not Ready" skip
    /// path (lines ~591-627), where the spawned cleanup task cannot fail in a way
    /// that could ever propagate back to the caller — it always returns `Ok(())`
    /// before any spawn happens. That test would keep passing even if the
    /// Ready-branch spawn (~line 629-651) started propagating its inner error, so it
    /// does not actually pin down the "never fail the caller" contract for the
    /// success path's failure mode.
    ///
    /// This test instead drives `EmbeddingsStatus::Ready` with `state.model` left
    /// `None` (the default), which forces `await_ready_model_with_timeout` to fail
    /// fast with "embedding status is ready but model is not loaded" *inside* the
    /// spawned task (see `embed_single_spell_row` -> `await_ready_model_with_timeout`).
    /// That failure is caught by the `match` at line ~643 and only logged via
    /// `tracing::warn!` — never returned to the caller. If that contract regressed
    /// (e.g. someone made the caller `.await` the spawn and propagate its `Result`),
    /// this test would fail while `post_write_hook_skips_when_not_ready` would not.
    #[tokio::test]
    async fn enqueue_spell_embedding_returns_ok_when_ready_but_model_missing() {
        let state = Arc::new(EmbeddingState::default());
        *state.status.lock().unwrap() = EmbeddingsStatus::Ready;
        // state.model intentionally stays None (Default) so the spawned task's
        // model lookup genuinely errors instead of this test passing vacuously.

        let isolated = IsolatedTestPool::new(
            "enqueue_spell_embedding_returns_ok_when_ready_but_model_missing",
        );
        let pool = Arc::clone(&isolated.pool);
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
            let content_hash = format!("hash-embed-hook-ready-no-model-{spell_id}");
            conn.execute(
                "INSERT INTO spell (id, name, level, description, content_hash) VALUES (?1, 'Fireball', 3, 'A burst of flame', ?2)",
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
            "Fireball".to_string(),
            "A burst of flame".to_string(),
        )
        .await;

        assert!(
            result.is_ok(),
            "embedding hook must never fail the spell write caller, even when the \
             spawned task's model lookup errors"
        );

        // Confirm the spawned task actually ran the failure branch (logged the warning
        // and invalidated the stale vector) rather than this test passing vacuously
        // because Ok(()) is returned before the spawn ever executes.
        for _ in 0..100 {
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

        panic!(
            "expected spell_vec row to be deleted after spawned-task failure cleanup \
             (spawned embed task never ran or never hit the error branch)"
        );
    }

    #[tokio::test]
    async fn initialize_embeddings_without_bundle_sets_not_provisioned() {
        let isolated =
            IsolatedTestPool::new("initialize_embeddings_without_bundle_sets_not_provisioned");
        let state = Arc::new(EmbeddingState::default());
        let pool = Arc::clone(&isolated.pool);
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("startup init test app");
        let app_handle = app.handle().clone();

        let result =
            initialize_embeddings_after_startup(app_handle, Arc::clone(&state), pool).await;

        assert!(result.is_ok());
        assert_eq!(
            *state.status.lock().expect("status lock"),
            EmbeddingsStatus::NotProvisioned
        );
    }

    #[tokio::test]
    async fn import_hook_returns_immediately_when_ready_without_blocking_caller() {
        let state = Arc::new(EmbeddingState::default());
        *state.status.lock().unwrap() = EmbeddingsStatus::Ready;

        let isolated = IsolatedTestPool::new("import_hook_returns_immediately_when_ready");
        let started = std::time::Instant::now();
        let result = enqueue_import_embeddings_if_ready(
            state,
            Arc::clone(&isolated.pool),
            vec![(1_i64, "Shield".to_string(), "Protects".to_string())],
        )
        .await;

        assert!(result.is_ok());
        assert!(
            started.elapsed() < std::time::Duration::from_millis(500),
            "import enqueue should return before background embed work"
        );
    }

    #[test]
    fn import_enqueue_assigns_generations_and_later_edit_invalidates_them() {
        let state = EmbeddingState::default();
        let gen_a = bump_spell_embed_generation(&state, 10);
        let gen_b = bump_spell_embed_generation(&state, 11);
        assert_eq!(gen_a, 1);
        assert_eq!(gen_b, 1);
        assert!(is_spell_embed_generation_current(&state, 10, gen_a));
        bump_spell_embed_generation(&state, 10);
        assert!(!is_spell_embed_generation_current(&state, 10, gen_a));
        assert!(is_spell_embed_generation_current(&state, 11, gen_b));
    }

    #[test]
    fn assign_import_row_generations_bumps_per_row_and_returns_versioned_tuples() {
        let state = EmbeddingState::default();
        let rows = vec![
            (10, "Shield".into(), "Protects".into()),
            (11, "Light".into(), "Illuminates".into()),
        ];
        let versioned = assign_import_row_generations(&state, rows);
        assert_eq!(versioned.len(), 2);
        assert_eq!(versioned[0].0, 10);
        assert_eq!(versioned[0].1, "Shield");
        assert_eq!(versioned[0].2, "Protects");
        assert_eq!(versioned[1].0, 11);
        assert_eq!(versioned[1].1, "Light");
        assert_eq!(versioned[1].2, "Illuminates");
        assert_eq!(versioned[0].3, 1);
        assert_eq!(versioned[1].3, 1);
        assert!(is_spell_embed_generation_current(&state, 10, versioned[0].3));
        assert!(is_spell_embed_generation_current(&state, 11, versioned[1].3));
    }

    #[test]
    fn filter_current_import_rows_drops_stale_generation() {
        let state = EmbeddingState::default();
        let gen_keep = bump_spell_embed_generation(&state, 1);
        let gen_stale = bump_spell_embed_generation(&state, 2);
        bump_spell_embed_generation(&state, 2);
        let rows: Vec<VersionedSpellEmbeddingRow> = vec![
            (1, "Keep".into(), "desc".into(), gen_keep),
            (2, "Stale".into(), "desc".into(), gen_stale),
        ];
        let vectors = vec![vec![0.1_f32], vec![0.2_f32]];
        let kept = filter_current_import_upserts(&state, &rows, &vectors);
        assert_eq!(kept.rows.len(), 1);
        assert_eq!(kept.rows[0].0, 1);
        assert_eq!(kept.vectors.len(), 1);
        assert_eq!(kept.vectors[0][0], 0.1);
    }

    #[test]
    fn upsert_failure_invalidation_excludes_generation_stale_ids() {
        let state = EmbeddingState::default();
        let gen_keep = bump_spell_embed_generation(&state, 1);
        let gen_stale = bump_spell_embed_generation(&state, 2);
        bump_spell_embed_generation(&state, 2);
        let rows: Vec<VersionedSpellEmbeddingRow> = vec![
            (1, "Keep".into(), "desc".into(), gen_keep),
            (2, "Stale".into(), "desc".into(), gen_stale),
        ];
        let vectors = vec![vec![0.1_f32], vec![0.2_f32]];
        let filtered = filter_current_import_upserts(&state, &rows, &vectors);
        let ids_to_invalidate: Vec<i64> = filtered.rows.iter().map(|row| row.0).collect();
        assert_eq!(ids_to_invalidate, vec![1]);
        assert!(
            !ids_to_invalidate.contains(&2),
            "generation-stale spell ids must not be invalidated on upsert failure"
        );
    }

    /// Import enqueue assigns per-spell generations, then a concurrent edit bumps one spell
    /// before the batch completes. `filter_current_import_upserts` must drop the stale row
    /// so the import upsert cannot overwrite vectors written by the edit path.
    #[test]
    fn concurrent_edit_after_import_enqueue_excludes_stale_from_upsert() {
        let state = EmbeddingState::default();
        let import_rows = vec![
            (10, "Shield".into(), "Protects".into()),
            (11, "Light".into(), "Illuminates".into()),
        ];
        let versioned = assign_import_row_generations(&state, import_rows);
        let shield_gen_at_enqueue = versioned[0].3;
        let light_gen_at_enqueue = versioned[1].3;

        // Concurrent edit on spell 10 (same generation bump as update_spell post-write hook).
        bump_spell_embed_generation(&state, 10);

        let mock_vectors = vec![vec![0.1_f32; 384], vec![0.2_f32; 384]];
        let filtered = filter_current_import_upserts(&state, &versioned, &mock_vectors);

        assert_eq!(
            filtered.rows.len(),
            1,
            "stale row must be dropped before upsert"
        );
        assert_eq!(
            filtered.rows[0].0, 11,
            "only the unedited spell should remain for upsert"
        );
        assert_eq!(filtered.vectors.len(), 1);
        assert_eq!(filtered.vectors[0][0], 0.2);
        assert!(!is_spell_embed_generation_current(
            &state,
            10,
            shield_gen_at_enqueue
        ));
        assert!(is_spell_embed_generation_current(
            &state,
            11,
            light_gen_at_enqueue
        ));
    }

    #[tokio::test]
    async fn enqueue_during_reindex_queues_spell_and_keeps_vector() {
        let state = Arc::new(EmbeddingState::default());
        *state.status.lock().unwrap() = EmbeddingsStatus::Ready;
        state
            .reindex_in_progress
            .store(true, std::sync::atomic::Ordering::SeqCst);

        let isolated = IsolatedTestPool::new("enqueue_during_reindex_queues_spell_and_keeps_vector");
        let pool = Arc::clone(&isolated.pool);
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
            conn.execute(
                "INSERT INTO spell (id, name, level, description, content_hash) VALUES (?1, 'Shield', 1, 'Protects against attacks', ?2)",
                rusqlite::params![spell_id, format!("hash-reindex-queue-{spell_id}")],
            )
            .expect("insert spell");
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
                    .expect("blob fallback");
                }
            }
        }

        let result = enqueue_spell_embedding_if_ready(
            Arc::clone(&state),
            Arc::clone(&pool),
            spell_id,
            "Shield Edited".to_string(),
            "New description".to_string(),
        )
        .await;
        assert!(result.is_ok());

        tokio::time::sleep(std::time::Duration::from_millis(80)).await;
        let count: i64 = {
            let conn = pool.get().expect("test db connection");
            conn.query_row(
                "SELECT COUNT(*) FROM spell_vec WHERE rowid = ?1",
                rusqlite::params![spell_id],
                |row| row.get(0),
            )
            .expect("count")
        };
        assert_eq!(count, 1, "reindex skip must not delete the vector");
        let pending = take_pending_reembed_spell_ids(state.as_ref());
        assert_eq!(pending, vec![spell_id]);
    }

    #[test]
    fn cancel_delete_removes_pending_reembed() {
        let state = EmbeddingState::default();
        mark_spell_pending_reembed(&state, 42);
        cancel_spell_embedding_for_delete(&state, 42);
        assert!(take_pending_reembed_spell_ids(&state).is_empty());
    }

    #[tokio::test]
    async fn import_during_reindex_queues_ids_and_keeps_vectors() {
        let state = Arc::new(EmbeddingState::default());
        *state.status.lock().unwrap() = EmbeddingsStatus::Ready;
        state
            .reindex_in_progress
            .store(true, std::sync::atomic::Ordering::SeqCst);

        let isolated = IsolatedTestPool::new("import_during_reindex_queues_ids");
        let pool = Arc::clone(&isolated.pool);
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
            conn.execute(
                "INSERT INTO spell (id, name, level, description, content_hash) VALUES (?1, 'Light', 1, 'Creates light', ?2)",
                rusqlite::params![spell_id, format!("hash-import-reindex-{spell_id}")],
            )
            .expect("insert spell");
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
                    .expect("blob fallback");
                }
            }
        }

        let result = enqueue_import_embeddings_if_ready(
            Arc::clone(&state),
            Arc::clone(&pool),
            vec![(spell_id, "Light".into(), "Creates light".into())],
        )
        .await;
        assert!(result.is_ok());
        tokio::time::sleep(std::time::Duration::from_millis(80)).await;
        let count: i64 = {
            let conn = pool.get().expect("test db connection");
            conn.query_row(
                "SELECT COUNT(*) FROM spell_vec WHERE rowid = ?1",
                rusqlite::params![spell_id],
                |row| row.get(0),
            )
            .expect("count")
        };
        assert_eq!(count, 1, "reindex skip must not delete the vector");
        let pending = take_pending_reembed_spell_ids(state.as_ref());
        assert_eq!(pending, vec![spell_id]);
    }

    #[tokio::test]
    async fn reembed_pending_spells_drains_when_ready() {
        let state = Arc::new(EmbeddingState::default());
        *state.status.lock().unwrap() = EmbeddingsStatus::Ready;

        let isolated = IsolatedTestPool::new("reembed_pending_spells_drains_when_ready");
        let pool = Arc::clone(&isolated.pool);
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
            conn.execute(
                "INSERT INTO spell (id, name, level, description, content_hash) VALUES (?1, 'Shield', 1, 'Protects against attacks', ?2)",
                rusqlite::params![spell_id, format!("hash-reembed-drain-{spell_id}")],
            )
            .expect("insert spell");
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
                    .expect("blob fallback");
                }
            }
        }

        mark_spell_pending_reembed(state.as_ref(), spell_id);
        let gen_at_mark = state
            .spell_embed_generations
            .lock()
            .unwrap()
            .get(&spell_id)
            .copied()
            .unwrap_or(0);

        reembed_pending_spells(Arc::clone(&state), Arc::clone(&pool)).await;

        assert!(
            take_pending_reembed_spell_ids(state.as_ref()).is_empty(),
            "drain should consume pending ids"
        );
        let gen_after_drain = state
            .spell_embed_generations
            .lock()
            .unwrap()
            .get(&spell_id)
            .copied()
            .unwrap_or(0);
        assert!(
            gen_after_drain > gen_at_mark,
            "drain should call enqueue which bumps generation"
        );
    }

    #[tokio::test]
    async fn reembed_pending_spells_requeues_when_not_ready() {
        let state = Arc::new(EmbeddingState::default());
        *state.status.lock().unwrap() = EmbeddingsStatus::Initializing;

        let isolated = IsolatedTestPool::new("reembed_pending_spells_requeues_when_not_ready");
        let pool = Arc::clone(&isolated.pool);
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
            conn.execute(
                "INSERT INTO spell (id, name, level, description, content_hash) VALUES (?1, 'Shield', 1, 'Protects against attacks', ?2)",
                rusqlite::params![spell_id, format!("hash-reembed-guard-{spell_id}")],
            )
            .expect("insert spell");
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
                    .expect("blob fallback");
                }
            }
        }

        mark_spell_pending_reembed(state.as_ref(), spell_id);

        reembed_pending_spells(Arc::clone(&state), Arc::clone(&pool)).await;

        tokio::time::sleep(std::time::Duration::from_millis(80)).await;
        let count: i64 = {
            let conn = pool.get().expect("test db connection");
            conn.query_row(
                "SELECT COUNT(*) FROM spell_vec WHERE rowid = ?1",
                rusqlite::params![spell_id],
                |row| row.get(0),
            )
            .expect("count")
        };
        assert_eq!(
            count, 1,
            "not-ready drain must not delete preserved vectors"
        );
        let pending = take_pending_reembed_spell_ids(state.as_ref());
        assert_eq!(
            pending,
            vec![spell_id],
            "not-ready drain must re-queue pending ids"
        );
    }

    /// M-005 batch path: `enqueue_import_embeddings_if_ready` must delete existing `spell_vec`
    /// rows for each imported spell id when embeddings are not Ready (parity with
    /// `post_write_hook_skips_when_not_ready`).
    #[tokio::test]
    async fn import_hook_leaves_rows_for_reindex_when_embeddings_not_ready() {
        let state = Arc::new(EmbeddingState::default());
        *state.status.lock().unwrap() = EmbeddingsStatus::Initializing;

        let isolated = IsolatedTestPool::new("import_hook_leaves_rows_for_reindex");
        let pool = Arc::clone(&isolated.pool);
        let vector_json =
            serde_json::to_string(&vec![0.0_f32; 384]).expect("serialize test vector");
        let id_a: i64 = {
            let conn = pool.get().expect("test db connection");
            conn.query_row("SELECT IFNULL(MAX(id), 0) + 1 FROM spell", [], |row| {
                row.get(0)
            })
            .expect("next spell id")
        };
        let id_b = id_a + 1;
        {
            let conn = pool.get().expect("test db connection");
            conn.execute(
                "INSERT INTO spell (id, name, level, description, content_hash) VALUES (?1, 'Shield', 1, 'Protects against attacks', ?2)",
                rusqlite::params![id_a, format!("hash-import-hook-test-{id_a}")],
            )
            .expect("insert first spell");
            conn.execute(
                "INSERT INTO spell (id, name, level, description, content_hash) VALUES (?1, 'Light', 1, 'Creates light', ?2)",
                rusqlite::params![id_b, format!("hash-import-hook-test-{id_b}")],
            )
            .expect("insert second spell");
            for spell_id in [id_a, id_b] {
                match conn.execute(
                    "INSERT INTO spell_vec(rowid, v) VALUES(?1, vec_f32(?2))",
                    rusqlite::params![spell_id, &vector_json],
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
        }

        let result = enqueue_import_embeddings_if_ready(
            state,
            Arc::clone(&pool),
            vec![
                (
                    id_a,
                    "Shield".to_string(),
                    "Protects against attacks".to_string(),
                ),
                (id_b, "Light".to_string(), "Creates light".to_string()),
            ],
        )
        .await;

        assert!(result.is_ok());

        for _ in 0..100 {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
            let conn = pool.get().expect("test db connection");
            let count_a: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM spell_vec WHERE rowid = ?1",
                    rusqlite::params![id_a],
                    |row| row.get(0),
                )
                .expect("count a");
            let count_b: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM spell_vec WHERE rowid = ?1",
                    rusqlite::params![id_b],
                    |row| row.get(0),
                )
                .expect("count b");
            if count_a == 0 && count_b == 0 {
                return;
            }
        }

        panic!("M-005: expected spell_vec rows deleted for both ids after batch skip-path cleanup");
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
    use super::test_support::IsolatedTestPool;
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
        pool: Arc<crate::db::Pool>,
    ) -> EmbeddingsSmokeApp {
        let app = tauri::test::mock_builder()
            .manage(embedding_state)
            .manage(provisioning)
            .manage(pool)
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

    fn m005_pool(test_name: &str) -> Arc<crate::db::Pool> {
        IsolatedTestPool::new(test_name).pool
    }

    fn m005_pool_for_guard() -> Arc<crate::db::Pool> {
        Arc::new(crate::db::init_db(None, false).expect("M-005 pool"))
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
        let pool =
            m005_pool("m_005_embeddings_status_command_returns_default_state_through_ipc_boundary");
        let smoke = build_embeddings_smoke_app(
            Arc::clone(&embedding_state),
            Arc::clone(&provisioning),
            pool,
        );

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

        let pool = m005_pool(
            "m_005_embeddings_status_command_reports_active_download_progress_through_ipc_boundary",
        );
        let smoke = build_embeddings_smoke_app(
            Arc::clone(&embedding_state),
            Arc::clone(&provisioning),
            pool,
        );

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
        let pool =
            m005_pool("m_005_embeddings_cancel_download_command_is_noop_when_no_active_download");
        let smoke = build_embeddings_smoke_app(
            Arc::clone(&embedding_state),
            Arc::clone(&provisioning),
            pool,
        );

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

        let pool = m005_pool(
            "m_005_embeddings_cancel_download_command_signals_and_clears_active_download_state",
        );
        let smoke = build_embeddings_smoke_app(
            Arc::clone(&embedding_state),
            Arc::clone(&provisioning),
            pool,
        );

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

        let pool = m005_pool_for_guard();
        let smoke = build_embeddings_smoke_app(
            Arc::clone(&embedding_state),
            Arc::clone(&provisioning),
            pool,
        );

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

        let pool = m005_pool_for_guard();
        let smoke = build_embeddings_smoke_app(
            Arc::clone(&embedding_state),
            Arc::clone(&provisioning),
            pool,
        );

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

        let pool = m005_pool_for_guard();
        let smoke = build_embeddings_smoke_app(
            Arc::clone(&embedding_state),
            Arc::clone(&provisioning),
            pool,
        );

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
        let pool = m005_pool_for_guard();
        let smoke = build_embeddings_smoke_app(
            Arc::clone(&embedding_state),
            Arc::clone(&provisioning),
            pool,
        );

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
