## 1. Infrastructure Spike & Dependency Setup

- [ ] 1.1 Verify and approve the exact dependency set and package provenance before any manifest changes (`llama-cpp-rs`, `fastembed`, `reqwest`, and any RAM/disk-check approach)
- [ ] 1.2 Verify `llama-cpp-rs` compiles on Windows with the MSVC toolchain (spike — blocking)
- [ ] 1.3 Verify `llama-cpp-rs` supports interruptible generation, or define the exact abort approach before implementation
- [ ] 1.4 Verify `fastembed` compiles on Windows and document the approved embedding model bundle layout for verified side-load
- [ ] 1.5 Add the approved dependencies to `apps/desktop/src-tauri/Cargo.toml`
- [ ] 1.6 Update `DEVELOPMENT.md` with C++ toolchain requirements, provisioning flow, and offline-after-provisioning notes
- [ ] 1.7 Implement a lightweight provisioning/download state guard to prevent concurrent high-bandwidth operations

## 2. Backend — LLM Model Lifecycle

- [ ] 2.1 Create `apps/desktop/src-tauri/src/commands/llm.rs` module
- [ ] 2.2 Define `LlmState` struct (`Mutex<Option<LlamaModel>>`, status, active generation state, and download state)
- [ ] 2.3 Implement a consolidated system-requirements helper (RAM ≥ 1.5 GB, disk ≥ 800 MB)
- [ ] 2.4 Implement `llm_status` with the v1 states `{ notProvisioned | downloading | ready | loaded | error }`
- [ ] 2.5 Implement the fixed `SpellbookVault/models/` storage path for the approved TinyLlama file
- [ ] 2.6 Implement the model download helper: HTTP Range-based resumable download, camelCase progress events, and SHA-256 verification
- [ ] 2.7 Implement `llm_import_model_file` with exact approved file identity and SHA-256 validation
- [ ] 2.8 Implement `llm_cancel_download`
- [ ] 2.9 Implement `llm_cancel_generation`
- [ ] 2.10 Implement lazy model load inside `llm_chat` with the system-requirements check
- [ ] 2.11 Register `llm_status`, `llm_download_model`, `llm_import_model_file`, `llm_cancel_download`, `llm_cancel_generation`, and `llm_chat` (replaces `chat_answer`)

## 3. Backend — Embeddings & Semantic Search

- [ ] 3.1 Create `apps/desktop/src-tauri/src/commands/embeddings.rs` module
- [ ] 3.2 Define `EmbeddingState` with the v1 states `{ notProvisioned | downloading | initializing | ready | error }`
- [ ] 3.3 Implement the fixed `SpellbookVault/models/` storage path for the approved embedding model bundle
- [ ] 3.4 Implement `embeddings_status`, `embeddings_download_model`, `embeddings_import_model_file`, and `embeddings_cancel_download`
- [ ] 3.5 Implement `embed_spell_text` and `embed_spell_texts_batch` internal helpers
- [ ] 3.6 Add non-blocking post-write embedding hooks to `create_spell` and `update_spell` when the model is ready
- [ ] 3.7 Add non-blocking batch embedding to import completion when the model is ready, and record missing-vector gaps otherwise
- [ ] 3.8 Implement startup embedding initialization after provisioning
- [ ] 3.9 Implement `search_spells_semantic` (replaces existing `search_semantic`) and return `cosineDistance` in the API result
- [ ] 3.10 Implement `reindex_embeddings` with progress events and the provisioning/download guard
- [ ] 3.11 Add startup partial backfill via `reindex_embeddings(force=false)`
- [ ] 3.12 Register all embedding commands in the Tauri command list

## 4. Backend — RAG Pipeline & LLM Inference

- [ ] 4.1 Implement robust search term extractor: strip stopwords (AD&D noise), preserve domain keywords
- [ ] 4.2 Implement FTS-only RAG retrieval: top 5 results with grounded metadata
- [ ] 4.3 Implement ChatML prompt assembler with history truncation
- [ ] 4.4 Implement `llm_chat` command (replaces `chat_answer`): uses frontend-generated `stream_id`
- [ ] 4.5 Implement inference timeout and interruptible loop for `llm_cancel_generation`
- [ ] 4.6 Implement concurrent request guard (one inference at a time)

## 5. Python Sidecar Cleanup

- [ ] 5.1 Remove `handle_embed` function and its `_zero_vector` helper from `services/ml/spellbook_sidecar.py`
- [ ] 5.2 Remove `handle_llm_answer` function from `services/ml/spellbook_sidecar.py`
- [ ] 5.3 Remove `"embed"` and `"llm_answer"` entries from the `handlers` dispatch dict in `main()`
- [ ] 5.4 Update sidecar tests in `services/ml/tests/` to remove any tests for the removed handlers
- [ ] 5.5 Run `ruff check services/ml/` and fix any linting issues introduced by the removals

## 6. Frontend — TypeScript Types & IPC

- [ ] 6.1 Define `LlmStatusResponse`, `EmbeddingsStatusResponse`, `ChatMessage`, `DownloadProgressEvent`, `TokenEvent`, and `DoneEvent` in `src/types/llm.ts`
- [ ] 6.2 Add `ReindexResult` and `SemanticSearchResult` interfaces to `src/types/llm.ts`
- [ ] 6.3 Create typed IPC wrappers for `llm_status`, `llm_download_model`, `llm_import_model_file`, `llm_cancel_download`, `llm_cancel_generation`, and `llm_chat`
- [ ] 6.4 Add typed wrappers for `embeddings_status`, `embeddings_download_model`, `embeddings_import_model_file`, `embeddings_cancel_download`, `search_spells_semantic`, and `reindex_embeddings`
- [ ] 6.5 Implement the streaming hook `useLlmStream(streamId)`: subscribe to `llm://token/<id>` and `llm://done/<id>` and expose generation cancellation

## 7. Frontend — Chat UI Components

- [ ] 7.1 Create `ChatPanel` container: Glassmorphism aesthetics, entrance animations
- [ ] 7.2 Create `ChatHeader` with integrated LLM and Embedding status badges
- [ ] 7.3 Create provisioning UI for both models: download flow, verified side-load flow, and download modal where needed
- [ ] 7.4 Create `MessageList` with auto-scroll and premium bubble styling
- [ ] 7.5 Create `AssistantMessage` with `GroundedInIndicator` (shows search terms used)
- [ ] 7.6 Implement spell link detection and navigate links to the existing spell editor route
- [ ] 7.7 Create `ChatInputBar` with multi-line support and Send/Cancel Generation buttons
- [ ] 7.8 Replace existing `Chat.tsx` route with the new `ChatPanel`
- [ ] 7.9 Add `data-testid` attributes to all interactive elements

## 8. Frontend — Library Semantic Mode

- [ ] 8.1 Update the existing Library semantic mode to use `embeddings_status` before running semantic search
- [ ] 8.2 Show the semantic-mode empty state with install actions when the embedding model is not provisioned
- [ ] 8.3 Keep semantic ranking scores hidden in the Library UI while preserving them in the API result type
- [ ] 8.4 Handle `initializing` and `error` states without presenting semantic mode as a broken search result

## 9. Error Handling & Edge Cases

- [ ] 9.1 Frontend: Display download network error inline with retry button
- [ ] 9.2 Frontend: Display "disk full" error with required vs available space
- [ ] 9.3 Frontend: Display RAM error with clear guidance ("Close other applications…")
- [ ] 9.4 Frontend: Display inference error as a system chat message and keep input enabled for retry
- [ ] 9.5 Backend: Ensure partial download files are retained on network failure for resume
- [ ] 9.6 Backend: Validate `stream_id` is non-empty and unique per request
- [ ] 9.7 Backend: Embedding failures on individual spell writes MUST log and continue (non-fatal)
- [ ] 9.8 Backend: Preserve existing model files when a vault restore runs and the backup excludes models

## 10. E2E Tests

- [ ] 10.1 Write Playwright test: Chat panel shows download and verified side-load actions when the LLM model is not provisioned
- [ ] 10.2 Write Playwright test: Download progress modal appears and completes with camelCase progress payloads
- [ ] 10.3 Write Playwright test: Sending a message shows the user bubble and streaming assistant response
- [ ] 10.4 Write Playwright test: Spell link in a response navigates to the existing spell editor route
- [ ] 10.5 Write Playwright test: Error message is displayed inline when `llm_chat` returns an error
- [ ] 10.6 Write Playwright test: Generation cancellation keeps the partial assistant response visible
- [ ] 10.7 Write Playwright test: Library semantic mode shows the semantic-mode empty state when the embedding model is not provisioned
- [ ] 10.8 Write Playwright test: `search_spells_semantic` returns ranked results with `cosineDistance`
- [ ] 10.9 Write Playwright test: `reindex_embeddings` emits progress events and returns the expected `ReindexResult` shape

## 11. Documentation & Cleanup

- [ ] 11.1 Update `apps/desktop/src-tauri/AGENTS.md` with the new LLM and embedding provisioning commands plus `LlmState` and `EmbeddingState`
- [ ] 11.2 Update `apps/desktop/src/AGENTS.md` with Chat provisioning UI, Library semantic empty-state, and streaming hook conventions
- [ ] 11.3 Document approved model URLs, expected SHA-256 values, verified side-load rules, and the fixed `SpellbookVault/models/` path in `DEVELOPMENT.md`
- [ ] 11.4 Document that model assets are excluded from backup and restore by default and preserved across restore on the same machine
- [ ] 11.5 Update `services/ml/AGENTS.md` to note that `embed` and `llm_answer` handlers were removed and why
- [ ] 11.6 Run `cargo clippy`, `cargo fmt`, `pnpm lint`, `ruff check`, and the affected E2E battery; fix all findings

## Notes
- **Total tasks**: ~60
- **Spike tasks (1.1, 1.2, 1.3) are blocking**: complete before starting groups 2–4
- **Group 5 (sidecar cleanup) can start immediately**: purely subtractive, no dependencies
- **Group 3 must precede spell write hooks (3.6, 3.7, 3.8)**: `EmbeddingState` must be registered before modifying spell commands
- **Enables**: future "Model Selection" proposal; future semantic ranking UI; future "drop Python" change (import/export migration)
- **History persistence** is intentionally out of scope; chat resets on restart
- **Semantic search Library UI is in scope**: the existing Library semantic mode must migrate to the real backend in this change
