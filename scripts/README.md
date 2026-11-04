# Scripts

This directory is reserved for local development and packaging helpers.

## Windows installer

Build a local NSIS installer with:

```powershell
.\scripts\build_windows_installer.ps1
```

Default output (this repo's Cargo `target-dir`):

`target/release/bundle/nsis/` at the repository root

Copy the installer elsewhere:

```powershell
.\scripts\build_windows_installer.ps1 -OutputDirectory 'C:\dist\spellbook'
```

`build_windows_installer.ps1` stages release resources itself: it runs `prepare_release_bundle.py` (sqlite-vec into `apps/desktop/src-tauri/resources/sqlite-vec/` and the frozen sidecar into `apps/desktop/src-tauri/binaries/`) with the repository-root `.venv` interpreter before `tauri build`. Create that `.venv` first (setup: [Release builds](../docs/DEVELOPMENT.md#release-builds-windows-nsis-linux-appimage-and-deb)).

Only direct `pnpm tauri:build:win` or `pnpm tauri:build:linux` invocations need the staging step run manually first (from repository root):

```powershell
.\.venv\Scripts\python scripts\prepare_release_bundle.py
```
