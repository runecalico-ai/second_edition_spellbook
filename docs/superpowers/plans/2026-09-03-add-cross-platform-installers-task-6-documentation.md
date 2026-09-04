# Cross-Platform Installers Task 6 Documentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete OpenSpec task group 6 for `add-cross-platform-installers` by documenting local release builds, end-user prerequisites (VC++, Ubuntu 24.04, first-run model network, unsigned SmartScreen), actual PDF import/export behavior, and that a lite installer is a future artifact — then flipping 6.1–6.4.

**Architecture:** Put maintainer commands in `docs/DEVELOPMENT.md`. Put end-user install notes in new `docs/RELEASE.md` (listed as optional in the proposal; required to satisfy “installation documentation” scenarios without bloating the developer workflow doc). Update `scripts/README.md` to point at the orchestrator. Do not archive the OpenSpec change in this plan.

**Tech Stack:** Markdown only. No new dependencies.

**OpenSpec change:** `add-cross-platform-installers`  
**Task group:** 6 — `tasks.md` 6.1–6.4  
**Depends on:** Groups 1–5 so commands and asset names are real  
**Unblocks:** OpenSpec archive/sync (separate workflow)  
**Sibling plans:**
- Prior: `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-5b-artifacts-caching-dryrun.md`

---

## Global Constraints

- Linux minimum: **Ubuntu 24.04 LTS**.
- Windows: unsigned permanently; SmartScreen “More info” → “Run anyway”; VC++ x64 warning is non-blocking; redistributable URL `https://aka.ms/vs/17/release/vc_redist.x64.exe`.
- Models: not in the installer; first download/import needs network; other core features work offline after install.
- PDF: import = bundled `pdfminer.six`; export `format: "pdf"` = print-optimized HTML for browser print-to-PDF. Do not claim a PDF engine ships.
- Lite installer: future, not v1.
- Do not rewrite delta specs in this plan. Flip `tasks.md` 6.1–6.4. Archiving/sync of `specs/release-packaging` and `specs/architecture` is **out of scope** (run `openspec-archive-change` later).

## Spec coverage map

| OpenSpec item | Plan task | Completion signal |
| ------------- | --------- | ----------------- |
| 6.1 Release build section in `docs/DEVELOPMENT.md` | Task 1 | section with commands + artifact paths; checkbox `[x]` |
| 6.2 End-user requirements | Task 2 | `docs/RELEASE.md` covers VC++, Ubuntu 24.04, models, SmartScreen; checkbox `[x]` |
| 6.3 PDF behavior documented | Task 3 | same doc (or DEVELOPMENT) states HTML export + pdfminer import; checkbox `[x]` |
| 6.4 Lite variant noted as future | Task 4 | explicit future-lite sentence; checkbox `[x]` |

## Planned file structure

| File | Action |
| ---- | ------ |
| `docs/DEVELOPMENT.md` | Modify: add Release builds after Desktop Application workflow |
| `docs/RELEASE.md` | Create |
| `scripts/README.md` | Modify: point at `prepare_release_bundle.py` |
| `openspec/changes/add-cross-platform-installers/tasks.md` | Flip 6.1–6.4 |

---

### Task 1: Maintainer release section (OpenSpec 6.1)

**Files:**
- Modify: `docs/DEVELOPMENT.md` (insert after `### Desktop Application (React + Rust)`, before `## Local Model Provisioning`)
- Modify: `scripts/README.md`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (6.1 only)

**Interfaces:**
- Consumes: `python scripts/prepare_release_bundle.py`, `pnpm tauri:build:win`, `pnpm tauri:build:linux`, `.\scripts\build_windows_installer.ps1`
- Produces: copy-pasteable maintainer steps

- [ ] **Step 1: Insert this section into `docs/DEVELOPMENT.md`**

```markdown
### Release builds (Windows NSIS, Linux AppImage and deb)

Maintainers can produce v1 installers locally without GitHub Actions. Run pre-build staging first so `resources/sqlite-vec/` is populated and `spellbook-sidecar-<target-triple>` exists under `apps/desktop/src-tauri/binaries/`.

Prerequisites: Node 24+, pnpm 10, Rust stable, Python 3.14.

Windows also needs MSVC and NSIS.

Ubuntu 24.04 also needs:

    sudo apt-get install -y libglib2.0-dev libgtk-3-dev libsoup-3.0-dev libwebkit2gtk-4.1-dev librsvg2-dev patchelf file libfuse2

Installer builds use `tauri.release.conf.json` (sidecar `externalBin`). `pnpm tauri:dev` does not.

```bash
python scripts/prepare_release_bundle.py
```

Windows (from repository root):

```powershell
.\scripts\build_windows_installer.ps1
```

Equivalent from `apps/desktop`: `pnpm tauri:build:win`.

Linux (Ubuntu 24.04, from `apps/desktop` after the prepare script):

```bash
pnpm tauri:build:linux
```

Artifacts (this repo’s Cargo `target-dir` is the repository-root `target/`):

- Windows: `target/release/bundle/nsis/` — NSIS `*setup.exe`
- Linux: `target/release/bundle/appimage/` and `target/release/bundle/deb/`

CI publishes renamed assets `Spellbook_{version}_x64-setup.exe`, `Spellbook_{version}_amd64.AppImage`, `Spellbook_{version}_amd64.deb` plus `.sha256` files. Local filenames may still be Tauri defaults until renamed.

Do not add `tauri build` to pull-request CI. Tagged releases use `.github/workflows/release.yml`.
```

Close the markdown code fences correctly in the real file (the inner fences above are examples for maintainers).

- [ ] **Step 2: Update `scripts/README.md`**

After the existing Windows installer examples, add:

```markdown
Release builds must run resource staging first (sqlite-vec into `apps/desktop/src-tauri/resources/sqlite-vec/` and the frozen sidecar into `apps/desktop/src-tauri/binaries/`):

```powershell
python scripts\prepare_release_bundle.py
.\scripts\build_windows_installer.ps1
```

`build_windows_installer.ps1` invokes `prepare_release_bundle.py` itself before `tauri build`.
```

- [ ] **Step 3: Mark OpenSpec 6.1 complete**

From:

```markdown
- [ ] 6.1 Add release build section to `docs/DEVELOPMENT.md` (prerequisites, commands, artifacts)
```

To:

```markdown
- [x] 6.1 Add release build section to `docs/DEVELOPMENT.md` (prerequisites, commands, artifacts)
```

- [ ] **Step 4: Commit**

```bash
git add docs/DEVELOPMENT.md scripts/README.md openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
docs: document local Windows and Linux installer commands

Give maintainers a checkout-based release path that matches the CI pre-build scripts.
EOF
)"
```

---

### Task 2: End-user requirements (OpenSpec 6.2)

**Files:**
- Create: `docs/RELEASE.md`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (6.2 only)

**Interfaces:**
- Consumes: none
- Produces: install doc covering VC++, Ubuntu 24.04, models, SmartScreen

- [ ] **Step 1: Write `docs/RELEASE.md`**

Use this content (keep headings):

```markdown
# Spellbook releases

Spellbook ships **unsigned** Windows NSIS installers and Linux AppImage plus `.deb` packages. There is no macOS installer in v1.

## Windows

1. Download `Spellbook_{version}_x64-setup.exe` and its `.sha256` file from the GitHub Release.
2. Verify SHA256 before running the installer.
3. Windows SmartScreen may warn because the installer is **not Authenticode-signed**. Choose **More info**, then **Run anyway**. Signing is not planned.
4. If the installer warns that the Microsoft Visual C++ Redistributable (x64) is missing, install it from https://aka.ms/vs/17/release/vc_redist.x64.exe. The Spellbook installer does **not** silently install the redistributable. You may continue past the warning; the app will fail to launch if the runtime is truly absent.
5. User data lives in `%APPDATA%\SpellbookVault` and survives upgrades.

## Linux

Minimum supported distribution: **Ubuntu 24.04 LTS**. Newer Ubuntu releases may work; older glibc/GTK stacks are not supported.

Install the `.deb` with the system package manager, or run the AppImage after marking it executable.

User data lives in `~/.local/share/SpellbookVault` (or `$XDG_DATA_HOME/SpellbookVault`).

## Models and offline use

Installers do **not** include TinyLlama or MiniLM model files. After install, use in-app download or verified side-load into `SpellbookVault/models/`. The **first** model download or import requires network access. All other core features (library, keyword search, import/export via the bundled sidecar) work offline after install.
```

- [ ] **Step 2: Mark OpenSpec 6.2 complete**

From:

```markdown
- [ ] 6.2 Document end-user requirements: VC++ redistributable (Windows), Ubuntu 24.04+ (Linux), model provisioning (network on first run), unsigned SmartScreen workaround
```

To:

```markdown
- [x] 6.2 Document end-user requirements: VC++ redistributable (Windows), Ubuntu 24.04+ (Linux), model provisioning (network on first run), unsigned SmartScreen workaround
```

- [ ] **Step 3: Commit**

```bash
git add docs/RELEASE.md openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
docs: add end-user install notes for unsigned Windows and Ubuntu 24.04

Document VC++, SmartScreen, and first-run model network as release constraints.
EOF
)"
```

---

### Task 3: PDF behavior (OpenSpec 6.3)

**Files:**
- Modify: `docs/RELEASE.md` (add PDF section)
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (6.3 only)

**Interfaces:**
- Consumes: existing sidecar behavior (`format: "pdf"` → HTML)
- Produces: user-visible documentation

- [ ] **Step 1: Append to `docs/RELEASE.md`**

```markdown
## PDF import and export

- **Import:** PDF files are parsed by `pdfminer.six` inside the bundled sidecar. A system Python install is not required.
- **Export:** Choosing PDF export writes print-optimized **HTML**. Use the browser **Print to PDF** command. Spellbook does not ship a PDF engine.
```

- [ ] **Step 2: Mark OpenSpec 6.3 complete**

From:

```markdown
- [ ] 6.3 Document PDF behavior: export → HTML (browser print-to-PDF); import → bundled pdfminer
```

To:

```markdown
- [x] 6.3 Document PDF behavior: export → HTML (browser print-to-PDF); import → bundled pdfminer
```

- [ ] **Step 3: Commit**

```bash
git add docs/RELEASE.md openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
docs: describe PDF import via pdfminer and HTML print-to-PDF export

Match the shipped sidecar behavior instead of implying a PDF runtime.
EOF
)"
```

---

### Task 4: Future lite installer note (OpenSpec 6.4)

**Files:**
- Modify: `docs/RELEASE.md`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (6.4 only)

**Interfaces:**
- Consumes: design decision “lite deferred”
- Produces: non-normative future note; v1 still one full artifact per OS

- [ ] **Step 1: Append to `docs/RELEASE.md`**

```markdown
## Future lite installer

v1 publishes **one full installer per platform** (LLM and embedding natives included). A smaller lite installer without default `llm` features is planned for a later release and is **not** required for v1.
```

- [ ] **Step 2: Mark OpenSpec 6.4 complete**

From:

```markdown
- [ ] 6.4 Note lite installer variant as planned future artifact
```

To:

```markdown
- [x] 6.4 Note lite installer variant as planned future artifact
```

Do **not** mark the whole change archived. Leave delta specs untouched.

- [ ] **Step 3: Commit**

```bash
git add docs/RELEASE.md openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
docs: note lite installers as a future artifact

Keep v1 compliance at one full build per platform.
EOF
)"
```

---

## After group 6

When `tasks.md` 1.1–6.4 are all `[x]`, run the separate archive workflow (`openspec-archive-change`) to sync `specs/release-packaging` and `specs/architecture` into main specs. That is not part of this plan file.
