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


def run_freeze_sidecar() -> None:
    script = REPO_ROOT / "services" / "ml" / "build_sidecar.py"
    completed = subprocess.run([sys.executable, str(script)], check=False)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--skip-sidecar",
        action="store_true",
        help="Skip sidecar freeze after sqlite-vec staging.",
    )
    args = parser.parse_args()
    run_provision_sqlite_vec()
    if not args.skip_sidecar:
        run_freeze_sidecar()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
