# Spellbook Desktop App (Tauri + React)

This repository houses the local-only AD&D 2e spellbook app. The desktop client lives under
`apps/desktop`, the Python ML/import sidecar under `services/ml`, and the SQLite migrations under
`db/migrations`.

## Quickstart

1) Install prerequisites
- Node 24+, pnpm or npm
- Rust toolchain (stable)
- Python 3.14 (for the `services/ml` sidecar)
- Tauri 2 CLI: `npm i -g @tauri-apps/cli@latest` (or use npx)
- Pandoc (for PDF export)

2) Install JS deps
```bash
cd apps/desktop
pnpm install   # or npm install
```

3) Run in desktop mode
```bash
pnpm tauri:dev
```

> [!IMPORTANT]
> **Debug Builds vs. Release Builds**
> When running the app in development mode (`tauri:dev`), the Tauri window acts as a browser pointing to your local Vite server (`http://127.0.0.1:5173`).
> **Do not launch the `.exe` directly** from the `src-tauri/target/debug` folder; it will show a blank screen unless the Vite server is already running and reachable.
> For a standalone executable, you must use `pnpm tauri:build` to bundle the frontend assets into the binary.

Backend runtime logging (Tauri/Rust) uses structured `tracing` logs. For local verbosity while developing, set `RUST_LOG` before starting Tauri:

```powershell
$env:RUST_LOG="info,spellbook_desktop=debug"
pnpm tauri:dev
```

Runtime logging is initialized in `apps/desktop/src-tauri/src/lib.rs` and `apps/desktop/src-tauri/src/main.rs`.

If you want to run just the web UI for quick iteration:
```bash
pnpm dev
```

## Features

### Character Management

The app supports rich character profiles for AD&D 2e PCs and NPCs with multi-class support and per-class spell management.

#### Creating a Character

1. Navigate to the **Characters** tab
2. Click the **+ Create Character** button
3. Enter a character name and select type (PC or NPC)
4. Click **Save** to create the character

#### Character Profile

Each character has a comprehensive profile including:

- **Identity**: Name, race, alignment, and notes
- **Abilities**: All six core abilities (STR, DEX, CON, INT, WIS, CHA) plus optional Comeliness (COM)
  - Toggle "Enable Comeliness" to track the COM ability
  - No maximum values enforced - supports high-level campaigns
- **Classes**: Support for multi-classing with independent levels per class

#### Multi-Class Management

Characters can have multiple classes, each with its own level and spell lists:

1. Open a character's profile
2. In the **Classes** panel, select a class from the dropdown (Mage, Cleric, Fighter, etc.)
3. Use the **+/-** buttons to adjust class levels
4. Each class maintains separate **Known** and **Prepared** spell lists

**Supported Classes**: Mage, Specialist Wizard, Cleric, Druid, Priest, Fighter, Paladin, Ranger, Thief, Bard, or "Other" (custom class name)

#### Per-Class Spell Lists

Each spellcasting class on a character has two independent spell lists:

- **Known Spells**: All spells the character knows for that class
- **Prepared Spells**: Subset of Known spells that are currently prepared

**Adding Spells**:
1. Click the class name to expand its spell panel
2. Switch between **KNOWN** and **PREPARED** tabs
3. Click **+ ADD** to open the spell picker
4. Use filters to find spells:
   - **Name search**: Partial text match
   - **Level range**: Min/Max level filters
   - **Cantrip/Quest**: Boolean toggles
   - **School**: For Arcane spells (Evocation, Necromancy, etc.)
   - **Sphere**: For Divine spells (Healing, Protection, etc.)
   - **Tags**: Filter by custom tags
5. Select spells and click **BULK ADD** or click **ADD** on individual spells

**Important Rules**:
- Spells must be added to **KNOWN** before they can be added to **PREPARED**
- Removing a spell from **KNOWN** automatically removes it from **PREPARED**
- Each class maintains its own spell lists (e.g., a Mage/Cleric's Mage spells are separate from their Cleric spells)

**Per-Spell Notes**: Add notes to any spell in your lists (e.g., "Use against Trolls")

#### Deleting Characters

1. Navigate to the **Characters** list
2. Hover over a character to reveal the delete button
3. Click the delete button and confirm
4. All associated data (abilities, classes, spell lists) will be permanently removed

### Character Search & Filtering

Large character rosters can be managed using the search and filter tools on the main Characters page:

- **Search**: Real-time filtering by character name.
- **Advanced Filters**: Click the filter icon to filter by:
  - **Class**: e.g. "Mage", "Fighter"
  - **Level Range**: e.g. Level 5-10
  - **Race**: e.g. "Elf"
  - **Result Limit**: Adjust the number of displayed results (50, 100, etc.)

### Exporting & Printing

#### Exporting Characters
You can export characters for backup, sharing, or use in other tools:
- **JSON Export**: Complete data dump standard for backups or re-importing.
- **Markdown ZIP**: Optimized for Notes apps (Obsidian, Notion) or LLM context.
  - Includes a summary `README.md`.
  - Individual Markdown files for each spell.
  - Folder structure organized by Class -> Level.

#### Printing
The app generates printer-friendly layouts directly from the character editor:
- **Character Sheet**: Generates a standard styled character sheet with stats and save tables.
- **Spellbook Pack**: Generates a compact "Spellbook" PDF containing full descriptions of all Known/Prepared spells, organized by class and level. Ideal for printing physical spell cards or booklets.

## Linting and formatting

From `apps/desktop`, run:

```bash
pnpm lint
pnpm format
pnpm format:check
```

## Next steps
- Add models + dependencies to `services/ml` for embeddings and local chat.
- Expand the import pipeline to use PDF/DOCX/Markdown parsers in the sidecar.
- Tune search performance and hybrid ranking once vector search is enabled.

## Backup and restore

The desktop app exposes Tauri commands for backing up and restoring the local vault:

- `backup_vault(destination_path: String)`: creates a ZIP archive of the `SpellbookVault`
  directory at the provided file path.
- `restore_vault(backup_path: String, allow_overwrite: bool)`: restores the ZIP archive into
  `SpellbookVault`. If the vault directory is not empty, set `allow_overwrite` to `true` to
  replace the existing vault data.

## Project layout

```
/
  apps/desktop/        # Tauri + React UI
  db/migrations/       # SQLite schema/migrations
  services/ml/         # Python sidecar (embeddings/import/export)
  scripts/             # build and packaging helpers
  spells_md/           # sample markdown spells
```
