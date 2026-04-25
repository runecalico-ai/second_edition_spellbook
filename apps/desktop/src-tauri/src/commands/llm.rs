use crate::commands::provisioning::{
    models_dir, FixedResourceProbe, ResourceProbe, ResourceSnapshot, BASELINE_MIN_FREE_DISK_BYTES,
    BASELINE_MIN_FREE_RAM_BYTES, TINY_LLAMA_DESTINATION,
};
use crate::db::pool::app_data_dir;
use crate::error::AppError;
use crate::models::{LlmStatus, LlmStatusResponse};
use llama_cpp_2::llama_backend::LlamaBackend;
use llama_cpp_2::model::LlamaModel;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::State;
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

fn approved_llm_model_path(vault_root: &Path) -> PathBuf {
    models_dir(vault_root).join(TINY_LLAMA_DESTINATION)
}

fn collect_llm_system_requirements<P: ResourceProbe>(
    probe: &P,
) -> Result<LlmSystemRequirementsSnapshot, AppError> {
    let snapshot = probe.snapshot()?;
    Ok(LlmSystemRequirementsSnapshot {
        free_disk_bytes: snapshot.free_disk_bytes,
        free_ram_bytes: snapshot.free_ram_bytes,
    })
}

fn snapshot_model_file_presence_blocking(vault_root: &Path) -> Result<(PathBuf, bool), AppError> {
    let model_path = approved_llm_model_path(vault_root);
    let approved_model_present = match std::fs::metadata(&model_path) {
        Ok(metadata) => metadata.is_file(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(AppError::from(error)),
    };

    Ok((model_path, approved_model_present))
}

fn snapshot_lifecycle_markers(state: &LlmState) -> Result<LifecycleSnapshot, AppError> {
    let status = *state
        .status
        .lock()
        .map_err(|_| AppError::Llm("LLM status state is poisoned".to_string()))?;
    let last_error = state
        .last_error
        .lock()
        .map_err(|_| AppError::Llm("LLM error state is poisoned".to_string()))?
        .clone();

    Ok(LifecycleSnapshot { status, last_error })
}

fn apply_lifecycle_snapshot(state: &LlmState, snapshot: &LifecycleSnapshot) -> Result<(), AppError> {
    let mut status_guard = state
        .status
        .lock()
        .map_err(|_| AppError::Llm("LLM status state is poisoned".to_string()))?;
    *status_guard = snapshot.status;
    drop(status_guard);

    let mut last_error_guard = state
        .last_error
        .lock()
        .map_err(|_| AppError::Llm("LLM error state is poisoned".to_string()))?;
    *last_error_guard = snapshot.last_error.clone();
    Ok(())
}

fn set_lifecycle_error(state: &LlmState, message: String) -> Result<(), AppError> {
    apply_lifecycle_snapshot(
        state,
        &LifecycleSnapshot {
            status: LlmStatus::Error,
            last_error: Some(message),
        },
    )
}

fn finish_lifecycle_recovery(state: &LlmState, status: LlmStatus) -> Result<(), AppError> {
    debug_assert!(matches!(status, LlmStatus::Ready | LlmStatus::Loaded));
    apply_lifecycle_snapshot(
        state,
        &LifecycleSnapshot {
            status,
            last_error: None,
        },
    )
}

fn record_lifecycle_error(state: &LlmState, error: AppError) -> AppError {
    let _ = set_lifecycle_error(state, error.to_string());
    error
}

fn derive_lifecycle_status(
    reprovision_active: bool,
    model_loaded: bool,
    explicit_status: LlmStatus,
    approved_model_present: bool,
    has_last_error: bool,
) -> LlmStatus {
    if reprovision_active {
        LlmStatus::Downloading
    } else if explicit_status == LlmStatus::Error && has_last_error {
        LlmStatus::Error
    } else if model_loaded {
        LlmStatus::Loaded
    } else if approved_model_present {
        LlmStatus::Ready
    } else {
        LlmStatus::NotProvisioned
    }
}

fn build_status_response(
    model_path: &Path,
    download_snapshot: Option<(u64, u64)>,
    reprovision_active: bool,
    loaded: bool,
    explicit_status: LlmStatus,
    last_error: Option<String>,
    approved_model_present: bool,
) -> LlmStatusResponse {
    let status = derive_lifecycle_status(
        reprovision_active,
        loaded,
        explicit_status,
        approved_model_present,
        last_error.is_some(),
    );

    LlmStatusResponse {
        status,
        model_path: model_path.display().to_string(),
        bytes_downloaded: download_snapshot.map(|value| value.0),
        total_bytes: download_snapshot.map(|value| value.1),
        last_error,
    }
}

fn status_snapshot(
    state: &LlmState,
    model_path: &Path,
    approved_model_present: bool,
) -> Result<LlmStatusResponse, AppError> {
    let download_snapshot = {
        let download_guard = state
            .download_state
            .lock()
            .map_err(|_| AppError::Llm("LLM download state is poisoned".to_string()))?;
        download_guard
            .as_ref()
            .map(|value| (value.bytes_downloaded, value.total_bytes))
    };

    let loaded = {
        let model_guard = state
            .model
            .lock()
            .map_err(|_| AppError::Llm("LLM model state is poisoned".to_string()))?;
        model_guard.is_some()
    };

    let reprovision_active = {
        let reprovision_guard = state
            .reprovisioning
            .lock()
            .map_err(|_| AppError::Llm("LLM reprovision state is poisoned".to_string()))?;
        reprovision_guard.is_some()
    };

    let lifecycle = snapshot_lifecycle_markers(state)?;

    Ok(build_status_response(
        model_path,
        download_snapshot,
        reprovision_active,
        loaded,
        lifecycle.status,
        lifecycle.last_error,
        approved_model_present,
    ))
}

#[tauri::command]
pub async fn llm_status(state: State<'_, Arc<LlmState>>) -> Result<LlmStatusResponse, AppError> {
    let vault_root = app_data_dir()?;
    let (model_path, approved_model_present) = tokio::task::spawn_blocking({
        let vault_root = vault_root.clone();
        move || snapshot_model_file_presence_blocking(&vault_root)
    })
    .await
    .map_err(|error| AppError::Llm(format!("LLM status snapshot task failed: {error}")))??;

    status_snapshot(state.inner().as_ref(), &model_path, approved_model_present)
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

    #[test]
    fn approved_model_path_uses_vault_models_directory() {
        let path = approved_llm_model_path(std::path::Path::new("C:/SpellbookVault"));
        assert_eq!(
            path,
            std::path::PathBuf::from("C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf")
        );
    }

    #[test]
    fn llm_system_requirements_snapshot_reads_probe_values() {
        let probe = FixedResourceProbe::new(ResourceSnapshot {
            free_disk_bytes: BASELINE_MIN_FREE_DISK_BYTES,
            free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES - 1,
        });

        let snapshot = collect_llm_system_requirements(&probe).unwrap();
        assert_eq!(snapshot.free_disk_bytes, BASELINE_MIN_FREE_DISK_BYTES);
        assert_eq!(snapshot.free_ram_bytes, BASELINE_MIN_FREE_RAM_BYTES - 1);
    }

    #[test]
    fn derive_lifecycle_status_covers_all_required_runtime_states() {
        assert_eq!(
            derive_lifecycle_status(false, false, LlmStatus::NotProvisioned, false, false),
            LlmStatus::NotProvisioned,
        );
        assert_eq!(
            derive_lifecycle_status(true, false, LlmStatus::NotProvisioned, true, false),
            LlmStatus::Downloading,
        );
        assert_eq!(
            derive_lifecycle_status(false, false, LlmStatus::NotProvisioned, true, false),
            LlmStatus::Ready,
        );
        assert_eq!(
            derive_lifecycle_status(false, true, LlmStatus::Ready, true, false),
            LlmStatus::Loaded,
        );
        assert_eq!(
            derive_lifecycle_status(false, true, LlmStatus::Error, true, true),
            LlmStatus::Error,
        );
        assert_eq!(
            derive_lifecycle_status(false, false, LlmStatus::Error, true, true),
            LlmStatus::Error,
        );
    }

    #[test]
    fn llm_status_reports_busy_during_verified_import_reprovision() {
        let state = LlmState::default();
        let model_path = std::path::PathBuf::from(
            "C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
        );

        set_lifecycle_error(&state, "previous import failed".to_string()).unwrap();
        *state.reprovisioning.lock().unwrap() = Some(ReprovisionKind::Import);

        let snapshot = status_snapshot(&state, &model_path, true).unwrap();
        assert_eq!(snapshot.status, LlmStatus::Downloading);
        assert_eq!(snapshot.last_error.as_deref(), Some("previous import failed"));
        assert_eq!(snapshot.bytes_downloaded, None);
        assert_eq!(snapshot.total_bytes, None);
    }

    #[test]
    fn llm_status_is_ready_when_model_file_snapshot_exists_but_model_is_not_loaded() {
        let state = LlmState::default();
        let model_path = std::path::PathBuf::from(
            "C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
        );

        let snapshot = status_snapshot(&state, &model_path, true).unwrap();
        assert_eq!(snapshot.status, LlmStatus::Ready);
    }

    #[test]
    fn llm_status_snapshot_reports_loaded_when_runtime_model_is_present() {
        let snapshot = build_status_response(
            std::path::Path::new("C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"),
            None,
            false,
            true,
            LlmStatus::NotProvisioned,
            None,
            true,
        );

        assert_eq!(snapshot.status, LlmStatus::Loaded);
    }

    #[test]
    fn llm_status_reports_error_and_last_error_until_recovered() {
        let state = LlmState::default();

        set_lifecycle_error(&state, "download failed".to_string()).unwrap();

        let model_path = std::path::PathBuf::from(
            "C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
        );

        let snapshot = status_snapshot(&state, &model_path, false).unwrap();
        assert_eq!(snapshot.status, LlmStatus::Error);
        assert_eq!(snapshot.last_error.as_deref(), Some("download failed"));
    }

    #[test]
    fn successful_ready_recovery_clears_prior_error_and_restores_ready_status() {
        let state = LlmState::default();
        let model_path = std::path::PathBuf::from(
            "C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
        );

        set_lifecycle_error(&state, "download failed".to_string()).unwrap();
        finish_lifecycle_recovery(&state, LlmStatus::Ready).unwrap();

        let snapshot = status_snapshot(&state, &model_path, true).unwrap();
        assert_eq!(snapshot.status, LlmStatus::Ready);
        assert_eq!(snapshot.last_error, None);
    }
}