# Task 2 Three-Pass In-Depth Code Review (Subagent-Oriented)

Date: 2026-03-06
Spec: `openspec/changes/integrate-spell-hashing-ecosystem` (Task 2: Import/Export)
Scope: `apps/desktop/src-tauri/src/commands/import.rs`, `apps/desktop/src-tauri/src/commands/export.rs`, related spec/tests

## Subagent Split (Logical Units)

- Subagent A: Import pipeline + version/schema/URL policy
  - `parse_and_classify_payload`, `process_source_ref_urls`, `process_spell`, preview flow
- Subagent B: Dedup/conflict/replace semantics + transaction boundaries
  - `apply_import_spell_json_impl`, `replace_with_new_impl`, Keep Both naming
- Subagent C: Export contract + test/verification sufficiency
  - `export_spell_as_json_impl`, `export_spell_bundle_json_impl`, unit/E2E test coverage

## Findings (Ordered by Severity)

### 1. [High] Conflict detection is keyed by `(name, level)` instead of `name`, so required same-name conflicts can be silently skipped

- Spec requires conflict flow when imported spell has the same name and different hash.
- Current implementation only checks for an existing row by `name` **and** `level`:
  - `apps/desktop/src-tauri/src/commands/import.rs:939`
- Spec references:
  - `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md:42`
  - `openspec/changes/integrate-spell-hashing-ecosystem/design.md:142`
  - `openspec/changes/integrate-spell-hashing-ecosystem/specs/import-export/spec.md:56`

Impact:
- Importing same-name variants at a different level bypasses conflict resolution entirely.
- This can produce unreviewed inserts where the spec expects explicit user choice (Keep Existing / Replace / Keep Both).

Implementation guidance:
1. Change conflict lookup from `WHERE name = ? AND level = ?` to name-only conflict detection (or align spec explicitly if `(name, level)` is the intended identity).
2. Add regression tests for:
   - Same name, different level, different hash => conflict emitted.
   - Same hash still dedups before name conflict.

### 2. [Medium] Replace collision error message does not include the existing spell name, weakening required user guidance

- Design calls for a clear message in replace-collision cases, with example naming the already-existing spell.
- Current error is generic:
  - `apps/desktop/src-tauri/src/commands/import.rs:719`
- Design reference:
  - `openspec/changes/integrate-spell-hashing-ecosystem/design.md:144`

Impact:
- Users get less actionable failure context during conflict resolution.

Implementation guidance:
1. On hash collision, query conflicting spell name and include it in error text.
2. Add test assertion for collision message content (contains spell name).

### 3. [Medium] Core apply-phase behaviors are under-tested in backend unit tests

- Existing import tests are primarily parse/preview/helper-level.
  - `apps/desktop/src-tauri/src/commands/import.rs:2035-2384`
- Apply-path logic (`apply_import_spell_json_impl`) has no direct unit coverage for critical Task 2 flows.
  - `apps/desktop/src-tauri/src/commands/import.rs:837`

Impact:
- High-risk logic (dedup merges, conflict actions, replace cascade rollback behavior) is protected mainly by E2E and manual validation.
- Regressions in DB-level behavior are likely to be caught late.

Implementation guidance:
1. Add focused `apply_import_spell_json_impl` tests for:
   - hash dedup merge counters (`merged_count` vs `no_change_count`)
   - keep_existing / replace_with_new / keep_both branches
   - replace rollback on cascade failure (savepoint behavior)
2. Keep current export unit tests as baseline and extend with negative-path tests:
   - NULL hash reject (single/bundle)
   - invalid canonical_data reject.

## Pass Breakdown

## Pass 1: Spec Compliance

- Confirmed implemented and aligned:
  - source_ref dedup policy now matches "both have URL => URL dedup, else tuple fallback"
    - `apps/desktop/src-tauri/src/commands/import.rs:86-103`
  - metadata merge updates both flat tags and canonical JSON through unified merge path
    - `apps/desktop/src-tauri/src/commands/import.rs:109-165`, `:893-896`, `:926-929`
  - `id` / `content_hash` / `contentHash` import aliases supported via `CanonicalSpell.id` aliases
    - `apps/desktop/src-tauri/src/models/canonical_spell.rs:180-185`
    - validated by unit test `test_import_alias_support`
      - `apps/desktop/src-tauri/src/commands/import.rs:2325-2384`

- ~~Remaining compliance gap: same-name conflict semantics (Finding #1)~~ **Fixed** (see Fixes Applied).

## Pass 2: Correctness / Integrity

- Replace path is transactional and guarded with savepoints at item scope; failures become per-item failures without corrupting other rows.
  - `apps/desktop/src-tauri/src/commands/import.rs:872`, `:958-967`, `:1070-1075`
- Cascade hash updates for `character_class_spell` and `artifact` are implemented and participate in transactional flow.
  - `apps/desktop/src-tauri/src/commands/import.rs:793-806`

- ~~Correctness improvements still needed: clearer replace collision error context (Finding #2)~~ **Fixed** (see Fixes Applied).

## Pass 3: Test and Implementation Readiness

- Export unit coverage exists for happy paths:
  - `apps/desktop/src-tauri/src/commands/export.rs:642-716`
- E2E conflict resolution coverage exists for major UI flows:
  - `apps/desktop/tests/import_conflict_resolution.spec.ts`

- ~~Readiness risks: apply-phase backend unit coverage gaps (Finding #3); no explicit test guarding name-only conflict semantics (Finding #1)~~ **Addressed** (see Fixes Applied).

## Verification Notes

- Attempted to run targeted Rust tests in `apps/desktop/src-tauri`.
- Blocked by local filesystem lock/permission errors in `target/debug` (`os error 5: Access is denied`), so this review is based on static code/spec analysis plus existing test inventory.

## Recommended Fix Order

1. Fix same-name conflict detection semantics (name-only vs `(name, level)`) and lock with tests.
2. Improve replace-collision error detail (include conflicting spell name).
3. Add apply-phase unit tests for dedup/conflict/replace transactional behavior.

## Fixes Applied

Implementation completed per recommended order. All changes in `apps/desktop/src-tauri/src/commands/import.rs` and `apps/desktop/src-tauri/src/commands/export.rs`.

### Finding #1 — Same-name conflict semantics (fixed)

- **Change:** In `apply_import_spell_json_impl`, conflict lookup changed from `WHERE name = ? AND level = ?` to name-only with deterministic selection: `WHERE name = ? ORDER BY id ASC LIMIT 1`. Hash-first dedup unchanged.
- **Tests added:**
  - `test_apply_import_conflict_same_name_different_level_different_hash` — same name, different level, different hash => conflict emitted.
  - `test_apply_import_same_hash_dedups_before_name_conflict` — same hash dedups before name-conflict path.
  - `test_apply_import_conflict_deterministic_when_name_has_multiple_rows` — when multiple rows share a name, conflict targets lowest `id`.

### Finding #2 — Replace collision error message (fixed)

- **Change:** In `replace_with_new_impl`, on hash collision the code now queries the conflicting row’s `(id, name)` and returns an error that includes the conflicting spell name, hash, and id, plus guidance: “This imported version already exists. Choose Keep Existing … or Keep Both …”.
- **Test added:** `test_replace_with_new_collision_error_includes_conflicting_spell_name_and_hash` — asserts message contains conflicting spell name, hash, and “Keep Existing” / “Keep Both” guidance.

### Finding #3 — Apply-phase and export test coverage (fixed)

- **Import tests added:**
  - `test_apply_import_dedup_counters_track_merged_vs_no_change` — `merged_count` vs `no_change_count`.
  - `test_apply_import_conflict_resolution_branches_keep_replace_keep_both` — keep_existing / replace_with_new / keep_both; asserts cascade hash updates in `character_class_spell` and `artifact` on successful replace.
  - `test_apply_import_replace_failure_rolls_back_item_and_keeps_other_rows` — replace fails (cascade UNIQUE violation in test harness); savepoint rollback leaves spell and `character_class_spell` at old values; other batch item (keep_both) still committed.
- **Export tests added:**
  - `test_export_spell_as_json_rejects_null_content_hash` — single export rejects NULL `content_hash`.
  - `test_export_spell_bundle_json_rejects_when_any_spell_has_null_content_hash` — bundle export rejects when any spell has NULL hash.
  - `test_export_spell_as_json_rejects_invalid_canonical_data_json` — single export rejects invalid `canonical_data`.
  - `test_export_spell_bundle_json_rejects_invalid_canonical_data_json` — bundle export rejects invalid `canonical_data`.

**Verification:** `cargo test --lib` (276 tests) passes; import and export unit tests above pass.
