from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from build_sidecar import (
    ALLOWED_HOST_TUPLES,
    binary_filename,
    host_tuple_from_rustc_output,
    require_python_314,
)


def test_require_python_314_rejects_other_versions() -> None:
    with pytest.raises(SystemExit, match="sidecar freeze requires Python 3.14"):
        require_python_314((3, 12, 0))


def test_require_python_314_accepts_314() -> None:
    require_python_314((3, 14, 4))


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
