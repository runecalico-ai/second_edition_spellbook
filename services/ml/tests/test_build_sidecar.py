from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from build_sidecar import (
    ALLOWED_HOST_TUPLES,
    binary_filename,
    ensure_runtime_packages,
    host_tuple_from_rustc_output,
    require_python_314,
    require_runtime_imports,
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


def _raise_import_error(name: str) -> object:
    raise ImportError(name)


def _succeed_import(_name: str) -> object:
    return object()


def test_require_runtime_imports_raises_when_missing() -> None:
    with pytest.raises(SystemExit, match="pdfminer.high_level"):
        require_runtime_imports(importer=_raise_import_error)


def test_require_runtime_imports_succeeds_when_present() -> None:
    require_runtime_imports(importer=_succeed_import)


def test_ensure_runtime_packages_installs_then_succeeds() -> None:
    available = {"ready": False}
    installed: list[str] = []

    def importer(name: str) -> object:
        if not available["ready"]:
            raise ImportError(name)
        return object()

    def installer(packages: tuple[str, ...]) -> None:
        installed.extend(packages)
        available["ready"] = True

    ensure_runtime_packages(importer=importer, installer=installer)
    assert "pytest" not in " ".join(installed)
    assert any("pdfminer.six" in package for package in installed)
    assert any("python-docx" in package for package in installed)


def test_ensure_runtime_packages_raises_when_still_missing() -> None:
    def installer(_packages: tuple[str, ...]) -> None:
        return None

    with pytest.raises(SystemExit, match="pdfminer.high_level"):
        ensure_runtime_packages(importer=_raise_import_error, installer=installer)


def test_ensure_runtime_packages_skips_install_when_present() -> None:
    calls = {"install": 0}

    def installer(_packages: tuple[str, ...]) -> None:
        calls["install"] += 1

    ensure_runtime_packages(importer=_succeed_import, installer=installer)
    assert calls["install"] == 0
