# Cross-Platform Installers Task 4 Local Release Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete OpenSpec task group 4 for `add-cross-platform-installers` by building NSIS on Windows and AppImage/deb on Ubuntu 24.04, then smoke-testing a clean install: app start, sidecar import/export, sqlite-vec load, models absent from the installer, and LLM + semantic search after provisioning.

**Architecture:** This slice is a verification gate, not a feature slice. Use the pre-build orchestrator from groups 1–2 and bundle config from group 3. Full Playwright E2E on the installed binary is **manual for v1**. Record results in `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-4-verification-log.md` in the same repo so later CI work can cite them.

**Tech Stack:** `scripts/prepare_release_bundle.py`, `scripts/build_windows_installer.ps1`, `pnpm tauri:build:linux`, Windows NSIS, Ubuntu 24.04, existing in-app model provisioning.

**OpenSpec change:** `add-cross-platform-installers`  
**Task group:** 4 — `tasks.md` 4.1–4.4  
**Depends on:** Task groups 1–3  
**Unblocks:** Task group 5 (do not cut a public tag until 4.1–4.2 pass on at least one machine each)  
**Sibling plans:**
- Prior: `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-3-tauri-bundle-config.md`
- Next: `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-5a-release-workflow.md`

---

## Global Constraints

- Clean-machine means: no repo checkout, no Node, no system Python required for import/export.
- Installers **must not** contain TinyLlama GGUF or MiniLM ONNX under `SpellbookVault/models/` or inside the payload as model files.
- User data stays in `%APPDATA%/SpellbookVault` (Windows) or `~/.local/share/SpellbookVault` (Linux) and must survive reinstall.
- PDF import uses bundled pdfminer; PDF export returns HTML (do not fail the smoke if “Export PDF” UI label still says PDF).
- Linux baseline is **Ubuntu 24.04 LTS**.
- Unsigned Windows SmartScreen: proceed via “More info” → “Run anyway” if shown; do not sign.
- Do not rewrite delta specs. Flip 4.x only after that platform’s smoke is actually run.

## Spec coverage map

| OpenSpec item | Plan task | Completion signal |
| ------------- | --------- | ----------------- |
| 4.1 Build NSIS locally on Windows; verify start, sidecar, sqlite-vec without checkout | Task 1 | verification log Windows section; checkbox `[x]` |
| 4.2 Build AppImage and `.deb` on Ubuntu 24.04; same smokes | Task 2 | verification log Linux section; checkbox `[x]` |
| 4.3 Confirm installer excludes model files; provisioning still works | Task 3 | archive listing has no model blobs; in-app download/import still works; checkbox `[x]` |
| 4.4 Smoke-test LLM chat and semantic search on installed full build | Task 4 | chat token + semantic hit recorded; checkbox `[x]` |

## Planned file structure

| File | Action |
| ---- | ------ |
| `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-4-verification-log.md` | Create: dated smoke evidence |
| `openspec/changes/add-cross-platform-installers/tasks.md` | Flip 4.1–4.4 after evidence |

---

### Task 1: Windows NSIS clean-install smoke (OpenSpec 4.1)

**Files:**
- Create/modify: `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-4-verification-log.md`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (4.1 only)

**Interfaces:**
- Consumes: `.\scripts\build_windows_installer.ps1` (runs `prepare_release_bundle.py` then `tauri build --bundles nsis`)
- Produces: installer under `target/release/bundle/nsis/` (repo-root Cargo `target-dir`)

- [ ] **Step 1: Build NSIS on Windows**

From repo root, with Node 24, pnpm, Rust, Python 3.14, NSIS, and MSVC as in `docs/DEVELOPMENT.md`:

```powershell
python scripts\prepare_release_bundle.py
.\scripts\build_windows_installer.ps1 -SkipInstall
```

If `pnpm install` is still needed, omit `-SkipInstall`. Expected: `target\release\bundle\nsis\*setup.exe` exists. Filename should resemble `Spellbook_0.1.0_x64-setup.exe` (version from `tauri.conf.json`).

- [ ] **Step 2: Install on a machine without the repo (or a second user profile)**

Copy **only** the setup exe to another folder (or a VM). Run it. If SmartScreen appears, use “More info” → “Run anyway”. If the VC++ warning appears, install https://aka.ms/vs/17/release/vc_redist.x64.exe or continue and expect launch failure until VC++ is present — **the installer must still complete**.

- [ ] **Step 3: Smoke without Python on PATH (optional but required for the spec)**

On the installed machine, confirm `python` is missing or unused. Launch Spellbook from the Start Menu.

Import a `.md` spell file and a `.docx` if available. Export with format PDF and confirm the output is HTML (browser print-to-PDF), not a `.pdf` engine.

Confirm vector search does not immediately degrade solely because `vec0.dll` was missing from the bundle: after first launch, `%APPDATA%\SpellbookVault\vec0.dll` should exist (copied from resources).

- [ ] **Step 4: Write the Windows section of the verification log**

Create `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-4-verification-log.md`:

```markdown
# Task 4 verification log

## Windows NSIS

- Date:
- Host OS:
- Installer filename:
- App starts without repo checkout: yes/no
- Markdown import: yes/no
- DOCX import: yes/no
- PDF import (pdfminer): yes/no
- PDF export is HTML: yes/no
- `%APPDATA%/SpellbookVault/vec0.dll` present after first launch: yes/no
- Notes:
```

Fill in real yes/no values. Do not mark 4.1 complete with blanks.

- [ ] **Step 5: Mark OpenSpec 4.1 complete**

From:

```markdown
- [ ] 4.1 Build NSIS installer locally on Windows; verify app starts, sidecar import/export, sqlite-vec load without repo checkout
```

To:

```markdown
- [x] 4.1 Build NSIS installer locally on Windows; verify app starts, sidecar import/export, sqlite-vec load without repo checkout
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-4-verification-log.md openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
docs(packaging): record Windows NSIS clean-install smoke results

Capture evidence that the bundled sidecar and sqlite-vec resources work without a checkout.
EOF
)"
```

---

### Task 2: Ubuntu 24.04 AppImage and deb smoke (OpenSpec 4.2)

**Files:**
- Modify: verification log (Linux section)
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (4.2 only)

**Interfaces:**
- Consumes: `pnpm tauri:build:linux` from `apps/desktop` after `python scripts/prepare_release_bundle.py`
- Produces: AppImage + `.deb` under `target/release/bundle/appimage` and `target/release/bundle/deb`

- [ ] **Step 1: Install Linux build deps (Ubuntu 24.04)**

```bash
sudo apt-get update
sudo apt-get install -y \
  libglib2.0-dev libgtk-3-dev libsoup-3.0-dev libwebkit2gtk-4.1-dev \
  librsvg2-dev patchelf file
```

Plus Node 24, pnpm 10, Rust stable, Python 3.14, NSIS not required.

- [ ] **Step 2: Build**

```bash
python3 scripts/prepare_release_bundle.py
cd apps/desktop
pnpm install --frozen-lockfile
pnpm tauri:build:linux
```

Expected: an `.AppImage` and a `.deb` under repo-root `target/release/bundle/`.

- [ ] **Step 3: Install/run on a clean Ubuntu 24.04**

- `.deb`: `sudo apt install ./Spellbook_*.deb` (or the actual filename Tauri emitted).
- AppImage: `chmod +x` and run.

Repeat the same import/export and `~/.local/share/SpellbookVault/vec0.so` checks as Windows.

- [ ] **Step 4: Append Linux evidence**

```markdown
## Linux Ubuntu 24.04

- Date:
- AppImage filename:
- deb filename:
- App starts without repo checkout: yes/no
- Markdown import: yes/no
- DOCX import: yes/no
- PDF import: yes/no
- PDF export is HTML: yes/no
- `~/.local/share/SpellbookVault/vec0.so` present after first launch: yes/no
- Notes:
```

- [ ] **Step 5: Mark OpenSpec 4.2 complete**

From:

```markdown
- [ ] 4.2 Build AppImage and `.deb` on Ubuntu 24.04; verify same smoke checks
```

To:

```markdown
- [x] 4.2 Build AppImage and `.deb` on Ubuntu 24.04; verify same smoke checks
```

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-4-verification-log.md openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
docs(packaging): record Ubuntu 24.04 AppImage and deb smoke results

Prove Linux artifacts meet the same clean-install sidecar and sqlite-vec bar as Windows.
EOF
)"
```

---

### Task 3: Models excluded; provisioning still works (OpenSpec 4.3)

**Files:**
- Modify: verification log
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (4.3 only)

**Interfaces:**
- Consumes: built installer/AppImage/deb from Tasks 1–2
- Produces: proof the payload has no GGUF/ONNX model directory

- [ ] **Step 1: Search installer payloads for model files**

Windows (NSIS exe is a packed payload; also search the extracted install dir after install):

```powershell
Get-ChildItem -Recurse "$env:ProgramFiles\Spellbook" -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match 'tinyllama|\.gguf|all-MiniLM|model\.onnx' }
```

Linux:

```bash
dpkg-deb -c target/release/bundle/deb/*.deb | grep -Ei 'tinyllama|\.gguf|minilm|model\.onnx' || true
```

Expected: **no** matches. `SpellbookVault/models/` must not ship inside the package.

- [ ] **Step 2: Provision after install**

On the installed app, run in-app `llm_download_model` **or** verified side-load of the approved TinyLlama GGUF from `docs/DEVELOPMENT.md`. Confirm files land under the **user** vault `SpellbookVault/models/`, not Program Files.

- [ ] **Step 3: Log and mark 4.3**

Append:

```markdown
## Models excluded

- Installer/payload grep for GGUF/ONNX: clean / hits (describe)
- Post-install provisioning succeeded: yes/no
```

From:

```markdown
- [ ] 4.3 Confirm installed app does not bundle model files; provisioning still works post-install
```

To:

```markdown
- [x] 4.3 Confirm installed app does not bundle model files; provisioning still works post-install
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-4-verification-log.md openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
docs(packaging): confirm installers omit ML models

Keep first-run provisioning as the only model distribution path.
EOF
)"
```

---

### Task 4: LLM chat and semantic search smoke (OpenSpec 4.4)

**Files:**
- Modify: verification log
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (4.4 only)

**Interfaces:**
- Consumes: provisioned models from Task 3 on the **installed** full build (default `llm` feature)
- Produces: one successful chat reply and one semantic search result

- [ ] **Step 1: Chat**

After LLM status is `ready`/`loaded`, send one short message in the in-app chat. Expected: streamed tokens, no sidecar involvement.

- [ ] **Step 2: Semantic search**

Ensure embeddings are `ready` and at least one spell exists. Run semantic search from the library UI. Expected: ranked hits (vector path). If `vec0` failed to load, the app falls back to blob tables — treat that as a **fail** for this task and return to group 1 resources.

- [ ] **Step 3: Log and mark 4.4**

```markdown
## LLM and semantic search (installed full build)

- Chat produced tokens: yes/no
- Semantic search returned hits: yes/no
```

From:

```markdown
- [ ] 4.4 Smoke-test LLM chat and semantic search on installed full build
```

To:

```markdown
- [x] 4.4 Smoke-test LLM chat and semantic search on installed full build
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-4-verification-log.md openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
docs(packaging): record installed full-build LLM and semantic search smoke

Verify default-feature natives work after install once models are user-provisioned.
EOF
)"
```
