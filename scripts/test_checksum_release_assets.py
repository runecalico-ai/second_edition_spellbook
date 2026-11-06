import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest

import checksum_release_assets
from checksum_release_assets import main, sha256_file, verify_checksum, write_checksum


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


def test_write_checksum_rehashes_asset_after_write(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    asset = tmp_path / "Spellbook_0.2.0_amd64.deb"
    asset.write_bytes(b"deb")
    digests = iter(["a" * 64, "b" * 64])
    calls: list[Path] = []

    def changing_digest(path: Path) -> str:
        calls.append(path)
        return next(digests)

    monkeypatch.setattr(checksum_release_assets, "sha256_file", changing_digest)

    with pytest.raises(SystemExit, match="checksum verification failed"):
        write_checksum(asset)

    assert calls == [asset, asset]


@pytest.mark.parametrize(
    "corrupt",
    [
        lambda digest, name: f"{'0' * 64}  {name}\n",
        lambda digest, name: f"{digest}  other.deb\n",
        lambda digest, name: f"{digest}  {name}\r\n",
        lambda digest, name: f"{digest}  {name}",
        lambda digest, name: f"{digest}  {name}\n{digest}  {name}\n",
        lambda digest, name: f"{digest} {name}\n",
        lambda digest, name: f"{digest.upper()}  {name}\n",
    ],
    ids=["digest", "name", "crlf", "no-newline", "two-lines", "one-space", "uppercase"],
)
def test_verify_checksum_rejects_bad_sidecar(tmp_path: Path, corrupt) -> None:
    asset = tmp_path / "Spellbook_0.2.0_amd64.deb"
    asset.write_bytes(b"deb")
    sidecar = tmp_path / "Spellbook_0.2.0_amd64.deb.sha256"
    sidecar.write_bytes(
        corrupt(hashlib.sha256(b"deb").hexdigest(), asset.name).encode()
    )

    with pytest.raises(SystemExit, match="checksum verification failed"):
        verify_checksum(asset, sidecar)


def test_verify_checksum_detects_changed_asset(tmp_path: Path) -> None:
    asset = tmp_path / "Spellbook_0.2.0_amd64.deb"
    asset.write_bytes(b"deb")
    sidecar = write_checksum(asset)
    asset.write_bytes(b"tampered")

    with pytest.raises(SystemExit, match="checksum verification failed"):
        verify_checksum(asset, sidecar)


def test_main_writes_sidecar_per_asset(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    appimage = tmp_path / "Spellbook_0.2.0_amd64.AppImage"
    deb = tmp_path / "Spellbook_0.2.0_amd64.deb"
    appimage.write_bytes(b"appimage")
    deb.write_bytes(b"deb")
    monkeypatch.setattr(
        sys, "argv", ["checksum_release_assets.py", str(appimage), str(deb)]
    )

    assert main() == 0

    assert (tmp_path / "Spellbook_0.2.0_amd64.AppImage.sha256").is_file()
    assert (tmp_path / "Spellbook_0.2.0_amd64.deb.sha256").is_file()


def test_main_missing_asset_exits(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    missing = tmp_path / "Spellbook_0.2.0_x64-setup.exe"
    monkeypatch.setattr(sys, "argv", ["checksum_release_assets.py", str(missing)])

    with pytest.raises(SystemExit, match="missing asset"):
        main()

    assert not (tmp_path / "Spellbook_0.2.0_x64-setup.exe.sha256").exists()
