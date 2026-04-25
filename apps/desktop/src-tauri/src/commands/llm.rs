use crate::commands::provisioning::{
    models_dir, FixedResourceProbe, LiveResourceProbe, ProvisioningState, ProvisioningTarget,
    ResourceProbe, ResourceSnapshot, BASELINE_MIN_FREE_DISK_BYTES, BASELINE_MIN_FREE_RAM_BYTES,
    TINY_LLAMA_DESTINATION, TINY_LLAMA_SHA256, TINY_LLAMA_SIZE_BYTES, TINY_LLAMA_URL,
};
use crate::db::pool::app_data_dir;
use crate::error::AppError;
use crate::models::{DoneEvent, DownloadProgressEvent, LlmStatus, LlmStatusResponse, TokenEvent};
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::model::LlamaModel;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tokio::sync::watch;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ReprovisionKind {
    Download,
    Import,
}

#[derive(Debug)]
struct ActiveGeneration {
    stream_id: String,
    cancel: Arc<AtomicBool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DownloadCleanupState {
    Running,
    Finished,
}

#[derive(Debug)]
struct ActiveDownload {
    temp_path: PathBuf,
    final_path: PathBuf,
    bytes_downloaded: u64,
    total_bytes: u64,
    cancel_tx: watch::Sender<bool>,
    completion_tx: watch::Sender<DownloadCleanupState>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct LlmSystemRequirementsSnapshot {
    free_disk_bytes: u64,
    free_ram_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LifecycleSnapshot {
    status: LlmStatus,
    last_error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ReprovisionOutcome {
    Ready,
    Cancelled,
}

enum StartedReprovisionResult {
    Ready,
    Cancelled,
    Error {
        error: AppError,
        invalidate_runtime: bool,
    },
}

pub struct LlmState {
    pub(crate) model: Mutex<Option<LlamaModel>>,
    pub(crate) backend: Mutex<Option<LlamaBackend>>,
    pub(crate) status: Mutex<LlmStatus>,
    pub(crate) last_error: Mutex<Option<String>>,
    active_generation: Mutex<Option<ActiveGeneration>>,
    download_state: Mutex<Option<ActiveDownload>>,
    reprovisioning: Mutex<Option<ReprovisionKind>>,
}

impl Default for LlmState {
    fn default() -> Self {
        Self {
            model: Mutex::new(None),
            backend: Mutex::new(None),
            status: Mutex::new(LlmStatus::NotProvisioned),
            last_error: Mutex::new(None),
            active_generation: Mutex::new(None),
            download_state: Mutex::new(None),
            reprovisioning: Mutex::new(None),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_temp_dir(label: &str) -> std::path::PathBuf {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "spellbook-llm-{label}-{}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn llm_status_serializes_to_spec_values() {
        assert_eq!(
            serde_json::to_string(&LlmStatus::NotProvisioned).unwrap(),
            "\"notProvisioned\""
        );
        assert_eq!(
            serde_json::to_string(&LlmStatus::Downloading).unwrap(),
            "\"downloading\""
        );
        assert_eq!(serde_json::to_string(&LlmStatus::Ready).unwrap(), "\"ready\"");
        assert_eq!(serde_json::to_string(&LlmStatus::Loaded).unwrap(), "\"loaded\"");
        assert_eq!(serde_json::to_string(&LlmStatus::Error).unwrap(), "\"error\"");
    }

    #[test]
    fn llm_state_defaults_to_empty_runtime_state() {
        let state = LlmState::default();
        assert!(state.model.lock().unwrap().is_none());
        assert!(state.backend.lock().unwrap().is_none());
        assert!(state.active_generation.lock().unwrap().is_none());
        assert!(state.download_state.lock().unwrap().is_none());
        assert!(state.reprovisioning.lock().unwrap().is_none());
        assert!(state.last_error.lock().unwrap().is_none());
        assert_eq!(*state.status.lock().unwrap(), LlmStatus::NotProvisioned);
    }
}