# Agent Guide

## Repo layout

- `spellbook/apps/desktop`: Tauri + React desktop app.
- `spellbook/services/ml`: Python sidecar services.
- `spellbook/db/migrations`: SQLite migrations.
- `spellbook/scripts`: helper scripts.
- `spellbook/spells_md`: markdown spell content.

## Desktop app workflow

**Prereqs:** Node 24+, pnpm (or npm), Rust toolchain, Tauri CLI.

```bash
cd spellbook/apps/desktop
pnpm install
pnpm tauri:dev
```

For the web UI (without the Tauri shell):

```bash
cd spellbook/apps/desktop
pnpm dev
```

## Sidecar workflow

Location: `spellbook/services/ml`.

- **Virtual Environment**: Always use a virtual environment located in the **repository root**. Create it if it doesn't exist:
  ```bash
  # From repository root
  python -m venv .venv
  ```
- **Dependencies**: Install from `requirements.txt` and `requirements-dev.txt`:
  ```bash
  # From repository root
  # Windows
  .\.venv\Scripts\pip install -r spellbook/services/ml/requirements.txt -r spellbook/services/ml/requirements-dev.txt
  # Unix
  ./.venv/bin/pip install -r spellbook/services/ml/requirements.txt -r spellbook/services/ml/requirements-dev.txt
  ```
- **Example run (JSON-RPC)**:
  ```bash
  # From repository root
  # Windows
  .\.venv\Scripts\python spellbook/services/ml/spellbook_sidecar.py <<EOF
  {"jsonrpc":"2.0","id":1,"method":"embed","params":{"texts":["test"]}}
  EOF
  # Unix
  ./.venv/bin/python spellbook/services/ml/spellbook_sidecar.py <<EOF
  {"jsonrpc":"2.0","id":1,"method":"embed","params":{"texts":["test"]}}
  EOF
  ```

## Linting and formatting

### JavaScript (Desktop app)
**spellbook/apps/desktop**

- Lint: `pnpm lint`
```bash
cd spellbook/apps/desktop
# Windows/Unix
pnpm lint
```

- Format: `pnpm format`
```bash
cd spellbook/apps/desktop
# Windows/Unix
pnpm format # Format
```

- Format check: `pnpm format:check`
```bash
cd spellbook/apps/desktop
# Windows/Unix
pnpm format:check
```


### Rust (Dekstop Backend)
**spellbook/apps/desktop/src-tauri**

- Clippy (lint): `cargo clippy -- -D warnings`

```bash
cd spellbook/apps/desktop/src-tauri
# Windows/Unix
# Linux Only (for clippy)
sudo apt-get install -y \
  libglib2.0-dev \
  libgtk-3-dev \
  libsoup-3.0-dev \
  libwebkit2gtk-4.1-dev
cargo clippy -- -D warnings # Clippy (lint)
```

- Format: `cargo fmt`
```bash
cd spellbook/apps/desktop/src-tauri
# Windows/Unix
cargo fmt # Format
```

- Format check: `cargo fmt -- --check`
```bash
cd spellbook/apps/desktop/src-tauri
# Windows/Unix
cargo fmt -- --check # Format check
```

### Python (ML services)

Code lives in `spellbook/services/ml`. Use the root virtual environment:
- Lint: `ruff check .`
```bash
# In repository root
# Active Virtual Environment (Windows)
.\.venv\Scripts\Activate.ps1
# Active Virtual Environment (Unix)
source .venv/bin/activate
cd spellbook/services/ml
# Lint
ruff check .
```

- Format: `ruff format .`
```bash
# In repository root
# Active Virtual Environment (Windows)
.\.venv\Scripts\Activate.ps1
# Active Virtual Environment (Unix)
source .venv/bin/activate
cd spellbook/services/ml
# Format
ruff format .
```

- Format check: `ruff format --check .`
```bash
# In repository root
# Active Virtual Environment (Windows)
.\.venv\Scripts\Activate.ps1
# Active Virtual Environment (Unix)
source .venv/bin/activate
cd spellbook/services/ml
# Format check
ruff format --check .
```

## Testing guidance (ML services)

Tests live in `spellbook/services/ml/tests`. Use the root virtual environment:

```bash
# From repository root
# Windows
.\.venv\Scripts\python -m ruff check spellbook/services/ml
.\.venv\Scripts\python -m pytest spellbook/services/ml
# Unix
./.venv/bin/python -m ruff check spellbook/services/ml
./.venv/bin/python -m pytest spellbook/services/ml
```

### End-to-End (E2E) Testing

Location: `spellbook/apps/desktop/tests/`.

These tests use **Playwright** to drive the packaged Tauri application. They require the app to be built in debug mode.

**Prerequisites:**
1. Build the desktop app in debug mode:
   ```bash
   cd spellbook/apps/desktop/src-tauri
   cargo build
   ```
2. Ensure dependencies are installed:
   ```bash
   cd spellbook/apps/desktop
   # Windows/Unix
   pnpm install
   ```

**Running E2E Tests:**
```bash
cd spellbook/apps/desktop
# Windows/Unix
npx playwright test
```

### Linting uses `ruff`; keep it offline-friendly by installing from local wheels or cached packages.

## Development Workflow

Always run the following before completing work:

- JavaScript formatting.
- Rust formatting.
- Python formatting.
- JavaScript linting.
- Rust linting.
- Python linting.

## Notes

- Keep instructions offline-friendly since the sidecar is designed to run without network access.
