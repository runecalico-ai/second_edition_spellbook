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

Release builds must run resource staging first (sqlite-vec into `apps/desktop/src-tauri/resources/sqlite-vec/` and the frozen sidecar into `apps/desktop/src-tauri/binaries/`):

```powershell
python scripts\prepare_release_bundle.py
.\scripts\build_windows_installer.ps1
```

`build_windows_installer.ps1` invokes `prepare_release_bundle.py` itself before `tauri build`.
