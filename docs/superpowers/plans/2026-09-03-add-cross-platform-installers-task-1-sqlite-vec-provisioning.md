# Cross-Platform Installers Task 1 sqlite-vec Provisioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete OpenSpec task group 1 for `add-cross-platform-installers` by adding a shared pre-build script that downloads sqlite-vec `0.1.6` `vec0` into `apps/desktop/src-tauri/resources/sqlite-vec/` and fails when that directory has no library, then wiring it into the local Windows installer path.

**Architecture:** Keep vault-side `scripts/install_sqlite_vec.sh` unchanged (it still seeds `%APPDATA%/SpellbookVault`). Add a separate Python 3.14 stdlib script that stages the same GitHub release asset into Tauri `bundle.resources`. Runtime copy from `{resource_dir}/sqlite-vec/vec0.*` into SpellbookVault already exists in `pool.rs::install_sqlite_vec_if_needed`.

**Tech Stack:** Python 3.14 stdlib (`urllib`, `tarfile`, `argparse`), pytest, PowerShell installer helper, sqlite-vec GitHub loadable releases `v0.1.6`.

**OpenSpec change:** `add-cross-platform-installers`  
**Task group:** 1 — `openspec/changes/add-cross-platform-installers/tasks.md` §1  
**Depends on:** none  
**Unblocks:** Task groups 2–6  
**Sibling plans:**
- Next: `docs/superpowers/plans/2026-09-03-add-cross-platform-installers-task-2a-sidecar-freeze.md`

---

## Global Constraints

- sqlite-vec version is **`0.1.6`**, matching `apps/desktop/src-tauri/Cargo.toml` and `scripts/install_sqlite_vec.sh`.
- Asset URL pattern (unchanged from `install_sqlite_vec.sh`): `https://github.com/asg017/sqlite-vec/releases/download/v{VERSION}/sqlite-vec-{VERSION}-loadable-{platform}-{arch}.tar.gz` where platform is `windows` | `linux` | `macos` and arch is `x86_64` | `aarch64`.
- Library filenames: Windows `vec0.dll`, Linux `vec0.so`, macOS `vec0.dylib`.
- Do not add PyPI packages in this plan (stdlib + existing pytest only).
- Do not mark other task groups in `tasks.md`.
- Do not rewrite delta specs under `openspec/changes/add-cross-platform-installers/specs/`.
- Archiving the OpenSpec change is out of scope until groups 1–6 are `[x]`.
- v1 is a **full** build with default `llm` features; do not introduce a lite installer.

## Spec coverage map

| OpenSpec item | Plan task | Completion signal |
| ------------- | --------- | ----------------- |
| 1.1 Add script to download platform `vec0` into `src-tauri/resources/sqlite-vec/`; fail if empty | Task 1 | pytest green; empty dest exits non-zero; checkbox `[x]` |
| 1.2 Wire sqlite-vec script into release build pipeline (before `tauri build`) | Task 2 | `build_windows_installer.ps1` + orchestrator invoke the script; checkbox `[x]` |

## Planned file structure

| File | Action |
| ---- | ------ |
| `scripts/provision_sqlite_vec.py` | Create: download + empty-dir fail |
| `scripts/prepare_release_bundle.py` | Create: orchestrator (sqlite-vec only in this plan) |
| `scripts/test_provision_sqlite_vec.py` | Create: unit tests, no network |
| `apps/desktop/src-tauri/resources/sqlite-vec/.gitkeep` | Create |
| `.gitignore` | Modify: ignore downloaded `vec0.*` in resources |
| `scripts/build_windows_installer.ps1` | Modify: run orchestrator before `tauri build` |
| `.github/workflows/ci.yml` | Modify: run script unit tests (still no `tauri build`) |
| `openspec/changes/add-cross-platform-installers/tasks.md` | Flip 1.1 then 1.2 |

---

### Task 1: sqlite-vec resource provisioner (OpenSpec 1.1)

**Files:**
- Create: `scripts/provision_sqlite_vec.py`
- Create: `scripts/test_provision_sqlite_vec.py`
- Create: `apps/desktop/src-tauri/resources/sqlite-vec/.gitkeep`
- Modify: `.gitignore`
- Modify: `.github/workflows/ci.yml`
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (1.1 only)

**Interfaces:**
- Consumes: none
- Produces: `provision_sqlite_vec.asset_name(version: str, platform: str, arch: str) -> str`, `provision_sqlite_vec.download_url(...) -> str`, `provision_sqlite_vec.library_name(platform: str) -> str`, `provision_sqlite_vec.ensure_populated(dest: Path) -> Path` (raises `SystemExit` / returns after writing `vec0.*`), CLI `python scripts/provision_sqlite_vec.py --dest <dir>`

- [ ] **Step 1: Write the failing tests**

Create `scripts/test_provision_sqlite_vec.py`:

```python
from pathlib import Path

import pytest

from provision_sqlite_vec import (
    SQLITE_VEC_VERSION,
    asset_name,
    download_url,
    ensure_populated,
    library_name,
)


def test_version_matches_cargo_pin() -> None:
    assert SQLITE_VEC_VERSION == "0.1.6"


def test_windows_x64_url() -> None:
    name = asset_name("0.1.6", "windows", "x86_64")
    assert name == "sqlite-vec-0.1.6-loadable-windows-x86_64.tar.gz"
    assert download_url("0.1.6", "windows", "x86_64") == (
        "https://github.com/asg017/sqlite-vec/releases/download/v0.1.6/"
        "sqlite-vec-0.1.6-loadable-windows-x86_64.tar.gz"
    )
    assert library_name("windows") == "vec0.dll"


def test_linux_x64_url() -> None:
    assert asset_name("0.1.6", "linux", "x86_64") == (
        "sqlite-vec-0.1.6-loadable-linux-x86_64.tar.gz"
    )
    assert library_name("linux") == "vec0.so"


def test_ensure_populated_fails_when_empty(tmp_path: Path) -> None:
    dest = tmp_path / "sqlite-vec"
    dest.mkdir()
    with pytest.raises(SystemExit) as exc:
        ensure_populated(dest)
    assert exc.value.code != 0


def test_ensure_populated_ok_when_library_present(tmp_path: Path) -> None:
    dest = tmp_path / "sqlite-vec"
    dest.mkdir()
    (dest / "vec0.dll").write_bytes(b"fake")
    assert ensure_populated(dest) == dest / "vec0.dll"
```

- [ ] **Step 2: Run tests to verify they fail**

From repository root, with the existing venv that already has pytest:

```bash
python -m pytest scripts/test_provision_sqlite_vec.py -v
```

On Windows with repo-root `.venv`:

```powershell
.\.venv\Scripts\python -m pytest scripts\test_provision_sqlite_vec.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'provision_sqlite_vec'` (or file not found).

- [ ] **Step 3: Write the provisioner**

Create `scripts/provision_sqlite_vec.py` (stdlib only). Put the test import path next to the script by running pytest with `scripts/` as cwd, **or** add `sys.path` in the test file:

In `scripts/test_provision_sqlite_vec.py` first lines:

```python
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
```

`scripts/provision_sqlite_vec.py`:

```python
#!/usr/bin/env python3
"""Download sqlite-vec loadable library into Tauri bundle resources."""

from __future__ import annotations

import argparse
import os
import platform
import sys
import tarfile
import tempfile
import urllib.request
from pathlib import Path

SQLITE_VEC_VERSION = "0.1.6"
RELEASE_BASE = "https://github.com/asg017/sqlite-vec/releases/download"


def library_name(os_platform: str) -> str:
    return {
        "windows": "vec0.dll",
        "linux": "vec0.so",
        "macos": "vec0.dylib",
    }[os_platform]


def asset_name(version: str, os_platform: str, arch: str) -> str:
    return f"sqlite-vec-{version}-loadable-{os_platform}-{arch}.tar.gz"


def download_url(version: str, os_platform: str, arch: str) -> str:
    return f"{RELEASE_BASE}/v{version}/{asset_name(version, os_platform, arch)}"


def detect_platform() -> str:
    system = platform.system()
    if system == "Windows":
        return "windows"
    if system == "Linux":
        return "linux"
    if system == "Darwin":
        return "macos"
    raise SystemExit(f"Unsupported OS: {system}")


def detect_arch() -> str:
    machine = platform.machine().lower()
    if machine in {"x86_64", "amd64"}:
        return "x86_64"
    if machine in {"arm64", "aarch64"}:
        return "aarch64"
    raise SystemExit(f"Unsupported architecture: {platform.machine()}")


def _library_candidates(dest: Path) -> list[Path]:
    return [dest / name for name in ("vec0.dll", "vec0.so", "vec0.dylib")]


def ensure_populated(dest: Path) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    existing = [path for path in _library_candidates(dest) if path.is_file() and path.stat().st_size > 0]
    if not existing:
        raise SystemExit(f"sqlite-vec resource directory is empty: {dest}")
    return existing[0]


def stage_library(dest: Path, version: str, os_platform: str, arch: str) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    url = download_url(version, os_platform, arch)
    lib = library_name(os_platform)
    with tempfile.TemporaryDirectory() as tmp:
        archive_path = Path(tmp) / asset_name(version, os_platform, arch)
        urllib.request.urlretrieve(url, archive_path)
        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(path=tmp, filter="data")
        extracted = Path(tmp) / lib
        if not extracted.is_file():
            raise SystemExit(f"Expected {lib} in archive from {url}")
        target = dest / lib
        target.write_bytes(extracted.read_bytes())
        if os_platform != "windows":
            os.chmod(target, 0o755)
    return ensure_populated(dest)


def default_dest() -> Path:
    repo_root = Path(__file__).resolve().parent.parent
    return repo_root / "apps/desktop/src-tauri/resources/sqlite-vec"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dest", type=Path, default=default_dest())
    parser.add_argument("--version", default=SQLITE_VEC_VERSION)
    parser.add_argument("--skip-download", action="store_true")
    args = parser.parse_args(argv)
    if not args.skip_download:
        stage_library(args.dest, args.version, detect_platform(), detect_arch())
    else:
        ensure_populated(args.dest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

If the local Python is older than 3.12, drop `filter="data"` from `extractall`. CI and the spec use Python **3.14**, so keep the filter.

- [ ] **Step 4: Create the resources placeholder and gitignore**

Create empty `apps/desktop/src-tauri/resources/sqlite-vec/.gitkeep`.

Append to `.gitignore`:

```
apps/desktop/src-tauri/resources/sqlite-vec/vec0.dll
apps/desktop/src-tauri/resources/sqlite-vec/vec0.so
apps/desktop/src-tauri/resources/sqlite-vec/vec0.dylib
```

- [ ] **Step 5: Add script tests to PR CI without bundling**

In `.github/workflows/ci.yml`, after the existing Python unit tests step, add:

```yaml
      - name: Unit tests (release scripts)
        run: services/ml/.venv/bin/python -m pytest scripts/test_provision_sqlite_vec.py
```

Do **not** add `tauri build` to `ci.yml`.

- [ ] **Step 6: Run tests to verify they pass**

```powershell
.\.venv\Scripts\python -m pytest scripts\test_provision_sqlite_vec.py -v
```

Expected: PASS (5 tests). Then, with network, from repo root:

```powershell
.\.venv\Scripts\python scripts\provision_sqlite_vec.py
```

Expected: stdout/stderr silent or download progress; `apps/desktop/src-tauri/resources/sqlite-vec/vec0.dll` exists on Windows (or `vec0.so` on Linux). Then:

```powershell
.\.venv\Scripts\python scripts\provision_sqlite_vec.py --skip-download
echo $LASTEXITCODE
```

Expected: `0`. Empty-dir check:

```powershell
New-Item -ItemType Directory -Force tmp-empty-vec | Out-Null
.\.venv\Scripts\python scripts\provision_sqlite_vec.py --dest tmp-empty-vec --skip-download
```

Expected: non-zero exit and message `sqlite-vec resource directory is empty`.

- [ ] **Step 7: Mark OpenSpec 1.1 complete**

In `openspec/changes/add-cross-platform-installers/tasks.md`, change only:

From:

```markdown
- [ ] 1.1 Add script to download platform `vec0` library (sqlite-vec v0.1.6) into `src-tauri/resources/sqlite-vec/`; fail if empty
```

To:

```markdown
- [x] 1.1 Add script to download platform `vec0` library (sqlite-vec v0.1.6) into `src-tauri/resources/sqlite-vec/`; fail if empty
```

Leave 1.2 unchecked.

- [ ] **Step 8: Commit**

```bash
git add scripts/provision_sqlite_vec.py scripts/test_provision_sqlite_vec.py apps/desktop/src-tauri/resources/sqlite-vec/.gitkeep .gitignore .github/workflows/ci.yml openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
feat(packaging): stage sqlite-vec vec0 into Tauri resources

Release bundles need the loadable extension in bundle.resources so clean installs can copy it into SpellbookVault.
EOF
)"
```

---

### Task 2: Wire provisioner before local `tauri build` (OpenSpec 1.2)

**Files:**
- Create: `scripts/prepare_release_bundle.py`
- Modify: `scripts/build_windows_installer.ps1` (insert before the `pnpm exec tauri build` invocation around lines 250–256)
- Modify: `openspec/changes/add-cross-platform-installers/tasks.md` (1.2 only)

**Interfaces:**
- Consumes: `scripts/provision_sqlite_vec.py` CLI (`--dest` optional)
- Produces: `scripts/prepare_release_bundle.py` with `main()` that currently only provisions sqlite-vec; later Task 2b adds sidecar freeze here. Exit non-zero if provisioner fails.

- [ ] **Step 1: Write the orchestrator**

Create `scripts/prepare_release_bundle.py`:

```python
#!/usr/bin/env python3
"""Pre-build steps shared by local release builds and the release workflow."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def run_provision_sqlite_vec() -> None:
    script = REPO_ROOT / "scripts" / "provision_sqlite_vec.py"
    completed = subprocess.run([sys.executable, str(script)], check=False)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--skip-sidecar",
        action="store_true",
        help="Reserved: sidecar freeze is added in task group 2.",
    )
    parser.parse_args()
    run_provision_sqlite_vec()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

Keep `--skip-sidecar` as a no-op so Task 2b can implement it without renaming flags.

- [ ] **Step 2: Call the orchestrator from the Windows installer helper**

In `scripts/build_windows_installer.ps1`, inside the `Push-Location` `try` block, **after** optional `pnpm install` and **before** `$tauriArgs`:

```powershell
    $prepareScript = Join-Path $repoRoot 'scripts\prepare_release_bundle.py'
    Write-Verbose "Running: $prepareScript"
    & python $prepareScript
    if ($LASTEXITCODE -ne 0) {
        throw "prepare_release_bundle.py failed with exit code $LASTEXITCODE"
    }
```

`$repoRoot` is already computed earlier in that script via `Get-RepoRoot`. Prefer `python` on PATH (CI and local both install 3.14). If the machine only has the repo venv, document in the next docs plan; for this task, resolve python as:

```powershell
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) {
        $venvPython = Join-Path $repoRoot '.venv\Scripts\python.exe'
        if (Test-Path -LiteralPath $venvPython) {
            $pythonPath = $venvPython
        } else {
            throw 'python is not available on PATH and .venv\\Scripts\\python.exe was not found.'
        }
    } else {
        $pythonPath = $python.Source
    }
    & $pythonPath $prepareScript
```

- [ ] **Step 3: Smoke the wiring without a full Tauri compile (optional fast path)**

```powershell
.\.venv\Scripts\python scripts\prepare_release_bundle.py
```

Expected: download or reuse `vec0.dll` / `vec0.so`; exit 0.

Do not require a full NSIS compile in this plan (that is Task group 4).

- [ ] **Step 4: Mark OpenSpec 1.2 complete**

From:

```markdown
- [ ] 1.2 Wire sqlite-vec script into release build pipeline (before `tauri build`)
```

To:

```markdown
- [x] 1.2 Wire sqlite-vec script into release build pipeline (before `tauri build`)
```

- [ ] **Step 5: Commit**

```bash
git add scripts/prepare_release_bundle.py scripts/build_windows_installer.ps1 openspec/changes/add-cross-platform-installers/tasks.md
git commit -m "$(cat <<'EOF'
feat(packaging): run sqlite-vec staging before local NSIS builds

Keep bundle.resources populated so installer builds fail closed when vec0 is missing.
EOF
)"
```
