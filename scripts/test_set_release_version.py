import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest

import set_release_version
from set_release_version import (
    main,
    replace_cargo_version,
    replace_json_version,
    strip_v_prefix,
)


def test_strip_v() -> None:
    assert strip_v_prefix("v0.1.0-rc.1") == "0.1.0-rc.1"
    assert strip_v_prefix("0.2.0") == "0.2.0"


def test_replace_json_version_first_only() -> None:
    raw = '{\n  "version": "0.1.0",\n  "name": "spellbook-desktop"\n}\n'
    assert '"version": "0.2.0"' in replace_json_version(raw, "0.2.0")
    assert '"name": "spellbook-desktop"' in replace_json_version(raw, "0.2.0")


def test_replace_json_version_leaves_later_versions() -> None:
    raw = '{\n  "version": "0.1.0",\n  "dep": { "version": "9.9.9" }\n}\n'
    out = replace_json_version(raw, "0.2.0")
    assert out == '{\n  "version": "0.2.0",\n  "dep": { "version": "9.9.9" }\n}\n'


def test_replace_cargo_version_package_only() -> None:
    raw = (
        '[package]\nname = "spellbook-desktop"\nversion = "0.1.0"\n\n'
        '[dependencies]\ntauri = { version = "2" }\n'
    )
    out = replace_cargo_version(raw, "0.2.0-rc.1")
    assert 'version = "0.2.0-rc.1"' in out
    assert 'tauri = { version = "2" }' in out


def test_replace_without_version_field_fails() -> None:
    with pytest.raises(SystemExit, match="version"):
        replace_json_version('{"name": "x"}', "0.2.0")
    with pytest.raises(SystemExit, match="version"):
        replace_cargo_version('[package]\nname = "x"\n', "0.2.0")


@pytest.mark.parametrize("bad", ["v", "vnext", "v0.1", 'v0.1.0"', "v0.1.0-"])
def test_main_rejects_non_semver(
    bad: str, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(set_release_version, "REPO", tmp_path)
    monkeypatch.setattr(sys, "argv", ["set_release_version.py", bad])
    with pytest.raises(SystemExit, match="semver"):
        main()


def test_main_rewrites_all_three_files(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    pkg = tmp_path / "apps/desktop/package.json"
    conf = tmp_path / "apps/desktop/src-tauri/tauri.conf.json"
    cargo = tmp_path / "apps/desktop/src-tauri/Cargo.toml"
    conf.parent.mkdir(parents=True)
    pkg.write_bytes(b'{\n  "name": "spellbook-desktop",\n  "version": "0.1.0"\n}\n')
    conf.write_bytes(b'{\n  "productName": "Spellbook",\n  "version": "0.1.0"\n}\n')
    cargo.write_bytes(b'[package]\nname = "spellbook-desktop"\nversion = "0.1.0"\n')
    monkeypatch.setattr(set_release_version, "REPO", tmp_path)
    monkeypatch.setattr(sys, "argv", ["set_release_version.py", "v0.2.0-rc.1"])

    assert main() == 0

    assert (
        pkg.read_bytes()
        == b'{\n  "name": "spellbook-desktop",\n  "version": "0.2.0-rc.1"\n}\n'
    )
    assert (
        conf.read_bytes()
        == b'{\n  "productName": "Spellbook",\n  "version": "0.2.0-rc.1"\n}\n'
    )
    assert (
        cargo.read_bytes()
        == b'[package]\nname = "spellbook-desktop"\nversion = "0.2.0-rc.1"\n'
    )
    assert capsys.readouterr().out == "0.2.0-rc.1\n"
