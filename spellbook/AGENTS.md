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
   cd spellbook/apps/desktop
   pnpm tauri:build --debug
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

## Character Profile System

Established in Part 1 (Foundation), the character system supports multi-classing and per-class spell management.

### Data Model

- **`character` table**: Core identity (name, race, alignment, COM toggle).
- **`character_ability` table**: Normalized 1:1 table for ability scores (STR, DEX, CON, INT, WIS, CHA, COM).
- **`character_class` table**: 1:N relationship allowing multiple classes per character.
- **`character_class_spell` table**: Links spells to *classes* rather than characters, with `list_type` ('KNOWN' or 'PREPARED').

### Backend Patterns

All character management is via Tauri commands in `src-tauri/src/commands/characters.rs`:

- **Identity**: `update_character_details(id, name, type, race, alignment, com_enabled, notes)`
- **Abilities**: `update_character_abilities(character_id, str, dex, ...)`
- **Classes**: `add_character_class`, `remove_character_class`, `get_character_classes`
- **Spells**: `add_character_spell` (with notes), `remove_character_spell`, `get_character_class_spells`, `update_character_spell_notes`

> [!IMPORTANT]
> The legacy `spellbook` table is deprecated. Spells are now associated with a specific `character_class_id`.

### Example CRUD Flow (Frontend)

```typescript
// 1. Create Character
const id = await invoke("create_character", { name: "Elminster", characterType: "PC" });

// 2. Add Class
const classId = await invoke("add_character_class", { characterId: id, className: "Mage", level: 20 });

// 3. Add Spell to Class Known List
await invoke("add_character_spell", {
  characterClassId: classId,
  spellId: 42,
  listType: "KNOWN"
});
```

## Notes

- Keep instructions offline-friendly since the sidecar is designed to run without network access.
