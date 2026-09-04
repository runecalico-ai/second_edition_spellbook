import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

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
