import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest

from checksum_release_assets import main, sha256_file, write_checksum


def test_sha256_file(tmp_path: Path) -> None:
    asset = tmp_path / "a.bin"
    asset.write_bytes(b"spellbook")
    assert sha256_file(asset) == hashlib.sha256(b"spellbook").hexdigest()


def test_write_checksum_sidecar_name_and_format(tmp_path: Path) -> None:
    asset = tmp_path / "Spellbook_0.2.0_x64-setup.exe"
    asset.write_bytes(b"installer bytes")

    sidecar = write_checksum(asset)

    assert sidecar == tmp_path / "Spellbook_0.2.0_x64-setup.exe.sha256"
    digest = hashlib.sha256(b"installer bytes").hexdigest()
    assert sidecar.read_bytes() == f"{digest}  Spellbook_0.2.0_x64-setup.exe\n".encode()


def test_write_checksum_uses_lf_on_every_os(tmp_path: Path) -> None:
    asset = tmp_path / "Spellbook_0.2.0_amd64.deb"
    asset.write_bytes(b"deb")

    raw = write_checksum(asset).read_bytes()

    assert raw.endswith(b"\n")
    assert b"\r" not in raw


def test_main_writes_sidecar_per_asset(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    appimage = tmp_path / "Spellbook_0.2.0_amd64.AppImage"
    deb = tmp_path / "Spellbook_0.2.0_amd64.deb"
    appimage.write_bytes(b"appimage")
    deb.write_bytes(b"deb")
    monkeypatch.setattr(sys, "argv", ["checksum_release_assets.py", str(appimage), str(deb)])

    assert main() == 0

    assert (tmp_path / "Spellbook_0.2.0_amd64.AppImage.sha256").is_file()
    assert (tmp_path / "Spellbook_0.2.0_amd64.deb.sha256").is_file()


def test_main_missing_asset_exits(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    missing = tmp_path / "Spellbook_0.2.0_x64-setup.exe"
    monkeypatch.setattr(sys, "argv", ["checksum_release_assets.py", str(missing)])

    with pytest.raises(SystemExit, match="missing asset"):
        main()

    assert not (tmp_path / "Spellbook_0.2.0_x64-setup.exe.sha256").exists()
