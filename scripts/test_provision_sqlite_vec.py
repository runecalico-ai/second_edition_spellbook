import io
import re
import sys
import tarfile
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest

from provision_sqlite_vec import (
    SQLITE_VEC_VERSION,
    asset_name,
    download_url,
    ensure_populated,
    library_name,
    main,
    stage_library,
)

REPO_ROOT = Path(__file__).resolve().parent.parent
CARGO_TOML = REPO_ROOT / "apps/desktop/src-tauri/Cargo.toml"


class _FakeResponse:
    def __init__(self, data: bytes) -> None:
        self._data = data

    def read(self) -> bytes:
        return self._data

    def __enter__(self) -> "_FakeResponse":
        return self

    def __exit__(self, *args: object) -> None:
        return None


def _targz_with_member(name: str, content: bytes) -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        info = tarfile.TarInfo(name=name)
        info.size = len(content)
        tar.addfile(info, io.BytesIO(content))
    return buf.getvalue()


@pytest.fixture(autouse=True)
def _block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def blocked(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("unexpected network call")

    monkeypatch.setattr(urllib.request, "urlretrieve", blocked)
    monkeypatch.setattr(urllib.request, "urlopen", blocked)


def test_version_matches_cargo_pin() -> None:
    text = CARGO_TOML.read_text(encoding="utf-8")
    match = re.search(r'sqlite-vec\s*=\s*"([^"]+)"', text)
    assert match is not None, "sqlite-vec pin not found in Cargo.toml"
    assert SQLITE_VEC_VERSION == match.group(1)
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
    assert exc.value.code not in (0, None)
    assert "empty" in str(exc.value)


def test_ensure_populated_ok_when_library_present(tmp_path: Path) -> None:
    dest = tmp_path / "sqlite-vec"
    dest.mkdir()
    (dest / "vec0.dll").write_bytes(b"fake")
    assert ensure_populated(dest) == dest / "vec0.dll"


def test_stage_library_copies_archive_root_dll(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _targz_with_member("vec0.dll", b"dll-bytes")
    captured: dict[str, object] = {}

    def fake_urlopen(url: str, timeout: object = None) -> _FakeResponse:
        captured["url"] = url
        captured["timeout"] = timeout
        return _FakeResponse(payload)

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    dest = tmp_path / "out"
    result = stage_library(dest, "0.1.6", "windows", "x86_64")
    assert captured["timeout"] == 60
    assert captured["url"] == download_url("0.1.6", "windows", "x86_64")
    assert result == dest / "vec0.dll"
    assert (dest / "vec0.dll").read_bytes() == b"dll-bytes"


def test_stage_library_rejects_nested_library(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    payload = _targz_with_member("nested/vec0.dll", b"dll-bytes")

    def fake_urlopen(url: str, timeout: object = None) -> _FakeResponse:
        return _FakeResponse(payload)

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    dest = tmp_path / "out"
    with pytest.raises(SystemExit) as exc:
        stage_library(dest, "0.1.6", "windows", "x86_64")
    assert exc.value.code not in (0, None)
    assert "vec0.dll" in str(exc.value)


@pytest.mark.parametrize(
    "error",
    [
        TimeoutError("timed out"),
        urllib.error.URLError("connection failed"),
        urllib.error.HTTPError(
            "https://example.invalid",
            404,
            "Not Found",
            hdrs=None,
            fp=io.BytesIO(),
        ),
    ],
    ids=["timeout", "urlerror", "httperror"],
)
def test_stage_library_maps_download_errors_to_systemexit(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, error: BaseException
) -> None:
    expected_url = download_url("0.1.6", "windows", "x86_64")

    def fake_urlopen(url: str, timeout: object = None) -> _FakeResponse:
        raise error

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)
    dest = tmp_path / "out"
    with pytest.raises(SystemExit) as exc:
        stage_library(dest, "0.1.6", "windows", "x86_64")
    assert exc.value.code not in (0, None)
    assert expected_url in str(exc.value)


def test_main_skip_download_empty_dest(tmp_path: Path) -> None:
    dest = tmp_path / "empty"
    dest.mkdir()
    with pytest.raises(SystemExit) as exc:
        main(["--dest", str(dest), "--skip-download"])
    assert exc.value.code not in (0, None)
    assert "empty" in str(exc.value)


def test_main_skip_download_present_library(tmp_path: Path) -> None:
    dest = tmp_path / "ok"
    dest.mkdir()
    (dest / "vec0.dll").write_bytes(b"fake")
    assert main(["--dest", str(dest), "--skip-download"]) == 0
