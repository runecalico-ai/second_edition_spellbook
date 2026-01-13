import os
import json
import pytest
from pathlib import Path
from spellbook_sidecar import handle_export

def test_handle_export_markdown(tmp_path):
    spells = [
        {"name": "Magic Missile", "description": "Darts of force."},
        {"name": "Fireball", "description": "Explosion of fire."}
    ]
    params = {
        "spells": spells,
        "format": "md",
        "output_dir": str(tmp_path)
    }
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
        "output_dir": str(tmp_path)
    }
    
    result = handle_export(params)
    
    assert result["format"] == "html"
    assert "warning" in result
    assert "PDF generation failed" in result["warning"]
    path = Path(result["path"])
    assert path.exists()
    assert path.suffix == ".html"
    content = path.read_text()
    assert "Shield" in content
    assert "Invisible barrier." in content
    assert "Level" in content # Stat-block layout check

def test_handle_export_invalid_format(tmp_path):
    params = {
        "spells": [],
        "format": "exe",
        "output_dir": str(tmp_path)
    }
    with pytest.raises(ValueError, match="Unsupported export format"):
        handle_export(params)
