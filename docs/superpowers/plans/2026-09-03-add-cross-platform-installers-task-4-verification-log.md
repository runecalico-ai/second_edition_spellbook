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

## Models excluded

- Date: 2026-11-02
- Installer/payload grep for GGUF/ONNX: clean (both platforms)
  - Windows install dir `C:\Users\vitki\AppData\Local\Spellbook` recursive filename scan for `tinyllama|\.gguf|all-MiniLM|model\.onnx|SpellbookVault`: empty. Program Files / Program Files (x86) Spellbook dirs absent.
  - Windows NSIS used for Task 1 smoke (`%TEMP%\spellbook-task4-nsis-iter2\Spellbook_0.1.0_x64-setup.exe`, SHA256 `9D729C3AE278058D67B36C456B87E396DE348C6AFB455CAAF55EF98D80B5ACFC`, 39,396,346 bytes): `findstr /I /C` for `tinyllama`, `TinyLlama`, `.gguf`, `Q4_K_M`, `all-MiniLM`, `model.onnx`, `SpellbookVault` all MISS; ASCII binary scan for the same markers empty; `7z l` listing shows only `$PLUGINSDIR\*`, `spellbook-desktop.exe`, `spellbook-sidecar.exe`, `resources\sqlite-vec\.gitkeep`, `resources\sqlite-vec\vec0.dll` (no models).
  - Linux deb `/home/lvitki/spellbook-task2-build/target/release/bundle/deb/Spellbook_0.1.0_amd64.deb` (SHA256 `0f5fb9e8f16dc88ea96a2c9017ce0a9c67ec0820b5d3d0a5caa3fe2657c2fc39`): `dpkg-deb -c | grep -Ei 'tinyllama|\.gguf|minilm|model\.onnx|SpellbookVault/models'` empty.
  - Linux AppImage `/home/lvitki/spellbook-task2-build/target/release/bundle/appimage/Spellbook_0.1.0_amd64.AppImage` (SHA256 `9cc1acf64f2798f9ec4d7737d824693450a591533a3ca4f7a74b222a9cb688f9`): `--appimage-extract` then `find` for the same patterns empty (path and filename).
  - Installed Linux `/usr/lib/Spellbook` and `/usr/bin/spellbook-*`: same pattern empty; tree under `/usr/lib/Spellbook` is only `resources/sqlite-vec`.
- Post-install provisioning succeeded: yes (both platforms; TinyLlama + MiniLM five-file set)
- Where models landed (paths):
  - Windows runtime vault (`dirs::data_dir()` -> `%APPDATA%\SpellbookVault`): `%APPDATA%\SpellbookVault\models\tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` (668788096 bytes) and `%APPDATA%\SpellbookVault\models\embeddings\all-MiniLM-L6-v2\` (`model.onnx`, `tokenizer.json`, `config.json`, `special_tokens_map.json`, `tokenizer_config.json`). Also mirrored under `%LOCALAPPDATA%\SpellbookVault\models\` per the Task 3 brief; install dir `%LOCALAPPDATA%\Spellbook` remained free of model files.
  - Linux: `~/.local/share/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` and `~/.local/share/SpellbookVault/models/embeddings/all-MiniLM-L6-v2/` (same five files). `/usr/lib/Spellbook` remained free of model files.
- Notes:
  - Method: verified side-load. Downloaded official HuggingFace URLs from `docs/DEVELOPMENT.md` into `%TEMP%\spellbook-task3-models\` (`curl -L`), verified sizes + SHA-256 against DEVELOPMENT.md / `provisioning.rs`, then copied into the user vault destinations (same gates as `llm_import_model_file` / `embeddings_import_model_file`). Tauri IPC / in-app download UI was not driven (no WebView automation for the installed binary).
  - Hashes verified before accept: TinyLlama SHA-256 `9FECC3B3CD76BBA89D504F29B616EEDF7DA85B96540E490CA5824D3F7D2776A0` (size 668788096); MiniLM `model.onnx` `bbd7b466f6d58e646fdc2bd5fd67b2f5e93c0b687011bd4548c420f7bd46f0c5` (90387630) plus the four sidecar JSON files matching DEVELOPMENT.md.
  - `SPELLBOOK_SQLITE_VEC_RESOURCE_DIR` was not used. OpenSpec 4.4 (chat / semantic search) not claimed here.
  - **Correction (T3-F1, 2026-11-02):** the `01b9ebe` copies were checked by hand (curl, size + SHA-256 compare, file copy). They did **not** run the app's `llm_import_model_file` / `embeddings_import_model_file` gates, and no `llm_status` / `embeddings_status` was observed. The phrase "same gates as" above overstates that. The `%LOCALAPPDATA%\SpellbookVault\models\` mirror was never read by the app (`dirs::data_dir()` is Roaming on Windows) and was removed in T3-F1. The in-app proof is in the next subsection.
  - All five MiniLM files (sizes / SHA-256, all matched in `01b9ebe` and again in T3-F1):
    - `model.onnx` 90387630 `bbd7b466f6d58e646fdc2bd5fd67b2f5e93c0b687011bd4548c420f7bd46f0c5`
    - `tokenizer.json` 711661 `da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0`
    - `config.json` 650 `1b4d8e2a3988377ed8b519a31d8d31025a25f1c5f8606998e8014111438efcd7`
    - `special_tokens_map.json` 695 `5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a`
    - `tokenizer_config.json` 1433 `bd2e06a5b20fd1b13ca988bedc8763d332d242381b4fbc98f8fead4524158f79`

### In-app provisioning (installed Windows build)

- Date: 2026-11-02 (T3-F1). Installed NSIS build `C:\Users\vitki\AppData\Local\Spellbook\spellbook-desktop.exe` (60,417,024 bytes, SHA-256 `8E8089855AAC83A6E064E354E4E8BEBCBD36599F114CBEACC564BBDC21D33BA4`, release, default `llm` feature). No repo checkout, no `pnpm tauri:dev`.
- **Staging (outside the vault):** hashed both vault copies first (all six files matched DEVELOPMENT.md in both). Moved `%APPDATA%\SpellbookVault\models` to `C:\Users\vitki\spellbook-t3f1-src\models`. Deleted the unused `%LOCALAPPDATA%\SpellbookVault\models` mirror (that folder was the only child; `%LOCALAPPDATA%\SpellbookVault` is now empty). No other LOCALAPPDATA files touched.
- **Launch:** `Start-Process` of the installed exe, working dir = install dir, from a child `pwsh` that set `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` for that process only. `SPELLBOOK_SQLITE_VEC_RESOURCE_DIR` and `SPELLBOOK_DATA_DIR` were removed from the process env and are unset at User and Machine scope.
- **IPC driver:** untracked Node 24 script `scripts/_t3f1_cdp.mjs`. It reads `http://127.0.0.1:9222/json`, picks the single `page` target (`http://tauri.localhost/`, title `Spellbook`), opens its `webSocketDebuggerUrl`, and runs `Runtime.evaluate` (`awaitPromise: true`, `returnByValue: true`) on `window.__TAURI_INTERNALS__.invoke(cmd, args)`. Probe first: `typeof __TAURI_INTERNALS__ === "object"`, `typeof invoke === "function"`. No UI, no file picker.

#### Attempt 1: embeddings rejected by the pre-existing vault DB

- `llm_status` before: `{"status":"notProvisioned","modelPath":"C:\\Users\\vitki\\AppData\\Roaming\\SpellbookVault\\models\\tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf","bytesDownloaded":null,"totalBytes":null,"lastError":null}`. `embeddings_status` before: `{"state":"notProvisioned","downloadProgress":null,"errorMessage":null}`.
- `llm_import_model_file {filePath: "C:\\Users\\vitki\\spellbook-t3f1-src\\models\\tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"}`: ok in 2,134 ms. `llm_status` after: `"status":"ready"`.
- `embeddings_import_model_file {filePath: "C:\\Users\\vitki\\spellbook-t3f1-src\\models\\embeddings\\all-MiniLM-L6-v2"}`: **rejected** in 186 ms with `"Search error: semantic search requires sqlite-vec; spell_vec is blob-backed in this database"`. `embeddings_status` stayed `notProvisioned`.
- Cause: the vault `spellbook.sqlite3` was created 2026-07-12, before `vec0.dll` first reached the vault (2026-09-13). Migration v1 then fell back to `CREATE TABLE spell_vec(rowid INTEGER PRIMARY KEY, v BLOB)`. Later launches never upgrade that table, even with `vec0.dll` present (vault copy hash `74E63AB7…DBD7531` = installed `resources\sqlite-vec\vec0.dll`). The DB had 0 spells and 0 `spell_vec` rows. A clean install does not hit this.
- Side effect: before the sqlite-vec check failed, the import had already validated the bundle and promoted it to `%APPDATA%\SpellbookVault\models\embeddings\all-MiniLM-L6-v2\`. So the files were on disk but status was `notProvisioned`.
- Reset: closed the app (`CloseMainWindow`, exited). Moved the old DB to `C:\Users\vitki\spellbook-t3f1-src\vault-db-backup\spellbook.sqlite3` (208,896 bytes, kept). Deleted the attempt-1 `models\` dir written by the app. `imports\`, `spells\`, `vec0.dll` left in place.

#### Attempt 2: fresh vault DB (counted)

- Relaunched the same way. The app created a new DB with `CREATE VIRTUAL TABLE spell_vec USING vec0(rowid INTEGER PRIMARY KEY, v float[384])`.
- Before:
  - `llm_status`: `{"status":"notProvisioned","modelPath":"C:\\Users\\vitki\\AppData\\Roaming\\SpellbookVault\\models\\tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf","bytesDownloaded":null,"totalBytes":null,"lastError":null}`
  - `embeddings_status`: `{"state":"notProvisioned","downloadProgress":null,"errorMessage":null}`
- `llm_import_model_file {filePath: "C:\\Users\\vitki\\spellbook-t3f1-src\\models\\tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"}`: `{"ok":true,"value":null}` in **2,170 ms**.
- `embeddings_import_model_file {filePath: "C:\\Users\\vitki\\spellbook-t3f1-src\\models\\embeddings\\all-MiniLM-L6-v2"}` (the bundle **directory**; the Rust gate requires exactly the five files flat inside it, each size + SHA-256 checked, closed set): `{"ok":true,"value":null}` in **2,493 ms**.
- After:
  - `llm_status`: `{"status":"ready","modelPath":"C:\\Users\\vitki\\AppData\\Roaming\\SpellbookVault\\models\\tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf","bytesDownloaded":null,"totalBytes":null,"lastError":null}`
  - `embeddings_status`: `{"state":"ready","downloadProgress":null,"errorMessage":null}`
- Vault files written by the app (`%APPDATA%\SpellbookVault\models\`), all six match DEVELOPMENT.md:
  - `tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` 668788096 `9FECC3B3CD76BBA89D504F29B616EEDF7DA85B96540E490CA5824D3F7D2776A0`
  - `embeddings\all-MiniLM-L6-v2\model.onnx` 90387630 `BBD7B466F6D58E646FDC2BD5FD67B2F5E93C0B687011BD4548C420F7BD46F0C5`
  - `embeddings\all-MiniLM-L6-v2\tokenizer.json` 711661 `DA0E79933B9ED51798A3AE27893D3C5FA4A201126CEF75586296DF9B4D2C62A0`
  - `embeddings\all-MiniLM-L6-v2\config.json` 650 `1B4D8E2A3988377ED8B519A31D8D31025A25F1C5F8606998E8014111438EFCD7`
  - `embeddings\all-MiniLM-L6-v2\special_tokens_map.json` 695 `5D5B662E421EA9FAC075174BB0688EE0D9431699900B90662ACD44B2A350503A`
  - `embeddings\all-MiniLM-L6-v2\tokenizer_config.json` 1433 `BD2E06A5B20FD1B13CA988BEDC8763D332D242381B4FBC98F8FEAD4524158F79`
- Install dir after import: recursive filename scan for `tinyllama|\.gguf|all-MiniLM|model\.onnx|SpellbookVault` is empty. Full file list is `spellbook-desktop.exe`, `spellbook-sidecar.exe`, `uninstall.exe`, `resources\sqlite-vec\.gitkeep`, `resources\sqlite-vec\vec0.dll`.
- **Negative imports (same session, after the good imports):**
  - 1 KB file named `tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`: `"Validation error: Selected file size does not match the approved TinyLlama asset"` (4 ms).
  - Correct name and size (668,788,096 zero bytes): `"Validation error: Selected file SHA-256 does not match the approved TinyLlama asset"` (451 ms).
  - Wrong name `bogus.gguf`: `"Validation error: Selected file is not the approved TinyLlama file"` (3 ms).
  - `embeddings_import_model_file` on an empty dir: `"Validation error: Missing required embedding bundle file: embeddings/all-MiniLM-L6-v2/model.onnx"` (2 ms).
  - After these: `llm_status` still `ready`, `embeddings_status` still `ready`. Vault hashes unchanged (same six values, same timestamps).
- **Concern: embeddings load is not offline and does not read the verified bundle.** `load_embedding_model_blocking` calls `fastembed::TextEmbedding::try_new(InitOptions::new(AllMiniLML6V2))` with `cache_dir = models/`. During the 2,493 ms import, fastembed wrote a HuggingFace hub cache `models\models--Qdrant--all-MiniLM-L6-v2-onnx\` (`refs/main` = `d13954661f83248295ba75c1ed411eef3b7b936e`, not the approved revision `5f1b8cd7…`). Its `tokenizer.json` (711,649 bytes, `851CA671…`) and `tokenizer_config.json` (1,412 bytes, `ABDA01C8…`) differ from the approved files. Its `model.onnx`, `config.json`, and `special_tokens_map.json` hashes match. There was no other HF cache on the profile, so these bytes came from the network. `embeddings_status=ready` therefore reflects a network fetch of the hub `main` revision, not the side-loaded bundle. This is a product issue (no product code changed here). It matters for the offline claim in DEVELOPMENT.md and for 4.4 semantic search.
- Close: `CloseMainWindow` and the process exited within 20 s. No leftover `spellbook-desktop` / `spellbook-sidecar` and nothing listening on 9222.
- Cleanup: the vault copies verified, so the staged `C:\Users\vitki\spellbook-t3f1-src\models` and the bogus inputs were deleted. Kept `C:\Users\vitki\spellbook-t3f1-src\vault-db-backup\spellbook.sqlite3`. Raw JSON evidence is in `%TEMP%\spellbook-t3f1\` (not committed).

#### Linux

- Not driven in-app. WebKitGTK has no CDP endpoint equivalent to WebView2's `--remote-debugging-port`, and the release build has no devtools.
- Linux evidence is still the hand-verified copy: `~/.local/share/SpellbookVault/models/` has the same six files with the same SHA-256 values (re-hashed 2026-11-02). There is no `models--Qdrant--…` hub cache there, so the installed Linux app has not yet loaded embeddings from that vault. `/usr/lib/Spellbook` still contains only `resources/`.
- The Windows run above is the proof that the in-app import path works on an installed build.

### Offline embeddings load from verified bundle (installed build at 18fd267)

- Date: 2026-11-02 (T3-F2). Host Windows 11 (win32 10.0.26200), `IsAdmin=False`. Branch `add-cross-platform-installers` at `18fd267` (commit time `2026-11-02T12:36:51-06:00`). Product tree clean. OpenSpec checkboxes were not changed.
- This subsection **supersedes** the embeddings result in "In-app provisioning (installed Windows build)" above. There (`b46fb29`, installed exe `8E808985…`, pre-fix loader) `embeddings_status=ready` came from a hub download of `Qdrant/all-MiniLM-L6-v2-onnx` `main` (`d13954661f…`), not from the verified bundle.

#### Build

- `.\scripts\build_windows_installer.ps1 -SkipInstall` (exit 0). The PS1 ran `scripts\prepare_release_bundle.py` itself with repo `.venv` Python 3.14.4. `CARGO_TARGET_DIR=C:\WINDOWS\TEMP\cursor-sandbox-cache\b3f4b69d6bfd3f2a7a346bc89af6973c\cargo-target` (empty release cache; full compile, `release` profile 6m34s). The PS1 reported that NSIS path. Repo-root `target\` has no `*-setup.exe`.
- Harness note: a first PS1 run with `*>&1` aborted inside `prepare_release_bundle.py` (PyInstaller INFO on stderr became an error record under the PS1's `ErrorActionPreference=Stop`). `prepare_release_bundle.py` alone then exited 0. The counted build is the rerun without the redirect.
- `apps/desktop/src-tauri/Cargo.lock` has no `hf-hub` package.
- NSIS: `C:\WINDOWS\TEMP\cursor-sandbox-cache\b3f4b69d6bfd3f2a7a346bc89af6973c\cargo-target\release\bundle\nsis\Spellbook_0.1.0_x64-setup.exe`, 38,855,332 bytes, SHA-256 `4E117300419850D5A6D6245DEF558E8D3068FF205D0309FD6ABD8E5D86CDD195`, LastWriteTime `2026-11-02T12:48:37-06:00` (after the `18fd267` commit time). Only that file was copied to `%TEMP%\spellbook-t3f2-nsis\` (same hash) and run from there.
- Built `release\spellbook-desktop.exe` 58,167,808 bytes, SHA-256 `DC98913FAC13C131D4AFB673545354D5A4D386994A6F39B5C64AED159FD775DC`. Frozen sidecar `binaries\spellbook-sidecar-x86_64-pc-windows-msvc.exe` 25,791,496 bytes, SHA-256 `DCE339C9DEA55F698EA2E8A83B767FEEB60D79A227DF115686EAC5ADE69F605D`.

#### Install

- No `spellbook-desktop` / `spellbook-sidecar` process was running. `Spellbook_0.1.0_x64-setup.exe /S` over the existing current-user install, exit 0. HKCU `DisplayName=Spellbook`, `DisplayVersion=0.1.0`, `InstallLocation="C:\Users\vitki\AppData\Local\Spellbook"`.
- Before: `spellbook-desktop.exe` 60,417,024 / `8E8089855AAC83A6E064E354E4E8BEBCBD36599F114CBEACC564BBDC21D33BA4` (iter2 build).
- After:
  - `spellbook-desktop.exe` 58,167,808, SHA-256 `DC98913FAC13C131D4AFB673545354D5A4D386994A6F39B5C64AED159FD775DC` (same as the built exe), mtime `2026-11-02T12:48:04-06:00`
  - `spellbook-sidecar.exe` 25,791,496, SHA-256 `DCE339C9DEA55F698EA2E8A83B767FEEB60D79A227DF115686EAC5ADE69F605D`
  - `resources\sqlite-vec\vec0.dll` 278,016, SHA-256 `74E63AB75299804773676A5C757372472E797E03E02A2D8FF5FD91730DBD7531` (unchanged)
  - `uninstall.exe`, `resources\sqlite-vec\.gitkeep`. No other files.

#### Vault prep (`%APPDATA%\SpellbookVault`)

- Re-hashed the six model files first. All six matched DEVELOPMENT.md (values in "Attempt 2" above).
- Removed `models\models--Qdrant--all-MiniLM-L6-v2-onnx\` (written 12:17 today by the pre-fix build during T3-F1): 20 entries: 5 `blobs\<sha>` files + 5 `blobs\<sha>.lock`, `refs\main`, `snapshots\d13954661f83248295ba75c1ed411eef3b7b936e\` with 5 entries, and the 3 dirs. `models\.locks` did not exist.
- No other HF/fastembed cache on the profile: `%USERPROFILE%\.cache\huggingface` absent. `HF_HOME`, `HF_HUB_CACHE`, `HF_HUB_OFFLINE`, `FASTEMBED_CACHE_PATH` unset. `%LOCALAPPDATA%\SpellbookVault` is empty.
- After cleanup `models\` held only `tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` and `embeddings\all-MiniLM-L6-v2\` (five files). File mtimes `2026-11-02 09:08`, from the T3-F1 import.
- DB: the fresh T3-F1 `spellbook.sqlite3` (not the blob-backed backup). `user_version=15`, `spell_vec` SQL `CREATE VIRTUAL TABLE spell_vec USING vec0(rowid INTEGER PRIMARY KEY, v float[384])`, 0 spells.

#### Offline simulation

- Launch: `Start-Process` of the installed exe, working dir = install dir, from a child `pwsh` (untracked `scripts/_t3f2_launch.ps1`). For that process only: `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY` = `http://127.0.0.1:9`, `NO_PROXY=127.0.0.1,localhost`, `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, `RUST_LOG=info`. No `SPELLBOOK*` variables at process, User, or Machine scope. App stdout/stderr were redirected to files.
- Host is not elevated, so no per-program firewall rule. The proxy blackhole is the offline simulation.
- Also sampled `Get-NetTCPConnection` / `Get-NetUDPEndpoint` for the `spellbook-desktop` and `spellbook-sidecar` PIDs (untracked `scripts/_t3f2_netwatch.ps1`, 250 ms sleep between samples). These two processes owned **zero** TCP connections and zero UDP endpoints: 122 samples in the first ready run, 87 in negative A, 48 in the restore run. Negative B got only 1 sample (a slow per-sample process lookup, fixed before the restore run), so it is not counted.
- Control (restore run): the same sampler saw the WebView2 browser process (child of the app, PID 9444) listening on `127.0.0.1:9222`. That proves the sampler can see sockets.
- Bound: the host was **not** fully offline. The WebView2 browser process had two established TCP connections to `[2603:1063:2001:b18::365:ff1]:443` (Microsoft). WebView2 does not use the `HTTP_PROXY` environment variables. Embeddings load in-process in `spellbook-desktop.exe`, not in WebView2. The sampler can miss a connection shorter than one sample interval. The proxy blackhole and the missing hub-cache directory cover that gap.

#### Ready run (installed exe, verified bundle, no hub cache)

- PID 21920, started `12:50:07`. IPC through WebView2 CDP (`scripts/_t3f1_cdp.mjs`, untracked) on `window.__TAURI_INTERNALS__.invoke`. No import command was called. `embeddings_status=ready` on a cold start therefore comes from the startup path. That path is `initialize_embeddings_after_startup` → approved bundle check → `finalize_embedding_provision` → `load_embedding_model_blocking` → `Ready`.
- First call (`12:51:08`; my CDP wait loop overshot to 61 s):
  - `embeddings_status`: `{"state":"ready","downloadProgress":null,"errorMessage":null}`
  - `llm_status`: `{"status":"ready","modelPath":"C:\\Users\\vitki\\AppData\\Roaming\\SpellbookVault\\models\\tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf","bytesDownloaded":null,"totalBytes":null,"lastError":null}`
  - The poll returned `ready` on the first read. `initializing` was not observed.
- Commands that need the loaded model:
  - `search_spells_semantic {query:"a bolt of magical force that never misses", limit:5}` with 0 spells: `{"ok":true,"value":[]}` in 8 ms.
  - `reindex_embeddings {force:true}` with 0 spells: `{"total":0,"indexed":0,"skipped":0,"failed":0}`.
  - Ranked check: `create_spell` for two temp spells, `T3F2 Magic Missile` (id 1, "A glowing dart of magical force…") and `T3F2 Light` (id 2, "…a luminous glow…"). Then `reindex_embeddings {force:true}` returned `{"total":2,"indexed":2,"skipped":0,"failed":0}`. The same `search_spells_semantic` query returned `[{"id":1,"name":"T3F2 Magic Missile",…,"cosineDistance":0.5045549},{"id":2,"name":"T3F2 Light",…,"cosineDistance":0.7471289}]` (create + reindex + search in 1,617 ms). Then `delete_spell` for both, and `reindex_embeddings {force:true}` returned `{"total":0,…}`. DB spell count is back to 0.
  - After: `embeddings_status` and `llm_status` still `ready`.
- App stdout had only the 10 `sqlite-vec: loaded extension path=C:\Users\vitki\AppData\Roaming\SpellbookVault\vec0.dll` lines. No WARN/ERROR lines. stderr was empty.
- Not a 4.4 claim. This only shows that the installed loader embeds from the vault bundle.

#### No hub cache created

- After the ready run, the negative runs, and the restore run: no `models--*` and no `.locks` anywhere under `%APPDATA%\SpellbookVault` (recursive dir scan for `models--|\.locks|fastembed`: empty).
- `models\` contents stayed exactly the six approved files. Sizes, SHA-256 values, and mtimes were unchanged, and all six matched after the ready and restore runs.
- Install dir: recursive scan for `tinyllama|\.gguf|all-MiniLM|model\.onnx|SpellbookVault|models--` was empty. File list is still the five installed files.

#### Negative offline check

- **A. Missing file:** moved `embeddings\all-MiniLM-L6-v2\tokenizer.json` to `%TEMP%\spellbook-t3f2\aside\`. Relaunched offline the same way (PID 20816).
  - `embeddings_status` stayed `{"state":"notProvisioned","downloadProgress":null,"errorMessage":null}` for the full 20 s poll.
  - `search_spells_semantic`: `{"ok":false,"error":"Search error: Embedding model is unavailable"}` (21 ms).
  - `llm_status` stayed `ready`.
  - Bundle dir had 4 files. No `models--*` or `.locks`.
  - Startup reports an incomplete file set as `notProvisioned`, not `error`.
- **B. Corrupt file:** wrote a 2-byte `{}` as `tokenizer.json` and relaunched (PID 4256).
  - `embeddings_status`: `{"state":"error","downloadProgress":null,"errorMessage":"embedding bundle validation failed: Validation error: Embedding file size mismatch for embeddings/all-MiniLM-L6-v2/tokenizer.json"}` on the first read, about 1 s after launch.
  - `search_spells_semantic` returned the same message as an error.
  - `llm_status` stayed `ready`.
  - No `models--*` or `.locks`.
- **Restore:** deleted the 2-byte file and moved the original back (711,661 bytes, `DA0E79933B9ED51798A3AE27893D3C5FA4A201126CEF75586296DF9B4D2C62A0`, mtime kept `09:08:07`). All six files matched before launch.
  - Relaunched offline (PID 20184). `embeddings_status=ready` on the first read, about 1.3 s after launch. `llm_status=ready`.
  - The temp-spell ranked check repeated with identical results (`indexed 2`, Magic Missile `0.5045549`, Light `0.7471289`). Temp spells were deleted again.
  - No hub cache.

#### Close and cleanup

- Every run: `CloseMainWindow` → exited within 20 s. No `spellbook-desktop` / `spellbook-sidecar` left, and no listener on 9222 (`Get-NetTCPConnection`). After the last run, `netstat -ano` showed only `TIME_WAIT` entries on 9222.
- `delete_spell` does not remove the content-hash JSON that `create_spell` writes under `spells\`. Removed the two `T3F2 …` JSON files by hand. The pre-existing July file was kept. No product code changed.
- `spellbook.sqlite3` grew from 229,376 to 1,810,432 bytes after the first `vec0` writes (`vec0` chunk allocation). It still has 0 spells.
- Raw JSON evidence (launch env, CDP steps, verify, netwatch, close, app stdout/stderr) is in `%TEMP%\spellbook-t3f2\` (`C:\WINDOWS\TEMP` in this shell). Not committed. Harness scripts are untracked `scripts/_t3f2_*`.

#### Linux (pending)

- Linux artifacts are still **pre-`18fd267`**: deb `0f5fb9e8…` and AppImage `9cc1acf6…` were built from `910f717` (+ `e4bdf65` packaging), before `18fd267`. They still have the old hf-hub `TextEmbedding::try_new` loader. The offline embeddings proof above is Windows-only. A Linux rebuild and offline re-check are pending.
