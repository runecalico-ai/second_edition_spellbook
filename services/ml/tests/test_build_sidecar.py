from __future__ import annotations

import sys
from importlib import metadata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from build_sidecar import (
    ALLOWED_HOST_TUPLES,
    _marker_applies,
    binary_filename,
    host_tuple_from_rustc_output,
    lock_mismatches,
    require_locked_versions,
    require_python_314,
    require_runtime_imports,
)
from release_requirements import Pin


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
    assert (
        host_tuple_from_rustc_output("x86_64-pc-windows-msvc\n")
        == "x86_64-pc-windows-msvc"
    )


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


def test_lock_mismatches_names_the_install_command_without_packaging(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setitem(sys.modules, "packaging.markers", None)
    pins = [Pin("pefile", "2024.8.26", 'sys_platform == "win32"')]
    with pytest.raises(SystemExit, match="requirements-release.lock"):
        lock_mismatches(pins, installed_version=_versions({}))


def test_marker_applies_evaluates_markers() -> None:
    assert _marker_applies("") is True
    assert _marker_applies('sys_platform == "win32"') is (sys.platform == "win32")


def test_require_locked_versions_names_the_install_command(tmp_path: Path) -> None:
    lock = tmp_path / "requirements-release.lock"
    lock.write_text(f"lxml==6.1.3 \\\n    --hash=sha256:{'a' * 64}\n", encoding="utf-8")
    with pytest.raises(SystemExit, match="requirements-release.lock"):
        require_locked_versions(lock, installed_version=_versions({}))


def test_require_locked_versions_accepts_a_matching_install(tmp_path: Path) -> None:
    lock = tmp_path / "requirements-release.lock"
    lock.write_text(f"lxml==6.1.3 \\\n    --hash=sha256:{'a' * 64}\n", encoding="utf-8")
    require_locked_versions(lock, installed_version=_versions({"lxml": "6.1.3"}))
