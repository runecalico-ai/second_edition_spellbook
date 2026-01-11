import json
import os
import sys
import uuid
import hashlib
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

# Optional imports for parsers (dependencies should be installed)
try:
    from pdfminer.high_level import extract_text as extract_pdf_text
except ImportError:
    extract_pdf_text = None

try:
    from docx import Document  # type: ignore
except ImportError:
    Document = None


def _now_iso() -> str:
    return datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")


def _read_request() -> Dict[str, Any]:
    raw = sys.stdin.readline()
    if not raw:
        raise RuntimeError("No input")
    return json.loads(raw)


def _write_response(payload: Dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def _zero_vector(size: int = 384) -> List[float]:
    return [0.0] * size


def _compute_hash(path: Path) -> str:
    sha256 = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            sha256.update(chunk)
    return sha256.hexdigest()


def _parse_front_matter(text: str) -> Dict[str, Any]:
    if not text.startswith("---"):
        return {}
    parts = text.split("---", 2)
    if len(parts) < 3:
        return {}
    front = parts[1]
    data: Dict[str, Any] = {}
    for line in front.splitlines():
        if not line.strip() or ":" not in line:
            continue
        key, value = line.split(":", 1)
        data[key.strip()] = value.strip()
    return data


def _spell_from_markdown(path: Path) -> Dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    meta = _parse_front_matter(text)
    description = text
    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) == 3:
            description = parts[2].strip()
    name = meta.get("name") or path.stem.replace("_", " ").title()
    level = int(meta.get("level") or 0)

    # Confidence scoring: 1.0 if field is in metadata, lower if heuristic/fallback
    confidence: Dict[str, float] = {}
    confidence["name"] = 1.0 if meta.get("name") else 0.3
    confidence["level"] = 1.0 if meta.get("level") else 0.2
    confidence["school"] = 1.0 if meta.get("school") else 0.0
    confidence["description"] = 0.9 if description else 0.1
    confidence["source"] = 1.0 if meta.get("source") else 0.0
    confidence["sphere"] = 1.0 if meta.get("sphere") else 0.0
    confidence["class_list"] = (
        1.0 if meta.get("class_list") or meta.get("classes") else 0.0
    )
    confidence["range"] = 1.0 if meta.get("range") else 0.0
    confidence["components"] = 1.0 if meta.get("components") else 0.0
    confidence["duration"] = 1.0 if meta.get("duration") else 0.0

    return {
        "name": name,
        "school": meta.get("school"),
        "sphere": meta.get("sphere"),
        "class_list": meta.get("class_list") or meta.get("classes"),
        "level": level,
        "range": meta.get("range"),
        "components": meta.get("components"),
        "material_components": meta.get("material_components"),
        "casting_time": meta.get("casting_time"),
        "duration": meta.get("duration"),
        "area": meta.get("area"),
        "saving_throw": meta.get("saving_throw"),
        "reversible": 1
        if str(meta.get("reversible", "0")).lower() in {"1", "true", "yes"}
        else 0,
        "description": description or "",
        "tags": meta.get("tags"),
        "source": meta.get("source"),
        "edition": meta.get("edition"),
        "author": meta.get("author"),
        "license": meta.get("license"),
        "_confidence": confidence,
        "_raw_text": text,
        "_source_file": str(path),
    }


def _spell_from_pdf(path: Path) -> Dict[str, Any]:
    if not extract_pdf_text:
        raise ImportError("pdfminer.six not installed")
    text = extract_pdf_text(str(path))
    # Heuristic: First line is name? Or filename fallback.
    # Level extraction heuristic
    level = 0
    level_match = re.search(r"(?:Level|Lvl)[:\s]*(\d+)", text, re.IGNORECASE)
    if level_match:
        level = int(level_match.group(1))

    # Confidence scoring: PDF parsing is less reliable
    confidence: Dict[str, float] = {
        "name": 0.3,  # Derived from filename
        "level": 0.6 if level_match else 0.1,
        "description": 0.7 if text.strip() else 0.1,
        "source": 0.5,
        "school": 0.0,
        "sphere": 0.0,
        "class_list": 0.0,
    }

    return {
        "name": path.stem.replace("_", " ").title(),
        "level": level,
        "description": text.strip(),
        "source": "PDF Import",
        "_confidence": confidence,
        "_raw_text": text,
        "_source_file": str(path),
    }


def _spell_from_docx(path: Path) -> Dict[str, Any]:
    if not Document:
        raise ImportError("python-docx not installed")
    doc = Document(str(path))
    text_chunks = [p.text for p in doc.paragraphs]
    text = "\n\n".join(text_chunks)

    level = 0
    level_match = re.search(r"(?:Level|Lvl)[:\s]*(\d+)", text, re.IGNORECASE)
    if level_match:
        level = int(level_match.group(1))

    # Confidence scoring: DOCX parsing is less reliable
    confidence: Dict[str, float] = {
        "name": 0.3,  # Derived from filename
        "level": 0.6 if level_match else 0.1,
        "description": 0.7 if text.strip() else 0.1,
        "source": 0.5,
        "school": 0.0,
        "sphere": 0.0,
        "class_list": 0.0,
    }

    return {
        "name": path.stem.replace("_", " ").title(),
        "level": level,
        "description": text.strip(),
        "source": "DOCX Import",
        "_confidence": confidence,
        "_raw_text": text,
        "_source_file": str(path),
    }


def handle_embed(params: Dict[str, Any]) -> Dict[str, Any]:
    texts = params.get("texts") or []
    return {"vectors": [_zero_vector() for _ in texts]}


def handle_llm_answer(params: Dict[str, Any]) -> Dict[str, Any]:
    query = params.get("query") or ""
    contexts = params.get("contexts") or []
    citations = [c.get("citation") for c in contexts if c.get("citation")]
    answer = "(stub) Local-only answer for: " + query
    return {"answer": answer, "citations": citations, "meta": {"model": "stub"}}


def handle_import(params: Dict[str, Any]) -> Dict[str, Any]:
    files = params.get("files") or []
    spells: List[Dict[str, Any]] = []
    artifacts: List[Dict[str, Any]] = []
    conflicts: List[Dict[str, Any]] = []

    for file_path in files:
        path = Path(file_path)
        if not path.exists():
            conflicts.append({"path": file_path, "reason": "missing"})
            continue

        ext = path.suffix.lower()
        file_hash = _compute_hash(path)
        spell: Dict[str, Any] = {}

        try:
            if ext == ".md":
                spell = _spell_from_markdown(path)
            elif ext == ".pdf":
                spell = _spell_from_pdf(path)
            elif ext == ".docx":
                spell = _spell_from_docx(path)
            else:
                conflicts.append({"path": str(path), "reason": "unsupported_extension"})
                continue
        except Exception as e:
            conflicts.append({"path": str(path), "reason": f"parsing_error: {str(e)}"})
            continue

        spells.append(spell)
        artifacts.append(
            {
                "type": ext.lstrip("."),
                "path": str(path),
                "hash": file_hash,
                "imported_at": _now_iso(),
            }
        )

    return {"spells": spells, "artifacts": artifacts, "conflicts": conflicts}


def handle_export(params: Dict[str, Any]) -> Dict[str, Any]:
    spells = params.get("spells") or []
    fmt = params.get("format") or "md"
    output_dir = Path(params.get("output_dir") or os.getcwd())
    output_dir.mkdir(parents=True, exist_ok=True)
    filename = f"spellbook_export_{uuid.uuid4().hex}.{fmt}"
    output_path = output_dir / filename

    if fmt == "md":
        lines = []
        for spell in spells:
            lines.append(f"# {spell.get('name')}")
            lines.append("")
            lines.append(spell.get("description", "").strip())
            lines.append("")
        output_path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")
    else:
        output_path.write_text("PDF export placeholder\n", encoding="utf-8")

    return {"path": str(output_path)}


def main() -> None:
    try:
        request = _read_request()
        method = request.get("method")
        params = request.get("params") or {}
        handlers = {
            "embed": handle_embed,
            "llm_answer": handle_llm_answer,
            "import": handle_import,
            "export": handle_export,
        }
        if method not in handlers:
            raise ValueError(f"Unknown method: {method}")
        result = handlers[method](params)
        response = {"jsonrpc": "2.0", "id": request.get("id"), "result": result}
    except Exception as exc:
        response = {
            "jsonrpc": "2.0",
            "id": None,
            "error": {"message": str(exc)},
        }
    _write_response(response)


if __name__ == "__main__":
    main()
