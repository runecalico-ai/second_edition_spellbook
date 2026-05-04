use crate::error::AppError;
use crate::models::EmbeddingsStatus;
use fastembed::TextEmbedding;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::sync::watch;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DownloadCleanupState {
    Running,
    Finished,
}

#[derive(Debug)]
struct ActiveEmbeddingDownload {
    session_epoch: u64,
    bytes_downloaded: u64,
    total_bytes: u64,
    cancel_tx: watch::Sender<bool>,
    completion_tx: watch::Sender<DownloadCleanupState>,
}

pub struct EmbeddingState {
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

#[cfg(test)]
mod tests {
    use super::*;

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
}
