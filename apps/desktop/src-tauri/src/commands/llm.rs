use crate::commands::provisioning::{
    models_dir, FixedResourceProbe, LiveResourceProbe, ProvisioningState, ProvisioningTarget,
    ResourceProbe, ResourceSnapshot, BASELINE_MIN_FREE_DISK_BYTES, BASELINE_MIN_FREE_RAM_BYTES,
    TINY_LLAMA_DESTINATION, TINY_LLAMA_SHA256, TINY_LLAMA_SIZE_BYTES, TINY_LLAMA_URL,
};
use crate::db::pool::app_data_dir;
use crate::error::AppError;
use crate::models::{DownloadProgressEvent, LlmStatus, LlmStatusResponse};
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
) -> Result<DownloadFlowOutcome, AppError> {
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
    let response = tokio::select! {
        changed = send_cancel_rx.changed() => {
            match changed {
                Ok(()) if is_cancelled(&send_cancel_rx) => return Ok(DownloadFlowOutcome::Cancelled),
                Ok(()) => return Err(AppError::Llm("LLM download cancellation channel changed unexpectedly".to_string())),
                Err(_) => return Err(AppError::Llm("LLM download cancellation channel closed before request dispatch".to_string())),
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
        let maybe_chunk = tokio::select! {
            changed = chunk_cancel_rx.changed() => {
                match changed {
                    Ok(()) if is_cancelled(&chunk_cancel_rx) => {
                        cleanup_restart_if_needed(&active_download_path, &temp_path).await?;
                        return Ok(DownloadFlowOutcome::Cancelled);
                    }
                    Ok(()) => return Err(AppError::Llm("LLM download cancellation channel changed unexpectedly".to_string())),
                    Err(_) => return Err(AppError::Llm("LLM download cancellation channel closed before completion".to_string())),
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
                .await);
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
            .await);
        }

        let progress = match update_download_progress(state, chunk.len() as u64, total_bytes) {
            Ok(progress) => progress,
            Err(error) => {
                return Err(finalize_non_sha_download_error(
                    active_download_path.clone(),
                    temp_path.clone(),
                    error,
                )
                .await)
            }
        };

        if let Err(error) = emit_download_progress_event(&app, progress) {
            return Err(finalize_non_sha_download_error(
                active_download_path.clone(),
                temp_path.clone(),
                error,
            )
            .await);
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
        .await);
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
            ));
        }
        Err(error) => {
            return Err(finalize_non_sha_download_error(
                active_download_path.clone(),
                temp_path.clone(),
                error,
            )
            .await);
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

        // If we cannot prove the staging artifact stayed in place, fail closed.
        let error = if staged_was_promoted {
            AppError::Llm(format!(
                "Post-promotion cleanup failed after replacing approved model bytes: {error}"
            ))
        } else {
            error
        };

        return Err(finalize_non_sha_download_error(active_download_path, temp_path, error).await);
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
            let post_failure_probe = target_prep.clone();
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
                Err(error) => {
                    let invalidate_runtime = tokio::task::spawn_blocking({
                        let temp_path = temp_path.clone();
                        let restart_path = post_failure_probe.restart_path.clone();
                        let final_path = final_path.clone();
                        move || -> Result<bool, AppError> {
                            let temp_promoted =
                                staged_bytes_moved_to_final_path_blocking(&temp_path, &final_path)?;
                            let restart_promoted = staged_bytes_moved_to_final_path_blocking(
                                &restart_path,
                                &final_path,
                            )?;
                            Ok(temp_promoted || restart_promoted)
                        }
                    })
                    .await
                    .ok()
                    .and_then(Result::ok)
                    .unwrap_or(true);

                    StartedReprovisionResult::Error {
                        invalidate_runtime,
                        error,
                    }
                }
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
}
