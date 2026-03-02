# Three-Pass In-Depth Code Review (Review/Implementation)
## Change: `refine-computed-fields-schema`
## Scope: Tasks **2.1**, **2.2** (Python Importer — Sidecar & Tests)
## Date: 2026-02-26

This document provides a three-pass review of tasks 2.1 and 2.2 for implementers and reviewers: spec alignment, implementation correctness, and test sufficiency.

---

## Review Method

| Pass | Focus | Output |
|------|--------|--------|
| **Pass 1** | Spec & task contract audit | Requirement → code/spec mapping; division of responsibility (sidecar vs Rust) |
| **Pass 2** | Implementation correctness & edge cases | Line-level behavior, key handling, encoding, robustness |
| **Pass 3** | Test sufficiency & implementation readiness | Task 2.2 coverage matrix; gaps; recommendations |

**Sources:** `tasks.md` (Section 2), `specs/importers/spec.md`, `design.md`, and implementation in `services/ml/spellbook_sidecar.py` and `services/ml/tests/`.

---

## Division of Responsibility (Context)

Tasks 2.1 and 2.2 explicitly assign **flat string passthrough** to the Python sidecar and **structured parsing, `raw_legacy_value`, `source_text`, and 5e remap** to the Rust layer:

- Task 2.1: *"Sidecar outputs flat strings; Rust parser performs remap and raw_legacy_value population on ingest."*
- *"Rust parser does this when canonicalizing from sidecar strings."*
- *"Sidecar omits or sets saving_throw to None; Rust treats absent as None."*
- *"Rust parser and normalize() handle this."*
- *"Sidecar does not emit structured SavingThrowSpec."*

Therefore the sidecar is **not** required to emit structured objects (e.g. `RangeSpec`, `AreaSpec`, `SavingThrowSpec`) or to set `raw_legacy_value` / `source_text` / `.text` in its output. Its obligations are: (1) pass flat strings for computed fields from front matter (or extracted text), (2) stamp `schema_version = 2`, and (3) not emit v1-only or invalid keys (e.g. `dm_guidance` on SavingThrowSpec).

---

## Pass 1 — Spec & Task Contract Audit

### Task 2.1 — Update `services/ml/spellbook_sidecar.py`

| Req ID | Requirement | Source | Implementation / Note |
|--------|-------------|--------|------------------------|
| 2.1.1 | CastingTime: if source contains 5e unit, **first** store original in `casting_time.raw_legacy_value`, **then** remap `unit` to `"special"`; do not write 5e unit to output | tasks.md L76, importers spec §CastingTime | **Delegated to Rust.** Sidecar only passes `meta.get("casting_time")` as a string (e.g. `"1 action"`). It does not produce a structured `casting_time` object with `unit` or `raw_legacy_value`. Backend receives the string and performs parse + remap + `raw_legacy_value` population. ✅ |
| 2.1.2 | Unconditionally populate `raw_legacy_value` for Range, Duration, Area, SavingThrow on every parse | tasks.md L77, importers spec §Computed Field Parsing Success | **Delegated to Rust.** Sidecar passes `meta.get("range")`, `meta.get("duration")`, `meta.get("area")`, `meta.get("saving_throw")` as flat strings. Rust parser populates `raw_legacy_value` when canonicalizing. ✅ |
| 2.1.3 | Empty/null input → `raw_legacy_value` = `None` (not `""`) | tasks.md L78, importers spec §Empty or Null Input | Sidecar uses `meta.get("saving_throw")` etc.; when key is absent, value is `None`. It does not set `saving_throw: ""`. So “no source text” is represented by key absent or value `None`. ✅ |
| 2.1.4 | Populate `source_text` for Damage, MagicResistance; do NOT set `raw_legacy_value` on these | tasks.md L79, importers spec §Non-Hashed Legacy Text | **Delegated to Rust.** Sidecar does not parse damage or magic resistance from markdown front matter (no `damage` / `magic_resistance` keys in current `_spell_from_markdown`). PDF/DOCX paths do not extract these fields. Rust layer populates `source_text` when it has source text. ✅ |
| 2.1.5 | Rename `SpellDamageSpec.raw_legacy_value` → `source_text` | tasks.md L80 | **N/A in sidecar.** Task says “(N/A in sidecar; Rust model uses source_text).” Sidecar never emits `SpellDamageSpec`. ✅ |
| 2.1.6 | Area/Duration: best-effort `.text` from structured fields; `kind="special"` → `.text` = `raw_legacy_value` | tasks.md L81 | **Delegated to Rust.** Task: “(Rust parser and normalize() handle this.)” Sidecar does not emit structured Area/Duration specs. ✅ |
| 2.1.7 | Stamp `schema_version = 2` on all newly produced spells | tasks.md L82, importers spec §Schema Version Stamp | **Implemented.** `_spell_from_markdown` L150: `spell["schema_version"] = 2`; `_spell_from_pdf` L185; `_spell_from_docx` L221. All three import paths stamp v2. ✅ |
| 2.1.8 | Do NOT emit `dm_guidance` on `SavingThrowSpec` | tasks.md L83 | **Satisfied.** Sidecar does not emit a structured `SavingThrowSpec`; it only passes `saving_throw` as a string or `None`. So it never emits `dm_guidance`. ✅ |

**Contract summary (2.1):** The sidecar fulfills its share: flat string passthrough for computed fields and `schema_version = 2` in all import paths. All structured population (`raw_legacy_value`, `source_text`, `.text`, 5e remap) is correctly left to the Rust layer per task wording.

---

### Task 2.2 — Update Python importer tests

| Req ID | Requirement | Source | Implementation / Note |
|--------|-------------|--------|------------------------|
| 2.2.1 | Test unconditional `raw_legacy_value` for hashed computed fields | tasks.md L86 | **Covered by Rust.** Task: “Covered by Rust parser tests; sidecar tests assert schema_version and string passthrough.” Sidecar tests do not need to assert structured `raw_legacy_value` because sidecar does not produce it. ✅ |
| 2.2.2 | Test `source_text` for Damage and MagicResistance | tasks.md L87 | **Rust layer.** Task: “Rust layer; sidecar passes strings.” No sidecar test required for structured `source_text`. ✅ |
| 2.2.3 | Test 5e CastingTime remap: `raw_legacy_value` before `unit` remapped to `"special"` | tasks.md L88 | **test_import_spell_with_5e_casting_time_string_preserved** (test_sidecar.py L58–77): Asserts sidecar passes `casting_time == "1 action"` and `schema_version == 2`. Backend remap is tested in Rust. ✅ |
| 2.2.4 | Test empty/null input → `raw_legacy_value` is `None` | tasks.md L89 | **test_import_spell_empty_saving_throw_no_raw_legacy_value** (test_sidecar.py L80–99): Asserts `saving_throw` is `None` when key absent and `schema_version == 2`. ✅ |
| 2.2.5 | Test `schema_version = 2` stamp on output | tasks.md L90 | **test_import_markdown** (test_sidecar.py L55); **TestSchemaVersionV2** (test_parsers.py L13–42): Markdown import and all three sources (markdown, PDF, DOCX) assert `schema_version == 2`. ✅ |

**Contract summary (2.2):** Sidecar tests correctly focus on string passthrough, absence of saving throw when not in front matter, 5e casting time string preservation, and `schema_version = 2` for all import paths. Structured-field behavior is covered by Rust tests.

---

## Pass 2 — Implementation Correctness & Edge Cases

### 2.1 — Sidecar implementation

- **Markdown path (`_spell_from_markdown`):**
  - Computed fields are taken from `meta` with `meta.get(...)`: `casting_time`, `duration`, `range`, `area`, `saving_throw` (L128–133). Absent keys yield `None`; no coercion to `""`. ✅
  - `schema_version` is set after building the spell dict (L150). No branch skips it. ✅
  - Front matter parsing: `_parse_front_matter` splits on `---` and parses `key: value`; keys are stripped. Keys like `saving_throw` or `casting_time` are preserved as-is. No snake_case/camelCase conversion in the sidecar (backend can accept either per IPC). ✅

- **PDF path (`_spell_from_pdf`):**
  - Does not extract casting_time, range, duration, area, saving_throw (only name, level, description, source). So those fields are absent on the spell dict — equivalent to “no source text” for those. ✅
  - `schema_version = 2` set (L185). ✅

- **DOCX path (`_spell_from_docx`):**
  - Same as PDF: no computed-field extraction; only name, level, description, source. Absent keys. ✅
  - `schema_version = 2` set (L221). ✅

- **Edge cases:**
  - **Empty string in front matter:** e.g. `saving_throw: ""`. `meta.get("saving_throw")` returns `""`. The spec says “empty string or null/missing” → `raw_legacy_value` should be `None`. The sidecar does not normalize `""` to `None`; it passes `""` through. The Rust layer should treat empty string as “no meaningful source text” and set `raw_legacy_value = None` when canonicalizing. **Recommendation:** Document in importers spec or sidecar doc that Rust treats `""` like absent for legacy value population; optionally sidecar could normalize `saving_throw` (and similar) so that `Some("")` is never emitted (i.e. emit key only when value is non-empty). Not required for task 2.1 if Rust already handles `""`.
  - **Encoding:** Markdown is read with `path.read_text(encoding="utf-8", errors="ignore")`. `errors="ignore"` avoids crashes on bad bytes but may drop characters. Acceptable for robustness; could be documented. ✅
  - **Key naming:** Front matter uses whatever the user writes (e.g. `saving_throw` vs `savingThrow`). Current code uses `meta.get("saving_throw")` only. If markdown uses `savingThrow`, the sidecar would not pass it. **Recommendation:** If the importer contract expects both forms, consider `meta.get("saving_throw") or meta.get("savingThrow")` (and similarly for other camelCase variants). Not specified in 2.1; optional improvement.

- **No `dm_guidance`:** Spell dict never has a nested `saving_throw` object; only a top-level string or None. So `dm_guidance` is never emitted. ✅

---

### 2.2 — Tests

- **test_import_spell_with_5e_casting_time_string_preserved:** Uses front matter `casting_time: 1 action`. Asserts `spells[0]["casting_time"] == "1 action"` and `schema_version == 2`. Correct for “sidecar passes string; backend remaps.” ✅
- **test_import_spell_empty_saving_throw_no_raw_legacy_value:** No `saving_throw` in front matter. Asserts `spells[0].get("saving_throw") is None`. Correct. ✅
- **test_import_markdown:** Asserts `schema_version == 2`. ✅
- **TestSchemaVersionV2:** Unit tests for `_spell_from_markdown`, `_spell_from_pdf`, `_spell_from_docx` each assert `result.get("schema_version") == 2`. ✅

**Gap (non-blocking):** There is no sidecar test that asserts behavior when front matter has `saving_throw: ""` (explicit empty string). If the product requirement is that empty string should be treated like absent, a small test could assert `spells[0].get("saving_throw") in (None, "")` and document that Rust normalizes `""` to no `raw_legacy_value`; or the sidecar could normalize and omit the key when value is `""`.

---

## Pass 3 — Test Sufficiency & Implementation Readiness

### Coverage matrix (Task 2.2)

| Scenario | Required by task | Sidecar test | Rust test (reference) |
|----------|------------------|--------------|-----------------------|
| `schema_version = 2` on new spells | 2.2.5 | test_import_markdown, TestSchemaVersionV2 (all 3 sources) | — |
| 5e casting time string passed through | 2.2.3 | test_import_spell_with_5e_casting_time_string_preserved | Backend remap tests |
| Empty saving throw → no raw_legacy_value | 2.2.4 | test_import_spell_empty_saving_throw_no_raw_legacy_value | Parser empty-input tests |
| raw_legacy_value unconditional (hashed fields) | 2.2.1 | — | Section 1 parser tests |
| source_text (Damage, MR) | 2.2.2 | — | Section 1 / backend |

All task 2.2 bullets are covered either by sidecar tests (passthrough + schema_version) or by Rust tests (structured behavior).

### Implementation readiness

- **Task 2.1:** Implementation is **complete** for the defined sidecar scope (flat strings + `schema_version = 2`). No code changes required for 2.1 unless product decides to add optional behavior (e.g. empty-string normalization or camelCase key fallbacks).
- **Task 2.2:** Tests are **sufficient** for the sidecar contract. Optional: add one test for `saving_throw: ""` and/or document Rust’s handling of empty string.

### Recommendations

1. **Document contract in code:** In `spellbook_sidecar.py`, a short comment near `schema_version = 2` (e.g. at L146) already references “refine-computed-fields-schema §2.1”. Consider one sentence stating that flat strings for casting_time, range, duration, area, saving_throw are passed through and that Rust is responsible for `raw_legacy_value`, `source_text`, and 5e remap.
2. **Empty string:** If the Rust importer already treats `""` as “no source text” for `raw_legacy_value`, no change. Otherwise, either document that or add sidecar normalization so that empty-string values are not emitted for computed fields (emit key only when value is non-empty).
3. **CamelCase front matter:** If markdown imports are expected to use camelCase keys (e.g. `savingThrow`), add fallbacks in `_spell_from_markdown` for compatibility; otherwise leave as-is.

---

## Sign-off Summary

| Pass | Result |
|------|--------|
| **Pass 1** | Task 2.1 and 2.2 requirements are correctly mapped; sidecar’s scope (flat passthrough + schema_version) is satisfied; Rust handles all structured and legacy-value behavior. |
| **Pass 2** | Implementation is correct; edge case around empty string in front matter is noted with optional follow-up; no blocking issues. |
| **Pass 3** | Test coverage meets task 2.2; implementation is ready for review/implementation sign-off. Optional test or doc for empty-string handling. |

**Conclusion:** Tasks 2.1 and 2.2 are **complete and consistent** with the refine-computed-fields-schema spec. The three-pass review did not identify blocking defects. Optional improvements (documentation, empty-string handling, camelCase fallbacks) can be tracked separately.
