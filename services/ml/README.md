# Spellbook sidecar

This process handles **document import and export only** (PDF, DOCX, Markdown parsing, and HTML/Markdown print rendering).

Local LLM inference and embeddings run in the Tauri/Rust backend (`llm_chat`, `search_spells_semantic`). The sidecar `embed` and `llm_answer` handlers were removed.

## Methods

The stdin JSON-RPC dispatcher accepts only `import` and `export`. See `spellbook_sidecar.py` (`handle_import`, `handle_export`) and `services/ml/tests/` for request shapes.

## Environment

Requires Python 3.14. Use the repository-root virtualenv (see `docs/DEVELOPMENT.md`). Runtime dependencies: `services/ml/requirements.txt`.
