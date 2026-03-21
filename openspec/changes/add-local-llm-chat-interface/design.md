# Design: Add Local LLM Chat Interface + Semantic Search

## Context

The Spellbook app is a local-first Tauri desktop app backed by SQLite with an FTS5 spell search index and a Python sidecar. The sidecar's two ML handlers (`handle_embed`, `handle_llm_answer`) are both stubs — `handle_embed` returns 384-dimensional zero vectors, `handle_llm_answer` returns a hardcoded string. The `sqlite-vec` virtual table exists in the schema but has never held real vector data. There is currently no conversational AI capability and no working semantic search.

This design introduces two features in a single change: (1) a conversational chat UI powered by TinyLlama 1.1B Q4_K_M via `llama-cpp-rs`, and (2) real embedding generation via `fastembed-rs` that activates `sqlite-vec` for the first time and enables semantic spell search. Both run entirely in native Rust, eliminating the Python sidecar's ML stubs.

**Key constraint**: The Python sidecar is NOT used for either feature. It is retained only for import/export (Markdown, PDF, DOCX parsing; HTML/Markdown rendering), which has no suitable Rust replacement in this change.

## Goals / Non-Goals

**Goals:**
- Download TinyLlama 1.1B Q4_K_M on demand from Hugging Face (~700 MB)
- Load LLM lazily on first chat request; keep in memory for the session
- Run a RAG pipeline: extract search terms → FTS5 query → inject top-N spell results → generate response
- Stream tokens back to the frontend via Tauri events
- Provide a React Chat UI with message history, spinner/progress, and clickable spell links
- Comprehensive error handling: download failure, disk full, insufficient RAM, inference timeout
- Generate real 384-dim embeddings via `fastembed-rs` (all-MiniLM-L6-v2) on every spell write
- Populate `sqlite-vec` with real vectors, activating semantic search for the first time
- Expose `search_spells_semantic` Tauri command for vector similarity queries
- Backfill existing library with a `reindex_embeddings` command
- Remove Python sidecar ML stubs (`handle_embed`, `handle_llm_answer`)

**Non-Goals (this change):**
- Multiple model support or model selection UI
- Conversation persistence across sessions (chat history is in-memory only)
- Fine-tuning or custom models
- Hybrid FTS5 + vector RAG retrieval (FTS5 only for RAG in v1; semantic search available as standalone)
- Semantic search UI integration in the Library panel (backend command only)
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

### Decision 3: Download-on-demand with progress events

**What**: Model is not bundled with the app. On first use, the backend downloads the GGUF file from Hugging Face, streaming progress events to the frontend. Download is resumable (range requests).

**Why**:
- Keeps installer size small (~30 MB vs ~730 MB)
- Users who never use chat never pay the download cost
- Progress events reuse the existing Tauri `emit` pattern

**Alternatives considered**:
- Bundle with installer: Bloats every install; most users may not use chat
- Background download at startup: Wastes bandwidth; surprised users

### Decision 4: RAG pipeline using existing FTS5 infrastructure

**What**: Before calling the LLM, extract 1–3 search terms from the user query (simple heuristic: nouns/keywords, not another LLM call) and run `search_spells` against the existing FTS5 index. Top 5 results (name + school + level + description summary) are injected into the system prompt.

**Why**:
- Keeps responses grounded in the actual library (no hallucinated spell stats)
- Reuses battle-tested search code with no new query path
- Term extraction via regex/heuristic avoids a second LLM call (low latency)
- FTS5 already handles boolean and phrase search so complex queries work

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

### Decision 6: Streaming via Tauri event channel

**What**: The `llm_chat` command accepts a `stream_id` parameter. Tokens are emitted as `llm://token/<stream_id>` events. A final `llm://done/<stream_id>` event signals completion.

**Why**:
- TinyLlama generates ~10–20 tokens/s on CPU; streaming prevents the UI from appearing frozen
- Tauri's `emit` is already used for long-running operations (e.g., import progress)
- `stream_id` uniquely identifies each generation session, allowing the frontend to associate streaming events with the correct message and to cancel an in-progress generation before starting a new one.

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

### Decision 8: `fastembed-rs` for embedding generation

**What**: Use the `fastembed` Rust crate, which bundles all-MiniLM-L6-v2 as an ONNX model and provides a high-level `embed(texts, batch_size)` API. The model (~90 MB) is downloaded from Hugging Face on first use via `hf-hub`.

**Why**:
- Highest-level API in the Rust embedding ecosystem: one call, no manual tokenization or pooling
- Ships all-MiniLM-L6-v2 out of the box — 384 dimensions, exactly matching the existing `sqlite-vec` schema
- ONNX runtime (`ort` crate) is cross-platform and well-tested on Windows/macOS/Linux
- ~90 MB model is small enough to download automatically without explicit user consent

**Alternatives considered**:
- `candle` (HuggingFace): More control but requires manual mean-pooling; ~100 extra lines, more risk
- Raw `ort` + ONNX model file: Maximum flexibility but high boilerplate; no meaningful benefit here

> The embedding model is stored in the platform's HuggingFace cache directory (managed by `hf-hub`), not in `SpellbookVault/models/`. Only the LLM GGUF file is stored in the vault.

### Decision 9: Embedding model loads eagerly at app startup

**What**: Unlike the LLM (lazy on first chat), the embedding model is loaded at app startup in a background `spawn_blocking` task. Spell writes that arrive before loading completes queue behind a `Mutex`.

**Why**:
- Embeddings are needed on every spell write (create, update) and on every import batch; lazy loading would cause unpredictable latency spikes mid-import
- 90 MB model loads in ~1–2 s — acceptable startup cost, not noticeable to users
- Eager load simplifies write path: no "is the model ready?" check needed in spell commands

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

### Decision 11: Remove Python ML stubs, retain import/export

**What**: Delete `handle_embed` (returns `[0.0] * 384`) and `handle_llm_answer` (returns stub string) from `spellbook_sidecar.py`. The `handle_import` and `handle_export` handlers are untouched.

**Why**:
- The stubs have never provided value; they produce meaningless output that could mislead future developers
- Removing them shrinks the sidecar's surface area and makes its true role (document I/O) clearer
- No feature regression: embeddings now come from `fastembed-rs`, LLM from `llama-cpp-rs`
- The `method` dispatch in `main()` should return an error for unknown methods — removing the stubs naturally triggers this

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
ChatPanel
├── ChatHeader (title, model status badge)
├── MessageList
│   ├── UserMessage
│   └── AssistantMessage
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
