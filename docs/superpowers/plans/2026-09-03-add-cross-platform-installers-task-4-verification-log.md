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

Not flipped after this first pass. Required bar is app start + markdown import + HTML PDF-export + vec0 after first launch. vec0 copy on an unmodified installed launch failed. Commit `4a57b80` overclaimed that sidecar and sqlite-vec already worked without a checkout; 4.1 remained open.

### Re-smoke after packaging fixes

- Date: 2026-09-13 (afternoon; after `3273880` / `b23b7c0` / `f8bfd90` / `3b8bf4b`)
- Host OS: Windows 11 (win32 10.0.26200), `IsAdmin=False`
- Installer filename: `Spellbook_0.1.0_x64-setup.exe`
- Installer path used: `C:\WINDOWS\TEMP\cursor-sandbox-cache\ade67fc429fe2d13a05b78582153dcff\cargo-target\release\bundle\nsis\Spellbook_0.1.0_x64-setup.exe` (printed by `build_windows_installer.ps1`; copied only that file to `%TEMP%\spellbook-task4-nsis-iter2\`)
- Installer size: 39,396,346 bytes
- Installer SHA256: `9D729C3AE278058D67B36C456B87E396DE348C6AFB455CAAF55EF98D80B5ACFC`
- Installer LastWriteTime: 2026-09-13 15:10:35
- Frozen sidecar staged for this bundle: `apps\desktop\src-tauri\binaries\spellbook-sidecar-x86_64-pc-windows-msvc.exe` 25,788,805 bytes (first-pass freeze was 9,598,002 bytes without pdfminer/docx wheels)
- Start Menu launch: yes
- Markdown import: yes
- DOCX import: yes
- PDF import (pdfminer): yes
- PDF export is HTML: yes
- `%APPDATA%/SpellbookVault/vec0.dll` present after unmodified launch: yes
- Notes:

#### F4 (4a57b80 overclaim)

Commit `4a57b80` body said the bundled sidecar and sqlite-vec resources work without a checkout. That original smoke **failed** DOCX import (`python-docx not installed`), PDF import (`pdfminer.six not installed`), and vec0 copy on an unmodified launch. 4.1 stayed open. This subsection is the incomplete-then-re-smoked gate: first pass recorded as a fail above; this rebuild/re-smoke is a separate pass.

#### Rebuild

- `.\.venv\Scripts\python.exe scripts\prepare_release_bundle.py` then `.\scripts\build_windows_installer.ps1 -SkipInstall` (exit 0). `CARGO_TARGET_DIR` was `C:\WINDOWS\TEMP\cursor-sandbox-cache\ade67fc429fe2d13a05b78582153dcff\cargo-target`; the PS1 reported that NSIS path (not the stale repo-root 14MB `target\release\bundle\nsis\` file).
- Freeze installed `pdfminer.six` / `python-docx` into the venv interpreter and processed `hook-pdfminer.py` / `hook-docx.py` (no “Hidden import not found”).

#### Install

- Uninstalled previous current-user Spellbook (`%LOCALAPPDATA%\Spellbook\uninstall.exe /S`, exit 0). HKCU uninstall key gone; Start Menu shortcut gone.
- Deleted `%APPDATA%\SpellbookVault\vec0.dll` **before** launch (it existed from the first-pass diagnostic `SPELLBOOK_SQLITE_VEC_RESOURCE_DIR` override).
- **F7 non-silent attempt:** ran the copied `setup.exe` **without** `/S`. Process `Spellbook_0.1.0_x64-setup.exe` PID 20772 stayed alive ~76s with `MainWindowTitle=Spellbook Setup` (NSIS wizard). Install dir never appeared. No SmartScreen window was observed; no VC++ MessageBox was observed (the wizard never progressed). This agent could not click the wizard. Killed the process. **Did not click through SmartScreen.**
- Fallback silent install: `setup.exe /S` (exit 0). Actual `InstallLocation` (HKCU): `C:\Users\vitki\AppData\Local\Spellbook` (not Program Files; Program Files and Program Files (x86) Spellbook dirs absent). Installed `spellbook-desktop.exe` 60,417,024 bytes; `spellbook-sidecar.exe` 25,788,805 bytes; `resources\sqlite-vec\vec0.dll` 278,016 bytes. Start Menu: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Spellbook.lnk`.
- Task 3 payload grep must search `%LOCALAPPDATA%\Spellbook` as well as Program Files. Silent `/S` skipped SmartScreen and the VC++ MessageBox; F7 was still open after that fallback (resolved in the re-drive below).

#### F7 non-silent wizard (re-drive; resolved)

- Date: 2026-09-13 15:32–15:49 (same host, same installer SHA256 `9D729C3AE278058D67B36C456B87E396DE348C6AFB455CAAF55EF98D80B5ACFC`)
- Wizard completed without `/S`: **yes**
- SmartScreen: shown **no**, clicked **no** (local TEMP copy; no “Windows protected your PC” window)
- VC++ MessageBox: shown **no** (PREINSTALL hook did not fire; VC++ runtime already present)
- Window titles observed (NSIS `#32770`): `Spellbook Setup` with pages **Welcome to Spellbook Setup** → **Choose Install Location** (`C:\Users\vitki\AppData\Local\Spellbook`, 82.5 MB) → **Installing** (extract `spellbook-desktop.exe` / `spellbook-sidecar.exe`) → **Installation Complete** (“Setup was completed successfully.”) → **Finish**
- Drive method: started `Spellbook_0.1.0_x64-setup.exe` with no `/S` (PID 19760). First UIA `Invoke` pass failed (`Operation is not valid` / `Hot key is already registered`) and also produced a transient `Windows cannot find ' C:\Users\vitki\AppData\Local\Spellbook\spellbook-desktop.exe '` OK dialog (leading space in the path; not SmartScreen; not clicked as Run anyway). Same non-silent PID 19760 was then driven with Win32 `BM_CLICK` + mouse click on `&Next >` / `Finish`. Setup process exited after Finish (15:48:55).
- HKCU after Finish: `DisplayName=Spellbook`, `InstallLocation="C:\Users\vitki\AppData\Local\Spellbook"`. `uninstall.exe` LastWriteTime 2026-09-13 15:43:40 (written during this interactive extract).
- App start after Finish: `spellbook-desktop.exe` PID 13092, path `C:\Users\vitki\AppData\Local\Spellbook\spellbook-desktop.exe`, `MainWindowTitle=Spellbook`. A second constructed-path launch (PID 17928) also showed title `Spellbook`.
- OpenSpec 4.1 was already `[x]`; not flipped.

#### F6 Start Menu launch (not a constructed exe path)

- Resolved `.lnk` target via `WScript.Shell`: `C:\Users\vitki\AppData\Local\Spellbook\spellbook-desktop.exe`, working directory the install dir. Launched the shortcut itself. `SPELLBOOK_SQLITE_VEC_RESOURCE_DIR` was unset/empty.
- After GUI up: `spellbook-desktop.exe` PID 7024, `ExecutablePath`/`ImagePath` = `C:\Users\vitki\AppData\Local\Spellbook\spellbook-desktop.exe`, `MainWindowTitle=Spellbook`. In-app file-picker import was not driven (no UI automation for the Tauri WebView).
- After 45s unmodified launch, `%APPDATA%\SpellbookVault\vec0.dll` existed (278,016 bytes). This is **not** an override pass.

#### Sidecar JSON-RPC (installed exe only, after GUI up)

Fixtures under `%TEMP%\spellbook-task4-smoke-iter2\`. Driven on stdin of installed `spellbook-sidecar.exe` (25,788,805 bytes). Repo `services\ml\spellbook_sidecar.py` was not used to parse.

- **Markdown (no BOM):** yes. `test-spell-nobom.md` → `result.spells[0].name=Test Spell`, `level=1`, `conflicts=[]`.
- **Markdown (UTF-8 BOM):** yes. `test-spell-bom.md` → same name/level, `conflicts=[]` (BOM stripped from `_raw_text`).
- **DOCX:** yes. Minimal OOXML `.docx` → `conflicts=[]`, description contains `Fireball` / `Level: 3` (no `python-docx not installed`).
- **PDF import:** yes. Minimal PDF fixture → `conflicts=[]`, description `Magic Missile Level: 1 A magic dart.` (no `pdfminer.six not installed`).
- **PDF export is HTML:** yes. `method=export` `format=pdf` returned `"format": "html"`, path `spellbook_export_*.html` (1,397 bytes), note `Print-optimized HTML generated. Use browser 'Print to PDF' for PDF output.` File starts with `<!doctype html>`.

#### OpenSpec 4.1 (re-smoke)

Flipped to `[x]`. Bar met: Start Menu start yes, markdown import yes, PDF export HTML yes, vec0.dll present after unmodified launch, and DOCX/PDF import also yes after the freeze fix.
