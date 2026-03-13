# Verification of Task 5 Three-Pass Review Findings

**Review document:** `review-task-5_2026_03_12-07_00_three-pass.md`  
**Verified:** 2026-03-12 (same day)  
**Method:** Code inspection and `cargo test` in repo root / `apps/desktop/src-tauri`.

---

## Summary

| Finding | Verdict | Notes |
|--------|---------|------|
| [P1] Export/bundle reads join by `spell_id` only | **Partially outdated** | Hash-aware branches exist and are used when column present; ID-only joins only in legacy `!use_hash` branch. |
| [P1] Bundle import writes without `spell_content_hash` | **Outdated (fixed)** | Import logic now writes both columns when `spell_content_hash` exists. |
| [P2] No Rust regression coverage for export/import hash paths | **Partially outdated** | Relevant Rust tests exist and pass; review’s “link.exe” blocker not present in this run. |

---

## [P1] Export and bundle read paths

**Claim:** Three non-UI readers still do an inner join on `s.id = ccs.spell_id`; hash-backed rows disappear from export/bundle.

**Verified behavior:**

- **`export.rs` — `load_character_printable_spells` (used by `export_character_sheet` and `export_character_spellbook_pack`):**
  - When `use_hash` is true (column `spell_content_hash` present): uses hash-first JOIN at lines 91–118: `(ccs.spell_content_hash IS NOT NULL AND s.content_hash = ccs.spell_content_hash) OR (ccs.spell_content_hash IS NULL AND s.id = ccs.spell_id)`.
  - When `use_hash` is false: uses `JOIN spell s ON s.id = ccs.spell_id` at lines 126–127 and 137–138 (legacy schema only).
- **`io_character.rs` — `fetch_character_bundle`:**
  - When `use_hash` is true (lines 83–113): uses the same hash-first JOIN.
  - When `use_hash` is false (lines 115–123): uses `JOIN spell s ON s.id = ccs.spell_id`.

So after Migration 0015, `table_has_column(..., "spell_content_hash")` is true and the hash-aware branch runs. The ID-only join strings exist only in the `else` branch for pre-migration schemas. **Conclusion:** Finding is **partially outdated**; on a migrated DB, export and bundle read paths are hash-aware. The recommendation to centralize the hash-first join shape remains useful for maintainability.

**Note:** `print_spellbook` (export.rs ~441–447) uses the legacy **spellbook** table (`sb` / `sb.spell_id`), not `character_class_spell`. That path is out of scope for Task 5.

---

## [P1] Character bundle import writes without `spell_content_hash`

**Claim:** `import_character_bundle_logic()` inserts only `(character_class_id, spell_id, list_type, notes)`.

**Verified behavior:** In `io_character.rs` at 388–408, the insert is conditional:

- If `table_has_column(tx, "character_class_spell", "spell_content_hash")`:
  - Resolves `content_hash` from `spell` by `final_spell_id` (389–396).
  - Inserts 5 columns including `spell_content_hash` (400–402).
- Else: inserts 4 columns (405–407).

So when the column exists, bundle import **does** populate `spell_content_hash`. **Conclusion:** Finding is **outdated (fixed)**.

---

## [P2] Test coverage and Rust test execution

**Claim:** No Rust tests for export/import hash paths; Rust tests could not be run (link.exe not found).

**Verified:**

1. **Rust tests run in this environment.**  
   `cargo test` completed; 321 tests passed. Failures (21) are in `commands::import` and `commands::spells` (vault/env locking), not Task 5.

2. **Task 5–related tests present and passing:**
   - `commands::export::tests::test_load_character_printable_spells_hash_backed_row_survives_stale_spell_id`
   - `commands::export::tests::test_load_character_printable_spells_rejects_orphaned_hash_rows`
   - `commands::io_character::tests::test_fetch_character_bundle_resolves_hash_first_when_spell_id_stale`
   - `commands::io_character::tests::test_fetch_character_bundle_rejects_orphaned_hash_rows`
   - `commands::io_character::tests::test_import_character_bundle_logic_populates_spell_content_hash`
   - Plus character hash/spell-list tests in `commands::characters::tests::`.

So there **is** Rust regression coverage for:
- Export path: hash-backed row with stale `spell_id` survives; orphaned hash rows rejected.
- Bundle fetch: hash-first resolution when `spell_id` stale; orphaned hash rows rejected.
- Bundle import: `spell_content_hash` populated when column exists.

**Conclusion:** Finding is **partially outdated**: tests exist and ran; the “no Rust tests” and “link.exe” statements do not hold in this verification run. Remaining gap: no tests that call the **Tauri commands** `export_character_sheet`, `export_character_spellbook_pack`, or `export_character_bundle` by name (coverage is at the underlying `load_character_printable_spells` / `fetch_character_bundle` / `import_character_bundle_logic` level).

---

## Line number discrepancies

The review’s cited line numbers (e.g. export.rs 409 and 520, io_character.rs 75 and 349) do not match the current locations of the join/insert logic. Verification was done by searching for `character_class_spell`, `JOIN spell`, and the insert pattern; the conclusions above refer to the actual current line ranges.

---

## Recommendations still valid

- **Centralize hash-first join:** Factoring the hash-aware join into a shared SQL shape or helper would reduce duplication and keep export/bundle/editor behavior aligned.
- **Export behavior for orphan rows:** The current behavior (reject export when orphan hash rows exist) is tested; documenting this as the intended contract is still useful.
- **Optional:** Add higher-level tests that invoke the export/bundle Tauri commands to lock in end-to-end behavior.

---

## Bottom line

The three-pass review was largely accurate at the time it was written. Current code and test run show:

1. **Export/bundle reads** use hash-aware logic when `spell_content_hash` exists; ID-only joins are legacy-only.
2. **Bundle import** writes `spell_content_hash` when the column exists.
3. **Rust tests** for these paths exist and pass in this environment.

Task 5 can be treated as **implemented** for the scope described in the review, with the above recommendations left as optional follow-ups (shared join helper, documentation, and/or command-level tests).
