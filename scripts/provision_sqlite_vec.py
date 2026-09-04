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
