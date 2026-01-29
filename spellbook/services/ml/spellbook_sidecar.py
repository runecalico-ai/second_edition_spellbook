import hashlib
import json
import os
import re
import sys
import uuid
from datetime import datetime
from html import escape as html_escape
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

    level_val = str(meta.get("level") or 0).lower().strip()
    is_quest = 0
    is_cantrip = 0

    if level_val == "cantrip":
        level = 0
        is_cantrip = 1
    elif level_val == "quest":
        level = 8
        is_quest = 1
    elif level_val == "8" and meta.get("sphere"):
        level = 8
        is_quest = 1
    else:
        try:
            level = int(level_val)
            if level == 0 and str(meta.get("is_cantrip", "0")).lower() in {
                "1",
                "true",
                "yes",
            }:
                is_cantrip = 1
        except ValueError:
            level = 0

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
        "reversible": (
            1 if str(meta.get("reversible", "0")).lower() in {"1", "true", "yes"} else 0
        ),
        "description": description or "",
        "tags": meta.get("tags"),
        "source": meta.get("source"),
        "edition": meta.get("edition"),
        "author": meta.get("author"),
        "license": meta.get("license"),
        "is_quest_spell": is_quest,
        "is_cantrip": is_cantrip,
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
    mode = params.get("mode") or "list"
    layout = params.get("layout") or "compact"
    character = params.get("character") or {}
    class_name = params.get("class_name")  # For spellbook pack
    output_dir = Path(params.get("output_dir") or os.getcwd())
    output_dir.mkdir(parents=True, exist_ok=True)

    unique_id = uuid.uuid4().hex
    filename = f"spellbook_export_{unique_id}.{fmt}"
    output_path = output_dir / filename

    if fmt == "md":
        if mode == "character_sheet":
            text = _render_character_sheet_markdown(character)
        elif mode == "spellbook_pack":
            text = _render_spellbook_pack_markdown(spells, character, class_name)
        else:
            # Default/List mode
            lines = []
            for spell in spells:
                lines.append(f"# {spell.get('name')}")
                lines.append("")
                lines.append(spell.get("description", "").strip())
                lines.append("")
            text = "\n".join(lines).strip() + "\n"

        output_path.write_text(text, encoding="utf-8")
        return {"path": str(output_path), "format": "md"}

    if fmt == "html":
        html_path = output_dir / f"spellbook_export_{unique_id}.html"
        html = _render_print_html(spells, mode, layout, character)
        html_path.write_text(html, encoding="utf-8")
        return {"path": str(html_path), "format": "html"}

    if fmt == "pdf":
        # Generate print-optimized HTML instead of PDF
        # Users can use browser "Print to PDF" for actual PDF output
        html_path = output_dir / f"spellbook_export_{unique_id}.html"
        if mode == "character_sheet":
            html = _render_character_sheet_html(character)
        elif mode == "spellbook_pack":
            html = _render_spellbook_pack_html(spells, character, class_name, layout)
        else:
            html = _render_print_html(spells, mode, layout, character)

        html_path.write_text(html, encoding="utf-8")

        # Return HTML path with note that it's print-optimized
        return {
            "path": str(html_path),
            "format": "html",
            "note": "Print-optimized HTML generated. Use browser 'Print to PDF' for PDF output.",
        }

    raise ValueError(f"Unsupported export format: {fmt}")


def _render_print_html(
    spells: List[Dict[str, Any]],
    mode: str,
    layout: str,
    character: Dict[str, Any],
) -> str:
    title = "Spellbook Print"
    if mode == "single" and spells:
        title = spells[0].get("name") or title
    elif mode == "spellbook":
        title = character.get("name") or title

    body_parts: List[str] = []
    if mode == "spellbook":
        body_parts.append(_render_spellbook_header(character))
    for spell in spells:
        body_parts.append(_render_spell_block(spell, layout, mode))

    body = "\n".join(body_parts)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{html_escape(title)}</title>
  <style>
    body {{
      font-family: "Inter", "Segoe UI", sans-serif;
      color: #111;
      margin: 32px;
    }}
    h1, h2, h3 {{
      margin: 0 0 8px 0;
    }}
    .meta {{
      color: #555;
      font-size: 12px;
      margin-bottom: 12px;
    }}
    .spell {{
      border-bottom: 1px solid #ddd;
      padding: 16px 0;
      page-break-inside: avoid;
    }}
    .spell:last-child {{
      border-bottom: none;
    }}
    .spell-header {{
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
    }}
    .pill {{
      display: inline-block;
      background: #f2f2f2;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      margin-right: 6px;
    }}
    .details-table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }}
    .details-table td {{
      padding: 4px 6px;
      border: 1px solid #e2e2e2;
    }}
    .notes {{
      margin-top: 8px;
      font-size: 12px;
      color: #444;
    }}
  </style>
</head>
    {body}
</body>
</html>
"""


def _render_character_sheet_html(character: Dict[str, Any]) -> str:
    name = html_escape(character.get("name") or "Unnamed Character")
    char_type = html_escape(character.get("characterType") or "PC")
    race = html_escape(character.get("race") or "-")
    alignment = html_escape(character.get("alignment") or "-")
    notes = html_escape(character.get("notes") or "")

    include_com = character.get("includeCom", False)
    include_notes = character.get("includeNotes", True)

    # Abilities
    abilities = character.get("abilities") or {}

    # Classes
    classes = character.get("classes") or []

    # Spells grouped by class
    all_spells = character.get("characterSpells") or []
    spells_by_class: Dict[str, List[Dict[str, Any]]] = {}
    for spell in all_spells:
        cls_name = spell.get("className") or "Other"
        if cls_name not in spells_by_class:
            spells_by_class[cls_name] = []
        spells_by_class[cls_name].append(spell)

    sections_html = ""
    for cls in classes:
        c_name = cls.get("className") or "Unknown"
        c_lbl = cls.get("classLabel") or c_name
        c_lvl = cls.get("level") or 1

        cls_spells = spells_by_class.get(c_name, [])
        spell_table = ""
        if cls_spells:
            spell_rows = ""
            for s in cls_spells:
                s_name = html_escape(s.get("name") or "Untitled")
                s_lvl = s.get("level") or 0
                s_type = "Prepared" if s.get("prepared") else "Known"
                s_notes = html_escape(s.get("notes") or "") if include_notes else ""
                notes_cell = (
                    f"<br/><small><em>{s_notes}</em></small>" if s_notes else ""
                )

                spell_rows += f"<tr><td>{s_name}{notes_cell}</td><td>{s_lvl}</td><td>{s_type}</td></tr>"

            spell_table = f"""
            <table class="spell-table">
                <thead><tr><th>Spell</th><th>Lvl</th><th>Status</th></tr></thead>
                <tbody>{spell_rows}</tbody>
            </table>
            """

        sections_html += f"""
        <div class="section">
            <h2>{html_escape(c_lbl)} (Level {c_lvl})</h2>
            {spell_table if spell_table else "<p>No spells recorded.</p>"}
        </div>
        """

    com_box = ""
    if include_com:
        com_box = f'<div class="ability-box"><div class="ability-val">{abilities.get("com", 10)}</div><div class="ability-lbl">COM</div></div>'

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{name} - Character Sheet</title>
  <style>
    body {{ font-family: "Inter", -apple-system, sans-serif; color: #111; margin: 40px; line-height: 1.5; }}
    h1 {{ border-bottom: 2px solid #333; padding-bottom: 8px; margin-top: 0; }}
    h2 {{ background: #f4f4f4; padding: 6px 12px; margin-top: 24px; font-size: 1.2rem; border-left: 4px solid #333; }}
    .header-grid {{ display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px; }}
    .ability-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(60px, 1fr)); gap: 8px; text-align: center; }}
    .ability-box {{ border: 1px solid #ccc; padding: 10px 4px; border-radius: 6px; background: #fafafa; }}
    .ability-val {{ font-size: 20px; font-weight: bold; color: #222; }}
    .ability-lbl {{ font-size: 11px; text-transform: uppercase; color: #666; font-weight: 600; margin-top: 2px; }}
    .section {{ margin-bottom: 30px; }}
    .spell-table {{ width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }}
    .spell-table th {{ text-align: left; background: #eee; padding: 6px 8px; border: 1px solid #ddd; }}
    .spell-table td {{ padding: 6px 8px; border: 1px solid #ddd; vertical-align: top; }}
    .notes-box {{ border: 1px solid #ddd; padding: 12px; background: #fffcf0; white-space: pre-wrap; margin-top: 10px; font-size: 14px; }}
    @media print {{
      body {{ margin: 0; }}
      .section {{ page-break-inside: avoid; }}
    }}
  </style>
</head>
<body>
  <h1>{name}</h1>

  <div class="header-grid">
    <div><strong>Type:</strong> {char_type}</div>
    <div><strong>Race:</strong> {race}</div>
    <div><strong>Alignment:</strong> {alignment}</div>
  </div>

  <div class="section">
    <div class="ability-grid">
      <div class="ability-box"><div class="ability-val">{abilities.get("str", 10)}</div><div class="ability-lbl">STR</div></div>
      <div class="ability-box"><div class="ability-val">{abilities.get("dex", 10)}</div><div class="ability-lbl">DEX</div></div>
      <div class="ability-box"><div class="ability-val">{abilities.get("con", 10)}</div><div class="ability-lbl">CON</div></div>
      <div class="ability-box"><div class="ability-val">{abilities.get("int", 10)}</div><div class="ability-lbl">INT</div></div>
      <div class="ability-box"><div class="ability-val">{abilities.get("wis", 10)}</div><div class="ability-lbl">WIS</div></div>
      <div class="ability-box"><div class="ability-val">{abilities.get("cha", 10)}</div><div class="ability-lbl">CHA</div></div>
      {com_box}
    </div>
  </div>

  {sections_html}

  {f'<div class="section"><h2>Notes</h2><div class="notes-box">{notes}</div></div>' if include_notes and notes else ""}
</body>
</html>
"""


def _render_spellbook_pack_html(
    spells: List[Dict[str, Any]],
    character: Dict[str, Any],
    class_name: str,
    layout: str,
) -> str:
    char_name = html_escape(character.get("name") or "Character")
    title = f"{char_name}'s Spellbook - {html_escape(class_name or 'General')}"

    spell_blocks = []
    for spell in spells:
        spell_blocks.append(_render_spell_block(spell, layout, "pack"))

    body = "\n".join(spell_blocks)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{title}</title>
  <style>
    body {{ font-family: "Inter", sans-serif; color: #111; margin: 32px; }}
    h1 {{ margin: 0 0 4px 0; }}
    .subtitle {{ color: #555; margin-bottom: 24px; font-style: italic; }}
    .spell {{ border-bottom: 1px solid #ddd; padding: 16px 0; page-break-inside: avoid; }}
    .spell-header {{ display: flex; justify-content: space-between; align-items: baseline; }}
    .pill {{ background: #f2f2f2; border-radius: 999px; padding: 2px 8px; font-size: 11px; }}
    .details-table {{ width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }}
    .details-table td {{ padding: 4px 6px; border: 1px solid #e2e2e2; }}
  </style>
</head>
<body>
  <h1>{char_name}'s Spellbook</h1>
  <div class="subtitle">Class: {html_escape(class_name or 'All')}</div>
  {body}
</body>
</html>
"""


def _render_spellbook_header(character: Dict[str, Any]) -> str:
    name = html_escape(character.get("name") or "Spellbook")
    character_type = html_escape(
        character.get("type") or character.get("characterType") or ""
    )
    notes = html_escape(character.get("notes") or "")
    meta = f"{character_type} Spellbook" if character_type else "Spellbook"
    notes_block = f"<p class='meta'>{notes}</p>" if notes else ""
    return f"<h1>{name}</h1><p class='meta'>{meta}</p>{notes_block}"


def _render_spell_block(spell: Dict[str, Any], layout: str, mode: str) -> str:
    name = html_escape(spell.get("name") or "Untitled")
    school_raw = spell.get("school") or ""
    level_raw = str(spell.get("level") or "")
    school = html_escape(school_raw)
    level = html_escape(level_raw)
    description = html_escape(spell.get("description") or "").replace("\n", "<br/>")
    class_list = html_escape(spell.get("class_list") or spell.get("classList") or "")
    range_text = html_escape(spell.get("range") or "")
    components = html_escape(spell.get("components") or "")
    duration = html_escape(spell.get("duration") or "")
    saving_throw = html_escape(
        spell.get("saving_throw") or spell.get("savingThrow") or ""
    )
    prepared = spell.get("prepared")
    known = spell.get("known")
    notes = html_escape(spell.get("notes") or "")

    status_bits = []
    if mode == "spellbook":
        if prepared is not None:
            status_bits.append("Prepared" if prepared else "Unprepared")
        if known is not None:
            status_bits.append("Known" if known else "Unknown")
    status_html = " • ".join(status_bits)
    status_block = f"<div class='meta'>{status_html}</div>" if status_html else ""

    if layout == "compact":
        details = " ".join(filter(None, [school_raw, f"Level {level_raw}"]))
        pill = f"<span class='pill'>{html_escape(details)}</span>" if details else ""
        meta_line = " | ".join(
            filter(None, [class_list, range_text, components, duration])
        )
        notes_block = (
            f"<div class='notes'><strong>Notes:</strong> {notes}</div>" if notes else ""
        )
        return f"""
<section class="spell">
  <div class="spell-header">
    <h2>{name}</h2>
    {pill}
  </div>
  {status_block}
  <div class="meta">{html_escape(meta_line)}</div>
  <div>{description}</div>
  {notes_block}
</section>
"""

    notes_block = (
        f"<div class='notes'><strong>Notes:</strong> {notes}</div>" if notes else ""
    )
    return f"""
<section class="spell">
  <div class="spell-header">
    <h2>{name}</h2>
    <span class="pill">{school} • Level {level}</span>
  </div>
  {status_block}
  <table class="details-table">
    <tr><td>Classes</td><td>{class_list}</td></tr>
    <tr><td>Range</td><td>{range_text}</td></tr>
    <tr><td>Components</td><td>{components}</td></tr>
    <tr><td>Duration</td><td>{duration}</td></tr>
    <tr><td>Saving Throw</td><td>{saving_throw}</td></tr>
  </table>
  <div style="margin-top: 10px;">{description}</div>
  {notes_block}
</section>
"""


def _render_character_sheet_markdown(character: Dict[str, Any]) -> str:
    name = character.get("name") or "Unnamed Character"
    char_type = character.get("characterType") or "PC"
    race = character.get("race") or "-"
    alignment = character.get("alignment") or "-"
    notes = character.get("notes") or ""

    include_com = character.get("includeCom", False)
    include_notes = character.get("includeNotes", True)

    lines = []
    lines.append(f"# {name}")
    lines.append(
        f"**Type:** {char_type} | **Race:** {race} | **Alignment:** {alignment}"
    )
    lines.append("")

    # Abilities
    abilities = character.get("abilities") or {}
    lines.append("## Abilities")
    if include_com:
        lines.append("| STR | DEX | CON | INT | WIS | CHA | COM |")
        lines.append("|:---:|:---:|:---:|:---:|:---:|:---:|:---:|")
        lines.append(
            f"| {abilities.get('str', 10)} | {abilities.get('dex', 10)} | {abilities.get('con', 10)} | {abilities.get('int', 10)} | {abilities.get('wis', 10)} | {abilities.get('cha', 10)} | {abilities.get('com', 10)} |"
        )
    else:
        lines.append("| STR | DEX | CON | INT | WIS | CHA |")
        lines.append("|:---:|:---:|:---:|:---:|:---:|:---:|")
        lines.append(
            f"| {abilities.get('str', 10)} | {abilities.get('dex', 10)} | {abilities.get('con', 10)} | {abilities.get('int', 10)} | {abilities.get('wis', 10)} | {abilities.get('cha', 10)} |"
        )
    lines.append("")

    # Spells grouped by class
    all_spells = character.get("characterSpells") or []
    spells_by_class: Dict[str, List[Dict[str, Any]]] = {}
    for spell in all_spells:
        cls_name = spell.get("className") or "Other"
        if cls_name not in spells_by_class:
            spells_by_class[cls_name] = []
        spells_by_class[cls_name].append(spell)

    # Classes & Spell Tables
    lines.append("## Classes")
    classes = character.get("classes") or []
    if not classes:
        lines.append("*No classes assigned.*")
    else:
        for cls in classes:
            c_name = cls.get("className") or "Unknown"
            c_lbl = cls.get("classLabel") or c_name
            c_lvl = cls.get("level") or 1
            lines.append(f"### {c_lbl} (Level {c_lvl})")

            cls_spells = spells_by_class.get(c_name, [])
            if cls_spells:
                lines.append("| Spell | Lvl | Status |")
                lines.append("|:---|:---:|:---|")
                for s in cls_spells:
                    s_name = s.get("name") or "Untitled"
                    s_lvl = s.get("level") or 0
                    s_type = "Prepared" if s.get("prepared") else "Known"
                    row = f"| {s_name} | {s_lvl} | {s_type} |"
                    lines.append(row)
                    if include_notes and s.get("notes"):
                        lines.append(f"| > *Notes:* | | *{s.get('notes')}* |")
            else:
                lines.append("*No spells recorded.*")
            lines.append("")

    # Notes
    if include_notes and notes:
        lines.append("## Notes")
        lines.append(notes)
        lines.append("")

    return "\n".join(lines)


def _render_spellbook_pack_markdown(
    spells: List[Dict[str, Any]], character: Dict[str, Any], class_name: str
) -> str:
    char_name = character.get("name") or "Character"
    title = f"{char_name}'s Spellbook - {class_name or 'General'}"
    layout = (
        character.get("layout") or "compact"
    )  # Passed via character object in pack mode
    include_notes = character.get("includeNotes", True)

    lines = []
    lines.append(f"# {title}")
    lines.append("")

    for spell in spells:
        name = spell.get("name") or "Untitled"
        level = spell.get("level") or 0
        school = spell.get("school") or ""
        desc = spell.get("description") or ""

        lines.append(f"## {name}")

        if layout == "full":
            lines.append(f"**Level:** {level} | **School:** {school}")
            lines.append(
                f"**Range:** {spell.get('range', '-')} | **Duration:** {spell.get('duration', '-')}"
            )
            lines.append(f"**Components:** {spell.get('components', '-')}")
            lines.append("")
            lines.append(desc.strip())
        else:
            # Compact
            lines.append(f"*Level {level} {school}*")
            lines.append("")
            # Short description if too long? Or just full description. Compact usually still needs the text.
            lines.append(desc.strip())

        notes = spell.get("notes")
        if include_notes and notes:
            lines.append("")
            lines.append(f"> **Notes:** {notes}")

        lines.append("")
        lines.append("---")
        lines.append("")

    return "\n".join(lines)


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
