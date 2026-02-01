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
  - **Application code** (`src/`): Format via `pnpm format` (wraps `biome format --write .`)
  - **E2E tests** (`tests/`): Lint/format via `npx biome lint` and `npx biome format` (direct Biome commands)
  - Both use the same `biome.json` configuration
- **Rust**: Use `cargo clippy` and `rustfmt`.
- **Python**: Use `ruff` for linting and formatting.
- **Naming**: Use `snake_case` for Rust backend commands and internal logic, and `camelCase` for React frontend code. **All IPC serialized data (Tauri commands/events) MUST use `camelCase`.**

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

## Directory Structure

```
/
│
├── docs/                        # Project documentation
│
├── spellbook/                   # Main application monorepo
│   ├── AGENTS.md                # Spellbook-specific agent context
│   ├── README.md                # Spellbook overview
│   │
│   ├── apps/desktop/            # Tauri desktop application
│   │   ├── src/                 # React frontend source
│   │   │   ├── main.tsx         # Application entry point
│   │   │   ├── index.css        # Global styles (Tailwind)
│   │   │   ├── store/           # Zustand state management
│   │   │   └── ui/              # React components and pages
│   │   │
│   │   ├── src-tauri/           # Rust backend source
│   │   │   ├── AGENTS.md        # Backend-specific agent context
│   │   │   ├── Cargo.toml       # Rust dependencies
│   │   │   ├── tauri.conf.json  # Tauri configuration
│   │   │   ├── build.rs         # Build script (Python sidecar bundling)
│   │   │   └── src/
│   │   │       ├── main.rs      # Tauri entry point
│   │   │       ├── lib.rs       # Library exports
│   │   │       ├── commands/    # Tauri IPC command handlers
│   │   │       ├── db/          # SQLite database logic (schema, migrations, queries)
│   │   │       ├── models/      # Rust data models (Spell, Character, etc.)
│   │   │       ├── sidecar/     # Python sidecar integration
│   │   │       └── error.rs     # Error handling
│   │   │
│   │   ├── tests/               # Playwright E2E tests
│   │   │   ├── AGENTS.md        # Testing-specific agent context
│   │   │   ├── *.spec.ts        # Test specifications
│   │   │   ├── page-objects/    # Page object models for tests
│   │   │   ├── fixtures/        # Test data and fixtures
│   │   │   └── utils/           # Test utilities
│   │   │
│   │   ├── biome.json           # Biome linter/formatter config
│   │   ├── playwright.config.ts # Playwright configuration
│   │   ├── vite.config.ts       # Vite bundler configuration
│   │   ├── tailwind.config.js   # Tailwind CSS configuration
│   │   └── package.json         # Node.js dependencies
│   │
│   ├── services/ml/             # Python ML sidecar service
│   │   ├── spellbook_sidecar.py # Main sidecar script (embeddings, LLM inference)
│   │   ├── requirements.txt     # Python dependencies
│   │   └── tests/               # Python unit tests
│   │
│   ├── db/                      # Database utilities and seed data
│   ├── scripts/                 # Build and utility scripts
│   └── spells_md/               # Markdown spell data for seeding
