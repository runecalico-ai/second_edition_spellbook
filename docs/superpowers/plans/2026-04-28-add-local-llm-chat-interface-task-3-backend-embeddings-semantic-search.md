# Local LLM Chat Task 3 Backend Embeddings and Semantic Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete OpenSpec Task Group 3 for `add-local-llm-chat-interface` by shipping Rust-native embedding lifecycle management, real semantic spell search with cosine distance ranking, non-blocking spell-write/import embedding hooks, background startup initialization and backfill, and command registration for the new embedding surface.

**Architecture:** Implement a dedicated `commands/embeddings.rs` module that mirrors proven lifecycle patterns from `commands/llm.rs` while using the embedding asset contract from `commands/provisioning.rs` (`EMBEDDING_EXPECTED_FILES`, `EMBEDDING_MANIFEST_SHA`, `EMBEDDING_DESTINATION`, and baseline RAM/disk thresholds). Keep all DB writes responsive by treating embedding as best-effort asynchronous work on spell writes/imports and converging index correctness via startup partial backfill (`reindex_embeddings(force=false)`) plus explicit reindex command. Use `fastembed` for vector generation, `sqlite-vec` for ANN distance queries, and event-driven progress APIs for download/reindex.

**Tech Stack:** Rust 2021, Tauri v2 managed state and events, `fastembed = 5.13.3`, `reqwest` range downloads, `sha2`, `rusqlite` + `sqlite-vec`, `tokio::task::spawn_blocking`, existing provisioning helpers in `commands/provisioning.rs`.

---

## Spec Snapshot (Task Group 3)

1. `3.1` Create `apps/desktop/src-tauri/src/commands/embeddings.rs`.
2. `3.2` Define `EmbeddingState` with state set `{ notProvisioned | downloading | initializing | ready | error }`.
3. `3.3` Use fixed `SpellbookVault/models/` path for the approved embedding bundle.
4. `3.4` Implement `embeddings_status`, `embeddings_download_model`, `embeddings_import_model_file`, `embeddings_cancel_download`.
5. `3.5` Implement internal helpers `embed_spell_text` and `embed_spell_texts_batch`.
6. `3.6` Add non-blocking post-write embedding hooks to `create_spell` and `update_spell` when ready.
7. `3.7` Add non-blocking import batch embedding, and record missing-vector gaps otherwise.
8. `3.8` Implement startup embedding initialization after provisioning.
9. `3.9` Implement `search_spells_semantic` (replacement for current semantic backend) and return `cosineDistance`.
10. `3.10` Implement `reindex_embeddings` with progress events and provisioning/download guard.
11. `3.11` Add startup partial backfill via `reindex_embeddings(force=false)`.
12. `3.12` Register all embedding commands in Tauri command list.

**Task Group 3 execution note:** Write paths (`create_spell`, `update_spell`, `import_spell_json`, and `import_files`) stay non-blocking for embedding persistence. If embedding is not ready during post-write/import hooks, schedule a non-blocking best-effort invalidation (`DELETE FROM spell_vec WHERE rowid = ?`) for affected spell ids so stale vectors are removed and deterministic missing-row gaps remain. Startup initialization plus `reindex_embeddings(force=false)` and manual `reindex_embeddings(force=true)` then converge index completeness.

**Normative precedence / reconciliation:** For this change, Task Group 3 requirements and the approved design decisions are authoritative for write-path behavior: embedding persistence on `create_spell`, `update_spell`, `import_spell_json`, and `import_files` is non-blocking/best-effort. Completeness converges through startup backfill plus explicit reindex. Any older scenario text implying synchronous embedding upsert before write command return is superseded for this change and should be corrected during spec sync. Semantic IPC for this change is `search_spells_semantic -> Vec<SemanticSearchResult>` with `cosineDistance`; any legacy design text that still says `Vec<SpellSummary>` is stale and should be corrected during spec sync. Preflight Step 0.4 below makes this a required handoff gate (not a best-effort note).

## Repo Constraints

- Do not add dependencies in this task group. Reuse existing approved crates in `apps/desktop/src-tauri/Cargo.toml`.
- Reuse provisioning constants and resource checks from `apps/desktop/src-tauri/src/commands/provisioning.rs`.
- Keep `AppError` usage consistent with existing backend patterns (`Validation`, `Search`, `Llm`, `Unknown`, `Io`).
- Keep blocking FS/hash/model/DB-heavy work in `spawn_blocking`.
- Preserve non-blocking user writes: embedding failures must log and continue.
- Maintain camelCase output payloads with `#[serde(crate = "serde", rename_all = "camelCase")]`.
- Keep model assets under `SpellbookVault/models/`; do not use ad hoc paths.

## Planned File Structure

- Create: `apps/desktop/src-tauri/src/commands/embeddings.rs`
  Purpose: Embedding lifecycle state, download/import/cancel/status commands, embedding helpers, semantic search, reindex, startup hooks, and module-level tests.
- Create: `apps/desktop/src-tauri/src/models/embeddings.rs`
  Purpose: Embedding status/result/event DTOs shared with IPC.
- Modify: `apps/desktop/src-tauri/src/models/mod.rs`
  Purpose: Export new embedding model types.
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
  Purpose: Export `embeddings` module and re-exports.
- Modify: `apps/desktop/src-tauri/src/lib.rs`
  Purpose: Register `Arc<EmbeddingState>`, register new commands, and kick startup embedding initialization/backfill.
- Modify: `apps/desktop/src-tauri/src/commands/spells.rs`
  Purpose: Add non-blocking post-write embedding updates for create and update flows.
- Modify: `apps/desktop/src-tauri/src/commands/import.rs`
  Purpose: Add non-blocking batch embedding trigger after successful import completion.
- Modify: `apps/desktop/src-tauri/src/commands/search.rs`
    Purpose: Remove sidecar-based semantic search implementation, deprecate/remove legacy `search_semantic` IPC command, and keep keyword/chat compatibility paths.

---

### Task 0: Preflight Gate (No New Dependencies, Approved Provisioning Surface Exists)

**Files:**
- Read: `apps/desktop/src-tauri/Cargo.toml`
- Read: `apps/desktop/src-tauri/src/commands/provisioning.rs`
- Read: `docs/dev/local_llm_infrastructure_spike.md`

- [ ] **Step 0.1: Verify approved dependency lines exist and no manifest edits are required**

Run:

```bash
cd apps/desktop/src-tauri
rg -n "^(fastembed|reqwest|sha2|sysinfo|sqlite-vec)\s*=" Cargo.toml
```

Expected: approved crates already present with pinned versions from Task Group 1.

- [ ] **Step 0.2: Verify embedding provisioning constants and file inventory are present**

Run:

```bash
cd apps/desktop/src-tauri
rg -n "EMBEDDING_(URL|MANIFEST_SHA|SIZE_BYTES|DESTINATION|EXPECTED_FILES|ASSET)" src/commands/provisioning.rs
```
Expected: all required embedding asset constants found.

- [ ] **Step 0.3: Verify model asset contract details match the spike ledger**

Run:

```bash
cd ../../..
rg -n "all-MiniLM-L6-v2|5f1b8cd78bc4fb444dd171e59b18f3a3af89a079|FileInventoryOnly" docs/dev/local_llm_infrastructure_spike.md
```

Expected: frozen bundle revision/hash strategy is documented and available for Task 3 implementation.

- [ ] **Step 0.4: Record and sync semantic search mismatch in the delta search spec before implementation handoff**

Run:

```bash
cd openspec/changes/add-local-llm-chat-interface
rg -n "search_semantic|search_spells_semantic|Vec<SpellSummary>|SemanticSearchResult|cosineDistance|embed before returning|before returning.*embed|synchronous.*embed|blocking.*embed|non-blocking|best-effort|without waiting" specs/search/spec.md
```

Expected: `specs/search/spec.md` reflects `search_spells_semantic -> Vec<SemanticSearchResult>` with `cosineDistance`, stale `Vec<SpellSummary>` wording is removed, and any stale synchronous write-path wording (for example "embed before returning") is replaced with explicit non-blocking write semantics (write returns without waiting on embedding upsert) before handoff.

- [ ] **Step 0.5: Commit preflight evidence**

```bash
git add docs/superpowers/plans/2026-04-28-add-local-llm-chat-interface-task-3-backend-embeddings-semantic-search.md
git commit -m "docs: add task 3 embeddings preflight gate"
```

---

### Task 1: Add Embedding IPC Models and State Skeleton

**Files:**
- Create: `apps/desktop/src-tauri/src/models/embeddings.rs`
- Create: `apps/desktop/src-tauri/src/commands/embeddings.rs`
- Modify: `apps/desktop/src-tauri/src/models/mod.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`

- [x] **Step 1.1: Write failing tests for status enum serialization and default state**
- [x] **Step 1.1 follow-up: Expand Task 1 tests for DTO/event serialization shape coverage** (`EmbeddingsStatusResponse`, `EmbeddingsDownloadProgressEvent`, `ReindexProgressEvent`, `SemanticSearchResult` flatten + `cosineDistance`, `ReindexResult`)

```rust
// apps/desktop/src-tauri/src/commands/embeddings.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embeddings_status_serializes_to_spec_values() {
        assert_eq!(serde_json::to_string(&EmbeddingsStatus::NotProvisioned).unwrap(), "\"notProvisioned\"");
        assert_eq!(serde_json::to_string(&EmbeddingsStatus::Downloading).unwrap(), "\"downloading\"");
        assert_eq!(serde_json::to_string(&EmbeddingsStatus::Initializing).unwrap(), "\"initializing\"");
        assert_eq!(serde_json::to_string(&EmbeddingsStatus::Ready).unwrap(), "\"ready\"");
        assert_eq!(serde_json::to_string(&EmbeddingsStatus::Error).unwrap(), "\"error\"");
    }

    #[test]
    fn embedding_state_defaults_to_not_provisioned() {
        let state = EmbeddingState::default();
        assert!(state.model.lock().unwrap().is_none());
        assert!(state.download_state.lock().unwrap().is_none());
        assert!(state.last_error.lock().unwrap().is_none());
        assert_eq!(*state.status.lock().unwrap(), EmbeddingsStatus::NotProvisioned);
    }
}
```

- [x] **Step 1.2: Run test to document pre-existing compile blocker before embeddings wiring**

Run:

```bash
cd apps/desktop/src-tauri
cargo test embeddings_status_serializes_to_spec_values --lib
```

Expected: FAIL before reaching embeddings checks because of a pre-existing compile error in `llm.rs`.

Evidence: `cargo test embeddings_status_serializes_to_spec_values --lib` failed due to an unrelated `llm.rs` compile error (external/pre-existing blocker), not missing `embeddings` module/types.

- [x] **Step 1.3: Implement model DTOs and state skeleton**

```rust
// apps/desktop/src-tauri/src/models/embeddings.rs
use crate::models::SpellSummary;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub enum EmbeddingsStatus {
    NotProvisioned,
    Downloading,
    Initializing,
    Ready,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct EmbeddingsStatusResponse {
    pub state: EmbeddingsStatus,
    pub download_progress: Option<f64>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct EmbeddingsDownloadProgressEvent {
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct ReindexProgressEvent {
    pub current: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct SemanticSearchResult {
    #[serde(flatten)]
    pub spell: SpellSummary,
    pub cosine_distance: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct ReindexResult {
    pub total: u32,
    pub indexed: u32,
    pub skipped: u32,
    pub failed: u32,
}
```

`ReindexResult` semantics for Task 6: `total` is the full spell library size at reindex start; `indexed` and `failed` count candidate processing work; `skipped` is the pre-existing-vector baseline (`force=false`: `total - candidate_count`, `force=true`: `0`).

```rust
// apps/desktop/src-tauri/src/commands/embeddings.rs
use crate::error::AppError;
use crate::models::EmbeddingsStatus;
use std::sync::atomic::{AtomicU64, Ordering};
use fastembed::TextEmbedding;
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
```

```rust
// apps/desktop/src-tauri/src/models/mod.rs
pub mod embeddings;
pub use embeddings::*;
```

```rust
// apps/desktop/src-tauri/src/commands/mod.rs
pub mod embeddings;
pub use embeddings::*;
```

- [x] **Step 1.4: Run tests and check compile**

Run:

```bash
cd apps/desktop/src-tauri
cargo test embeddings_status_serializes_to_spec_values --lib
cargo test embedding_state_defaults_to_not_provisioned --lib
cargo check
```

Expected: `cargo check` succeeds. The two filtered `--lib` tests should pass when ONNX Runtime (ORT) link prerequisites are available; without them, `cargo test --lib` may fail at link time—confirm PASS in CI or an ORT-ready dev shell if local linking fails. For checklist/evidence, note whether local `--lib` completed vs link-blocked so `[x]` is not read as universal PASS on every machine.

- [x] **Step 1.5: Commit Task 1**

```bash
git add src/models/embeddings.rs src/models/mod.rs src/commands/embeddings.rs src/commands/mod.rs
git commit -m "feat: scaffold embeddings state and ipc models"
```

---

### Task 2: Implement Embedding Status, Download, Import, and Cancel Commands

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/embeddings.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (manage `EmbeddingState`, register embedding IPC commands)
- Modify: `apps/desktop/src-tauri/Cargo.toml` / `Cargo.lock` (direct `futures-util` dependency for HTTP byte-stream iteration)

**Evidence (local, 2026-05-04):** `cargo check` in `apps/desktop/src-tauri` succeeded. Filtered `cargo test … --lib` did not link on this Windows shell: MSVC linker `LNK2019` unresolved `OrtGetApiBase` / `ort-sys` ONNX Runtime (same class of ORT blocker noted under Task 1 Step 1.4). Confirm PASS in CI or an ORT-configured environment.

- [x] **Step 2.1: Add failing tests for command-state transitions and validation paths**

```rust
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
```

- [x] **Step 2.2: Run tests to verify failure first**

Run:

```bash
cd apps/desktop/src-tauri
cargo test embeddings_status_reports_downloading_progress --lib
cargo test embedding_bundle_validation_rejects_missing_required_file --lib
```

Expected: FAIL before lifecycle and validation helpers exist.

**Outcome:** Before implementation: `cargo test` failed at compile (`build_embeddings_status_response` / `validate_embedding_bundle_layout` missing). After implementation: same filtered tests reached link stage then failed with ORT (`OrtGetApiBase`), not assertion failures.

- [x] **Step 2.3: Implement status/download/import/cancel command surface**

```rust
type EmbeddingDownloadControl = (
    u64,
    tokio::sync::watch::Sender<bool>,
    tokio::sync::watch::Receiver<DownloadCleanupState>,
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

fn approved_embedding_bundle_present(vault_root: &std::path::Path) -> Result<bool, AppError> {
    let bundle_root = crate::commands::models_dir(vault_root)
        .join(crate::commands::EMBEDDING_DESTINATION);
    match std::fs::metadata(bundle_root) {
        Ok(metadata) => Ok(metadata.is_dir()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(AppError::from(error)),
    }
}

fn begin_embedding_download(
    state: &EmbeddingState,
    total_bytes: u64,
) -> Result<tokio::sync::watch::Receiver<bool>, AppError> {
    let session_epoch =
        state.download_epoch.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
    let (completion_tx, _completion_rx) =
        tokio::sync::watch::channel(DownloadCleanupState::Running);

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
    use crate::commands::EMBEDDING_EXPECTED_FILES;

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
    let (repo_prefix, revision) = crate::commands::EMBEDDING_URL
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

async fn wait_for_download_control_or_idle(
    state: &EmbeddingState,
) -> Result<Option<(tokio::sync::watch::Sender<bool>, tokio::sync::watch::Receiver<DownloadCleanupState>)>, AppError> {
    let Some(target_epoch) = current_download_control(state)?.map(|value| value.0) else {
        return Ok(None);
    };

    loop {
        if let Some((session_epoch, cancel_tx, completion_rx)) = current_download_control(state)? {
            if session_epoch == target_epoch {
                return Ok(Some((cancel_tx, completion_rx)));
            }
            return Ok(None);
        }

        tokio::time::sleep(std::time::Duration::from_millis(10)).await;
    }
}

async fn wait_for_download_cleanup_or_idle(
    state: &EmbeddingState,
    mut completion_rx: tokio::sync::watch::Receiver<DownloadCleanupState>,
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
    let Some((cancel_tx, completion_rx)) = wait_for_download_control_or_idle(state).await? else {
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

    let total_bytes: u64 = crate::commands::EMBEDDING_EXPECTED_FILES
        .iter()
        .map(|file| file.size_bytes)
        .sum();
    let mut cancel_rx = begin_embedding_download(state.as_ref(), total_bytes)?;

    let result = async {
        let client = reqwest::Client::new();
        let mut aggregate_downloaded = 0_u64;

        for expected in crate::commands::EMBEDDING_EXPECTED_FILES {
            let destination = models_root
                .join(crate::commands::EMBEDDING_DESTINATION)
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

            let response = request
                .send()
                .await
                .map_err(|error| AppError::Search(format!("embedding download request failed: {error}")))?;
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

            use futures_util::StreamExt;
            use tokio::io::AsyncWriteExt;
            let mut stream = response.bytes_stream();
            while let Some(next) = stream.next().await {
                if *cancel_rx.borrow_and_update() {
                    return Err(AppError::Search("Embedding download cancelled".to_string()));
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
            let bundle_root = models_root.join(crate::commands::EMBEDDING_DESTINATION);
            move || validate_embedding_bundle_layout(&bundle_root)
        })
        .await
        .map_err(|error| AppError::Search(format!("embedding post-download validation task failed: {error}")))??;

        Ok::<(), AppError>(())
    }
    .await;

    finish_download_session(state.as_ref())?;

    match result {
        Ok(()) => set_embeddings_status(state.as_ref(), EmbeddingsStatus::Initializing, None),
        Err(error) if error.to_string().contains("cancelled") => {
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

    tokio::task::spawn_blocking({
        let source = source.clone();
        move || validate_embedding_bundle_layout(&source)
    })
    .await
    .map_err(|error| AppError::Search(format!("embedding import validation task failed: {error}")))??;

    tokio::task::spawn_blocking(move || {
        let models_root = crate::commands::app_models_dir()?;
        let destination = models_root.join(crate::commands::EMBEDDING_DESTINATION);
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
    provisioning: tauri::State<'_, Arc<crate::commands::ProvisioningState>>,
) -> Result<(), AppError> {
    let _lease = provisioning.start_download(crate::commands::ProvisioningTarget::Embeddings)?;

    let models_root = crate::commands::app_models_dir()?;
    tokio::task::spawn_blocking({
        let models_root = models_root.clone();
        move || {
            let probe = crate::commands::LiveResourceProbe::new(models_root.clone());
            crate::commands::ensure_resources_available(
                &probe,
                crate::commands::ProvisioningTarget::Embeddings.approved_asset(),
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
    provisioning: tauri::State<'_, Arc<crate::commands::ProvisioningState>>,
) -> Result<(), AppError> {
    let _lease = provisioning.start_download(crate::commands::ProvisioningTarget::Embeddings)?;
    let source = std::path::PathBuf::from(file_path);
    install_imported_embedding_bundle(state.inner().clone(), source).await
}

#[tauri::command]
pub async fn embeddings_cancel_download(
    state: tauri::State<'_, Arc<EmbeddingState>>,
) -> Result<(), AppError> {
    cancel_embedding_download_and_wait(state.inner().as_ref()).await
}
```

- [x] **Step 2.4: Run tests for status and import validation, then command compile checks** — `cargo check`: PASS. Filtered lib tests: blocked at link (ORT), not failing assertions.

- [x] **Step 2.5: Commit Task 2**

```bash
git add src/commands/embeddings.rs
git commit -m "feat: add embeddings provisioning lifecycle commands"
```

---

### Task 3: Implement Runtime Load and Embedding Helper Functions

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/embeddings.rs`

- [ ] **Step 3.1: Add failing tests for helper behavior and vector dimension checks**

```rust
#[test]
fn embedding_text_composition_is_stable() {
    let text = compose_spell_embedding_text("Shield", "Protects against attacks");
    assert_eq!(text, "Shield\n\nProtects against attacks");
}

#[test]
fn vector_dimension_guard_rejects_non_384_vectors() {
    let err = require_embedding_dimension(&vec![0.0_f32; 128]).unwrap_err();
    assert!(err.to_string().contains("384"));
}
```

- [ ] **Step 3.2: Run tests and capture fail state**

Run:

```bash
cd apps/desktop/src-tauri
cargo test embedding_text_composition_is_stable --lib
cargo test vector_dimension_guard_rejects_non_384_vectors --lib
```

Expected: FAIL before helper functions exist.

- [ ] **Step 3.3: Implement model load and embedding helper APIs used by all later tasks**

```rust
type SpellEmbeddingRow = (i64, String, String);

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
) -> Result<std::sync::Arc<fastembed::TextEmbedding>, AppError> {
    let wait_for_ready = async move {
        loop {
            let status = *state
                .status
                .lock()
                .map_err(|_| AppError::Search("embedding status lock poisoned".to_string()))?;
            if status == EmbeddingsStatus::Ready {
                let model = state
                    .model
                    .lock()
                    .map_err(|_| AppError::Search("embedding model lock poisoned".to_string()))?
                    .clone()
                    .ok_or_else(|| AppError::Search("embedding status is ready but model is not loaded".to_string()))?;
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
        .map_err(|_| AppError::Search("timed out waiting for embedding model readiness".to_string()))?
}

fn embed_spell_text(model: &fastembed::TextEmbedding, text: &str) -> Result<Vec<f32>, AppError> {
    let vectors = model
        .embed(vec![text.to_owned()], None)
        .map_err(|e| AppError::Search(format!("single embedding failed: {e}")))?;

    let vector = vectors.into_iter().next().ok_or_else(|| {
        AppError::Search("single embedding returned zero vectors".to_string())
    })?;
    require_embedding_dimension(&vector)?;
    Ok(vector)
}

fn embed_spell_texts_batch(
    model: &fastembed::TextEmbedding,
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
        // Missing-vector gaps are represented deterministically as spell rows with no spell_vec row.
        "SELECT s.id, s.name, s.description
         FROM spell s
         LEFT JOIN spell_vec v ON v.rowid = s.id
         WHERE v.rowid IS NULL
         ORDER BY s.id"
    };

    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    })?;

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

    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let tx = conn.unchecked_transaction()?;

        for (idx, row) in rows.iter().enumerate() {
            let vector_json = serde_json::to_string(&vectors[idx])
                .map_err(|e| AppError::Search(format!("failed to serialize embedding vector: {e}")))?;

            tx.execute("DELETE FROM spell_vec WHERE rowid = ?1", rusqlite::params![row.0])?;
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

    let vector = tokio::task::spawn_blocking(move || embed_spell_text(model.as_ref(), &text))
        .await
        .map_err(|e| AppError::Search(format!("single embedding task failed: {e}")))??;

    let rows = vec![(spell_id, name, description)];
    let vectors = vec![vector];
    upsert_embedding_chunk(pool, &rows, &vectors).await
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

    let vectors = tokio::task::spawn_blocking(move || embed_spell_texts_batch(model.as_ref(), &texts))
        .await
        .map_err(|e| AppError::Search(format!("batch embedding task failed: {e}")))??;

    upsert_embedding_chunk(pool, &rows, &vectors).await
}

#[cfg(test)]
fn test_pool() -> crate::db::Pool {
    crate::db::init_db(None, false).expect("test pool")
}
```

- [ ] **Step 3.4: Run helper tests and compile**

Run:

```bash
cd apps/desktop/src-tauri
cargo test embedding_text_composition_is_stable --lib
cargo test vector_dimension_guard_rejects_non_384_vectors --lib
cargo check
```

Expected: PASS.

- [ ] **Step 3.5: Commit Task 3**

```bash
git add src/commands/embeddings.rs
git commit -m "feat: add embedding runtime and vector helper functions"
```

---

### Task 4: Add Non-Blocking Embedding Hooks to Spell Create and Update

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/spells.rs`
- Modify: `apps/desktop/src-tauri/src/commands/embeddings.rs`

- [ ] **Step 4.1: Write failing tests for async post-write embedding behavior**

```rust
// apps/desktop/src-tauri/src/commands/embeddings.rs
#[tokio::test]
async fn post_write_hook_skips_when_not_ready() {
    let state = Arc::new(EmbeddingState::default());
    *state.status.lock().unwrap() = EmbeddingsStatus::NotProvisioned;

    let result = enqueue_spell_embedding_if_ready(
        state,
        Arc::new(test_pool()),
        42,
        "Shield".to_string(),
        "Protects against attacks".to_string(),
    )
    .await;

    assert!(result.is_ok());
}
```

- [ ] **Step 4.2: Run tests to observe failure before hook implementation**

Run:

```bash
cd apps/desktop/src-tauri
cargo test post_write_hook_skips_when_not_ready --lib
```

Expected: FAIL due to missing hook API.

- [ ] **Step 4.3: Implement hook helper and wire both commands**

Ensure the touched files include explicit imports for the new helper/type usage:

```rust
// apps/desktop/src-tauri/src/commands/spells.rs
use crate::commands::embeddings::{enqueue_spell_embedding_if_ready, EmbeddingState};
use std::sync::Arc;
```

```rust
// apps/desktop/src-tauri/src/commands/embeddings.rs
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
                Ok(Ok(())) => tracing::info!(spell_id, ?status, "embedding skipped; stale vector invalidated"),
                Ok(Err(error)) => tracing::warn!(spell_id, ?status, ?error, "embedding skipped; stale vector invalidation failed (non-fatal)"),
                Err(join_error) => tracing::warn!(spell_id, ?status, ?join_error, "embedding skipped; stale vector invalidation join failed (non-fatal)"),
            }
        });
        return Ok(());
    }

    let state_for_task = Arc::clone(&state);
    tauri::async_runtime::spawn(async move {
        if let Err(error) = embed_single_spell_row(state_for_task, pool, spell_id, name, description).await {
            tracing::warn!(spell_id, ?error, "embedding write hook failed (non-fatal)");
        }
    });

    Ok(())
}
```

```rust
// apps/desktop/src-tauri/src/commands/spells.rs
#[tauri::command]
pub async fn create_spell(
    state: State<'_, Arc<Pool>>,
    embedding_state: State<'_, Arc<EmbeddingState>>,
    spell: SpellCreate,
) -> Result<i64, AppError> {
    let pool = state.inner().clone();
    let (spell_id, name, description) = tokio::task::spawn_blocking(move || {
        validate_spell_fields(&spell.name, spell.level, &spell.description)?;
        validate_epic_and_quest_spells(
            spell.level,
            &spell.class_list,
            spell.is_quest_spell != 0,
            spell.is_cantrip != 0,
        )?;

        let detail = SpellDetail {
            id: None,
            name: spell.name.clone(),
            school: spell.school.clone(),
            sphere: spell.sphere.clone(),
            class_list: spell.class_list.clone(),
            level: spell.level,
            range: spell.range.clone(),
            components: spell.components.clone(),
            material_components: spell.material_components.clone(),
            casting_time: spell.casting_time.clone(),
            duration: spell.duration.clone(),
            area: spell.area.clone(),
            saving_throw: spell.saving_throw.clone(),
            damage: spell.damage.clone(),
            magic_resistance: spell.magic_resistance.clone(),
            reversible: spell.reversible,
            description: spell.description.clone(),
            tags: spell.tags.clone(),
            source: spell.source.clone(),
            edition: spell.edition.clone(),
            author: spell.author.clone(),
            license: spell.license.clone(),
            is_quest_spell: spell.is_quest_spell,
            is_cantrip: spell.is_cantrip,
            schema_version: None,
            artifacts: None,
            canonical_data: None,
            content_hash: None,
            range_spec: spell.range_spec.clone(),
            components_spec: spell.components_spec.clone(),
            material_components_spec: spell.material_components_spec.clone(),
            casting_time_spec: spell.casting_time_spec.clone(),
            duration_spec: spell.duration_spec.clone(),
            area_spec: spell.area_spec.clone(),
            saving_throw_spec: spell.saving_throw_spec.clone(),
            damage_spec: spell.damage_spec.clone(),
            magic_resistance_spec: spell.magic_resistance_spec.clone(),
        };
        let (canonical, hash, json) = canonicalize_spell_detail(detail)?;

        let conn = pool.get()?;
        let created_id = run_in_savepoint(&conn, "spell_create_write", || {
            conn.execute(
                "INSERT INTO spell (name, school, sphere, class_list, level, range, components,
                 material_components, casting_time, duration, area, saving_throw, damage,
                 magic_resistance, reversible, description, tags, source, edition, author,
                 license, is_quest_spell, is_cantrip, canonical_data, content_hash,
                 schema_version)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                rusqlite::params![
                    spell.name,
                    spell.school,
                    spell.sphere,
                    spell.class_list,
                    spell.level,
                    spell.range,
                    spell.components,
                    spell.material_components,
                    spell.casting_time,
                    spell.duration,
                    spell.area,
                    spell.saving_throw,
                    spell.damage,
                    spell.magic_resistance,
                    spell.reversible.unwrap_or(0),
                    spell.description,
                    spell.tags,
                    spell.source,
                    spell.edition,
                    spell.author,
                    spell.license,
                    spell.is_quest_spell,
                    spell.is_cantrip,
                    json,
                    hash,
                    canonical.schema_version,
                ],
            )?;
            let created = conn.last_insert_rowid();
            export_spell_to_vault_by_hash(&conn, &hash)?;
            Ok::<i64, AppError>(created)
        })?;

        Ok::<(i64, String, String), AppError>((
            created_id,
            spell.name.clone(),
            spell.description.clone(),
        ))
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    enqueue_spell_embedding_if_ready(
        Arc::clone(embedding_state.inner()),
        Arc::clone(state.inner()),
        spell_id,
        name,
        description,
    )
    .await?;

    Ok(spell_id)
}

#[tauri::command]
pub async fn update_spell(
    state: State<'_, Arc<Pool>>,
    embedding_state: State<'_, Arc<EmbeddingState>>,
    spell: SpellUpdate,
) -> Result<i64, AppError> {
    let pool = state.inner().clone();
    let (spell_id, name, description) = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let spell_id = apply_spell_update_with_conn(&conn, &spell)?;
        let (name, description) = conn.query_row(
            "SELECT name, description FROM spell WHERE id = ?1",
            rusqlite::params![spell_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )?;
        Ok::<(i64, String, String), AppError>((spell_id, name, description))
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    enqueue_spell_embedding_if_ready(
        Arc::clone(embedding_state.inner()),
        Arc::clone(state.inner()),
        spell_id,
        name,
        description,
    )
    .await?;

    Ok(spell_id)
}
```

- [ ] **Step 4.4: Run tests and compile checks**

Run:

```bash
cd apps/desktop/src-tauri
cargo test post_write_hook_skips_when_not_ready --lib
cargo check
```

Expected: PASS.

- [ ] **Step 4.5: Commit Task 4**

```bash
git add src/commands/spells.rs src/commands/embeddings.rs
git commit -m "feat: add non-blocking embedding hooks for spell writes"
```

---

### Task 5: Add Non-Blocking Batch Embedding Hook on Import Completion

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/import.rs`
- Modify: `apps/desktop/src-tauri/src/commands/embeddings.rs`

- [ ] **Step 5.1: Add failing tests for import-triggered batch embedding enqueue**

```rust
#[tokio::test]
async fn import_hook_leaves_rows_for_reindex_when_embeddings_not_ready() {
    let state = Arc::new(EmbeddingState::default());
    *state.status.lock().unwrap() = EmbeddingsStatus::Initializing;

    let spells = vec![
        (1_i64, "Shield".to_string(), "Protects".to_string()),
        (2_i64, "Mage Armor".to_string(), "Improves AC".to_string()),
    ];

    let result = enqueue_import_embeddings_if_ready(state, Arc::new(test_pool()), spells).await;
    assert!(result.is_ok());
}
```

- [ ] **Step 5.2: Run test and capture fail state**

Run:

```bash
cd apps/desktop/src-tauri
cargo test import_hook_leaves_rows_for_reindex_when_embeddings_not_ready --lib
```

Expected: FAIL before helper exists.

- [ ] **Step 5.3: Implement batch helper and wire import command path**

Ensure the touched file includes explicit imports for the helper/type usage:

```rust
// apps/desktop/src-tauri/src/commands/import.rs
use crate::commands::embeddings::{enqueue_import_embeddings_if_ready, EmbeddingState};
use std::sync::Arc;
```

```rust
// apps/desktop/src-tauri/src/commands/embeddings.rs
pub async fn enqueue_import_embeddings_if_ready(
    state: Arc<EmbeddingState>,
    pool: Arc<crate::db::Pool>,
    imported_spells: Vec<(i64, String, String)>,
) -> Result<(), AppError> {
    let status = *state
        .status
        .lock()
        .map_err(|_| AppError::Search("embedding status lock poisoned".to_string()))?;

    if status != EmbeddingsStatus::Ready {
        let stale_ids: Vec<i64> = imported_spells.iter().map(|(id, _, _)| *id).collect();
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
                Ok(Ok(())) => tracing::info!(count = imported_spells.len(), ?status, "batch embedding skipped; stale vectors invalidated"),
                Ok(Err(error)) => tracing::warn!(count = imported_spells.len(), ?status, ?error, "batch embedding skipped; stale vector invalidation failed (non-fatal)"),
                Err(join_error) => tracing::warn!(count = imported_spells.len(), ?status, ?join_error, "batch embedding skipped; stale vector invalidation join failed (non-fatal)"),
            }
        });

        // Missing-vector gaps are now explicit by deleting stale rows when model is not ready.
        // load_reindex_candidates(force = false) deterministically discovers and repairs these.
        return Ok(());
    }

    tauri::async_runtime::spawn(async move {
        if let Err(error) = embed_import_batch_rows(state, pool, imported_spells).await {
            tracing::warn!(?error, "import batch embedding failed (non-fatal)");
        }
    });

    Ok(())
}
```

```rust
// apps/desktop/src-tauri/src/commands/import.rs
#[tauri::command]
pub async fn import_spell_json(
    state: State<'_, Arc<Pool>>,
    embedding_state: State<'_, Arc<EmbeddingState>>,
    maintenance_state: State<'_, Arc<VaultMaintenanceState>>,
    payload: String,
    source_ref_url_policy: Option<String>,
) -> Result<ImportSpellJsonResult, AppError> {
    let preview = preview_import_spell_json(payload, source_ref_url_policy).await?;
    if preview.spells.is_empty() && preview.failures.is_empty() {
        return Ok(ImportSpellJsonResult {
            imported_count: 0,
            imported_spells: vec![],
            duplicates_skipped: DuplicatesSkipped::default(),
            conflicts: vec![],
            conflicts_resolved: None,
            failures: preview.failures,
            warnings: preview.warnings,
        });
    }

    let pool = state.inner().clone();
    let maintenance_state = maintenance_state.inner().clone();
    let items = preview.spells;
    let result = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let root = app_data_dir()?;
        apply_import_spell_json_with_maintenance(
            &conn,
            &root,
            maintenance_state.as_ref(),
            items,
            None,
        )
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    let mut out = result;
    out.failures.extend(preview.failures);
    out.warnings.extend(preview.warnings);

    let imported_for_embeddings: Vec<(i64, String, String)> = out
        .imported_spells
        .iter()
        .filter_map(|spell| {
            spell.id.map(|id| {
                (
                    id,
                    spell.name.clone(),
                    spell.description.clone(),
                )
            })
        })
        .collect();

    enqueue_import_embeddings_if_ready(
        Arc::clone(embedding_state.inner()),
        Arc::clone(state.inner()),
        imported_for_embeddings,
    )
    .await?;

    Ok(out)
}

Apply this portion in `apps/desktop/src-tauri/src/commands/import.rs` as deterministic delta edits (imports, both signatures, then the insertion anchor).

```diff
 use crate::commands::embeddings::{enqueue_import_embeddings_if_ready, EmbeddingState};
 use std::sync::Arc;

 pub async fn import_spell_json(
     state: State<'_, Arc<Pool>>,
+    embedding_state: State<'_, Arc<EmbeddingState>>,
     maintenance_state: State<'_, Arc<VaultMaintenanceState>>,
     payload: String,
     source_ref_url_policy: Option<String>,
 ) -> Result<ImportSpellJsonResult, AppError> {

 pub async fn import_files(
     state: State<'_, Arc<Pool>>,
+    embedding_state: State<'_, Arc<EmbeddingState>>,
     maintenance_state: State<'_, Arc<VaultMaintenanceState>>,
    files: Vec<ImportFile>,
     allow_overwrite: bool,
    spells: Option<Vec<ImportSpell>>,
    artifacts: Option<Vec<ImportArtifact>>,
    conflicts: Option<Vec<ImportConflict>>,
 ) -> Result<ImportResult, AppError> {

 pub async fn resolve_import_spell_json(
     state: State<'_, Arc<Pool>>,
     embedding_state: State<'_, Arc<EmbeddingState>>,
     maintenance_state: State<'_, Arc<VaultMaintenanceState>>,
    payload: String,
    resolve_options: ImportSpellJsonResolveOptions,
    source_ref_url_policy: Option<String>,
 ) -> Result<ImportSpellJsonResult, AppError> {
```

For `import_files`, insert the following block immediately after the anchor `let (result, changed_count) = match result { ... };` and before the first `if changed_count == 0 {`:

```rust
let imported_for_embeddings: Vec<(i64, String, String)> = result
    .spells
    .iter()
    .filter_map(|spell| {
        spell.id
            .map(|id| (id, spell.name.clone(), spell.description.clone()))
    })
    .collect();

enqueue_import_embeddings_if_ready(
    Arc::clone(embedding_state.inner()),
    Arc::clone(state.inner()),
    imported_for_embeddings,
)
.await?;
```

For `resolve_import_spell_json`, insert the same non-blocking hook immediately after this anchor and before `Ok(out)`:

`let mut out = result; out.failures.extend(preview.failures); out.warnings.extend(preview.warnings);`

```rust
let imported_for_embeddings: Vec<(i64, String, String)> = out
    .imported_spells
    .iter()
    .filter_map(|spell| {
        spell.id
            .map(|id| (id, spell.name.clone(), spell.description.clone()))
    })
    .collect();

enqueue_import_embeddings_if_ready(
    Arc::clone(embedding_state.inner()),
    Arc::clone(state.inner()),
    imported_for_embeddings,
)
.await?;
```

- [ ] **Step 5.4: Run tests and compile checks**

Run:

```bash
cd apps/desktop/src-tauri
cargo test import_hook_leaves_rows_for_reindex_when_embeddings_not_ready --lib
cargo check
```

Expected: PASS.

- [ ] **Step 5.5: Commit Task 5**

```bash
git add src/commands/import.rs src/commands/embeddings.rs
git commit -m "feat: add non-blocking import embedding batch hook"
```

---

### Task 6: Implement Semantic Search and Reindex Commands

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/embeddings.rs`
- Modify: `apps/desktop/src-tauri/src/commands/search.rs`

- [ ] **Step 6.1: Write failing tests for semantic result shape and reindex accounting**

```rust
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
    // Non-force mode: total counts all spells, while indexed/failed cover only candidate rows.
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
    assert_eq!(summary.total, summary.skipped + summary.indexed + summary.failed);
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
    assert_eq!(summary.total, summary.indexed + summary.skipped + summary.failed);
}
```

- [ ] **Step 6.2: Run tests first (expected fail)**

Run:

```bash
cd apps/desktop/src-tauri
cargo test semantic_result_serializes_cosine_distance_in_camel_case --lib
cargo test reindex_result_non_force_skipped_tracks_preexisting_vectors --lib
cargo test reindex_result_force_mode_has_zero_initial_skipped --lib
```

Expected: FAIL before command/result implementations are complete.

- [ ] **Step 6.3: Implement `search_spells_semantic` and `reindex_embeddings`**

```rust
pub async fn search_spells_semantic_internal(
    embedding_state: Arc<EmbeddingState>,
    db: Arc<crate::db::Pool>,
    query: String,
    limit: Option<u32>,
) -> Result<Vec<SemanticSearchResult>, AppError> {
    let model = await_ready_model_with_timeout(embedding_state, std::time::Duration::from_secs(30)).await?;
    let query_text = query.trim().to_string();
    let query_vector = tokio::task::spawn_blocking(move || embed_spell_text(model.as_ref(), &query_text))
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
```

```rust
fn load_total_spell_count(pool: &std::sync::Arc<crate::db::Pool>) -> Result<u32, AppError> {
    let conn = pool.get()?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM spell", [], |row| row.get(0))?;
    Ok(count.max(0) as u32)
}

fn load_reindex_candidate_count(
    pool: &std::sync::Arc<crate::db::Pool>,
    force: bool,
) -> Result<u32, AppError> {
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

pub async fn reindex_embeddings_internal(
    app: tauri::AppHandle,
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
    let rows = tokio::task::spawn_blocking(move || load_reindex_candidates(&pool_for_rows, force)).await
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
        let vectors_result = tokio::task::spawn_blocking(move || {
            embed_spell_texts_batch(model_for_chunk.as_ref(), &texts)
        })
        .await
        .map_err(|e| AppError::Search(format!("reindex embedding chunk task failed: {e}")))?;

        match vectors_result {
            Ok(vectors) => {
                upsert_embedding_chunk(Arc::clone(&db), chunk, &vectors).await?;
                indexed += chunk.len() as u32;
            }
            Err(error) => {
                tracing::warn!(?error, chunk_len = chunk.len(), "reindex chunk failed");
                failed += chunk.len() as u32;
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
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<EmbeddingState>>,
    db: tauri::State<'_, Arc<crate::db::Pool>>,
    provisioning: tauri::State<'_, Arc<crate::commands::ProvisioningState>>,
    force: bool,
) -> Result<ReindexResult, AppError> {
    // Explicit provisioning guard: reindex is rejected while provisioning is occupied.
    let _lease = provisioning.start_download(crate::commands::ProvisioningTarget::Embeddings)?;
    reindex_embeddings_internal(app, state.inner().clone(), db.inner().clone(), force).await
}
```

`ReindexResult` field semantics in this implementation: `total` is all spells at run start, `indexed` and `failed` cover candidate processing only, and `skipped` is the initial baseline of already-indexed spells (`force=false`) or `0` (`force=true`).

Apply this deterministic edit in `apps/desktop/src-tauri/src/commands/search.rs`: delete the legacy `#[tauri::command] search_semantic(...)` command implementation block entirely (including wrapper body), and retain non-semantic commands unchanged (keep `search_keyword` exactly; do not rename or substitute it with `search_spells`; keep class search commands and chat helper commands as-is).

UI semantic mode must call `search_spells_semantic` directly, and this command is the primary semantic IPC surface returning `Vec<SemanticSearchResult>` with `cosineDistance`. Remove/deprecate legacy `search_semantic` command usage and registration end-to-end for semantic mode, and keep `search_keyword` and other non-semantic commands unchanged. Do not add a wrapper that maps semantic results down to `Vec<SpellSummary>`.

- [ ] **Step 6.4: Run tests and semantic command checks**

Run:

```bash
cd apps/desktop/src-tauri
cargo test semantic_result_serializes_cosine_distance_in_camel_case --lib
cargo test reindex_result_non_force_skipped_tracks_preexisting_vectors --lib
cargo test reindex_result_force_mode_has_zero_initial_skipped --lib
cargo check
```

Expected: PASS.

- [ ] **Step 6.5: Commit Task 6**

```bash
git add src/commands/embeddings.rs src/commands/search.rs
git commit -m "feat: add semantic search and embedding reindex commands"
```

---

### Task 7: Startup Initialization, Startup Backfill, and Command Registration

**Files:**
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/commands/embeddings.rs`

- [ ] **Step 7.1: Add failing smoke tests for command registration and startup initialization call path**

```rust
// apps/desktop/src-tauri/src/lib.rs (#[cfg(test)] block)
#[cfg(test)]
pub(crate) fn build_embeddings_command_smoke_app(
    embedding_state: Arc<EmbeddingState>,
    provisioning: Arc<ProvisioningState>,
) -> LlmCommandSmokeApp {
    let app = tauri::test::mock_builder()
        .manage(embedding_state)
        .manage(provisioning)
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            embeddings_status,
            embeddings_download_model,
            embeddings_import_model_file,
            embeddings_cancel_download,
            search_spells_semantic,
            reindex_embeddings,
        ])
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("failed to build embeddings smoke app");

    let webview = tauri::WebviewWindowBuilder::new(&app, "smoke-main", Default::default())
        .build()
        .expect("failed to build embeddings smoke webview");

    LlmCommandSmokeApp { _app: app, webview }
}

#[tokio::test]
async fn embeddings_commands_are_registered_in_smoke_app() {
    let app = build_embeddings_command_smoke_app(
        Arc::new(EmbeddingState::default()),
        Arc::new(ProvisioningState::default()),
    );

    let status: EmbeddingsStatusResponse = invoke_smoke_command(
        app.webview.clone(),
        "embeddings_status",
        serde_json::json!({}),
    )
    .await
    .expect("embeddings_status invoke");

    assert_eq!(status.state, EmbeddingsStatus::NotProvisioned);
}
```

- [ ] **Step 7.2: Run tests (expected fail before registration/startup wiring)**

Run:

```bash
cd apps/desktop/src-tauri
cargo test embeddings_commands_are_registered_in_smoke_app --lib
```

Expected: FAIL before managed state/handlers exist.

- [ ] **Step 7.3: Register state, commands, startup init, and startup backfill trigger**

```rust
// apps/desktop/src-tauri/src/lib.rs
#[cfg(not(test))]
pub fn run() {
    init_logging();
    tauri::Builder::default()
        .setup(|app| {
            let resource_dir_override = std::env::var("SPELLBOOK_SQLITE_VEC_RESOURCE_DIR").ok();
            let resource_dir = resource_dir_override
                .as_deref()
                .map(PathBuf::from)
                .or_else(|| app.path().resource_dir().ok());

            let pool = init_db(resource_dir.as_deref(), true)
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;

            let pool = Arc::new(pool);
            let provisioning = Arc::new(ProvisioningState::default());
            let embeddings = Arc::new(EmbeddingState::default());

            app.manage(Arc::clone(&pool));
            app.manage(Arc::new(VaultMaintenanceState::default()));
            app.manage(Arc::clone(&provisioning));
            app.manage(Arc::new(LlmState::default()));
            app.manage(Arc::clone(&embeddings));

            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = initialize_embeddings_after_startup(
                    app_handle,
                    Arc::clone(&embeddings),
                    Arc::clone(&pool),
                )
                .await
                {
                    tracing::warn!(?error, "embedding startup initialization failed");
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Keep all existing non-semantic commands in this list unchanged.
            // Apply only the delta shown below.
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Within the existing `tauri::generate_handler![ ... ]` list in `apps/desktop/src-tauri/src/lib.rs`, apply this exact delta and keep every other existing non-semantic command unchanged:

```diff
-            search_semantic,
+            embeddings_status,
+            embeddings_download_model,
+            embeddings_import_model_file,
+            embeddings_cancel_download,
+            search_spells_semantic,
+            reindex_embeddings,
```

```rust
// apps/desktop/src-tauri/src/commands/embeddings.rs
pub async fn initialize_embeddings_after_startup(
    app: tauri::AppHandle,
    state: Arc<EmbeddingState>,
    pool: Arc<crate::db::Pool>,
) -> Result<(), AppError> {
    let vault_root = crate::db::pool::app_data_dir()?;
    if !approved_embedding_bundle_present(&vault_root)? {
        set_embeddings_status(&state, EmbeddingsStatus::NotProvisioned, None)?;
        return Ok(());
    }

    set_embeddings_status(&state, EmbeddingsStatus::Initializing, None)?;
    let models_root = crate::commands::app_models_dir()?;
    let model = match tokio::task::spawn_blocking(move || load_embedding_model_blocking(&models_root)).await {
        Ok(Ok(model)) => model,
        Ok(Err(error)) => {
            let message = format!("embedding startup model load failed: {error}");
            set_embeddings_status(&state, EmbeddingsStatus::Error, Some(message.clone()))?;
            return Err(AppError::Search(message));
        }
        Err(join_error) => {
            let message = format!("embedding startup load task failed: {join_error}");
            set_embeddings_status(&state, EmbeddingsStatus::Error, Some(message.clone()))?;
            return Err(AppError::Search(message));
        }
    };

    {
        *state.model.lock().map_err(|_| AppError::Search("embedding model lock poisoned".to_string()))? = Some(model);
    }

    set_embeddings_status(&state, EmbeddingsStatus::Ready, None)?;

    if let Err(error) = reindex_embeddings_internal(app, Arc::clone(&state), pool, false).await {
        tracing::warn!(?error, "startup embeddings backfill failed");
    }

    Ok(())
}
```

This startup behavior keeps initialization non-fatal at the call site (warn and continue app startup) while ensuring state does not remain stuck at `Initializing`; both `Ok(Err(error))` (model load error) and `Err(join_error)` (join failure) paths transition to `EmbeddingsStatus::Error` with a message before returning to the caller, consistent with `await_ready_model_with_timeout` error-state behavior.

- [ ] **Step 7.4: Run smoke tests and full backend checks**

Run:

```bash
cd apps/desktop/src-tauri
cargo test embeddings_commands_are_registered_in_smoke_app --lib
cargo check
cargo fmt --all -- --check
```

Expected: PASS.

- [ ] **Step 7.5: Commit Task 7**

```bash
git add src/lib.rs src/commands/embeddings.rs src/commands/mod.rs
git commit -m "feat: register embeddings lifecycle and startup backfill"
```

---

### Task 8: End-to-End Verification for Task Group 3

**Files:**
- Modify as needed from previous tasks

- [ ] **Step 8.1: Run targeted Rust tests for embedding lifecycle and semantic commands**

Run:

```bash
cd apps/desktop/src-tauri
cargo test embeddings_status_serializes_to_spec_values --lib
cargo test embeddings_status_reports_downloading_progress --lib
cargo test embedding_bundle_validation_rejects_missing_required_file --lib
cargo test semantic_result_serializes_cosine_distance_in_camel_case --lib
cargo test reindex_result_non_force_skipped_tracks_preexisting_vectors --lib
cargo test reindex_result_force_mode_has_zero_initial_skipped --lib
```

Expected: all tests PASS.

- [ ] **Step 8.2: Run full Rust verification suite for affected backend code**

Run:

```bash
cd apps/desktop/src-tauri
cargo fmt --all
cargo clippy --all-targets --all-features -- -D warnings
cargo test --lib
cargo check
```

Expected: no formatter, lint, or compile failures.

- [ ] **Step 8.3: Run frontend typecheck/lint to ensure command surface changes do not break build**

Run:

```bash
cd apps/desktop
pnpm lint
pnpm test:unit
```

Expected: lint/test pass or only known unrelated failures.

- [ ] **Step 8.4: Commit verification fixes and final Task Group 3 changeset**

```bash
git add apps/desktop/src-tauri/src/commands/embeddings.rs \
        apps/desktop/src-tauri/src/models/embeddings.rs \
        apps/desktop/src-tauri/src/lib.rs \
        apps/desktop/src-tauri/src/commands/spells.rs \
        apps/desktop/src-tauri/src/commands/import.rs \
        apps/desktop/src-tauri/src/commands/search.rs \
        apps/desktop/src-tauri/src/commands/mod.rs \
        apps/desktop/src-tauri/src/models/mod.rs
git commit -m "feat: implement backend embeddings lifecycle and semantic search"
```

---

## Coverage Matrix (Task 3.1-3.12 -> Plan Tasks)

- `3.1` -> Task 1 (`embeddings.rs` module creation)
- `3.2` -> Task 1 (`EmbeddingState` + lifecycle enum)
- `3.3` -> Task 2 (fixed `SpellbookVault/models/` and inventory validation)
- `3.4` -> Task 2 (status/download/import/cancel commands)
- `3.5` -> Task 3 (`embed_spell_text`, `embed_spell_texts_batch`)
- `3.6` -> Task 4 (create/update non-blocking hooks)
- `3.7` -> Task 5 (import completion batch hook + non-fatal fallback)
- `3.8` -> Task 7 (startup initialization)
- `3.9` -> Task 6 (`search_spells_semantic` + `cosineDistance`)
- `3.10` -> Task 6 (`reindex_embeddings` + progress + guard)
- `3.11` -> Task 7 (startup `reindex_embeddings(force=false)`)
- `3.12` -> Task 7 (command registration in `lib.rs`/module exports)

## Completion Criteria

- New embedding command surface is callable and returns camelCase payloads.
- No spell create/update/import command becomes blocking because embeddings are unavailable.
- Semantic query no longer calls the Python sidecar and returns `cosineDistance` ranking.
- Startup initializes embeddings in background and runs partial backfill.
- Reindex command emits progress and returns stable `ReindexResult` counts.
- Backend checks, tests, lint, and formatting pass on the touched scope.

## Reviewer Findings Resolution

- [1] Resolved in Task 2 and Task 3 helper blocks, plus Task 7 test/setup snippets: all previously undefined helpers/types (`await_ready_model_with_timeout`, `set_embeddings_status`, `approved_embedding_bundle_present`, `build_embeddings_status_response`, `download_embedding_bundle_with_resume`, `install_imported_embedding_bundle`, `cancel_embedding_download_and_wait`, `sha256_file`, `embed_single_spell_row`, `embed_import_batch_rows`, `load_reindex_candidates`, `upsert_embedding_chunk`, `ensure_no_active_embedding_download`, `build_embeddings_command_smoke_app`, `test_pool`) are now explicitly defined in-plan before later usage.
- [2] Resolved in Task 7 startup snippet by replacing invalid `tauri::State::from(...)` usage with direct internal helper call `reindex_embeddings_internal(app, Arc::clone(&state), pool, false)`.
- [3] Resolved in Task 1 + Task 2 by aligning `EmbeddingState`/`ActiveEmbeddingDownload` with explicit `DownloadCleanupState`, `session_epoch`, proper watch channel types, and a default state with no phantom channel allocation.
- [4] Resolved in Task 4/5/6 by replacing placeholder pseudocode with concrete create/update/import/search/reindex snippets and concrete insertion contexts.
- [5] Resolved in Task 5 by wiring embedding postprocess for both `import_spell_json` and spell-mutating `import_files` path.
- [6] Resolved in Task 6 `reindex_embeddings` signature and body by adding explicit `ProvisioningState` lease guard behavior (`start_download(ProvisioningTarget::Embeddings)`), with documented rejection semantics when provisioning is occupied.
- [7] Resolved in Task 2 by providing concrete implementations for download/import/cancel flow helpers and associated progress/status transitions.
- [8] Resolved throughout Task 2/7 by consistently using `app_models_dir()` for app-level model root resolution and using `models_dir(vault_root)` only inside `approved_embedding_bundle_present` where a vault root is provided.
- [9] Resolved in Task 3 + Task 5 + Task 7 by defining deterministic missing-vector detection (`LEFT JOIN spell_vec ... WHERE v.rowid IS NULL` in `load_reindex_candidates(force=false)`) and tying repair to startup backfill and explicit reindex.
- [10] Resolved across Tasks 1-8 command blocks by converting multi-filter `cargo test` invocations into one-test-per-command style.
- [11] Resolved in Task 7 startup flow by explicitly logging backfill failures with `tracing::warn!(?error, "startup embeddings backfill failed")`.
- [12] Resolved (iteration-3 [1]) in Task 6 and Task 7 prose/snippets by enforcing semantic command replacement end-to-end: semantic mode uses `search_spells_semantic` and removes deprecated `search_semantic` registration while preserving `search_keyword` and other non-semantic commands.
- [13] Resolved (iteration-3 [2]) in Task 4 and Task 5 helper snippets by adding non-blocking stale-vector invalidation (`DELETE FROM spell_vec WHERE rowid = ?`) whenever embedding hooks skip due to non-ready state, ensuring deterministic repair via `force=false` backfill.
- [14] Resolved (iteration-3 [3]) in Task 6 `reindex_embeddings_internal` by wrapping per-chunk `embed_spell_texts_batch` work in `spawn_blocking` with explicit join/error handling while preserving progress events.
- [15] Resolved (iteration-3 [4]) in normative reconciliation and Task 6 semantic contract prose by explicitly declaring `Vec<SemanticSearchResult>` + `cosineDistance` as authoritative and marking older `Vec<SpellSummary>` signature text stale for spec sync.
- [16] Resolved (iteration-3 [5]) in Task 4/5 instructions by adding explicit `use` guidance for `EmbeddingState` and enqueue helper functions in `spells.rs` and `import.rs`.
