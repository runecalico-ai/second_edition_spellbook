import argparse
import json
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any

from pdfminer.high_level import extract_text
from docx import Document
import yaml


CANONICAL_FIELDS = {
    "name",
    "school",
    "sphere",
    "class_list",
    "level",
    "range",
    "components",
    "material_components",
    "casting_time",
    "duration",
    "area",
    "saving_throw",
    "description",
    "source",
    "tags",
    "edition",
    "author",
    "license",
    "reversible",
}

FIELD_ALIASES = {
    "classes": "class_list",
    "class": "class_list",
    "level": "level",
    "lvl": "level",
    "school": "school",
    "sphere": "sphere",
    "range": "range",
    "components": "components",
    "material components": "material_components",
    "material_components": "material_components",
    "casting time": "casting_time",
    "casting_time": "casting_time",
    "duration": "duration",
    "area": "area",
    "area/target": "area",
    "target": "area",
    "saving throw": "saving_throw",
    "saving_throw": "saving_throw",
    "description": "description",
    "source": "source",
    "author": "author",
    "license": "license",
    "reversible": "reversible",
    "tags": "tags",
    "edition": "edition",
    "name": "name",
    "title": "name",
}


@dataclass
class ParsedSpell:
    name: str
    description: str
    school: str | None = None
    sphere: str | None = None
    class_list: str | None = None
    level: int | None = None
    range: str | None = None
    components: str | None = None
    material_components: str | None = None
    casting_time: str | None = None
    duration: str | None = None
    area: str | None = None
    saving_throw: str | None = None
    source: str | None = None
    tags: list[str] = field(default_factory=list)
    edition: str | None = None
    author: str | None = None
    license: str | None = None
    reversible: bool | None = None
    raw_fields: dict[str, Any] = field(default_factory=dict)


def _normalize_key(key: str) -> str:
    return key.strip().lower().replace("_", " ")


def normalize_fields(raw_fields: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key, value in raw_fields.items():
        if value is None:
            continue
        normalized_key = FIELD_ALIASES.get(_normalize_key(str(key)), _normalize_key(str(key)))
        if normalized_key in CANONICAL_FIELDS:
            normalized[normalized_key] = value
    return normalized


def _extract_front_matter(text: str) -> tuple[dict[str, Any], str]:
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, text
    front_lines = []
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            body = "\n".join(lines[i + 1 :])
            return yaml.safe_load("\n".join(front_lines)) or {}, body
        front_lines.append(lines[i])
    return {}, text


def _first_nonempty_line(text: str) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return ""


def _heading_name(text: str) -> str | None:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped.lstrip("#").strip()
    return None


def parse_markdown(path: Path) -> ParsedSpell:
    text = path.read_text(encoding="utf-8", errors="ignore")
    raw_front, body = _extract_front_matter(text)
    normalized = normalize_fields(raw_front)
    name = normalized.get("name") or _heading_name(body) or path.stem
    description = normalized.get("description") or body.strip()
    tags = normalized.get("tags") or []
    if isinstance(tags, str):
        tags = [t.strip() for t in tags.split(",") if t.strip()]
    spell = ParsedSpell(
        name=name,
        description=description,
        school=normalized.get("school"),
        sphere=normalized.get("sphere"),
        class_list=normalized.get("class_list"),
        level=_coerce_int(normalized.get("level")),
        range=normalized.get("range"),
        components=normalized.get("components"),
        material_components=normalized.get("material_components"),
        casting_time=normalized.get("casting_time"),
        duration=normalized.get("duration"),
        area=normalized.get("area"),
        saving_throw=normalized.get("saving_throw"),
        source=normalized.get("source"),
        tags=tags,
        edition=normalized.get("edition"),
        author=normalized.get("author"),
        license=normalized.get("license"),
        reversible=_coerce_bool(normalized.get("reversible")),
        raw_fields=raw_front,
    )
    return spell


def parse_pdf(path: Path) -> ParsedSpell:
    text = extract_text(str(path)) or ""
    name = _first_nonempty_line(text) or path.stem
    description = text.strip()
    return ParsedSpell(
        name=name,
        description=description,
        raw_fields={},
    )


def parse_docx(path: Path) -> ParsedSpell:
    doc = Document(str(path))
    lines = [p.text for p in doc.paragraphs if p.text.strip()]
    text = "\n".join(lines)
    name = lines[0] if lines else path.stem
    description = text.strip()
    return ParsedSpell(
        name=name,
        description=description,
        raw_fields={},
    )


def _coerce_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _coerce_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"yes", "true", "1"}:
            return True
        if lowered in {"no", "false", "0"}:
            return False
    return None


def parse_file(path: Path) -> ParsedSpell:
    suffix = path.suffix.lower()
    if suffix in {".md", ".markdown"}:
        return parse_markdown(path)
    if suffix == ".pdf":
        return parse_pdf(path)
    if suffix == ".docx":
        return parse_docx(path)
    raise ValueError(f"Unsupported file type: {suffix}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Spellbook import sidecar")
    subparsers = parser.add_subparsers(dest="command", required=True)

    parse_parser = subparsers.add_parser("parse", help="Parse spell files")
    parse_parser.add_argument("paths", nargs="+", help="Paths to spell files")

    args = parser.parse_args()

    if args.command == "parse":
        spells = []
        for path_str in args.paths:
            path = Path(path_str)
            spell = parse_file(path)
            payload = asdict(spell)
            payload["source_path"] = str(path)
            spells.append(payload)
        print(json.dumps(spells))


if __name__ == "__main__":
    main()
