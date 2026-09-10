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


def require_python_314(version_info: tuple[int, ...] = sys.version_info) -> None:
    if version_info[:2] != (3, 14):
        raise SystemExit(
            f"sidecar freeze requires Python 3.14, got {version_info[0]}.{version_info[1]}"
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
