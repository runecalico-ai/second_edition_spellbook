## 1. Infrastructure Spike & Dependency Setup

- [ ] 1.1 Verify `llama-cpp-rs` compiles on Windows with MSVC toolchain (spike — blocking)
- [ ] 1.2 Verify `llama-cpp-rs` cancellation / interrupt API is available (check crate docs/source)
- [ ] 1.3 Verify `fastembed` crate compiles on Windows (ONNX runtime pre-built binaries — spike)
- [ ] 1.4 Add `llama-cpp-rs` to `apps/desktop/src-tauri/Cargo.toml` under a `llm` feature flag
- [ ] 1.5 Add `fastembed` to `Cargo.toml` (same `llm` feature flag or standalone)
- [ ] 1.6 Add HTTP download dependency (`reqwest` with `stream` feature) to `Cargo.toml` if not already present
- [ ] 1.7 Update `DEVELOPMENT.md` with C++ toolchain requirements and fastembed/ONNX notes

## 2. Backend — LLM Model Lifecycle

- [ ] 2.1 Create `apps/desktop/src-tauri/src/commands/llm.rs` module
- [ ] 2.2 Define `LlmState` struct (`Mutex<Option<LlamaModel>>`, download progress channel) and register in `main.rs`/`lib.rs`
- [ ] 2.3 Implement `llm_status` command: return enum `{ not_downloaded | downloading | ready | loaded | error }` plus optional RAM check
- [ ] 2.4 Implement model download helper: HTTP Range-based resumable download, emit `llm://download-progress` events
- [ ] 2.5 Implement SHA-256 integrity check after download completes; delete file and return error on mismatch
- [ ] 2.6 Implement disk-space pre-check (require ≥ 800 MB free) before starting download
- [ ] 2.7 Implement `llm_download_model` command: orchestrate download, integrity check, status transitions
- [ ] 2.8 Implement lazy model load inside `llm_chat` command: check RAM (≥ 1.5 GB free), load model, transition state to `loaded`
- [ ] 2.9 Register `llm_status`, `llm_download_model`, and `llm_chat` in Tauri command list

## 3. Backend — Embeddings & Semantic Search

- [ ] 3.1 Create `apps/desktop/src-tauri/src/commands/embeddings.rs` module
- [ ] 3.2 Define `EmbeddingState` struct (`Mutex<Option<TextEmbedding>>`) and register in `main.rs`/`lib.rs`
- [ ] 3.3 Implement background startup task: load `fastembed` all-MiniLM-L6-v2 model; set state to ready when complete
- [ ] 3.4 Implement `embed_spell_text(name, description) -> Vec<f32>` internal helper (single spell)
- [ ] 3.5 Implement `embed_spell_texts_batch(items) -> Vec<Vec<f32>>` internal helper (N spells, single fastembed batch call)
- [ ] 3.6 Add post-write embedding hook to `create_spell` command: call `embed_spell_text`, upsert into `sqlite-vec`; log and continue on failure
- [ ] 3.7 Add post-write embedding hook to `update_spell` command (name or description change): regenerate and upsert vector
- [ ] 3.8 Add batch embedding call to import completion path: embed all newly inserted spells in one batch; bulk upsert into `sqlite-vec`
- [ ] 3.9 Implement `search_spells_semantic` command: embed query → cosine similarity query on `sqlite-vec` → fetch spell summaries → return ranked list
- [ ] 3.10 Implement `reindex_embeddings` command: enumerate spells missing vectors (or all if `force=true`), batch embed, bulk upsert, emit `embeddings://reindex-progress` events, return `ReindexResult`
- [ ] 3.11 Register `search_spells_semantic` and `reindex_embeddings` in Tauri command list
- [ ] 3.12 Add startup call to `reindex_embeddings(force=false)` as background task (fills gaps for users upgrading from zero-vector era)
- [ ] 3.13 Implement EmbeddingState error variant: if fastembed initialization fails at startup, set state to Failed(reason); spell writes log and skip embedding; search_spells_semantic returns error

## 4. Backend — RAG Pipeline & LLM Inference

- [ ] 4.1 Implement search term extractor: strip stop words, extract up to 3 content nouns from user query (regex-based)
- [ ] 4.2 Implement RAG retrieval: call existing FTS5 search infrastructure, return top 5 spell results (name, school, level, description ≤ 200 chars)
- [ ] 4.3 Implement ChatML prompt assembler: system prompt + RAG context + conversation history + current user query
- [ ] 4.4 Implement history truncation: drop oldest non-system turns when total token count approaches 2048
- [ ] 4.5 Implement `llm_chat` command: extract terms → RAG → assemble prompt → `spawn_blocking` inference loop → emit `llm://token/<stream_id>` per token → emit `llm://done/<stream_id>` on completion
- [ ] 4.6 Implement inference timeout (120 s): abort loop and emit `llm://done` with partial response + `[Response timed out]` note
- [ ] 4.7 Implement concurrent request guard: return error if inference already running

## 5. Python Sidecar Cleanup

- [ ] 5.1 Remove `handle_embed` function and its `_zero_vector` helper from `services/ml/spellbook_sidecar.py`
- [ ] 5.2 Remove `handle_llm_answer` function from `services/ml/spellbook_sidecar.py`
- [ ] 5.3 Remove `"embed"` and `"llm_answer"` entries from the `handlers` dispatch dict in `main()`
- [ ] 5.4 Update sidecar tests in `services/ml/tests/` to remove any tests for the removed handlers
- [ ] 5.5 Run `ruff check services/ml/` and fix any linting issues introduced by the removals

## 6. Frontend — TypeScript Types & IPC

- [ ] 6.1 Define `LlmStatusResponse`, `ChatMessage`, `DownloadProgressEvent`, `TokenEvent`, `DoneEvent` TypeScript interfaces in `src/types/llm.ts`
- [ ] 6.2 Add `ReindexResult` and `SemanticSearchResult` interfaces to `src/types/llm.ts`
- [ ] 6.3 Create `src/ipc/llm.ts` with typed wrappers for `llm_status`, `llm_download_model`, `llm_chat` Tauri commands
- [ ] 6.4 Add typed wrappers for `search_spells_semantic` and `reindex_embeddings` to `src/ipc/llm.ts`
- [ ] 6.5 Implement streaming hook `useLlmStream(streamId)`: subscribes to `llm://token/<id>` and `llm://done/<id>` Tauri events, returns `{ tokens, done, cancel }`

## 7. Frontend — Chat UI Components

- [ ] 7.1 Create `ChatPanel` container component: manages message list state, loading/error states, dispatches IPC calls
- [ ] 7.2 Create `ChatHeader` component: title + `LlmStatusBadge` (shows `not_downloaded` / `downloading` / `ready` / `loaded` / `error`)
- [ ] 7.3 Create `ModelDownloadPrompt` component: feature explanation, model size (~700 MB), "Download Model" button, shown when `not_downloaded`
- [ ] 7.4 Create `ModelDownloadModal` component: progress bar, bytes downloaded / total, cancel button, shown during `downloading`
- [ ] 7.5 Create `MessageList` component: scrollable list of `UserMessage` and `AssistantMessage` items, auto-scrolls to bottom
- [ ] 7.6 Create `UserMessage` component: displays user query text
- [ ] 7.7 Create `AssistantMessage` component: displays streamed/completed text, supports `SpellLink` sub-components; shows spinner while streaming
- [ ] 7.8 Implement spell link post-processing: after `llm://done`, detect spell names from RAG results in response text, wrap with `<SpellLink>` that navigates to spell detail view
- [ ] 7.9 Create `ChatInputBar` component: multi-line textarea, Send button (disabled while streaming), displays inline error system messages
- [ ] 7.10 Add `ChatPanel` to main navigation / routing (new tab or sidebar entry)
- [ ] 7.11 Add `data-testid` attributes to all interactive elements per frontend AGENTS.md conventions

## 8. Error Handling & Edge Cases

- [ ] 8.1 Frontend: Display download network error inline with retry button
- [ ] 8.2 Frontend: Display "disk full" error with required vs available space
- [ ] 8.3 Frontend: Display RAM error with clear guidance ("Close other applications…")
- [ ] 8.4 Frontend: Display inference error as system chat message; keep input enabled
- [ ] 8.5 Backend: Ensure partial download file is retained on network failure for resume
- [ ] 8.6 Backend: Validate `stream_id` is non-empty and unique per request
- [ ] 8.7 Backend: Embedding failures on individual spell writes MUST log and continue (non-fatal)

## 9. E2E Tests

- [ ] 9.1 Write Playwright test: Chat panel shows download prompt when model not present (mock `llm_status` → `not_downloaded`)
- [ ] 9.2 Write Playwright test: Download progress modal appears and completes (mock download events)
- [ ] 9.3 Write Playwright test: Sending a message shows user bubble and streaming assistant response
- [ ] 9.4 Write Playwright test: Spell link in response navigates to spell detail view
- [ ] 9.5 Write Playwright test: Error message displayed inline when `llm_chat` returns error
- [ ] 9.6 Write Playwright test: Input disabled while streaming, re-enabled after `llm://done`
- [ ] 9.7 Write Playwright test: `search_spells_semantic` returns ranked results for a text query (mock EmbeddingState ready, verify result array structure and ordering)
- [ ] 9.8 Write Playwright test: `reindex_embeddings` emits progress events and returns ReindexResult with expected shape

## 10. Documentation & Cleanup

- [ ] 10.1 Update `apps/desktop/src-tauri/AGENTS.md` with LLM + embedding command patterns, `LlmState` and `EmbeddingState` registration
- [ ] 10.2 Update `apps/desktop/src/AGENTS.md` with Chat UI component conventions and streaming hook pattern
- [ ] 10.3 Document LLM model URL, expected SHA-256, fastembed model name, and override env vars in `DEVELOPMENT.md`
- [ ] 10.4 Update `services/ml/AGENTS.md` to note that embed/llm_answer handlers were removed and why
- [ ] 10.5 Run `cargo clippy`, `cargo fmt`, `pnpm lint`, `ruff check`, and full E2E battery; fix all findings

## Notes
- **Total tasks**: ~60
- **Spike tasks (1.1, 1.2, 1.3) are blocking**: complete before starting groups 2–4
- **Group 5 (sidecar cleanup) can start immediately**: purely subtractive, no dependencies
- **Group 3 must precede spell write hooks (3.6, 3.7, 3.8)**: `EmbeddingState` must be registered before modifying spell commands
- **Enables**: future "Model Selection" proposal; future Library semantic search UI; future "drop Python" change (import/export migration)
- **History persistence** is intentionally out of scope; chat resets on restart
- **Semantic search Library UI** is intentionally out of scope; backend command ships, UI integration is a follow-up
