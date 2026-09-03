# Scripts

This directory is reserved for local development and packaging helpers.

## Windows installer

Build a local NSIS installer with:

```powershell
.\scripts\build_windows_installer.ps1
```

Default output (Tauri's standard NSIS path):

`apps/desktop/src-tauri/target/release/bundle/nsis/`

Copy the installer elsewhere:

```powershell
.\scripts\build_windows_installer.ps1 -OutputDirectory 'C:\dist\spellbook'
```
