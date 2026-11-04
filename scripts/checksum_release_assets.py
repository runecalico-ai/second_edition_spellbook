#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
from pathlib import Path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_checksum(path: Path, sidecar: Path) -> None:
    expected = f"{sha256_file(path)}  {path.name}\n".encode()
    recorded = sidecar.read_bytes()
    if recorded != expected:
        raise SystemExit(
            f"checksum verification failed: {sidecar} contains {recorded!r}, "
            f"expected {expected!r}"
        )


def write_checksum(path: Path) -> Path:
    sidecar = path.with_name(path.name + ".sha256")
    digest = sha256_file(path)
    sidecar.write_text(f"{digest}  {path.name}\n", encoding="utf-8", newline="\n")
    verify_checksum(path, sidecar)
    return sidecar


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+", type=Path)
    args = parser.parse_args()
    for path in args.paths:
        if not path.is_file():
            raise SystemExit(f"missing asset: {path}")
    for path in args.paths:
        print(write_checksum(path))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
