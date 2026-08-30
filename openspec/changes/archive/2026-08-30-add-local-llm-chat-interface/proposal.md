## Why

The Spellbook application already exposes a Chat tab and a semantic mode in the Library, but both paths are placeholders today. The chat path returns stubbed sidecar output, and semantic search relies on zero vectors. This change replaces those placeholder flows with a local LLM chat interface grounded in the spell library via RAG and a real semantic search backed by vector embeddings. Both ML paths run entirely in Rust, eliminating the Python sidecar's ML stubs while keeping the sidecar for document import and export.

## What Changes

- **New `llm-chat` capability**: The approved TinyLlama 1.1B Q4_K_M model is provisioned once by explicit in-app download or verified side-load into `SpellbookVault/models/`; the model is lazy-loaded on first chat and kept resident for the session.
- **RAG pipeline**: User query → extract search terms (robust heuristic) → FTS5 spell search → inject top-N results into the ChatML prompt → generate a streamed response. Chat uses FTS-only RAG in v1 and does not depend on the embedding model.
- **Tauri commands**: `llm_status`, `llm_download_model`, `llm_import_model_file`, `llm_cancel_download`, `llm_cancel_generation`, and `llm_chat` replace `chat_answer`.
- **React Chat UI**: The Chat panel gets message history, streaming token display, grounding indicators, spell links that open the existing spell editor route, and provisioning UX for download or verified side-load.
- **Real embedding generation**: `fastembed-rs` (all-MiniLM-L6-v2, 384-dim) replaces the Python sidecar's zero-vector stub. The approved embedding model is provisioned once by explicit in-app download or verified side-load into `SpellbookVault/models/` and initialized on app startup after provisioning.
- **Non-blocking embedding writes**: Spell create, update, and import writes stay responsive if the embedding model is still initializing or unavailable. Missing vectors are repaired by startup backfill or explicit reindexing.
- **Semantic search**: `sqlite-vec` is populated with real vectors, `search_spells_semantic` replaces `search_semantic`, and the existing Library semantic mode becomes a real feature with a semantic-mode empty state when the embedding model is not yet provisioned.
- **Python ML stubs removed**: `handle_embed` (zero-vector stub) and `handle_llm_answer` (string stub) are deleted from `spellbook_sidecar.py`.
- **Error handling**: Separate cancellation paths are provided for model downloads and active generation, with clear messaging for missing models, disk space, RAM, and inference failures.

## Capabilities

### New Capabilities
- `llm-chat`: Local LLM chat with RAG grounding; covers model lifecycle (download, load, status), RAG retrieval pipeline, streaming chat API, and React Chat UI

### Modified Capabilities
- `architecture`: The "Python Sidecar for ML" requirement currently delegates all ML to Python; this change moves both LLM inference (`llama-cpp-rs`) and embedding generation (`fastembed-rs`) to native Rust. The Python sidecar is retained only for document import and export (Markdown, PDF, DOCX parsing, and HTML and Markdown rendering)
- `search`: The existing FTS5 search requirement is augmented with semantic vector search via `sqlite-vec` and `fastembed-rs`; `search_spells_semantic` replaces the placeholder `search_semantic` command.

## Impact

- **Backend**: New modules `src-tauri/src/commands/llm.rs` and `src-tauri/src/commands/embeddings.rs`; adds `llama-cpp-rs`, `fastembed`, and `reqwest` (with `stream` feature) to `Cargo.toml`
- **Frontend**: New `ChatPanel` component subtree (replaces `Chat.tsx`); `Library.tsx` updated for backend compatibility.
- **Vault**: New fixed `SpellbookVault/models/` sub-directory for approved LLM and embedding assets. Model assets are excluded from vault backup and restore by default, and existing model files are preserved during restore.
- **Python sidecar**: Two stub handlers removed; remaining handlers (import, export) unchanged
- **No database schema changes** — `sqlite-vec` table already exists; backfill populates it.
- **Breaking changes**: Replaces `search_semantic` and `chat_answer` commands with improved native Rust implementations.
- **Dependencies**: `llama-cpp-rs`, `fastembed` (Rust crates); approved model assets can be provisioned once by explicit download or side-load, and normal operation remains offline after provisioning.
