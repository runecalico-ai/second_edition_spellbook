# Project Context

## Purpose
A local-only, privacy-first desktop application for managing AD&D 2nd Edition spellbooks. It is designed to scale to thousands of spells while maintaining fast performance (keyword and semantic search) and provides character management (PC/NPC) with multi-class support.

## Tech Stack
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Radix UI, Zustand.
- **Backend**: Rust, Tauri v2 (Tokio runtime).
- **Database**: SQLite (via `rusqlite`), utilizing `FTS5` for keyword search and `sqlite-vec` for vector search.
- **ML/Python**: Python 3.14 sidecar for embeddings and local LLM inference (CTranslate2).
- **Tooling**: Biome (Linter/Formatter), Playwright (E2E Testing).

## Project Conventions

### Code Style
- **JS/TS**: STRICTLY use [Biome](https://biomejs.dev/) for linting and formatting. Do not use ESLint or Prettier.
- **Rust**: Use `cargo clippy` and `rustfmt`.
- **Naming**: Use `snake_case` for Rust backend commands and `camelCase` for React frontend code.

### Architecture Patterns
- **Monorepo**: Application lives in `spellbook/apps/desktop`.
- **Sidecar Logic**: Heavy processing (ML, complex imports/exports) is delegated to a Python sidecar.
- **Backend**: Modular Rust commands communicating with the frontend via Tauri IPC.

### Testing Strategy
- **E2E Tests**: Use [Playwright](https://playwright.dev/). Tests MUST run sequentially on Windows to avoid file locking issues with SQLite and WebView DLLs.
- **Networking**: Always use `127.0.0.1` for local connections; avoid `localhost` to ensure consistency.

### Git Workflow
- Standard feature branching. Commit messages should be descriptive.

## Domain Context
- **System**: AD&D 2nd Edition.
- **Magic Types**:
    - **Arcane**: Defined by `school`. Levels 0-9 (standard) and 10-12 (epic/circle magic).
    - **Divine**: Defined by `sphere`. Levels 0-7, plus Quest spells (flagged as level 8).
- **Mutual Exclusivity**: A spell cannot have both a `school` and a `sphere`.
- **Specialists**: Arcane casters may have barred schools.
- **Spheres**: Divine casters have access levels (Full, Limited, None) to specific spheres.
- **Character Profiles**: Multi-classing is standard. No hard caps on levels or ability scores (STR, DEX, CON, INT, WIS, CHA, COM).

## Important Constraints
- **Offline Only**: No network egress allowed during normal operation.
- **Storage**: All data (DB, attachments) is stored in a user-controlled `SpellbookVault` directory.
- **Windows Focus**: Ensure all system operations (file I/O, process management) are robust on Windows.

## External Dependencies
- **Tauri 2**: Cross-platform runtime.
- **sqlite-vec**: Vector search extension.
- **Pandoc**: Used for high-quality PDF/Markdown exports.
- **sentence-transformers**: Local embedding models.
