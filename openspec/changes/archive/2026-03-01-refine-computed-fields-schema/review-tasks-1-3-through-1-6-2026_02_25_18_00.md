# Three-Pass In-Depth Code Review
## Change: `refine-computed-fields-schema`
## Scope: Tasks `1.3`, `1.4`, `1.5`, `1.6`
## Date: 2026-02-25

---

## Review Method (3 Passes)

1. **Pass 1 — Spec Contract Audit**
   - Compared task requirements (1.3–1.6) against current backend/importer specs and task text.
2. **Pass 2 — Code Reality Audit**
   - Traced migration, normalization, parser, and bulk migration implementations in `apps/desktop/src-tauri`.
3. **Pass 3 — Test + Rollout Readiness Audit**
   - Evaluated existing unit coverage against required edge cases and operational safety requirements.

### Completion Delta (Updated)

Since the initial review, **task 1.3 has been implemented and re-verified** in `apps/desktop/src-tauri/src/models/canonical_spell.rs`:
- `MIN_SUPPORTED_SCHEMA_VERSION` set to `1` with explicit migration rationale comment.
- `MigrateV2Result` now includes `truncated_spell_id: Option<i64>`.
- `migrate_to_v2()` notes migration now uses strict newline append (no `"DM Guidance: "` prefix).
- Migration guard and normalize guard use `CURRENT_SCHEMA_VERSION`.
- Focused and broad migration-related tests added/updated and passing.

**Task 1.4 parser correctness gaps have been fixed** (2026-02-25, 183 tests passing):
- `ComponentsParser::parse_casting_time` now sets `raw_legacy_value` unconditionally for all non-empty parse branches.
- `Action`, `BonusAction`, `Reaction` branches now emit `CastingTimeUnit::Special` (5e units no longer leak into parsed output).
- `DurationParser::parse("")` now returns `raw_legacy_value: None` instead of `Some("")`.
- `parse_saving_throw("None")` now returns `raw_legacy_value: None` (sentinel treated same as empty).
- Stale tests updated; pre-existing `test_migration_column_mapping_regression` staleness (hardcoded schema version `1`) fixed.

**Task 1.6 batch failure behavior has been fixed** (2026-02-25):
- `MigrationFailure` now uses `spell_id: i64` (DB row id) per contract.
- Hash and JSON serialization errors are collected into `failed` and the batch continues (no `?` propagation).
- All failure entries use DB `id` from the SELECT row; `normalize()` and `migrate_to_v2()` accept optional `db_id` so `truncated_spell_id` is populated in the bulk path.

**Task 1.5 + Priority B & C completed** (2026-02-26):
- **Priority B (verification completeness):** Added unit tests for parser empty/null semantics (`raw_legacy_value` is `None` for duration, area, range, casting_time, saving_throw "" and "None"); multiple-save raw capture (`test_parse_saving_throw_multiple_retains_full_raw_legacy_value`); `Rod, Staff, or Wand` single-save via `is_standard_complex` (`test_parse_saving_throw_rod_staff_wand_single_save`); explicit `raw_legacy_value` hash inclusion (`test_raw_legacy_value_included_in_hash`); Area/Duration `.text` synthesis after `normalize()` including special path (`test_normalize_area_duration_text_synthesis`).
- **Priority C (hardening):** Extracted `run_migration_batch_impl` for testability; added `test_migration_batch_spell_level_failure_does_not_abort` (spell-level failure does not abort successful updates); added `test_migration_batch_db_failure_rollback` (DB-level UNIQUE violation triggers rollback, no rows updated). All 194 lib tests passing.

---

## Pass 1 — Contract Audit (What must be true)

### Task 1.3 requires:
- `CURRENT_SCHEMA_VERSION = 2` and migration first in `normalize()`.
- `migrate_to_v2()` ordered steps:
  1) `SavingThrowSpec.dm_guidance -> notes` (newline concatenation, 2048 truncation signaling),
  2) remap 5e casting units to `special`, preserving/preferentially setting `raw_legacy_value`,
  3) move `SpellDamageSpec.raw_legacy_value -> source_text`,
  4) stamp `schema_version = 2`.
- Return type: `MigrateV2Result { notes_truncated: bool, truncated_spell_id: Option<i64> }`.
- Single-spell path: `notes_truncated` must hard-fail and not persist.
- Bulk path: truncation goes to `failed`, migration continues.
- `schema_version 0 -> 2` ordering must be preserved.
- `MIN_SUPPORTED_SCHEMA_VERSION` must remain `1` and be documented.

### Task 1.4 requires:
- Rust parser layer always preserves source text:
  - hashed fields -> `raw_legacy_value` (area, duration, range, casting_time, saving_throw),
  - non-hashed metadata -> `source_text` (damage, magic resistance).
- Area/Duration `kind="special"`: `.text == raw_legacy_value`.
- Parsed Area/Duration: best-effort synthesized `.text`.
- Empty/null input: raw field should be `None`, never `Some("")`.
- Verify save mapping table order and `is_standard_complex` behavior.

### Task 1.5 requires explicit unit tests for:
- migration edge cases,
- parser unconditional legacy preservation + empty/null semantics,
- multiple-save raw capture,
- `is_standard_complex` single-save behavior,
- `.text` synthesis and hash semantics (`raw_legacy_value` included, `source_text` excluded).

### Task 1.6 requires:
- Tauri `migrate_all_spells_to_v2` command with exact result contract:
  - `MigrationResult { total, migrated, skipped, failed }`
  - `MigrationFailure { spell_id: i64, spell_name: Option<String>, error: String }`
- progress events,
- idempotent skipping for `schema_version >= 2`,
- spell-level failures collected (not batch-aborting),
- DB-level failures rollback transaction.

---

## Pass 2 — Code Reality Audit (What is currently implemented)

## Task 1.3 status: **Completed (core contract implemented and verified)**

### Implemented correctly
- `CURRENT_SCHEMA_VERSION` is `2` in `src/models/canonical_spell.rs`.
- `normalize()` runs migration first when `schema_version < 2`.
- Casting-time 5e unit remap to `Special` is implemented with no-overwrite guard for preexisting `raw_legacy_value`.
- `notes_truncated` is surfaced to callers (`compute_hash`, `to_canonical_json` return error).
- `MIN_SUPPORTED_SCHEMA_VERSION` is now `1` and documented inline per decision.
- `MigrateV2Result` now includes `truncated_spell_id: Option<i64>`.
- `dm_guidance -> notes` now appends with simple newline separation.
- `schema_version` is stamped to `2` in migration.

### Notes
1. **Step (3) damage migration is implemented via serde alias path.**
   - `raw_legacy_value -> source_text` is materialized at deserialization through `SpellDamageSpec.source_text` alias support; migration code documents this behavior explicitly.
2. **`truncated_spell_id`** is now populated in the bulk path via `normalize(Some(db_id))` / `migrate_to_v2(db_id)` when notes are truncated.

## Task 1.4 status: **Completed (all parser correctness gaps resolved)**

### Implemented correctly
- `RangeParser` sets `raw_legacy_value` unconditionally on parsed/fallback output.
- `AreaParser` sets `raw_legacy_value` and synthesizes `.text`; special fallback path is covered.
- `DurationParser` sets `raw_legacy_value` and synthesizes `.text`; special fallback path is covered.
- `MechanicsParser`:
  - `SavingThrowSpec.raw_legacy_value` is populated,
  - `SpellDamageSpec.source_text` used,
  - `MagicResistanceSpec.source_text` used,
  - `is_standard_complex` heuristic exists before split decision,
  - save mapping order aligns with spec table intent.
- `ComponentsParser::parse_casting_time`:
  - All non-empty parse branches (Round, Minute, Hour, Segment, Special) now set `raw_legacy_value: Some(input_clean)`.
  - `Action`, `BonusAction`, `Reaction` branches now emit `CastingTimeUnit::Special`; `raw_legacy_value` preserves original text.
- `DurationParser::parse("")` now returns `raw_legacy_value: None` (empty input → `None`).
- `parse_saving_throw("")` and `parse_saving_throw("None")` both return `raw_legacy_value: None`.

### Previously identified gaps — now resolved
1. ~~Casting-time parser does not preserve raw text unconditionally.~~ — **Fixed.**
2. ~~Casting-time parser still emits `Action/BonusAction/Reaction` on parse success.~~ — **Fixed; all 5e units remapped to `Special`.**
3. ~~Empty input handling mismatch in duration parser.~~ — **Fixed.**
4. ~~Empty input handling mismatch in saving throw parser for `"None"`.~~ — **Fixed.**

## Task 1.6 status: **Completed (contract fully compliant)**

### Implemented correctly
- `migrate_all_spells_to_v2` command exists.
- Progress event `migration-progress` emitted during processing.
- `schema_version >= 2` counted as skipped.
- Transaction used for batched writes; commit at end.
- `MigrationFailure { spell_id: i64, spell_name: Option<String>, error: String }` matches contract.
- Spell-level failures (truncation, hash error, JSON error, deserialization) are collected in `failed` and the batch continues.
- All failure entries report DB `id` (from SELECT row).
- `truncated_spell_id` is set in `MigrateV2Result` when bulk migration calls `normalize(Some(db_id))` and notes are truncated.

### Previously identified gaps — now resolved
1. ~~`MigrationFailure` type mismatch (spell_id: Option<String>).~~ — **Fixed; spell_id is i64.**
2. ~~Spell-level hash failure aborts batch.~~ — **Fixed; hash and JSON errors push to failed and continue.**
3. ~~Failure records sometimes lose DB identity.~~ — **Fixed; all entries use db_id from row.**
4. ~~Truncation failure handling in bulk has no truncated_spell_id plumbing.~~ — **Fixed; migrate_to_v2(db_id) and normalize(db_id) populate it.**

---

## Pass 3 — Test & Rollout Readiness

## Task 1.5 status: **Completed (2026-02-26)**

### Existing evidence
- Migration tests now include:
   - happy path,
   - notes truncation flag path,
   - empty/null casting-time synthesis path,
   - no-overwrite guard,
   - `schema_version 0 -> 2` ordering,
   - `schema_version >= 2` passthrough.
- Parser tests cover many common parse behaviors and some raw preservation checks.
- Hash exclusion tests exist for `source_text` metadata.
- Verification run: `cargo test --lib` => **194 passed, 0 failed**.

### Required edge-case tests — now implemented
1. ~~Parser empty/null tests ensuring `raw_legacy_value` is `None` (not empty string).~~ — **Done:** duration, area, range, components (casting_time), mechanics (saving_throw "" and "None").
2. ~~Multiple-save raw capture test asserting full unsplit legacy string retained.~~ — **Done:** `test_parse_saving_throw_multiple_retains_full_raw_legacy_value`.
3. ~~Strong assertion test for `Rod, Staff, or Wand` as single-save via heuristic.~~ — **Done:** `test_parse_saving_throw_rod_staff_wand_single_save`.
4. ~~Explicit hash test proving `raw_legacy_value` changes hash.~~ — **Done:** `test_raw_legacy_value_included_in_hash`.
5. ~~Explicit normalization test for Area/Duration `.text` synthesis after `normalize()` including special path.~~ — **Done:** `test_normalize_area_duration_text_synthesis`.

### Command transaction behavior (Priority C) — now implemented
- ~~Spell-level failure does not abort successful updates.~~ — **Done:** `test_migration_batch_spell_level_failure_does_not_abort`.
- ~~DB-level failure triggers rollback.~~ — **Done:** `test_migration_batch_db_failure_rollback`.

---

## Requirement-by-Requirement Verdict

| Task | Verdict | Notes |
|---|---|---|
| 1.3 | ✅ Complete (core) | Migration contract implemented and verified; residual `truncated_spell_id` population is tied to 1.6 bulk context. |
| 1.4 | ✅ Complete | All parser gaps resolved: casting-time unconditional `raw_legacy_value`, 5e unit remapping, duration/saving-throw empty→`None` semantics. 183 tests passing. |
| 1.5 | ✅ Complete | Priority B & C implemented 2026-02-26: parser empty/null, multiple-save raw capture, is_standard_complex, raw_legacy_value hash, Area/Duration .text synthesis; migration batch spell-level vs DB rollback tests. 194 lib tests passing. |
| 1.6 | ✅ Complete | Batch failure behavior fixed: spell_id i64, failures collected without aborting, DB id in all entries, truncated_spell_id populated in bulk. |

---

## Implementation Plan (for immediate follow-up)

### Priority A — correctness blockers
None

### Priority B — verification completeness (Task 1.5) — **Done (2026-02-26)**
2. ~~Add remaining unit tests for parser empty/null semantics, multiple-save raw capture, `is_standard_complex`, and explicit `raw_legacy_value` hash inclusion.~~ Implemented: parser empty/null in duration, area, range, components, mechanics; multiple-save and Rod/Staff/Wand single-save in mechanics; `test_raw_legacy_value_included_in_hash` and `test_normalize_area_duration_text_synthesis` in canonical_spell.

### Priority C — hardening — **Done (2026-02-26)**
3. ~~Add a focused test for command transaction behavior: spell-level failure does not abort successful updates; DB-level failure triggers rollback.~~ Implemented: `run_migration_batch_impl` extracted for tests; `test_migration_batch_spell_level_failure_does_not_abort` and `test_migration_batch_db_failure_rollback` in canonical_spell.

---

## Evidence Index

- Migration + schema version constants + bulk command:
  - `apps/desktop/src-tauri/src/models/canonical_spell.rs`
- Saving throw shadow field / normalization:
  - `apps/desktop/src-tauri/src/models/saving_throw.rs`
- Parser implementations:
  - `apps/desktop/src-tauri/src/utils/spell_parser.rs`
  - `apps/desktop/src-tauri/src/utils/parsers/area.rs`
  - `apps/desktop/src-tauri/src/utils/parsers/range.rs`
  - `apps/desktop/src-tauri/src/utils/parsers/duration.rs`
  - `apps/desktop/src-tauri/src/utils/parsers/mechanics.rs`
  - `apps/desktop/src-tauri/src/utils/parsers/components.rs`
- Contract references:
  - `openspec/changes/refine-computed-fields-schema/tasks.md`
  - `openspec/changes/refine-computed-fields-schema/specs/backend/spec.md`
  - `openspec/changes/refine-computed-fields-schema/specs/importers/spec.md`
  - `openspec/changes/refine-computed-fields-schema/design.md`
