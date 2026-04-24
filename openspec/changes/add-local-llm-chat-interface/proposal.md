## Why

The Spellbook application contains a rich spell database but offers no way for users to ask natural-language questions about spells (e.g., "What fire-damage spells can a 5th-level Mage memorize?") or to search by meaning rather than exact keywords. This change introduces two complementary features: a local LLM chat interface grounded in the spell library via RAG, and real semantic search powered by vector embeddings. Both run entirely in Rust, eliminating the Python sidecar's ML stubs and reducing the application's ecosystem dependency from three runtimes (Python + Rust + Node) to two (Rust + Node).

## What Changes

- **New `llm-chat` capability**: Download-on-demand TinyLlama 1.1B (Q4_K_M, ~700 MB) stored in a configurable path (defaulting to `SpellbookVault/models/`); lazy-loaded into memory on first chat and kept resident for the session.
- **RAG pipeline**: User query → extract search terms (robust heuristic) → FTS5 spell search → inject top-N results into ChatML prompt → generate streamed response.
- **Tauri commands**: `llm_status`, `llm_download_model`, `llm_chat` (replaces `chat_answer`, streaming via Tauri events).
- **React Chat UI**: Premium Chat panel with message history, streaming token display, "grounded in" indicator, spell-link affordances, and download/progress UX.
- **Real embedding generation**: `fastembed-rs` (all-MiniLM-L6-v2, 384-dim) replaces the Python sidecar's zero-vector stub; embeddings generated on every spell write and on import batch completion. Both model and binary stored in `SpellbookVault/models/` for portability.
- **Semantic search**: `sqlite-vec` table populated with real vectors; `search_spells_semantic` command replaces existing `search_semantic`; backfill command for existing library.
- **Library UI compatibility**: `Library.tsx` updated to use the new semantic search backend and response structure.
- **Python ML stubs removed**: `handle_embed` (zero-vector stub) and `handle_llm_answer` (string stub) deleted from `spellbook_sidecar.py`.
- **Error handling**: Consolidated "System Requirements" check; graceful messaging for download failures, insufficient RAM, and inference errors.

## Capabilities

### New Capabilities
- `llm-chat`: Local LLM chat with RAG grounding; covers model lifecycle (download, load, status), RAG retrieval pipeline, streaming chat API, and React Chat UI

### Modified Capabilities
- `architecture`: The "Python Sidecar for ML" requirement currently delegates all ML to Python; this change moves both LLM inference (`llama-cpp-rs`) and embedding generation (`fastembed-rs`) to native Rust. The Python sidecar is retained only for document import/export (Markdown, PDF, DOCX parsing and HTML rendering)
- `search`: The existing FTS5 search requirement is augmented with semantic vector search via `sqlite-vec` and `fastembed-rs`; `search_spells_semantic` replaces the placeholder `search_semantic` command.

## Impact

- **Backend**: New modules `src-tauri/src/commands/llm.rs` and `src-tauri/src/commands/embeddings.rs`; adds `llama-cpp-rs`, `fastembed`, and `reqwest` (with `stream` feature) to `Cargo.toml`
- **Frontend**: New `ChatPanel` component subtree (replaces `Chat.tsx`); `Library.tsx` updated for backend compatibility.
- **Vault**: New `SpellbookVault/models/` sub-directory for both LLM GGUF and `fastembed` ONNX models (configurable path).
- **Python sidecar**: Two stub handlers removed; remaining handlers (import, export) unchanged
- **No database schema changes** — `sqlite-vec` table already exists; backfill populates it.
- **Breaking changes**: Replaces `search_semantic` and `chat_answer` commands with improved native Rust implementations.
- **Dependencies**: `llama-cpp-rs`, `fastembed` (Rust crates); both model files fetched from Hugging Face at runtime
