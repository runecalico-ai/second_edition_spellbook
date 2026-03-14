---
description: Lint the entire codebase (Frontend, Backend, Python)
---

This workflow runs linting checks on all parts of the application.

## Frontend (React/TS)

1. Lint the frontend code
   - Run Biome + Knip together (default local lint flow).
   ```bash
   cd apps/desktop
   pnpm lint
   ```

2. (Optional) Run frontend lint tools individually for clearer troubleshooting
   - Run only Biome:
   ```bash
   cd apps/desktop
   pnpm run lint:biome
   ```
   - Run only Knip (unused dependency hygiene):
   ```bash
   cd apps/desktop
   pnpm run knip
   ```

## Backend (Rust/Tauri)

3. Lint the backend code
   - Clippy is the standard linter for Rust.
   ```bash
   cd apps/desktop/src-tauri
   cargo clippy -- -D warnings
   ```

## Services (Python/ML)

4. Lint the Python services
   - Ruff is an extremely fast Python linter.
   ```bash
   # Active Virtual Environment (Windows)
   . .\.venv\Scripts\Activate.ps1
   cd services/ml
   # Ensure virtual environment is activated if
   ruff check .
   ```