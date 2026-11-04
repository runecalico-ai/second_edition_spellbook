from pathlib import Path

import pytest

from spellbook_sidecar import handle_export


def test_handle_export_markdown(tmp_path):
    spells = [
        {"name": "Magic Missile", "description": "Darts of force."},
        {"name": "Fireball", "description": "Explosion of fire."},
    ]
    params = {"spells": spells, "format": "md", "output_dir": str(tmp_path)}
    result = handle_export(params)

    assert result["format"] == "md"
    path = Path(result["path"])
    assert path.exists()
    content = path.read_text()
    assert "# Magic Missile" in content
    assert "Darts of force." in content
    assert "# Fireball" in content


def test_handle_export_pdf_fallback_to_html(tmp_path, monkeypatch):
    # Mock subprocess.run to simulate pandoc missing or failing
    import subprocess

    def mock_run(*args, **kwargs):
        class MockResult:
            returncode = 1
            stderr = "Pandoc not found"

        return MockResult()

    # Actually, the sidecar first checks `pandoc --version`
    # Let's mock subprocess.run to always fail for the first call
    monkeypatch.setattr(subprocess, "run", mock_run)

    spells = [{"name": "Shield", "description": "Invisible barrier."}]
    params = {
        "spells": spells,
        "format": "pdf",
        "mode": "single",
        "layout": "stat-block",
        "page_size": "a4",
        "output_dir": str(tmp_path),
    }

    result = handle_export(params)

    assert result["format"] == "html"
    assert "note" in result
    assert "Print-optimized HTML generated" in result["note"]
    path = Path(result["path"])
    assert path.exists()
    assert path.suffix == ".html"
    content = path.read_text()
    assert "Shield" in content
    assert "Invisible barrier." in content
    assert "Level" in content  # Stat-block layout check


def test_handle_export_invalid_format(tmp_path):
    params = {"spells": [], "format": "exe", "output_dir": str(tmp_path)}
    with pytest.raises(ValueError, match="Unsupported export format"):
        handle_export(params)


def test_handle_export_html_escapes_spell_name_and_description(tmp_path):
    spells = [
        {
            "name": "<img src=x onerror=alert(1)>",
            "description": "<script>alert(1)</script> dangerous",
            "level": 3,
            "school": "Evocation",
        }
    ]
    params = {
        "spells": spells,
        "format": "html",
        "mode": "single",
        "layout": "stat-block",
        "output_dir": str(tmp_path),
    }

    result = handle_export(params)

    assert result["format"] == "html"
    content = Path(result["path"]).read_text()
    assert "&lt;img src=x onerror=alert(1)&gt;" in content
    assert "&lt;script&gt;alert(1)&lt;/script&gt; dangerous" in content
    assert "<img src=x onerror=alert(1)>" not in content
    assert "<script>alert(1)</script>" not in content


CHARACTER = {
    "name": "Raistlin",
    "characterType": "PC",
    "race": "Human",
    "alignment": "Neutral",
    "notes": "",
    "abilities": {
        "str": 9,
        "dex": 16,
        "con": 10,
        "int": 18,
        "wis": 12,
        "cha": 10,
        "com": 10,
    },
    "classes": [{"className": "Mage", "classLabel": "Mage", "level": 3}],
    "characterSpells": [
        {
            "name": "Sleep",
            "level": 1,
            "className": "Mage",
            "prepared": 1,
            "known": 1,
            "description": "Puts creatures to sleep.",
        }
    ],
    "includeCom": False,
    "includeNotes": True,
}


def _body(content: str) -> str:
    assert content.count("<body>") == 1
    assert content.index("</head>") < content.index("<body>")
    assert content.count("</body>") == 1
    assert content.index("<body>") < content.index("</body>")
    assert content.rstrip().endswith("</html>")
    return content.split("<body>", 1)[1].split("</body>", 1)[0]


@pytest.mark.parametrize("fmt", ["html", "pdf"])
def test_handle_export_character_sheet_uses_character_sheet_template(tmp_path, fmt):
    result = handle_export(
        {
            "mode": "character_sheet",
            "character": CHARACTER,
            "format": fmt,
            "output_dir": str(tmp_path),
        }
    )

    assert result["format"] == "html"
    content = Path(result["path"]).read_text(encoding="utf-8")
    body = _body(content)
    assert "<title>Raistlin - Character Sheet</title>" in content
    assert "<h1>Raistlin</h1>" in body
    assert "STR</div>" in body
    assert "Mage (Level 3)" in body
    assert 'class="spell-table"' in body
    assert "Sleep" in body


@pytest.mark.parametrize("fmt", ["html", "pdf"])
def test_handle_export_spellbook_pack_uses_pack_template(tmp_path, fmt):
    spells = [
        {
            "name": "Sleep",
            "level": 1,
            "school": "Enchantment",
            "description": "Puts creatures to sleep.",
        }
    ]
    result = handle_export(
        {
            "mode": "spellbook_pack",
            "character": CHARACTER,
            "class_name": "Mage",
            "spells": spells,
            "format": fmt,
            "layout": "compact",
            "output_dir": str(tmp_path),
        }
    )

    assert result["format"] == "html"
    content = Path(result["path"]).read_text(encoding="utf-8")
    body = _body(content)
    assert "<title>Raistlin's Spellbook - Mage</title>" in content
    assert "<h1>Raistlin's Spellbook</h1>" in body
    assert "Class: Mage" in body
    assert "Puts creatures to sleep." in body


@pytest.mark.parametrize("mode", ["single", "spellbook"])
def test_handle_export_print_html_wraps_spells_in_body(tmp_path, mode):
    spells = [
        {
            "name": "Shield",
            "level": 1,
            "school": "Evocation",
            "description": "Invisible barrier.",
        }
    ]
    result = handle_export(
        {
            "mode": mode,
            "spells": spells,
            "character": {"name": "Raistlin"},
            "format": "html",
            "layout": "stat-block",
            "output_dir": str(tmp_path),
        }
    )

    body = _body(Path(result["path"]).read_text(encoding="utf-8"))
    assert "Shield" in body
    assert "Invisible barrier." in body
