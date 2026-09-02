# Local LLM Chat Interface Task 11 Documentation & Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close OpenSpec task group 11 by documenting the shipped local LLM and embedding surface in agent/dev docs, recording backup/restore model exclusion, aligning leftover sidecar docs, running the change's lint/E2E gate, and marking each `tasks.md` row complete only after its deliverable is verified.

**Architecture:** Documentation-only work against the already-shipped Rust/Tauri LLM and embedding stack. Each OpenSpec subtask (11.1–11.4, 11.6) is one independently reviewable docs-or-gate change that also flips its matching checkbox in `openspec/changes/add-local-llm-chat-interface/tasks.md`. Do not invent APIs: copy command names, status fields, hashes, paths, and event strings from the implementation cited below. Task 11.5 is already complete; this plan only verifies it and removes the contradictory sidecar README.

**Tech Stack:** Markdown agent/dev docs, OpenSpec `tasks.md` checkboxes, `cargo clippy`/`cargo fmt`, `pnpm lint`, `ruff check`, Playwright `tests/local_llm_chat.spec.ts`.

## Global Constraints

- IPC serialized data MUST be `camelCase`. Rust commands stay `snake_case`.
- Model storage is the fixed path `SpellbookVault/models/` only (not configurable).
- Approved LLM identity: TinyLlama 1.1B Chat v1.0 Q4_K_M GGUF at `SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`. URL `https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`. SHA-256 `9FECC3B3CD76BBA89D504F29B616EEDF7DA85B96540E490CA5824D3F7D2776A0`.
- Approved embedding identity: all-MiniLM-L6-v2 ONNX bundle at `SpellbookVault/models/embeddings/all-MiniLM-L6-v2/`. Manifest `5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`. Verification is `FileInventoryOnly` (five files), not a single-file SHA.
- Free disk before download: `>= 838860800` bytes. Free RAM before load/provisioning: `>= 1610612736` bytes.
- LLM status wire values: `notProvisioned | downloading | ready | loaded | error`. Response field name is `status` (not `state`).
- Embeddings status wire values: `notProvisioned | downloading | initializing | ready | error`. Response field name is `state`.
- Backup/restore exclude `models/` by omission; restore must not delete existing model files.
- Python sidecar is import/export only. `embed` and `llm_answer` are gone.
- Windows-first. Do not add, upgrade, or recommend dependencies in this plan.
- Document implementation as it exists. Do not "fix" `LlmStatusResponse.status` to match older spec wording that said `state`.

## Design decisions (locked)

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| 11.4 file targets | `docs/DEVELOPMENT.md` (OpenSpec deliverable) **and** `docs/TROUBLESHOOTING.md` (operator vault-contents list) | Task 11.4 does not name a file. TROUBLESHOOTING currently lists backup contents as DB + `spells/` + `vault-settings.json`; leaving that unchanged would contradict Decision 12. |
| ARCHITECTURE.md / TESTING.md / root AGENTS.md | Out of scope | Task 11 does not name them. Do not expand this cleanup into a docs rewrite. |
| `services/ml/README.md` | In scope as Task 5 | It still documents `method":"embed"`. That contradicts the completed 11.5 agent note and will mislead the next agent. |
| 11.5 `services/ml/AGENTS.md` | Verify only; do not rewrite | Already `[x]` and the NOTE is accurate. |
| Spec update on completion | Flip the matching `- [ ]` → `- [x]` in `tasks.md` in the **same commit** as that subtask's docs. Do not rewrite delta specs (`specs/*/spec.md`). | Matches Task 9/10 plans and the OpenSpec apply skill. |
| `design.md` Open Questions | Annotate as resolved **with accurate pointers**; do not claim a Windows GitHub Actions runner exists | Model URLs/hashes and cancellation are implemented. CI is `ubuntu-latest` (`.github/workflows/ci.yml`); Windows MSVC compile was proven in the spike, not by a Windows CI job. |
| `chat_answer` | Document as a compatibility wrapper around `llm_chat` | Still registered in `lib.rs`. Agents must not delete it as "dead" during this docs pass. |
| `search_semantic` | Document as replaced by `search_spells_semantic` (no wrapper) | Command is gone. |
| Lint/E2E in 11.6 | Run CI-equivalent commands even though this group is docs-first. Fix findings. If E2E fails for a pre-existing reason, stop and do not mark 11.6 complete. | Task 11.6 is the change's quality gate, not "lint only the markdown." |
| Clippy flags | `cargo clippy -- -D warnings` from `apps/desktop/src-tauri` | Matches `.github/workflows/ci.yml`. Do not add `--all-targets --all-features`. CI itself is Ubuntu; this gate still runs locally on Windows. |
| E2E battery | `tests/local_llm_chat.spec.ts` plus adjacent smoke `tests/spellbook_app_open_spell.spec.ts`. Harness tests must **not** download production models. | Matches Task 10. There is no `pnpm e2e` script. Playwright needs an unsandboxed Windows WebView2 session (`apps/desktop/tests/AGENTS.md`). Rebuild only if Rust/TS changed or the debug binary is missing. |
| Register-commands doc bug | While editing backend AGENTS.md, change "Register in `main.rs`" to "Register in `lib.rs`" | Same file; the current line would send an agent to the wrong place. |

## Planned file structure

| File | Action | OpenSpec |
| ---- | ------ | -------- |
| `apps/desktop/src-tauri/AGENTS.md` | Modify: project tree, sidecar note, command-registration path, dependencies, new Local LLM & Embeddings section | 11.1 |
| `apps/desktop/src/AGENTS.md` | Modify: add Chat provisioning, Library semantic empty-state, and `useLlmStream` conventions | 11.2 |
| `docs/DEVELOPMENT.md` | Modify: replace stale Task Group 1 provisioning section; add verified side-load rules and file-inventory SHA table | 11.3 |
| `docs/DEVELOPMENT.md` | Modify: add backup/restore exclusion subsection | 11.4 |
| `docs/TROUBLESHOOTING.md` | Modify: vault backup contents must mention `models/` exclusion and preserve-on-restore | 11.4 |
| `openspec/changes/add-local-llm-chat-interface/design.md` | Modify: mark Open Questions resolved with pointers | 11.3 adjacent spec accuracy |
| `services/ml/README.md` | Replace: import/export only; no `embed` example | cleanup tied to 11.5 |
| `services/ml/AGENTS.md` | Read-only verify | 11.5 already done |
| `openspec/changes/add-local-llm-chat-interface/tasks.md` | Modify: flip 11.1, 11.2, 11.3, 11.4, 11.6 to `[x]` in the commit that finishes each one | every task |
| `docs/ARCHITECTURE.md`, `docs/TESTING.md`, root `AGENTS.md` | Do not modify | out of scope |

**Source of truth for copied constants** (read, do not change):

- `apps/desktop/src-tauri/src/commands/provisioning.rs` lines 7–21 and 159–185
- `apps/desktop/src-tauri/src/models/llm.rs` lines 5–21
- `apps/desktop/src-tauri/src/models/embeddings.rs` lines 6–20
- `apps/desktop/src-tauri/src/lib.rs` lines 116–132 (command registry)
- `apps/desktop/src/types/llm.ts`
- `apps/desktop/src/hooks/useLlmStream.ts`
- `apps/desktop/src/api/llm.ts`
- `apps/desktop/src/ui/library/librarySemantic.ts`
- `apps/desktop/src-tauri/src/commands/vault.rs` `backup_vault` (archives DB + `vault-settings.json` + `spells/` only)

---

## Spec coverage map

| OpenSpec item | Plan task | Completion signal |
| ------------- | --------- | ----------------- |
| 11.1 backend AGENTS.md commands + `LlmState`/`EmbeddingState` | Task 1 | Section exists; checkbox `[x]` |
| 11.2 frontend AGENTS.md Chat provisioning, Library semantic empty-state, streaming hook | Task 2 | Section exists; checkbox `[x]` |
| 11.3 DEVELOPMENT.md URLs, SHA-256, side-load, `SpellbookVault/models/` | Task 3 | Stale "later tasks" wording gone; hashes + side-load rules present; checkbox `[x]` |
| 11.4 models excluded from backup/restore; preserved on same machine | Task 4 | DEVELOPMENT subsection + TROUBLESHOOTING vault paragraph; checkbox `[x]` |
| 11.5 sidecar AGENTS.md | Task 5 verify | Already `[x]`; README no longer advertises `embed` |
| 11.6 clippy, fmt, pnpm lint, ruff, affected E2E | Task 6 | Commands pass or findings fixed; checkbox `[x]` |

---

### Task 1: Backend agent guide (OpenSpec 11.1)

**Files:**
- Modify: `apps/desktop/src-tauri/AGENTS.md`
- Modify: `openspec/changes/add-local-llm-chat-interface/tasks.md` (11.1 only)

**Interfaces:**
- Consumes: shipped command registry and state types listed in Global Constraints
- Produces: agent-readable inventory of `llm_*` / `embeddings_*` commands, `LlmState`, `EmbeddingState`, `ProvisioningState`

- [x] **Step 1.1: Update the project tree**

In `apps/desktop/src-tauri/AGENTS.md`, replace the `src-tauri/` tree under `## Project Structure` so it includes the LLM modules. Keep existing files; add the missing ones:

```
src-tauri/
├── src/
│   ├── commands/      # Tauri command handlers
│   │   ├── characters.rs   # Character CRUD, spellbook management
│   │   ├── embeddings.rs   # Embedding lifecycle, semantic search, reindex
│   │   ├── export.rs       # PDF export, printing
│   │   ├── import.rs       # File import, conflict resolution
│   │   ├── llm.rs          # LLM lifecycle, download, chat, cancellation
│   │   ├── llm_rag.rs      # FTS-only RAG term extraction and prompt assembly
│   │   ├── provisioning.rs # Approved model identities, SHA checks, RAM/disk guard
│   │   ├── search.rs       # Keyword search, facets, chat_answer compat wrapper
│   │   ├── spells.rs       # Spell CRUD, validation
│   │   ├── vault.rs        # Vault backup/restore (excludes models/)
│   │   └── mod.rs          # Re-exports all commands
│   ├── db/            # Database layer
│   │   ├── migrations.rs   # Migration loading (SQLite)
│   │   ├── pool.rs         # r2d2 connection pool, sqlite-vec init
│   │   └── mod.rs
│   ├── models/        # Shared data structures
│   │   ├── character.rs    # Character, PrintableCharacter, etc.
│   │   ├── embeddings.rs   # EmbeddingsStatus, SemanticSearchResult
│   │   ├── import.rs       # ImportSpell, ImportConflict, etc.
│   │   ├── llm.rs          # LlmStatus, LlmStatusResponse, chat events
│   │   ├── search.rs       # SearchFilters, Facets, etc.
│   │   ├── spell.rs        # SpellDetail, SpellSummary, etc.
│   │   └── mod.rs
│   ├── sidecar/       # Python sidecar communication
│   │   ├── client.rs       # Async sidecar client (import/export only)
│   │   └── mod.rs
│   ├── error.rs       # AppError enum (thiserror)
│   ├── lib.rs         # Library entry point (app logic, command registry)
│   └── main.rs        # Binary stub (calls lib::run())
├── Cargo.toml
└── tauri.conf.json
```

- [x] **Step 1.2: Correct command registration and sidecar scope**

In the same file, under `### Adding New Commands`, change step 4 from registering in `main.rs` to:

```
4. Register in `lib.rs` `invoke_handler` (not `main.rs`; `main.rs` only calls `lib::run()`)
```

Under `### Sidecar Calls`, append this caution immediately after the `call_sidecar` example:

```markdown
> [!CAUTION]
> The sidecar handles **import/export only**. Do not add `embed` or `llm_answer` handlers. Local inference uses `llm_chat` in `commands/llm.rs`. Embeddings and semantic search use `commands/embeddings.rs`. Sidecar downtime must not block either path.
```

- [x] **Step 1.3: Add llama/fastembed to the Dependencies list**

Under `## Dependencies`, append these bullets after `regex`:

```markdown
- `llama-cpp-2` (llama.cpp / `llama-cpp-sys-2`) - Local TinyLlama inference (see CRT pitfall below)
- `fastembed` - all-MiniLM-L6-v2 embeddings via ONNX (`ort`)
- `sha2` / `hex` - SHA-256 verification of approved model files
- `reqwest` - resumable HTTP Range downloads for provisioning
- `sysinfo` - free RAM/disk probes used by the provisioning thresholds
```

- [x] **Step 1.4: Insert the Local LLM & Embeddings section**

Insert the following new section **after** the Character Management `> [!IMPORTANT]` block (legacy `spellbook` table) and **before** `## Common Pitfalls`.

```markdown
## Local LLM & Embeddings

Local chat and semantic search run in-process in Rust. Model files live under `{SpellbookVault}/models/` (see `commands/provisioning.rs`). The Python sidecar is not on this path.

Managed state is registered in `lib.rs`:
- `Arc<LlmState>`
- `Arc<EmbeddingState>`
- `Arc<ProvisioningState>` (one global high-bandwidth guard; overlapping LLM vs embeddings provisioning fails with the target-specific errors already returned by those commands)

### Data Model

**`LlmState`** (`commands/llm.rs`): `Mutex<Option<LlamaModel>>`, backend, `status: Mutex<LlmStatus>`, `last_error`, active generation, download state, reprovisioning epoch.

**`LlmStatus`** wire values (`models/llm.rs`, `rename_all = "camelCase"`): `notProvisioned | downloading | ready | loaded | error`.

**`LlmStatusResponse`** fields (camelCase over IPC): `status`, `modelPath`, `bytesDownloaded`, `totalBytes`, `lastError`. Use `status` — not `state`.

**`EmbeddingState`** (`commands/embeddings.rs`): `Mutex<Option<Arc<Mutex<TextEmbedding>>>>`, `status: Mutex<EmbeddingsStatus>`, `last_error`, download state, reindex flag, per-spell embed generations.

**`EmbeddingsStatus`** wire values: `notProvisioned | downloading | initializing | ready | error`.

**`EmbeddingsStatusResponse`** fields: `state`, `downloadProgress`, `errorMessage`. Use `state` — not `status`.

Approved files (do not accept arbitrary GGUF/ONNX):
- LLM: `models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` — SHA-256 `9FECC3B3CD76BBA89D504F29B616EEDF7DA85B96540E490CA5824D3F7D2776A0`
- Embeddings: `models/embeddings/all-MiniLM-L6-v2/` — five-file inventory in `EMBEDDING_EXPECTED_FILES` plus manifest `5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`

Thresholds: disk `>= 838860800` bytes before download; RAM `>= 1610612736` bytes before LLM load. Source: `BASELINE_MIN_FREE_DISK_BYTES` / `BASELINE_MIN_FREE_RAM_BYTES`.

### Command Patterns

Register these in `lib.rs`. Frontend wrappers live in `src/api/llm.ts`.

| Command | Role |
| ------- | ---- |
| `llm_status` | Current `LlmStatusResponse` |
| `llm_download_model` | In-app download of the approved GGUF; emits `llm://download-progress` `{ bytesDownloaded, totalBytes }` |
| `llm_import_model_file` | Verified side-load: exact filename identity + SHA-256, then copy into `models/` |
| `llm_cancel_download` | Abort in-flight LLM download; status returns to `notProvisioned`; keep partial bytes for resume |
| `llm_cancel_generation` | Stop the active stream at the next token boundary; args: `streamId` |
| `llm_chat` | Lazy-load model, FTS RAG, stream tokens. Args: `message`, `streamId`, `history` |
| `embeddings_status` | Current `EmbeddingsStatusResponse` |
| `embeddings_download_model` | In-app download of the approved ONNX bundle; emits `embeddings://download-progress` |
| `embeddings_import_model_file` | Verified side-load of the approved bundle |
| `embeddings_cancel_download` | Abort embedding download |
| `search_spells_semantic` | Ranked results with `cosineDistance`. Replaces `search_semantic` (removed) |
| `reindex_embeddings` | Args: `force: bool`. Emits `embeddings://reindex-progress` `{ current, total }`. Returns `ReindexResult` `{ total, indexed, skipped, failed }` |

**Compatibility:** `chat_answer` in `commands/search.rs` remains registered and delegates to `llm_chat_answer_compat`. New UI must call `llm_chat`. Do not reintroduce `search_semantic`.

**Streaming:** Frontend generates `streamId` (see frontend AGENTS.md). Backend emits:
- `llm://token/{streamId}` payload `{ token }`
- `llm://done/{streamId}` payload `{ fullResponse, cancelled, searchTerms, groundedSpells, timedOut }`

`stream_id` must be non-empty. One inference at a time; a second `llm_chat` is rejected. Timeout is 120s.

**Hooks already wired:** `create_spell` / `update_spell` / import completion embed in the background when the embedding model is `ready`. Failures log and must not fail the spell write. Startup runs embedding init plus `reindex_embeddings(force=false)` backfill.

**Vault:** `backup_vault` archives the DB, `spells/`, and `vault-settings.json` only. It never adds `models/`. `restore_vault` must leave existing model files untouched.

### Side-load rules

1. User picks a local file/bundle through `llm_import_model_file` / `embeddings_import_model_file`.
2. Validate exact approved identity (filename/layout) and SHA-256 / file inventory.
3. On success, copy into `{SpellbookVault}/models/` and set LLM `ready` or embeddings `initializing`/`ready`.
4. On rejection, leave status unchanged and return a validation error. Do not copy a mismatched file into the vault.
```

- [x] **Step 1.5: Mark OpenSpec 11.1 complete**

In `openspec/changes/add-local-llm-chat-interface/tasks.md`, change only this line:

From:

```markdown
- [ ] 11.1 Update `apps/desktop/src-tauri/AGENTS.md` with the new LLM and embedding provisioning commands plus `LlmState` and `EmbeddingState`
```

To:

```markdown
- [x] 11.1 Update `apps/desktop/src-tauri/AGENTS.md` with the new LLM and embedding provisioning commands plus `LlmState` and `EmbeddingState`
```

Leave 11.2–11.4 and 11.6 unchecked.

- [ ] **Step 1.6: Commit 11.1**

```bash
git add apps/desktop/src-tauri/AGENTS.md openspec/changes/add-local-llm-chat-interface/tasks.md
git commit -m "docs(tauri): document LLM and embedding commands in backend AGENTS.md"
```

---

### Task 2: Frontend agent guide (OpenSpec 11.2)

**Files:**
- Modify: `apps/desktop/src/AGENTS.md`
- Modify: `openspec/changes/add-local-llm-chat-interface/tasks.md` (11.2 only)

**Interfaces:**
- Consumes: `src/types/llm.ts`, `src/api/llm.ts`, `useLlmStream`, `deriveSemanticAvailability`
- Produces: conventions for Chat provisioning UI, Library semantic empty-state, and streaming listener order

- [x] **Step 2.1: Insert the Local LLM Chat & Semantic Search pattern**

In `apps/desktop/src/AGENTS.md`, insert the following new subsection under `## Common Patterns`, **after** the Forms example and **before** `## Testing Checklist`.

```markdown
### Local LLM Chat & Semantic Search

Chat and Library semantic mode talk to Rust through typed wrappers in `src/api/llm.ts`. Types live in `src/types/llm.ts`. Do not `invoke` these commands with ad-hoc argument shapes.

**Provisioning UI (Chat):** `ChatPanel` (`data-testid="chat-panel"`) shows `ChatProvisioningPrompt` (`chat-provisioning-empty-state`) when `canSendChat(llm.status)` is false (`status` is not `ready` or `loaded`). Required actions:

| Action | Test id |
| ------ | ------- |
| Download TinyLlama | `chat-llm-download-button` |
| Side-load TinyLlama | `chat-llm-import-button` |
| Download embeddings (optional for chat) | `chat-embeddings-download-button` |
| Side-load embeddings | `chat-embeddings-import-button` |
| Retry after classified error | `chat-provisioning-retry-button` |

Download progress uses `ModelDownloadModal` (`model-download-modal`) subscribed to `llm://download-progress` / `embeddings://download-progress` with camelCase `{ bytesDownloaded, totalBytes }`. Chat can be used without the embedding model (FTS-only RAG). Embeddings are required only for Library semantic mode.

**Streaming hook:** Use `useLlmStream(streamId)` from `src/hooks/useLlmStream.ts`. Public state: `{ response, isGenerating, error, grounding, cancelled, timedOut, cancel }`.

Rules:
1. The frontend generates `streamId` via `createStreamId()` in `chatUtils.ts` (`chat-${Date.now()}-...`). Never let the backend mint it.
2. Set `streamId` in React state **before** calling `startLlmChat`, so `useLlmStream` subscribes to `llm://token/<id>` and `llm://done/<id>` first. `useChatSession` already does this with a pending-request effect — copy that order; do not invoke then subscribe.
3. Listen through `src/api/llmEvents.ts`, not a raw `@tauri-apps/api/event` import. Production and the Playwright harness share that adapter.
4. Cancel with `cancel()` on the hook (calls `llm_cancel_generation`). Keep the partial assistant bubble visible.
5. Chat history is session-only (in-memory). Do not persist transcripts.

**Library semantic empty-state:** When Library mode is `semantic`, call `embeddings_status` and `deriveSemanticAvailability(mode, embeddingsState)` from `ui/library/librarySemantic.ts`. Render `LibrarySemanticProvisioning` instead of a result list unless availability is `ready`. `cosineDistance` stays in `SemanticSearchResult` but must not be shown in the Library UI.

| Availability | Test id | User meaning |
| ------------ | ------- | ------------ |
| `notProvisioned` | `library-semantic-provisioning-state` | Empty state with `library-embeddings-download-button` and `library-embeddings-import-button` |
| `downloading` | `library-semantic-downloading-state` | In progress; modal `library-embeddings-download-modal` |
| `initializing` | `library-semantic-initializing-state` | Model present, not ready to search |
| `error` | `library-semantic-error-state` | Failure with retry; not a broken hit list |
| `ready` | (normal Library results) | `canRunSemanticSearch` is true |

Keyword mode always returns `"keyword"` from `deriveSemanticAvailability` and must not show the semantic empty state.

**IPC wrappers to reuse** (`src/api/llm.ts`): `getLlmStatus`, `downloadLlmModel`, `importLlmModelFile`, `cancelLlmDownload`, `cancelLlmGeneration`, `startLlmChat`, `getEmbeddingsStatus`, `downloadEmbeddingsModel`, `importEmbeddingsModelFile`, `cancelEmbeddingsDownload`, `searchSpellsSemantic`, `reindexEmbeddings`.
```

- [x] **Step 2.2: Add a streaming wait note under 8.3**

Under `### 8.3 Waiting for Async Operations`, append:

```markdown
For chat streaming, wait on visible bubbles or harness observations, never `sleep`. Subscribe (`streamId` set) before `startLlmChat`. Token and done events are `llm://token/<streamId>` and `llm://done/<streamId>`.
```

- [x] **Step 2.3: Mark OpenSpec 11.2 complete**

In `tasks.md`, change only:

```markdown
- [ ] 11.2 Update `apps/desktop/src/AGENTS.md` with Chat provisioning UI, Library semantic empty-state, and streaming hook conventions
```

to `[x]`. Leave 11.3, 11.4, and 11.6 unchecked.

- [ ] **Step 2.4: Commit 11.2**

```bash
git add apps/desktop/src/AGENTS.md openspec/changes/add-local-llm-chat-interface/tasks.md
git commit -m "docs(ui): document chat provisioning, semantic empty-state, and streaming hooks"
```

---

### Task 3: DEVELOPMENT.md model identities and side-load (OpenSpec 11.3)

**Files:**
- Modify: `docs/DEVELOPMENT.md` (replace `## Local Model Provisioning`, currently lines 32–46)
- Modify: `openspec/changes/add-local-llm-chat-interface/design.md` (Open Questions only)
- Modify: `openspec/changes/add-local-llm-chat-interface/tasks.md` (11.3 only)

**Interfaces:**
- Consumes: `provisioning.rs` constants and `EMBEDDING_EXPECTED_FILES`
- Produces: agent-facing URLs, hashes, side-load rules, fixed path

- [x] **Step 3.1: Replace the Local Model Provisioning section**

Delete the current section that still says "Public Tauri download commands land in later tasks" and "mid-download cancellation are not part of Task Group 1". Replace it with:

```markdown
## Local Model Provisioning

Approved TinyLlama and MiniLM assets are staged under the fixed path `SpellbookVault/models/` (`commands/provisioning.rs`). Paths are not configurable. After a successful download or verified side-load, chat and embeddings run offline.

Public commands: `llm_download_model`, `llm_import_model_file`, `embeddings_download_model`, `embeddings_import_model_file`. Status: `llm_status`, `embeddings_status`. One global `ProvisioningState` guard prevents overlapping high-bandwidth work (`Provisioning for LLM is already in progress.` / `Provisioning for embeddings is unavailable while LLM is in progress.`).

*   Required Windows toolchain: `x86_64-pc-windows-msvc`, `rustc 1.95.0 (59807616e 2026-04-14)`, `cargo 1.95.0 (f2d3ce0bd 2026-03-21)`, Visual Studio Build Tools workload `Microsoft.VisualStudio.Workload.VCTools` version `18.5.11709.299`, Windows SDK `10.0.26100.0`, plus `LIBCLANG_PATH=C:\Program Files\LLVM\bin` and `CMAKE=C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe` when compiling the local-model stack in a clean shell. Do not drop these pins; they are the Task 1.6 record.
*   Enforced resource thresholds: free disk `>= 838860800` bytes and free RAM `>= 1610612736` bytes (`BASELINE_MIN_FREE_DISK_BYTES` / `BASELINE_MIN_FREE_RAM_BYTES`).
*   Python sidecar scope: import/export only. It does not provide LLM or embedding functionality.

### Approved TinyLlama GGUF

| Field | Value |
| ----- | ----- |
| URL | `https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` |
| Version | TinyLlama-1.1B-Chat-v1.0 / Q4_K_M |
| Destination | `SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` |
| SHA-256 | `9FECC3B3CD76BBA89D504F29B616EEDF7DA85B96540E490CA5824D3F7D2776A0` |
| Strategy | `SingleFileSha256` |
| Download / installed size | `668788096` bytes |
| Peak RAM (recorded) | `910843904` bytes |

Mismatch: delete the failed copy, return an error, leave `llm_status` unchanged when side-load fails.

### Approved embedding bundle (all-MiniLM-L6-v2 ONNX)

| Field | Value |
| ----- | ----- |
| URL | `https://huggingface.co/Qdrant/all-MiniLM-L6-v2-onnx/tree/5f1b8cd78bc4fb444dd171e59b18f3a3af89a079` |
| Manifest | `5f1b8cd78bc4fb444dd171e59b18f3a3af89a079` |
| Destination | `SpellbookVault/models/embeddings/all-MiniLM-L6-v2/` |
| Strategy | `FileInventoryOnly` + `UpstreamRevisionManifestSHA` |
| Download / installed size | `91102069` bytes |
| Peak RAM (recorded) | `121024512` bytes |

Per-file inventory (`EMBEDDING_EXPECTED_FILES`):

| Relative path | Size (bytes) | SHA-256 |
| ------------- | ------------ | ------- |
| `embeddings/all-MiniLM-L6-v2/model.onnx` | `90387630` | `bbd7b466f6d58e646fdc2bd5fd67b2f5e93c0b687011bd4548c420f7bd46f0c5` |
| `embeddings/all-MiniLM-L6-v2/tokenizer.json` | `711661` | `da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0` |
| `embeddings/all-MiniLM-L6-v2/config.json` | `650` | `1b4d8e2a3988377ed8b519a31d8d31025a25f1c5f8606998e8014111438efcd7` |
| `embeddings/all-MiniLM-L6-v2/special_tokens_map.json` | `695` | `5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a` |
| `embeddings/all-MiniLM-L6-v2/tokenizer_config.json` | `1433` | `bd2e06a5b20fd1b13ca988bedc8763d332d242381b4fbc98f8fead4524158f79` |

### Verified side-load rules

1. Only the exact approved GGUF or the exact five-file MiniLM layout is accepted. Arbitrary "compatible" models are rejected.
2. Commands: `llm_import_model_file` (`filePath`) and `embeddings_import_model_file` (`filePath`).
3. Validate identity (destination filename / relative paths) and SHA-256 (or the five-file inventory) before copying into `SpellbookVault/models/`.
4. Success: LLM status becomes `ready`; embeddings status becomes `initializing` or `ready`.
5. Failure: status unchanged; no vault write of the rejected payload.
6. Chat UI labels this "Add Local Model" (`chat-llm-import-button` / `chat-embeddings-import-button`). Library semantic empty-state uses `library-embeddings-import-button`.
7. In-app download remains the other provisioning path (`llm_download_model` / `embeddings_download_model`) with HTTP Range resume and the same hashes.

Generation cancellation is implemented (OpenSpec Outcome B): the inference worker polls an `AtomicBool` at token boundaries via `llm_cancel_generation`.

See [dev/local_llm_infrastructure_spike.md](./dev/local_llm_infrastructure_spike.md) for provenance notes and Windows compile evidence.
```

Do **not** add the backup/restore subsection here; that is Task 4 / 11.4 so a reviewer can accept 11.3 without 11.4.

- [x] **Step 3.2: Annotate design.md Open Questions as resolved**

In `openspec/changes/add-local-llm-chat-interface/design.md`, replace the `## Open Questions` list with:

```markdown
## Open Questions

Resolved during implementation (Groups 1–4). Kept here so archive readers do not treat them as still open:

- **Build CI**: `.github/workflows/ci.yml` runs on `ubuntu-latest` and compiles the crate (clippy + `cargo test`), including `llama-cpp-2` and `fastembed`. There is no Windows GitHub Actions job. Windows MSVC compile (`x86_64-pc-windows-msvc`, VS Build Tools `VCTools`) was verified in `docs/dev/local_llm_infrastructure_spike.md` and is documented in `docs/DEVELOPMENT.md`.
- **Approved model identities**: Pinned in `apps/desktop/src-tauri/src/commands/provisioning.rs` and documented in `docs/DEVELOPMENT.md` (TinyLlama single-file SHA-256 and MiniLM five-file inventory).
- **Model URL stability**: If an upstream URL breaks, use verified side-load of the same hashed files. v1 does not mirror assets.
- **Generation cancellation mechanics**: Outcome B — dedicated inference worker polls `AtomicBool` before sampling; `llm_cancel_generation` sets the flag. Partial assistant text stays visible.
```

Do not edit Decisions 1–14 or the delta specs.

- [x] **Step 3.3: Mark OpenSpec 11.3 complete**

Change only:

```markdown
- [ ] 11.3 Document approved model URLs, expected SHA-256 values, verified side-load rules, and the fixed `SpellbookVault/models/` path in `DEVELOPMENT.md`
```

to `[x]`.

- [ ] **Step 3.4: Commit 11.3**

```bash
git add docs/DEVELOPMENT.md openspec/changes/add-local-llm-chat-interface/design.md openspec/changes/add-local-llm-chat-interface/tasks.md
git commit -m "docs: pin approved LLM and embedding hashes and side-load rules"
```

---

### Task 4: Backup/restore model exclusion (OpenSpec 11.4)

**Files:**
- Modify: `docs/DEVELOPMENT.md` (new subsection immediately after the side-load rules from Task 3, still under `## Local Model Provisioning`)
- Modify: `docs/TROUBLESHOOTING.md` (the paragraph starting `**Vault and backup/restore:**` around line 262)
- Modify: `openspec/changes/add-local-llm-chat-interface/tasks.md` (11.4 only)

**Interfaces:**
- Consumes: `backup_vault` / `restore_vault_impl` behavior and `test_restore_vault_preserves_existing_model_files`
- Produces: Decision 12 documented for agents and operators

- [x] **Step 4.1: Add the DEVELOPMENT.md backup subsection**

Append this subsection at the end of `## Local Model Provisioning` (after verified side-load rules, before `### Python Sidecar Services`):

```markdown
### Vault backup and restore (models excluded)

`backup_vault` archives only:

1. `spellbook.sqlite3`
2. `vault-settings.json` (if present)
3. the `spells/` directory

The `models/` directory is **not** added to the archive (exclusion by omission, not a separate deny-list). `restore_vault` restores DB + `spells/` + settings and does **not** delete or overwrite `{SpellbookVault}/models/`.

Consequences:
- Same machine: provisioned TinyLlama/MiniLM files survive restore.
- New machine or empty vault: the user must download or side-load again.
- A backup is not a portable copy of the LLM. Do not tell users that restoring a `.zip` brings chat models with it.
```

- [x] **Step 4.2: Update TROUBLESHOOTING.md vault backup paragraph**

Replace this existing sentence:

```markdown
   **Vault and backup/restore:** Backups include the database plus the vault spell files (`spells/` directory) and `vault-settings.json`. When you restore a backup, the app restores the DB, then the `spells/` files and settings, then runs a vault integrity check. You do not need to rebuild vault files from the DB after restore; they are restored directly from the archive.
```

with:

```markdown
   **Vault and backup/restore:** Backups include the database plus the vault spell files (`spells/` directory) and `vault-settings.json`. They do **not** include `{SpellbookVault}/models/` (TinyLlama GGUF and MiniLM embedding files). When you restore a backup, the app restores the DB, then the `spells/` files and settings, then runs a vault integrity check. Existing model files on that machine are left in place. You do not need to rebuild vault spell files from the DB after restore; they are restored directly from the archive. On a new machine you must provision models again (Chat download / Add Local Model, or Library semantic install actions).
```

- [x] **Step 4.3: Mark OpenSpec 11.4 complete**

Change only:

```markdown
- [ ] 11.4 Document that model assets are excluded from backup and restore by default and preserved across restore on the same machine
```

to `[x]`.

- [x] **Step 4.4: Commit 11.4**

```bash
git add docs/DEVELOPMENT.md docs/TROUBLESHOOTING.md openspec/changes/add-local-llm-chat-interface/tasks.md
git commit -m "docs: record that vault backup omits models and restore preserves them"
```

---

### Task 5: Verify sidecar AGENTS.md and fix README (11.5 already complete)

**Files:**
- Read: `services/ml/AGENTS.md` (do not rewrite if the NOTE is still present)
- Modify: `services/ml/README.md`
- Do not touch `tasks.md` 11.5 (already `[x]`)

**Interfaces:**
- Consumes: sidecar `handlers` map (`import` / `export` only)
- Produces: README that no longer documents `embed`

- [x] **Step 5.1: Verify `services/ml/AGENTS.md`**

Confirm lines 6–7 still say the sidecar is import/export only and that `embed` / `llm_answer` were removed. If that NOTE is missing, restore it exactly:

```markdown
> [!NOTE]
> As of the local LLM chat interface implementation (v2), the Python sidecar is used ONLY for document importing and exporting (parsing PDF, DOCX, Markdown, rendering HTML/Markdown print sheets). The `embed` and `llm_answer` handlers have been fully removed and migrated to native Rust commands in the Tauri backend.
```

If the NOTE is already present, make no AGENTS.md edit.

- [x] **Step 5.2: Replace `services/ml/README.md`**

Overwrite the file with this text (no `embed` example, no fake JSON-RPC payload — empty `import` params only return empty arrays and would look like a working ML call):

```markdown
# Spellbook sidecar

This process handles **document import and export only** (PDF, DOCX, Markdown parsing, and HTML/Markdown print rendering).

Local LLM inference and embeddings run in the Tauri/Rust backend (`llm_chat`, `search_spells_semantic`). The sidecar `embed` and `llm_answer` handlers were removed.

## Methods

The stdin JSON-RPC dispatcher accepts only `import` and `export`. See `spellbook_sidecar.py` (`handle_import`, `handle_export`) and `services/ml/tests/` for request shapes.

## Environment

Requires Python 3.14. Use the repository-root virtualenv (see `docs/DEVELOPMENT.md`). Runtime dependencies: `services/ml/requirements.txt`.
```

- [x] **Step 5.3: Commit README**

```bash
git add services/ml/README.md
git commit -m "docs(sidecar): stop advertising removed embed and llm_answer handlers"
```

If `services/ml/AGENTS.md` also changed in Step 5.1, include it in this commit. Do not flip any 11.x checkbox here.

---

### Task 6: Lint, format, E2E gate (OpenSpec 11.6)

**Files:**
- Modify: only files clippy/fmt/lint/ruff report (if any)
- Modify: `openspec/changes/add-local-llm-chat-interface/tasks.md` (11.6 only, after the gate passes)

**Interfaces:**
- Consumes: CI command set
- Produces: a green gate for this change, then checkbox 11.6

- [x] **Step 6.1: Format Rust**

Run from `apps/desktop/src-tauri`:

```powershell
cd apps/desktop/src-tauri
cargo fmt
```

Expected: exit 0. If rustfmt rewrites files, those rewrites are in scope for 11.6 (the spec says fix all findings).

- [x] **Step 6.2: Clippy with CI flags**

```powershell
cd apps/desktop/src-tauri
cargo clippy -- -D warnings
```

Expected: exit 0, no warnings. If it fails, fix the reported lints in the smallest possible patch and re-run this step. Do not pass `--all-targets` or `--all-features`.

- [x] **Step 6.3: Frontend lint**

```powershell
cd apps/desktop
pnpm lint
```

Expected: Biome then Knip, exit 0. Optional extra (not required by 11.6 wording but cheap after markdown-adjacent TS was not changed): `pnpm typecheck`. Run `pnpm typecheck` if Step 6.2/6.3 forced any TS/Rust FFI comment changes; skip if only markdown changed.

- [x] **Step 6.4: Ruff**

```powershell
cd services/ml
ruff check .
```

Expected: exit 0. `README.md` is not a Python file; this should stay green.

- [x] **Step 6.5: Run the affected E2E battery (unsandboxed WebView2)**

These tests use the Playwright local-ML harness. They must **not** download TinyLlama or MiniLM.

Rebuild policy:
- If Steps 6.1–6.2 rewrote any Rust, or any frontend `src/` file changed: run `pnpm --dir apps/desktop tauri:build --debug` first.
- If this group changed markdown only **and** `apps/desktop/src-tauri/target/debug/spellbook-desktop.exe` already exists: skip rebuild.
- If the debug binary is missing: rebuild.

Run Playwright **outside** the default agent sandbox (WebView2 cannot spawn a window otherwise; failure looks like `CDP endpoint not ready`). On this machine that means `required_permissions: ["all"]` (or the equivalent unsandboxed shell):

```powershell
pnpm --dir apps/desktop exec playwright test tests/local_llm_chat.spec.ts tests/spellbook_app_open_spell.spec.ts
```

Expected: all tests in those two files pass.

If a test fails:

1. Confirm the failure is not caused by this group's markdown. Do not change production UI to match a doc typo — fix the doc.
2. If the failure is pre-existing, **stop**. Do not mark 11.6 complete. Record the failing test name and error and ask before widening scope.
3. Do not increase timeouts to paper over flakes.
4. If the failure is `CDP endpoint not ready`, re-run unsandboxed before treating it as a product bug.

- [x] **Step 6.6: Commit any lint/format/test fixes**

If Steps 6.1–6.5 produced code changes, stage only those paths (`git status --short`). Typical candidates are rustfmt output under `apps/desktop/src-tauri/src/` or a clippy-driven edit in `commands/llm.rs` / `commands/embeddings.rs`. Do not stage unrelated dirty files.

```bash
git add apps/desktop/src-tauri/src
git commit -m "chore: fix lint findings from local LLM documentation gate"
```

If `git status` is clean after Steps 6.1–6.5, skip this commit.

- [x] **Step 6.7: Mark OpenSpec 11.6 complete only after the gate is green**

Change only:

```markdown
- [ ] 11.6 Run `cargo clippy`, `cargo fmt`, `pnpm lint`, `ruff check`, and the affected E2E battery; fix all findings
```

to `[x]`.

Confirm `tasks.md` section 11 is now fully `[x]` (11.1–11.6). `git diff -- openspec/changes/add-local-llm-chat-interface/tasks.md` should show five previously open rows flipped (11.5 was already `[x]`).

- [x] **Step 6.8: Commit the 11.6 checkbox**

```bash
git add openspec/changes/add-local-llm-chat-interface/tasks.md
git commit -m "chore(openspec): mark local LLM documentation and cleanup complete"
```

If Step 6.6 had no code commit and you prefer one commit, combine 6.6+6.8 only when the working tree contains just `tasks.md`.

---

## Verification (human or agent)

After Task 6:

```powershell
git diff --check
git log --oneline -8
Select-String -Path openspec/changes/add-local-llm-chat-interface/tasks.md -Pattern "11\."
```

Expected: 11.1 through 11.6 all `- [x]`. No other OpenSpec groups accidentally flipped. Grep the new docs for `later tasks`, `chat_answer` as the primary API, `search_semantic` as current, and `method":"embed"` — those strings must not appear as live instructions.

---

## Out of scope (explicit)

- Rewriting `docs/ARCHITECTURE.md` or `docs/TESTING.md` (stale Python ML examples in TESTING.md are real but not Group 11).
- Changing `LlmStatusResponse.status` to `state` to match older spec prose.
- Deleting `chat_answer`.
- Adding a model picker, persistence, or configurable model paths.
- Archiving the OpenSpec change (separate archive workflow after Group 11 is complete).

---

## Grill-me log (plan vs design/spec)

Self-interview against `tasks.md` §11, `design.md` Decisions 12–14, and the shipped code. Questions answerable from the repo were resolved here instead of left open.

### Decisions made

| Branch | Decision | Why |
| ------ | -------- | --- |
| 11.4 files | DEVELOPMENT.md + TROUBLESHOOTING.md | 11.4 does not name a file; TROUBLESHOOTING already lists vault backup contents and would stay wrong |
| Extra docs | README.md in; ARCHITECTURE.md / TESTING.md out | README still shows `method":"embed"` (contradicts 11.5). ARCHITECTURE/TESTING are unnamed by Group 11 |
| Spec update | Flip `tasks.md` checkboxes in the same commit as each subtask; do not rewrite `specs/*/spec.md` | Matches Task 9/10 and OpenSpec apply |
| `design.md` Open Questions | Annotate as resolved with true pointers | Leaving “pin the SHA-256” open after 11.3 would be false |
| CI wording | Ubuntu CI + local Windows spike; **not** “Windows CI has MSVC” | `.github/workflows/ci.yml` is `ubuntu-latest` |
| Toolchain pins | Keep the exact rustc/cargo/VS/SDK/LIBCLANG/CMAKE line from Task 1.6 | Replacing it with “see spike” would regress DEVELOPMENT.md |
| Crate names | `llama-cpp-2`, not the design nickname `llama-cpp-rs` | Matches `Cargo.toml` |
| `LlmStatusResponse` | Document `status` (LLM) vs `state` (embeddings) | Implementation, not older spec prose |
| `chat_answer` | Compat wrapper; keep | Still registered |
| E2E | Harness, unsandboxed WebView2, no model download; rebuild only if binary stale or Rust/TS changed | `tests/AGENTS.md` + Task 10 |
| 11.6 clippy | `cargo clippy -- -D warnings` | CI flags |

### Assumptions accepted

- Group 11 is documentation and a quality gate; no API or UI changes unless clippy/fmt forces them.
- Embedding SHA-256 is the five-file inventory, not a single hash.
- Backup exclusion is omission (`backup_vault` never archives `models/`), not a deny-list.
- Task 11.5 stays `[x]`; Task 5 only verifies the NOTE and fixes README.

### Open questions

None. Residual risk: `cargo clippy -- -D warnings` on the full crate may surface pre-existing lints; 11.6 requires fixing them rather than skipping the gate.
