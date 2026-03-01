# Three-Pass In-Depth Code Review
## Change: `refine-computed-fields-schema`
## Scope: Tasks `1.1`, `1.2`, `1.2b`, `1.2c`
## Date: 2026-02-25

---

## Review Method (3 Passes)

1. **Pass 1 — Contract/Spec Compliance**
   - Verified implemented schema/model changes against task requirements.
2. **Pass 2 — Canonicalization + Hash Semantics**
   - Verified normalization behavior, canonical text synthesis, and metadata pruning impacts.
3. **Pass 3 — Verification + Implementation Readiness**
   - Checked current tests and identified remaining risk before/while implementing downstream tasks.

Focused test evidence:
- Ran: `cargo test canonical_spell_regression_tests -- --nocapture`
- Result: **24 passed / 0 failed** in `apps/desktop/src-tauri`

---

## Pass 1 — Contract/Spec Compliance

### Task 1.1 (`spell.schema.json`)

**Status: Complete for the requested schema deltas.**

Confirmed:
- `AreaSpec.text` added.
- `DurationSpec.text` added.
- `SavingThrowSpec.raw_legacy_value` added.
- `SavingThrowSpec.dm_guidance` removed.
- `SpellDamageSpec.raw_legacy_value` replaced by `source_text`.
- `MagicResistanceSpec.source_text` added.
- `casting_time.unit` no longer includes `action`, `bonus_action`, `reaction`.

Notes:
- `dm_guidance` still exists elsewhere (e.g., `ExperienceComponentSpec`, `SpellDamageSpec`) by design; this is not a task 1.1 violation.
- This review found no implementation work that adds `text`, `raw_legacy_value`, or `source_text` to resolved specs, consistent with Decision 7 intent.

### Task 1.2 (Rust model updates)

**Status: Complete for required behavior.**

Confirmed in model modules (the codebase uses split model files under `src/models/`, not a single `spell.rs` source of truth for these spec structs):
- `AreaSpec.text`, `DurationSpec.text`, `SavingThrowSpec.raw_legacy_value`, `MagicResistanceSpec.source_text` are `Option<String>` and `skip_serializing_if`.
- `SpellDamageSpec.source_text` carries backward alias support for `raw_legacy_value`.
- `SavingThrowSpec.dm_guidance` removed from serialized shape and captured via deserialization-only shadow field (`legacy_dm_guidance`, `skip_serializing`).
- Metadata pruning removes `source_text`/`sourceText` generically by key in canonical hash path.

### Task 1.2b (`.text` synthesis for Area/Duration)

**Status: Implemented and functionally aligned.**

Confirmed:
- Synthesis runs in canonical normalize pipeline (`CanonicalSpell::normalize`).
- `kind = special` uses `raw_legacy_value` as `.text` source.
- Non-special kinds synthesize from structured fields.
- Structured + unit alias normalization uses word-boundary replacement.

### Task 1.2c (`source_text` textual normalization)

**Status: Implemented and aligned.**

Confirmed:
- `SpellDamageSpec.source_text` and `MagicResistanceSpec.source_text` use textual normalization (NFC + trim/collapse horizontal whitespace + preserve distinct lines).
- `raw_legacy_value` fields remain unnormalized (stored as-is), matching raw semantics.

---

## Pass 2 — Canonicalization & Hash Semantics

## ✅ Correct behavior observed

- `source_text` is excluded from canonical hash recursively by key (`source_text` and `sourceText`).
- Hash path normalizes before validate, and tests verify hash exclusion behavior for metadata fields.
- Added `.text` synthesis runs before hashing, so canonical hash can include generated text deterministically.

## ⚠️ Findings

### Finding A (Medium)
**Area synthesis under-represents structured data for some kinds.**

- In `synthesize_area_text`, `AreaKind::Creatures | AreaKind::Objects` currently emits only the numeric `count`, but omits `count_subject`.
- This can produce weak/ambiguous canonical text previews (e.g., `"3"` instead of something closer to `"3 creatures"`), reducing fidelity for UI display and auditing.

Recommendation:
- Extend synthesis for these kinds to incorporate `count_subject` when present.
- Keep deterministic ordering/format fixed to avoid future hash drift.

### Finding B (Low)
**Unit alias normalization is case-sensitive.**

- Alias replacements (`yards -> yd`, `feet -> ft`, etc.) apply exact-case matching after Structured normalization (which preserves case).
- Inputs like `"10 Yards"` or `"10 Feet"` may bypass alias folding.

Recommendation:
- Either document this as intentional and rely on parser lower-casing, or make replacement case-insensitive while preserving token boundaries.

### Finding C (Low)
**Stale field comments can mislead implementers.**

- Some `raw_legacy_value` comments in Rust models still read as parse-failure/special-only preservation, while this change direction is universal preservation for relevant parsers.

Recommendation:
- Update comments for consistency with task intent to reduce future implementation drift in parser/migration work.

---

## Pass 3 — Verification & Implementation Readiness

## What is solid now
- Core schema + model + normalization mechanics for 1.1/1.2/1.2b/1.2c are in place and internally consistent.
- Regression suite in `canonical_spell_regression_tests` passes.
- Hash exclusion contract for metadata (`source_text`) is validated by tests.

## Integration risks to track (adjacent, not failures of reviewed tasks)

1. **Migration still pending (`1.3`)**
   - `CURRENT_SCHEMA_VERSION` remains `1` and migration path is not yet implemented.
   - This is expected per task list ordering, but it is a blocker for end-to-end v2 rollout.

2. **Parser backfill still pending (`1.4`)**
   - Universal `raw_legacy_value` population is not yet guaranteed at parser layer, so new schema/model capacity is not fully exercised.

3. **Targeted test gaps for 1.2b text synthesis breadth**
   - Existing tests validate normalization/hashing behavior broadly, but there is limited direct coverage for all Area/Duration synthesis branches.

---

## Recommended Implementation Follow-Ups

1. Add focused unit tests for `synthesize_area_text` and `synthesize_duration_text` branch coverage:
   - `special` derivation from `raw_legacy_value`
   - representative structured branches (`radius_circle`, `time`, `usage_limited`, etc.)
   - alias boundary behavior (`yards` yes, `backyard` no)

2. Decide and codify casing policy for alias normalization:
   - strict/lowercase-only vs case-insensitive normalization.

3. Update `AreaKind::Creatures|Objects` text synthesis to include `count_subject` when available.

4. Keep 1.3/1.4 sequencing strict:
   - migration first in normalize pipeline,
   - parser universal legacy capture second,
   - then broaden tests.

---

## Final Assessment for Reviewed Tasks

- **Task 1.1:** ✅ Implemented as required.
- **Task 1.2:** ✅ Implemented as required.
- **Task 1.2b:** ✅ Implemented; one medium-quality/fidelity improvement recommended.
- **Task 1.2c:** ✅ Implemented as required.

Overall: **Ready to proceed**, with the noted improvements recommended before broadening frontend/importer dependency work.

---

## Evidence Index

- **Task 1.1 (schema deltas):**
   - `apps/desktop/src-tauri/schemas/spell.schema.json` (casting_time unit enum, `AreaSpec.text`, `DurationSpec.text`, `SavingThrowSpec.raw_legacy_value`, `SpellDamageSpec.source_text`, `MagicResistanceSpec.source_text`, SavingThrow `dm_guidance` removal)
- **Task 1.2 (Rust model field changes):**
   - `apps/desktop/src-tauri/src/models/area_spec.rs`
   - `apps/desktop/src-tauri/src/models/duration_spec.rs`
   - `apps/desktop/src-tauri/src/models/saving_throw.rs`
   - `apps/desktop/src-tauri/src/models/damage.rs`
   - `apps/desktop/src-tauri/src/models/magic_resistance.rs`
   - `apps/desktop/src-tauri/src/models/canonical_spell.rs` (`prune_metadata_recursive` source_text exclusion)
- **Task 1.2b (Area/Duration `.text` synthesis):**
   - `apps/desktop/src-tauri/src/models/canonical_spell.rs` (`synthesize_duration_text`, `synthesize_area_text`, `normalize_structured_text_with_unit_aliases`, and call sites in `CanonicalSpell::normalize`)
- **Task 1.2c (`source_text` textual normalization):**
   - `apps/desktop/src-tauri/src/models/damage.rs` (`SpellDamageSpec::normalize`)
   - `apps/desktop/src-tauri/src/models/magic_resistance.rs` (`MagicResistanceSpec::normalize`)
   - `apps/desktop/src-tauri/src/models/canonical_spell.rs` (`normalize_string` textual mode)
- **Verification run:**
   - `apps/desktop/src-tauri` — `cargo test canonical_spell_regression_tests -- --nocapture` (24 passed, 0 failed)

---

## Changelog Note (Post-Review Implementation)

- **Finding A implemented:** `AreaKind::Creatures|Objects` text synthesis now includes `count_subject` when present (e.g., `"3 undead"`), improving canonical text fidelity.
- **Finding B implemented:** Structured unit alias normalization is now case-insensitive while preserving word-boundary safety (whole-word replacements only; substrings remain unchanged).
- **Finding C implemented:** `raw_legacy_value` comments in model structs were updated to reflect as-is legacy text preservation semantics.
- **Regression tests added:**
   - `test_regression_area_text_includes_count_subject_when_present`
   - `test_regression_structured_aliases_case_insensitive_with_boundaries`
   - `test_regression_raw_legacy_value_preserved_as_is`
- **Verification rerun:** `cargo test canonical_spell_regression_tests -- --nocapture` in `apps/desktop/src-tauri` now reports **27 passed, 0 failed**.