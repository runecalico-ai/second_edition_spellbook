# Task 5 Three-Pass Code Review (Subagent Per Item)

Spec: `integrate-spell-hashing-ecosystem`  
Task: **5.1 Migrate Spell Lists** (per-class known/prepared sets in `character_class_spell`)  
Review date: 2026-03-13  
Method: Three independent passes; each Task 5 sub-item reviewed by a dedicated code-reviewer subagent for completeness and accuracy.

---

## Task 5.1 Checklist (from tasks.md)

| # | Item | Spec requirement |
|---|------|------------------|
| 5.1a | Column | Add `spell_content_hash TEXT` column to `character_class_spell`. |
| 5.1b | Backfill | Backfill from `spell.content_hash` WHERE `spell.id = character_class_spell.spell_id`. |
| 5.1c | Index | Add index: `CREATE INDEX idx_ccs_spell_content_hash ON character_class_spell(spell_content_hash)`. |
| 5.1d | Unique index | Add unique constraint: `idx_ccs_character_hash_list(character_class_id, spell_content_hash, list_type)`. |
| 5.1e | Reads/joins | Update application reads/joins to use `spell_content_hash`. |
| 5.1f | Missing spells | Show "Spell no longer in library" placeholder; provide "Remove" action. |

---

## Per-Item Findings (Subagent Reviews)

### 5.1a — Add `spell_content_hash` column

- **Completeness:** Yes. Column is added in Migration 0015 only when missing; SQL file assumes column exists for backfill/indexes.
- **Accuracy:** Yes. Column is `TEXT`, nullable.
- **Issues/gaps:** None. Idempotency via `has_column`; order (column then SQL file) and artifact handling are correct.
- **Recommendations:** None.

---

### 5.1b — Backfill from `spell.content_hash`

- **Completeness:** Yes. Backfill uses required join `spell.id = character_class_spell.spell_id` via correlated subquery.
- **Accuracy:** Yes. `WHERE spell_content_hash IS NULL` avoids overwriting. Orphans (no matching spell) get NULL from subquery and remain NULL.
- **Issues/gaps:**
  - No test for orphan case: row with `spell_id` pointing to non-existent spell keeps `spell_content_hash` NULL.
  - No test that pre-set `spell_content_hash` is left unchanged on re-run.
- **Recommendations:**
  - Optional: test orphan row stays NULL after migration.
  - Optional: in idempotent test, assert existing `spell_content_hash` is not overwritten.

---

### 5.1c — Index `idx_ccs_spell_content_hash`

- **Completeness:** Yes. Index created with required name, table, column; `IF NOT EXISTS`; migrations.rs asserts index exists.
- **Accuracy:** Yes. Implementation adds partial index `WHERE spell_content_hash IS NOT NULL` (acceptable; supports hash lookups).
- **Issues/gaps:** None.
- **Recommendations:** Optional: add SQL comment that partial index is intentional for hash lookups only.

---

### 5.1d — Unique index `idx_ccs_character_hash_list`

- **Completeness:** Yes. Unique index on `(character_class_id, spell_content_hash, list_type)` with `WHERE spell_content_hash IS NOT NULL` for transition.
- **Accuracy:** Yes. Parallel to existing `(character_class_id, spell_id, list_type)`; partial predicate allows legacy NULL-hash rows.
- **Issues/gaps:**
  - No test that duplicate `(character_class_id, spell_content_hash, list_type)` insert is rejected (verification.md expects this).
  - Upsert uses UPDATE-then-INSERT, not `ON CONFLICT` on this index; DB still enforces uniqueness.
- **Recommendations:**
  - Add test: insert duplicate (character_class_id, spell_content_hash, list_type), assert second insert fails and exactly one row remains.
  - Optional: use `INSERT ... ON CONFLICT(...) DO UPDATE` for hash path to rely on index explicitly.

---

### 5.1e — Application reads/joins use `spell_content_hash`

- **Completeness:** Yes. All three join paths (characters.rs, export.rs, io_character.rs) use hash-first when column exists; spell_id fallback only when `spell_content_hash IS NULL`.
- **Accuracy:** Yes. Same join condition everywhere; export/bundle include hash-backed rows; “join must succeed” enforced via pre-check / error when missing spells.
- **Issues/gaps:** None in scope. Legacy `spellbook` and migration_manager orphan check are out of scope.
- **Recommendations:** Optional: centralize join condition (e.g. shared constant) to avoid drift; note characters uses LEFT JOIN for missing_from_library.

---

### 5.1f — Missing spells: placeholder + Remove

- **Completeness:** Yes. Backend returns `missing_from_library` and placeholder name; UI shows "Spell no longer in library" and Remove (single/bulk); `remove_character_spell_by_hash` with KNOWN→PREPARED cascade; E2E covers visibility and Remove.
- **Accuracy:** Yes. Condition, placeholder text, and Remove-by-hash path match spec.
- **Issues/gaps:**
  - Export/bundle **block** when any spell-list entry is missing (no placeholder in export); acceptable if by design.
  - E2E could explicitly assert "Spell no longer in library" is not visible after Remove.
- **Recommendations:**
  - Document that PDF/print/bundle export is blocked when character has "Spell no longer in library" entries; user should Remove or restore spell first.
  - Optional: E2E assertion that placeholder text is gone after Remove.

---

## Three Passes

### Pass 1: Migration contract and read-path audit

**Scope:** Migration 0015 (column, backfill, indexes), all readers of `character_class_spell` that join to `spell`.

**Items:** 5.1a, 5.1b, 5.1c, 5.1d, 5.1e.

**Assessment:**

- Migration: Column, backfill, and both indexes are implemented and idempotent. Backfill and unique index have optional test improvements (orphan backfill, don’t overwrite existing hash, duplicate-insert rejection).
- Read paths: All join paths use hash-first when `spell_content_hash` exists; export and bundle include hash-backed rows and enforce “no missing refs” before export.

**Subagent-sized work:**

1. ✅ Column (5.1a), index (5.1c): Complete; no change.
2. ✅ Backfill (5.1b): Complete; optional tests for orphan and idempotent preserve.
3. ✅ Unique index (5.1d): Complete; add test that duplicate (character_class_id, spell_content_hash, list_type) is rejected.
4. ✅ Reads/joins (5.1e): Complete; optional centralization of join condition.
5. Decide and document export behavior when character has “Spell no longer in library” (block vs. allow with placeholders).

---

### Pass 2: Write-path audit

**Scope:** All inserts/updates into `character_class_spell` (add spell, upsert, bundle import, conflict resolution “Replace with New”).

**Items:** Writes that populate or rely on `spell_content_hash`; dual-column behavior during transition.

**Assessment:**

- Interactive add/update: `characters.rs` uses hash-aware upsert and dual-column writes when column exists.
- Character bundle import: Writes both `spell_id` and `spell_content_hash` when column exists (per prior review; regression test present).
- Uniqueness: Application uses UPDATE-then-INSERT for hash path; unique index `idx_ccs_character_hash_list` enforces at DB level. No `ON CONFLICT` on hash index; duplicate-insert test recommended in Pass 1.

**Subagent-sized work:**

1. ✅ Dual-column writes: Add/upsert and bundle import populate `spell_content_hash` when present.
2. Verify overwrite-import (Replace with New) preserves `spell_content_hash` on recreated rows.
3. Audit any other direct inserts into `character_class_spell` that might bypass hash population.

---

### Pass 3: Test coverage and missing-spell UI

**Scope:** Unit tests for migration and character/spell-list logic; E2E for missing-spell placeholder and Remove; export/bundle behavior with missing refs.

**Items:** 5.1b (backfill tests), 5.1d (unique constraint test), 5.1f (UI + E2E).

**Assessment:**

- Migration: Backfill and idempotent tests exist; optional tests for orphan and “don’t overwrite” (5.1b) and for duplicate rejection (5.1d).
- Missing-spell UI: Backend, UI, and Remove-by-hash with cascade are implemented and tested; E2E covers placeholder and Remove; optional explicit “placeholder gone” assertion.
- Export/bundle: Block when missing refs; document this behavior.

**Subagent-sized work:**

1. Optional: Backfill test for orphan row (5.1b); idempotent test that existing hash is preserved.
2. Add: Test that unique index rejects duplicate (character_class_id, spell_content_hash, list_type) (5.1d).
3. Optional: E2E assertion that "Spell no longer in library" is not visible after Remove (5.1f).
4. Document: Export/print/bundle blocked when character has missing-library entries; user should Remove or restore spell first.

---

## Summary Table

| Item | Completeness | Accuracy | Blocking issues | Optional improvements |
|------|--------------|----------|-----------------|------------------------|
| 5.1a | Yes | Yes | None | — |
| 5.1b | Yes | Yes | None | Orphan + idempotent preserve tests |
| 5.1c | Yes | Yes | None | Comment for partial index |
| 5.1d | Yes | Yes | None | Duplicate-reject test; consider ON CONFLICT |
| 5.1e | Yes | Yes | None | Centralize join condition |
| 5.1f | Yes | Yes | None | Document export behavior; E2E assertion |

---

## Bottom Line

Task 5.1 is **complete and accurate** for implementation review:

- **Migration (5.1a–d):** Column, backfill, and both indexes are correct and idempotent. Only optional test additions recommended (orphan backfill, preserve existing hash, duplicate-insert rejection).
- **Reads/joins (5.1e):** All relevant paths use `spell_content_hash` when present; export and bundle include hash-backed rows and fail cleanly when refs are missing.
- **Missing spells (5.1f):** Placeholder and Remove (including cascade) are implemented and tested; export behavior (block when missing) should be documented.

Recommended before closing Task 5:

1. Add test that unique index rejects duplicate `(character_class_id, spell_content_hash, list_type)`.
2. Document that character export/print/bundle is blocked when the character has “Spell no longer in library” entries.

All other recommendations are optional (extra tests, join centralization, E2E hardening, SQL comment).

---

## Implementation Follow-Up (2026-03-13)

Recommendations from this review were implemented and re-reviewed:

1. **Unique index test:** `test_unique_index_rejects_duplicate_character_class_spell_hash_list` added in `commands/characters.rs` — duplicate `(character_class_id, spell_content_hash, list_type)` insert is rejected; COUNT remains 1.
2. **Export/print documentation:** `docs/user/character_profiles.md` — new subsection "Missing spell references and export/print" and Troubleshooting Q&A explaining that Print Sheet, Print Pack, and Export Character are blocked when the character has "Spell no longer in library" entries.
3. **Migration tests (optional):** `test_migration_0015_orphan_spell_id_keeps_hash_null` and `test_migration_0015_backfill_does_not_overwrite_existing_hash` in `db/migrations.rs`.
4. **SQL comment (optional):** In `0015_add_hash_reference_columns.sql`, comment before `idx_ccs_spell_content_hash`: "Partial index for hash lookups only; NULLs are legacy/transitional."
5. **E2E assertion (optional):** In `character_edge_cases.spec.ts`, after removing the missing-library row, added `await expect(page.getByText("Spell no longer in library")).not.toBeVisible()`.

**Verification:** `cargo test db::migrations::tests::` (6 passed), `cargo test test_unique_index_rejects_duplicate_character_class_spell_hash_list` (1 passed). **Code review:** Subagent code review of the implementation returned **Pass with minor notes**; no required fixes. Task 5 recommendations are complete.
