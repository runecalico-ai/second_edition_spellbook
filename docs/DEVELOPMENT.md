# Development Guide

This document provides a centralized overview of the repository layout, development workflows, and coding conventions for the Second Edition Spellbook project.

---

## Repository Layout

*   `apps/desktop`: Tauri + React desktop application (Frontend & Backend).
*   `services/ml`: Python sidecar services for embeddings and LLM inference.
*   `db/migrations`: SQLite schema migration files.
*   `scripts/`: Helper scripts and build utilities.
*   `spells_md/`: Markdown spell content used for seeding.
*   `openspec/`: Detailed project specifications and change proposals.
*   `docs/`: High-level architectural and migration documentation.

---

## Development Workflows

### Desktop Application (React + Rust)
**Location**: `apps/desktop`

Requires Node 24+, `pnpm`, and a Rust toolchain.

```bash
cd apps/desktop
pnpm install
pnpm tauri:dev
```

### Python Sidecar (ML Services)
**Location**: `services/ml`

Always use the virtual environment located in the **repository root**.

```bash
# Setup (from root)
python -m venv .venv

# Install dependencies (Windows)
.\.venv\Scripts\pip install -r services/ml/requirements.txt -r services/ml/requirements-dev.txt

# Run lint/tests
.\.venv\Scripts\python -m pytest services/ml
```

---

## Coding Conventions & Casing Standards

To maintain consistency across the stack, we use distinct casing standards for different layers of the application.

### 1. Naming Conventions
*   **Rust**: Use `snake_case` for backend commands, functions, and internal logic.
*   **Frontend**: Use `camelCase` for React components, props, and local variables.
*   **Python**: Use `snake_case` for all Python scripts and models.

### 2. IPC Serialization (Tauri)
**All data serialized between the Frontend and Backend via Tauri IPC MUST use `camelCase`.**
*   Backend structs should use `#[serde(rename_all = "camelCase")]`.
*   Sidecar-compatible models should use `#[serde(alias = "snake_case_name")]` to support legacy sidecar output.

### 3. Canonical Hashing & Schema
**All data intended for Canonical Hashing (stored in `canonical_data`) MUST use `snake_case`.**
*   This ensures alignment with the canonical schema (`src-tauri/schemas/spell.schema.json`) and external resource standards.
*   Do not use `camelCase` for fields that contribute to the `content_hash`.

---

## Testing

### Running Tests

**Backend (Rust)**:
```bash
cd apps/desktop/src-tauri
cargo test                           # Run all tests
cargo test --lib                     # Run library tests only
cargo test canonical_spell           # Run specific module tests
cargo test -- --nocapture            # Show println! output
```

**Parser Tests**:
```bash
# Test individual parsers
cargo test --lib parsers::range
cargo test --lib parsers::area
cargo test --lib parsers::duration
cargo test --lib parsers::mechanics
cargo test --lib parsers::components
```

**Frontend (React/TypeScript)**:
```bash
cd apps/desktop
pnpm test                            # Run frontend tests
```

**Python (ML Services)**:
```bash
# From repository root
.\.venv\Scripts\python -m pytest services/ml
```

> [!TIP]
> If you encounter PDB linker errors during testing on Windows, run `cargo clean -p spellbook-desktop` and try again. See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for details.

---

## Formatting and Linting

We enforce strict formatting across all languages. Run these before committing:

| Language | Tool | Command (from `apps/desktop`) |
| :--- | :--- | :--- |
| **JS/TS** | Biome | `pnpm format` |
| **Rust** | Rustfmt | `cargo fmt` (in `src-tauri`) |
| **Python** | Ruff | `ruff format .` (in `services/ml`) |

---

## Specifications (OpenSpec)
For detailed planning and architectural shifts, refer to the [OpenSpec Instructions](../openspec/AGENTS.md). All significant changes must follow the OpenSpec proposal workflow.
