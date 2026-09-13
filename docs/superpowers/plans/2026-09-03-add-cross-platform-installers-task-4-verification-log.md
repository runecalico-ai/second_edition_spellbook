# Task 4 verification log

## Windows NSIS

- Date: 2026-09-13
- Host OS: Windows 11 (win32 10.0.26200)
- Installer filename: `Spellbook_0.1.0_x64-setup.exe`
- App starts without repo checkout: yes
- Markdown import: yes
- DOCX import: no
- PDF import (pdfminer): no
- PDF export is HTML: yes
- `%APPDATA%/SpellbookVault/vec0.dll` present after first launch: no
- Notes:

### Installer build

- Rebuilt on 2026-09-13 (did not reuse the stale `target\release\bundle\nsis\Spellbook_0.1.0_x64-setup.exe` from 2026-09-03, 14,111,969 bytes).
- `python scripts\prepare_release_bundle.py` must use repo `.venv` Python 3.14.4 (PyInstaller 6.22.2). System `python` on PATH is 3.14.4 without PyInstaller (`No module named PyInstaller`).
- Prepare freeze log: `Hidden import 'pdfminer.high_level' not found` and `Hidden import 'pdfminer.layout' not found`. Frozen sidecar is `apps\desktop\src-tauri\binaries\spellbook-sidecar-x86_64-pc-windows-msvc.exe` (9,598,002 bytes).
- `.\scripts\build_windows_installer.ps1 -SkipInstall` exited 0, but this Cursor agent shell has `CARGO_TARGET_DIR=C:\WINDOWS\TEMP\cursor-sandbox-cache\ade67fc429fe2d13a05b78582153dcff\cargo-target`. Tauri wrote the new NSIS exe there. The PS1 then reported the stale repo-root `target\release\bundle\nsis\` artifact because that preferred directory already contained a `*-setup.exe`.
- **Installer used for smoke (rebuilt, not stale):** `C:\WINDOWS\TEMP\cursor-sandbox-cache\ade67fc429fe2d13a05b78582153dcff\cargo-target\release\bundle\nsis\Spellbook_0.1.0_x64-setup.exe` — 23,629,196 bytes, LastWriteTime 2026-09-13 12:21:44. Copied only that setup exe to `%TEMP%\spellbook-task4-nsis\`.

### Install (no repo checkout)

- Host was not elevated (`IsAdmin=False`). Silent install: `Spellbook_0.1.0_x64-setup.exe /S` (exit 0). No SmartScreen prompt in this silent path. VC++ hook did not block.
- Install location (Tauri NSIS current-user default, not Program Files): `C:\Users\vitki\AppData\Local\Spellbook`
  - `spellbook-desktop.exe` 60,394,496 bytes
  - `spellbook-sidecar.exe` 9,598,002 bytes (Tauri stripped the target-triple suffix)
  - `resources\sqlite-vec\vec0.dll` 278,016 bytes (bundled in the install dir)
  - Start Menu: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Spellbook.lnk`
- Uninstall registry: HKCU `DisplayName=Spellbook`, `InstallLocation=C:\Users\vitki\AppData\Local\Spellbook`.

### App start

- Launched `C:\Users\vitki\AppData\Local\Spellbook\spellbook-desktop.exe` with working directory set to the install dir (not `pnpm tauri:dev`, not the repo).
- Process stayed alive with `MainWindowTitle=Spellbook` (working set ~35 MB). User vault `%APPDATA%\SpellbookVault` (pre-existing from prior local use) was not launched from a checkout.

### Sidecar smokes (bundled exe only)

Python exists on PATH (`C:\users\vitki\AppData\Local\Python\bin\python.exe`) but was **not** used to parse. JSON-RPC was driven on stdin of the installed `spellbook-sidecar.exe`. Fixtures lived under `%TEMP%\spellbook-task4-smoke\`. Repo `services\ml\spellbook_sidecar.py` and repo venv were not used for import/export.

- **Markdown:** yes. UTF-8 (no BOM) fixture `test-spell-nobom.md` with front matter `name: Test Spell` / `level: 1`. Response `result.spells[0].name=Test Spell`, `level=1`, `conflicts=[]`. First attempt with PowerShell `Set-Content -Encoding utf8` (UTF-8 BOM) crashed the sidecar on stdout `cp1252` encode of `\ufeff`; that was a fixture encoding issue, not a parser miss.
- **DOCX:** no. Minimal OOXML `.docx` created in TEMP without python-docx (venv also lacks `docx`). Bundled sidecar returned `conflicts: parsing_error: python-docx not installed`.
- **PDF import:** no. Hand-written minimal PDF fixture in TEMP. Bundled sidecar returned `conflicts: parsing_error: pdfminer.six not installed`. Matches the PyInstaller hidden-import warnings.
- **PDF export is HTML:** yes. `method=export` `format=pdf` returned `"format": "html"`, path `spellbook_export_*.html` (1,397 bytes), note `Print-optimized HTML generated. Use browser 'Print to PDF' for PDF output.` File starts with `<!doctype html>`.

### sqlite-vec / vec0.dll

- Before any installed-app launch, `%APPDATA%\SpellbookVault\vec0.dll` was **absent** (vault existed with `spellbook.sqlite3` from prior use).
- After first launches of the installed exe **without** overrides (20–45 s, window title Spellbook), `vec0.dll` was still absent. 4.1 therefore remains incomplete: the production resource-dir probe did not copy the bundled DLL.
- Diagnostic only (not counted as a pass): launching with `SPELLBOOK_SQLITE_VEC_RESOURCE_DIR=C:\Users\vitki\AppData\Local\Spellbook\resources` immediately copied and loaded `vec0.dll` (278,016 bytes) into the vault (`sqlite-vec: loaded extension path=...\SpellbookVault\vec0.dll`). That shows the bundled DLL is valid; `app.path().resource_dir()` is not resolving to the install `resources\` folder that contains `sqlite-vec\vec0.dll`. Do not treat the override as a clean-install success.

### OpenSpec 4.1

Not flipped. Required bar is app start + markdown import + HTML PDF-export + vec0 after first launch. vec0 copy on an unmodified installed launch failed.
