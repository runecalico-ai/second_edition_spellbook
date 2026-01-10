# Spellbook Desktop App (Tauri + React)

This repository houses the local-only AD&D 2e spellbook app. The desktop client lives under
`apps/desktop`, the Python ML/import sidecar under `services/ml`, and the SQLite migrations under
`db/migrations`.

## Quickstart

1) Install prerequisites
- Node 18+, pnpm or npm
- Rust toolchain (stable)
- Tauri 2 CLI: `npm i -g @tauri-apps/cli@latest` (or use npx)

2) Install JS deps
```bash
cd apps/desktop
pnpm install   # or npm install
```

3) Run in desktop mode
```bash
pnpm tauri:dev
```

If you want to run just the web UI for quick iteration:
```bash
pnpm dev
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
spellbook/
  apps/desktop/        # Tauri + React UI
  db/migrations/       # SQLite schema/migrations
  services/ml/         # Python sidecar (embeddings/import/export)
  scripts/             # build and packaging helpers
  spells_md/           # sample markdown spells
```
