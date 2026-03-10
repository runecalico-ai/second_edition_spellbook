# Task 5 Three-Pass Code Review (Spell List Integration)

Date: 2026-03-10
Spec: `openspec/changes/integrate-spell-hashing-ecosystem` (Task 5: Spell List Integration)
Scope: Migration 0015 for `character_class_spell`, hash-based list reads/writes, missing-library UX, and automated coverage for broken-reference handling.

## Review Units

- Unit A: Migration 0015 and backend storage/query contract for `character_class_spell`
- Unit B: Write-side list behavior for add/remove/prepare flows after hash migration
- Unit C: Frontend missing-library UX and automated coverage

## Findings

### 1. [RESOLVED] Hash-migrated orphan rows still fail KNOWN/PREPARED integrity checks and upserts because write paths key off `spell_id`

- Evidence:
  - `get_character_class_spells_with_conn()` intentionally supports orphan rows whose `spell_id` is stale or `0`, resolving them by `spell_content_hash` and surfacing them as normal entries again once the hash exists in `spell`.
  - `add_character_spell()` still validates PREPARED membership with `WHERE ... spell_id = ?`, and `upsert_character_class_spell_with_hash()` still uses `ON CONFLICT(character_class_id, spell_id, list_type)`.
- References:
  - `apps/desktop/src-tauri/src/commands/characters.rs:178`
  - `apps/desktop/src-tauri/src/commands/characters.rs:196`
  - `apps/desktop/src-tauri/src/commands/characters.rs:569`
  - `apps/desktop/src-tauri/src/commands/characters.rs:822`
  - `apps/desktop/src-tauri/src/commands/characters.rs:936`
- Impact:
  - If a character keeps a KNOWN spell row by hash while the spell is missing from the library, that row can later resolve again when the same hash is re-imported, but the underlying `character_class_spell.spell_id` remains stale.
  - From that point, PREPARED checks can incorrectly reject a valid spell as “not in the Known list”, and re-add/upsert flows can trip the new unique hash index instead of updating the existing row.
  - This is the exact recovery path Task 5 is supposed to support.
- Recommendation:
  - Treat `spell_content_hash` as the canonical identity on all post-0015 write paths.
  - For PREPARED validation, resolve the incoming spell’s content hash first and check KNOWN membership by `(character_class_id, spell_content_hash, list_type)`.
  - For upserts, target the hash-based uniqueness contract once the column exists, and consider backfilling stale `spell_id` when a hash successfully resolves again.

### 2. [RESOLVED] Migration 0015 is not a self-contained migration artifact and misses the spec-required index name

- Evidence:
  - The SQL migration file only backfills and creates indexes; it does not add the `spell_content_hash` columns at all.
  - Column creation is split into `apply_hash_reference_columns_migration()` in Rust, and the non-unique index is created as `idx_character_class_spell_content_hash` instead of the task’s `idx_ccs_spell_content_hash`.
- References:
  - `apps/desktop/src-tauri/src/db/migrations.rs:13`
  - `apps/desktop/src-tauri/src/db/migrations.rs:27`
  - `db/migrations/0015_add_hash_reference_columns.sql:1`
  - `db/migrations/0015_add_hash_reference_columns.sql:8`
- Impact:
  - The runtime path works today because `load_migrations()` patches in the missing `ALTER TABLE`s first, but the migration contract is now split across code and SQL.
  - Any tooling, verification, or operator workflow that treats `db/migrations/0015_add_hash_reference_columns.sql` as the migration source of truth will silently miss required schema changes.
  - The index name mismatch also leaves Task 5 technically out of spec and makes migration verification more brittle than it needs to be.
- Recommendation:
  - Make Migration 0015 self-contained at the schema-artifact level, or explicitly document that the Rust migration wrapper is part of the migration contract.
  - Align the non-unique index name with the task text (`idx_ccs_spell_content_hash`) or update the spec/task artifact to match the implemented name.

## Pass Notes

### Pass 1: Unit A

- Verified Migration 0015 backfills `character_class_spell.spell_content_hash` and creates the hash-based unique index.
- Verified runtime migration support adds missing columns before executing the SQL file.
- Main issue from this pass: the SQL migration artifact is not self-contained and does not match the spec’s index naming.

### Pass 2: Unit B

- Verified list reads are hash-based once `spell_content_hash` exists, including placeholder handling for missing library entries.
- Verified remove-by-hash exists and cascades PREPARED removal for missing KNOWN entries.
- Main issue from this pass: add/prepare/upsert logic still uses `spell_id` semantics, which breaks the recovered-orphan path that Task 5 introduced.

### Pass 3: Unit C

- Verified the frontend renders the placeholder text and exposes single/bulk remove actions for missing-library entries.
- Verified the UI uses `remove_character_spell_by_hash` for missing rows.
- Coverage remains backend-heavy:
  - backend tests cover placeholder rendering and remove-by-hash cascade
  - there is no frontend or Playwright coverage for the user-visible missing-library remove flow
  - there is no regression test for the restored-hash scenario where a stale `spell_id` row must still allow PREPARED/upsert behavior

## Post-fix verification

Verification commands (steps 1–3 from Task 5 final verification) were run on 2026-03-10 and passed:

- `cargo test commands::characters::tests -- --nocapture`: 9 passed
- `cargo test migration_0015 -- --nocapture`: 3 passed
- `npx playwright test tests/character_edge_cases.spec.ts --grep "missing-library"`: 2 passed

## Suggested Follow-up

1. Fix `add_character_spell()` and `upsert_character_class_spell_with_hash()` to use `spell_content_hash` as the primary identity once Migration 0015 is present.
2. Add a backend regression test for: orphan KNOWN row by hash -> same hash reappears in `spell` -> PREPARED add succeeds.
3. Add a backend regression test for: hash-based orphan row -> re-add/upsert updates existing row instead of failing on the hash unique index.
4. Decide whether Migration 0015 should be self-contained in SQL or explicitly defined as SQL plus Rust wrapper logic, then align the artifact.
5. Add UI/E2E coverage for the missing-library placeholder and remove action path in `CharacterEditor`.
