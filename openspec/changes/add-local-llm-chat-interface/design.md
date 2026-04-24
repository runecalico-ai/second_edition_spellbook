# Design: Add Local LLM Chat Interface + Semantic Search

## Context

The Spellbook app is a local-first Tauri desktop app backed by SQLite with an FTS5 spell search index and a Python sidecar. The sidecar's two ML handlers (`handle_embed`, `handle_llm_answer`) are both stubs — `handle_embed` returns 384-dimensional zero vectors, `handle_llm_answer` returns a hardcoded string. The `sqlite-vec` virtual table exists in the schema but has never held real vector data. There is currently no conversational AI capability and no working semantic search.

This design introduces two features in a single change: (1) a conversational chat UI powered by TinyLlama 1.1B Q4_K_M via `llama-cpp-rs`, and (2) real embedding generation via `fastembed-rs` that activates `sqlite-vec` for the first time and enables semantic spell search. Both run entirely in native Rust, eliminating the Python sidecar's ML stubs.

**Key constraint**: The Python sidecar is NOT used for either feature. It is retained only for import/export (Markdown, PDF, DOCX parsing; HTML/Markdown rendering), which has no suitable Rust replacement in this change.

## Goals / Non-Goals

**Goals:**
- Download TinyLlama 1.1B and MiniLM-L6-v2 on demand; store both in `SpellbookVault/models/` (configurable path)
- Load models lazily or eagerly with a consolidated "System Requirements" check (RAM, disk)
- Run a RAG pipeline: extract search terms via robust heuristic → FTS5 query → inject top-N spell results → generate response
- Stream tokens via Tauri events using frontend-generated `stream_id`
- Provide a Premium React Chat UI with message history, glassmorphism aesthetics, "grounded in" indicators, and clickable spell links
- Lightweight `DownloadState` manager to prevent concurrent high-bandwidth operations
- Replace `search_semantic` and `chat_answer` commands with `search_spells_semantic` and `llm_chat`
- Update `Library.tsx` to maintain compatibility with new semantic search structure
- Backfill existing library with a `reindex_embeddings` command
- Remove Python sidecar ML stubs (`handle_embed`, `handle_llm_answer`)

**Non-Goals (this change):**
- Multiple model support or model selection UI
- Conversation persistence across sessions (chat history is in-memory only)
- Fine-tuning or custom models
- Hybrid FTS5 + vector RAG retrieval (FTS5 only for RAG in v1; semantic search available as standalone)
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

### Decision 3: Download-on-demand with progress events and DownloadManager

**What**: Models are not bundled. On first use, the backend downloads the required GGUF or ONNX files, streaming progress to the frontend. A lightweight `DownloadState` guard in the backend prevents concurrent downloads or re-indexing during a download.

**Why**:
- Keeps installer size small.
- `DownloadState` (simple `AtomicBool` or `Mutex<Option<active_task>>`) prevents bandwidth saturation and race conditions.
- Progress events are consistent for both LLM and Embedding models.

**Alternatives considered**:
- Bundle with installer: Bloats every install; most users may not use chat
- Background download at startup: Wastes bandwidth; surprised users

### Decision 4: RAG pipeline with robust term extraction

**What**: Before calling the LLM, extract keywords from the user query using a robust heuristic (stripping common stopwords like "spell", "level", "list", but preserving domain terms like "fire", "holy"). Run `search_spells` against the FTS5 index. Top 5 results are injected into the system prompt.

**Why**:
- Keeps responses grounded.
- Robust heuristic improves retrieval quality compared to simple regex.
- Preserves domain context while eliminating query noise.

**Alternatives considered**:
- No RAG (pure LLM): Hallucinates spell details; not useful for a domain-specific tool
- Vector/semantic search for RAG retrieval: Better recall but adds sidecar dependency; deferred to v2
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

### Decision 8: `fastembed-rs` with unified storage

**What**: Use `fastembed-rs` with models stored in `SpellbookVault/models/` (configurable). Like the LLM, the embedding model has a `download_status` and progress UI.

**Why**:
- Unified storage in the Vault makes the app more portable and transparent.
- Providing download UI for embeddings ensures a smooth first-run experience if the model is missing.

**Alternatives considered**:
- `candle` (HuggingFace): More control but requires manual mean-pooling; ~100 extra lines, more risk
- Raw `ort` + ONNX model file: Maximum flexibility but high boilerplate; no meaningful benefit here

> Both models are stored in a path determined by the `models_dir` vault setting, defaulting to `SpellbookVault/models/`.

### Decision 9: Consolidated System Requirements Check

**What**: Before loading either model, the backend performs a check for RAM (≥ 1.5 GB free) and Disk Space.

**Why**:
- Prevents crashes on low-resource machines.
- Unified check simplifies the loading state machine.

**Alternatives considered**:
- Lazy like LLM: Inconsistent UX; first spell import after a cold start would pause unexpectedly
- Skip embedding for the first few writes: Leaves gaps in the vector index; harder to reason about

### Decision 10: Embedding triggers and backfill

**What**: Embeddings are generated in three situations: (1) individual spell create/update via a post-write hook in the spell commands, (2) import batch completion (embed all newly imported spells in one `fastembed` batch call), and (3) a `reindex_embeddings` Tauri command that backfills the entire existing library.

**Why**:
- Batching on import is critical for performance: embedding 1,000 spells individually would be slow; `fastembed` is optimized for batches
- The backfill command is a one-time operation for users upgrading from a version with zero-vector stubs; it is also useful after any future model change
- Post-write hook on single spell operations keeps the index current without extra user action

**Alternatives considered**:
- Background async reindex: Adds complexity around index consistency; not needed for a local app
- User-triggered reindex only: Would leave new installs with no vectors until the user discovers the command

### Decision 11: Explicitly replace existing commands

**What**: `search_spells_semantic` and `llm_chat` replace the existing `search_semantic` and `chat_answer` commands. `Library.tsx` is updated to use the new backend and response structure.

**Why**:
- Eliminates "placebo" features and IPC debt.
- Ensures the existing Library UI benefits from the real embeddings immediately.

**Alternatives considered**:
- Keep stubs as fallback: No value; Rust path is always preferred and always available
- Deprecation warning only: Unnecessary complexity for dead code

## Data Flow

### Chat / RAG flow
```
User types query
      │
      ▼
[Frontend] llm_chat(query, stream_id)
      │
      ▼
[Backend] Extract search terms (regex heuristic)
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
[Backend] fastembed-rs: embed(description + name, batch=1)
      │
      ▼
[Backend] upsert vector into sqlite-vec (spell_id, 384-dim f32)

Import batch completes
      │
      ▼
[Backend] collect all new spell IDs + text
      │
      ▼
[Backend] fastembed-rs: embed(texts, batch=N) — single batch call
      │
      ▼
[Backend] bulk upsert vectors into sqlite-vec
```

### Semantic search flow
```
[Frontend] search_spells_semantic(query, limit)
      │
      ▼
[Backend] fastembed-rs: embed([query], batch=1) → 384-dim query vector
      │
      ▼
[Backend] sqlite-vec: SELECT spell_id, distance FROM spell_vec
          ORDER BY vec_distance_cosine(embedding, ?) LIMIT N
      │
      ▼
[Backend] fetch spell details for matched IDs
      │
      ▼
[Frontend] returns ranked SpellSummary[]
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
  state: 'not_downloaded' | 'downloading' | 'ready' | 'loaded' | 'error';
  download_progress?: number;  // 0.0–1.0
  error_message?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
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
ChatPanel (Premium Aesthetics: Glassmorphism, animations)
├── ChatHeader (title, model status badge)
├── MessageList
│   ├── UserMessage
│   └── AssistantMessage
│       ├── GroundedInIndicator (shows search terms/spells used)
│       └── SpellLink (clickable → navigates to SpellDetail)
├── StreamingMessagePlaceholder (while generating)
└── ChatInputBar
    ├── TextArea (multi-line query input)
    ├── SendButton
    └── DownloadPrompt (shown when model not yet downloaded)

ModelDownloadModal
├── ProgressBar
├── BytesDownloaded / TotalBytes
└── CancelButton
```

**Spell link detection**: After generation completes, the assistant message is post-processed with a regex that matches spell names found in the FTS5 search results used for that turn. Matched names become `<SpellLink>` components.

## Risks / Trade-offs

**Risk: RAM usage (~900 MB) crashes on low-memory machines**
→ Mitigation: `llm_chat` checks available system RAM before loading the model. If < 1.5 GB free, the load is aborted and a clear error message is returned: "Not enough RAM to load the model. Close other applications and try again." `llm_status` will subsequently reflect the `error` state.

**Risk: First-time download UX is disruptive**
→ Mitigation: Download is gated behind an explicit user action (button). Progress modal shows estimated time. Download is resumable via HTTP Range requests.

**Risk: Inference speed is too slow on older CPUs**
→ Mitigation: Streaming makes the latency perceptible (tokens appear progressively). A cancel button allows aborting. No mitigation for raw hardware speed — documented in README.

**Risk: `llama-cpp-rs` compile-time complexity (C++ dependency, platform toolchains)**
→ Mitigation: Add `llama-cpp-rs` to a dedicated Cargo feature flag (`llm`). The feature is enabled by default; CI must have C++ build tools. Document toolchain requirements in DEVELOPMENT.md.

**Risk: RAG term extraction misses domain terms (e.g., "fireball" vs "fire damage spells")**
→ Mitigation: Heuristic is best-effort; RAG is supplemental not required. If search returns 0 results, the LLM proceeds with no grounding context (clearly noted in system prompt).

**Risk: `llama-cpp-rs` crate version incompatibility with future llama.cpp updates**
→ Mitigation: Pin exact crate version in Cargo.toml. Upgrade as a separate maintenance task.

**Risk: `fastembed-rs` / ONNX runtime compile complexity on Windows**
→ Mitigation: Spike task 1.1 validates this before full implementation. `fastembed` uses pre-built `ort` binaries for common platforms, reducing toolchain burden vs. `llama-cpp-rs`.

**Risk: Embedding model quality insufficient for spell domain**
→ Mitigation: all-MiniLM-L6-v2 is a general-purpose embedding model; it performs well on short descriptive text. Spell descriptions are a good fit. Quality can be evaluated empirically post-implementation.

**Risk: Backfill performance on large libraries**
→ Mitigation: `fastembed-rs` is optimized for batches; 1,000 spells should complete in < 30 s on a modern CPU. Backfill emits progress events so users see status.

**Trade-off: In-memory conversation history (no persistence)**
→ Acceptable for v1. Users lose chat history on app restart, but no migration complexity is introduced. Persistence is a future proposal item.

**Trade-off: Semantic search backend-only (no Library UI changes)**
→ The `search_spells_semantic` command is available for future Library UI integration. Shipping the backend first validates the feature before investing in UI.

## Migration Plan

1. Add `llama-cpp-rs` and `fastembed` to `Cargo.toml` (feature-flagged under `llm`)
2. Create `src-tauri/src/commands/llm.rs` (LLM lifecycle + chat)
3. Create `src-tauri/src/commands/embeddings.rs` (`search_spells_semantic`, `reindex_embeddings`)
4. Register commands, `LlmState`, and `EmbeddingState` in `main.rs` / `lib.rs`
5. Add embedding generation calls to existing spell create/update commands (post-write hook)
6. Add batch embedding call to import completion path
7. Add startup backfill background task: run `reindex_embeddings(force=false)` on app startup to fill any gaps
8. Create `SpellbookVault/models/` directory on first download (auto-created by `std::fs::create_dir_all`)
9. Add `ChatPanel` React component tree (new route/tab)
10. Wire frontend streaming listener
11. Remove `handle_embed` and `handle_llm_answer` from `spellbook_sidecar.py`
12. No database schema migrations required — `sqlite-vec` table pre-exists; backfill populates it

## Open Questions

- **Build CI**: Does the Windows CI runner have the MSVC C++ toolchain needed by `llama-cpp-rs`? → Verify in a spike before full implementation.
- **Model URL stability**: Hugging Face model URLs can change if the repo is moved. Consider mirroring the model to a self-controlled URL or adding a fallback. → Out of scope for v1; hardcode primary URL, document override path.
- **Cancel mid-stream**: The `llama-cpp-rs` inference loop must be interruptible. Verify the crate's cancellation API before implementing streaming. → Research task in sprint setup.
