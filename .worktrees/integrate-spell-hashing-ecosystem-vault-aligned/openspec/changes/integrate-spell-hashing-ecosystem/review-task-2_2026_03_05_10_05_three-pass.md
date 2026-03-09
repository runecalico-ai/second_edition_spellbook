# Task 2 Three-Pass In-Depth Code Review (Subagent Split)

Date: 2026-03-05
Spec: `openspec/changes/integrate-spell-hashing-ecosystem` (Task 2)
Scope: `apps/desktop/src-tauri/src/commands/import.rs`, `apps/desktop/src-tauri/src/commands/export.rs`, related models/spec/tests

## Subagent Work Split

- Subagent A: Ingest pipeline and version/schema/security gates
  - Parse/classify payload, URL policy, normalize/hash pipeline
- Subagent B: Dedup/conflict/replace transaction behavior and metadata merge semantics
  - Hash-first dedup, name conflict actions, merge/cascade behavior
- Subagent C: Export contract and test sufficiency
  - Single/bundle export semantics, coverage against verification checklist

## Pass 1: Spec Compliance Findings

### 1. [High] SourceRef dedup key policy does not implement "both have URL" condition — **COMPLETE**
- Spec requirement: dedup by URL only when both refs have non-empty URL; otherwise dedup by `(system, book, page, note)`.
- ~~Current implementation always prefers URL when a ref has URL.~~
- **Fixed:** `is_duplicate_source_ref(a, b)` implements pair-aware logic: both non-empty URL → compare URLs; else compare `(system, book, page, note)`. Code: `import.rs:88-102`. Tests: `test_is_duplicate_source_ref` covers URL match, URL mismatch, mixed (one missing URL) → tuple, tuple mismatch. `import.rs:2346-2410`.

### 2. [High] Tamper-hash input path only checks `id`, not `content_hash` field described in Task 2 text — **COMPLETE**
- **Fixed:** `CanonicalSpell.id` has serde aliases `content_hash` and `contentHash` (`apps/desktop/src-tauri/src/models/canonical_spell.rs:180-185`). JSON with `content_hash` or `contentHash` deserializes into `spell.id`, so `process_spell` (which reads `spell.id` for the imported hash) correctly runs the tamper-warning flow for all three interchange shapes. `test_import_alias_support` asserts id/content_hash/contentHash all yield `spell.id` and pass preview. No code change needed; contract is aligned.

## Pass 2: Code Quality and Data Integrity Findings

### 3. [High] Duplicate-hash metadata merge updates DB `tags` column but not `canonical_data.tags` — **COMPLETE**
- ~~In duplicate skip path, merged tags are written to `spell.tags`, but canonical JSON is only merged for `source_refs`.~~
- **Fixed:** `merge_canonical_metadata` merges both tags and source_refs into canonical JSON (cap/sort/dedup for tags). Apply path updates `tags` and `canonical_data` in the same `UPDATE spell SET tags = ?, canonical_data = ?, ...`. Code: `import.rs:109-165` (helper), `876-897` and `914-930` (both dedup paths).

### 4. [Medium] Replace-failure handling aborts whole batch transaction, not just the replace operation
- Replace errors are escalated as hard error via `?` while all items are in one transaction.
- Evidence:
  - One transaction for all items: `apps/desktop/src-tauri/src/commands/import.rs:865`
  - Replace error propagation: `apps/desktop/src-tauri/src/commands/import.rs:961-967` (`replace_with_new_impl(...)?`)
- Impact:
  - One failing replace can roll back unrelated successful imports in the same batch.
  - Could conflict with user expectations of mixed-result imports.
- Implementation guidance:
  - Clarify intended behavior in spec text.
  - If partial success is desired, use savepoints per item or per conflict resolution.

## Pass 3: Test Adequacy and Implementation Readiness

### 5. [Medium] Task 2 apply/export behavior lacks focused unit/integration tests — **PARTIALLY COMPLETE**
- **Done:** Export tests added in `export.rs` (`#[cfg(test)] mod tests`): `test_export_spell_as_json` (id, schema_version), `test_export_spell_bundle_json` (bundle_format_version), `test_export_spell_as_json_rejects_null_content_hash`, `test_export_spell_bundle_json_rejects_when_any_spell_has_null_content_hash`, plus invalid canonical_data tests. SourceRef dedup: `test_is_duplicate_source_ref` covers "both URL" and "only one URL" (tuple fallback). Apply merge: `test_merge_canonical_metadata`, `test_apply_import_same_hash_dedups_before_name_conflict`, `test_apply_import_dedup_counters_track_merged_vs_no_change`.
- **Remaining (optional):** Apply-phase test that explicitly asserts `canonical_data.tags` contains merged tags after duplicate merge; tamper-warning test that verifies warning text and that dedup uses recomputed hash.

## Overall Assessment

- Status: Findings 1, 2, 3 **resolved**. Finding 4 (replace-failure batch behavior) and optional test gaps (Finding 5) remain.
- ~~Primary blockers: SourceRef dedup; canonical tag merge; tamper-hash field.~~ **Done (1, 2, 3).**
- Remaining:
  - Replace-failure batch behavior: clarify spec or implement savepoints (Finding 4).
  - Optional: apply test asserting `canonical_data.tags` after merge; tamper-warning test (Finding 5).

## Recommended Fix Order

1. ~~Fix SourceRef dedup policy logic (spec-critical).~~ **Complete.**
2. ~~Fix canonical_data tag merge synchronization in duplicate path.~~ **Complete.**
3. ~~Align tamper-hash field contract (`id` vs `content_hash`).~~ **Complete** (serde aliases on `CanonicalSpell.id`).
4. ~~Add apply/export tests covering verification checklist items 405-469.~~ **Largely complete;** optional gaps noted in Finding 5.
