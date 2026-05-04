use crate::commands::{
    app_models_dir, ensure_resources_available, models_dir, EMBEDDING_DESTINATION,
    EMBEDDING_EXPECTED_FILES, EMBEDDING_URL, LiveResourceProbe, ProvisioningState,
    ProvisioningTarget,
};
use crate::error::AppError;
use crate::models::EmbeddingsStatus;
use crate::models::EmbeddingsStatusResponse;
use fastembed::TextEmbedding;
use futures_util::StreamExt;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tokio::io::AsyncWriteExt;
use tokio::sync::watch;

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
    pub(crate) model: Mutex<Option<Arc<TextEmbedding>>>,
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

fn current_download_control(state: &EmbeddingState) -> Result<Option<EmbeddingDownloadControl>, AppError> {
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
    let session_epoch =
        state.download_epoch.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
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
        let completion = guard.as_ref().map(|download| download.completion_tx.clone());
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

async fn emit_download_progress(
    app: &tauri::AppHandle,
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

fn wait_for_download_control_or_idle(
    state: &EmbeddingState,
) -> Result<
    Option<(watch::Sender<bool>, watch::Receiver<DownloadCleanupState>)>,
    AppError,
> {
    let Some(target_epoch) = current_download_control(state)?.map(|value| value.0) else {
        return Ok(None);
    };

    match current_download_control(state)? {
        Some((session_epoch, cancel_tx, completion_rx)) => {
            if session_epoch == target_epoch {
                Ok(Some((cancel_tx, completion_rx)))
            } else {
                Ok(None)
            }
        }
        None => Ok(None),
    }
}

async fn wait_for_download_cleanup_or_idle(
    state: &EmbeddingState,
    mut completion_rx: watch::Receiver<DownloadCleanupState>,
) -> Result<(), AppError> {
    let mut channel_open = true;
    loop {
        if current_download_control(state)?.is_none() {
            return Ok(());
        }
        if !channel_open {
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
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
            _ = tokio::time::sleep(std::time::Duration::from_millis(10)) => {}
        }
    }
}

async fn cancel_embedding_download_and_wait(state: &EmbeddingState) -> Result<(), AppError> {
    let Some((cancel_tx, completion_rx)) = wait_for_download_control_or_idle(state)? else {
        return Ok(());
    };
    let _ = cancel_tx.send(true);
    wait_for_download_cleanup_or_idle(state, completion_rx).await
}

fn copy_directory_recursive(source: &std::path::Path, destination: &std::path::Path) -> Result<(), AppError> {
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
    app: tauri::AppHandle,
    state: Arc<EmbeddingState>,
    models_root: std::path::PathBuf,
) -> Result<(), AppError> {
    ensure_no_active_embedding_download(state.as_ref())?;
    set_embeddings_status(state.as_ref(), EmbeddingsStatus::Downloading, None)?;

    let total_bytes: u64 = EMBEDDING_EXPECTED_FILES.iter().map(|file| file.size_bytes).sum();
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
            let resume_from = match tokio::fs::metadata(&staging).await {
                Ok(metadata) => metadata.len(),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => 0,
                Err(error) => return Err(AppError::from(error)),
            };

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

            let mut file = if resume_from == 0 || response.status() == reqwest::StatusCode::OK {
                tokio::fs::File::create(&staging).await?
            } else {
                tokio::fs::OpenOptions::new().append(true).open(&staging).await?
            };

            let mut stream = response.bytes_stream();
            while let Some(next) = stream.next().await {
                if *cancel_rx.borrow_and_update() {
                    return Err(AppError::EmbeddingDownloadCancelled);
                }

                let chunk = next
                    .map_err(|error| AppError::Search(format!("embedding stream failed: {error}")))?;
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
            AppError::Search(format!("embedding post-download validation task failed: {error}"))
        })??;

        Ok::<(), AppError>(())
    }
    .await;

    finish_download_session(state.as_ref())?;

    match result {
        Ok(()) => set_embeddings_status(state.as_ref(), EmbeddingsStatus::Initializing, None),
        Err(AppError::EmbeddingDownloadCancelled) => {
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
    .map_err(|error| AppError::Search(format!("embedding import install task failed: {error}")))??;

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
    app: tauri::AppHandle,
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
    fn cancel_wait_returns_none_when_no_active_download() {
        let state = EmbeddingState::default();
        assert_eq!(wait_for_download_control_or_idle(&state).unwrap(), None);
    }

    #[test]
    fn cancel_wait_returns_controls_when_download_matches_epoch() {
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

        assert!(wait_for_download_control_or_idle(&state).unwrap().is_some());
    }

}
