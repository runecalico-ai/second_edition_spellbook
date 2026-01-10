import json
import subprocess
import sys
from pathlib import Path


def _sidecar_path() -> Path:
    return Path(__file__).resolve().parents[1] / "spellbook_sidecar.py"


def _run_sidecar(payload: dict) -> dict:
    process = subprocess.run(
        [sys.executable, str(_sidecar_path())],
        input=json.dumps(payload) + "\n",
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(process.stdout)


def test_embed_returns_vectors():
    response = _run_sidecar({"jsonrpc": "2.0", "id": 1, "method": "embed", "params": {"texts": ["alpha", "beta"]}})
    assert "result" in response
    vectors = response["result"]["vectors"]
    assert len(vectors) == 2
    assert len(vectors[0]) == 384


def test_import_markdown(tmp_path: Path):
    sample = tmp_path / "spell.md"
    sample.write_text("---\nname: Test Spell\nlevel: 1\n---\nDescription here.", encoding="utf-8")
    response = _run_sidecar({"jsonrpc": "2.0", "id": 2, "method": "import", "params": {"files": [str(sample)]}})
    spells = response["result"]["spells"]
    assert spells
    assert spells[0]["name"] == "Test Spell"
    assert spells[0]["level"] == 1


def test_export_markdown(tmp_path: Path):
    response = _run_sidecar(
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "export",
            "params": {
                "spells": [{"name": "Arcane Bolt", "description": "Zap."}],
                "format": "md",
                "output_dir": str(tmp_path),
            },
        }
    )
    output_path = Path(response["result"]["path"])
    assert output_path.exists()
    assert "Arcane Bolt" in output_path.read_text(encoding="utf-8")
