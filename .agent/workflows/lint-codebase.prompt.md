---
description: Lint the entire codebase (Frontend, Backend, Python)
---

This workflow runs linting checks on all parts of the application.

## Frontend (React/TS)

1. Lint and Type-Check the frontend code
   - Linting (Biome) ensures code quality and style.
   - Type-checking (tsc) ensures architectural and type safety.
   ```bash
   cd apps/desktop
   pnpm lint
   pnpm tsc --noEmit
   ```

## Backend (Rust/Tauri)

2. Lint the backend code
   - Clippy is the standard linter for Rust.
   ```bash
   cd apps/desktop/src-tauri
   cargo clippy -- -D warnings
   ```

## Services (Python/ML)

3. Lint the Python services
   - Ruff is an extremely fast Python linter.
   ```bash
   # Active Virtual Environment (Windows)
   . .\.venv\Scripts\Activate.ps1
   cd services/ml
   # Ensure virtual environment is activated if
   ruff check .
   ```