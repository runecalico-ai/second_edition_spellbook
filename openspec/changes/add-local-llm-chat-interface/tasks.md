## 1. Infrastructure Spike & Dependency Setup

- [ ] 1.1 Verify `llama-cpp-rs` compiles on Windows with MSVC toolchain (spike — blocking)
- [ ] 1.2 Verify `llama-cpp-rs` cancellation / interrupt API is available (check crate docs/source)
- [ ] 1.3 Verify `fastembed` crate compiles on Windows (ONNX runtime pre-built binaries — spike)
- [ ] 1.4 Add `llama-cpp-rs` and `fastembed` to `apps/desktop/src-tauri/Cargo.toml` under a `llm` feature flag
- [ ] 1.5 Add `sys-info` or similar crate for system resource checks (RAM/Disk)
- [ ] 1.6 Add HTTP download dependency (`reqwest` with `stream` feature) to `Cargo.toml`
- [ ] 1.7 Update `DEVELOPMENT.md` with C++ toolchain requirements and fastembed/ONNX notes
- [ ] 1.8 Implement `DownloadManager` (lightweight state guard) to prevent concurrent downloads

## 2. Backend — LLM Model Lifecycle

- [ ] 2.1 Create `apps/desktop/src-tauri/src/commands/llm.rs` module
- [ ] 2.2 Define `LlmState` struct (`Mutex<Option<LlamaModel>>`, download progress channel)
- [ ] 2.3 Implement consolidated `system_requirements_check` helper (RAM ≥ 1.5 GB, Disk ≥ 1 GB)
- [ ] 2.4 Implement `llm_status` command: return enum `{ not_downloaded | downloading | ready | loaded | error }`
- [ ] 2.5 Implement model download helper: HTTP Range-based resumable download, emit progress events, integrated with `DownloadManager`
- [ ] 2.6 Implement SHA-256 integrity check and unified storage in `Vault/models/`
- [ ] 2.7 Implement `llm_download_model` command
- [ ] 2.8 Implement `llm_cancel` command to abort active inference or download
- [ ] 2.9 Implement lazy model load inside `llm_chat` command with system requirements check
- [ ] 2.10 Register `llm_status`, `llm_download_model`, `llm_chat`, and `llm_cancel` (replaces `chat_answer`)

## 3. Backend — Embeddings & Semantic Search

- [ ] 3.1 Create `apps/desktop/src-tauri/src/commands/embeddings.rs` module
- [ ] 3.2 Define `EmbeddingState` struct with download status and unified storage path
- [ ] 3.3 Implement `embeddings_status` and `embeddings_download_model` (similar to LLM lifecycle)
- [ ] 3.4 Implement `embed_spell_text` and `embed_spell_texts_batch` internal helpers
- [ ] 3.5 Add post-write embedding hooks to `create_spell` and `update_spell`
- [ ] 3.6 Add batch embedding call to import completion path
- [ ] 3.7 Implement `search_spells_semantic` command (replaces existing `search_semantic`)
- [ ] 3.8 Implement `reindex_embeddings` command with `DownloadManager` guard
- [ ] 3.9 Update `Library.tsx` to handle the new `search_spells_semantic` command and ranking results
- [ ] 3.10 Add idle-time background task for `reindex_embeddings(force=false)`
- [ ] 3.11 Register all embedding commands in Tauri command list

## 4. Backend — RAG Pipeline & LLM Inference

- [ ] 4.1 Implement robust search term extractor: strip stopwords (AD&D noise), preserve domain keywords
- [ ] 4.2 Implement RAG retrieval: top 5 results with "grounded in" metadata
- [ ] 4.3 Implement ChatML prompt assembler with history truncation
- [ ] 4.4 Implement `llm_chat` command (replaces `chat_answer`): uses frontend-generated `stream_id`
- [ ] 4.5 Implement inference timeout and interruptible loop
- [ ] 4.6 Implement concurrent request guard (one inference at a time)

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

- [ ] 7.1 Create `ChatPanel` container: Glassmorphism aesthetics, entrance animations
- [ ] 7.2 Create `ChatHeader` with integrated LLM and Embedding status badges
- [ ] 7.3 Create `ModelDownloadPrompt` and `ModelDownloadModal` (shared for both models)
- [ ] 7.4 Create `MessageList` with auto-scroll and premium bubble styling
- [ ] 7.5 Create `AssistantMessage` with `GroundedInIndicator` (shows search terms used)
- [ ] 7.6 Implement spell link detection and `SpellLink` navigation
- [ ] 7.7 Create `ChatInputBar` with multi-line support and Send/Cancel buttons
- [ ] 7.8 Replace existing `Chat.tsx` route with the new `ChatPanel`
- [ ] 7.9 Add `data-testid` attributes to all interactive elements

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
