# Design: Canon-First Default and Optional Structured Layer

This document spells out three design options for the Spell Editor: default to canon text, with structured editing as an optional layer.

**Chosen direction: Option B (Hybrid single-line + expand/collapse).** Implementation will start with Option B: one single-line text input per canon field (Range, Components, Duration, etc.), with a per-field expand control that reveals the full structured form. Sync: collapsed = text is source; expanded = parse text into spec (or use canonical_data); on collapse, only when the user edited the structured form (dirty) serialize spec back to the line, otherwise leave the canon line unchanged.

**Single expand:** Only one detail field MAY be expanded at a time. When the user expands another field, the currently expanded field MUST collapse first (if that field is dirty, update its line from the spec before collapsing; otherwise leave the line unchanged). This keeps the page simple and avoids multiple structured forms visible at once.

---

## Canon Text Block (What Users See by Default)

Regardless of option, the **default** editor view should present a block that mirrors the book. Example for a cantrip:

```
Range: Touch
Components: V, S
Duration: 1 round/level
Casting Time: 1
Area of Effect: Special
Saving Throw: None

[Description paragraph(s)]
```

Fields to expose as canon text (labels + single-line or short text). The UI MUST display them in this order (so layout is consistent and testable):

-   **Range**
-   **Components** (and optionally Material description if needed)
-   **Duration**
-   **Casting Time**
-   **Area of Effect** (or "Area")
-   **Saving Throw**
-   **Damage** (always shown; empty when no value, as a visual aid)
-   **Magic Resistance** (always shown; empty when no value, as a visual aid)
-   **Description** (existing textarea)

The implementation MAY expose **Material Component** as a separate canon row (single-line input + expand control); when implemented, the same collapse/expand and dirty serialization rules apply as for other detail fields (e.g. Components). The optional row, when present, appears after the eight standard rows and before Tags.

The rest of the editor (name, level, school, sphere, class list, source, edition, author, license, tags, reversible, quest, cantrip) is unchanged and out of scope for canon-first UX; canon-first applies only to this details block.

Data flow remains: these strings are stored in the flat columns; backend (and optional background job) can parse them to fill `canonical_data` for hashing/search. The editor does not require the user to touch structured form for normal editing.

---

## Option A: Text-Only Default + Explicit "Edit as Structured"

**Idea:** Default view is **only** the canon text block (one text input or textarea per line, or a single block with labeled lines). No structured controls visible. A clear affordance (e.g. "Edit as structured" link or button per field, or one per section) reveals the full structured form.

**Behavior:**

-   **Default:** User sees and edits only the text lines (e.g. "Duration: 1 round/level"). Save persists these strings. Optionally, on save, backend runs parsers and updates `canonical_data` when parse succeeds.
-   **When user chooses "Edit as structured"** (per field or for a group):
  - Entering structured mode: If current value is text-only, run parser (existing Tauri commands) and show structured form with parsed result (or "special" + `raw_legacy_value` on failure).
  - Exiting structured mode: Serialize current spec to text via existing `*ToText()` helpers and write that back into the canon text field.
-   **Sync:** Text is source of truth when in text mode; when leaving structured mode, spec becomes source for that field’s text line.

**Pros:** Simple mental model; canon-first is obvious. **Cons:** Extra click to get to structured; per-field vs per-section is a UX choice to define.

---

## Option B: Hybrid Single-Line + Expand/Collapse

**Idea:** Each canon slot (Range, Duration, etc.) is a **single-line text input** that always shows the book-style line (e.g. "1 round/level"). Below it, an optional **expand** control reveals the full structured form (StructuredFieldInput, AreaForm, etc.) for that field. When collapsed, the line is the primary editable surface; when expanded, the user edits the spec and the line can be updated from the spec (e.g. on blur or on collapse).

**Behavior:**

-   **Default (collapsed):** One line per field. User types "Touch" or "1 round/level" directly. Save stores these strings. For **Components**, the collapsed line is a single line (e.g. "V, S, M" or "V, S, M (ruby dust 50 gp)"); when expanded, show the existing ComponentCheckboxes plus material component list.
-   **Expanded:** User expands (e.g. "Duration") → form parses current text (or uses existing structured data for that field if already loaded from `canonical_data`) and shows StructuredFieldInput for duration. User MAY edit the structured form (e.g. to fix a parser failure or adjust values). On collapse, the canon line is updated from the spec **only if the user edited the structured form (dirty)**; if they only expanded to view, the canon line is left unchanged.
-   **Sync:** When collapsed, text is source; expanding parses text into spec (or uses `canonical_data`). When expanded, spec is source of truth only for serialization **when dirty**: collapsing writes text back only when the structured form was changed. Manual adjustment of structured fields is allowed and encouraged (e.g. when parser returned "special"); such edits are dirty and will be serialized to the canon line on collapse.

**Pros:** Single-line is always visible; power users can drill down without leaving the page. **Cons:** Slightly more UI (expand/collapse per field); need clear rules for "first open" (parse from text vs. default spec).

---

## Option C: Section Toggle (Simple vs Advanced)

**Idea:** One global or section-level toggle: "Simple (canon text)" vs "Structured (full schema)". In Simple mode, the editor shows only the canon text block. In Structured mode, the editor shows the current full structured form (all StructuredFieldInput, AreaForm, DamageForm, etc.). Switching modes converts: Simple → Structured by parsing all text fields; Structured → Simple by serializing all specs to text.

**Behavior:**

-   **Simple mode:** Only canon text inputs; save persists text; backend may derive `canonical_data` from parsing.
-   **Structured mode:** Current behavior (all structured components). Save persists text (from spec serialization) and canonical_data from current specs.
-   **Switch Simple → Structured:** Parse each text field via existing Tauri commands; populate structured state (with "special" + raw where parse fails).
-   **Switch Structured → Simple:** Run `*ToText()` for each spec and set the text fields; user then sees canon lines. Next save persists that text and updated canonical_data.

**Pros:** One clear mode switch; no per-field expand/collapse. **Cons:** No "mix": user is either all-text or all-structured; less granular than A or B.

---

## Comparison Summary

| Aspect              | Option A (Explicit "Edit as structured") | Option B (Hybrid expand/collapse) | Option C (Section toggle) |
|---------------------|-------------------------------------------|------------------------------------|----------------------------|
| Default view        | Canon text only                           | Single-line + optional expand     | Canon text only (Simple)  |
| Structured access   | Per-field or per-section button           | Per-field expand                   | Global/section mode switch |
| Granularity         | Per field (or section)                     | Per field                          | Whole form                 |
| Sync                | On entering/leaving structured             | On expand/collapse per field       | On mode switch             |
| Complexity (UI)     | Low default; extra click for structured   | One line + expand per field        | One toggle                 |

---

## Decisions (Option B) — All Implemented

The following are decided and SHALL be implemented as stated.

1. **First open (expand):** When the user first expands a field: if the spell was loaded with `canonical_data` that includes this field, use that structured value; otherwise parse the current text via the existing Tauri command and show the result (if parse fails, show "special" + `raw_legacy_value` with the current line). No default spec is pre-filled until parsed or loaded from canonical_data.
2. **Default for new spells:** A new spell starts with all detail fields collapsed; canon text lines are empty or placeholder. On first expand of a field, parse the current text. **Empty string for a field:** call the parser with the empty string; if the parser returns a defined default (e.g. a valid spec), use it; otherwise treat as "special" with empty `raw_legacy_value`.
3. **Warning and "special" indicator:** When a field is expanded and its spec is `kind: "special"` (or parse failed), show the existing "could not be fully parsed" hint for that field. When collapsed, show a subtle indicator (e.g. icon or tooltip) if the last parse or loaded spec for that field was "special", so the user knows the line is stored but not fully structured for hashing.

**Dirty state and collapse:** Track per field whether the structured form was edited since expand (or since load for that field). Only when dirty: on collapse, serialize the current spec to text and update the canon line. View-only expand → collapse must not overwrite the user's canon text. Manual fixes in the structured form are edits → dirty → serialized on collapse.

**Loading state on expand:** Parser commands (Tauri invoke) are async. When the user expands a field and the editor must parse text, show a loading state in the expanded area until the structured form is populated; then allow editing.

**Unsaved changes and explicit save:** When the user has unsaved changes (including a dirty expanded field) and navigates away or closes, warn the user; do not auto-serialize dirty expanded fields or auto-save. Serialization to the canon line happens only on explicit collapse or on explicit Save. Saving is always explicit (user activates Save). On Save, if a detail field is still expanded and dirty, the editor must serialize it to the canon line before building the persistence payload so flat text and canonical_data stay in sync.

These behaviors are reflected in the spell-editor delta spec scenarios (GIVEN/WHEN/THEN).
