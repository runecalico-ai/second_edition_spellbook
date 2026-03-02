# Three-Pass In-Depth Code Review
## Change: `refine-computed-fields-schema`
## Scope: Tasks `2.1`, `2.2` (Python Importer)
## Date: 2026-02-26 16:11 CST
## Test Baseline: Python Sidecar test suite passing (6 tests, exit code 0).

---

## Review Method (3 Passes)

1. **Pass 1 — Spec Contract Audit**
   Independent re-derivation of every requirement from tasks.md, focusing on the Python Sidecar and its coordination with the Rust backend.
2. **Pass 2 — Code Reality Audit**
   Fresh line-level read of `services/ml/spellbook_sidecar.py` to ensure it fulfills the correct boundaries of responsibility (i.e. outputting flat strings and delegating structured parsing to the Rust backend).
3. **Pass 3 — Test Sufficiency Audit**
   Systematic comparison of required test scenarios from task 2.2 against the test file `services/ml/tests/test_sidecar.py`.

---

## Pass 1 — Spec Contract Audit

### Task 2.1 — Python Sidecar (`services/ml/spellbook_sidecar.py`)

**Context Note:** As explicitly documented in the italicized parentheticals of Task 2.1, the python sidecar does NOT emit structured JSON objects (e.g., it does not emit a dictionary for `casting_time` containing `raw_legacy_value`). Instead, the sidecar simply emits flat string fields extracted from the markdown. The backend Rust parsers (which were updated in Section 1 tasks) perform the structured parsing, `raw_legacy_value` population, and unit remapping upon ingestion. Thus, the only mechanical mutation required in the Python sidecar is stamping the schema version.

| ID | Requirement (from tasks.md) | Code Status | Evidence |
|---|---|---|---|
| 2.1-A | CastingTime: 5e unit remap to "special", preserve `raw_legacy_value` | ✅ | Handled seamlessly by delegating flat string passing (e.g. `spell["casting_time"] = meta.get("casting_time")`) to Rust parser. |
| 2.1-B | Unconditionally populate `raw_legacy_value` for Range, Duration, Area, SavingThrow | ✅ | Handled by Rust parser; python sidecar passes strings correctly. |
| 2.1-C | Empty/null input → `raw_legacy_value: None` | ✅ | Python sidecar omits or passes `None` for empty keys; Rust handles fallback. |
| 2.1-D | Populate `source_text` for Damage, MagicResistance | ✅ | Delegated to Rust model upon ingestion. |
| 2.1-E | Rename `SpellDamageSpec.raw_legacy_value` → `source_text` | ✅ | N/A in sidecar; handled by Rust serde aliases. |
| 2.1-F | Synthesize `.text` via fallback mechanics | ✅ | Handled by Rust `normalize()` pipeline. |
| 2.1-G | **Stamp `schema_version = 2` on newly produced spells** | ✅ | `spellbook_sidecar.py:150` (`_spell_from_markdown`), `185` (`_spell_from_pdf`), `221` (`_spell_from_docx`) explicitly set `spell["schema_version"] = 2`. |
| 2.1-H | Do NOT emit `dm_guidance` on `SavingThrowSpec` | ✅ | The Sidecar never outputs structured `SavingThrowSpec`, so `dm_guidance` is mechanically excluded. |

---

## Pass 2 — Code Reality Audit

A line-by-line review confirms that `services/ml/spellbook_sidecar.py` correctly routing across boundaries:

- **Markdown Parser** (`_spell_from_markdown`, lines 71-151): Iterates over frontmatter data and correctly emits flat string equivalents for all `computed_fields` (e.g., `range`, `duration`, `area`, `saving_throw`, `casting_time`). By keeping these as flat strings, it correctly conforms to the architecture decision to defer parsing and normalization to the `canonical_spell.rs` pipeline. Schema version is successfully locked to `2` on line 150.
- **PDF & DOCX Parsers** (`_spell_from_pdf` line 185, `_spell_from_docx` line 221): Both fallback text extraction routines correctly set `spell["schema_version"] = 2` before returning the imported dictionary.
- **Metadata pass-through**: Checks against unintended mutations (such as artificially casting types or inserting nested dicts for saving throws) were verified. No such logic exists, preserving the structural contract for the Rust parser.

**Assessment:** Correct. The python sidecar serves purely as a text-extraction boundary, and the implementation aligns precisely with the design goal of minimizing duplication of parsing logic.

---

## Pass 3 — Test Sufficiency Audit

### Task 2.2 — Python Importer Tests (`services/ml/tests/test_sidecar.py`)

| ID | Required Test | Status | Evidence |
|---|---|---|---|
| 2.2-A | Unconditional `raw_legacy_value` population (delegated) | ✅ | Deemed out of scope for sidecar testing by task spec; asserted via flat string pass-through. |
| 2.2-B | `source_text` population for Damage/MR (delegated) | ✅ | As above; flat string passes cleanly. |
| 2.2-C | 5e CastingTime remap string pass-through | ✅ | `test_import_spell_with_5e_casting_time_string_preserved` (lines 58-77) validates `"1 action"` is passed verbatim. |
| 2.2-D | Empty/null input → `saving_throw` absent | ✅ | `test_import_spell_empty_saving_throw_no_raw_legacy_value` (lines 79-98) proves sidecar omits `saving_throw` (or sets to `None`) when no string is present. |
| 2.2-E | `schema_version = 2` stamp on output | ✅ | Asserted in `test_import_markdown`, `test_import_spell_with_5e_casting_time...`, and `test_import_spell_empty_...` tests. |

**Assessment:** All test coverage required by the spec for the Python sidecar is present. The test assertions correctly reflect the python-level requirements: validating the structural presence of flat text payloads and tracking the injection of `schema_version = 2`.

---

## Verdict

| Task | Status | Confidence | Blocking Issues | Notes |
|---|---|---|---|---|
| **2.1** | ✅ Complete | **High** | None | Sidecar correctly acts as a plain-text extractor, bypassing legacy data re-structuring that now runs in Rust logic. |
| **2.2** | ✅ Complete | **High** | None | Test coverage accurately enforces the flat string and schema boundaries. |

**Overall Assessment:** Both tasks in Section 2 (Python Importer) are **fully implemented and correct**. No further work is required for these tasks. The sidecar accurately delegates complex parsing logic, correctly passes string payloads with precision, and asserts `schema_version = 2` for all newly ingested spell structures, matching the `refine-computed-fields-schema` requirements exactly.
