#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from collections.abc import Callable
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

SEMVER = re.compile(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?")


def strip_v_prefix(tag: str) -> str:
    return tag[1:] if tag.startswith("v") else tag


def replace_cargo_version(text: str, version: str) -> str:
    out, count = re.subn(
        r'(?m)^version = "[^"]+"',
        lambda _: f'version = "{version}"',
        text,
        count=1,
    )
    if count != 1:
        raise SystemExit("no package version field found in Cargo.toml")
    return out


def replace_json_version(text: str, version: str) -> str:
    out, count = re.subn(
        r'("version"\s*:\s*")([^"]+)(")',
        lambda m: f"{m.group(1)}{version}{m.group(3)}",
        text,
        count=1,
    )
    if count != 1:
        raise SystemExit("no version field found in JSON")
    return out


def _rewrite(path: Path, replace: Callable[[str, str], str], version: str) -> None:
    text = path.read_bytes().decode("utf-8")
    path.write_bytes(replace(text, version).encode("utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("version")
    args = parser.parse_args()
    version = strip_v_prefix(args.version)
    if not SEMVER.fullmatch(version):
        raise SystemExit(f"not a semver release version: {args.version!r}")
    _rewrite(REPO / "apps/desktop/package.json", replace_json_version, version)
    _rewrite(REPO / "apps/desktop/src-tauri/tauri.conf.json", replace_json_version, version)
    _rewrite(REPO / "apps/desktop/src-tauri/Cargo.toml", replace_cargo_version, version)
    print(version)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
