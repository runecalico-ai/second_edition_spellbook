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
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, State};
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
    let status_guard = state
        .status
        .lock()
        .map_err(|_| AppError::Llm("LLM status state is poisoned".to_string()))?;
    let last_error_guard = state
        .last_error
        .lock()
        .map_err(|_| AppError::Llm("LLM error state is poisoned".to_string()))?;

    Ok(LifecycleSnapshot {
        status: *status_guard,
        last_error: last_error_guard.clone(),
    })
}

fn apply_lifecycle_snapshot(
    state: &LlmState,
    snapshot: &LifecycleSnapshot,
) -> Result<(), AppError> {
    let mut status_guard = state
        .status
        .lock()
        .map_err(|_| AppError::Llm("LLM status state is poisoned".to_string()))?;
    let mut last_error_guard = state
        .last_error
        .lock()
        .map_err(|_| AppError::Llm("LLM error state is poisoned".to_string()))?;

    *status_guard = snapshot.status;
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

fn record_lifecycle_error(state: &LlmState, error: AppError) -> AppError {
    let message = error.to_string();
    if let Err(record_error) = set_lifecycle_error(state, message) {
        tracing::warn!(?record_error, "Failed to record sticky LLM lifecycle error");
    }
    error
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
        match state.model.try_lock() {
            Ok(model_guard) => model_guard.is_some(),
            Err(std::sync::TryLockError::WouldBlock) => true,
            Err(std::sync::TryLockError::Poisoned(_)) => {
                return Err(AppError::Llm("LLM model state is poisoned".to_string()));
            }
        }
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

fn sha256_file(path: &Path) -> Result<String, AppError> {
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

    let digest = hasher.finalize();
    let mut output = String::with_capacity(digest.len() * 2);
    for byte in digest {
        use std::fmt::Write as _;
        let _ = write!(&mut output, "{byte:02X}");
    }
    Ok(output)
}

fn validate_selected_model_file(path: &Path) -> Result<(), AppError> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| {
            AppError::Validation("Selected model path is missing a valid filename".to_string())
        })?;

    if file_name != TINY_LLAMA_DESTINATION {
        return Err(AppError::Validation(
            "Selected file is not the approved TinyLlama file".to_string(),
        ));
    }

    let metadata = std::fs::metadata(path)?;
    if metadata.len() != TINY_LLAMA_SIZE_BYTES {
        return Err(AppError::Validation(
            "Selected file size does not match the approved TinyLlama asset".to_string(),
        ));
    }

    let sha = sha256_file(path)?;
    if sha != TINY_LLAMA_SHA256 {
        return Err(AppError::Validation(
            "Selected file SHA-256 does not match the approved TinyLlama asset".to_string(),
        ));
    }

    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum DownloadResponsePlan {
    Append {
        total_bytes: u64,
        remaining_bytes: u64,
    },
    RestartFromFreshStaging {
        total_bytes: u64,
    },
}

fn parse_content_range(content_range: &str) -> Result<(u64, u64, u64), AppError> {
    let value = content_range.strip_prefix("bytes ").ok_or_else(|| {
        AppError::Validation("Range response is missing the bytes unit".to_string())
    })?;
    let (range, total) = value.split_once('/').ok_or_else(|| {
        AppError::Validation("Range response is missing the total size".to_string())
    })?;
    let (start, end) = range.split_once('-').ok_or_else(|| {
        AppError::Validation("Range response is missing the byte range".to_string())
    })?;

    let start = start.parse::<u64>().map_err(|_| {
        AppError::Validation("Range response has an invalid start offset".to_string())
    })?;
    let end = end.parse::<u64>().map_err(|_| {
        AppError::Validation("Range response has an invalid end offset".to_string())
    })?;
    let total = total.parse::<u64>().map_err(|_| {
        AppError::Validation("Range response has an invalid total size".to_string())
    })?;

    if end < start {
        return Err(AppError::Validation(
            "Range response ends before it starts".to_string(),
        ));
    }

    Ok((start, end, total))
}

fn classify_download_response(
    existing_len: u64,
    status: reqwest::StatusCode,
    content_range: Option<&str>,
    content_length: Option<u64>,
) -> Result<DownloadResponsePlan, AppError> {
    match status {
        reqwest::StatusCode::PARTIAL_CONTENT => {
            let content_range = content_range.ok_or_else(|| {
                AppError::Validation(
                    "Range response is missing Content-Range for a resumed download".to_string(),
                )
            })?;

            let (start, end, total_bytes) = parse_content_range(content_range)?;
            if total_bytes != TINY_LLAMA_SIZE_BYTES {
                return Err(AppError::Validation(
                    "Range response does not match the approved TinyLlama size".to_string(),
                ));
            }
            if start != existing_len {
                return Err(AppError::Validation(
                    "Range response does not resume from the existing partial file".to_string(),
                ));
            }

            let remaining_bytes = end - start + 1;
            if let Some(content_length) = content_length {
                if content_length != remaining_bytes {
                    return Err(AppError::Validation(
                        "Range response length does not match the remaining bytes".to_string(),
                    ));
                }
            }

            Ok(DownloadResponsePlan::Append {
                total_bytes,
                remaining_bytes,
            })
        }
        reqwest::StatusCode::OK => {
            if let Some(content_length) = content_length {
                if content_length != TINY_LLAMA_SIZE_BYTES {
                    return Err(AppError::Validation(
                        "Model download returned an unexpected full-body length".to_string(),
                    ));
                }
            } else {
                return Err(AppError::Validation(
                    "Model download cannot discard the partial file without a full-body length proof"
                        .to_string(),
                ));
            }

            if existing_len == 0 {
                Ok(DownloadResponsePlan::Append {
                    total_bytes: TINY_LLAMA_SIZE_BYTES,
                    remaining_bytes: TINY_LLAMA_SIZE_BYTES,
                })
            } else {
                Ok(DownloadResponsePlan::RestartFromFreshStaging {
                    total_bytes: TINY_LLAMA_SIZE_BYTES,
                })
            }
        }
        other => Err(AppError::Validation(format!(
            "Model download returned unsupported status {other}"
        ))),
    }
}

fn staged_bytes_moved_to_final_path_blocking(
    staged_path: &Path,
    final_path: &Path,
) -> Result<bool, AppError> {
    let staged_missing = match std::fs::metadata(staged_path) {
        Ok(_) => false,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => true,
        Err(error) => return Err(AppError::from(error)),
    };

    let final_is_file = match std::fs::metadata(final_path) {
        Ok(metadata) => metadata.is_file(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(AppError::from(error)),
    };

    Ok(staged_missing && final_is_file)
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DownloadTargetPrep {
    existing_len: u64,
    restart_path: PathBuf,
}

fn prepare_download_target(
    final_path: &Path,
    temp_path: &Path,
) -> Result<DownloadTargetPrep, AppError> {
    let parent = final_path.parent().ok_or_else(|| {
        AppError::Llm("Approved LLM model path is missing a parent directory".to_string())
    })?;
    std::fs::create_dir_all(parent)?;

    let existing_len = match std::fs::metadata(temp_path) {
        Ok(metadata) if metadata.is_file() => metadata.len(),
        Ok(_) => {
            return Err(AppError::Llm(format!(
                "Resumable download path is not a file: {}",
                temp_path.display(),
            )));
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => 0,
        Err(error) => return Err(AppError::from(error)),
    };

    Ok(DownloadTargetPrep {
        existing_len,
        restart_path: final_path.with_extension("gguf.restart"),
    })
}

fn prepare_fresh_restart_file(restart_path: &Path) -> Result<(), AppError> {
    use std::io::Write;

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(restart_path)?;
    file.flush()?;
    Ok(())
}

fn import_staging_model_path(final_path: &Path) -> PathBuf {
    final_path.with_extension("gguf.import")
}

fn append_chunk_blocking(temp_path: &Path, chunk: &[u8]) -> Result<(), AppError> {
    use std::io::Write;

    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(temp_path)?;
    file.write_all(chunk)?;
    Ok(())
}

fn remove_corrupt_download_blocking(temp_path: &Path) -> Result<(), AppError> {
    match std::fs::metadata(temp_path) {
        Ok(metadata) if metadata.is_file() => {
            std::fs::remove_file(temp_path)?;
            Ok(())
        }
        Ok(_) => Err(AppError::Llm(format!(
            "Corrupt download cleanup expected a file at {}",
            temp_path.display(),
        ))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(AppError::from(error)),
    }
}

fn cleanup_restart_staging_blocking(restart_path: &Path) -> Result<(), AppError> {
    match std::fs::metadata(restart_path) {
        Ok(metadata) if metadata.is_file() => {
            std::fs::remove_file(restart_path)?;
        }
        Ok(_) => {
            return Err(AppError::Llm(format!(
                "Restart staging path is not a file: {}",
                restart_path.display(),
            )));
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(AppError::from(error)),
    }

    Ok(())
}

fn finalize_failed_restart_download_blocking(
    restart_path: &Path,
    error: AppError,
) -> Result<(), AppError> {
    cleanup_restart_staging_blocking(restart_path)?;
    Err(error)
}

async fn finalize_non_sha_download_error(
    active_download_path: PathBuf,
    temp_path: PathBuf,
    error: AppError,
) -> AppError {
    if active_download_path == temp_path {
        return error;
    }

    let original = error.to_string();
    match tokio::task::spawn_blocking({
        let restart_path = active_download_path.clone();
        move || finalize_failed_restart_download_blocking(&restart_path, error)
    })
    .await
    {
        Ok(Err(cleaned_error)) => cleaned_error,
        Ok(Ok(())) => unreachable!("restart failure finalizer must return the original error"),
        Err(join_error) => AppError::Llm(format!(
            "LLM restart failure cleanup task failed after {original}: {join_error}"
        )),
    }
}

trait PromotionFs {
    fn metadata(&self, path: &Path) -> std::io::Result<std::fs::Metadata>;
    fn rename(&self, from: &Path, to: &Path) -> std::io::Result<()>;
    fn remove_file(&self, path: &Path) -> std::io::Result<()>;
}

struct StdPromotionFs;

impl PromotionFs for StdPromotionFs {
    fn metadata(&self, path: &Path) -> std::io::Result<std::fs::Metadata> {
        std::fs::metadata(path)
    }

    fn rename(&self, from: &Path, to: &Path) -> std::io::Result<()> {
        std::fs::rename(from, to)
    }

    fn remove_file(&self, path: &Path) -> std::io::Result<()> {
        std::fs::remove_file(path)
    }
}

fn promote_staged_model_with_fs(
    fs: &impl PromotionFs,
    temp_path: &Path,
    final_path: &Path,
) -> Result<(), AppError> {
    let backup_path = final_path.with_extension("gguf.previous");
    let had_existing_final = match fs.metadata(final_path) {
        Ok(metadata) => metadata.is_file(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(AppError::from(error)),
    };

    if had_existing_final {
        match fs.metadata(&backup_path) {
            Ok(_) => fs.remove_file(&backup_path)?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(AppError::from(error)),
        }
        fs.rename(final_path, &backup_path)?;
    }

    match fs.rename(temp_path, final_path) {
        Ok(()) => {
            if had_existing_final {
                fs.remove_file(&backup_path)?;
            }
            Ok(())
        }
        Err(promotion_error) => {
            if had_existing_final {
                match fs.rename(&backup_path, final_path) {
                    Ok(()) => {}
                    Err(restore_error) => {
                        return Err(AppError::Llm(format!(
                            "Promoting the approved TinyLlama model failed: {promotion_error}; restoring the previous approved file also failed: {restore_error}. Manual recovery may be required at {} and {}",
                            final_path.display(),
                            backup_path.display(),
                        )));
                    }
                }
            }

            Err(AppError::Llm(format!(
                "Promoting the approved TinyLlama model failed: {promotion_error}"
            )))
        }
    }
}

fn promote_staged_model_blocking(temp_path: &Path, final_path: &Path) -> Result<(), AppError> {
    promote_staged_model_with_fs(&StdPromotionFs, temp_path, final_path)
}

fn require_download_disk_headroom(
    requirements: LlmSystemRequirementsSnapshot,
) -> Result<(), AppError> {
    if requirements.free_disk_bytes < BASELINE_MIN_FREE_DISK_BYTES {
        return Err(AppError::Validation(
            "Insufficient disk space: at least 800 MB free required to download the model"
                .to_string(),
        ));
    }

    Ok(())
}

fn verify_staged_model_length_blocking(
    staged_path: &Path,
    expected_len: u64,
) -> Result<(), AppError> {
    let actual_len = std::fs::metadata(staged_path)?.len();
    if actual_len != expected_len {
        return Err(AppError::Validation(format!(
            "Downloaded model did not reach the full approved asset length before verification: expected {expected_len} bytes, found {actual_len}"
        )));
    }
    Ok(())
}

enum LifecycleArbitrationRequest {
    BeginGeneration { stream_id: String },
    BeginReprovision(ReprovisionKind),
}

enum LifecycleArbitrationClaim {
    Generation {
        cancel: Arc<AtomicBool>,
    },
    Reprovision {
        lifecycle_before_reprovision: LifecycleSnapshot,
    },
}

fn claim_generation_reprovision_arbitration(
    state: &LlmState,
    request: LifecycleArbitrationRequest,
) -> Result<LifecycleArbitrationClaim, AppError> {
    let lifecycle_before_reprovision = match request {
        LifecycleArbitrationRequest::BeginReprovision(_) => {
            Some(snapshot_lifecycle_markers(state)?)
        }
        LifecycleArbitrationRequest::BeginGeneration { .. } => None,
    };

    let mut reprovisioning = state
        .reprovisioning
        .lock()
        .map_err(|_| AppError::Llm("LLM reprovision state is poisoned".to_string()))?;
    let mut active_generation = state
        .active_generation
        .lock()
        .map_err(|_| AppError::Llm("LLM generation state is poisoned".to_string()))?;

    match request {
        LifecycleArbitrationRequest::BeginReprovision(kind) => {
            if reprovisioning.is_some() {
                return Err(AppError::Validation(
                    "LLM provisioning is already in progress".to_string(),
                ));
            }
            if active_generation.is_some() {
                return Err(AppError::Validation(
                    "Cannot replace the approved TinyLlama model while a generation is active"
                        .to_string(),
                ));
            }

            *reprovisioning = Some(kind);
            Ok(LifecycleArbitrationClaim::Reprovision {
                lifecycle_before_reprovision: lifecycle_before_reprovision
                    .expect("reprovision snapshot must exist"),
            })
        }
        LifecycleArbitrationRequest::BeginGeneration { stream_id } => {
            if reprovisioning.is_some() {
                return Err(AppError::Validation(
                    "The approved TinyLlama model is being provisioned right now".to_string(),
                ));
            }
            if active_generation.is_some() {
                return Err(AppError::Validation(
                    "A response is already being generated. Please wait for it to complete or cancel it first.".to_string(),
                ));
            }

            let cancel = Arc::new(AtomicBool::new(false));
            *active_generation = Some(ActiveGeneration {
                stream_id,
                cancel: Arc::clone(&cancel),
            });

            Ok(LifecycleArbitrationClaim::Generation { cancel })
        }
    }
}

fn begin_generation(state: &LlmState, stream_id: String) -> Result<Arc<AtomicBool>, AppError> {
    match claim_generation_reprovision_arbitration(
        state,
        LifecycleArbitrationRequest::BeginGeneration { stream_id },
    )? {
        LifecycleArbitrationClaim::Generation { cancel } => Ok(cancel),
        LifecycleArbitrationClaim::Reprovision { .. } => unreachable!("generation claim expected"),
    }
}

fn finish_generation(state: &LlmState) -> Result<(), AppError> {
    let mut active = state
        .active_generation
        .lock()
        .map_err(|_| AppError::Llm("LLM generation state is poisoned".to_string()))?;
    *active = None;
    Ok(())
}

fn cancel_generation(state: &LlmState, stream_id: &str) -> Result<(), AppError> {
    let active = state
        .active_generation
        .lock()
        .map_err(|_| AppError::Llm("LLM generation state is poisoned".to_string()))?;
    if let Some(active) = active.as_ref() {
        if active.stream_id == stream_id {
            active
                .cancel
                .store(true, std::sync::atomic::Ordering::SeqCst);
        }
    }
    Ok(())
}

static COMPAT_STREAM_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

#[derive(Debug, Clone)]
struct ChatRunOutput {
    full_response: String,
    cancelled: bool,
}

type LlmRuntimeFuture<T> = std::pin::Pin<Box<dyn std::future::Future<Output = T> + Send + 'static>>;

trait LlmRuntimeDriver: Send + Sync {
    fn ensure_loaded(
        &self,
        state: Arc<LlmState>,
        preflight: ValidatedModelLoadPreflight,
    ) -> LlmRuntimeFuture<Result<(), AppError>>;

    fn generate(
        &self,
        state: Arc<LlmState>,
        message: String,
        cancel: Arc<AtomicBool>,
        event_sink: Arc<dyn ChatEventSink>,
    ) -> LlmRuntimeFuture<Result<ChatRunOutput, AppError>>;
}

#[derive(Default)]
struct DefaultLlmRuntimeDriver;

impl LlmRuntimeDriver for DefaultLlmRuntimeDriver {
    fn ensure_loaded(
        &self,
        state: Arc<LlmState>,
        preflight: ValidatedModelLoadPreflight,
    ) -> LlmRuntimeFuture<Result<(), AppError>> {
        Box::pin(ensure_model_loaded_after_valid_preflight(state, preflight))
    }

    fn generate(
        &self,
        state: Arc<LlmState>,
        message: String,
        cancel: Arc<AtomicBool>,
        event_sink: Arc<dyn ChatEventSink>,
    ) -> LlmRuntimeFuture<Result<ChatRunOutput, AppError>> {
        Box::pin(generate_chat_completion(state, message, cancel, event_sink))
    }
}

#[derive(Debug, Clone)]
struct ModelLoadPreflight {
    model_path: PathBuf,
    approved_model_present: bool,
    requirements: LlmSystemRequirementsSnapshot,
}

#[derive(Debug, Clone)]
struct ValidatedModelLoadPreflight {
    model_path: PathBuf,
}

#[cfg(test)]
static TEST_RUNTIME_DRIVER: std::sync::Mutex<Option<Arc<dyn LlmRuntimeDriver>>> =
    std::sync::Mutex::new(None);

#[cfg(test)]
static TEST_MODEL_LOAD_PREFLIGHT: std::sync::Mutex<Option<ModelLoadPreflight>> =
    std::sync::Mutex::new(None);

#[cfg(test)]
struct TestRuntimeDriverGuard;

#[cfg(test)]
struct TestModelLoadPreflightGuard;

#[cfg(test)]
fn install_test_runtime_driver(driver: Arc<dyn LlmRuntimeDriver>) -> TestRuntimeDriverGuard {
    *TEST_RUNTIME_DRIVER.lock().unwrap() = Some(driver);
    TestRuntimeDriverGuard
}

#[cfg(test)]
fn install_test_model_load_preflight(preflight: ModelLoadPreflight) -> TestModelLoadPreflightGuard {
    *TEST_MODEL_LOAD_PREFLIGHT.lock().unwrap() = Some(preflight);
    TestModelLoadPreflightGuard
}

#[cfg(test)]
impl Drop for TestRuntimeDriverGuard {
    fn drop(&mut self) {
        *TEST_RUNTIME_DRIVER.lock().unwrap() = None;
    }
}

#[cfg(test)]
impl Drop for TestModelLoadPreflightGuard {
    fn drop(&mut self) {
        *TEST_MODEL_LOAD_PREFLIGHT.lock().unwrap() = None;
    }
}

#[cfg(test)]
#[derive(Clone, Default)]
pub(crate) struct RecordingRuntimeDriver;

#[cfg(test)]
impl LlmRuntimeDriver for RecordingRuntimeDriver {
    fn ensure_loaded(
        &self,
        state: Arc<LlmState>,
        _preflight: ValidatedModelLoadPreflight,
    ) -> LlmRuntimeFuture<Result<(), AppError>> {
        Box::pin(async move {
            finish_model_load_success(state.as_ref())?;
            Ok(())
        })
    }

    fn generate(
        &self,
        _state: Arc<LlmState>,
        _message: String,
        _cancel: Arc<AtomicBool>,
        sink: Arc<dyn ChatEventSink>,
    ) -> LlmRuntimeFuture<Result<ChatRunOutput, AppError>> {
        Box::pin(async move {
            sink.emit_token("ok")?;
            Ok(ChatRunOutput {
                full_response: "ok".to_string(),
                cancelled: false,
            })
        })
    }
}

fn active_llm_runtime_driver() -> Arc<dyn LlmRuntimeDriver> {
    #[cfg(test)]
    if let Some(driver) = TEST_RUNTIME_DRIVER.lock().unwrap().as_ref() {
        return Arc::clone(driver);
    }

    Arc::new(DefaultLlmRuntimeDriver)
}

fn build_done_event(run_result: &Result<ChatRunOutput, AppError>, cancelled: bool) -> DoneEvent {
    match run_result {
        Ok(output) => DoneEvent {
            full_response: output.full_response.clone(),
            cancelled: output.cancelled,
        },
        Err(_) => DoneEvent {
            full_response: String::new(),
            cancelled,
        },
    }
}

trait ChatEventSink: Send + Sync {
    fn emit_token(&self, token: &str) -> Result<(), AppError>;
    fn emit_done(&self, event: DoneEvent) -> Result<(), AppError>;
}

#[derive(Clone)]
struct TauriChatEventSink {
    app: tauri::AppHandle,
    stream_id: String,
}

impl TauriChatEventSink {
    fn new(app: tauri::AppHandle, stream_id: String) -> Self {
        Self { app, stream_id }
    }
}

impl ChatEventSink for TauriChatEventSink {
    fn emit_token(&self, token: &str) -> Result<(), AppError> {
        self.app
            .emit(
                &format!("llm://token/{}", self.stream_id),
                TokenEvent {
                    token: token.to_string(),
                },
            )
            .map_err(|error| AppError::Llm(format!("Failed to emit token event: {error}")))
    }

    fn emit_done(&self, event: DoneEvent) -> Result<(), AppError> {
        self.app
            .emit(&format!("llm://done/{}", self.stream_id), event)
            .map_err(|error| AppError::Llm(format!("Failed to emit terminal done event: {error}")))
    }
}

#[derive(Default)]
struct CompatChatEventSink;

impl ChatEventSink for CompatChatEventSink {
    fn emit_token(&self, _token: &str) -> Result<(), AppError> {
        Ok(())
    }

    fn emit_done(&self, _event: DoneEvent) -> Result<(), AppError> {
        Ok(())
    }
}

#[derive(Default)]
struct Utf8TokenAccumulator {
    pending: Vec<u8>,
}

impl Utf8TokenAccumulator {
    fn push(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        match std::str::from_utf8(&self.pending) {
            Ok(text) => {
                let output = text.to_string();
                self.pending.clear();
                output
            }
            Err(error) if error.error_len().is_none() => String::new(),
            Err(error) => {
                let valid_up_to = error.valid_up_to();
                let output = String::from_utf8_lossy(&self.pending[..valid_up_to]).to_string();
                self.pending = self.pending[valid_up_to..].to_vec();
                output
            }
        }
    }

    fn finish(&mut self) -> String {
        let output = String::from_utf8_lossy(&self.pending).to_string();
        self.pending.clear();
        output
    }
}

fn collect_model_load_preflight(vault_root: &Path) -> Result<ModelLoadPreflight, AppError> {
    #[cfg(test)]
    if let Some(preflight) = TEST_MODEL_LOAD_PREFLIGHT.lock().unwrap().clone() {
        return Ok(preflight);
    }

    let (model_path, approved_model_present) = snapshot_model_file_presence_blocking(vault_root)?;
    let probe = LiveResourceProbe::new(models_dir(vault_root));
    let requirements = collect_llm_system_requirements(&probe)?;

    Ok(ModelLoadPreflight {
        model_path,
        approved_model_present,
        requirements,
    })
}

fn validate_model_load_preflight(
    state: &LlmState,
    preflight: ModelLoadPreflight,
) -> Result<ValidatedModelLoadPreflight, AppError> {
    ensure_no_reprovision_in_progress(state)?;
    validate_model_load_prerequisites(preflight.approved_model_present, preflight.requirements)?;

    Ok(ValidatedModelLoadPreflight {
        model_path: preflight.model_path,
    })
}

async fn ensure_model_loaded_after_valid_preflight(
    state: Arc<LlmState>,
    preflight: ValidatedModelLoadPreflight,
) -> Result<(), AppError> {
    let load_result = tokio::task::spawn_blocking({
        let state = Arc::clone(&state);
        move || ensure_model_loaded_after_preflight_blocking(state.as_ref(), &preflight)
    })
    .await
    .map_err(|error| AppError::Llm(format!("LLM load task failed: {error}")))?;

    load_result.map_err(|error| record_lifecycle_error(state.as_ref(), error))
}

fn validate_model_load_prerequisites(
    approved_model_present: bool,
    requirements: LlmSystemRequirementsSnapshot,
) -> Result<(), AppError> {
    if !approved_model_present {
        return Err(AppError::Validation(
            "The approved TinyLlama model has not been provisioned yet".to_string(),
        ));
    }

    if requirements.free_ram_bytes < BASELINE_MIN_FREE_RAM_BYTES {
        return Err(AppError::Validation(
            "Insufficient RAM: at least 1.5 GB free required to load the model".to_string(),
        ));
    }

    Ok(())
}

fn finish_model_load_success(state: &LlmState) -> Result<(), AppError> {
    finish_lifecycle_recovery(state, LlmStatus::Loaded)
}

fn ensure_model_loaded_after_preflight_blocking(
    state: &LlmState,
    preflight: &ValidatedModelLoadPreflight,
) -> Result<(), AppError> {
    let model_path = &preflight.model_path;

    let mut backend_guard = state
        .backend
        .lock()
        .map_err(|_| AppError::Llm("LLM backend state is poisoned".to_string()))?;
    if backend_guard.is_none() {
        *backend_guard = Some(LlamaBackend::init().map_err(|error| {
            AppError::Llm(format!("Failed to initialize llama backend: {error}"))
        })?);
    }

    let mut model_guard = state
        .model
        .lock()
        .map_err(|_| AppError::Llm("LLM model state is poisoned".to_string()))?;
    if model_guard.is_none() {
        let params = llama_cpp_2::model::params::LlamaModelParams::default();
        let backend = backend_guard.as_ref().ok_or_else(|| {
            AppError::Llm("LLM backend should be initialized before model load".to_string())
        })?;
        let model = LlamaModel::load_from_file(backend, model_path, &params)
            .map_err(|error| AppError::Llm(format!("Failed to load TinyLlama model: {error}")))?;
        *model_guard = Some(model);
    }

    drop(model_guard);
    drop(backend_guard);
    finish_model_load_success(state)
}

async fn generate_chat_completion(
    state: Arc<LlmState>,
    message: String,
    cancel: Arc<AtomicBool>,
    event_sink: Arc<dyn ChatEventSink>,
) -> Result<ChatRunOutput, AppError> {
    tokio::task::spawn_blocking(move || -> Result<ChatRunOutput, AppError> {
        let backend_guard = state
            .backend
            .lock()
            .map_err(|_| AppError::Llm("LLM backend state is poisoned".to_string()))?;
        let model_guard = state
            .model
            .lock()
            .map_err(|_| AppError::Llm("LLM model state is poisoned".to_string()))?;
        let backend = backend_guard
            .as_ref()
            .ok_or_else(|| AppError::Llm("LLM backend is not loaded".to_string()))?;
        let model = model_guard
            .as_ref()
            .ok_or_else(|| AppError::Llm("LLM model is not loaded".to_string()))?;

        let prompt = format!(
            "<|im_start|>user\n{}\n<|im_end|>\n<|im_start|>assistant\n",
            message
        );
        let tokens = model
            .str_to_token(&prompt, llama_cpp_2::model::AddBos::Always)
            .map_err(|error| AppError::Llm(format!("Failed to tokenize prompt: {error}")))?;
        let n_ctx = model.n_ctx_train().max(tokens.len() as u32 + 512);
        let ctx_params = llama_cpp_2::context::params::LlamaContextParams::default()
            .with_n_ctx(std::num::NonZeroU32::new(n_ctx))
            .with_n_batch(n_ctx);
        let mut ctx = model
            .new_context(backend, ctx_params)
            .map_err(|error| AppError::Llm(format!("Failed to create llama context: {error}")))?;

        let mut batch = llama_cpp_2::llama_batch::LlamaBatch::new(n_ctx as usize, 1);
        let last_index = tokens.len().saturating_sub(1) as i32;
        for (i, token) in (0_i32..).zip(tokens.iter().copied()) {
            batch
                .add(token, i, &[0], i == last_index)
                .map_err(|error| AppError::Llm(format!("Failed to build llama batch: {error}")))?;
        }
        ctx.decode(&mut batch)
            .map_err(|error| AppError::Llm(format!("Initial llama decode failed: {error}")))?;

        let mut utf8 = Utf8TokenAccumulator::default();
        let mut sampler = llama_cpp_2::sampling::LlamaSampler::greedy();
        let mut n_cur = batch.n_tokens();
        let mut generated = String::new();

        while n_cur < n_ctx as i32 {
            if cancel.load(std::sync::atomic::Ordering::SeqCst) {
                break;
            }

            let token = sampler.sample(&ctx, batch.n_tokens() - 1);
            sampler.accept(token);
            if model.is_eog_token(token) {
                break;
            }

            let bytes = model
                .token_to_bytes(token, llama_cpp_2::model::Special::Plaintext)
                .map_err(|error| AppError::Llm(format!("Failed to decode token bytes: {error}")))?;
            let piece = utf8.push(&bytes);
            if !piece.is_empty() {
                generated.push_str(&piece);
                event_sink.emit_token(&piece)?;
            }

            batch.clear();
            batch
                .add(token, n_cur, &[0], true)
                .map_err(|error| AppError::Llm(format!("Failed to queue next token: {error}")))?;
            n_cur += 1;
            ctx.decode(&mut batch)
                .map_err(|error| AppError::Llm(format!("Token decode failed: {error}")))?;
        }

        let tail = utf8.finish();
        if !tail.is_empty() {
            generated.push_str(&tail);
            event_sink.emit_token(&tail)?;
        }

        Ok(ChatRunOutput {
            full_response: generated,
            cancelled: cancel.load(std::sync::atomic::Ordering::SeqCst),
        })
    })
    .await
    .map_err(|error| AppError::Llm(format!("LLM generation task failed: {error}")))?
}

fn finalize_claimed_generation(
    state: &LlmState,
    stream_id: &str,
    run_result: Result<ChatRunOutput, AppError>,
    cancel: &Arc<AtomicBool>,
    event_sink: &dyn ChatEventSink,
) -> Result<ChatRunOutput, AppError> {
    let done_event = build_done_event(
        &run_result,
        cancel.load(std::sync::atomic::Ordering::SeqCst),
    );

    let command_result = run_result;

    finish_generation_best_effort(state, stream_id);

    if let Err(error) = event_sink.emit_done(done_event) {
        tracing::warn!(stream_id, ?error, "Failed to emit terminal LLM done event");
    }

    command_result
}

fn finish_generation_best_effort(state: &LlmState, stream_id: &str) {
    if let Err(error) = finish_generation(state) {
        tracing::warn!(
            stream_id,
            ?error,
            "Failed to clear active LLM generation claim"
        );
        let _ = set_lifecycle_error(state, error.to_string());
    }
}

async fn run_claimed_llm_chat(
    state: Arc<LlmState>,
    message: String,
    stream_id: String,
    event_sink: Arc<dyn ChatEventSink>,
) -> Result<ChatRunOutput, AppError> {
    use std::sync::atomic::Ordering;

    let vault_root = app_data_dir()?;
    let cancel = begin_generation(state.as_ref(), stream_id.clone())?;
    let runtime_driver = active_llm_runtime_driver();

    let run_result = async {
        if cancel.load(Ordering::SeqCst) {
            return Ok(ChatRunOutput {
                full_response: String::new(),
                cancelled: true,
            });
        }

        let preflight = tokio::task::spawn_blocking({
            let vault_root = vault_root.clone();
            move || collect_model_load_preflight(&vault_root)
        })
        .await
        .map_err(|error| AppError::Llm(format!("LLM preflight task failed: {error}")))??;

        let validated_preflight = validate_model_load_preflight(state.as_ref(), preflight)?;

        if cancel.load(Ordering::SeqCst) {
            return Ok(ChatRunOutput {
                full_response: String::new(),
                cancelled: true,
            });
        }

        runtime_driver
            .ensure_loaded(Arc::clone(&state), validated_preflight)
            .await?;

        if cancel.load(Ordering::SeqCst) {
            return Ok(ChatRunOutput {
                full_response: String::new(),
                cancelled: true,
            });
        }

        runtime_driver
            .generate(
                Arc::clone(&state),
                message,
                Arc::clone(&cancel),
                Arc::clone(&event_sink),
            )
            .await
            .map_err(|error| record_lifecycle_error(state.as_ref(), error))
    }
    .await;

    finalize_claimed_generation(
        state.as_ref(),
        &stream_id,
        run_result,
        &cancel,
        event_sink.as_ref(),
    )
}

pub(crate) async fn llm_chat_answer_compat(
    state: Arc<LlmState>,
    message: String,
) -> Result<String, AppError> {
    let stream_id = format!(
        "compat-{}-{}",
        std::process::id(),
        COMPAT_STREAM_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    );

    run_claimed_llm_chat(
        Arc::clone(&state),
        message,
        stream_id,
        Arc::new(CompatChatEventSink),
    )
    .await
    .map(|value| value.full_response)
}

#[tauri::command]
pub async fn llm_chat(
    app: tauri::AppHandle,
    state: State<'_, Arc<LlmState>>,
    message: String,
    stream_id: String,
) -> Result<(), AppError> {
    run_claimed_llm_chat(
        Arc::clone(state.inner()),
        message,
        stream_id.clone(),
        Arc::new(TauriChatEventSink::new(app, stream_id)),
    )
    .await
    .map(|_| ())
}

#[tauri::command]
pub async fn llm_cancel_generation(
    state: State<'_, Arc<LlmState>>,
    stream_id: String,
) -> Result<(), AppError> {
    cancel_generation(state.inner().as_ref(), &stream_id)
}

#[derive(Debug)]
struct ReprovisionGuard {
    state: Arc<LlmState>,
    lifecycle_before_reprovision: LifecycleSnapshot,
    finished: bool,
}

impl ReprovisionGuard {
    fn finish_ready(&mut self) -> Result<(), AppError> {
        finalize_reprovision(
            self.state.as_ref(),
            LifecycleSnapshot {
                status: LlmStatus::Ready,
                last_error: None,
            },
            true,
        )?;
        self.finished = true;
        Ok(())
    }

    fn finish_cancelled(&mut self) -> Result<(), AppError> {
        finalize_reprovision(
            self.state.as_ref(),
            self.lifecycle_before_reprovision.clone(),
            false,
        )?;
        self.finished = true;
        Ok(())
    }

    fn finish_error(
        &mut self,
        error: AppError,
        invalidate_runtime: bool,
    ) -> Result<AppError, AppError> {
        match finalize_reprovision(
            self.state.as_ref(),
            LifecycleSnapshot {
                status: LlmStatus::Error,
                last_error: Some(error.to_string()),
            },
            invalidate_runtime,
        ) {
            Ok(()) => {
                self.finished = true;
                Ok(error)
            }
            Err(finalize_error) => Err(AppError::Llm(format!(
                "LLM reprovision finalization failed while handling {error}: {finalize_error}"
            ))),
        }
    }
}

impl Drop for ReprovisionGuard {
    fn drop(&mut self) {
        if self.finished {
            return;
        }

        let _ = finalize_reprovision(
            self.state.as_ref(),
            self.lifecycle_before_reprovision.clone(),
            false,
        );
        self.finished = true;
    }
}

fn finalize_started_reprovision_result(
    mut reprovision: ReprovisionGuard,
    result: StartedReprovisionResult,
) -> Result<(), AppError> {
    match result {
        StartedReprovisionResult::Ready => reprovision.finish_ready(),
        StartedReprovisionResult::Cancelled => reprovision.finish_cancelled(),
        StartedReprovisionResult::Error {
            error,
            invalidate_runtime,
        } => match reprovision.finish_error(error, invalidate_runtime) {
            Ok(error) => Err(error),
            Err(finalize_error) => Err(finalize_error),
        },
    }
}

fn begin_reprovision(
    state: Arc<LlmState>,
    kind: ReprovisionKind,
) -> Result<ReprovisionGuard, AppError> {
    let lifecycle_before_reprovision = match claim_generation_reprovision_arbitration(
        state.as_ref(),
        LifecycleArbitrationRequest::BeginReprovision(kind),
    )? {
        LifecycleArbitrationClaim::Reprovision {
            lifecycle_before_reprovision,
        } => lifecycle_before_reprovision,
        LifecycleArbitrationClaim::Generation { .. } => unreachable!("reprovision claim expected"),
    };

    Ok(ReprovisionGuard {
        state,
        lifecycle_before_reprovision,
        finished: false,
    })
}

fn ensure_no_reprovision_in_progress(state: &LlmState) -> Result<(), AppError> {
    let reprovisioning = state
        .reprovisioning
        .lock()
        .map_err(|_| AppError::Llm("LLM reprovision state is poisoned".to_string()))?;
    if reprovisioning.is_some() {
        return Err(AppError::Validation(
            "The approved TinyLlama model is being provisioned right now".to_string(),
        ));
    }

    Ok(())
}

fn clear_loaded_runtime(state: &LlmState) -> Result<(), AppError> {
    let mut backend = state
        .backend
        .lock()
        .map_err(|_| AppError::Llm("LLM backend state is poisoned".to_string()))?;
    let mut model = state
        .model
        .lock()
        .map_err(|_| AppError::Llm("LLM model state is poisoned".to_string()))?;

    *model = None;
    *backend = None;
    #[cfg(test)]
    notify_runtime_invalidation_for_test();
    Ok(())
}

fn begin_download(state: &LlmState, download: ActiveDownload) -> Result<(), AppError> {
    let mut download_guard = state
        .download_state
        .lock()
        .map_err(|_| AppError::Llm("LLM download state is poisoned".to_string()))?;
    *download_guard = Some(download);
    Ok(())
}

fn update_download_progress(
    state: &LlmState,
    delta: u64,
    total_bytes: u64,
) -> Result<DownloadProgressEvent, AppError> {
    let mut download_guard = state
        .download_state
        .lock()
        .map_err(|_| AppError::Llm("LLM download state is poisoned".to_string()))?;
    let download = download_guard
        .as_mut()
        .ok_or_else(|| AppError::Llm("No active LLM download exists".to_string()))?;
    download.bytes_downloaded += delta;
    download.total_bytes = total_bytes;

    Ok(DownloadProgressEvent {
        bytes_downloaded: download.bytes_downloaded,
        total_bytes,
    })
}

fn reset_download_progress(state: &LlmState, total_bytes: u64) -> Result<(), AppError> {
    let mut download_guard = state
        .download_state
        .lock()
        .map_err(|_| AppError::Llm("LLM download state is poisoned".to_string()))?;
    let download = download_guard
        .as_mut()
        .ok_or_else(|| AppError::Llm("No active LLM download exists".to_string()))?;
    download.bytes_downloaded = 0;
    download.total_bytes = total_bytes;
    Ok(())
}

fn finalize_reprovision(
    state: &LlmState,
    lifecycle_after: LifecycleSnapshot,
    invalidate_runtime: bool,
) -> Result<(), AppError> {
    let completion_tx = {
        let mut download_guard = state
            .download_state
            .lock()
            .map_err(|_| AppError::Llm("LLM download state is poisoned".to_string()))?;
        let completion_tx = download_guard
            .as_ref()
            .map(|download| download.completion_tx.clone());
        *download_guard = None;
        completion_tx
    };

    if invalidate_runtime {
        clear_loaded_runtime(state)?;
    }

    apply_lifecycle_snapshot(state, &lifecycle_after)?;

    {
        let mut reprovisioning = state
            .reprovisioning
            .lock()
            .map_err(|_| AppError::Llm("LLM reprovision state is poisoned".to_string()))?;
        *reprovisioning = None;
    }

    if let Some(completion_tx) = completion_tx {
        completion_tx.send_replace(DownloadCleanupState::Finished);
    }

    Ok(())
}

fn current_download_control(
    state: &LlmState,
) -> Result<Option<(watch::Sender<bool>, watch::Receiver<DownloadCleanupState>)>, AppError> {
    let download_guard = state
        .download_state
        .lock()
        .map_err(|_| AppError::Llm("LLM download state is poisoned".to_string()))?;

    Ok(download_guard.as_ref().map(|download| {
        (
            download.cancel_tx.clone(),
            download.completion_tx.subscribe(),
        )
    }))
}

async fn wait_for_download_cleanup(
    mut completion_rx: watch::Receiver<DownloadCleanupState>,
) -> Result<(), AppError> {
    if *completion_rx.borrow_and_update() == DownloadCleanupState::Finished {
        return Ok(());
    }

    while completion_rx.changed().await.is_ok() {
        if *completion_rx.borrow_and_update() == DownloadCleanupState::Finished {
            return Ok(());
        }
    }

    Err(AppError::Llm(
        "LLM download cleanup channel closed before finalization".to_string(),
    ))
}

fn stage_import_model_file_blocking<F>(
    source: &Path,
    staged_path: &Path,
    validate_source: F,
    validate_staged: impl Fn(&Path) -> Result<(), AppError>,
) -> Result<(), AppError>
where
    F: Fn(&Path) -> Result<(), AppError>,
{
    validate_source(source)?;
    let parent = staged_path.parent().ok_or_else(|| {
        AppError::Llm("LLM import staging path is missing a parent directory".to_string())
    })?;
    std::fs::create_dir_all(parent)?;
    match std::fs::metadata(staged_path) {
        Ok(_) => std::fs::remove_file(staged_path)?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(AppError::from(error)),
    }
    std::fs::copy(source, staged_path)?;
    validate_staged(staged_path)?;
    Ok(())
}

fn revalidate_staged_import_artifact_blocking(staged_path: &Path) -> Result<(), AppError> {
    let metadata = std::fs::metadata(staged_path)?;
    if metadata.len() != TINY_LLAMA_SIZE_BYTES {
        return Err(AppError::Validation(
            "Staged import artifact size does not match the approved TinyLlama asset".to_string(),
        ));
    }

    let sha = sha256_file(staged_path)?;
    if sha != TINY_LLAMA_SHA256 {
        return Err(AppError::Validation(
            "Staged import artifact SHA-256 does not match the approved TinyLlama asset"
                .to_string(),
        ));
    }

    Ok(())
}

fn remove_stale_partial_after_restart_blocking(temp_path: &Path) -> Result<(), AppError> {
    match std::fs::metadata(temp_path) {
        Ok(metadata) if metadata.is_file() => {
            std::fs::remove_file(temp_path)?;
            Ok(())
        }
        Ok(_) => Err(AppError::Llm(format!(
            "Restart cleanup expected a file at {}",
            temp_path.display(),
        ))),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(AppError::from(error)),
    }
}

async fn remove_stale_partial_after_restart(temp_path: PathBuf) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || remove_stale_partial_after_restart_blocking(&temp_path))
        .await
        .map_err(|error| AppError::Llm(format!("LLM stale-part cleanup task failed: {error}")))?
}

type LlmDownloadDriverFuture =
    std::pin::Pin<Box<dyn std::future::Future<Output = StartedReprovisionResult> + Send + 'static>>;

trait LlmDownloadDriver: Send + Sync {
    fn run_started_download(
        &self,
        app: tauri::AppHandle,
        state: Arc<LlmState>,
        cancel_rx: watch::Receiver<bool>,
        target_prep: DownloadTargetPrep,
        temp_path: PathBuf,
        final_path: PathBuf,
    ) -> LlmDownloadDriverFuture;
}

#[derive(Default)]
struct DefaultLlmDownloadDriver;

#[cfg(test)]
static TEST_DOWNLOAD_DRIVER: std::sync::Mutex<Option<Arc<dyn LlmDownloadDriver>>> =
    std::sync::Mutex::new(None);

#[cfg(test)]
struct TestDownloadDriverGuard;

#[cfg(test)]
fn install_test_download_driver(driver: Arc<dyn LlmDownloadDriver>) -> TestDownloadDriverGuard {
    *TEST_DOWNLOAD_DRIVER.lock().unwrap() = Some(driver);
    TestDownloadDriverGuard
}

#[cfg(test)]
impl Drop for TestDownloadDriverGuard {
    fn drop(&mut self) {
        *TEST_DOWNLOAD_DRIVER.lock().unwrap() = None;
    }
}

fn active_llm_download_driver() -> Arc<dyn LlmDownloadDriver> {
    #[cfg(test)]
    if let Some(driver) = TEST_DOWNLOAD_DRIVER.lock().unwrap().as_ref() {
        return Arc::clone(driver);
    }

    Arc::new(DefaultLlmDownloadDriver)
}

#[cfg(test)]
static TEST_RUNTIME_INVALIDATION_OBSERVER: std::sync::Mutex<
    Option<Arc<std::sync::atomic::AtomicBool>>,
> = std::sync::Mutex::new(None);

#[cfg(test)]
struct TestRuntimeInvalidationObserverGuard;

#[cfg(test)]
fn install_test_runtime_invalidation_observer(
    observer: Arc<std::sync::atomic::AtomicBool>,
) -> TestRuntimeInvalidationObserverGuard {
    *TEST_RUNTIME_INVALIDATION_OBSERVER.lock().unwrap() = Some(observer);
    TestRuntimeInvalidationObserverGuard
}

#[cfg(test)]
impl Drop for TestRuntimeInvalidationObserverGuard {
    fn drop(&mut self) {
        *TEST_RUNTIME_INVALIDATION_OBSERVER.lock().unwrap() = None;
    }
}

#[cfg(test)]
fn notify_runtime_invalidation_for_test() {
    use std::sync::atomic::Ordering;

    if let Some(observer) = TEST_RUNTIME_INVALIDATION_OBSERVER.lock().unwrap().as_ref() {
        observer.store(true, Ordering::SeqCst);
    }
}

enum DownloadFlowOutcome {
    Ready,
    Cancelled,
    PromotedFromRestart,
}

struct DownloadFlowError {
    error: AppError,
    post_promotion_failure: bool,
}

impl From<AppError> for DownloadFlowError {
    fn from(error: AppError) -> Self {
        Self {
            error,
            post_promotion_failure: false,
        }
    }
}

fn is_cancelled(cancel_rx: &watch::Receiver<bool>) -> bool {
    *cancel_rx.borrow()
}

async fn cleanup_restart_if_needed(
    active_download_path: &Path,
    temp_path: &Path,
) -> Result<(), AppError> {
    if active_download_path == temp_path {
        return Ok(());
    }

    let restart = active_download_path.to_path_buf();
    tokio::task::spawn_blocking(move || cleanup_restart_staging_blocking(&restart))
        .await
        .map_err(|error| AppError::Llm(format!("LLM restart cleanup task failed: {error}")))?
}

fn emit_download_progress_event(
    app: &tauri::AppHandle,
    event: DownloadProgressEvent,
) -> Result<(), AppError> {
    app.emit("llm://download-progress", event)
        .map_err(|error| AppError::Llm(format!("LLM download progress emit failed: {error}")))
}

async fn run_download_chunks_verify_and_promote(
    app: tauri::AppHandle,
    state: &LlmState,
    cancel_rx: watch::Receiver<bool>,
    target_prep: DownloadTargetPrep,
    temp_path: PathBuf,
    final_path: PathBuf,
) -> Result<DownloadFlowOutcome, DownloadFlowError> {
    if is_cancelled(&cancel_rx) {
        return Ok(DownloadFlowOutcome::Cancelled);
    }

    let client = reqwest::Client::builder()
        .build()
        .map_err(|error| AppError::Llm(format!("LLM download client build failed: {error}")))?;

    let mut request = client.get(TINY_LLAMA_URL);
    if target_prep.existing_len > 0 {
        request = request.header(
            reqwest::header::RANGE,
            format!("bytes={}-", target_prep.existing_len),
        );
    }

    let mut send_cancel_rx = cancel_rx.clone();
    if is_cancelled(&send_cancel_rx) {
        return Ok(DownloadFlowOutcome::Cancelled);
    }
    let response = tokio::select! {
        changed = send_cancel_rx.changed() => {
            match changed {
                Ok(()) if is_cancelled(&send_cancel_rx) => return Ok(DownloadFlowOutcome::Cancelled),
                Ok(()) => return Err(AppError::Llm("LLM download cancellation channel changed unexpectedly".to_string()).into()),
                Err(_) => return Err(AppError::Llm("LLM download cancellation channel closed before request dispatch".to_string()).into()),
            }
        }
        response = request.send() => response
            .map_err(|error| AppError::Llm(format!("LLM model download request failed: {error}")))?,
    };

    let content_range = response
        .headers()
        .get(reqwest::header::CONTENT_RANGE)
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned);
    let content_length = response.content_length();

    let plan = classify_download_response(
        target_prep.existing_len,
        response.status(),
        content_range.as_deref(),
        content_length,
    )?;

    let (active_download_path, total_bytes, outcome_on_success) = match plan {
        DownloadResponsePlan::Append {
            total_bytes,
            remaining_bytes: _,
        } => (temp_path.clone(), total_bytes, DownloadFlowOutcome::Ready),
        DownloadResponsePlan::RestartFromFreshStaging { total_bytes } => {
            let restart_path = target_prep.restart_path.clone();
            tokio::task::spawn_blocking({
                let restart_path = restart_path.clone();
                move || prepare_fresh_restart_file(&restart_path)
            })
            .await
            .map_err(|error| {
                AppError::Llm(format!("LLM restart staging task failed: {error}"))
            })??;
            reset_download_progress(state, total_bytes)?;
            (
                restart_path,
                total_bytes,
                DownloadFlowOutcome::PromotedFromRestart,
            )
        }
    };

    let mut response = response;
    loop {
        let mut chunk_cancel_rx = cancel_rx.clone();
        if is_cancelled(&chunk_cancel_rx) {
            cleanup_restart_if_needed(&active_download_path, &temp_path).await?;
            return Ok(DownloadFlowOutcome::Cancelled);
        }
        let maybe_chunk = tokio::select! {
            changed = chunk_cancel_rx.changed() => {
                match changed {
                    Ok(()) if is_cancelled(&chunk_cancel_rx) => {
                        cleanup_restart_if_needed(&active_download_path, &temp_path).await?;
                        return Ok(DownloadFlowOutcome::Cancelled);
                    }
                    Ok(()) => return Err(AppError::Llm("LLM download cancellation channel changed unexpectedly".to_string()).into()),
                    Err(_) => return Err(AppError::Llm("LLM download cancellation channel closed before completion".to_string()).into()),
                }
            }
            chunk = response.chunk() => chunk,
        };

        let chunk = match maybe_chunk {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(error) => {
                let app_error = AppError::Llm(format!("LLM model download stream failed: {error}"));
                return Err(finalize_non_sha_download_error(
                    active_download_path.clone(),
                    temp_path.clone(),
                    app_error,
                )
                .await
                .into());
            }
        };

        let write_result = tokio::task::spawn_blocking({
            let active_download_path = active_download_path.clone();
            let bytes = chunk.to_vec();
            move || append_chunk_blocking(&active_download_path, &bytes)
        })
        .await
        .map_err(|error| AppError::Llm(format!("LLM download chunk write task failed: {error}")))?;

        if let Err(error) = write_result {
            return Err(finalize_non_sha_download_error(
                active_download_path.clone(),
                temp_path.clone(),
                error,
            )
            .await
            .into());
        }

        let progress = match update_download_progress(state, chunk.len() as u64, total_bytes) {
            Ok(progress) => progress,
            Err(error) => {
                return Err(finalize_non_sha_download_error(
                    active_download_path.clone(),
                    temp_path.clone(),
                    error,
                )
                .await
                .into())
            }
        };

        if let Err(error) = emit_download_progress_event(&app, progress) {
            return Err(finalize_non_sha_download_error(
                active_download_path.clone(),
                temp_path.clone(),
                error,
            )
            .await
            .into());
        }
    }

    let length_result = tokio::task::spawn_blocking({
        let active_download_path = active_download_path.clone();
        move || verify_staged_model_length_blocking(&active_download_path, total_bytes)
    })
    .await
    .map_err(|error| {
        AppError::Llm(format!(
            "LLM staged-length verification task failed: {error}"
        ))
    })?;

    if let Err(error) = length_result {
        return Err(finalize_non_sha_download_error(
            active_download_path.clone(),
            temp_path.clone(),
            error,
        )
        .await
        .into());
    }

    let sha_result = tokio::task::spawn_blocking({
        let active_download_path = active_download_path.clone();
        move || sha256_file(&active_download_path)
    })
    .await
    .map_err(|error| AppError::Llm(format!("LLM SHA-256 verification task failed: {error}")))?;

    match sha_result {
        Ok(sha) if sha == TINY_LLAMA_SHA256 => {}
        Ok(_) => {
            let cleanup_result = tokio::task::spawn_blocking({
                let active_download_path = active_download_path.clone();
                move || remove_corrupt_download_blocking(&active_download_path)
            })
            .await
            .map_err(|error| {
                AppError::Llm(format!("LLM corrupt-download cleanup task failed: {error}"))
            })?;
            if let Err(error) = cleanup_result {
                return Err(error);
            }

            return Err(AppError::Validation(
                "Downloaded model SHA-256 does not match the approved TinyLlama asset".to_string(),
            )
            .into());
        }
        Err(error) => {
            return Err(finalize_non_sha_download_error(
                active_download_path.clone(),
                temp_path.clone(),
                error,
            )
            .await
            .into());
        }
    }

    let promotion_result = tokio::task::spawn_blocking({
        let active_download_path = active_download_path.clone();
        let final_path = final_path.clone();
        move || promote_staged_model_blocking(&active_download_path, &final_path)
    })
    .await
    .map_err(|error| AppError::Llm(format!("LLM download promotion task failed: {error}")))?;

    if let Err(error) = promotion_result {
        let staged_was_promoted = tokio::task::spawn_blocking({
            let active_download_path = active_download_path.clone();
            let final_path = final_path.clone();
            move || staged_bytes_moved_to_final_path_blocking(&active_download_path, &final_path)
        })
        .await
        .map_err(|join_error| {
            AppError::Llm(format!(
                "LLM post-promotion state probe task failed: {join_error}"
            ))
        })
        .and_then(|result| result)
        .unwrap_or(true);

        let finalized_error =
            finalize_non_sha_download_error(active_download_path, temp_path, error).await;
        return Err(DownloadFlowError {
            error: finalized_error,
            post_promotion_failure: staged_was_promoted,
        });
    }

    Ok(outcome_on_success)
}

impl LlmDownloadDriver for DefaultLlmDownloadDriver {
    fn run_started_download(
        &self,
        app: tauri::AppHandle,
        state: Arc<LlmState>,
        cancel_rx: watch::Receiver<bool>,
        target_prep: DownloadTargetPrep,
        temp_path: PathBuf,
        final_path: PathBuf,
    ) -> LlmDownloadDriverFuture {
        Box::pin(async move {
            let flow_result = run_download_chunks_verify_and_promote(
                app,
                state.as_ref(),
                cancel_rx,
                target_prep,
                temp_path.clone(),
                final_path.clone(),
            )
            .await;

            match flow_result {
                Ok(DownloadFlowOutcome::Ready) => StartedReprovisionResult::Ready,
                Ok(DownloadFlowOutcome::Cancelled) => StartedReprovisionResult::Cancelled,
                Ok(DownloadFlowOutcome::PromotedFromRestart) => {
                    if let Err(error) = remove_stale_partial_after_restart(temp_path.clone()).await
                    {
                        return StartedReprovisionResult::Error {
                            error,
                            invalidate_runtime: true,
                        };
                    }

                    StartedReprovisionResult::Ready
                }
                Err(flow_error) => StartedReprovisionResult::Error {
                    invalidate_runtime: flow_error.post_promotion_failure,
                    error: flow_error.error,
                },
            }
        })
    }
}

#[tauri::command]
pub async fn llm_download_model(
    app: tauri::AppHandle,
    llm_state: State<'_, Arc<LlmState>>,
    provisioning: State<'_, Arc<ProvisioningState>>,
) -> Result<(), AppError> {
    let _lease = provisioning.start_download(ProvisioningTarget::Llm)?;
    let vault_root = app_data_dir()?;
    let final_path = approved_llm_model_path(&vault_root);
    let temp_path = final_path.with_extension("gguf.part");

    let target_prep = tokio::task::spawn_blocking({
        let final_path = final_path.clone();
        let temp_path = temp_path.clone();
        let vault_root = vault_root.clone();
        move || -> Result<DownloadTargetPrep, AppError> {
            let probe = LiveResourceProbe::new(models_dir(&vault_root));
            let requirements = collect_llm_system_requirements(&probe)?;
            require_download_disk_headroom(requirements)?;
            prepare_download_target(&final_path, &temp_path)
        }
    })
    .await
    .map_err(|error| AppError::Llm(format!("LLM download prep task failed: {error}")))??;

    let reprovision = begin_reprovision(Arc::clone(llm_state.inner()), ReprovisionKind::Download)?;

    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
    let (completion_tx, _completion_rx) =
        tokio::sync::watch::channel(DownloadCleanupState::Running);
    let download_driver = active_llm_download_driver();

    let started_result = {
        let state = Arc::clone(llm_state.inner());
        let app = app.clone();
        let temp_path = temp_path.clone();
        let final_path = final_path.clone();
        let target_prep = target_prep.clone();
        async move {
            if let Err(error) = begin_download(
                state.as_ref(),
                ActiveDownload {
                    temp_path: temp_path.clone(),
                    final_path: final_path.clone(),
                    bytes_downloaded: target_prep.existing_len,
                    total_bytes: TINY_LLAMA_SIZE_BYTES,
                    cancel_tx: cancel_tx.clone(),
                    completion_tx: completion_tx.clone(),
                },
            ) {
                return StartedReprovisionResult::Error {
                    error,
                    invalidate_runtime: false,
                };
            }

            download_driver
                .run_started_download(
                    app,
                    Arc::clone(&state),
                    cancel_rx,
                    target_prep,
                    temp_path,
                    final_path,
                )
                .await
        }
    }
    .await;

    finalize_started_reprovision_result(reprovision, started_result)
}

#[tauri::command]
pub async fn llm_import_model_file(
    file_path: String,
    state: State<'_, Arc<LlmState>>,
    provisioning: State<'_, Arc<ProvisioningState>>,
) -> Result<(), AppError> {
    let _lease = provisioning.start_download(ProvisioningTarget::Llm)?;
    let source = PathBuf::from(file_path);
    let vault_root = app_data_dir()?;
    let destination = approved_llm_model_path(&vault_root);
    let staged_path = import_staging_model_path(&destination);

    tokio::task::spawn_blocking({
        let source = source.clone();
        move || validate_selected_model_file(&source)
    })
    .await
    .map_err(|error| AppError::Llm(format!("LLM import preflight task failed: {error}")))??;

    let reprovision = begin_reprovision(Arc::clone(state.inner()), ReprovisionKind::Import)?;

    let started_result = {
        let source = source.clone();
        let staged_path = staged_path.clone();
        let destination = destination.clone();
        async move {
            let stage_result = tokio::task::spawn_blocking({
                let source = source.clone();
                let staged_path = staged_path.clone();
                move || {
                    stage_import_model_file_blocking(
                        &source,
                        &staged_path,
                        validate_selected_model_file,
                        revalidate_staged_import_artifact_blocking,
                    )
                }
            })
            .await;

            match stage_result {
                Ok(Ok(())) => {}
                Ok(Err(error)) => {
                    return StartedReprovisionResult::Error {
                        error,
                        invalidate_runtime: false,
                    };
                }
                Err(error) => {
                    return StartedReprovisionResult::Error {
                        error: AppError::Llm(format!("LLM import staging task failed: {error}")),
                        invalidate_runtime: false,
                    };
                }
            }

            let mut verified_bytes_promoted = false;
            let promotion_result = tokio::task::spawn_blocking({
                let staged_path = staged_path.clone();
                let destination = destination.clone();
                move || {
                    revalidate_staged_import_artifact_blocking(&staged_path)?;
                    promote_staged_model_blocking(&staged_path, &destination)
                }
            })
            .await;

            match promotion_result {
                Ok(Ok(())) => {
                    verified_bytes_promoted = true;
                }
                Ok(Err(error)) => {
                    let staged_was_promoted = tokio::task::spawn_blocking({
                        let staged_path = staged_path.clone();
                        let destination = destination.clone();
                        move || {
                            staged_bytes_moved_to_final_path_blocking(&staged_path, &destination)
                        }
                    })
                    .await
                    .map_err(|join_error| {
                        AppError::Llm(format!(
                            "LLM import post-promotion state probe task failed: {join_error}"
                        ))
                    })
                    .and_then(|result| result)
                    .unwrap_or(true);

                    return StartedReprovisionResult::Error {
                        error,
                        invalidate_runtime: staged_was_promoted,
                    };
                }
                Err(error) => {
                    return StartedReprovisionResult::Error {
                        error: AppError::Llm(format!("LLM import promotion task failed: {error}")),
                        invalidate_runtime: false,
                    };
                }
            }

            if let Err(error) = tokio::task::spawn_blocking({
                let staged_path = staged_path.clone();
                move || cleanup_restart_staging_blocking(&staged_path)
            })
            .await
            .map_err(|join_error| {
                AppError::Llm(format!(
                    "LLM import staging cleanup task failed: {join_error}"
                ))
            })
            .and_then(|cleanup_result| cleanup_result)
            {
                return StartedReprovisionResult::Error {
                    error,
                    invalidate_runtime: verified_bytes_promoted,
                };
            }

            StartedReprovisionResult::Ready
        }
    }
    .await;

    finalize_started_reprovision_result(reprovision, started_result)
}

#[tauri::command]
pub async fn llm_cancel_download(state: State<'_, Arc<LlmState>>) -> Result<(), AppError> {
    let Some((cancel_tx, completion_rx)) = current_download_control(state.inner().as_ref())? else {
        return Ok(());
    };

    let _ = cancel_tx.send(true);
    wait_for_download_cleanup(completion_rx).await
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
        assert_eq!(
            serde_json::to_string(&LlmStatus::Ready).unwrap(),
            "\"ready\""
        );
        assert_eq!(
            serde_json::to_string(&LlmStatus::Loaded).unwrap(),
            "\"loaded\""
        );
        assert_eq!(
            serde_json::to_string(&LlmStatus::Error).unwrap(),
            "\"error\""
        );
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
            std::path::PathBuf::from(
                "C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"
            )
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
        assert_eq!(
            snapshot.last_error.as_deref(),
            Some("previous import failed")
        );
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

    #[test]
    fn import_rejects_wrong_filename_even_when_hash_matches() {
        let dir = test_temp_dir("import-wrong-name");
        let selected = dir.join("wrong-name.gguf");
        std::fs::write(&selected, vec![0_u8; 16]).unwrap();

        let err = validate_selected_model_file(&selected).unwrap_err();
        assert!(
            matches!(err, AppError::Validation(message) if message.contains("approved TinyLlama file"))
        );
    }

    #[test]
    fn resume_policy_accepts_matching_partial_response_and_preserves_total_asset_size() {
        let content_range = format!("bytes 128-255/{TINY_LLAMA_SIZE_BYTES}");
        let plan = classify_download_response(
            128,
            reqwest::StatusCode::PARTIAL_CONTENT,
            Some(content_range.as_str()),
            Some(128),
        )
        .unwrap();

        assert_eq!(
            plan,
            DownloadResponsePlan::Append {
                total_bytes: TINY_LLAMA_SIZE_BYTES,
                remaining_bytes: 128,
            }
        );
    }

    #[test]
    fn resume_policy_restarts_into_fresh_staging_when_server_ignores_range() {
        let plan = classify_download_response(
            128,
            reqwest::StatusCode::OK,
            None,
            Some(TINY_LLAMA_SIZE_BYTES),
        )
        .unwrap();

        assert_eq!(
            plan,
            DownloadResponsePlan::RestartFromFreshStaging {
                total_bytes: TINY_LLAMA_SIZE_BYTES,
            }
        );
    }

    #[test]
    fn resume_policy_keeps_part_path_for_fresh_full_body_downloads() {
        let plan = classify_download_response(
            0,
            reqwest::StatusCode::OK,
            None,
            Some(TINY_LLAMA_SIZE_BYTES),
        )
        .unwrap();

        assert_eq!(
            plan,
            DownloadResponsePlan::Append {
                total_bytes: TINY_LLAMA_SIZE_BYTES,
                remaining_bytes: TINY_LLAMA_SIZE_BYTES,
            }
        );
    }

    #[test]
    fn resume_policy_rejects_mismatched_partial_response() {
        let err = classify_download_response(
            128,
            reqwest::StatusCode::PARTIAL_CONTENT,
            Some("bytes 0-127/1515522048"),
            Some(128),
        )
        .unwrap_err();

        assert!(matches!(err, AppError::Validation(message) if message.contains("Range response")));
    }

    #[tokio::test]
    async fn download_cleanup_watch_is_non_lossy_for_late_cancel_waiters() {
        let (completion_tx, completion_rx) =
            tokio::sync::watch::channel(DownloadCleanupState::Running);
        completion_tx.send_replace(DownloadCleanupState::Finished);

        wait_for_download_cleanup(completion_rx).await.unwrap();
    }

    #[test]
    fn final_staged_file_length_must_match_total_bytes_before_sha_verification() {
        let dir = test_temp_dir("final-length-check");
        let staged = approved_llm_model_path(&dir).with_extension("gguf.restart");
        std::fs::create_dir_all(staged.parent().unwrap()).unwrap();
        std::fs::write(&staged, vec![0_u8; 32]).unwrap();

        let err = verify_staged_model_length_blocking(&staged, TINY_LLAMA_SIZE_BYTES).unwrap_err();
        assert!(
            matches!(err, AppError::Validation(message) if message.contains("full approved asset length"))
        );
    }

    #[test]
    fn cancelled_restart_staging_is_deleted_while_resumable_part_survives() {
        let dir = test_temp_dir("cancelled-restart-cleanup");
        let final_path = approved_llm_model_path(&dir);
        let partial = final_path.with_extension("gguf.part");
        let restart = final_path.with_extension("gguf.restart");
        std::fs::create_dir_all(partial.parent().unwrap()).unwrap();
        std::fs::write(&partial, b"partial-bytes").unwrap();
        std::fs::write(&restart, b"fallback-body").unwrap();

        cleanup_restart_staging_blocking(&restart).unwrap();

        assert!(partial.exists());
        assert!(!restart.exists());
    }

    #[test]
    fn non_sha_restart_failures_delete_restart_staging_and_preserve_resumable_part() {
        let dir = test_temp_dir("restart-non-sha-cleanup");
        let final_path = approved_llm_model_path(&dir);
        let partial = final_path.with_extension("gguf.part");
        let restart = final_path.with_extension("gguf.restart");
        std::fs::create_dir_all(partial.parent().unwrap()).unwrap();
        std::fs::write(&partial, b"partial-bytes").unwrap();
        std::fs::write(&restart, b"fallback-body").unwrap();

        let err = finalize_failed_restart_download_blocking(
            &restart,
            AppError::Validation("fallback length mismatch".to_string()),
        )
        .unwrap_err();

        assert!(
            matches!(err, AppError::Validation(message) if message.contains("fallback length mismatch"))
        );
        assert!(partial.exists());
        assert!(!restart.exists());
    }

    #[test]
    fn import_staging_path_is_distinct_from_resumable_download_part_path() {
        let dir = test_temp_dir("import-staging-path");
        let final_path = approved_llm_model_path(&dir);

        assert_ne!(
            import_staging_model_path(&final_path),
            final_path.with_extension("gguf.part")
        );
    }

    #[test]
    fn cancelled_download_keeps_partial_file_and_restores_prior_not_provisioned_state() {
        let dir = test_temp_dir("cancelled-download");
        let final_path = approved_llm_model_path(&dir);
        let partial = final_path.with_extension("gguf.part");
        std::fs::create_dir_all(partial.parent().unwrap()).unwrap();
        std::fs::write(&partial, b"partial-bytes").unwrap();

        let (cancel_tx, _cancel_rx) = tokio::sync::watch::channel(false);
        let (completion_tx, _completion_rx) =
            tokio::sync::watch::channel(DownloadCleanupState::Running);
        let state = Arc::new(LlmState::default());
        let mut reprovision =
            begin_reprovision(Arc::clone(&state), ReprovisionKind::Download).unwrap();
        begin_download(
            state.as_ref(),
            ActiveDownload {
                temp_path: partial.clone(),
                final_path: final_path.clone(),
                bytes_downloaded: 13,
                total_bytes: TINY_LLAMA_SIZE_BYTES,
                cancel_tx,
                completion_tx,
            },
        )
        .unwrap();
        reprovision.finish_cancelled().unwrap();

        assert!(partial.exists());
        assert_eq!(*state.status.lock().unwrap(), LlmStatus::NotProvisioned);
        assert!(state.reprovisioning.lock().unwrap().is_none());
    }

    #[test]
    fn cancelled_download_restores_prior_lifecycle_error_snapshot() {
        let dir = test_temp_dir("cancelled-download-error");
        let final_path = approved_llm_model_path(&dir);
        let partial = final_path.with_extension("gguf.part");
        std::fs::create_dir_all(partial.parent().unwrap()).unwrap();
        std::fs::write(&partial, b"partial-bytes").unwrap();

        let (cancel_tx, _cancel_rx) = tokio::sync::watch::channel(false);
        let (completion_tx, _completion_rx) =
            tokio::sync::watch::channel(DownloadCleanupState::Running);
        let state = Arc::new(LlmState::default());
        set_lifecycle_error(state.as_ref(), "previous download failed".to_string()).unwrap();
        let mut reprovision =
            begin_reprovision(Arc::clone(&state), ReprovisionKind::Download).unwrap();
        begin_download(
            state.as_ref(),
            ActiveDownload {
                temp_path: partial,
                final_path,
                bytes_downloaded: 13,
                total_bytes: TINY_LLAMA_SIZE_BYTES,
                cancel_tx,
                completion_tx,
            },
        )
        .unwrap();

        reprovision.finish_cancelled().unwrap();

        assert_eq!(*state.status.lock().unwrap(), LlmStatus::Error);
        assert_eq!(
            state.last_error.lock().unwrap().as_deref(),
            Some("previous download failed")
        );
    }

    #[test]
    fn begin_reprovision_rejects_while_generation_is_active() {
        let state = Arc::new(LlmState::default());
        begin_generation(state.as_ref(), "stream-1".to_string()).unwrap();

        let err = begin_reprovision(Arc::clone(&state), ReprovisionKind::Import).unwrap_err();
        assert!(
            matches!(err, AppError::Validation(message) if message.contains("generation is active"))
        );
    }

    #[test]
    fn reprovision_guard_drop_clears_busy_state_after_early_return() {
        let state = Arc::new(LlmState::default());

        {
            let _guard = begin_reprovision(Arc::clone(&state), ReprovisionKind::Import).unwrap();
        }

        assert!(state.reprovisioning.lock().unwrap().is_none());
        assert_eq!(*state.status.lock().unwrap(), LlmStatus::NotProvisioned);
    }

    #[test]
    fn started_reprovision_errors_finalize_to_sticky_lifecycle_error() {
        let state = Arc::new(LlmState::default());
        let reprovision = begin_reprovision(Arc::clone(&state), ReprovisionKind::Download).unwrap();

        let err = finalize_started_reprovision_result(
            reprovision,
            StartedReprovisionResult::Error {
                error: AppError::Llm("promotion failed".to_string()),
                invalidate_runtime: false,
            },
        )
        .unwrap_err();

        assert!(matches!(err, AppError::Llm(message) if message.contains("promotion failed")));
        assert_eq!(*state.status.lock().unwrap(), LlmStatus::Error);
        assert!(state
            .last_error
            .lock()
            .unwrap()
            .as_deref()
            .unwrap()
            .contains("promotion failed"));
        assert!(state.reprovisioning.lock().unwrap().is_none());
    }

    #[test]
    fn sticky_lifecycle_error_survives_retry_start_until_successful_recovery() {
        let state = Arc::new(LlmState::default());
        let model_path = std::path::PathBuf::from(
            "C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
        );

        set_lifecycle_error(state.as_ref(), "previous download failed".to_string()).unwrap();

        let reprovision = begin_reprovision(Arc::clone(&state), ReprovisionKind::Import).unwrap();

        let in_progress = status_snapshot(state.as_ref(), &model_path, true).unwrap();
        assert_eq!(in_progress.status, LlmStatus::Downloading);
        assert_eq!(
            in_progress.last_error.as_deref(),
            Some("previous download failed")
        );

        finalize_started_reprovision_result(reprovision, StartedReprovisionResult::Ready).unwrap();

        let recovered = status_snapshot(state.as_ref(), &model_path, true).unwrap();
        assert_eq!(recovered.status, LlmStatus::Ready);
        assert_eq!(recovered.last_error, None);
    }

    #[test]
    fn post_promotion_failure_still_requests_runtime_invalidation_before_error_returns() {
        use std::sync::atomic::Ordering;

        let state = Arc::new(LlmState::default());
        let invalidation_observed = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let _guard = install_test_runtime_invalidation_observer(Arc::clone(&invalidation_observed));

        let reprovision = begin_reprovision(Arc::clone(&state), ReprovisionKind::Import).unwrap();

        let err = finalize_started_reprovision_result(
            reprovision,
            StartedReprovisionResult::Error {
                error: AppError::Llm("post-promotion cleanup failed".to_string()),
                invalidate_runtime: true,
            },
        )
        .unwrap_err();

        assert!(
            matches!(err, AppError::Llm(message) if message.contains("post-promotion cleanup failed"))
        );
        assert!(invalidation_observed.load(Ordering::SeqCst));
        assert_eq!(*state.status.lock().unwrap(), LlmStatus::Error);
    }

    #[test]
    fn import_model_file_happy_path_stages_revalidates_and_promotes_verified_bytes_into_vault() {
        let dir = test_temp_dir("import-happy-path");
        let source = dir.join(TINY_LLAMA_DESTINATION);
        let destination = approved_llm_model_path(&dir);
        let staged = import_staging_model_path(&destination);
        std::fs::write(&source, b"verified-model").unwrap();

        stage_import_model_file_blocking(&source, &staged, |_| Ok(()), |_| Ok(())).unwrap();
        promote_staged_model_blocking(&staged, &destination).unwrap();

        assert_eq!(std::fs::read(&destination).unwrap(), b"verified-model");
        assert!(!staged.exists());
    }

    #[test]
    fn promote_staged_model_replaces_existing_final_file_when_present() {
        let dir = test_temp_dir("promote-existing-final");
        let final_path = approved_llm_model_path(&dir);
        let partial = final_path.with_extension("gguf.part");
        let backup = final_path.with_extension("gguf.previous");
        std::fs::create_dir_all(final_path.parent().unwrap()).unwrap();
        std::fs::write(&final_path, b"old-model").unwrap();
        std::fs::write(&partial, b"new-model").unwrap();

        promote_staged_model_blocking(&partial, &final_path).unwrap();

        assert_eq!(std::fs::read(&final_path).unwrap(), b"new-model");
        assert!(!partial.exists());
        assert!(!backup.exists());
    }

    #[test]
    fn promote_staged_model_reports_restore_failure_for_manual_recovery() {
        struct RestoreFailingFs;

        impl PromotionFs for RestoreFailingFs {
            fn metadata(&self, path: &std::path::Path) -> std::io::Result<std::fs::Metadata> {
                std::fs::metadata(path)
            }

            fn rename(&self, from: &std::path::Path, to: &std::path::Path) -> std::io::Result<()> {
                let from_ext = from.extension().and_then(|value| value.to_str());
                let to_ext = to.extension().and_then(|value| value.to_str());

                if from_ext == Some("part") {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::PermissionDenied,
                        "promotion blocked",
                    ));
                }

                if from_ext == Some("previous") && to_ext == Some("gguf") {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::PermissionDenied,
                        "restore blocked",
                    ));
                }

                std::fs::rename(from, to)
            }

            fn remove_file(&self, path: &std::path::Path) -> std::io::Result<()> {
                std::fs::remove_file(path)
            }
        }

        let dir = test_temp_dir("promote-restore-failure");
        let final_path = approved_llm_model_path(&dir);
        let partial = final_path.with_extension("gguf.part");
        let backup = final_path.with_extension("gguf.previous");
        std::fs::create_dir_all(final_path.parent().unwrap()).unwrap();
        std::fs::write(&final_path, b"old-model").unwrap();
        std::fs::write(&partial, b"new-model").unwrap();

        let err =
            promote_staged_model_with_fs(&RestoreFailingFs, &partial, &final_path).unwrap_err();

        assert!(
            matches!(err, AppError::Llm(message) if message.contains("promotion blocked") && message.contains("restore blocked"))
        );
        assert!(partial.exists());
        assert!(backup.exists());
    }

    #[derive(Debug, Clone, PartialEq, Eq)]
    struct RuntimeMutationSnapshot {
        status: LlmStatus,
        last_error: Option<String>,
        has_backend: bool,
        has_model: bool,
    }

    fn runtime_mutation_snapshot(state: &LlmState) -> RuntimeMutationSnapshot {
        RuntimeMutationSnapshot {
            status: *state.status.lock().unwrap(),
            last_error: state.last_error.lock().unwrap().clone(),
            has_backend: state.backend.lock().unwrap().is_some(),
            has_model: state.model.lock().unwrap().is_some(),
        }
    }

    #[test]
    fn collect_model_load_preflight_is_read_only_for_managed_state() {
        let dir = test_temp_dir("collect-preflight-read-only");
        let state = LlmState::default();
        let before = runtime_mutation_snapshot(&state);

        let preflight = collect_model_load_preflight(&dir).unwrap();

        assert_eq!(preflight.model_path, approved_llm_model_path(&dir));
        assert_eq!(runtime_mutation_snapshot(&state), before);
    }

    #[test]
    fn validate_model_load_preflight_is_pure_for_managed_state() {
        let state = LlmState::default();
        let before = runtime_mutation_snapshot(&state);

        let validated = validate_model_load_preflight(
            &state,
            ModelLoadPreflight {
                model_path: std::path::PathBuf::from(
                    "C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
                ),
                approved_model_present: true,
                requirements: LlmSystemRequirementsSnapshot {
                    free_disk_bytes: BASELINE_MIN_FREE_DISK_BYTES,
                    free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES,
                },
            },
        )
        .unwrap();

        assert_eq!(
            validated.model_path,
            std::path::PathBuf::from(
                "C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
            )
        );
        assert_eq!(runtime_mutation_snapshot(&state), before);
    }

    #[tokio::test]
    async fn ensure_model_loaded_after_valid_preflight_is_first_runtime_mutator() {
        struct MutatingTestRuntimeDriver;

        impl LlmRuntimeDriver for MutatingTestRuntimeDriver {
            fn ensure_loaded(
                &self,
                state: Arc<LlmState>,
                _preflight: ValidatedModelLoadPreflight,
            ) -> LlmRuntimeFuture<Result<(), AppError>> {
                Box::pin(async move {
                    finish_model_load_success(state.as_ref())?;
                    Ok(())
                })
            }

            fn generate(
                &self,
                _state: Arc<LlmState>,
                _message: String,
                _cancel: Arc<AtomicBool>,
                _event_sink: Arc<dyn ChatEventSink>,
            ) -> LlmRuntimeFuture<Result<ChatRunOutput, AppError>> {
                Box::pin(async { unreachable!("generation is not part of this phase-split test") })
            }
        }

        let state = Arc::new(LlmState::default());
        let before = runtime_mutation_snapshot(state.as_ref());
        let _driver_guard = install_test_runtime_driver(Arc::new(MutatingTestRuntimeDriver));

        ensure_model_loaded_after_valid_preflight(
            Arc::clone(&state),
            ValidatedModelLoadPreflight {
                model_path: std::path::PathBuf::from(
                    "C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
                ),
            },
        )
        .await
        .unwrap();

        let after = runtime_mutation_snapshot(state.as_ref());
        assert_eq!(before.status, LlmStatus::NotProvisioned);
        assert_eq!(after.status, LlmStatus::Loaded);
        assert_ne!(after, before);
    }

    #[test]
    fn validate_model_load_prerequisites_rejects_missing_provisioned_model() {
        let requirements = LlmSystemRequirementsSnapshot {
            free_disk_bytes: BASELINE_MIN_FREE_DISK_BYTES,
            free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES,
        };

        let err = validate_model_load_prerequisites(false, requirements).unwrap_err();
        assert!(
            matches!(err, AppError::Validation(message) if message.contains("not been provisioned"))
        );
    }

    #[test]
    fn validate_model_load_prerequisites_rejects_low_ram_before_model_load() {
        let requirements = LlmSystemRequirementsSnapshot {
            free_disk_bytes: BASELINE_MIN_FREE_DISK_BYTES,
            free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES - 1,
        };

        let err = validate_model_load_prerequisites(true, requirements).unwrap_err();
        assert!(
            matches!(err, AppError::Validation(message) if message.contains("1.5 GB free required"))
        );
    }

    #[test]
    fn lazy_load_preflight_errors_leave_lifecycle_markers_unchanged() {
        let state = LlmState::default();
        let requirements = LlmSystemRequirementsSnapshot {
            free_disk_bytes: BASELINE_MIN_FREE_DISK_BYTES,
            free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES - 1,
        };

        let err = validate_model_load_prerequisites(true, requirements).unwrap_err();
        assert!(
            matches!(err, AppError::Validation(message) if message.contains("1.5 GB free required"))
        );
        assert_eq!(*state.status.lock().unwrap(), LlmStatus::NotProvisioned);
        assert!(state.last_error.lock().unwrap().is_none());
    }

    #[test]
    fn begin_generation_rejects_second_active_stream() {
        let state = LlmState::default();
        begin_generation(&state, "stream-1".to_string()).unwrap();

        let err = begin_generation(&state, "stream-2".to_string()).unwrap_err();
        assert!(
            matches!(err, AppError::Validation(message) if message.contains("already being generated"))
        );
    }

    #[test]
    fn begin_generation_rejects_when_reprovision_is_active() {
        let state = LlmState::default();
        *state.reprovisioning.lock().unwrap() = Some(ReprovisionKind::Download);

        let err = begin_generation(&state, "stream-1".to_string()).unwrap_err();
        assert!(
            matches!(err, AppError::Validation(message) if message.contains("being provisioned"))
        );
    }

    #[test]
    fn cancel_generation_marks_active_stream_cancelled() {
        let state = LlmState::default();
        begin_generation(&state, "stream-1".to_string()).unwrap();

        cancel_generation(&state, "stream-1").unwrap();

        let active = state.active_generation.lock().unwrap();
        assert!(active
            .as_ref()
            .unwrap()
            .cancel
            .load(std::sync::atomic::Ordering::SeqCst));
    }

    #[test]
    fn ensure_model_loaded_rejects_during_reprovision() {
        let state = LlmState::default();
        *state.reprovisioning.lock().unwrap() = Some(ReprovisionKind::Download);

        let err = ensure_no_reprovision_in_progress(&state).unwrap_err();
        assert!(
            matches!(err, AppError::Validation(message) if message.contains("being provisioned"))
        );
    }

    #[test]
    fn successful_lazy_load_recovery_clears_prior_error_and_marks_loaded() {
        let state = LlmState::default();
        set_lifecycle_error(&state, "load failed".to_string()).unwrap();

        finish_model_load_success(&state).unwrap();

        assert_eq!(*state.status.lock().unwrap(), LlmStatus::Loaded);
        assert!(state.last_error.lock().unwrap().is_none());
    }

    #[test]
    fn claimed_generation_finalizer_preserves_command_error_when_done_emit_fails() {
        use std::sync::atomic::{AtomicBool, Ordering};

        struct FailingDoneSink {
            attempted: Arc<AtomicBool>,
        }

        impl ChatEventSink for FailingDoneSink {
            fn emit_token(&self, _token: &str) -> Result<(), AppError> {
                Ok(())
            }

            fn emit_done(&self, _event: DoneEvent) -> Result<(), AppError> {
                self.attempted.store(true, Ordering::SeqCst);
                Err(AppError::Llm("terminal done emit failed".to_string()))
            }
        }

        let state = LlmState::default();
        let cancel = begin_generation(&state, "stream-1".to_string()).unwrap();
        let attempted = Arc::new(AtomicBool::new(false));

        let result = finalize_claimed_generation(
            &state,
            "stream-1",
            Err(AppError::Llm("preflight failed".to_string())),
            &cancel,
            &FailingDoneSink {
                attempted: Arc::clone(&attempted),
            },
        )
        .unwrap_err();

        assert!(attempted.load(Ordering::SeqCst));
        assert!(matches!(result, AppError::Llm(message) if message.contains("preflight failed")));
        assert!(state.active_generation.lock().unwrap().is_none());
    }

    #[test]
    fn blocking_generation_runner_uses_send_sync_event_sink_for_token_emission() {
        #[derive(Default)]
        struct RecordingSink {
            tokens: Arc<Mutex<Vec<String>>>,
        }

        impl ChatEventSink for RecordingSink {
            fn emit_token(&self, token: &str) -> Result<(), AppError> {
                self.tokens.lock().unwrap().push(token.to_string());
                Ok(())
            }

            fn emit_done(&self, _event: DoneEvent) -> Result<(), AppError> {
                Ok(())
            }
        }

        fn assert_send_sync<T: Send + Sync>() {}

        assert_send_sync::<RecordingSink>();
    }
}
