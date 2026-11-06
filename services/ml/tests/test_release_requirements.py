from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

import release_requirements
from release_requirements import (
    LOCK_HEADER,
    Pin,
    main,
    parse_pins,
    release_sha256s,
    render_lock,
)


@pytest.fixture(autouse=True)
def _block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def blocked(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("unexpected network call")

    monkeypatch.setattr(urllib.request, "urlopen", blocked)


def _release_json(
    *digests: str, yanked: bool = False, packagetype: str = "bdist_wheel"
) -> bytes:
    files = [
        {"digests": {"sha256": d}, "yanked": yanked, "packagetype": packagetype}
        for d in digests
    ]
    return json.dumps({"urls": files}).encode()


def test_parse_pins_reads_pins_markers_and_skips_comments() -> None:
    text = (
        "# comment\n"
        "\n"
        "altgraph==0.17.5\n"
        'pefile==2024.8.26 ; sys_platform == "win32"\n'
    )
    assert parse_pins(text) == [
        Pin("altgraph", "0.17.5"),
        Pin("pefile", "2024.8.26", 'sys_platform == "win32"'),
    ]


def test_parse_pins_strips_inline_comment() -> None:
    assert parse_pins("lxml==6.1.3  # note\n") == [Pin("lxml", "6.1.3")]


@pytest.mark.parametrize(
    "line",
    [
        "lxml>=6.0",
        "lxml",
        "==6.1.3",
        "pkg[x]==1.0",
        "lxml===6.1.3",
        "a>=1,==2",
        "foo @ https://host/foo==1.0.whl",
    ],
)
def test_parse_pins_rejects_unpinned_lines(line: str) -> None:
    with pytest.raises(SystemExit, match="pinned with =="):
        parse_pins(line + "\n")


def test_release_sha256s_returns_every_published_file_sorted() -> None:
    seen: list[str] = []

    def fetch(url: str) -> bytes:
        seen.append(url)
        return _release_json("b" * 64, "a" * 64)

    assert release_sha256s(Pin("lxml", "6.1.3"), fetch) == ["a" * 64, "b" * 64]
    assert seen == ["https://pypi.org/pypi/lxml/6.1.3/json"]


def test_release_sha256s_rejects_yanked_release() -> None:
    with pytest.raises(SystemExit, match="yanked"):
        release_sha256s(
            Pin("lxml", "6.1.3"), lambda _url: _release_json("a" * 64, yanked=True)
        )


def test_release_sha256s_rejects_release_without_files() -> None:
    with pytest.raises(SystemExit, match="no files"):
        release_sha256s(Pin("lxml", "6.1.3"), lambda _url: _release_json())


def test_release_sha256s_rejects_release_without_wheel() -> None:
    with pytest.raises(SystemExit, match=r"lxml==6\.1\.3 .*wheel"):
        release_sha256s(
            Pin("lxml", "6.1.3"),
            lambda _url: _release_json("a" * 64, "b" * 64, packagetype="sdist"),
        )


def test_release_sha256s_hashes_sdist_and_wheel() -> None:
    files = [
        {"digests": {"sha256": "b" * 64}, "yanked": False, "packagetype": "sdist"},
        {
            "digests": {"sha256": "a" * 64},
            "yanked": False,
            "packagetype": "bdist_wheel",
        },
    ]
    body = json.dumps({"urls": files}).encode()
    assert release_sha256s(Pin("lxml", "6.1.3"), lambda _url: body) == [
        "a" * 64,
        "b" * 64,
    ]


def test_release_sha256s_names_pin_on_http_error() -> None:
    def fetch(url: str) -> bytes:
        raise urllib.error.HTTPError(url, 404, "Not Found", None, None)

    with pytest.raises(SystemExit, match=r"lxml==6\.1\.3"):
        release_sha256s(Pin("lxml", "6.1.3"), fetch)


def test_release_sha256s_names_pin_on_invalid_json() -> None:
    with pytest.raises(SystemExit, match=r"lxml==6\.1\.3"):
        release_sha256s(Pin("lxml", "6.1.3"), lambda _url: b"not json")


def test_release_sha256s_names_pin_on_file_without_digest() -> None:
    entry = {"yanked": False, "packagetype": "bdist_wheel"}
    body = json.dumps({"urls": [entry]}).encode()
    with pytest.raises(SystemExit, match=r"lxml==6\.1\.3 has no sha256 digest"):
        release_sha256s(Pin("lxml", "6.1.3"), lambda _url: body)


def test_render_lock_writes_one_hashed_entry_per_pin_sorted_by_name() -> None:
    pefile = Pin("pefile", "2024.8.26", 'sys_platform == "win32"')
    altgraph = Pin("altgraph", "0.17.5")
    text = render_lock(
        [pefile, altgraph], {pefile: ["b" * 64], altgraph: ["a" * 64, "c" * 64]}
    )
    assert text == (
        LOCK_HEADER
        + "altgraph==0.17.5 \\\n"
        + f"    --hash=sha256:{'a' * 64} \\\n"
        + f"    --hash=sha256:{'c' * 64}\n"
        + 'pefile==2024.8.26 ; sys_platform == "win32" \\\n'
        + f"    --hash=sha256:{'b' * 64}\n"
    )


def test_parse_pins_reads_back_a_rendered_lock() -> None:
    pins = [Pin("altgraph", "0.17.5"), Pin("pefile", "2024.8.26", 'os_name == "nt"')]
    text = render_lock(pins, {pins[0]: ["a" * 64], pins[1]: ["b" * 64]})
    assert parse_pins(text) == pins


def test_main_writes_lf_lock_for_input_pins(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = tmp_path / "requirements-release.in"
    source.write_text("lxml==6.1.3\naltgraph==0.17.5\n", encoding="utf-8")
    output = tmp_path / "requirements-release.lock"
    monkeypatch.setattr(
        release_requirements, "_fetch_url", lambda _url: _release_json("d" * 64)
    )

    assert main(["--input", str(source), "--output", str(output)]) == 0

    raw = output.read_bytes()
    assert b"\r" not in raw
    assert set(parse_pins(raw.decode("utf-8"))) == set(
        parse_pins(source.read_text(encoding="utf-8"))
    )
