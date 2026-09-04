# Cross-Platform Installers Task 5a Release Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete OpenSpec items 5.1–5.3 for `add-cross-platform-installers` by adding `.github/workflows/release.yml` on `v*` tags and `workflow_dispatch`, with `windows-latest` and `ubuntu-24.04` jobs that install toolchains and run pre-build + Tauri bundle — without changing PR `ci.yml` into an installer builder.

**Architecture:** Dedicated workflow, separate from `.github/workflows/ci.yml`. Jobs call `python scripts/prepare_release_bundle.py` then platform `pnpm` Tauri scripts. Artifact upload, checksums, caching, and the rc tag are Task 5b.

**Tech Stack:** GitHub Actions, Node 24, pnpm 10, `dtolnay/rust-toolchain@stable`, Python 3.14, Ubuntu 24.04 GTK/WebKit deps matching `ci.yml`.

**OpenSpec change:** `add-cross-platform-installers`  
**Task group:** 5.1–5.3  
**Depends on:** Task groups 1–3 (scripts + bundle config). Group 4 local smokes should already have passed on maintainer machines.  
**Unblocks:** Task 5b  
**Sibling plans:**
- Prior: `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-4-local-release-verification.md`
- Next: `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-5b-artifacts-caching-dryrun.md`

---

## Global Constraints

- Triggers: `push` tags `v*` **and** `workflow_dispatch` with **no inputs**. Dispatch is always a dry run (workflow artifacts only). Tag push always publishes a GitHub Release (Task 5b).
- Python in release jobs: create and use a venv (`python -m venv .venv` at repo root, then `.\.venv\Scripts\python` / `.venv/bin/python`). Do not `pip install` into the runner’s global interpreter.
- Linux apt list must include `libfuse2` (AppImage tooling on Ubuntu 24.04) plus the GTK/WebKit set already in `ci.yml`.
- After checkout on Windows, fail the job if `rustc --print host-tuple` (or `-vV` host) is not `x86_64-pc-windows-msvc`. After checkout on Linux, fail if not `x86_64-unknown-linux-gnu`.
- Runners: `windows-latest` → NSIS only; `ubuntu-24.04` → AppImage + deb. No macOS job.
- PR CI (`.github/workflows/ci.yml`) stays lint/test only. **Do not** add `tauri build` there.
- Toolchain: Node **24**, pnpm **10**, Python **3.14**, Rust stable — same as `ci.yml`.
- Default Cargo features (`llm` on). Do not pass `--no-default-features`.
- Do not Authenticode-sign.
- Do not rewrite delta specs. Flip only 5.1–5.3.

## Spec coverage map

| OpenSpec item | Plan task | Completion signal |
| ------------- | --------- | ----------------- |
| 5.1 Create `release.yml` on `v*` tags and `workflow_dispatch` | Task 1 | workflow file exists with those `on:` keys; checkbox `[x]` |
| 5.2 `windows-latest` job: Node 24, pnpm, Rust, Python 3.14, pre-build, `pnpm tauri build` | Task 2 | windows job complete enough to compile; checkbox `[x]` |
| 5.3 `ubuntu-24.04` job: same plus GTK/WebKit | Task 3 | linux job present; checkbox `[x]` |

## Planned file structure

| File | Action |
| ---- | ------ |
| `.github/workflows/release.yml` | Create |
| `.github/workflows/ci.yml` | Do not add bundle steps |
| `openspec/changes/add-cross-platform-installers/tasks.md` | Flip 5.1–5.3 |

---

### Task 1: Workflow skeleton and triggers (OpenSpec 5.1)

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (5.1 only)

**Interfaces:**
- Consumes: none
- Produces: `on.push.tags: ["v*"]` and `on.workflow_dispatch` with **no** `create_release` input

- [ ] **Step 1: Create the workflow file with jobs stubbed to `true` only if you need a parse check; prefer real jobs in Tasks 2–3 of this same file.**

Write `.github/workflows/release.yml` starting with:

```yaml
name: Release

on:
  push:
    tags:
      - "v*"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false
```

Write `release.yml` with both jobs in the same working tree (Tasks 2 and 3 below supply the job bodies). Do not push a workflow whose `jobs:` map is empty. If you split commits, commit 5.1+5.2 together (a Windows-only `jobs:` map is valid YAML) then add the Linux job.

Recommended: implement Tasks 1–3 together, then flip 5.1, 5.2, and 5.3 in one `tasks.md` commit after `actionlint` / YAML sanity.

- [ ] **Step 2: YAML sanity**

If `actionlint` is installed: `actionlint .github/workflows/release.yml`. Otherwise open the file in the GitHub UI on a branch and confirm it parses.

- [ ] **Step 3: Mark OpenSpec 5.1 complete** (after the file exists with both triggers)

From:

```markdown
- [ ] 5.1 Create `.github/workflows/release.yml` triggered on `v*` tags and `workflow_dispatch`
```

To:

```markdown
- [x] 5.1 Create `.github/workflows/release.yml` triggered on `v*` tags and `workflow_dispatch`
```

Leave 5.2–5.3 unchecked until those jobs are filled.

- [ ] **Step 4: Commit** (if splitting)

```bash
git add .github/workflows/release.yml openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
ci: add tag-triggered release workflow skeleton

Keep installer builds off the pull-request CI path.
EOF
)"
```

If Tasks 2–3 land in the same commit, skip this commit and use Task 3’s commit.

---

### Task 2: Windows job (OpenSpec 5.2)

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (5.2 only)

**Interfaces:**
- Consumes: `scripts/prepare_release_bundle.py`, `apps/desktop` pnpm scripts
- Produces: job `windows` on `windows-latest`

- [ ] **Step 1: Add the Windows job**

```yaml
jobs:
  windows:
    runs-on: windows-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: apps/desktop/pnpm-lock.yaml

      - name: Set up Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Assert Windows host triple
        run: |
          $t = (rustc --print host-tuple).Trim()
          if ($t -ne 'x86_64-pc-windows-msvc') { throw "unsupported host triple $t" }

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.14"
          cache: pip
          cache-dependency-path: |
            services/ml/requirements*.txt

      - name: Install JS dependencies
        working-directory: apps/desktop
        run: pnpm install --frozen-lockfile

      - name: Create Python venv and install
        run: |
          python -m venv .venv
          .\.venv\Scripts\python -m pip install -r services/ml/requirements.txt -r services/ml/requirements-dev.txt

      - name: Prepare release resources
        run: .\.venv\Scripts\python scripts/prepare_release_bundle.py

      - name: Build NSIS installer
        working-directory: apps/desktop
        run: pnpm tauri:build:win
```

Do **not** add checksum upload or cache steps yet (Task 5b). Leave those steps out of this file until that plan.

- [ ] **Step 2: Mark OpenSpec 5.2 complete**

From:

```markdown
- [ ] 5.2 Add `windows-latest` job: Node 24, pnpm, Rust, Python 3.14, pre-build scripts, `pnpm tauri build`
```

To:

```markdown
- [x] 5.2 Add `windows-latest` job: Node 24, pnpm, Rust, Python 3.14, pre-build scripts, `pnpm tauri build`
```

- [ ] **Step 3: Commit** (if splitting)

```bash
git add .github/workflows/release.yml openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
ci(release): build NSIS on windows-latest

Run sidecar freeze and sqlite-vec staging before the Windows Tauri bundle.
EOF
)"
```

---

### Task 3: Ubuntu 24.04 job (OpenSpec 5.3)

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (5.3 only)

**Interfaces:**
- Consumes: same pre-build script
- Produces: job `linux` on `ubuntu-24.04`

- [ ] **Step 1: Add the Linux job**

```yaml
  linux:
    runs-on: ubuntu-24.04
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install system dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libglib2.0-dev \
            libgtk-3-dev \
            libsoup-3.0-dev \
            libwebkit2gtk-4.1-dev \
            librsvg2-dev \
            patchelf \
            file \
            libfuse2

      - name: Set up pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
          cache-dependency-path: apps/desktop/pnpm-lock.yaml

      - name: Set up Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Assert Linux host triple
        run: |
          t=$(rustc --print host-tuple || true)
          test "$t" = "x86_64-unknown-linux-gnu"

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.14"
          cache: pip
          cache-dependency-path: |
            services/ml/requirements*.txt

      - name: Install JS dependencies
        working-directory: apps/desktop
        run: pnpm install --frozen-lockfile

      - name: Create Python venv and install
        run: |
          python -m venv .venv
          .venv/bin/python -m pip install -r services/ml/requirements.txt -r services/ml/requirements-dev.txt

      - name: Prepare release resources
        run: .venv/bin/python scripts/prepare_release_bundle.py

      - name: Build AppImage and deb
        working-directory: apps/desktop
        run: pnpm tauri:build:linux
```

Confirm `.github/workflows/ci.yml` still has **no** `tauri build` / `tauri:build` step.

- [ ] **Step 2: Mark OpenSpec 5.3 complete**

From:

```markdown
- [ ] 5.3 Add `ubuntu-24.04` job: same toolchain plus Linux GTK/WebKit deps
```

To:

```markdown
- [x] 5.3 Add `ubuntu-24.04` job: same toolchain plus Linux GTK/WebKit deps
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
ci(release): build AppImage and deb on Ubuntu 24.04

Match the Linux baseline in the packaging spec and keep PR CI bundle-free.
EOF
)"
```
