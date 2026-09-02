# Local LLM Chat Task 2 Backend LLM Model Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete OpenSpec task group 2 for `add-local-llm-chat-interface` by landing the Rust-side LLM lifecycle module: stable state management, model-status reporting, approved file placement, resumable download and verified side-load, explicit cancellation hooks, lazy model loading, and `llm_chat` lifecycle wiring that is ready for the later RAG/prompt work.

**Architecture:** Reuse the approved Task 1 infrastructure instead of re-solving provisioning. `commands/llm.rs` becomes the single lifecycle entry point for the TinyLlama asset and owns four concerns: status derivation, approved-model file management, download/import/cancel flows, and the runtime model/session lifecycle. Download resume keeps the preserved `.part` file as its exclusive resumable path, while verified side-load stages through a separate sibling import-staging path before it enters the shared promotion flow so preserved partial bytes cannot be clobbered by import work; that staged `.import` artifact must then be re-validated immediately before promotion so the exact promoted bytes, not only the originally selected source file, satisfy the approved-asset rules. Keep the global provisioning guard in `commands/provisioning.rs` as the concurrency gate for downloads, add a dedicated `LlmState` managed by Tauri for the loaded `LlamaModel`, backend handle, active generation control, and download control, and make reprovision itself a lease-style lifecycle so busy-state cleanup, runtime invalidation, sticky error recovery, and final status transitions are committed in one place. Because Task Group 2 keeps the v1 `LlmStatus` set fixed, status derivation must surface any claimed reprovision lease, including verified side-load replacement, as externally visible `downloading` while chat is blocked. `llm_chat` should finish non-stateful setup such as `app_data_dir()` before it claims generation ownership, then claim generation ownership before any lazy-load preflight or runtime initialization through one shared generation/reprovision arbitration helper that `begin_generation(...)` and `begin_reprovision(...)` both call. After the claim, split lazy load into a pure preflight phase that can fail without poisoning lifecycle markers and a post-state runtime-init phase whose failures are sticky lifecycle errors, and drive all post-claim exits through one shared internal claimed-generation runner plus finalizer so even preflight/init failures still attempt a terminal done event. The temporary `chat_answer` compatibility path should only synthesize a compatibility stream id and delegate into that same internal claimed-generation runner so claim, cleanup, and finalizer behavior cannot drift. Reprovision commands need the same discipline: once the shared reprovision lease is claimed, every remaining stateful start step, including `begin_download(...)`, must stay inside one top-level finalization path so sticky lifecycle errors cannot leak through bare `?` exits. Make the post-promotion branch mechanical rather than implied: once verified bytes are promoted, flip a local `verified_bytes_promoted` marker and route every later failure through the shared reprovision finalizer with `invalidate_runtime = true` so the loaded runtime is always discarded before the command returns an error.

**Tech Stack:** Rust 2021, Tauri v2 managed state and events, `llama-cpp-2`, `reqwest`, `sha2`, `sysinfo`, `tokio::task::spawn_blocking`, existing provisioning helpers in `commands/provisioning.rs`.

---

## Spec Snapshot

This plan covers exactly these OpenSpec Task Group 2 requirements from `openspec/changes/add-local-llm-chat-interface/tasks.md`:

1. `2.1` Create `apps/desktop/src-tauri/src/commands/llm.rs`.
2. `2.2` Define `LlmState` with `Mutex<Option<LlamaModel>>`, status, active generation state, and download state.
3. `2.3` Implement one shared system-requirements snapshot/helper for RAM `>= 1.5 GB` and disk `>= 800 MB`, then apply caller-specific checks in the download and lazy-load flows.
4. `2.4` Implement `llm_status` with states `notProvisioned | downloading | ready | loaded | error`.
5. `2.5` Implement the fixed `SpellbookVault/models/` path for the approved TinyLlama file.
6. `2.6` Implement model download with HTTP Range resume, camelCase progress payloads, and SHA-256 verification.
7. `2.7` Implement `llm_import_model_file` with exact file identity and SHA-256 validation.
8. `2.8` Implement `llm_cancel_download`.
9. `2.9` Implement `llm_cancel_generation`.
10. `2.10` Implement lazy model load inside `llm_chat` with the system-requirements check.
11. `2.11` Register `llm_status`, `llm_download_model`, `llm_import_model_file`, `llm_cancel_download`, `llm_cancel_generation`, and `llm_chat`.

## Repo Constraints

- Task Group 1 is already the source of truth for the approved crate versions, TinyLlama URL, SHA-256, destination path, resource thresholds, and the shared provisioning guard. Reuse `commands/provisioning.rs`; do not add or rename dependencies. Before implementation starts, explicitly verify that the approved Task Group 1 crates are already present in `apps/desktop/src-tauri/Cargo.toml` and that the required provisioning exports still exist in `apps/desktop/src-tauri/src/commands/provisioning.rs`, then stop if either check fails; Task Group 2 consumes that approved dependency and provisioning surface and must not re-open crate selection or silently recreate missing constants/helpers.
- Follow `apps/desktop/src-tauri/AGENTS.md`: backend commands return `Result<T, AppError>`, blocking work stays inside `spawn_blocking`, runtime logging uses `tracing`, and frontend-visible structs use `#[serde(crate = "serde", rename_all = "camelCase")]`.
- Keep the Python sidecar out of the LLM lifecycle. `services/ml` remains import/export only.
- The current debug Chat UI at `apps/desktop/src/ui/Chat.tsx` still invokes `chat_answer`. Do not strand that surface mid-branch. Keep a temporary compatibility wrapper until the frontend migrates, but have it allocate only a compatibility stream id and delegate into the same shared internal claimed-generation runner that powers `llm_chat`; remove it in the same change set that updates the UI.
- Locking in `llm.rs` is snapshot-first, but every multi-mutex mutation must go through one shared helper so the locking guidance and helper design stay aligned. Runtime load/invalidation uses one helper that acquires `backend` -> `model`, lifecycle marker reads/writes use one helper that acquires `status` -> `last_error`, generation/reprovision arbitration uses one shared helper that acquires `reprovisioning` -> `active_generation` and is called by both `begin_generation(...)` and `begin_reprovision(...)`, and reprovision finalization uses one helper that snapshots `download_state`, then invalidates runtime when required, then writes lifecycle markers, and only then clears `reprovisioning`. Outside those shared helpers, take one guard, copy the data needed for that decision, then drop it before touching the next mutex.

## Planned File Structure

- Create: `apps/desktop/src-tauri/src/commands/llm.rs`
  Purpose: LLM lifecycle commands, model-path helpers, download/import/cancel helpers, lazy load, token streaming, and inline Rust tests for lifecycle behavior.
- Create: `apps/desktop/src-tauri/src/models/llm.rs`
  Purpose: Serde-friendly LLM status enums and event/response structs shared by backend commands and the future frontend IPC layer.
- Modify: `apps/desktop/src-tauri/src/models/mod.rs`
  Purpose: Export the new LLM models.
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
  Purpose: Export `llm` next to the existing command modules.
- Modify: `apps/desktop/src-tauri/src/lib.rs`
  Purpose: Register `Arc<LlmState>` with Tauri managed state and register the new commands in `invoke_handler`.
- Modify: `apps/desktop/src-tauri/src/error.rs`
  Purpose: Add a lifecycle-specific `AppError::Llm(String)` variant so download, load, and inference failures are not misclassified as sidecar errors.
- Modify: `apps/desktop/src-tauri/src/commands/search.rs`
    Purpose: Replace the stub-only `chat_answer` implementation with a short-lived compatibility wrapper that calls the same internal claimed-generation runner used by `llm_chat` until the frontend chat migration lands.

## Guardrails

- Reuse the Task Group 1 provisioning source directly from `crate::db::pool::app_data_dir` and `crate::commands::provisioning::{models_dir, FixedResourceProbe, LiveResourceProbe, ProvisioningState, ProvisioningTarget, ResourceProbe, ResourceSnapshot, TINY_LLAMA_ASSET, TINY_LLAMA_DESTINATION, TINY_LLAMA_URL, TINY_LLAMA_SHA256, TINY_LLAMA_SIZE_BYTES, BASELINE_MIN_FREE_RAM_BYTES, BASELINE_MIN_FREE_DISK_BYTES}`. Task 2 should consume those approved values, not duplicate them, and should expose them through one LLM-specific system-requirements snapshot helper instead of parallel download/load helper stacks. The inline tests in `llm.rs` should import `FixedResourceProbe` and `ResourceSnapshot` explicitly so the plan stays self-contained.
- The Task Group 2 event contract is constrained by the `add-local-llm-chat-interface` llm-chat spec, not by ad hoc frontend invention. Limit backend event surfaces to the spec-required topics and payloads only: `llm://download-progress` emits `DownloadProgressEvent { bytesDownloaded, totalBytes }`, per-stream `llm://token/{streamId}` emits `TokenEvent { token }`, and per-stream `llm://done/{streamId}` emits `DoneEvent { fullResponse, cancelled }`. Do not add alternate topics, extra payload fields, or backend-defined UI semantics in this task group.
- The download admission gate must compare free disk against the shared `BASELINE_MIN_FREE_DISK_BYTES` threshold surfaced through that helper, never against `TINY_LLAMA_ASSET.size`, so Task Group 2 stays aligned with the approved `>= 800 MB` provisioning rule.
- `llm_status` must be a pure snapshot. It must not initialize the backend, load the model, or touch network state. Within the existing v1 state set, any active reprovision lease, including verified side-load replacement with no `download_state`, must surface as externally visible `downloading` so import-time replacement is visible while chat is blocked.
- All blocking filesystem work, SHA-256 scans, resource probes, directory creation, file copy/rename/remove, and `LlamaBackend`/`LlamaModel` initialization must live in dedicated `spawn_blocking` helpers. Async commands still own network IO, state transitions, command entry/exit, and the final done-event path. The one explicit Task Group 2 exception is token emission from the blocking generation loop: the shared `ChatEventSink` must remain `Send + Sync`, and the claimed-generation runner may call that sink from inside the `spawn_blocking` generation worker so the decode loop does not bounce each token back through a separate async relay. All other event emission rules stay unchanged, and filesystem status inputs must still come from blocking helpers instead of direct `Path::exists` or similar probes.
- Keep partial download bytes on network failure or explicit cancellation. The resumable download `.part` path is reserved for download resume only, verified side-load must stage through its own sibling import path, and staged files are deleted only when the final SHA-256 check for that specific staged artifact fails.
- If a lifecycle operation fails after it has touched managed LLM state, record it through `set_lifecycle_error(...)` so `llm_status` returns `status: error` and `lastError`. Sticky lifecycle errors must survive retry start and cancelled reprovision; only explicit successful recovery through `finish_lifecycle_recovery(..., LlmStatus::Ready)` or `finish_lifecycle_recovery(..., LlmStatus::Loaded)` may clear `lastError`. Once a reprovision flow has claimed shared busy state or populated `download_state`, do not let a bare `?` return from the command body directly; bubble that `Result` into the shared reprovision finalizer so post-start failures always settle on sticky lifecycle error state instead of relying on guard-drop rollback. By contrast, lazy-load preflight failures that only read filesystem/resource snapshots or concurrency gates must return plain command errors and leave sticky lifecycle markers unchanged. Task Group 2 lifecycle poison/error paths in `llm.rs` should report through `AppError::Llm(...)`, not the generic unknown bucket.
- Treat download and verified side-load as the same reprovisioning lifecycle. Both flows should do read-only preflight validation before acquiring shared busy state when possible, then obtain a lease-style `ReprovisionGuard` from `begin_reprovision(...)`, with that helper owning the snapshot of the prior lifecycle markers internally instead of requiring callers to pass an ad hoc snapshot. `begin_reprovision(...)` itself must delegate lock-order checks and claim installation to the same shared generation/reprovision arbitration helper that `begin_generation(...)` uses so the busy-state rules live in one place. The guard still rejects while `active_generation` is set, refuses to start while another reprovision is already active, blocks `llm_chat` / lazy load while held, and owns `finish_cancelled`, `finish_error`, and `finish_ready` helpers. After `begin_reprovision(...)` succeeds, each command must build one `StartedReprovisionResult` that includes every post-start state mutation, including `begin_download(...)`, and pass that single result into `finalize_started_reprovision_result(...)` so every post-start success, cancellation, or failure is explicit. `StartedReprovisionResult::Error { invalidate_runtime }` is mandatory once promotion has succeeded: post-promotion cleanup failures must pass `invalidate_runtime: true` so the finalizer clears the loaded runtime before it records the sticky error. `ReprovisionGuard::finish_error(...)` must surface explicit finalization failure instead of swallowing it, and it must only mark the guard finished after `finalize_reprovision(...)` succeeds so `Drop` remains the fallback cleanup path if explicit error finalization fails.
- A successful reprovision always promotes the verified bytes first, then invalidates any loaded in-memory backend/model, then performs a successful recovery write to `ready` that clears `lastError`, and only then clears `reprovisioning` and marks download cleanup complete. That means the post-download or post-import steady state is `ready`, not `loaded`, even if the prior runtime had already lazy-loaded the previous file; the next `llm_chat` call performs a fresh lazy load from disk. If a later cleanup step fails after those verified bytes have already replaced the approved file, that failure still has to take the runtime-invalidation branch before surfacing the error so in-memory state cannot drift from the new on-disk bytes.
- Validate side-loaded files by filename, file size, and SHA-256 before claiming reprovision busy state when possible, then stage them into a dedicated import-staging path that is distinct from the resumable download `.part` path before entering the same promotion flow used by download. Import must reuse the shared staged-copy plus promotion helpers, and it must re-validate the staged `.import` artifact's length and SHA-256 immediately before promotion, so runtime replacement, Windows-safe swap, and final status semantics stay identical between download and verified side-load without risking preserved partial-download bytes or promoting unverified staged bytes.
- `llm_chat` must reject concurrent generation, and generation ownership must be claimed through the same shared generation/reprovision arbitration helper that `begin_reprovision(...)` uses so the `reprovisioning` check and `active_generation` install cannot drift apart. Non-stateful setup such as `app_data_dir()` must happen before the claim, but the claim still happens before lazy-load preflight and runtime initialization so reprovision cannot slip in between the gate check and generation ownership. After the claim, lazy-load preflight may read file/resource/concurrency prerequisites but must not call `record_lifecycle_error(...)`; only failures after backend/model initialization starts or managed runtime slots are mutated become sticky lifecycle errors. Every request that successfully acquires generation ownership must attempt a terminal done-event emit, including lazy-load preflight/init failures that happen before token generation starts, so the frontend never hangs on a claimed stream. Route both `llm_chat` and the temporary compatibility path through one shared internal claimed-generation runner, and use one shared claimed-generation finalizer that builds the terminal `DoneEvent`, preserves the already-determined command result, performs generation-claim cleanup as best-effort logging plus best-effort lifecycle recording, and then performs a truly best-effort emit that only logs on failure; failures before the claim returns are command errors only because no stream was started.
- Keep the lazy-load preflight boundary mechanically explicit in both tests and helpers: `collect_model_load_preflight(...)` owns only read-only snapshot gathering, `validate_model_load_preflight(...)` owns pure gate validation with no managed-state writes, and `ensure_model_loaded_after_valid_preflight(...)` is the first helper allowed to initialize backend/model state or record sticky lifecycle errors. Task Group 2 preflight tests should assert that ownership split directly so implementers do not collapse the read-only and sticky-error phases back together.
- Download resume logic must safely handle all server responses: parse `206 Partial Content` from `Content-Range`, treat `Content-Length` on `206` as remaining bytes rather than total asset size, and only treat `200 OK` as a resume fallback when the server advertises the full approved asset length. The existing `.part` file must remain untouched until the fallback body has been downloaded into a fresh sibling staging file, verified for full length, then re-checked with a final staged-file length validation immediately before SHA-256 verification and promotion; mismatched `Content-Range`, mismatched lengths, short `200 OK` bodies, short final staged files, or other statuses are lifecycle failures that preserve the prior partial file. Once a `*.gguf.restart` fallback staging file exists, it is transient only: cancel and every non-SHA failure path must delete that restart file before finalizing lifecycle state so `.part` remains the only resumable artifact.
- Download cancellation must be cooperative and prompt while the request is blocked on `send()` or `chunk()`: keep a non-lossy `tokio::sync::watch` cancellation channel in `ActiveDownload`, clone a receiver before each blocking await, race `send()` / `chunk()` against `changed()` with `tokio::select!`, and replace the lossy cleanup `Notify` with a non-lossy completion `watch` state. `llm_cancel_download` must not return until the download worker or `ReprovisionGuard` has cleared `download_state`, restored or advanced lifecycle markers appropriately, and then published terminal cleanup completion through that watch channel.
- Promotion from `.part` to the approved final model path must be Windows-safe: if the final approved file already exists, move it aside first, rename the completed `.part` file into place, then remove the backup only after promotion succeeds. If promotion fails after the old approved file has been moved aside, attempt a best-effort restore of that backup. If that restore also fails, surface an explicit `AppError::Llm(...)` that names both the promotion failure and the restore failure and leave the on-disk paths untouched for manual recovery rather than claiming the previous approved file was restored.
- Task Group 2 must not add dependencies. Use std-based helpers for uppercase SHA-256 formatting, temporary test directories, UTF-8 token accumulation, and compatibility stream IDs. Use `reqwest::Response::chunk()` instead of adding stream helper crates.
- Keep the initial runtime prompt minimal and deterministic:

```text
<|im_start|>user
<message>
<|im_end|>
<|im_start|>assistant
```

Task Group 4 will replace that prompt builder with the full RAG/ChatML assembler.

### Pre-Task Gate: Execute the Dependency Preflight Before Task 1

**Files:**
- Read: `docs/DEPENDENCY_SECURITY.md`
- Read: `apps/desktop/src-tauri/Cargo.toml`
- Read: `apps/desktop/src-tauri/src/commands/provisioning.rs`

- [x] **Step 0.1: Re-read the repository dependency policy and confirm Task Group 2 stays dependency-neutral**

Run:

```bash
cd apps/desktop/src-tauri
rg -n "^# Dependency Security Policy|^## Absolute Principles|^### Rust \(Cargo\)" ../../../docs/DEPENDENCY_SECURITY.md
```

Expected: The policy is explicitly re-checked before implementation and the worker confirms this task group must reuse existing crates only.

- [x] **Step 0.2: Verify the approved Task Group 1 crates already exist in `Cargo.toml` before any code changes**

Run:

```bash
cd apps/desktop/src-tauri
rg -n '^(llama-cpp-2|reqwest|sysinfo|sha2)\s*=' Cargo.toml
```

Expected: Exact existing declarations are present for `llama-cpp-2 = { version = "=0.1.145", default-features = false }`, `reqwest = { version = "=0.13.2", default-features = false, features = ["rustls", "stream"] }`, `sysinfo = { version = "=0.38.4", default-features = false, features = ["disk", "system"] }`, and `sha2 = "0.10.9"`.

- [x] **Step 0.3: Verify the required Task Group 1 provisioning exports still exist before Task Group 2 reuses them**

Run:

```bash
cd apps/desktop/src-tauri
rg -n 'pub\s+(const|struct|enum|trait|fn)\s+(models_dir|FixedResourceProbe|LiveResourceProbe|ProvisioningState|ProvisioningTarget|ResourceProbe|ResourceSnapshot|TINY_LLAMA_DESTINATION|TINY_LLAMA_URL|TINY_LLAMA_SHA256|TINY_LLAMA_SIZE_BYTES|BASELINE_MIN_FREE_RAM_BYTES|BASELINE_MIN_FREE_DISK_BYTES)\b' src/commands/provisioning.rs
```

Expected: The Task Group 1 provisioning surface still exports the exact constants, helper traits, and state types that this Task Group 2 plan imports and reuses.

- [x] **Step 0.4: Run one combined pass/fail gate before touching Task 1 so the stop condition is executable instead of implied**

Run:

```bash
cd apps/desktop/src-tauri
rg -q "^# Dependency Security Policy" ../../../docs/DEPENDENCY_SECURITY.md
rg -q '^llama-cpp-2\s*=\s*\{ version = "=0.1.145", default-features = false \}' Cargo.toml
rg -q '^reqwest\s*=\s*\{ version = "=0.13.2", default-features = false, features = \["rustls", "stream"\] \}' Cargo.toml
rg -q '^sysinfo\s*=\s*\{ version = "=0.38.4", default-features = false, features = \["disk", "system"\] \}' Cargo.toml
rg -q '^sha2\s*=\s*"0.10.9"' Cargo.toml
rg -q 'pub\s+(const|struct|enum|trait|fn)\s+models_dir\b' src/commands/provisioning.rs
rg -q 'pub\s+(const|struct|enum|trait|fn)\s+FixedResourceProbe\b' src/commands/provisioning.rs
rg -q 'pub\s+(const|struct|enum|trait|fn)\s+LiveResourceProbe\b' src/commands/provisioning.rs
rg -q 'pub\s+(const|struct|enum|trait|fn)\s+ProvisioningState\b' src/commands/provisioning.rs
rg -q 'pub\s+(const|struct|enum|trait|fn)\s+ProvisioningTarget\b' src/commands/provisioning.rs
rg -q 'pub\s+(const|struct|enum|trait|fn)\s+ResourceProbe\b' src/commands/provisioning.rs
rg -q 'pub\s+(const|struct|enum|trait|fn)\s+ResourceSnapshot\b' src/commands/provisioning.rs
rg -q 'pub\s+const\s+TINY_LLAMA_DESTINATION\b' src/commands/provisioning.rs
rg -q 'pub\s+const\s+TINY_LLAMA_URL\b' src/commands/provisioning.rs
rg -q 'pub\s+const\s+TINY_LLAMA_SHA256\b' src/commands/provisioning.rs
rg -q 'pub\s+const\s+TINY_LLAMA_SIZE_BYTES\b' src/commands/provisioning.rs
rg -q 'pub\s+const\s+BASELINE_MIN_FREE_RAM_BYTES\b' src/commands/provisioning.rs
rg -q 'pub\s+const\s+BASELINE_MIN_FREE_DISK_BYTES\b' src/commands/provisioning.rs
```

Expected: Every command exits successfully. If any `rg -q` exits non-zero, stop immediately, do not start Task 1, and resolve the missing Task Group 1 dependency/policy/provisioning prerequisite before continuing.

Stop condition: If any approved crate line is missing, does not match, or any required provisioning export is absent, stop Task Group 2 immediately and resolve the Task Group 1 approval/provisioning gap first. Do not edit `Cargo.toml`, lockfiles, or `src/commands/provisioning.rs` from this plan.

### Shared Test Helper Scope for Tasks 1-5

All Rust test snippets in Tasks 1-4 live inside the same `#[cfg(test)] mod tests` in `apps/desktop/src-tauri/src/commands/llm.rs` unless a step explicitly says otherwise. Helper ownership is fixed up front so later tasks reuse the earlier seams instead of redefining them in the wrong task:

- Task 1 owns only the foundational module/file helpers such as `test_temp_dir(...)`.
- Task 2 owns every status-only assertion and helper shape around `derive_lifecycle_status(...)`, `build_status_response(...)`, and `status_snapshot(...)`. Later tasks may call those helpers for behavioral assertions, but they should not add new status-only tests or duplicate status-helper definitions outside Task 2.
- Task 3 owns download/import-only test seams and helper scaffolding, including any test-only download driver override and any reprovision-finalizer observer needed by download/import/cancel tests and by Task 5 smoke coverage of `llm_download_model` / `llm_cancel_download`.
- Task 4 owns lazy-load/generation-only test seams, including the explicit test preflight override and runtime-driver override reused by the public `llm_chat` smoke path.
- Task 5 smoke tests are the only separate `#[cfg(test)]` module in `apps/desktop/src-tauri/src/lib.rs`; they may reuse the lib smoke harness plus the Task 3 download seam and Task 4 preflight/runtime seams, but they must not introduce new `llm.rs` test helpers.

### Task 1: Scaffold the LLM Module, Types, and Managed State

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/llm.rs`
- Create: `apps/desktop/src-tauri/src/models/llm.rs`
- Modify: `apps/desktop/src-tauri/src/models/mod.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [x] **Step 1: Write the failing inline tests for the new lifecycle types and state defaults**

```rust
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
        assert_eq!(serde_json::to_string(&LlmStatus::NotProvisioned).unwrap(), "\"notProvisioned\"");
        assert_eq!(serde_json::to_string(&LlmStatus::Downloading).unwrap(), "\"downloading\"");
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
```

- [x] **Step 2: Run the new Rust test target and confirm the missing module/types failure**

Run:

```bash
cd apps/desktop/src-tauri
cargo test llm_state_defaults_to_empty_runtime_state --lib
```

Expected: FAIL with unresolved imports or missing `llm` module/type errors.

- [x] **Step 3: Add the new LLM serde models, foundational helper types, and state containers**

```rust
// apps/desktop/src-tauri/src/models/llm.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub enum LlmStatus {
    NotProvisioned,
    Downloading,
    Ready,
    Loaded,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct LlmStatusResponse {
    pub status: LlmStatus,
    pub model_path: String,
    pub bytes_downloaded: Option<u64>,
    pub total_bytes: Option<u64>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct DownloadProgressEvent {
    pub bytes_downloaded: u64,
    pub total_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct TokenEvent {
    pub token: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(crate = "serde", rename_all = "camelCase")]
pub struct DoneEvent {
    pub full_response: String,
    pub cancelled: bool,
}
```

```rust
// apps/desktop/src-tauri/src/commands/llm.rs
use crate::commands::provisioning::{
    models_dir, FixedResourceProbe, LiveResourceProbe, ProvisioningState,
    ProvisioningTarget, ResourceProbe, ResourceSnapshot, BASELINE_MIN_FREE_DISK_BYTES,
    BASELINE_MIN_FREE_RAM_BYTES, TINY_LLAMA_DESTINATION, TINY_LLAMA_SHA256,
    TINY_LLAMA_SIZE_BYTES, TINY_LLAMA_URL,
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

#[derive(Debug)]
pub struct LlmState {
    pub model: Mutex<Option<LlamaModel>>,
    pub backend: Mutex<Option<LlamaBackend>>,
    pub status: Mutex<LlmStatus>,
    pub last_error: Mutex<Option<String>>,
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
```

- [x] **Step 4: Export the module and register the managed state placeholder**

```rust
// apps/desktop/src-tauri/src/models/mod.rs
pub mod llm;
pub use llm::*;
```

```rust
// apps/desktop/src-tauri/src/commands/mod.rs
pub mod llm;
pub use llm::*;
```

```rust
// apps/desktop/src-tauri/src/lib.rs setup()
app.manage(Arc::new(LlmState::default()));
```

- [x] **Step 5: Re-run the scaffold tests and commit the module skeleton**

Run:

```bash
cd apps/desktop/src-tauri
cargo test llm_status_serializes_to_spec_values --lib
```

Expected: PASS.

Commit:

```bash
git add src/models/llm.rs src/models/mod.rs src/commands/llm.rs src/commands/mod.rs src/lib.rs
git commit -m "feat: scaffold llm lifecycle module"
```

### Task 2: Implement the Approved Path, Shared Requirements Snapshot, and `llm_status`

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/llm.rs`
- Modify: `apps/desktop/src-tauri/src/error.rs`

- [x] **Step 1: Write the failing tests for path resolution, the shared requirements snapshot, and status derivation**

```rust
#[test]
fn approved_model_path_uses_vault_models_directory() {
    let path = approved_llm_model_path(std::path::Path::new("C:/SpellbookVault"));
    assert_eq!(path, std::path::PathBuf::from("C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"));
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
        std::path::Path::new(
            "C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
        ),
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
```

- [x] **Step 2: Run the focused test and confirm the helper/status failures**

Run:

```bash
cd apps/desktop/src-tauri
cargo test approved_model_path_uses_vault_models_directory --lib
```

Expected: FAIL because `approved_llm_model_path`, `collect_llm_system_requirements`, and `status_snapshot` do not exist yet.

- [x] **Step 3: Add the lifecycle-specific error, shared requirements snapshot, and pure status helpers**

```rust
// apps/desktop/src-tauri/src/error.rs
#[error("LLM error: {0}")]
Llm(String),
```

```rust
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

fn apply_lifecycle_snapshot(
    state: &LlmState,
    snapshot: &LifecycleSnapshot,
) -> Result<(), AppError> {
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
```

- [x] **Step 4: Implement pure status derivation plus the `llm_status` command**

```rust
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
    let download_snapshot = state
        .download_state
        .lock()
        .map_err(|_| AppError::Llm("LLM download state is poisoned".to_string()))?;
    let download_snapshot = download_snapshot
        .as_ref()
        .map(|value| (value.bytes_downloaded, value.total_bytes));

    let loaded = state
        .model
        .lock()
        .map_err(|_| AppError::Llm("LLM model state is poisoned".to_string()))?;
    let loaded = loaded.is_some();

    let reprovisioning = state
        .reprovisioning
        .lock()
        .map_err(|_| AppError::Llm("LLM reprovision state is poisoned".to_string()))?;
    let reprovision_active = reprovisioning.is_some();

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
```

- [x] **Step 5: Re-run the status tests and commit the status surface**

Run:

```bash
cd apps/desktop/src-tauri
cargo test llm_status_is_ready_when_model_file_snapshot_exists_but_model_is_not_loaded --lib
```

Expected: PASS.

Commit:

```bash
git add src/commands/llm.rs src/error.rs
git commit -m "feat: add llm status and requirement helpers"
```

### Task 3: Implement Download, Verified Side-Load, and Download Cancellation

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/llm.rs`

- [x] **Step 1: Write the failing tests for SHA validation, resume semantics, and cancellation state reset**

```rust
#[test]
fn import_rejects_wrong_filename_even_when_hash_matches() {
    let dir = test_temp_dir("import-wrong-name");
    let selected = dir.join("wrong-name.gguf");
    std::fs::write(&selected, vec![0_u8; 16]).unwrap();

    let err = validate_selected_model_file(&selected).unwrap_err();
    assert!(matches!(err, AppError::Validation(message) if message.contains("approved TinyLlama file")));
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
    let (completion_tx, completion_rx) = tokio::sync::watch::channel(DownloadCleanupState::Running);
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
    assert!(matches!(err, AppError::Validation(message) if message.contains("full approved asset length")));
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

    assert!(matches!(err, AppError::Validation(message) if message.contains("fallback length mismatch")));
    assert!(partial.exists());
    assert!(!restart.exists());
}

#[test]
fn import_staging_path_is_distinct_from_resumable_download_part_path() {
    let dir = test_temp_dir("import-staging-path");
    let final_path = approved_llm_model_path(&dir);

    assert_ne!(import_staging_model_path(&final_path), final_path.with_extension("gguf.part"));
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
    let mut reprovision = begin_reprovision(Arc::clone(&state), ReprovisionKind::Download)
        .unwrap();
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
    let mut reprovision = begin_reprovision(Arc::clone(&state), ReprovisionKind::Download)
        .unwrap();
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
    assert!(matches!(err, AppError::Validation(message) if message.contains("generation is active")));
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

    assert!(matches!(err, AppError::Llm(message) if message.contains("post-promotion cleanup failed")));
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

    let err = promote_staged_model_with_fs(&RestoreFailingFs, &partial, &final_path)
        .unwrap_err();

    assert!(matches!(err, AppError::Llm(message) if message.contains("promotion blocked") && message.contains("restore blocked")));
    assert!(partial.exists());
    assert!(backup.exists());
}
```

- [x] **Step 2: Run the cancellation/import tests and confirm the missing helper failures**

Run:

```bash
cd apps/desktop/src-tauri
cargo test cancelled_download_keeps_partial_file_and_restores_prior_not_provisioned_state --lib
```

Expected: FAIL because `validate_selected_model_file`, `classify_download_response`, `wait_for_download_cleanup`, `verify_staged_model_length_blocking`, `cleanup_restart_staging_blocking`, `finalize_failed_restart_download_blocking`, `import_staging_model_path`, `PromotionFs`, `promote_staged_model_with_fs`, `ReprovisionGuard`, `StartedReprovisionResult`, `finalize_started_reprovision_result`, `revalidate_staged_import_artifact_blocking`, `stage_import_model_file_blocking`, `LlmDownloadDriver`, `active_llm_download_driver`, `install_test_download_driver`, `install_test_runtime_invalidation_observer`, and the shared staged-promotion behavior in `promote_staged_model_blocking` do not exist yet.

- [x] **Step 3: Add the deterministic file-validation, response-classification, reprovision-finalizer adapters, and download/import test seams**

```rust
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
    let file_name = path.file_name().and_then(|value| value.to_str()).ok_or_else(|| {
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
    RestartFromFreshStaging { total_bytes: u64 },
}

fn parse_content_range(content_range: &str) -> Result<(u64, u64, u64), AppError> {
    let value = content_range
        .strip_prefix("bytes ")
        .ok_or_else(|| AppError::Validation("Range response is missing the bytes unit".to_string()))?;
    let (range, total) = value
        .split_once('/')
        .ok_or_else(|| AppError::Validation("Range response is missing the total size".to_string()))?;
    let (start, end) = range
        .split_once('-')
        .ok_or_else(|| AppError::Validation("Range response is missing the byte range".to_string()))?;

    let start = start
        .parse::<u64>()
        .map_err(|_| AppError::Validation("Range response has an invalid start offset".to_string()))?;
    let end = end
        .parse::<u64>()
        .map_err(|_| AppError::Validation("Range response has an invalid end offset".to_string()))?;
    let total = total
        .parse::<u64>()
        .map_err(|_| AppError::Validation("Range response has an invalid total size".to_string()))?;

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

            Ok(DownloadResponsePlan::RestartFromFreshStaging {
                total_bytes: TINY_LLAMA_SIZE_BYTES,
            })
        }
        other => Err(AppError::Validation(format!(
            "Model download returned unsupported status {other}"
        ))),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct DownloadTargetPrep {
    existing_len: u64,
    restart_path: PathBuf,
}

fn prepare_download_target(final_path: &Path, temp_path: &Path) -> Result<DownloadTargetPrep, AppError> {
    let parent = final_path.parent().ok_or_else(|| {
        AppError::Llm("Approved LLM model path is missing a parent directory".to_string())
    })?;
    std::fs::create_dir_all(parent)?;

    let existing_len = match std::fs::metadata(temp_path) {
        Ok(metadata) => metadata.len(),
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
    if temp_path.exists() {
        std::fs::remove_file(temp_path)?;
    }
    Ok(())
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
    Generation { cancel: Arc<AtomicBool> },
    Reprovision {
        lifecycle_before_reprovision: LifecycleSnapshot,
    },
}

fn claim_generation_reprovision_arbitration(
    state: &LlmState,
    request: LifecycleArbitrationRequest,
) -> Result<LifecycleArbitrationClaim, AppError> {
    let lifecycle_before_reprovision = match request {
        LifecycleArbitrationRequest::BeginReprovision(_) => Some(snapshot_lifecycle_markers(state)?),
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
        (download.cancel_tx.clone(), download.completion_tx.subscribe())
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
    std::fs::create_dir_all(staged_path.parent().unwrap())?;
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
            "Staged import artifact SHA-256 does not match the approved TinyLlama asset".to_string(),
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

type LlmDownloadDriverFuture = std::pin::Pin<
    Box<dyn std::future::Future<Output = StartedReprovisionResult> + Send + 'static>,
>;

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

    Arc::new(DefaultLlmDownloadDriver::default())
}

#[cfg(test)]
static TEST_RUNTIME_INVALIDATION_OBSERVER:
    std::sync::Mutex<Option<Arc<std::sync::atomic::AtomicBool>>> =
        std::sync::Mutex::new(None);

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
```

These helper sketches now close both cleanup gaps and the missing seam/test-ownership gaps that the tests are exercising. `cleanup_restart_staging_blocking(...)` is the narrow primitive that deletes only the transient `*.gguf.restart` file, `finalize_failed_restart_download_blocking(...)` centralizes the required "delete restart, preserve .part, then return the original non-SHA error" behavior, and `finalize_non_sha_download_error(...)` is the async bridge the concrete download flow must call for every post-restart non-SHA failure branch. `remove_stale_partial_after_restart_blocking(...)` and `remove_stale_partial_after_restart(...)` are the separate post-promotion cleanup helpers that the `verified_bytes_promoted` branch calls after the approved file has already been replaced; they delete only the stale `*.part` resumable artifact, treat missing partials as success, and fail loudly if the path is anything other than a file so the finalizer can pair that cleanup failure with `invalidate_runtime: true`. `stage_import_model_file_blocking(...)` still centralizes the verified side-load rule split: validate the user-selected source file before the copy, then re-validate the staged `.import` artifact immediately before promotion so the bytes that will actually be promoted are re-checked in-place. The added `LlmDownloadDriver` seam is owned by Task 3 because the real `llm_download_model` command lives here; Task 5 smoke coverage reuses that seam instead of performing network IO. The runtime-invalidation observer is also owned by Task 3 because it exists only to make reprovision finalizer behavior directly testable. `StartedReprovisionResult::Error { invalidate_runtime }` remains the critical finalization change: once promotion has succeeded, later cleanup failures must set `invalidate_runtime: true` so `finalize_started_reprovision_result(...)` clears the loaded runtime before it records sticky error state. Together, those helpers cover restart-target creation, progress reset, chunk reads, chunk appends, progress-event emission, staged-length verification, SHA-task join/IO failures, staged-import verification, promotion failures, post-promotion stale-part cleanup, runtime invalidation, and the explicit download-command smoke seam so cleanup and validation behavior cannot drift across ad hoc exits.

- [x] **Step 4: Implement resumable download and explicit cancellation**

```rust
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

    let mut reprovision = begin_reprovision(
        Arc::clone(llm_state.inner()),
        ReprovisionKind::Download,
    )?;

    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
    let (completion_tx, _completion_rx) =
        tokio::sync::watch::channel(DownloadCleanupState::Running);

    let download_driver = active_llm_download_driver();
    let started_result = {
        let state = Arc::clone(llm_state.inner());
        let app = app.clone();
        let temp_path = temp_path.clone();
        let final_path = final_path.clone();
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
```

Inside `DefaultLlmDownloadDriver::run_started_download(...)`, keep every post-start branch inside that one returned `StartedReprovisionResult` instead of mixing `?`, `Err(...)`, and direct command exits:

```rust
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
            enum DownloadFlowOutcome {
                Ready,
                Cancelled,
                PromotedFromRestart,
            }

            let flow_result = run_download_chunks_verify_and_promote(
                app,
                state.as_ref(),
                cancel_rx,
                target_prep,
                temp_path.clone(),
                final_path,
            )
            .await;

            match flow_result {
                Ok(DownloadFlowOutcome::Ready) => StartedReprovisionResult::Ready,
                Ok(DownloadFlowOutcome::Cancelled) => StartedReprovisionResult::Cancelled,
                Ok(DownloadFlowOutcome::PromotedFromRestart) => {
                    if let Err(error) = remove_stale_partial_after_restart(temp_path.clone()).await {
                        return StartedReprovisionResult::Error {
                            error,
                            invalidate_runtime: true,
                        };
                    }

                    StartedReprovisionResult::Ready
                }
                Err(error) => StartedReprovisionResult::Error {
                    error,
                    invalidate_runtime: false,
                },
            }
        })
    }
}
```

If the server ignores `Range` and replies with `200 OK`, the plan above keeps the existing `.part` file untouched and downloads the replacement body into `*.gguf.restart`. Only after the fallback body proves the full approved asset length, then passes a final staged-file length check, and then passes SHA-256 verification does promotion proceed and the stale partial get cleaned up. A valid resume still requires `206 Partial Content` with a matching `Content-Range`, where `Content-Range` supplies the total asset size and `Content-Length` only confirms the remaining bytes. Cancellation uses one `watch` channel for the cancel request and a second `watch` state for cleanup completion, so late waiters in `llm_cancel_download` still observe completion after `download_state` has been cleared. The fallback `*.gguf.restart` file is never resumable state: once restart staging exists, every non-SHA branch in the concrete flow now routes through `Err(AppError)` from `run_download_chunks_verify_and_promote(...)`, and the driver converts that one error into `StartedReprovisionResult::Error { ... }` before finalization. Keep the post-promotion cleanup branches mechanically separate from the pre-promotion failure branches: `run_download_chunks_verify_and_promote(...)` should return `Ok(DownloadFlowOutcome::PromotedFromRestart)` only after verified bytes have replaced the approved file, and the driver must then run `remove_stale_partial_after_restart(...)` plus any later cleanup in the `invalidate_runtime: true` branch. Most importantly, once reprovision has started, even the first post-start mutation in `begin_download(...)` now lives inside the single `StartedReprovisionResult` body returned by the download driver and finalized exactly once by `finalize_started_reprovision_result(...)`, so sticky lifecycle errors cannot escape through scattered `map_err(...)` calls, bare post-start `?` returns, or direct `Err(...)` exits.

- [x] **Step 5: Add the side-load and cancellation commands, then verify the tests**

```rust
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

    let mut reprovision = begin_reprovision(
        Arc::clone(state.inner()),
        ReprovisionKind::Import,
    )?;

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
                move || promote_staged_model_blocking(&staged_path, &destination)
            })
            .await;

            match promotion_result {
                Ok(Ok(())) => {
                    verified_bytes_promoted = true;
                }
                Ok(Err(error)) => {
                    return StartedReprovisionResult::Error {
                        error,
                        invalidate_runtime: false,
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
            .map_err(|join_error| AppError::Llm(format!("LLM import staging cleanup task failed: {join_error}")))
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
    let Some((cancel_tx, completion_rx)) =
        current_download_control(state.inner().as_ref())?
    else {
        return Ok(());
    };

    let _ = cancel_tx.send(true);
    wait_for_download_cleanup(completion_rx).await
}
```

This keeps import coordination aligned with download coordination: both commands take the shared provisioning lease, both block while a generation is active, import performs read-only filename/size/SHA preflight before it claims the shared reprovision busy state, import stages through a dedicated `*.gguf.import` path so a preserved resumable `.part` file survives verified side-load attempts, and import now re-validates that staged artifact immediately before promotion so the promoted bytes are the bytes that satisfy the approved-asset rules. Both commands reuse the same staged promotion path once their own staged artifact is ready, both route the entire post-start body through a single `StartedReprovisionResult` that is finalized exactly once by `finalize_started_reprovision_result(...)`, and neither command allows a post-start bare `?` or direct `Err(...)` return to skip sticky lifecycle finalization. If verified bytes were already promoted when a later cleanup step fails, that error path still invalidates the loaded runtime before the error returns. The Windows-safe promotion helper now only promises a best-effort restore of the previous approved file; if that restore fails, the lifecycle error names both failures explicitly.

Run:

```bash
cd apps/desktop/src-tauri
cargo test import_model_file_happy_path_stages_revalidates_and_promotes_verified_bytes_into_vault --lib
```

Expected: PASS.
Commit:

```bash
git add src/commands/llm.rs
git commit -m "feat: add llm download and import lifecycle"
```

### Task 4: Implement Lazy Load, Generation Cancellation, and the `llm_chat` Runtime Shell

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/llm.rs`

- [x] **Step 1: Write the failing tests for the three-phase lazy-load split, generation gating, and concurrent-generation rejection**

```rust
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
            Box::pin(async {
                unreachable!("generation is not part of this phase-split test")
            })
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
    assert!(matches!(err, AppError::Validation(message) if message.contains("not been provisioned")));
}

#[test]
fn validate_model_load_prerequisites_rejects_low_ram_before_model_load() {
    let requirements = LlmSystemRequirementsSnapshot {
        free_disk_bytes: BASELINE_MIN_FREE_DISK_BYTES,
        free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES - 1,
    };

    let err = validate_model_load_prerequisites(true, requirements).unwrap_err();
    assert!(matches!(err, AppError::Validation(message) if message.contains("1.5 GB free required")));
}

#[test]
fn lazy_load_preflight_errors_leave_lifecycle_markers_unchanged() {
    let state = LlmState::default();
    let requirements = LlmSystemRequirementsSnapshot {
        free_disk_bytes: BASELINE_MIN_FREE_DISK_BYTES,
        free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES - 1,
    };

    let err = validate_model_load_prerequisites(true, requirements).unwrap_err();
    assert!(matches!(err, AppError::Validation(message) if message.contains("1.5 GB free required")));
    assert_eq!(*state.status.lock().unwrap(), LlmStatus::NotProvisioned);
    assert!(state.last_error.lock().unwrap().is_none());
}

#[test]
fn begin_generation_rejects_second_active_stream() {
    let state = LlmState::default();
    begin_generation(&state, "stream-1".to_string()).unwrap();

    let err = begin_generation(&state, "stream-2".to_string()).unwrap_err();
    assert!(matches!(err, AppError::Validation(message) if message.contains("already being generated")));
}

#[test]
fn begin_generation_rejects_when_reprovision_is_active() {
    let state = LlmState::default();
    *state.reprovisioning.lock().unwrap() = Some(ReprovisionKind::Download);

    let err = begin_generation(&state, "stream-1".to_string()).unwrap_err();
    assert!(matches!(err, AppError::Validation(message) if message.contains("being provisioned")));
}

#[test]
fn cancel_generation_marks_active_stream_cancelled() {
    let state = LlmState::default();
    begin_generation(&state, "stream-1".to_string()).unwrap();

    cancel_generation(&state, "stream-1").unwrap();

    let active = state.active_generation.lock().unwrap();
    assert!(active.as_ref().unwrap().cancel.load(std::sync::atomic::Ordering::SeqCst));
}

#[test]
fn ensure_model_loaded_rejects_during_reprovision() {
    let state = LlmState::default();
    *state.reprovisioning.lock().unwrap() = Some(ReprovisionKind::Download);

    let err = ensure_no_reprovision_in_progress(&state).unwrap_err();
    assert!(matches!(err, AppError::Validation(message) if message.contains("being provisioned")));
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
```

- [x] **Step 2: Run the generation tests and confirm the missing lifecycle helper failures**

Run:

```bash
cd apps/desktop/src-tauri
cargo test validate_model_load_prerequisites_rejects_missing_provisioned_model --lib
```

Expected: FAIL because `collect_model_load_preflight`, `validate_model_load_preflight`, `ensure_model_loaded_after_valid_preflight`, `LlmRuntimeFuture`, `LlmRuntimeDriver`, `DefaultLlmRuntimeDriver`, `active_llm_runtime_driver`, `install_test_model_load_preflight`, `install_test_runtime_driver`, `finish_model_load_success`, `ChatEventSink`, `TauriChatEventSink`, `CompatChatEventSink`, `run_claimed_llm_chat`, `build_done_event`, `finish_generation_best_effort`, `finalize_claimed_generation`, and the generation-control helpers do not exist yet.

- [x] **Step 3: Implement blocking model load, generation control, and a minimal real streaming loop**

```rust
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
            active.cancel.store(true, std::sync::atomic::Ordering::SeqCst);
        }
    }
    Ok(())
}

static COMPAT_STREAM_COUNTER: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(1);

#[derive(Debug, Clone)]
struct ChatRunOutput {
    full_response: String,
    cancelled: bool,
}

type LlmRuntimeFuture<T> = std::pin::Pin<
    Box<dyn std::future::Future<Output = T> + Send + 'static>,
>;

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
fn install_test_model_load_preflight(
    preflight: ModelLoadPreflight,
) -> TestModelLoadPreflightGuard {
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

    Arc::new(DefaultLlmRuntimeDriver::default())
}

fn build_done_event(
    run_result: &Result<ChatRunOutput, AppError>,
    cancelled: bool,
) -> DoneEvent {
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
    validate_model_load_prerequisites(
        preflight.approved_model_present,
        preflight.requirements,
    )?;

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
        *backend_guard = Some(
            LlamaBackend::init()
                .map_err(|error| AppError::Llm(format!("Failed to initialize llama backend: {error}")))?,
        );
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
        let model = LlamaModel::load_from_file(backend, &model_path, &params)
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

        while n_cur <= n_ctx as i32 {
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
        tracing::warn!(stream_id, ?error, "Failed to clear active LLM generation claim");
        let _ = set_lifecycle_error(state, error.to_string());
    }
}

async fn run_claimed_llm_chat(
    state: Arc<LlmState>,
    message: String,
    stream_id: String,
    event_sink: Arc<dyn ChatEventSink>,
) -> Result<ChatRunOutput, AppError> {
    let vault_root = app_data_dir()?;
    let cancel = begin_generation(state.as_ref(), stream_id.clone())?;
    let runtime_driver = active_llm_runtime_driver();

    let run_result = async {
        let preflight = tokio::task::spawn_blocking({
            let vault_root = vault_root.clone();
            move || collect_model_load_preflight(&vault_root)
        })
        .await
        .map_err(|error| AppError::Llm(format!("LLM preflight task failed: {error}")))??;

        let validated_preflight = validate_model_load_preflight(state.as_ref(), preflight)?;

        runtime_driver
            .ensure_loaded(Arc::clone(&state), validated_preflight)
            .await?;

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
        Arc::new(CompatChatEventSink::default()),
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
```

This keeps the lazy-load phases mechanically testable before any `LlamaBackend::init` or `LlamaModel::load_from_file` work begins: `collect_model_load_preflight(...)` gathers plain preflight inputs and must stay read-only, `validate_model_load_preflight(...)` converts that raw preflight into a `ValidatedModelLoadPreflight` token and must stay pure, and the Task 4 seams make `ensure_loaded(...)` the first post-validation mutator that can initialize runtime state or record sticky lifecycle errors. The new seams are not only test-description artifacts: `run_claimed_llm_chat(...)`, `llm_chat`, and `llm_chat_answer_compat` all route through the same explicit preflight override plus `active_llm_runtime_driver()` in the planned runtime path, so Task 5 can inject both deterministic preflight state and a recording runtime driver into the real public `llm_chat` command without forking a parallel code path. `app_data_dir()` still happens before generation ownership is claimed, the claim still happens before lazy-load preflight so reprovision cannot slip into the gap, and both public chat entry points continue through `run_claimed_llm_chat(...)` plus `finalize_claimed_generation(...)` so lazy-load preflight/init failures still attempt a terminal done event instead of leaving either caller hanging. Task 4 also makes the async-boundary exception explicit: the blocking llama decode loop may emit token chunks through a `Send + Sync` `ChatEventSink` from inside `spawn_blocking`, while the final done event remains on the claimed-generation finalizer path. The checklist now includes both the three explicit phase-split tests and a real finalizer-path test where `emit_done(...)` fails, proving the terminal done-event failure path preserves the original command result while still clearing the active claim. Cleanup and terminal emit are both best-effort paths that can log and attempt lifecycle recording, but they cannot replace the already-determined command result.

- [x] **Step 4: Re-run the generation tests and commit the runtime shell**

Run:

```bash
cd apps/desktop/src-tauri
cargo test cancel_generation_marks_active_stream_cancelled --lib
```

Expected: PASS.

Commit:

```bash
git add src/commands/llm.rs
git commit -m "feat: add llm load and generation lifecycle"
```

### Task 5: Wire Command Registration, Preserve the Temporary Compatibility Path, and Verify the Backend Surface

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/llm.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/commands/search.rs`

- [x] **Step 1: Write the failing compile-level test by registering the new commands**

Update the invoke list first so the compiler forces every command signature to be valid:

```rust
// apps/desktop/src-tauri/src/lib.rs
llm_status,
llm_download_model,
llm_import_model_file,
llm_cancel_download,
llm_cancel_generation,
llm_chat,
```

Run:

```bash
cd apps/desktop/src-tauri
cargo check
```

Expected: FAIL until every command signature and import is wired correctly.

- [x] **Step 2: Keep the current Chat UI working by redirecting `chat_answer` instead of deleting it immediately**

```rust
// apps/desktop/src-tauri/src/commands/search.rs
use crate::commands::llm::llm_chat_answer_compat;

#[tauri::command]
pub async fn chat_answer(
    llm_state: State<'_, Arc<LlmState>>,
    prompt: String,
) -> Result<ChatResponse, AppError> {
    // Temporary compatibility path for apps/desktop/src/ui/Chat.tsx.
    // Remove this wrapper in the same branch where the frontend migrates to llm_chat + events.
    let answer = llm_chat_answer_compat(
        Arc::clone(llm_state.inner()),
        prompt,
    )
    .await?;

    Ok(ChatResponse {
        answer,
        citations: Vec::new(),
        meta: serde_json::json!({"source": "llm_chat_compat"}),
    })
}
```

This bridge is executable without new dependencies because it only allocates a compatibility stream id and then reuses the same internal claimed-generation runner, lazy-load gates, and terminal-finalizer path as `llm_chat`, but returns a single `String` instead of building an event subscription layer inside the backend.

- [x] **Step 3: Finish the invoke-handler wiring and remove stale sidecar assumptions**

```rust
// apps/desktop/src-tauri/src/lib.rs
search_keyword,
search_semantic,
list_facets,
save_search,
list_saved_searches,
delete_saved_search,
chat_answer,
llm_status,
llm_download_model,
llm_import_model_file,
llm_cancel_download,
llm_cancel_generation,
llm_chat,
```

This is the minimum safe intermediate state: the new lifecycle commands exist, and the old UI keeps functioning until the frontend migration lands.

- [x] **Step 4: Add lightweight public-command smoke coverage now that wiring exists**

Keep these smoke tests lightweight and reproducible by using Tauri's built-in unit-test harness directly instead of hitting the network or the real filesystem/resource probes. In `src/lib.rs`, build a `MockRuntime` app with `tauri::test::{mock_builder, mock_context, noop_assets, get_ipc_response, INVOKE_KEY}` and a real `WebviewWindowBuilder`. Reuse the Task 3 `install_test_download_driver(...)` seam for `llm_download_model` smoke coverage so the test drives the real public command surface without real HTTP. Reuse the Task 4 `install_test_model_load_preflight(...)` and `install_test_runtime_driver(...)` seams so the public `llm_chat` smoke path uses a deterministic preflight/runtime setup instead of relying on ambient `app_data_dir()` or real model files. The cancel smoke must start `llm_download_model`, wait until the fake download driver reports that `begin_download(...)` has already populated public state, and only then invoke `llm_cancel_download`; that ordering is mandatory so the smoke proves the public cancel command is observing a real in-flight download path instead of racing an unstarted command.

```rust
// src/lib.rs
#[cfg(test)]
pub(crate) struct LlmCommandSmokeApp {
    _app: tauri::App<tauri::test::MockRuntime>,
    webview: tauri::WebviewWindow<tauri::test::MockRuntime>,
}

#[cfg(test)]
pub(crate) fn build_llm_command_smoke_app(
    llm_state: Arc<LlmState>,
    provisioning: Arc<ProvisioningState>,
) -> LlmCommandSmokeApp {
    let app = tauri::test::mock_builder()
        .manage(llm_state)
        .manage(provisioning)
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            chat_answer,
            llm_status,
            llm_download_model,
            llm_import_model_file,
            llm_cancel_download,
            llm_cancel_generation,
            llm_chat,
        ])
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("failed to build LLM smoke app");

    let webview = tauri::WebviewWindowBuilder::new(&app, "smoke-main", Default::default())
        .build()
        .expect("failed to build LLM smoke webview");

    LlmCommandSmokeApp { _app: app, webview }
}

#[cfg(test)]
pub(crate) async fn invoke_smoke_command<T>(
    webview: tauri::WebviewWindow<tauri::test::MockRuntime>,
    command: &str,
    body: serde_json::Value,
) -> Result<T, serde_json::Value>
where
    T: serde::de::DeserializeOwned + Send + 'static,
{
    let request = tauri::webview::InvokeRequest {
        cmd: command.to_string(),
        callback: tauri::ipc::CallbackFn(0),
        error: tauri::ipc::CallbackFn(1),
        url: "http://tauri.localhost".parse().unwrap(),
        body: tauri::ipc::InvokeBody::Json(body),
        headers: Default::default(),
        invoke_key: tauri::test::INVOKE_KEY.to_string(),
    };

    tokio::task::spawn_blocking(move || tauri::test::get_ipc_response(&webview, request))
        .await
        .unwrap()
        .map(|body| body.deserialize::<T>().unwrap())
}

#[cfg(test)]
pub(crate) fn listen_smoke_event<T>(
    webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
    event_name: &str,
) -> tokio::sync::mpsc::UnboundedReceiver<T>
where
    T: serde::de::DeserializeOwned + Send + 'static,
{
    use tauri::Listener;

    let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
    webview.listen(event_name.to_string(), move |event| {
        let payload = serde_json::from_str::<T>(event.payload()).unwrap();
        tx.send(payload).unwrap();
    });
    rx
}

```

The builder definitions above are the required smoke-test infrastructure, not optional sketches. `build_llm_command_smoke_app(...)` must use the same plugin registration and invoke-handler list as `run()` for the LLM commands, and `invoke_smoke_command(...)` must go through `tauri::test::get_ipc_response(...)` with a real `InvokeRequest` so the tests exercise the registered IPC surface rather than calling Rust functions directly. The only test seams allowed here are the ones already introduced earlier in the plan: Task 3's `install_test_download_driver(...)` for public download/cancel coverage, and Task 4's `install_test_model_load_preflight(...)` plus `install_test_runtime_driver(...)` for public chat coverage.

Implement the three smoke tests with these exact lightweight fixtures and code-level bodies:

```rust
// apps/desktop/src-tauri/src/lib.rs
#[cfg(test)]
mod llm_command_smoke_tests {
    use super::{build_llm_command_smoke_app, invoke_smoke_command, listen_smoke_event};
    use crate::commands::llm::{
        DownloadTargetPrep,
        install_test_download_driver,
        install_test_model_load_preflight,
        install_test_runtime_driver,
        LlmDownloadDriver,
        LlmDownloadDriverFuture,
        LlmState,
        LlmSystemRequirementsSnapshot,
        ModelLoadPreflight,
        RecordingRuntimeDriver,
        StartedReprovisionResult,
    };
    use crate::commands::provisioning::{
        ProvisioningState,
        BASELINE_MIN_FREE_DISK_BYTES,
        BASELINE_MIN_FREE_RAM_BYTES,
    };
    use crate::models::{DoneEvent, LlmStatus, LlmStatusResponse, TokenEvent};
    use std::sync::Arc;
    use tokio::time::{timeout, Duration};

    #[derive(Clone, Default)]
    struct PausedSmokeDownloadDriver {
        started_after_begin_download: Arc<tokio::sync::Notify>,
        release_result: Arc<tokio::sync::Notify>,
    }

    impl LlmDownloadDriver for PausedSmokeDownloadDriver {
        fn run_started_download(
            &self,
            _app: tauri::AppHandle,
            _state: Arc<LlmState>,
            mut cancel_rx: tokio::sync::watch::Receiver<bool>,
            _target_prep: DownloadTargetPrep,
            _temp_path: std::path::PathBuf,
            _final_path: std::path::PathBuf,
        ) -> LlmDownloadDriverFuture {
            let driver = self.clone();
            Box::pin(async move {
                driver.started_after_begin_download.notify_waiters();
                let _ = cancel_rx.changed().await;
                driver.release_result.notified().await;
                StartedReprovisionResult::Cancelled
            })
        }
    }

    #[derive(Clone, Default)]
    struct ReadySmokeDownloadDriver;

    impl LlmDownloadDriver for ReadySmokeDownloadDriver {
        fn run_started_download(
            &self,
            _app: tauri::AppHandle,
            _state: Arc<LlmState>,
            _cancel_rx: tokio::sync::watch::Receiver<bool>,
            _target_prep: DownloadTargetPrep,
            _temp_path: std::path::PathBuf,
            _final_path: std::path::PathBuf,
        ) -> LlmDownloadDriverFuture {
            Box::pin(async { StartedReprovisionResult::Ready })
        }
    }

    #[tokio::test]
    async fn llm_cancel_download_command_waits_for_in_flight_download_completion() {
        let llm_state = Arc::new(LlmState::default());
        let provisioning = Arc::new(ProvisioningState::default());
        let driver = PausedSmokeDownloadDriver::default();
        let _driver_guard = install_test_download_driver(Arc::new(driver.clone()));

        let smoke = build_llm_command_smoke_app(
            Arc::clone(&llm_state),
            Arc::clone(&provisioning),
        );

        let download_future = tokio::spawn(invoke_smoke_command::<()>(
            smoke.webview.clone(),
            "llm_download_model",
            serde_json::json!({}),
        ));
        driver.started_after_begin_download.notified().await;

        let mut cancel_future = tokio::spawn(invoke_smoke_command::<()>(
            smoke.webview.clone(),
            "llm_cancel_download",
            serde_json::json!({}),
        ));
        assert!(timeout(Duration::from_millis(10), &mut cancel_future).await.is_err());

        driver.release_result.notify_waiters();

        assert!(download_future.await.unwrap().is_ok());
        cancel_future.await.unwrap().unwrap();

        assert!(llm_state.download_state.lock().unwrap().is_none());
        assert!(llm_state.reprovisioning.lock().unwrap().is_none());
    }

    #[tokio::test]
    async fn llm_chat_command_emits_token_and_done_events_through_app_event_sink() {
        let llm_state = Arc::new(LlmState::default());
        let provisioning = Arc::new(ProvisioningState::default());
        let _preflight_guard = install_test_model_load_preflight(ModelLoadPreflight {
            model_path: std::path::PathBuf::from(
                "C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
            ),
            approved_model_present: true,
            requirements: LlmSystemRequirementsSnapshot {
                free_disk_bytes: BASELINE_MIN_FREE_DISK_BYTES,
                free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES,
            },
        });
        let _driver_guard =
            install_test_runtime_driver(Arc::new(RecordingRuntimeDriver::default()));

        let smoke = build_llm_command_smoke_app(
            Arc::clone(&llm_state),
            Arc::clone(&provisioning),
        );
        let mut token_events = listen_smoke_event::<TokenEvent>(&smoke.webview, "llm://token/smoke-1");
        let mut done_events = listen_smoke_event::<DoneEvent>(&smoke.webview, "llm://done/smoke-1");

        invoke_smoke_command::<()>(
            smoke.webview.clone(),
            "llm_chat",
            serde_json::json!({
                "message": "hello",
                "streamId": "smoke-1",
            }),
        )
            .await
            .unwrap();

        let token = token_events.recv().await.unwrap();
        assert_eq!(token.token, "ok");

        let done = done_events.recv().await.unwrap();
        assert_eq!(done.full_response, "ok");
        assert!(!done.cancelled);
    }

    #[tokio::test]
    async fn registered_llm_commands_observe_same_app_managed_llm_state() {
        let llm_state = Arc::new(LlmState::default());
        let provisioning = Arc::new(ProvisioningState::default());
        let _download_driver_guard =
            install_test_download_driver(Arc::new(ReadySmokeDownloadDriver::default()));

        let smoke = build_llm_command_smoke_app(
            Arc::clone(&llm_state),
            Arc::clone(&provisioning),
        );

        *llm_state.status.lock().unwrap() = LlmStatus::Ready;

        let status = invoke_smoke_command::<LlmStatusResponse>(
            smoke.webview.clone(),
            "llm_status",
            serde_json::json!({}),
        )
            .await
            .unwrap();
        assert_eq!(status.status, LlmStatus::Ready);

        let download_future = tokio::spawn(invoke_smoke_command::<()>(
            smoke.webview.clone(),
            "llm_download_model",
            serde_json::json!({}),
        ));
        assert!(download_future.await.unwrap().is_ok());

        assert!(llm_state.download_state.lock().unwrap().is_none());
        assert!(llm_state.reprovisioning.lock().unwrap().is_none());

        let status_after_download = invoke_smoke_command::<LlmStatusResponse>(
            smoke.webview.clone(),
            "llm_status",
            serde_json::json!({}),
        )
        .await
        .unwrap();
        assert_eq!(status_after_download.status, LlmStatus::Ready);
    }
}
```

The first smoke test now has the correct ordering and a deterministic seam: the fake download driver is installed first, `llm_download_model` is invoked through the real IPC surface, the test waits until the driver signals that `begin_download(...)` has already populated public state, and only then invokes `llm_cancel_download`. That fixes the prior race where the cancel assertion ran before a public download path could exist. The second test keeps both the `TestModelLoadPreflightGuard` and the `TestRuntimeDriverGuard` alive for the duration of the test and asserts observable `llm://token/{streamId}` and `llm://done/{streamId}` events from the smoke webview, not a side channel on the runtime driver. The third test uses the ready-result fake download seam to cover public `llm_download_model` success and then re-checks `llm_status` through the same smoke app instance so the smoke suite proves both registration and shared managed-state wiring without network IO.

- [x] **Step 5: Run the backend verification commands**

Run:

```bash
cd apps/desktop/src-tauri
cargo fmt --check
cargo test --lib
cargo check
```

Expected:
- `cargo fmt --check`: PASS
- `cargo test --lib`: PASS for the full library suite, including the Task Group 2 lifecycle tests in `commands/llm.rs` covering status derivation, download admission/resume/promotion, restart-staging cleanup, staged-import re-validation before promotion, runtime invalidation on post-promotion cleanup failures, the explicit three-phase lazy-load split, generation control, and the deterministic public-command smoke coverage for `llm_download_model`/`llm_cancel_download` finalizer cleanup, `llm_chat` event emission through the real app-event path driven by the Task 4 runtime seam, and observable shared app-managed state across the registered command surface
- `cargo check`: PASS with the new commands registered

- [x] **Step 6: Commit the registered backend surface**

```bash
git add src/commands/llm.rs src/lib.rs src/commands/search.rs
git commit -m "feat: register llm lifecycle commands"
```

## Verification Checklist

- [x] `cargo test llm_status_serializes_to_spec_values --lib`
- [x] `cargo test llm_state_defaults_to_empty_runtime_state --lib`
- [x] `cargo test approved_model_path_uses_vault_models_directory --lib`
- [x] `cargo test llm_system_requirements_snapshot_reads_probe_values --lib`
- [x] `cargo test derive_lifecycle_status_covers_all_required_runtime_states --lib`
- [x] `cargo test llm_status_reports_busy_during_verified_import_reprovision --lib`
- [x] `cargo test llm_status_is_ready_when_model_file_snapshot_exists_but_model_is_not_loaded --lib`
- [x] `cargo test llm_status_snapshot_reports_loaded_when_runtime_model_is_present --lib`
- [x] `cargo test llm_status_reports_error_and_last_error_until_recovered --lib`
- [x] `cargo test successful_ready_recovery_clears_prior_error_and_restores_ready_status --lib`
- [x] `cargo test import_rejects_wrong_filename_even_when_hash_matches --lib`
- [x] `cargo test resume_policy_accepts_matching_partial_response_and_preserves_total_asset_size --lib`
- [x] `cargo test resume_policy_restarts_into_fresh_staging_when_server_ignores_range --lib`
- [x] `cargo test resume_policy_rejects_mismatched_partial_response --lib`
- [x] `cargo test download_cleanup_watch_is_non_lossy_for_late_cancel_waiters --lib`
- [x] `cargo test final_staged_file_length_must_match_total_bytes_before_sha_verification --lib`
- [x] `cargo test cancelled_restart_staging_is_deleted_while_resumable_part_survives --lib`
- [x] `cargo test non_sha_restart_failures_delete_restart_staging_and_preserve_resumable_part --lib`
- [x] `cargo test import_staging_path_is_distinct_from_resumable_download_part_path --lib`
- [x] `cargo test cancelled_download_keeps_partial_file_and_restores_prior_not_provisioned_state --lib`
- [x] `cargo test begin_reprovision_rejects_while_generation_is_active --lib`
- [x] `cargo test reprovision_guard_drop_clears_busy_state_after_early_return --lib`
- [x] `cargo test started_reprovision_errors_finalize_to_sticky_lifecycle_error --lib`
- [x] `cargo test cancelled_download_restores_prior_lifecycle_error_snapshot --lib`
- [x] `cargo test sticky_lifecycle_error_survives_retry_start_until_successful_recovery --lib`
- [x] `cargo test import_model_file_happy_path_stages_revalidates_and_promotes_verified_bytes_into_vault --lib`
- [x] `cargo test promote_staged_model_replaces_existing_final_file_when_present --lib`
- [x] `cargo test promote_staged_model_reports_restore_failure_for_manual_recovery --lib`
- [x] `cargo test collect_model_load_preflight_is_read_only_for_managed_state --lib`
- [x] `cargo test validate_model_load_preflight_is_pure_for_managed_state --lib`
- [x] `cargo test ensure_model_loaded_after_valid_preflight_is_first_runtime_mutator --lib`
- [x] `cargo test validate_model_load_prerequisites_rejects_missing_provisioned_model --lib`
- [x] `cargo test validate_model_load_prerequisites_rejects_low_ram_before_model_load --lib`
- [x] `cargo test lazy_load_preflight_errors_leave_lifecycle_markers_unchanged --lib`
- [x] `cargo test begin_generation_rejects_second_active_stream --lib`
- [x] `cargo test begin_generation_rejects_when_reprovision_is_active --lib`
- [x] `cargo test cancel_generation_marks_active_stream_cancelled --lib`
- [x] `cargo test ensure_model_loaded_rejects_during_reprovision --lib`
- [x] `cargo test successful_lazy_load_recovery_clears_prior_error_and_marks_loaded --lib`
- [x] `cargo test claimed_generation_finalizer_preserves_command_error_when_done_emit_fails --lib`
- [x] `cargo test blocking_generation_runner_uses_send_sync_event_sink_for_token_emission --lib`
- [x] `cargo test llm_cancel_download_command_waits_for_in_flight_download_completion --lib`
- [x] `cargo test llm_chat_command_emits_token_and_done_events_through_app_event_sink --lib`
- [x] `cargo test registered_llm_commands_observe_same_app_managed_llm_state --lib`
- [x] `cargo test --lib`
- [x] `cargo fmt --check`
- [x] `cargo check`

## Requirement Coverage Map

- `2.1`: Task 1 creates `src/commands/llm.rs`.
- `2.2`: Task 1 defines `LlmState` with required runtime slots plus the required `Mutex<Option<LlamaModel>>` field.
- `2.3`: Task 2 adds one shared LLM system-requirements snapshot helper, Task 3 reuses the shared `BASELINE_MIN_FREE_DISK_BYTES` threshold instead of asset size, and Task 4 applies the matching RAM gate before lazy load.
- `2.4`: Task 2 adds `llm_status`, factors status derivation into a direct helper, keeps lifecycle poison/error paths on `AppError::Llm`, makes any active reprovision lease externally visible as `downloading` within the unchanged v1 state set, makes sticky lifecycle errors survive retry start and cancel until an explicit ready/loaded recovery clears them, and adds direct snapshot coverage for `ready`, `loaded`, and side-load busy-state reporting.
- `2.5`: Task 2 anchors the approved path to `SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`.
- `2.6`: Task 3 implements resumable HTTP Range download, parses `206` `Content-Range` separately from remaining-byte `Content-Length`, emits camelCase progress payloads, performs a final staged-file length check immediately before SHA-256 verification and promotion, only falls back from resume to `200 OK` by downloading into a fresh sibling staging file so the prior partial file is not discarded until the full approved asset has been proven, routes any failure that happens after verified bytes are already promoted through runtime invalidation before surfacing the error, and adds explicit cleanup semantics plus tests so a transient `*.restart` file is deleted on cancel and non-SHA failure paths while `.part` remains the only resumable artifact.
- `2.7`: Task 3 validates side-loaded files by exact identity and SHA-256 before claiming reprovision busy state when possible, stages them through a dedicated import-staging path that is distinct from the resumable download `.part` path, re-validates that staged `.import` artifact immediately before promotion so the promoted bytes themselves satisfy the approved-asset length and SHA-256 rules, then promotes that staged artifact through the same promotion path used by download. It also lets `begin_reprovision(...)` own the prior-lifecycle snapshot internally, requires runtime invalidation even when a verified side-load cleanup step fails after promotion has already replaced the approved file, adds both the direct staged-import happy-path test and the explicit staging-path-separation test, routes import through the same reprovision guard plus `finalize_started_reprovision_result(...)`, and makes Windows restore failure semantics explicit instead of assuming rollback always succeeds.
- `2.8`: Task 3 adds explicit download cancellation that interrupts blocked network waits with a non-lossy `tokio::sync::watch` cancel channel plus a separate non-lossy cleanup-completion watch, keeps the partial file, restores the pre-reprovision lifecycle snapshot on cancel, and does not return until `download_state`, `reprovisioning`, and lifecycle markers have reached their terminal post-cancel state.
- `2.9`: Task 4 adds explicit generation cancellation through an `Arc<AtomicBool>` on the active stream.
- `2.10`: Task 4 performs lazy model load inside `llm_chat`, moves non-stateful setup such as `app_data_dir()` before generation ownership is claimed, splits lazy-load preflight failures from sticky post-state runtime-init failures through an explicit validated-preflight helper boundary, adds explicit tests that prove `collect_model_load_preflight(...)` is read-only, `validate_model_load_preflight(...)` is pure, and post-valid-preflight runtime load is the first mutator, claims generation ownership before lazy load so reprovision cannot race in after the gate check, blocks lazy load while verified download/import replacement is in progress, enforces the 1.5 GB RAM floor before `LlamaModel::load_from_file`, routes both `llm_chat` and the compatibility path through one shared internal claimed-generation runner plus a Task 4 runtime-driver seam that the real public command path uses, explicitly allows the blocking decode loop to emit token events through a `Send + Sync` sink while keeping the done-event on the finalizer path, and requires a claimed-generation finalizer so lazy-load preflight/init failures still attempt a terminal done event before returning the command result, with explicit checklist coverage for the terminal done-event failure path and the real app-event emission path.
- `2.11`: Task 5 wires the six new commands into Tauri while keeping the temporary `chat_answer` bridge only long enough to avoid breaking the current Chat UI, makes the wrapper import explicit in `search.rs`, keeps that bridge on the same internal claimed-generation runner as `llm_chat` instead of maintaining a parallel backend flow, and adds deterministic post-wiring public-command smoke coverage backed by a tauri-test app builder, the Task 3 fake download seam for real `llm_download_model` / `llm_cancel_download` invocation without network IO, the Task 4 explicit preflight/runtime seams for real `llm_chat` invocation, and a real app-event listener for `llm_chat` token/done assertions so the shared app-managed state surface stays lightweight, reproducible, and mechanically tied to the real IPC/runtime paths.