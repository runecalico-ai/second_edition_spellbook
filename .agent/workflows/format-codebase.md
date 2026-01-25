---
description: Format the codebase using Biome (Frontend), Rustfmt (Backend), and Ruff (Python)
---

This workflow formats the code for all parts of the application to ensure consistent style.

## Frontend (React/TS/CSS)

1. Format the frontend code
   - Uses Biome to format TypeScript, JSX, and JSON files.
   ```bash
   cd spellbook/apps/desktop
   pnpm format
   ```

## Backend (Rust/Tauri)

2. Format the backend code
   - Uses rustfmt (standard Rust formatter).
   ```bash
   cd spellbook/apps/desktop/src-tauri
   cargo fmt
   ```

## Services (Python/ML)

3. Format the Python services
   - Uses Ruff to format Python code.
   ```bash
   # Active Virtual Environment (Windows) if not auto-detected
   # .\.venv\Scripts\Activate.ps1
   cd spellbook/services/ml
   ruff format .
   ```
