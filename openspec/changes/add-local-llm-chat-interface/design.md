# Design: Add Local LLM Chat Interface + Semantic Search

## Context

The Spellbook app is a local-first Tauri desktop app with SQLite, FTS5 spell search, and a Python sidecar. Today, the sidecar ML handlers are stubs: `handle_embed` returns zero vectors, `handle_llm_answer` returns a hardcoded string, and `sqlite-vec` has no real vector data. The app therefore has no working chat or semantic search.

The current app already exposes a Chat tab and a Library semantic mode, but both flows are placeholders. This change upgrades those existing paths instead of adding new entry points.

This change adds two Rust-native features: chat via TinyLlama 1.1B Q4_K_M and embeddings via `fastembed-rs`. Those features replace the sidecar ML stubs and activate `sqlite-vec` for real semantic search.

**Key constraint**: The Python sidecar stays in scope only for document import and export (Markdown, PDF, DOCX parsing, and HTML and Markdown rendering). It does not handle embeddings or inference.

## Goals / Non-Goals

**Goals:**
- Provision the approved TinyLlama model by explicit download or verified side-load into `SpellbookVault/models/`
- Provision the approved MiniLM-L6-v2 embedding model the same way, then initialize it automatically on startup
- Load the LLM lazily and gate provisioning and loading with shared RAM and disk checks
- Run an FTS5-based RAG pipeline: extract terms, retrieve top spells, inject context, and generate a response
- Stream tokens through Tauri events with frontend-generated `stream_id` values
- Provide the chat UI with message history, grounding indicators, and clickable spell links
- Turn the existing Library semantic mode into a real feature, including a semantic-mode empty state with install actions
- Prevent concurrent high-bandwidth provisioning work
- Replace `search_semantic` and `chat_answer` with `search_spells_semantic` and `llm_chat`
- Update `Library.tsx` for the new semantic result shape
- Backfill existing libraries with `reindex_embeddings`
- Remove the Python sidecar ML stubs (`handle_embed`, `handle_llm_answer`)

**Non-Goals (this change):**
- Multiple model support or model selection UI
- Conversation persistence across sessions (chat history is in-memory only)
- Fine-tuning or custom models
- Hybrid FTS5 + vector RAG retrieval (FTS5 only for RAG in v1; semantic search available as standalone)
- Configurable model storage paths
- Python sidecar involvement in LLM inference or embeddings

## Decisions

### Decision 1: Rust-native LLM via `llama-cpp-rs` (not Python sidecar)

**What**: `llama-cpp-rs` wraps `llama.cpp` and compiles to native code as a Rust crate. Inference runs synchronously inside `spawn_blocking`.

**Why**:
- Python sidecar adds ~1–3 s IPC roundtrip; Rust keeps latency in the inference itself
- Sidecar failure (common on some machines) would block the chat feature entirely
- `llama-cpp-rs` has a stable, well-maintained API around the de facto local LLM runtime
- No new runtime dependencies for the user (Python is already present but optional)

**Alternatives considered**:
- Python sidecar with `llama-cpp-python`: Higher latency, sidecar coupling, extra IPC surface
- Candle (pure Rust ML): Immature GGUF support; higher implementation risk

### Decision 2: TinyLlama 1.1B Q4_K_M as the sole model (hardcoded v1)

**What**: Hardcode the model URL and expected SHA-256 hash. No model picker in v1.

**Why**:
- 1.1B params fits in ~700 MB on disk and ~900 MB RAM, workable on most machines
- Q4_K_M is the sweet spot: good quality/size tradeoff for the `llama.cpp` stack
- Hardcoding removes the need for a configuration UI in this proposal's scope
- Future proposal can introduce model selection once the infrastructure is proven

**Alternatives considered**:
- Mistral 7B: Better quality but requires 4–5 GB RAM; excludes low-end machines
- Q2 quantization: Too much quality loss for domain-specific spell reasoning

### Decision 3: Hybrid provisioning with exact approved files

**What**: Users can provision either model by explicit in-app download or verified side-load of the exact approved file or bundle. The app copies each asset into `SpellbookVault/models/` after it validates file identity and SHA-256.

**Why**:
- Keeps normal operation offline after setup.
- Preserves an easy first-run path for users who want one-click download.
- Supports strict offline workflows and machine-to-machine transfer through side-loading.
- Avoids the support burden of arbitrary compatible models in v1.

**Alternatives considered**:
- Download only: Conflicts with the product's offline-first story and makes air-gapped use awkward.
- Side-load only: Keeps the product strict, but adds too much friction for first-time setup.
- Accept arbitrary compatible models: Too much validation and support scope for a v1 without model-selection UX.

### Decision 4: FTS-only RAG pipeline with robust term extraction

**What**: Before each LLM call, extract keywords with a heuristic, run `search_spells` against FTS5, and inject the top 5 results into the system prompt. Chat does not depend on the embedding model in v1.

**Why**:
- Keeps responses grounded.
- Robust heuristic improves retrieval quality compared to simple regex.
- Preserves domain context while eliminating query noise.

**Alternatives considered**:
- No RAG (pure LLM): Hallucinates spell details; not useful for a domain-specific tool
- Vector or hybrid RAG: Better recall in theory, but couples chat availability to the embedding model in v1
- Second LLM call for term extraction: Doubles latency; overkill for keyword extraction

### Decision 5: ChatML format with system prompt injection

**What**: Use the ChatML prompt format (`<|im_start|>system … <|im_end|>`) that TinyLlama was fine-tuned on. The system prompt describes the assistant's role and injects the RAG spell context. Conversation history is maintained in-memory as a `Vec<ChatMessage>`.

**Why**:
- TinyLlama was trained with ChatML; any other format degrades quality significantly
- System prompt injection at every turn ensures fresh RAG context
- In-memory history is sufficient for v1 (no persistence requirement)

**Alternatives considered**:
- Instruct format: TinyLlama supports it but ChatML produces better structured outputs
- Persistent history (SQLite): Out of scope; adds migration complexity

### Decision 6: Streaming via Tauri event channel with frontend-generated IDs

**What**: The `llm_chat` command accepts a `stream_id` generated by the frontend. Tokens are emitted as `llm://token/<stream_id>` events.

**Why**:
- Streaming prevents the UI from appearing frozen.
- Frontend-generated IDs allow the UI to safely ignore tokens from stale/aborted sessions if a new one is started rapidly.

**Alternatives considered**:
- Polling: Adds unnecessary complexity and latency
- Single response (no streaming): 5–10 s wait with no feedback; poor UX

### Decision 7: Global `Mutex<Option<LlamaModel>>` state

**What**: Store the loaded model in a `Mutex<Option<LlamaModel>>` wrapped in Tauri's managed state. Load on first use, never unload (for the session lifetime).

**Why**:
- Loading takes 2–5 s; users expect fast follow-up responses
- `Mutex` prevents concurrent inference (LLM context is not thread-safe)
- `Option` allows distinguishing "not yet loaded" from "loaded"
- Simple to implement; memory is returned to OS on app exit

**Alternatives considered**:
- `Arc<RwLock<...>>`: Inference is write-heavy; no benefit over Mutex
- Unload after N minutes: Complicates state machine; not required for v1

### Decision 8: `fastembed-rs` with startup initialization after provisioning

**What**: Use `fastembed-rs` with the approved embedding model provisioned once into `SpellbookVault/models/` by download or verified side-load. After provisioning, `EmbeddingState` initializes in a background task during app startup.

**Why**:
- Matches the user's chosen lifecycle: provision once, then initialize automatically.
- Keeps semantic search responsive after startup without making every write wait on model loading.
- Gives the existing Library semantic mode a clear availability state (`notProvisioned`, `downloading`, `initializing`, `ready`, `error`).

**Alternatives considered**:
- Lazy-load the embedding model on first semantic query: Simpler, but makes the first semantic search or reindex feel unexpectedly slow.
- Queue writes until embeddings are ready: Preserves perfect index freshness, but turns ML startup into a hidden write lock.
- Use a configurable models directory: Out of scope for v1 and not supported by current vault settings.

### Decision 9: Consolidated System Requirements Check

**What**: Before it loads either model, the backend checks free RAM (≥ 1.5 GB) and disk space.

**Why**:
- Prevents crashes on low-resource machines.
- Unified check simplifies the loading state machine.

**Alternatives considered**:
- Lazy like LLM: Inconsistent UX; first spell import after a cold start would pause unexpectedly
- Skip embedding for the first few writes: Leaves gaps in the vector index; harder to reason about

### Decision 10: Non-blocking embedding writes plus backfill

**What**: Generate embeddings in three cases: single spell create or update, import batch completion, and later repair through `reindex_embeddings` plus startup partial backfill. If the model is initializing, missing, or failed, spell writes still succeed and the app records a gap for later repair.

**Why**:
- Import batching is critical for performance; `fastembed` is optimized for it.
- Non-blocking writes preserve the current spell CRUD experience while the model starts.
- Startup backfill and explicit reindexing keep the index convergent without hiding an ML dependency in every write path.

**Alternatives considered**:
- Queue writes until startup initialization completes: Higher consistency, but worse UX.
- User-triggered reindex only: Would leave gaps in new or recently changed libraries until the user discovers the command.

### Decision 11: Explicitly replace existing commands

**What**: `search_spells_semantic` and `llm_chat` replace the existing `search_semantic` and `chat_answer` commands. `Library.tsx` is updated to use the new backend and response structure.

**Why**:
- Eliminates "placebo" features and IPC debt.
- Ensures the existing Library UI benefits from the real embeddings immediately.

**Alternatives considered**:
- Keep stubs as fallback: No value; Rust path is always preferred and always available
- Deprecation warning only: Unnecessary complexity for dead code

### Decision 12: Fixed model storage under the vault root, excluded from backup by default

**What**: Both approved model assets live under the fixed path `SpellbookVault/models/`. Backup and restore exclude those assets by default. Restore preserves any model assets that are already on the machine.

**Why**:
- Keeps ownership and side-loading transparent because model assets stay inside the vault root.
- Avoids turning every backup into a large model archive.
- Preserves existing machine-local provisioning work during restore.

**Alternatives considered**:
- Store models outside the vault in an unmanaged cache: Simpler backup semantics, but less transparent to users.
- Include models in every backup: More portable, but inflates archive size and slows backup/restore.

### Decision 13: Spell links open the existing editor route

**What**: Spell links rendered from chat responses navigate to the existing `/edit/:id` route rather than introducing a new read-only detail page.

**Why**:
- Matches the current application surface.
- Avoids expanding the scope with a second spell-detail experience.

**Alternatives considered**:
- Create a new read-only detail route: Cleaner separation, but extra UI scope.
- Show spell details in an inline modal: Keeps the user in chat, but adds another new surface.

### Decision 14: Semantic mode is user-facing in v1, but ranking scores stay hidden

**What**: The existing Library semantic mode becomes a real feature in v1. The backend returns a `cosineDistance` score for tests and future UI work, but the Library does not display that score yet. If the embedding model is not provisioned, the Library shows an empty state with a clear install action instead of a broken result list.

**Why**:
- The current app already exposes semantic mode to users, so backend-only delivery would leave a misleading product path.
- Keeping the score hidden avoids adding ranking UI noise before the retrieval quality is proven.

**Alternatives considered**:
- Backend-only semantic search: Conflicts with the current UI surface.
- Show cosine scores immediately: Useful for debugging, but too much UI noise for v1.

## Data Flow

### Model provisioning flow
```
User chooses Download Model or Add Local Model
      │
      ▼
[Frontend] llm_download_model / llm_import_model_file
          or embeddings_download_model / embeddings_import_model_file
      │
      ▼
[Backend] validate approved file identity and SHA-256
      │
      ▼
[Backend] copy into SpellbookVault/models/
      │
      ▼
[Backend] update *_status → ready (or initializing for embeddings on next startup)
```

### Chat / RAG flow
```
User types query
      │
      ▼
[Frontend] llm_chat(query, stream_id)
      │
      ▼
[Backend] Extract search terms (heuristic)
      │
      ▼
[Backend] FTS5 search → top 5 spell results
      │
      ▼
[Backend] Build ChatML prompt (system + RAG context + history + user query)
      │
      ▼
[Backend] spawn_blocking → llama-cpp-rs inference loop
      │   (each token → emit "llm://token/<stream_id>")
      │
      ▼
[Backend] emit "llm://done/<stream_id>"
      │
      ▼
[Frontend] Append tokens to message, render spell links
```

### Embedding indexing flow
```
Spell created / updated
      │
      ▼
[Backend] spell command completes DB write
      │
      ▼
[Backend] embedding model ready?
      │
      ├─ yes ─► fastembed-rs: embed(description + name, batch=1)
      │           │
      │           ▼
      │        upsert vector into sqlite-vec (rowid = spell_id, 384-dim f32)
      │
      └─ no ───► record missing-vector gap and return success

Import batch completes
      │
      ▼
[Backend] embedding model ready?
      │
      ├─ yes ─► collect all new spell IDs + text
      │           │
      │           ▼
      │        fastembed-rs: embed(texts, batch=N) — single batch call
      │           │
      │           ▼
      │        bulk upsert vectors into sqlite-vec
      │
      └─ no ───► record missing-vector gaps and let startup backfill repair them
```

### Semantic search flow
```
[Frontend] semantic mode selected
      │
      ▼
[Frontend] embeddings_status()
      │
      ├─ notProvisioned ─► show Library empty state with install action
      │
      └─ ready / initializing / error ─► continue UI flow

[Frontend] search_spells_semantic(query, limit)
      │
      ▼
[Backend] fastembed-rs: embed([query], batch=1) → 384-dim query vector
      │
      ▼
[Backend] sqlite-vec: SELECT rowid, distance FROM spell_vec
          ORDER BY vec_distance_cosine(v, ?) LIMIT N
      │
      ▼
[Backend] fetch spell details for matched rowids
      │
      ▼
[Frontend] returns ranked SemanticSearchResult[]
```

## API Design

### Tauri Commands

```rust
// ── LLM commands (src/commands/llm.rs) ──────────────────────────────────────

// Check LLM model status (downloaded? loaded? downloading?)
#[tauri::command]
pub async fn llm_status(state: State<'_, LlmState>) -> Result<LlmStatusResponse, AppError>

// Download the LLM model file (streams "llm://download-progress" events)
#[tauri::command]
pub async fn llm_download_model(
    app: AppHandle,
    state: State<'_, LlmState>,
) -> Result<(), AppError>

// Register a verified local TinyLlama file by copying it into SpellbookVault/models/
#[tauri::command]
pub async fn llm_import_model_file(
      state: State<'_, LlmState>,
      source_path: String,
) -> Result<(), AppError>

// Cancel an active LLM model download
#[tauri::command]
pub async fn llm_cancel_download(state: State<'_, LlmState>) -> Result<(), AppError>

// Cancel an active generation stream
#[tauri::command]
pub async fn llm_cancel_generation(
      state: State<'_, LlmState>,
      stream_id: String,
) -> Result<(), AppError>

// Send a chat message (streams "llm://token/<id>" + "llm://done/<id>" events)
#[tauri::command]
pub async fn llm_chat(
    app: AppHandle,
    state: State<'_, LlmState>,
    db: State<'_, Arc<Pool>>,
    query: String,
    stream_id: String,
    history: Vec<ChatMessage>,
) -> Result<(), AppError>

// ── Embedding commands (src/commands/embeddings.rs) ─────────────────────────

// Check embedding model status for the Library semantic mode
#[tauri::command]
pub async fn embeddings_status(
      state: State<'_, EmbeddingState>,
) -> Result<EmbeddingsStatusResponse, AppError>

// Download the approved embedding model bundle
#[tauri::command]
pub async fn embeddings_download_model(
      app: AppHandle,
      state: State<'_, EmbeddingState>,
) -> Result<(), AppError>

// Register a verified local embedding model bundle by copying it into SpellbookVault/models/
#[tauri::command]
pub async fn embeddings_import_model_file(
      state: State<'_, EmbeddingState>,
      source_path: String,
) -> Result<(), AppError>

// Cancel an active embedding model download
#[tauri::command]
pub async fn embeddings_cancel_download(
      state: State<'_, EmbeddingState>,
) -> Result<(), AppError>

// Semantic similarity search — returns spells ranked by cosine distance
#[tauri::command]
pub async fn search_spells_semantic(
    state: State<'_, EmbeddingState>,
    db: State<'_, Arc<Pool>>,
    query: String,
    limit: Option<u32>,         // default: 10
) -> Result<Vec<SpellSummary>, AppError>

// Backfill all spells that lack a vector (or re-index all with force=true)
#[tauri::command]
pub async fn reindex_embeddings(
    app: AppHandle,
    state: State<'_, EmbeddingState>,
    db: State<'_, Arc<Pool>>,
    force: bool,                // false = only missing, true = all spells
) -> Result<ReindexResult, AppError>
```

### TypeScript Response Types

```typescript
interface LlmStatusResponse {
      state: 'notProvisioned' | 'downloading' | 'ready' | 'loaded' | 'error';
      downloadProgress?: number;  // 0.0–1.0
      errorMessage?: string;
}

interface EmbeddingsStatusResponse {
      state: 'notProvisioned' | 'downloading' | 'initializing' | 'ready' | 'error';
      downloadProgress?: number;  // 0.0–1.0
      errorMessage?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SemanticSearchResult extends SpellSummary {
      cosineDistance: number;
}

interface ReindexResult {
  total: number;
  indexed: number;
  skipped: number;   // already had vectors (when force=false)
  failed: number;
}
```

## UI Architecture

```
ChatPanel
├── ChatHeader (title, model status badges)
├── MessageList
│   ├── UserMessage
│   └── AssistantMessage
│       ├── GroundedInIndicator (shows search terms/spells used)
│       └── SpellLink (clickable → navigates to existing spell editor route)
├── StreamingMessagePlaceholder (while generating)
└── ChatInputBar
    ├── TextArea (multi-line query input)
    ├── SendButton
      └── ProvisioningPrompt (shown when model not yet provisioned)

ModelDownloadModal
├── ProgressBar
├── BytesDownloaded / TotalBytes
└── CancelButton

LibrarySemanticEmptyState
├── Explanation of semantic search
├── Download Model button
└── Add Local Model button
```

**Spell link detection**: After generation completes, the assistant message is post-processed with a regex that matches spell names from that turn's FTS5 results. Matches become `<SpellLink>` components.

## Risks / Trade-offs

**Risk: RAM usage (~900 MB) on low-memory machines**
→ Mitigation: `llm_chat` checks free RAM before load. If RAM is below 1.5 GB, loading stops, the user gets a clear error, and `llm_status` moves to `error`.

**Risk: First-time provisioning feels disruptive**
→ Mitigation: Provisioning starts only after an explicit user action. Download is resumable, and verified side-load is available.

**Risk: Runtime downloads weaken the offline-first story**
→ Mitigation: Downloads are setup-time convenience only. The app also supports verified side-load, and normal use stays offline after provisioning.

**Risk: Inference is slow on older CPUs**
→ Mitigation: Streaming keeps progress visible, and a cancel button lets the user stop a slow run. Raw hardware limits are documented separately.

**Risk: `llama-cpp-rs` adds C++ toolchain complexity**
→ Mitigation: Gate it behind a dedicated Cargo feature (`llm`). CI must provide C++ build tools, and the toolchain requirement is documented in DEVELOPMENT.md.

**Risk: RAG term extraction misses domain terms**
→ Mitigation: The heuristic is best-effort. If FTS5 returns no results, the model still answers and the system prompt notes the missing context.

**Risk: `llama-cpp-rs` may drift from future `llama.cpp` changes**
→ Mitigation: Pin the crate version in Cargo.toml and handle upgrades as separate maintenance work.

**Risk: `fastembed-rs` and ONNX runtime add Windows build risk**
→ Mitigation: Validate the toolchain in an early spike. `fastembed` uses prebuilt `ort` binaries on common platforms.

**Risk: Embedding quality is not strong enough for spell data**
→ Mitigation: all-MiniLM-L6-v2 is a reasonable fit for short descriptive text. Validate retrieval quality after implementation.

**Risk: Backfill is slow on large libraries**
→ Mitigation: `fastembed-rs` is batch-oriented, and backfill emits progress events.

**Risk: Non-blocking writes create temporary vector gaps**
→ Mitigation: Startup backfill repairs gaps automatically, and `reindex_embeddings` remains available for explicit repair.

**Trade-off: In-memory conversation history**
→ Users lose chat history on restart, but v1 avoids persistence and migration complexity.

**Trade-off: Hidden ranking scores in the Library UI**
→ The backend returns `cosineDistance`, but the Library does not show it in v1. The UI stays simpler while tests and future UI work keep access to the score.

**Trade-off: Model assets stay out of backup and restore by default**
→ Backups stay smaller, but a restored vault on a new machine can still require model provisioning.

## Migration Plan

1. Verify and approve the exact dependency set and model provenance before any manifest changes.
2. Create `src-tauri/src/commands/llm.rs` for LLM provisioning, status, download cancellation, generation cancellation, and chat.
3. Create `src-tauri/src/commands/embeddings.rs` for embedding provisioning, status, semantic search, and backfill.
4. Register commands, `LlmState`, and `EmbeddingState` in `main.rs` / `lib.rs`.
5. Use the fixed `SpellbookVault/models/` path for both approved model assets.
6. Add non-blocking embedding hooks to spell create, update, and import paths.
7. Add startup embedding initialization and startup partial backfill.
8. Replace the current `Chat.tsx` route with the new `ChatPanel` and streaming listener.
9. Update the existing Library semantic mode to use `embeddings_status`, `search_spells_semantic`, and the semantic-mode empty state with install actions.
10. Remove `handle_embed` and `handle_llm_answer` from `spellbook_sidecar.py`.
11. No database schema migrations are required; `sqlite-vec` already exists and backfill populates it.

## Open Questions

- **Build CI**: Verify that the Windows CI runner has the MSVC C++ toolchain needed by `llama-cpp-rs`.
- **Approved model identities**: Pin the exact download URLs, filenames, and SHA-256 values for both models.
- **Model URL stability**: If URLs change, decide whether to mirror assets or rely on the documented side-load fallback.
- **Generation cancellation mechanics**: Verify the exact `llama-cpp-rs` interruption approach before implementing `llm_cancel_generation`.
