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

## Linux Ubuntu 24.04

- Date: 2026-10-30
- Distro: Ubuntu 24.04.5 LTS (noble), WSL2 distro name `Ubuntu-24.04` (not `Ubuntu-26.04`)
- AppImage filename: `Spellbook_0.1.0_amd64.AppImage`
- deb filename: `Spellbook_0.1.0_amd64.deb`
- App starts without repo checkout: yes
- Markdown import: yes
- DOCX import: yes
- PDF import: yes
- PDF export is HTML: yes
- `~/.local/share/SpellbookVault/vec0.so` present after first launch: yes
- Notes:

### Toolchain (Linux-native; Windows PATH sanitized)

- Python 3.14.10 via uv (`cpython-3.14-linux-x86_64-gnu`). System `/usr/bin/python3` is 3.12.3 and was **not** used to freeze.
- Node v24.22.2 (`/usr/bin/node`, NodeSource `node_24.x`)
- pnpm 10.33.0 (`/usr/bin/pnpm`; corepack latest 12 was rejected)
- rustc 1.99.1 (58cf8f9c3 2026-10-13), cargo 1.99.1 (5f94df478 2026-08-27), host `x86_64-unknown-linux-gnu`
- Freeze venv: PyInstaller 6.22.2, pyinstaller-hooks-contrib 2026.7, pdfminer.six 20260107, python-docx 1.2.0. Freeze processed `hook-pdfminer.py` / `hook-docx.py`. No `Hidden import ... not found` lines.
- Frozen sidecar: `apps/desktop/src-tauri/binaries/spellbook-sidecar-x86_64-unknown-linux-gnu` 31,863,976 bytes.

### Installer build

- Tree copied into WSL ext4 at `/home/lvitki/spellbook-task2-build` from commit `910f717` (`add-cross-platform-installers`). Build did **not** use `/mnt/c` as `CARGO_TARGET_DIR`.
- `CARGO_TARGET_DIR` unset. `LIBCLANG_PATH` / Windows `CMAKE` unset so bindgen/cmake did not see `C:\Program Files\LLVM`.
- `python scripts/prepare_release_bundle.py` (venv 3.14) then `cd apps/desktop && pnpm install --frozen-lockfile && pnpm tauri:build:linux`.
- Artifacts under the clone's repo-root `target/release/bundle/`:
  - `appimage/Spellbook_0.1.0_amd64.AppImage` 130,398,712 bytes, SHA256 `21788562488409125a7d37de87cadf9a1d833147fe45126bb19cf588787d05c4`
  - `deb/Spellbook_0.1.0_amd64.deb` 55,965,362 bytes, SHA256 `0f5fb9e8f16dc88ea96a2c9017ce0a9c67ec0820b5d3d0a5caa3fe2657c2fc39`
- Copies of those two files only were also written back to the Windows checkout `target/release/bundle/{appimage,deb}/` (gitignored).

### Install (no repo checkout)

- Copied **only** the AppImage and `.deb` to `/tmp/spellbook-task4-linux/`. Smokes used that folder and `/usr/bin/*`, not the clone and not `/mnt/c/...`.
- `apt-get install -y /tmp/spellbook-task4-linux/Spellbook_0.1.0_amd64.deb` as root. Package name `spellbook` 0.1.0.
- Install paths:
  - `/usr/bin/spellbook-desktop` 76,432,040 bytes (ELF PIE)
  - `/usr/bin/spellbook-sidecar` 31,863,976 bytes (target-triple suffix stripped)
  - `/usr/lib/Spellbook/resources/sqlite-vec/vec0.so` 147,984 bytes
  - Desktop: `/usr/share/applications/Spellbook.desktop` `Exec=spellbook-desktop`
- `SPELLBOOK_SQLITE_VEC_RESOURCE_DIR` was unset/empty. `SPELLBOOK_DATA_DIR` unset.

### App start

- Launched `/usr/bin/spellbook-desktop` with cwd `/tmp/spellbook-task4-linux` (not `pnpm tauri:dev`, not the repo). `DISPLAY=:0` (WSLg). Process stayed alive (PID 612) until the smoke driver terminated it after vault init.
- MESA/EGL warnings (`failed to get driver name`, `ZINK: failed to choose pdev`, software fallback). App still initialized the DB (migrations 0006–0015) and copied/loaded sqlite-vec. This counts as app start plus vault init; GPU-accelerated WebView was not verified.
- AppImage `chmod +x` then launched from `/tmp/spellbook-task4-linux/Spellbook_0.1.0_amd64.AppImage`. Also stayed alive (PID 839), also loaded vec0 after a fresh copy. That AppImage copy's size/hash/RUNPATH is recorded in the AppImage vs deb identity subsection below; the original first-launch vault identity remains the deb 147,984 record.

### WSLg GUI

- Date: 2026-10-30 (same Ubuntu-24.04 WSL2 / WSLg host; installed deb `/usr/bin/spellbook-desktop`). T2-F3 re-drive. OpenSpec 4.2 checkbox was **not** changed.
- Launch: `/usr/bin/spellbook-desktop` as `lvitki`, cwd `/tmp`, `DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`. `SPELLBOOK_SQLITE_VEC_RESOURCE_DIR` unset (no `SPELLBOOK*` env at all). Process PID 394 stayed alive past 20s; stdout still `sqlite-vec: loaded extension path=/home/lvitki/.local/share/SpellbookVault/vec0.so` and migrations version 15.
- MESA/EGL still falling back. Exact stderr from PID 394:

```
(spellbook-desktop:394): Gdk-CRITICAL **: 11:06:23.413: gdk_seat_get_keyboard: assertion 'GDK_IS_SEAT (seat)' failed
libEGL warning: failed to get driver name for fd -1

libEGL warning: MESA-LOADER: failed to retrieve device information

libEGL warning: failed to get driver name for fd -1

MESA: error: ZINK: failed to choose pdev
libEGL warning: egl: failed to create dri2 screen
```

- Linux X11 queries did **not** see a named client (Weston/WSLg does not publish `_NET_CLIENT_LIST`):
  - `wmctrl -l` / `wmctrl -l -x`: `Cannot get client list properties. (_NET_CLIENT_LIST or _WIN_CLIENT_LIST)`. `wmctrl -m` Name=`Weston WM`.
  - `xdotool search --name Spellbook` and `xdotool search --class spellbook-desktop`: empty at 2s–20s.
  - `xwininfo -root -tree`: root `0x438`; children only `0x200027 "Weston WM"` 10x10, unnamed `0x200002` 8192x8192, unnamed `0x200001` 10x10. No Spellbook / WebKit / Tauri name. `xprop` WM_CLASS: none (no client id).
  - `import -window root`: failed (`unable to read X window image 'root': Resource temporarily unavailable`).
- Window **did** exist on the WSLg RAIL path (this is the GUI proof):
  - `/mnt/wslg/weston.log`: `appId: spellbook-desktop`, `appDesc: Spellbook (Ubuntu-24.04)`, `appWindowId: 0x2`, `ClientGetAppidReq: ... appId:spellbook-desktop WindowId:0x2`. Desktop file `StartupWMClass=spellbook-desktop`.
  - Windows `msrdc` PID 18420: `MainWindowTitle=Spellbook (Ubuntu-24.04)`, Win32 class=`RAIL_WINDOW`, hwnd=`0x340980`, visible, 1252x852. In-window title bar: `Spellbook`. Screenshot showed the Spell Library WebView (Library tab, search/filters, “No Spells Yet”, Create Spell / Import Spells).
- Desktop file also launches: `gtk-launch Spellbook` exit 0 (PID 887) and `gio launch /usr/share/applications/Spellbook.desktop` exit 0 (PID 1074); both repeated the same MESA/ZINK stderr and loaded vec0. Not counted as extra GUI proof beyond the first window.
- Bound: 4.2 “app starts” on Linux is now process + vault init **and** a visible Spellbook window under WSLg. GPU-accelerated EGL/ZINK still failed; WebView rendered via the MESA fallback path.

### Sidecar smokes (bundled binary only)

JSON-RPC on stdin of **installed** `/usr/bin/spellbook-sidecar` (and, separately, the AppImage-extracted `squashfs-root/usr/bin/spellbook-sidecar`). Fixtures under `/tmp/spellbook-task4-linux/fixtures/`. Repo `services/ml/spellbook_sidecar.py` and freeze venv were not used to parse. Driver was system Python 3.12.3 for fixture/JSON only.

- **Markdown:** yes. UTF-8 no-BOM `test-spell-nobom.md` front matter `name: Test Spell` / `level: 1`. `result.spells[0].name=Test Spell`, `level=1`, `conflicts=[]`.
- **DOCX:** yes. Minimal OOXML `.docx` → `conflicts=[]`, description contains `Fireball` / `Level: 3` (no `python-docx not installed`).
- **PDF import:** yes. Minimal PDF fixture → `conflicts=[]`, description `Magic Missile Level: 1 A magic dart.` (no `pdfminer.six not installed`).
- **PDF export is HTML:** yes. `method=export` `format=pdf` returned `"format": "html"`, path `spellbook_export_*.html`, note `Print-optimized HTML generated. Use browser 'Print to PDF' for PDF output.` File starts with `<!doctype html>` (1,326 bytes on a repeat export through the same installed sidecar).

AppImage-extracted sidecar repeated the same four checks: all yes.

### sqlite-vec / vec0.so

- Vault did not exist before first launch (`~/.local/share/SpellbookVault` absent).
- Before the installed-deb launch, `vec0.so` was absent. `SPELLBOOK_SQLITE_VEC_RESOURCE_DIR` was **not** set.
- After first `/usr/bin/spellbook-desktop` launch: log `sqlite-vec: loaded extension path=/home/lvitki/.local/share/SpellbookVault/vec0.so`. File size 147,984 bytes, SHA256 `f285c46d5496fe7571be40ab40c0b151d091892c141f89a503e02392e0961233` (matches bundled `/usr/lib/Spellbook/resources/sqlite-vec/vec0.so`).
- Probe used production resource/exe-dir candidates, not an env override. `pool.rs` `resources/sqlite-vec/vec0.so` under `/usr/lib/Spellbook` is the layout that copied.

### AppImage vs deb sqlite-vec / sidecar identity

- Date: 2026-10-30 (same Ubuntu-24.04 WSL2 host; 4.2 artifacts still on disk). Re-hashed; not a rebuild.
- Original first-launch vault record above is unchanged: after the installed-deb launch, vault `vec0.so` was 147,984 bytes, SHA256 `f285c46d5496fe7571be40ab40c0b151d091892c141f89a503e02392e0961233`, matching bundled `/usr/lib/Spellbook/resources/sqlite-vec/vec0.so`. That deb copy has **no** ELF RUNPATH/RPATH. Re-confirmed on disk 2026-10-30: installed `vec0.so` still 147,984 / `f285c46d5496fe7571be40ab40c0b151d091892c141f89a503e02392e0961233`, no RUNPATH.
- AppImage squashfs (extracted from `/home/lvitki/spellbook-task2-build/target/release/bundle/appimage/Spellbook_0.1.0_amd64.AppImage`; AppImage SHA256 still `21788562488409125a7d37de87cadf9a1d833147fe45126bb19cf588787d05c4`, matching the Windows checkout copy under `target/release/bundle/appimage/`):
  - `squashfs-root/usr/lib/Spellbook/resources/sqlite-vec/vec0.so` 155,168 bytes, SHA256 `f7c0d27d555e528a16301c26844959f326225827ffafc6d682e88e47e69f2ea4`, ELF RUNPATH `$ORIGIN`. Same size/hash/RUNPATH on the leftover linuxdeploy `Spellbook.AppDir` copy. **Not** the same bytes as the deb `vec0.so`.
- Live vault `/home/lvitki/.local/share/SpellbookVault/vec0.so` currently holds the AppImage copy: 155,168 bytes, SHA256 `f7c0d27d555e528a16301c26844959f326225827ffafc6d682e88e47e69f2ea4`, RUNPATH `$ORIGIN`. `pool.rs` `install_sqlite_vec_if_needed` returns early when dest exists (`if destination.exists() { return Ok(Some(destination)); }`) and does **not** overwrite. This is first-copy-wins after dest was removed, then AppImage launched. It is **not** an in-place overwrite of the 147,984 deb copy; `pool.rs` was not changed.
- Sidecar (confirmed on disk 2026-10-30):
  - deb / installed `/usr/bin/spellbook-sidecar` 31,863,976 bytes, SHA256 `dffff91c83c2f380ad8bac9e2f9fefccfb345c84e74e04c8b7d22d64ba2624a1` (matches the freeze log 31,863,976-byte linux sidecar)
  - AppImage squashfs `usr/bin/spellbook-sidecar` 31,868,072 bytes, SHA256 `a883177d057c2f9e97cb0e2de588d513610e770eef3f4a2ca89e76eaa5fa7efd`

### OpenSpec 4.2

Flipped to `[x]`. Bar met: app start (process alive + vault init) yes, markdown import yes, PDF export HTML yes, vec0.so present after unmodified first launch, and DOCX/PDF import also yes after the freeze fix. 4.3 (model exclusion) was not flipped.

### Post-e4bdf65 AppImage rebuild (T2-F1 close)

- Date: 2026-11-02 (same Ubuntu-24.04 WSL2 / WSLg host, user `lvitki`). OpenSpec 4.2 checkbox was **not** changed.
- Build context: WSL clone `/home/lvitki/spellbook-task2-build` is still at `910f717` plus the `e4bdf65` build changes as uncommitted files. `scripts/patchelf-skip-sqlite-vec`, `scripts/tauri_build_linux.sh`, and `apps/desktop/package.json` (`"tauri:build:linux": "bash ../../scripts/tauri_build_linux.sh"`) are byte-identical to `e4bdf65` (SHA256 match against `git show e4bdf65:<path>`). Only the AppImage was rebuilt through the wrapper. The `.deb` was **not** rebuilt; it never went through linuxdeploy/patchelf.
- Artifacts under the clone's `target/release/bundle/`:
  - `appimage/Spellbook_0.1.0_amd64.AppImage` 130,370,040 bytes, SHA256 `9cc1acf64f2798f9ec4d7737d824693450a591533a3ca4f7a74b222a9cb688f9`, mtime `2026-10-30 17:33:30 -0500`
  - `deb/Spellbook_0.1.0_amd64.deb` 55,965,362 bytes, SHA256 `0f5fb9e8f16dc88ea96a2c9017ce0a9c67ec0820b5d3d0a5caa3fe2657c2fc39`, mtime `2026-10-30 10:26:04 -0500` (same deb as the Installer build subsection)

`vec0.so` identity (re-hashed 2026-11-02; RUNPATH from `readelf -d`):

| Copy | Path | Size (bytes) | SHA256 | RUNPATH |
| ---- | ---- | ------------ | ------ | ------- |
| Staged | `apps/desktop/src-tauri/resources/sqlite-vec/vec0.so` (WSL clone) | 147,984 | `f285c46d5496fe7571be40ab40c0b151d091892c141f89a503e02392e0961233` | none |
| deb payload | `usr/lib/Spellbook/resources/sqlite-vec/vec0.so` (`dpkg-deb -x`) | 147,984 | `f285c46d5496fe7571be40ab40c0b151d091892c141f89a503e02392e0961233` | none |
| AppImage squashfs | `usr/lib/Spellbook/resources/sqlite-vec/vec0.so` (`--appimage-extract`) | 147,984 | `f285c46d5496fe7571be40ab40c0b151d091892c141f89a503e02392e0961233` | none |
| Installed deb | `/usr/lib/Spellbook/resources/sqlite-vec/vec0.so` (package `spellbook` 0.1.0) | 147,984 | `f285c46d5496fe7571be40ab40c0b151d091892c141f89a503e02392e0961233` | none |
| New vault | `~/.local/share/SpellbookVault/vec0.so` (after AppImage launch below) | 147,984 | `f285c46d5496fe7571be40ab40c0b151d091892c141f89a503e02392e0961233` | none |
| Old vault (backup) | `~/.local/share/SpellbookVault/vec0.so.pre-e4bdf65.bak` | 155,168 | `f7c0d27d555e528a16301c26844959f326225827ffafc6d682e88e47e69f2ea4` | `$ORIGIN` |

Vault refresh:

- Before: vault `vec0.so` was still the old AppImage copy (155,168 / `f7c0d27d…` / RUNPATH `$ORIGIN`). `install_sqlite_vec_if_needed` keeps an existing vault copy, so a rebuilt AppImage alone would not replace it.
- Moved it to `~/.local/share/SpellbookVault/vec0.so.pre-e4bdf65.bak` (`mv`, not deleted). Confirmed `vec0.so` absent before launch. `spellbook.sqlite3` was left in place.

Launch (one run):

- Copied only the AppImage to `/tmp/spellbook-t2f1b/` (outside any checkout), `chmod +x`, cwd `/tmp/spellbook-t2f1b`. FUSE mount (libfuse2 present; not `--appimage-extract-and-run`), mounted at `/tmp/.mount_SpellbAMpiiO`.
- Command:

```
setsid env -u SPELLBOOK_SQLITE_VEC_RESOURCE_DIR -u SPELLBOOK_DATA_DIR \
  DISPLAY=:0 WAYLAND_DISPLAY=wayland-0 RUST_LOG=info \
  ./Spellbook_0.1.0_amd64.AppImage
```

- Shell had no `SPELLBOOK*` env before the launch. Process group 410 (`spellbook-desktop`, `WebKitNetworkProcess`, `WebKitWebProcess`) was alive at 4s. Terminated with `SIGTERM` to the process group; it exited within 1s and the FUSE mount went away.
- sqlite-vec load evidence (app tracing output captured from stdout/stderr, ANSI colour codes stripped; seen 2s after launch; vault `vec0.so` mtime `2026-11-02 08:53:39 -0600`):

```
2026-11-02T14:53:39.221497Z  INFO spellbook_desktop::db::pool: sqlite-vec: loaded extension path=/home/lvitki/.local/share/SpellbookVault/vec0.so
2026-11-02T14:53:39.222673Z  INFO spellbook_desktop::db::migrations: DB migration start version=15
2026-11-02T14:53:39.222684Z  INFO spellbook_desktop::db::migrations: DB migration complete version=15
```

- The `loaded extension` line repeated once per pooled connection (10 lines). No `failed to load extension` line. stderr head had only `libEGL warning: DRI3 error: Could not get DRI3 device` / `Ensure your X server supports DRI3`.

Sidecar identity (informational):

- deb payload `usr/bin/spellbook-sidecar`, installed `/usr/bin/spellbook-sidecar`, and staged `binaries/spellbook-sidecar-x86_64-unknown-linux-gnu`: 31,863,976 bytes, SHA256 `dffff91c83c2f380ad8bac9e2f9fefccfb345c84e74e04c8b7d22d64ba2624a1`, no RUNPATH.
- Rebuilt AppImage squashfs `usr/bin/spellbook-sidecar`: 31,872,168 bytes, SHA256 `dec4ba4c96186f9da1a04dc299482df511ada46cb3723e238f91e7c23ecbd655`, RUNPATH `$ORIGIN/../lib`. linuxdeploy still patches the sidecar (the wrapper skips only `vec0.so`). This rebuilt AppImage sidecar was not re-smoked for import/export here.

The earlier 155,168-byte AppImage `vec0.so` (`f7c0d27d…`, RUNPATH `$ORIGIN`) and the 31,868,072-byte AppImage sidecar (`a883177d…`) are historical. They came from the `910f717` AppImage build (SHA256 `21788562…`).

### Post-e4bdf65 AppImage sidecar re-smoke

- Date: 2026-11-02 (same Ubuntu-24.04 WSL2 host, user `lvitki`). T2-F4. OpenSpec 4.2 checkbox was **not** changed. Packaging code was not changed. Evidence is under `/home/lvitki/spellbook-t2f4/` (`extract.log`, `smoke.log`, `fixtures/`, `rpc/<variant>/NN-*.{request,response}.json` + `.stderr.txt`, `export/<variant>/`).
- AppImage: copied `/home/lvitki/spellbook-task2-build/target/release/bundle/appimage/Spellbook_0.1.0_amd64.AppImage` to `/home/lvitki/spellbook-t2f4/`. Size 130,370,040 bytes. SHA256 of the source and the copy: `9cc1acf64f2798f9ec4d7737d824693450a591533a3ca4f7a74b222a9cb688f9`. Ran `--appimage-extract` there.
- Extracted `squashfs-root/usr/bin/spellbook-sidecar`: 31,872,168 bytes, SHA256 `dec4ba4c96186f9da1a04dc299482df511ada46cb3723e238f91e7c23ecbd655`, ELF RUNPATH `$ORIGIN/../lib` (`readelf -d`). NEEDED: `libdl.so.2`, `libz.so.1`, `libpthread.so.0`, `libc.so.6`.
- `ldd`: all four NEEDED libs resolve from the system `/lib/x86_64-linux-gnu/` (plus `/lib64/ld-linux-x86-64.so.2`). **None** resolve from `squashfs-root/usr/lib`. linuxdeploy did not bundle `libz`/`libdl`/`libpthread`/`libc` there, so the `$ORIGIN/../lib` RUNPATH has no effect on this binary today. (This is the PyInstaller bootloader only. Its Python runtime libs come from its own embedded archive, not from `usr/lib`.)
- Fixtures (system `/usr/bin/python3` 3.12.3 for fixtures/JSON only; no repo venv, no pip): `test-spell-nobom.md` (52 bytes, starts `---\n`, no BOM, `name: Test Spell` / `level: 1`), `fireball.docx` (926 bytes, `zipfile` OOXML, paragraphs `Fireball` / `Level: 3`), `magic-missile.pdf` (611 bytes, hand-written PDF-1.4, text `Magic Missile Level: 1 A magic dart.`).
- Run: one sidecar process per request, request on stdin, cwd `/home/lvitki/spellbook-t2f4/run-cwd` (`git rev-parse` there: `fatal: not a git repository`). No `SPELLBOOK*` env. Two env variants:
  - `direct`: inherited shell env minus `SPELLBOOK*`.
  - `appimage-env`: same, plus the env a sidecar child of `spellbook-desktop` inherits under the AppImage: runtime `APPIMAGE` / `APPDIR` (`squashfs-root`) / `OWD` / `ARGV0`, and the `apprun-hooks/linuxdeploy-plugin-gtk.sh` exports (`GTK_*`, `GDK_BACKEND=x11`, `XDG_DATA_DIRS`, `GSETTINGS_SCHEMA_DIR`, `GDK_PIXBUF_MODULE_FILE`, `GIO_EXTRA_MODULES`). The hook does not set `LD_LIBRARY_PATH`.
- Request shapes are the same as in the Sidecar smokes subsection: `method=import` `params.files=[<path>]`, `method=export` `params={spells:[{name:"Arcane Bolt",description:"Zap."}], format:"pdf", output_dir}`.

Results (both variants returned the same values, rc 0 every time):

- **Markdown:** yes. `result.spells[0].name=Test Spell`, `level=1`, `result.conflicts=[]`, description `Description here.`
- **DOCX:** yes. `name=Fireball`, `level=3`, `conflicts=[]`, description `Fireball\n\nLevel: 3` (no `python-docx not installed`).
- **PDF import:** yes. `name=Magic-Missile` (from the filename), `level=1`, `conflicts=[]`, description `Magic Missile Level: 1 A magic dart.` (no `pdfminer.six not installed`).
- **PDF export is HTML:** yes. Response `{"path": ".../export/<variant>/spellbook_export_<hex>.html", "format": "html", "note": "Print-optimized HTML generated. Use browser 'Print to PDF' for PDF output."}`. File is 1,326 bytes and starts with `<!doctype html>` in both variants.
- stderr for the import calls had only `spellbook_sidecar.py:25: DeprecationWarning: datetime.datetime.utcnow() is deprecated ...`. Export stderr was empty.

This subsection replaces the `910f717` AppImage sidecar evidence (31,868,072 / `a883177d…`) for the current AppImage artifact (`9cc1acf6…`). The deb / installed `/usr/bin/spellbook-sidecar` evidence (31,863,976 / `dffff91c…`) is unchanged and was not re-run. Bound: the sidecar was run from the extracted `squashfs-root` with the AppImage env reproduced. It was not spawned by `spellbook-desktop` from the FUSE mount, so the GUI import/export path was not driven.
