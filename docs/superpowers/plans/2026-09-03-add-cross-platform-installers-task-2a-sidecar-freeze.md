# Cross-Platform Installers Task 2a Sidecar Freeze Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete OpenSpec items 2.1–2.3 for `add-cross-platform-installers` by confirming freeze inputs (`pdfminer.six`, `python-docx`), adding a PyInstaller-backed freeze after Dependency Security approval, and registering `bundle.externalBin` as `binaries/spellbook-sidecar`.

**Architecture:** One-file console binary named `spellbook-sidecar` from `services/ml/spellbook_sidecar.py`. Copy/rename to `apps/desktop/src-tauri/binaries/spellbook-sidecar-<rustc-host-tuple>[.exe]`. Register `externalBin` only in `tauri.release.conf.json` so `pnpm tauri:dev` does not require a freeze. Installer scripts pass `--config src-tauri/tauri.release.conf.json`. Tauri strips the target-triple suffix at install time and places the binary next to `spellbook-desktop`. Runtime spawn is Task 2b.

**Tech Stack:** Python 3.14, PyPI package **`pyinstaller`** (canonical name from https://pyinstaller.org/en/stable/installation.html and https://pypi.org/project/pyinstaller/), pin **`pyinstaller==6.22.2`** (changelog 2026-08-17) plus matching **`pyinstaller-hooks-contrib`**, Tauri v2 `externalBin`.

**OpenSpec change:** `add-cross-platform-installers`  
**Task group:** 2.1–2.3  
**Depends on:** Task group 1  
**Unblocks:** Task 2b (resolution + wiring freeze into `prepare_release_bundle.py`)  
**Sibling plans:**
- Prior: `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-1-sqlite-vec-provisioning.md`
- Next: `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-2b-sidecar-resolution.md`

---

## Global Constraints

- Freeze **Python 3.14** only (matches CI).
- Sidecar remains import/export only. Do not freeze LLM or embedding code.
- **Dependency Security gate (closed 2026-09-03):** Human approved `pyinstaller==6.22.2`. Resolved companion pin: `pyinstaller-hooks-contrib==2026.7` (from `pip install pyinstaller==6.22.2` then `pip show`). Pins are in `services/ml/requirements-dev.txt`.
- Canonical PyPI names (character-for-character): `pyinstaller`, `pyinstaller-hooks-contrib`. Upstream: https://github.com/pyinstaller/pyinstaller and https://github.com/pyinstaller/pyinstaller-hooks-contrib
- Do not use git URLs or tarball installs for PyInstaller.
- Do **not** put `externalBin` in `apps/desktop/src-tauri/tauri.conf.json`. Put it only in `apps/desktop/src-tauri/tauri.release.conf.json` so daily `pnpm tauri:dev` keeps working without PyInstaller.
- Host tuple: `rustc --print host-tuple`, with fallback parse of `host:` from `rustc -vV`. v1 Windows must be `x86_64-pc-windows-msvc`; v1 Linux must be `x86_64-unknown-linux-gnu`. Fail the freeze script on any other triple.
- OpenSpec 2.2 requires the freeze **build script under `services/ml/`**: implement `services/ml/build_sidecar.py` (not `scripts/freeze_sidecar.py`).
- Install PyInstaller only into a venv (repo-root `.venv` locally; `services/ml/.venv` in CI), never system pip.
- Do not rewrite delta specs. Flip only 2.1–2.3 in `tasks.md`.
- ML models stay out of this binary and out of the installer.

## Spec coverage map

| OpenSpec item | Plan task | Completion signal |
| ------------- | --------- | ----------------- |
| 2.1 Audit sidecar runtime deps; confirm `pdfminer.six` and `python-docx` ship in frozen binary | Task 1 | Audit note in `services/ml/SIDECAR_FREEZE.md`; hiddenimports listed; checkbox `[x]` |
| 2.2 Add PyInstaller spec and build script producing `spellbook-sidecar-{target-triple}` with Python 3.14 | Task 2 | `services/ml/spellbook_sidecar.spec` + `services/ml/build_sidecar.py`; binary named with host tuple; checkbox `[x]` |
| 2.3 Register sidecar in `tauri.conf.json` `bundle.externalBin` under `src-tauri/binaries/` | Task 3 | `tauri.release.conf.json` has `externalBin`; main `tauri.conf.json` does not; checkbox `[x]` |

## Planned file structure

| File | Action |
| ---- | ------ |
| `services/ml/SIDECAR_FREEZE.md` | Create: audit + security provenance |
| `services/ml/requirements-dev.txt` | Modify: pinned `pyinstaller==6.22.2` + `pyinstaller-hooks-contrib==2026.7` (approved 2026-09-03) |
| `services/ml/spellbook_sidecar.spec` | Create |
| `services/ml/build_sidecar.py` | Create (OpenSpec 2.2 location) |
| `services/ml/tests/test_build_sidecar.py` | Create |
| `apps/desktop/src-tauri/tauri.release.conf.json` | Create: `externalBin` only |
| `apps/desktop/src-tauri/binaries/.gitkeep` | Create |
| `.gitignore` | Modify: ignore frozen binaries |
| `openspec/changes/add-cross-platform-installers/tasks.md` | Flip 2.1–2.3 |

---

### Task 1: Audit freeze inputs (OpenSpec 2.1)

**Files:**
- Create: `services/ml/SIDECAR_FREEZE.md`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (2.1 only)

**Interfaces:**
- Consumes: `services/ml/requirements.txt` (`pdfminer.six>=20231228`, `python-docx>=1.1.0`), `spellbook_sidecar.py` imports
- Produces: documented hiddenimports list used verbatim in Task 2's `.spec`

- [ ] **Step 1: Confirm declared vs imported deps**

`services/ml/requirements.txt` already lists:

```
pdfminer.six>=20231228
python-docx>=1.1.0
pytest>=8.3.4
```

`spellbook_sidecar.py` imports:

- `pdfminer.high_level.extract_text` (optional at runtime today)
- `docx.Document` (optional at runtime today)

Export path uses stdlib only. `pytest` must **not** be collected into the frozen binary.

- [ ] **Step 2: Write the freeze audit document**

Create `services/ml/SIDECAR_FREEZE.md` with this content (do not invent extra runtime libraries):

```markdown
# Sidecar freeze audit

## Runtime imports that must be inside the frozen binary

| User-facing feature | Import | Declared package |
| ------------------- | ------ | ---------------- |
| PDF import | `pdfminer.high_level.extract_text` | `pdfminer.six` |
| DOCX import | `docx.Document` | `python-docx` |
| Markdown import | stdlib | none |
| HTML / "PDF" export | stdlib HTML renderer | none |

PDF export (`format: "pdf"`) returns print-optimized HTML. Do not bundle a PDF engine.

## Hiddenimports for PyInstaller

- `pdfminer`
- `pdfminer.high_level`
- `pdfminer.layout`
- `docx`

Transitive wheels (`charset-normalizer`, `lxml`, `cryptography`, etc.) are pulled by pip at freeze time. Do not add them to `requirements.txt` unless a freeze build fails with a missing module; if that happens, pin the missing module after a fresh Dependency Security review.

## Out of freeze

- `pytest`
- `ruff`
- TinyLlama / MiniLM model files
```

- [ ] **Step 3: Mark OpenSpec 2.1 complete**

From:

```markdown
- [ ] 2.1 Audit sidecar runtime deps; confirm `pdfminer.six` and `python-docx` ship in frozen binary
```

To:

```markdown
- [x] 2.1 Audit sidecar runtime deps; confirm `pdfminer.six` and `python-docx` ship in frozen binary
```

- [ ] **Step 4: Commit**

```bash
git add services/ml/SIDECAR_FREEZE.md openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
docs(sidecar): record freeze audit for pdfminer and python-docx

Make hiddenimports explicit before adding a PyInstaller spec.
EOF
)"
```

---

### Task 2: PyInstaller spec and freeze script (OpenSpec 2.2)

**Files:**
- Modify: `services/ml/requirements-dev.txt` (only after approval)
- Create: `services/ml/spellbook_sidecar.spec`
- Create: `services/ml/build_sidecar.py`
- Create: `services/ml/tests/test_build_sidecar.py`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (2.2 only)

**Interfaces:**
- Consumes: audit hiddenimports from Task 1; Python 3.14 venv with runtime requirements installed
- Produces: `build_sidecar.host_tuple() -> str`, `build_sidecar.binary_filename(host_tuple: str, windows: bool) -> str` returning `spellbook-sidecar-x86_64-pc-windows-msvc.exe` or `spellbook-sidecar-x86_64-unknown-linux-gnu`; writes that file under `apps/desktop/src-tauri/binaries/`

- [x] **Step 1: Dependency Security gate — APPROVED 2026-09-03**

Gate is closed. Do not re-ask for approval unless the pin changes.

- Need: freeze `spellbook_sidecar.py` into a single executable. Existing repo Python deps cannot produce an `.exe`/ELF sidecar.
- Registry: PyPI only.
- Canonical names verified from https://pyinstaller.org/en/stable/installation.html and PyPI project pages linking to https://github.com/pyinstaller/pyinstaller.
- Approved pin: `pyinstaller==6.22.2` (human approval 2026-09-03).
- Resolved hooks pin: `pyinstaller-hooks-contrib==2026.7` (installed with 6.22.2; PyInstaller requires `pyinstaller-hooks-contrib>=2026.6`).
- Manifest: both pins already written to `services/ml/requirements-dev.txt`.

- [ ] **Step 2: Write failing tests for naming helpers**

Create `services/ml/tests/test_build_sidecar.py`:

```python
from build_sidecar import ALLOWED_HOST_TUPLES, binary_filename, host_tuple_from_rustc_output


def test_windows_filename() -> None:
    assert (
        binary_filename("x86_64-pc-windows-msvc", windows=True)
        == "spellbook-sidecar-x86_64-pc-windows-msvc.exe"
    )


def test_linux_filename() -> None:
    assert (
        binary_filename("x86_64-unknown-linux-gnu", windows=False)
        == "spellbook-sidecar-x86_64-unknown-linux-gnu"
    )


def test_parse_host_tuple_flag() -> None:
    assert host_tuple_from_rustc_output("x86_64-pc-windows-msvc\n") == "x86_64-pc-windows-msvc"


def test_parse_rustc_vv() -> None:
    raw = "rustc 1.95.0\nbinary: rustc\nhost: x86_64-unknown-linux-gnu\n"
    assert host_tuple_from_rustc_output(raw) == "x86_64-unknown-linux-gnu"


def test_allowed_triples() -> None:
    assert ALLOWED_HOST_TUPLES == {
        "x86_64-pc-windows-msvc",
        "x86_64-unknown-linux-gnu",
    }
```

Pytest collects this automatically with `working-directory: services/ml` in CI. Add an empty `services/ml/tests/conftest.py` path hook only if import fails; prefer putting `sys.path.insert(0, str(Path(__file__).resolve().parents[1]))` at the top of the test file so `import build_sidecar` works.

- [ ] **Step 3: Run tests to verify they fail**

```powershell
.\.venv\Scripts\python -m pytest services\ml\tests\test_build_sidecar.py -v
```

Expected: FAIL (`ModuleNotFoundError: build_sidecar`).

- [x] **Step 4: Pin PyInstaller in dev requirements (done with approval)**

`services/ml/requirements-dev.txt` already contains:

```
pyinstaller==6.22.2
pyinstaller-hooks-contrib==2026.7
```

When creating `services/ml/SIDECAR_FREEZE.md` in Task 1 / remaining Task 2 steps, include:

```markdown
## Dependency provenance

- Why: freeze `spellbook_sidecar.py` for Tauri `externalBin` (no existing freezer in-repo)
- pyinstaller 6.22.2 from PyPI — https://pypi.org/project/pyinstaller/6.22.2/ — upstream https://github.com/pyinstaller/pyinstaller — verified via https://pyinstaller.org/en/stable/installation.html
- pyinstaller-hooks-contrib 2026.7 from PyPI — required companion; resolved by `pip install pyinstaller==6.22.2` then `pip show`
- Human approval: 2026-09-03 for `pyinstaller==6.22.2`
```

Install into the repo-root venv when implementing the freeze:

```powershell
.\.venv\Scripts\pip install -r services\ml\requirements.txt -r services\ml\requirements-dev.txt
```

- [ ] **Step 5: Add the spec file**

Create `services/ml/spellbook_sidecar.spec`:

```python
# -*- mode: python ; coding: utf-8 -*-

from PyInstaller.utils.hooks import collect_submodules

hidden = [
    "pdfminer",
    "pdfminer.high_level",
    "pdfminer.layout",
    "docx",
]
hidden += collect_submodules("pdfminer")

a = Analysis(
    ["spellbook_sidecar.py"],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["pytest", "ruff"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="spellbook-sidecar",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
```

- [ ] **Step 6: Implement `services/ml/build_sidecar.py`**

```python
#!/usr/bin/env python3
"""Freeze spellbook_sidecar.py and place a target-triple-suffixed binary for Tauri."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent
REPO_ROOT = ML_DIR.parent.parent
BINARIES_DIR = REPO_ROOT / "apps" / "desktop" / "src-tauri" / "binaries"
ALLOWED_HOST_TUPLES = {
    "x86_64-pc-windows-msvc",
    "x86_64-unknown-linux-gnu",
}


def host_tuple_from_rustc_output(raw: str) -> str:
    stripped = raw.strip()
    if not stripped:
        raise SystemExit("rustc host triple was empty")
    if "\n" not in stripped and "host:" not in stripped:
        return stripped
    for line in stripped.splitlines():
        if line.startswith("host:"):
            return line.split(":", 1)[1].strip()
    raise SystemExit(f"could not parse rustc host from: {raw!r}")


def host_tuple() -> str:
    printed = subprocess.run(
        ["rustc", "--print", "host-tuple"],
        check=False,
        capture_output=True,
        text=True,
    )
    if printed.returncode == 0 and printed.stdout.strip():
        triple = host_tuple_from_rustc_output(printed.stdout)
    else:
        verbose = subprocess.run(
            ["rustc", "-vV"],
            check=False,
            capture_output=True,
            text=True,
        )
        if verbose.returncode != 0:
            raise SystemExit(verbose.stderr or "rustc -vV failed")
        triple = host_tuple_from_rustc_output(verbose.stdout)
    if triple not in ALLOWED_HOST_TUPLES:
        raise SystemExit(f"unsupported host triple for v1 installers: {triple}")
    return triple


def binary_filename(tuple_name: str, windows: bool) -> str:
    suffix = ".exe" if windows else ""
    return f"spellbook-sidecar-{tuple_name}{suffix}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-pyinstaller", action="store_true")
    args = parser.parse_args()
    BINARIES_DIR.mkdir(parents=True, exist_ok=True)
    windows = sys.platform == "win32"
    dest = BINARIES_DIR / binary_filename(host_tuple(), windows)
    if not args.skip_pyinstaller:
        spec = ML_DIR / "spellbook_sidecar.spec"
        completed = subprocess.run(
            [sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", str(spec)],
            cwd=ML_DIR,
            check=False,
        )
        if completed.returncode != 0:
            return completed.returncode
        built_name = "spellbook-sidecar.exe" if windows else "spellbook-sidecar"
        built = ML_DIR / "dist" / built_name
        if not built.is_file():
            raise SystemExit(f"PyInstaller did not produce {built}")
        shutil.copy2(built, dest)
    if not dest.is_file():
        raise SystemExit(f"Missing sidecar binary: {dest}")
    print(dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Root `.gitignore` already ignores `dist/` and `build/`, which covers `services/ml/dist` and `services/ml/build`.

- [ ] **Step 7: Run unit tests, then freeze once**

```powershell
.\.venv\Scripts\python -m pytest services\ml\tests\test_build_sidecar.py -v
```

Expected: PASS.

```powershell
.\.venv\Scripts\python services\ml\build_sidecar.py
```

Expected: prints a path like `apps\desktop\src-tauri\binaries\spellbook-sidecar-x86_64-pc-windows-msvc.exe` and the file exists.

Smoke the frozen binary with the same JSON-RPC protocol as `spellbook_sidecar.py` (one line in, one line out). From `services/ml` with a tiny markdown fixture is enough in Task group 4; for this task, run:

```powershell
$bin = Get-ChildItem apps\desktop\src-tauri\binaries\spellbook-sidecar-*.exe | Select-Object -First 1
'{"jsonrpc":"2.0","id":1,"method":"import","params":{"files":[]}}' | & $bin.FullName
```

Expected: JSON with `"result"` (empty import is valid) or a structured `"error"` — **not** a Python traceback about missing `pdfminer`.

- [ ] **Step 8: Extend CI script tests**

Do not add a second pytest path in `ci.yml` for this file; `pytest` under `services/ml` already picks up `tests/test_build_sidecar.py`. Keep the existing `scripts/test_provision_sqlite_vec.py` CI step from Task group 1.

- [ ] **Step 9: Mark OpenSpec 2.2 complete**

From:

```markdown
- [ ] 2.2 Add PyInstaller spec and build script under `services/ml/` producing `spellbook-sidecar-{target-triple}` with Python 3.14
```

To:

```markdown
- [x] 2.2 Add PyInstaller spec and build script under `services/ml/` producing `spellbook-sidecar-{target-triple}` with Python 3.14
```

- [ ] **Step 10: Commit**

```bash
git add services/ml/requirements-dev.txt services/ml/spellbook_sidecar.spec services/ml/build_sidecar.py services/ml/tests/test_build_sidecar.py services/ml/SIDECAR_FREEZE.md openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
build(sidecar): freeze spellbook-sidecar with PyInstaller for Tauri

Produce a target-triple-named externalBin so release installs do not need system Python.
EOF
)"
```

---

### Task 3: Register `externalBin` on the release overlay (OpenSpec 2.3)

**Files:**
- Create: `apps/desktop/src-tauri/tauri.release.conf.json`
- Create: `apps/desktop/src-tauri/binaries/.gitkeep`
- Modify: `.gitignore`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (2.3 only)

**Interfaces:**
- Consumes: freeze output path convention from Task 2
- Produces: overlay `{ "bundle": { "externalBin": ["binaries/spellbook-sidecar"] } }`. Main `tauri.conf.json` must **not** list `externalBin`.

Grill lock: `pnpm tauri:dev` must start with no `binaries/spellbook-sidecar-*` files. If the CLI errors that the sidecar is missing, you merged `externalBin` into the wrong config.

- [ ] **Step 1: Ignore generated binaries, keep the directory**

Create `apps/desktop/src-tauri/binaries/.gitkeep`.

Append to `.gitignore`:

```
apps/desktop/src-tauri/binaries/spellbook-sidecar-*
!apps/desktop/src-tauri/binaries/.gitkeep
```

- [ ] **Step 2: Add the release overlay**

Create `apps/desktop/src-tauri/tauri.release.conf.json`:

```json
{
  "bundle": {
    "externalBin": ["binaries/spellbook-sidecar"]
  }
}
```

Do not add `externalBin` to `tauri.conf.json`. Do not set `bundle.targets` in this plan (Task group 3).

- [ ] **Step 3: Confirm `tauri dev` still boots without a freeze**

From `apps/desktop`, with **no** `src-tauri/binaries/spellbook-sidecar-*` present, run `pnpm tauri:dev` until the window appears, then stop. If it fails on a missing sidecar, fix the overlay split — do not freeze for every developer.

- [ ] **Step 4: Mark OpenSpec 2.3 complete**

The overlay is how release builds satisfy `bundle.externalBin`. Flip 2.3 after the overlay exists and `tauri:dev` works without the binary.

From:

```markdown
- [ ] 2.3 Register sidecar in `tauri.conf.json` `bundle.externalBin` under `src-tauri/binaries/`
```

To:

```markdown
- [x] 2.3 Register sidecar in `tauri.conf.json` `bundle.externalBin` under `src-tauri/binaries/`
```

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/tauri.release.conf.json apps/desktop/src-tauri/binaries/.gitkeep .gitignore openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
chore(tauri): register spellbook-sidecar externalBin on the release overlay

Keep tauri dev free of PyInstaller while installer builds still embed the sidecar.
EOF
)"
```
