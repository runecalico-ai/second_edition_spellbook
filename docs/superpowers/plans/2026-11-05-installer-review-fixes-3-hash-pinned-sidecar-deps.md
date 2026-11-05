# Installer Review Fixes, Part 3: Hash-Pinned Sidecar Build Dependencies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The frozen sidecar that ships in the installers is built only from exact, hash-verified Python packages, and the freeze script never installs packages by itself.

**Architecture:** `services/ml/requirements-release.in` lists every package the freeze needs (runtime and PyInstaller, including transitive packages), each pinned with `==`. A stdlib-only generator, `services/ml/release_requirements.py`, reads the SHA-256 of every file PyPI publishes for each pin and writes `services/ml/requirements-release.lock`. One lock therefore covers both Windows and Linux. The release workflow and local release setup install with `pip install --require-hashes --only-binary=:all: -r services/ml/requirements-release.lock`. `build_sidecar.py` drops its automatic `pip install` and refuses to freeze unless the installed versions match the lock. Dev and CI test environments keep `requirements.txt` and `requirements-dev.txt`.

**Tech Stack:** Python 3.14 (stdlib `urllib`, `json`, `importlib.metadata`), `packaging` (already installed as a PyInstaller dependency), pip `--require-hashes`, pytest, Ruff 0.6.9, GitHub Actions.

**Series:** Code review of `add-cross-platform-installers` on 2026-11-04. This plan fixes finding 3. Part 1 fixes 1, Part 2 fixes 2 and 5, Part 4 fixes 4, Part 5 fixes 6 and 7. The parts are independent.

## Global Constraints

- Base: branch `add-cross-platform-installers` at `aaeea8b` or later. Do not push.
- **Dependency approval gate.** `docs/DEPENDENCY_SECURITY.md` requires explicit human approval before any manifest or lockfile change. Task 2 Step 1 is a hard stop: do not create `requirements-release.in` or `requirements-release.lock` until a human approves the exact pin list. Task 1 changes no manifest and needs no approval.
- No version upgrades. The pins equal what the repository-root `.venv` ran on 2026-11-05 (`pip freeze`), which built the verified 0.1.0 installers. Tightening a constraint is allowed; loosening one is not.
- PyPI only. No direct URLs, no git dependencies, no alternate indexes.
- Do not change `services/ml/requirements.txt` or `services/ml/requirements-dev.txt`. CI test jobs keep installing them.
- Python runs inside a venv. From the repository root use `.\.venv\Scripts\python.exe` (Windows) or `.venv/bin/python` (Linux). Ruff runs from `services/ml` as `uvx ruff@0.6.9 …` (CI pins `ruff==0.6.9`; the root `.venv` does not have Ruff). Ruff defaults apply (line length 88).
- Pre-existing on `aaeea8b`: `uvx ruff@0.6.9 format --check .` in `services/ml` already fails for `tests/test_build_sidecar.py` and `tests/test_sidecar.py` (verified 2026-11-05). Run `format --check` only on the files each task names. Task 3 formats `tests/test_build_sidecar.py` because it edits that file. `tests/test_sidecar.py` is out of scope.
- Scratch files and venvs go under `.tmp\` at the repository root. `.tmp/` is not gitignored: stage files only by the explicit paths in each commit step, and delete scratch files where the steps say.
- PowerShell does not support bash heredocs. Use `git commit -m "<subject>" -m "<body>"`.
- `.gitattributes` sets `eol=lf`. Write generated files with `newline="\n"`.
- Write a code comment only for a constraint the code cannot show.

## Root cause (verified 2026-11-05 on `aaeea8b`)

- `services/ml/requirements.txt` is `pdfminer.six>=20231228`, `python-docx>=1.1.0`, `pytest>=8.3.4`. `.github/workflows/release.yml` installs it (plus `requirements-dev.txt`) on every tag build and freezes the result into the shipped sidecar. Each release can therefore pick up a different upstream release with no review and no hash check.
- `services/ml/build_sidecar.py` `ensure_runtime_packages` runs `pip install pdfminer.six>=20231228 python-docx>=1.1.0` into whatever interpreter runs the freeze when the imports are missing.
- Transitive packages (`lxml`, `cryptography`, `cffi`, …) are not pinned anywhere (`services/ml/SIDECAR_FREEZE.md`, "Transitive wheels … are pulled by pip at freeze time").

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `services/ml/release_requirements.py` | `Pin`, `parse_pins`, `release_sha256s`, `render_lock`, `main` (lock generator) | 1 |
| `services/ml/tests/test_release_requirements.py` | Generator unit tests (Task 1); lock-consistency tests against the real files (Task 2) | 1, 2 |
| `services/ml/requirements-release.in` | Approved `==` pins for the freeze environment | 2 |
| `services/ml/requirements-release.lock` | Generated, hash-pinned install file | 2 |
| `services/ml/SIDECAR_FREEZE.md` | Pinning rule and provenance for every pinned package | 2 |
| `services/ml/build_sidecar.py` | `lock_mismatches`, `require_locked_versions`; no automatic install | 3 |
| `services/ml/tests/test_build_sidecar.py` | Tests for the lock check; remove install tests | 3 |
| `.github/workflows/release.yml` | Install the freeze environment from the lock | 3 |
| `docs/DEVELOPMENT.md` | Release-build Python setup uses the lock | 3 |

Task 2 needs Task 1. Task 3 needs Task 2.

---

### Task 1: Lock generator

**Files:**
- Create: `services/ml/release_requirements.py`
- Create: `services/ml/tests/test_release_requirements.py`

**Interfaces:**
- Consumes: PyPI JSON API `https://pypi.org/pypi/{name}/{version}/json` (the `urls` list; each file has `digests.sha256` and `yanked`).
- Produces (module `release_requirements`, importable as a top-level module from `services/ml`):
  - `ML_DIR: Path`, `INPUT_PATH: Path` (`requirements-release.in`), `LOCK_PATH: Path` (`requirements-release.lock`), `LOCK_HEADER: str`
  - `@dataclass(frozen=True) class Pin: name: str; version: str; marker: str = ""` with `requirement() -> str`
  - `parse_pins(text: str) -> list[Pin]`. Reads both `.in` and `.lock` text; rejects any line not pinned with `==`.
  - `release_sha256s(pin: Pin, fetch: Callable[[str], bytes] | None = None) -> list[str]`. Sorted digests; rejects yanked releases and releases with no files.
  - `render_lock(pins: list[Pin], hashes: dict[Pin, list[str]]) -> str`
  - `main(argv: list[str] | None = None) -> int`, with `--input` and `--output` options.

- [ ] **Step 1: Write the failing tests**

Create `services/ml/tests/test_release_requirements.py`:

```python
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

import release_requirements
from release_requirements import (
    LOCK_HEADER,
    Pin,
    main,
    parse_pins,
    release_sha256s,
    render_lock,
)


@pytest.fixture(autouse=True)
def _block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def blocked(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("unexpected network call")

    monkeypatch.setattr(urllib.request, "urlopen", blocked)


def _release_json(*digests: str, yanked: bool = False) -> bytes:
    files = [{"digests": {"sha256": d}, "yanked": yanked} for d in digests]
    return json.dumps({"urls": files}).encode()


def test_parse_pins_reads_pins_markers_and_skips_comments() -> None:
    text = (
        "# comment\n"
        "\n"
        "altgraph==0.17.5\n"
        'pefile==2024.8.26 ; sys_platform == "win32"\n'
    )
    assert parse_pins(text) == [
        Pin("altgraph", "0.17.5"),
        Pin("pefile", "2024.8.26", 'sys_platform == "win32"'),
    ]


@pytest.mark.parametrize("line", ["lxml>=6.0", "lxml", "==6.1.3"])
def test_parse_pins_rejects_unpinned_lines(line: str) -> None:
    with pytest.raises(SystemExit, match="pinned with =="):
        parse_pins(line + "\n")


def test_release_sha256s_returns_every_published_file_sorted() -> None:
    seen: list[str] = []

    def fetch(url: str) -> bytes:
        seen.append(url)
        return _release_json("b" * 64, "a" * 64)

    assert release_sha256s(Pin("lxml", "6.1.3"), fetch) == ["a" * 64, "b" * 64]
    assert seen == ["https://pypi.org/pypi/lxml/6.1.3/json"]


def test_release_sha256s_rejects_yanked_release() -> None:
    with pytest.raises(SystemExit, match="yanked"):
        release_sha256s(
            Pin("lxml", "6.1.3"), lambda _url: _release_json("a" * 64, yanked=True)
        )


def test_release_sha256s_rejects_release_without_files() -> None:
    with pytest.raises(SystemExit, match="no files"):
        release_sha256s(Pin("lxml", "6.1.3"), lambda _url: _release_json())


def test_render_lock_writes_one_hashed_entry_per_pin_sorted_by_name() -> None:
    pefile = Pin("pefile", "2024.8.26", 'sys_platform == "win32"')
    altgraph = Pin("altgraph", "0.17.5")
    text = render_lock(
        [pefile, altgraph], {pefile: ["b" * 64], altgraph: ["a" * 64, "c" * 64]}
    )
    assert text == (
        LOCK_HEADER
        + "altgraph==0.17.5 \\\n"
        + f"    --hash=sha256:{'a' * 64} \\\n"
        + f"    --hash=sha256:{'c' * 64}\n"
        + 'pefile==2024.8.26 ; sys_platform == "win32" \\\n'
        + f"    --hash=sha256:{'b' * 64}\n"
    )


def test_parse_pins_reads_back_a_rendered_lock() -> None:
    pins = [Pin("altgraph", "0.17.5"), Pin("pefile", "2024.8.26", 'os_name == "nt"')]
    text = render_lock(pins, {pins[0]: ["a" * 64], pins[1]: ["b" * 64]})
    assert parse_pins(text) == pins


def test_main_writes_lf_lock_for_input_pins(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = tmp_path / "requirements-release.in"
    source.write_text("lxml==6.1.3\naltgraph==0.17.5\n", encoding="utf-8")
    output = tmp_path / "requirements-release.lock"
    monkeypatch.setattr(
        release_requirements, "_fetch_url", lambda _url: _release_json("d" * 64)
    )

    assert main(["--input", str(source), "--output", str(output)]) == 0

    raw = output.read_bytes()
    assert b"\r" not in raw
    assert set(parse_pins(raw.decode("utf-8"))) == set(
        parse_pins(source.read_text(encoding="utf-8"))
    )
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from the repository root): `.\.venv\Scripts\python -m pytest services/ml/tests/test_release_requirements.py -v`
Expected: collection error, `ModuleNotFoundError: No module named 'release_requirements'`.

- [ ] **Step 3: Implement the generator**

Create `services/ml/release_requirements.py`:

```python
#!/usr/bin/env python3
"""Hash-pinned requirements for release sidecar builds.

`requirements-release.in` pins every package the sidecar freeze installs with
`==`. `main()` writes `requirements-release.lock` with the SHA-256 of every file
PyPI publishes for each pin, so one lock serves Windows and Linux builds.
"""

from __future__ import annotations

import argparse
import json
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent
INPUT_PATH = ML_DIR / "requirements-release.in"
LOCK_PATH = ML_DIR / "requirements-release.lock"
PYPI_JSON = "https://pypi.org/pypi/{name}/{version}/json"
LOCK_HEADER = (
    "# Generated by services/ml/release_requirements.py from "
    "requirements-release.in. Do not edit.\n"
    "# Install: python -m pip install --require-hashes --only-binary=:all: "
    "-r services/ml/requirements-release.lock\n"
)


@dataclass(frozen=True)
class Pin:
    name: str
    version: str
    marker: str = ""

    def requirement(self) -> str:
        pinned = f"{self.name}=={self.version}"
        return f"{pinned} ; {self.marker}" if self.marker else pinned


def parse_pins(text: str) -> list[Pin]:
    pins: list[Pin] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith(("#", "--hash")):
            continue
        spec, _, marker = line.removesuffix("\\").strip().partition(";")
        name, sep, version = spec.strip().partition("==")
        if not sep or not name.strip() or not version.strip():
            raise SystemExit(f"release requirement must be pinned with ==: {raw!r}")
        pins.append(Pin(name.strip(), version.strip(), marker.strip()))
    return pins


def _fetch_url(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def release_sha256s(pin: Pin, fetch: Callable[[str], bytes] | None = None) -> list[str]:
    url = PYPI_JSON.format(name=pin.name, version=pin.version)
    files = json.loads((fetch or _fetch_url)(url)).get("urls", [])
    if not files:
        raise SystemExit(f"PyPI lists no files for {pin.name}=={pin.version}")
    if any(file.get("yanked") for file in files):
        raise SystemExit(f"{pin.name}=={pin.version} is yanked on PyPI")
    return sorted(file["digests"]["sha256"] for file in files)


def render_lock(pins: list[Pin], hashes: dict[Pin, list[str]]) -> str:
    entries = [LOCK_HEADER]
    for pin in sorted(pins, key=lambda p: p.name.lower()):
        lines = [pin.requirement(), *(f"--hash=sha256:{d}" for d in hashes[pin])]
        entries.append(" \\\n    ".join(lines) + "\n")
    return "".join(entries)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=INPUT_PATH)
    parser.add_argument("--output", type=Path, default=LOCK_PATH)
    args = parser.parse_args(argv)
    pins = parse_pins(args.input.read_text(encoding="utf-8"))
    hashes = {pin: release_sha256s(pin) for pin in pins}
    args.output.write_text(render_lock(pins, hashes), encoding="utf-8", newline="\n")
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

`release_sha256s` looks up `_fetch_url` at call time on purpose: the `main` test replaces it with `monkeypatch`.

- [ ] **Step 4: Run the tests and Ruff**

Run: `.\.venv\Scripts\python -m pytest services/ml/tests/test_release_requirements.py -v`
Expected: 10 passed.

Run (from `services/ml`): `uvx ruff@0.6.9 check .` and `uvx ruff@0.6.9 format --check release_requirements.py tests/test_release_requirements.py`
Expected: both pass. These code blocks were run through pytest and Ruff 0.6.9 on 2026-11-05 (10 passed, lint and format clean).

- [ ] **Step 5: Commit**

```powershell
git add services/ml/release_requirements.py services/ml/tests/test_release_requirements.py
git commit -m "build(sidecar): add hash-pinned release lock generator" -m "Writes requirements-release.lock with the SHA-256 of every PyPI file per pin; stdlib only."
```

---

### Task 2: Approved pins and the generated lock

**Files:**
- Create: `services/ml/requirements-release.in`
- Create: `services/ml/requirements-release.lock` (generated)
- Modify: `services/ml/tests/test_release_requirements.py` (lock-consistency tests)
- Modify: `services/ml/SIDECAR_FREEZE.md`

**Interfaces:**
- Consumes: `parse_pins`, `main`, `INPUT_PATH`, `LOCK_PATH`, `ML_DIR`, `Pin` from Task 1.
- Produces: `services/ml/requirements-release.lock`. Task 3 installs it and `build_sidecar.py` reads it.

- [ ] **Step 1: STOP. Get approval for the pin list**

Do not create any file in this task until a human approves. Present this table (versions are from the root `.venv` `pip freeze` on 2026-11-05). Before you present it, open each PyPI page. Confirm the project links to the listed upstream repository and the maintainer and release history look normal (`docs/DEPENDENCY_SECURITY.md`, "Mandatory Provenance Check"). Report anything that does not match.

| Package | Pin | Needed by | PyPI | Upstream |
|---|---|---|---|---|
| `pdfminer.six` | `20260107` | sidecar PDF import | https://pypi.org/project/pdfminer.six/20260107/ | https://github.com/pdfminer/pdfminer.six |
| `charset-normalizer` | `3.5.1` | pdfminer.six | https://pypi.org/project/charset-normalizer/3.5.1/ | https://github.com/jawah/charset_normalizer |
| `cryptography` | `50.0.1` | pdfminer.six | https://pypi.org/project/cryptography/50.0.1/ | https://github.com/pyca/cryptography |
| `cffi` | `2.1.1` | cryptography | https://pypi.org/project/cffi/2.1.1/ | https://github.com/python-cffi/cffi |
| `pycparser` | `3.0` | cffi | https://pypi.org/project/pycparser/3.0/ | https://github.com/eliben/pycparser |
| `python-docx` | `1.2.0` | sidecar DOCX import | https://pypi.org/project/python-docx/1.2.0/ | https://github.com/python-openxml/python-docx |
| `lxml` | `6.1.3` | python-docx | https://pypi.org/project/lxml/6.1.3/ | https://github.com/lxml/lxml |
| `typing_extensions` | `4.16.0` | python-docx | https://pypi.org/project/typing-extensions/4.16.0/ | https://github.com/python/typing_extensions |
| `pyinstaller` | `6.22.2` | freeze (already approved 2026-09-03) | https://pypi.org/project/pyinstaller/6.22.2/ | https://github.com/pyinstaller/pyinstaller |
| `pyinstaller-hooks-contrib` | `2026.7` | pyinstaller | https://pypi.org/project/pyinstaller-hooks-contrib/2026.7/ | https://github.com/pyinstaller/pyinstaller-hooks-contrib |
| `altgraph` | `0.17.5` | pyinstaller | https://pypi.org/project/altgraph/0.17.5/ | https://github.com/ronaldoussoren/altgraph |
| `packaging` | `26.3` | pyinstaller | https://pypi.org/project/packaging/26.3/ | https://github.com/pypa/packaging |
| `setuptools` | `84.0.0` | pyinstaller | https://pypi.org/project/setuptools/84.0.0/ | https://github.com/pypa/setuptools |
| `pefile` | `2024.8.26` (Windows only) | pyinstaller | https://pypi.org/project/pefile/2024.8.26/ | https://github.com/erocarrera/pefile |
| `pywin32-ctypes` | `0.2.3` (Windows only) | pyinstaller | https://pypi.org/project/pywin32-ctypes/0.2.3/ | https://github.com/enthought/pywin32-ctypes |

Record the approver and date. Continue only after an explicit "approved".

- [ ] **Step 2: Create the pin list**

Create `services/ml/requirements-release.in`:

```text
# Every package the release sidecar freeze installs, pinned with ==.
# Change a line only after a docs/DEPENDENCY_SECURITY.md review, then run:
#   python services/ml/release_requirements.py
altgraph==0.17.5
cffi==2.1.1
charset-normalizer==3.5.1
cryptography==50.0.1
lxml==6.1.3
packaging==26.3
pdfminer.six==20260107
pefile==2024.8.26 ; sys_platform == "win32"
pycparser==3.0
pyinstaller==6.22.2
pyinstaller-hooks-contrib==2026.7
python-docx==1.2.0
pywin32-ctypes==0.2.3 ; sys_platform == "win32"
setuptools==84.0.0
typing_extensions==4.16.0
```

- [ ] **Step 3: Generate the lock**

Run (from the repository root, network required): `.\.venv\Scripts\python services/ml/release_requirements.py`
Expected: prints the path of `services/ml/requirements-release.lock`. The file has 15 entries, and each entry has at least one `--hash=sha256:` line. A `yanked` or `no files` error means a pin is wrong: stop and go back to Step 1.

- [ ] **Step 4: Prove the lock installs on Windows**

```powershell
py -3.14 -m venv .tmp\release-lock-check
.\.tmp\release-lock-check\Scripts\python -m pip install --require-hashes --only-binary=:all: -r services/ml/requirements-release.lock
.\.tmp\release-lock-check\Scripts\python -m pip check
.\.tmp\release-lock-check\Scripts\python -m pip freeze
```

Expected: the install succeeds; `pip check` prints `No broken requirements found.`; `pip freeze` prints exactly the 15 pins from Step 2. If pip says `Hashes are required in --require-hashes mode, but they are missing from some requirements` for a package, that package is an unlisted transitive dependency. Stop and go back to Step 1 to get it approved. Do not add it on your own.

Keep `.tmp\release-lock-check` for Task 3 Step 7.

- [ ] **Step 5: Prove Linux wheels exist for every pin**

Run (from the repository root):

```powershell
.\.venv\Scripts\python -m pip download --require-hashes --only-binary=:all: --python-version 3.14 --implementation cp --abi cp314 --abi abi3 --abi none --platform manylinux_2_34_x86_64 --platform manylinux_2_28_x86_64 --platform manylinux_2_17_x86_64 --platform manylinux2014_x86_64 -d .tmp\linux-wheels -r services/ml/requirements-release.lock
Remove-Item -Recurse -Force .tmp\linux-wheels
```

Expected: `Successfully downloaded` lists every package. `pip download` evaluates markers for this Windows host, so `pefile` and `pywin32-ctypes` download too; both are pure-Python wheels, so that is harmless. A `No matching distribution` error means a pin has no Linux cp314 wheel. Stop and report it.

- [ ] **Step 6: Write the consistency tests**

In `services/ml/tests/test_release_requirements.py`, add `import re` to the stdlib imports and `from packaging.requirements import Requirement` next to `import pytest`. Add `INPUT_PATH`, `LOCK_PATH`, and `ML_DIR` to the existing `from release_requirements import (...)` block, which must stay below the `sys.path.insert` line. Then append:

```python
RUNTIME_DISTRIBUTIONS = ("pdfminer.six", "python-docx")
FREEZE_TOOLS = ("pyinstaller", "pyinstaller-hooks-contrib")


def _normalize(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def _locked() -> dict[str, Pin]:
    pins = parse_pins(LOCK_PATH.read_text(encoding="utf-8"))
    return {_normalize(pin.name): pin for pin in pins}


def _requirements(path: Path) -> list[Requirement]:
    lines = path.read_text(encoding="utf-8").splitlines()
    return [
        Requirement(line.strip())
        for line in lines
        if line.strip() and not line.strip().startswith("#")
    ]


def test_lock_pins_exactly_the_input_pins() -> None:
    locked = set(parse_pins(LOCK_PATH.read_text(encoding="utf-8")))
    assert locked == set(parse_pins(INPUT_PATH.read_text(encoding="utf-8")))


def test_every_locked_pin_has_a_hash() -> None:
    counts: dict[str, int] = {}
    current = ""
    for raw in LOCK_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("--hash=sha256:"):
            counts[current] += 1
        else:
            current = line.removesuffix("\\").strip()
            counts[current] = 0
    assert counts
    assert all(counts.values()), counts


def test_lock_satisfies_runtime_requirements() -> None:
    locked = _locked()
    checked = []
    for requirement in _requirements(ML_DIR / "requirements.txt"):
        if requirement.name not in RUNTIME_DISTRIBUTIONS:
            continue
        pin = locked[_normalize(requirement.name)]
        assert requirement.specifier.contains(pin.version), (requirement, pin)
        checked.append(requirement.name)
    assert sorted(checked) == sorted(RUNTIME_DISTRIBUTIONS)


def test_lock_matches_pinned_freeze_tools() -> None:
    locked = _locked()
    checked = []
    for requirement in _requirements(ML_DIR / "requirements-dev.txt"):
        if requirement.name not in FREEZE_TOOLS:
            continue
        pin = locked[_normalize(requirement.name)]
        assert str(requirement.specifier) == f"=={pin.version}", (requirement, pin)
        checked.append(requirement.name)
    assert sorted(checked) == sorted(FREEZE_TOOLS)
```

- [ ] **Step 7: Run the tests; confirm they catch drift**

Run: `.\.venv\Scripts\python -m pytest services/ml/tests/test_release_requirements.py -v`
Expected: 14 passed.

Check that the tests catch drift: in `requirements-release.in`, change `lxml==6.1.3` to `lxml==6.1.2` and re-run. Expected: `test_lock_pins_exactly_the_input_pins` FAILS. Undo the edit with `git checkout -- services/ml/requirements-release.in`, or edit it back if the file is not committed yet. Re-run: 14 passed.

Run (from `services/ml`): `uvx ruff@0.6.9 check .` and `uvx ruff@0.6.9 format --check tests/test_release_requirements.py`
Expected: both pass.

- [ ] **Step 8: Record provenance and the pinning rule**

In `services/ml/SIDECAR_FREEZE.md`, replace the paragraph that starts `Transitive wheels (` with:

```markdown
Every package the release freeze installs, including transitive wheels, is pinned with `==` in `requirements-release.in`. `requirements-release.lock` adds the SHA-256 of every PyPI file for each pin (`python services/ml/release_requirements.py`). Release builds install it with `pip install --require-hashes --only-binary=:all:`. Change a pin only after a Dependency Security review, then regenerate the lock and run `pytest services/ml/tests/test_release_requirements.py`.
```

At the end of the `## Dependency provenance` list, append:

```markdown
- Release lock (2026-11-05): pinned the existing freeze environment, no upgrades. `altgraph 0.17.5`, `cffi 2.1.1`, `charset-normalizer 3.5.1`, `cryptography 50.0.1`, `lxml 6.1.3`, `packaging 26.3`, `pdfminer.six 20260107`, `pefile 2024.8.26`, `pycparser 3.0`, `pyinstaller 6.22.2`, `pyinstaller-hooks-contrib 2026.7`, `python-docx 1.2.0`, `pywin32-ctypes 0.2.3`, `setuptools 84.0.0`, `typing_extensions 4.16.0`. PyPI pages and upstream links: Part 3 plan, Task 2 Step 1 table. Human approval: <approver>, <date>.
```

- [ ] **Step 9: Commit**

```powershell
git add services/ml/requirements-release.in services/ml/requirements-release.lock services/ml/tests/test_release_requirements.py services/ml/SIDECAR_FREEZE.md
git commit -m "build(sidecar): pin release freeze packages with hashes" -m "Approved by <approver> on <date>. Pins equal the 2026-11-05 freeze environment; no upgrades."
```

---

### Task 3: Freeze and release builds use only the lock

**Files:**
- Modify: `services/ml/build_sidecar.py` (remove `RUNTIME_PACKAGES`, `install_runtime_packages`, `ensure_runtime_packages`; add the lock check; update `main`)
- Modify: `services/ml/tests/test_build_sidecar.py`
- Modify: `.github/workflows/release.yml` (both `Set up Python` and `Create Python venv and install` steps)
- Modify: `docs/DEVELOPMENT.md` (release-build Python setup)

**Interfaces:**
- Consumes: `LOCK_PATH`, `Pin`, `parse_pins` from `release_requirements` (Task 1), and the lock file (Task 2). `packaging.markers.Marker` (installed with PyInstaller).
- Produces (in `build_sidecar`):
  - `lock_mismatches(pins: list[Pin], installed_version: Callable[[str], str] | None = None, marker_applies: Callable[[str], bool] | None = None) -> list[str]`
  - `require_locked_versions(lock_path: Path = LOCK_PATH, installed_version: Callable[[str], str] | None = None) -> None`. Raises `SystemExit` naming the install command.
  - `require_runtime_imports` stays (import check only).

- [ ] **Step 1: Write the failing tests**

In `services/ml/tests/test_build_sidecar.py`:

1. Change the `from build_sidecar import (...)` block to import `ALLOWED_HOST_TUPLES, binary_filename, host_tuple_from_rustc_output, lock_mismatches, require_locked_versions, require_python_314, require_runtime_imports`. Add `from importlib import metadata` to the stdlib imports, and `from release_requirements import Pin` directly after the `from build_sidecar import (...)` block (both must stay below the `sys.path.insert` line).
2. Delete `test_ensure_runtime_packages_installs_then_succeeds`, `test_ensure_runtime_packages_raises_when_still_missing`, and `test_ensure_runtime_packages_skips_install_when_present`.
3. Append:

```python
def _versions(installed: dict[str, str]):
    def lookup(name: str) -> str:
        try:
            return installed[name]
        except KeyError:
            raise metadata.PackageNotFoundError(name) from None

    return lookup


def test_lock_mismatches_reports_wrong_and_missing_versions() -> None:
    pins = [Pin("lxml", "6.1.3"), Pin("altgraph", "0.17.5"), Pin("cffi", "2.1.1")]
    problems = lock_mismatches(
        pins,
        installed_version=_versions({"lxml": "6.0.0", "cffi": "2.1.1"}),
        marker_applies=lambda _marker: True,
    )
    assert problems == [
        "lxml 6.0.0 (lock pins 6.1.3)",
        "altgraph (not installed, lock pins 0.17.5)",
    ]


def test_lock_mismatches_skips_pins_for_other_platforms() -> None:
    pins = [Pin("pefile", "2024.8.26", 'sys_platform == "win32"')]
    problems = lock_mismatches(
        pins,
        installed_version=_versions({}),
        marker_applies=lambda marker: not marker,
    )
    assert problems == []


def test_require_locked_versions_names_the_install_command(tmp_path: Path) -> None:
    lock = tmp_path / "requirements-release.lock"
    lock.write_text(f"lxml==6.1.3 \\\n    --hash=sha256:{'a' * 64}\n", encoding="utf-8")
    with pytest.raises(SystemExit, match="requirements-release.lock"):
        require_locked_versions(lock, installed_version=_versions({}))


def test_require_locked_versions_accepts_a_matching_install(tmp_path: Path) -> None:
    lock = tmp_path / "requirements-release.lock"
    lock.write_text(f"lxml==6.1.3 \\\n    --hash=sha256:{'a' * 64}\n", encoding="utf-8")
    require_locked_versions(lock, installed_version=_versions({"lxml": "6.1.3"}))
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `.\.venv\Scripts\python -m pytest services/ml/tests/test_build_sidecar.py -v`
Expected: collection error, `ImportError: cannot import name 'lock_mismatches' from 'build_sidecar'`.

- [ ] **Step 3: Implement**

In `services/ml/build_sidecar.py`:

1. Delete `RUNTIME_PACKAGES`, `install_runtime_packages`, and `ensure_runtime_packages`.
2. Add `from importlib import metadata` to the imports and, after the stdlib imports, `from release_requirements import LOCK_PATH, Pin, parse_pins`.
3. In `require_runtime_imports`, replace the message tail `"; install pdfminer.six and python-docx into the freeze interpreter "` with `"; install services/ml/requirements-release.lock into the freeze interpreter "`.
4. Add after `require_runtime_imports`:

```python
INSTALL_LOCK_COMMAND = (
    "python -m pip install --require-hashes --only-binary=:all: "
    "-r services/ml/requirements-release.lock"
)


def _marker_applies(marker: str) -> bool:
    if not marker:
        return True
    from packaging.markers import Marker  # installed with PyInstaller

    return Marker(marker).evaluate()


def lock_mismatches(
    pins: list[Pin],
    installed_version: Callable[[str], str] | None = None,
    marker_applies: Callable[[str], bool] | None = None,
) -> list[str]:
    lookup = installed_version or metadata.version
    applies = marker_applies or _marker_applies
    problems: list[str] = []
    for pin in pins:
        if not applies(pin.marker):
            continue
        try:
            found = lookup(pin.name)
        except metadata.PackageNotFoundError:
            problems.append(f"{pin.name} (not installed, lock pins {pin.version})")
            continue
        if found != pin.version:
            problems.append(f"{pin.name} {found} (lock pins {pin.version})")
    return problems


def require_locked_versions(
    lock_path: Path = LOCK_PATH,
    installed_version: Callable[[str], str] | None = None,
) -> None:
    pins = parse_pins(lock_path.read_text(encoding="utf-8"))
    problems = lock_mismatches(pins, installed_version)
    if problems:
        raise SystemExit(
            "sidecar freeze requires the hash-pinned release packages; mismatched: "
            + ", ".join(problems)
            + f". Run: {INSTALL_LOCK_COMMAND}"
        )
```

5. In `main`, replace `ensure_runtime_packages()` with:

```python
        require_locked_versions()
        require_runtime_imports()
```

- [ ] **Step 4: Run the sidecar test suite and Ruff**

Run: `.\.venv\Scripts\python -m pytest services/ml -v`
Expected: all pass (the three removed install tests no longer exist). On 2026-11-05 a scratch copy with these edits gave 27 passed for `tests/test_build_sidecar.py` plus `tests/test_release_requirements.py`.

Run (from `services/ml`): `uvx ruff@0.6.9 format build_sidecar.py tests/test_build_sidecar.py`, then `uvx ruff@0.6.9 check .` and `uvx ruff@0.6.9 format --check build_sidecar.py tests/test_build_sidecar.py`
Expected: both pass. The format run also rewraps the pre-existing long line in `test_parse_host_tuple_flag`; keep that change.

- [ ] **Step 5: Install the release environment from the lock in the release workflow**

In `.github/workflows/release.yml`, in both jobs, change the `Set up Python` step's `cache-dependency-path` from:

```yaml
          cache-dependency-path: |
            services/ml/requirements*.txt
```

to:

```yaml
          cache-dependency-path: |
            services/ml/requirements-release.lock
```

Windows job: replace the `Create Python venv and install` step's install line:

```yaml
          .\.venv\Scripts\python -m pip install -r services/ml/requirements.txt -r services/ml/requirements-dev.txt
```

with:

```yaml
          .\.venv\Scripts\python -m pip install --require-hashes --only-binary=:all: -r services/ml/requirements-release.lock
```

Linux job: replace:

```yaml
          .venv/bin/python -m pip install -r services/ml/requirements.txt -r services/ml/requirements-dev.txt
```

with:

```yaml
          .venv/bin/python -m pip install --require-hashes --only-binary=:all: -r services/ml/requirements-release.lock
```

No other release step needs pytest or Ruff. `set_release_version.py`, `checksum_release_assets.py`, and `provision_sqlite_vec.py` use only the stdlib.

- [ ] **Step 6: Update the local release setup docs**

In `docs/DEVELOPMENT.md` ("Release builds"), replace the sentence `The prepare script freezes the sidecar with PyInstaller (from \`services/ml/requirements-dev.txt\`) and must run under Python 3.14.` with:

```markdown
The prepare script freezes the sidecar with PyInstaller and must run under Python 3.14. The freeze refuses to run unless the venv matches `services/ml/requirements-release.lock`, the hash-pinned package set that release builds ship.
```

Replace the Windows install line `.\.venv\Scripts\python -m pip install -r services/ml/requirements.txt -r services/ml/requirements-dev.txt` with:

```powershell
.\.venv\Scripts\python -m pip install --require-hashes --only-binary=:all: -r services/ml/requirements-release.lock
```

Replace the Linux install line `.venv/bin/python -m pip install -r services/ml/requirements.txt -r services/ml/requirements-dev.txt` with:

```bash
.venv/bin/python -m pip install --require-hashes --only-binary=:all: -r services/ml/requirements-release.lock
```

After the Linux code block, add:

```markdown
To run the sidecar tests in the same venv, also install `services/ml/requirements-dev.txt`. pip keeps the locked versions because they already satisfy `requirements.txt`.
```

- [ ] **Step 7: Freeze from the lock-only venv and smoke-test the binary (Windows)**

Use the venv from Task 2 Step 4 (it has only the locked packages):

```powershell
.\.tmp\release-lock-check\Scripts\python services/ml/build_sidecar.py
```

Expected: PyInstaller runs and the script prints an absolute path that ends in `apps\desktop\src-tauri\binaries\spellbook-sidecar-x86_64-pc-windows-msvc.exe`.

Prove the freeze rejects a venv that does not match the lock (here, a lock that pins a different `lxml`):

```powershell
.\.venv\Scripts\python -c "import pathlib; pathlib.Path('.tmp/lock-drift.lock').write_text('lxml==0.0.1 \\\n    --hash=sha256:' + 'a' * 64 + '\n', encoding='utf-8', newline='\n')"
.\.tmp\release-lock-check\Scripts\python -c "import sys; sys.path.insert(0, 'services/ml'); import build_sidecar, pathlib; build_sidecar.require_locked_versions(pathlib.Path('.tmp/lock-drift.lock'))"
```

Expected: the last command exits non-zero with `sidecar freeze requires the hash-pinned release packages; mismatched: lxml 6.1.3 (lock pins 0.0.1)`.

Smoke-test the frozen binary with a Markdown import:

```powershell
.\.venv\Scripts\python -c "import json, pathlib; p = pathlib.Path('.tmp/smoke.md').resolve(); p.write_text('---\nname: Smoke Spell\nlevel: 1\n---\nDesc', encoding='utf-8', newline='\n'); pathlib.Path('.tmp/smoke-request.json').write_text(json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'import', 'params': {'files': [str(p)]}}) + '\n', encoding='utf-8', newline='\n')"
cmd /c "apps\desktop\src-tauri\binaries\spellbook-sidecar-x86_64-pc-windows-msvc.exe < .tmp\smoke-request.json"
```

Expected: one JSON line whose `result.spells[0].name` is `Smoke Spell`.

Clean up:

```powershell
Remove-Item -Recurse -Force .tmp\release-lock-check, .tmp\lock-drift.lock, .tmp\smoke.md, .tmp\smoke-request.json
```

The release workflow change is verified by the first `workflow_dispatch` run after `release.yml` is on the default branch. Both jobs must pass `Create Python venv and install` and `Prepare release resources`. Note this in the commit body.

- [ ] **Step 8: Commit**

```powershell
git add services/ml/build_sidecar.py services/ml/tests/test_build_sidecar.py .github/workflows/release.yml docs/DEVELOPMENT.md
git commit -m "build(release): freeze the sidecar only from the hash-pinned lock" -m "build_sidecar no longer pip-installs floating versions and refuses a venv that differs from requirements-release.lock. Local freeze and smoke import verified on Windows; release workflow to be confirmed on the first workflow_dispatch run."
```
