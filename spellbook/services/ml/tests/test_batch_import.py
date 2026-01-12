import time
import json
import subprocess
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from html import escape
import importlib.util


def _sidecar_path() -> Path:
    return Path(__file__).resolve().parents[1] / "spellbook_sidecar.py"


def _load_sidecar_module():
    spec = importlib.util.spec_from_file_location("spellbook_sidecar", _sidecar_path())
    if not spec or not spec.loader:
        raise RuntimeError("Unable to load spellbook_sidecar module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run_sidecar(payload: dict) -> dict:
    process = subprocess.run(
        [sys.executable, str(_sidecar_path())],
        input=json.dumps(payload) + "\n",
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(process.stdout)


def _write_minimal_pdf(path: Path, text: str) -> None:
    safe_text = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 12 Tf 72 72 Td ({safe_text}) Tj ET"
    stream_bytes = stream.encode("utf-8")

    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] "
            "/Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>"
        ),
        f"<< /Length {len(stream_bytes)} >>\nstream\n{stream}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]

    content = bytearray()
    content.extend(b"%PDF-1.4\n%\xff\xff\xff\xff\n")

    offsets = [0]
    for idx, body in enumerate(objects, start=1):
        offsets.append(len(content))
        content.extend(f"{idx} 0 obj\n".encode("utf-8"))
        content.extend(body.encode("utf-8"))
        content.extend(b"\nendobj\n")

    xref_pos = len(content)
    content.extend(f"xref\n0 {len(offsets)}\n".encode("utf-8"))
    content.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        content.extend(f"{offset:010d} 00000 n \n".encode("utf-8"))

    content.extend(
        (
            "trailer\n"
            f"<< /Size {len(offsets)} /Root 1 0 R >>\n"
            f"startxref\n{xref_pos}\n%%EOF\n"
        ).encode("utf-8")
    )
    path.write_bytes(content)


def _write_minimal_docx(path: Path, text: str) -> None:
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body>"
        f"<w:p><w:r><w:t>{escape(text)}</w:t></w:r></w:p>"
        "<w:sectPr>"
        '<w:pgSz w:w="12240" w:h="15840"/>'
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" '
        'w:header="720" w:footer="720" w:gutter="0"/>'
        "</w:sectPr>"
        "</w:body>"
        "</w:document>"
    )
    content_types_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>"
    )
    rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/>'
        "</Relationships>"
    )
    doc_rels_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
    )

    with ZipFile(path, "w", compression=ZIP_DEFLATED) as docx:
        docx.writestr("[Content_Types].xml", content_types_xml)
        docx.writestr("_rels/.rels", rels_xml)
        docx.writestr("word/document.xml", document_xml)
        docx.writestr("word/_rels/document.xml.rels", doc_rels_xml)


def generate_test_spells(
    tmp_path: Path, md_count: int, pdf_count: int, docx_count: int
) -> list[Path]:
    """Generate sample spell files for batch testing."""
    files = []
    for i in range(md_count):
        path = tmp_path / f"spell_md_{i:04d}.md"
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

    for i in range(pdf_count):
        level = i % 9 + 1
        path = tmp_path / f"spell_pdf_{i:04d}.pdf"
        _write_minimal_pdf(
            path,
            f"Test PDF Spell {i}\nLevel: {level}\nA short PDF description for spell {i}.",
        )
        files.append(path)

    for i in range(docx_count):
        level = i % 9 + 1
        path = tmp_path / f"spell_docx_{i:04d}.docx"
        _write_minimal_docx(
            path,
            f"Test DOCX Spell {i}\nLevel: {level}\nA short DOCX description for spell {i}.",
        )
        files.append(path)

    return files


def test_parse_1000_mixed_files(tmp_path: Path):
    """Ensure parsing mixed files completes reasonably fast."""
    sidecar = _load_sidecar_module()
    pdf_available = sidecar.extract_pdf_text is not None
    docx_available = sidecar.Document is not None
    expected_pdf_count = 100 if pdf_available else 0
    expected_docx_count = 100 if docx_available else 0
    expected_md_count = 1000 - expected_pdf_count - expected_docx_count
    files = generate_test_spells(
        tmp_path,
        md_count=expected_md_count,
        pdf_count=expected_pdf_count,
        docx_count=expected_docx_count,
    )

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
    assert elapsed < 30, f"Took {elapsed:.1f}s, expected <30s"

    spells = response["result"]["spells"]
    assert len(spells) == 1000
    assert not response["result"]["conflicts"]

    actual_md_count = 0
    actual_pdf_count = 0
    actual_docx_count = 0

    # Verify critical fields extracted
    for spell in spells:
        source_file = spell.get("_source_file", "")
        if source_file.endswith(".md"):
            actual_md_count += 1
        elif source_file.endswith(".pdf"):
            actual_pdf_count += 1
        elif source_file.endswith(".docx"):
            actual_docx_count += 1

        assert spell.get("name"), "Missing spell name"
        assert spell.get("level") is not None, "Missing spell level"
        assert spell.get("description"), "Missing spell description"

    assert actual_md_count == expected_md_count
    assert actual_pdf_count == expected_pdf_count
    assert actual_docx_count == expected_docx_count


def test_confidence_scores_present(tmp_path: Path):
    """Verify that confidence scores are returned for parsed spells."""
    files = generate_test_spells(tmp_path, md_count=5, pdf_count=0, docx_count=0)

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
