import time
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


def generate_test_spells(tmp_path: Path, count: int) -> list[Path]:
    """Generate sample markdown spell files for batch testing."""
    files = []
    for i in range(count):
        path = tmp_path / f"spell_{i:04d}.md"
        path.write_text(
            f"""---
name: Test Spell {i}
level: {i % 9 + 1}
school: Evocation
source: Test Source
components: V,S
duration: Instant
---
This is the description for Test Spell number {i}. It contains enough text to be meaningful.
""",
            encoding="utf-8",
        )
        files.append(path)
    return files


def test_parse_100_markdown_files(tmp_path: Path):
    """Ensure parsing 100 files completes reasonably fast."""
    files = generate_test_spells(tmp_path, count=100)

    start = time.time()

    response = _run_sidecar(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "import",
            "params": {"files": [str(f) for f in files]},
        }
    )

    elapsed = time.time() - start
    assert elapsed < 10, f"Took {elapsed:.1f}s, expected <10s"

    spells = response["result"]["spells"]
    assert len(spells) == 100

    # Verify critical fields extracted
    for i, spell in enumerate(spells):
        assert spell.get("name") == f"Test Spell {i}", f"Spell {i} name mismatch"
        assert spell.get("level") == (i % 9 + 1), f"Spell {i} level mismatch"
        assert spell.get("description"), f"Spell {i} missing description"


def test_confidence_scores_present(tmp_path: Path):
    """Verify that confidence scores are returned for parsed spells."""
    files = generate_test_spells(tmp_path, count=5)

    response = _run_sidecar(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "import",
            "params": {"files": [str(f) for f in files]},
        }
    )

    spells = response["result"]["spells"]
    assert len(spells) == 5

    for spell in spells:
        assert "_confidence" in spell, "Missing _confidence field"
        assert "_source_file" in spell, "Missing _source_file field"

        confidence = spell["_confidence"]
        assert (
            confidence.get("name") == 1.0
        ), "Name from frontmatter should have 1.0 confidence"
        assert (
            confidence.get("level") == 1.0
        ), "Level from frontmatter should have 1.0 confidence"
        assert (
            confidence.get("description") > 0.5
        ), "Description should have reasonable confidence"


def test_low_confidence_for_missing_fields(tmp_path: Path):
    """Verify that missing fields get low confidence scores."""
    # Create a minimal markdown file without frontmatter
    path = tmp_path / "minimal.md"
    path.write_text("Just some text without any metadata.", encoding="utf-8")

    response = _run_sidecar(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "import",
            "params": {"files": [str(path)]},
        }
    )

    spells = response["result"]["spells"]
    assert len(spells) == 1

    spell = spells[0]
    confidence = spell.get("_confidence", {})

    # Name derived from filename should have low confidence
    assert (
        confidence.get("name", 1.0) < 0.5
    ), "Heuristic name should have low confidence"
    # Level not in text should have very low confidence
    assert (
        confidence.get("level", 1.0) < 0.3
    ), "Missing level should have low confidence"
