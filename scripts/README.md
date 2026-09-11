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
