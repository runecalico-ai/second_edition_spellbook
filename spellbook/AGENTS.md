# Agent Guide

## Repo layout

- `spellbook/apps/desktop`: Tauri + React desktop app.
- `spellbook/services/ml`: Python sidecar services.
- `spellbook/db/migrations`: SQLite migrations.
- `spellbook/scripts`: helper scripts.
- `spellbook/spells_md`: markdown spell content.

## Desktop app workflow

**Prereqs:** Node 24+, pnpm or npm, Rust toolchain, Tauri CLI.

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

- Dependencies live in `requirements.txt` and `requirements-dev.txt`.
- Example run (JSON-RPC):

```bash
cd spellbook/services/ml
python3 spellbook_sidecar.py <<EOF
{"jsonrpc":"2.0","id":1,"method":"embed","params":{"texts":["test"]}}
EOF
```

## Linting, formatting, and checks

Desktop app:

```bash
cd spellbook/apps/desktop
pnpm lint
```

```bash
cd spellbook/apps/desktop
pnpm format:check
```

Rust (run from `spellbook/apps/desktop/src-tauri`):

```bash
cd spellbook/apps/desktop/src-tauri
cargo fmt -- --check
```

```bash
cd spellbook/apps/desktop/src-tauri
# Rust dependencies (linux)
sudo apt-get install -y \
  libglib2.0-dev \
  libgtk-3-dev \
  libsoup-3.0-dev \
  libwebkit2gtk-4.1-dev
cargo clippy -- -D warnings
```

## Testing guidance

Tests live in `spellbook/services/ml/tests`. When needed:

```bash
cd spellbook/services/ml
python -m ruff check .
python -m pytest
```

### End-to-End (E2E) Testing

Location: `spellbook/apps/desktop/tests/e2e.spec.ts`.

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
   npm install
   ```

**Running Tests:**
```bash
cd spellbook/apps/desktop
npx playwright test
```

**Best Practices for E2E Tests:**
- **Locator Strategy**: Prefer user-facing locators like `page.getByRole()`, `page.getByPlaceholder()`, or `page.getByLabel()`.
- **Test Steps**: Use `test.step('Step Name', ...)` to organize logical phases within a test.
- **Unique Content**: Use timestamps or random strings in test data (e.g., spell names) to avoid collisions with existing data in the SQLite database.
- **Wait for Visibility**: Always expect elements to be visible before interacting.

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
- See `spellbook/README.md` for more details.
