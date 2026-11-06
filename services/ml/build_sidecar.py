#!/usr/bin/env python3
"""Freeze spellbook_sidecar.py and place a target-triple-suffixed binary for Tauri."""

from __future__ import annotations

import argparse
import importlib
import shutil
import subprocess
import sys
from collections.abc import Callable
from importlib import metadata
from pathlib import Path

from release_requirements import LOCK_PATH, Pin, parse_pins

ML_DIR = Path(__file__).resolve().parent
REPO_ROOT = ML_DIR.parent.parent
BINARIES_DIR = REPO_ROOT / "apps" / "desktop" / "src-tauri" / "binaries"
ALLOWED_HOST_TUPLES = {
    "x86_64-pc-windows-msvc",
    "x86_64-unknown-linux-gnu",
}
RUNTIME_MODULES = ("pdfminer.high_level", "docx")


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


def require_python_314(version_info: tuple[int, ...] = sys.version_info) -> None:
    if version_info[:2] != (3, 14):
        raise SystemExit(
            f"sidecar freeze requires Python 3.14, got {version_info[0]}.{version_info[1]}"
        )


def _missing_runtime_imports(
    importer: Callable[[str], object] | None = None,
) -> list[str]:
    load = importer or importlib.import_module
    missing: list[str] = []
    for name in RUNTIME_MODULES:
        try:
            load(name)
        except ImportError:
            missing.append(name)
    return missing


def require_runtime_imports(
    importer: Callable[[str], object] | None = None,
) -> None:
    missing = _missing_runtime_imports(importer)
    if missing:
        raise SystemExit(
            "sidecar freeze requires "
            + ", ".join(missing)
            + "; install services/ml/requirements-release.lock into the freeze interpreter "
            "(hiddenimports cannot bundle wheels that were never installed)"
        )


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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-pyinstaller", action="store_true")
    args = parser.parse_args()
    require_python_314()
    BINARIES_DIR.mkdir(parents=True, exist_ok=True)
    windows = sys.platform == "win32"
    dest = BINARIES_DIR / binary_filename(host_tuple(), windows)
    if not args.skip_pyinstaller:
        require_locked_versions()
        require_runtime_imports()
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
