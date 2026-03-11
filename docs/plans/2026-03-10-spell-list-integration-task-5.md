# Spell List Integration (Task 5) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Migrate per-class spell lists (`character_class_spell`) to reference spells by `spell_content_hash`; backfill and index; switch reads/joins to hash; handle missing spells with placeholder and Remove action.

**Architecture:** Migration 0015 already adds `spell_content_hash` and backfills it (in `apps/desktop/src-tauri/src/db/migrations.rs` and `db/migrations/0015_add_hash_reference_columns.sql`). This plan adds the missing unique index, switches `get_character_class_spells` to a hash-based LEFT JOIN so missing spells are detectable, extends the API and UI for "Spell no longer in library" and Remove-by-hash, and adds tests.

**Tech Stack:** Rust (Tauri backend, rusqlite), React/TypeScript (frontend), SQLite migrations, Playwright (E2E if needed).

**References:**
- Spec: `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md` (Task 5.1)
- Design: `openspec/changes/integrate-spell-hashing-ecosystem/design.md` (Decision #5)
- Characters spec: `openspec/changes/integrate-spell-hashing-ecosystem/specs/characters/spec.md`
- Backend AGENTS: `apps/desktop/src-tauri/AGENTS.md`
- Frontend AGENTS: `apps/desktop/src/AGENTS.md`

**Status: Completed (2026-03-10)** — All 7 tasks implemented and verified on branch `feat/integrate-spell-hashing-ecosystem`. Migration and character tests pass; verification.md updated; debug build succeeds.

---

## Task 1: Migration 0015 — Add unique index and align index name — ✅ Done

**Files:**
- Modify: `db/migrations/0015_add_hash_reference_columns.sql`
- Modify: `apps/desktop/src-tauri/src/db/migrations.rs` (only if unique index must be applied in Rust for idempotency; SQLite 3.35+ supports `CREATE UNIQUE INDEX IF NOT EXISTS`)

**Step 1: Verify current migration state**

- Migration 0015 is applied via `apply_hash_reference_columns_migration()` which:
  - Adds `spell_content_hash` to `character_class_spell` and `artifact` if missing.
  - Runs `0015_add_hash_reference_columns.sql`: backfill + `CREATE INDEX IF NOT EXISTS idx_character_class_spell_content_hash`.
- Tasks require:
  - `CREATE INDEX idx_ccs_spell_content_hash ON character_class_spell(spell_content_hash)` — current name is `idx_character_class_spell_content_hash`; optional to rename for spec alignment.
  - `CREATE UNIQUE INDEX idx_ccs_character_hash_list ON character_class_spell(character_class_id, spell_content_hash, list_type)` — **missing**; must add.

**Step 2: Add unique index to migration SQL**

Append to `db/migrations/0015_add_hash_reference_columns.sql`:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_ccs_character_hash_list
ON character_class_spell(character_class_id, spell_content_hash, list_type)
WHERE spell_content_hash IS NOT NULL;
```

(Optional) Spec requires index name `idx_ccs_spell_content_hash`; current file uses `idx_character_class_spell_content_hash`. For full spec alignment you can add `CREATE INDEX IF NOT EXISTS idx_ccs_spell_content_hash ON character_class_spell(spell_content_hash) WHERE spell_content_hash IS NOT NULL` and optionally `DROP INDEX IF EXISTS idx_character_class_spell_content_hash` in the same file. Leaving the existing index name is also valid (both support lookups).

**Step 3: Run migration test**

Run: `cd apps/desktop/src-tauri && cargo test db::migrations::tests::test_load_migrations_adds_hash_reference_columns -- --nocapture`  
Expected: PASS.

Run: `cargo test db::migrations::tests::test_migration_0015_backfills_existing_hash_references -- --nocapture`  
Expected: PASS.

**Step 4: Commit**

```bash
git add db/migrations/0015_add_hash_reference_columns.sql
git commit -m "feat(migration): add idx_ccs_character_hash_list unique index for spell list hash refs"
```

---

## Task 2: Backend model — Add spell_content_hash and missing_from_library to CharacterSpellbookEntry — ✅ Done

**Files:**
- Modify: `apps/desktop/src-tauri/src/models/character.rs` (struct `CharacterSpellbookEntry`)
- Modify: `apps/desktop/src/types/character.ts` (interface `CharacterSpellbookEntry`)

**Step 1: Extend Rust struct**

In `apps/desktop/src-tauri/src/models/character.rs`, add to `CharacterSpellbookEntry`:

- `pub spell_content_hash: Option<String>` — present when the row has a hash (including when spell is missing).
- `pub missing_from_library: bool` — true when the list row exists but no spell row matches the hash.

Keep `spell_id: i64` for now; when spell is missing, use `0`. The struct already has `#[serde(rename_all = "camelCase")]`, so the new fields will serialize as `spellContentHash` and `missingFromLibrary` on the frontend.

**Step 2: Extend TypeScript interface**

In `apps/desktop/src/types/character.ts`, add to `CharacterSpellbookEntry`:

- `spellContentHash?: string | null;`
- `missingFromLibrary?: boolean;`

**Step 3: Commit**

```bash
git add apps/desktop/src-tauri/src/models/character.rs apps/desktop/src/types/character.ts
git commit -m "feat(models): add spellContentHash and missingFromLibrary to CharacterSpellbookEntry"
```

---

## Task 3: get_character_class_spells — Use spell_content_hash for join and return missing placeholder — ✅ Done

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/characters.rs` (`get_character_class_spells`)

**Step 1: Write the failing test**

In `apps/desktop/src-tauri/src/commands/characters.rs` (or adjacent test module), add an integration-style test that:

- Seeds a `character_class_spell` row with `spell_content_hash = 'orphan-hash'` and no corresponding `spell` row (or spell_id pointing to a deleted spell).
- Calls the logic that builds the spell list (or the command via test helper).
- Asserts one entry with `missing_from_library == true` and spell_name placeholder (e.g. "Spell no longer in library").

**Step 2: Run test to verify it fails**

Run: `cargo test get_character_class_spells_missing -- --nocapture` (or the exact test name chosen).  
Expected: FAIL (e.g. no such test or current implementation returns no row / wrong shape).

**Step 3: Change query to LEFT JOIN on hash**

- In `get_character_class_spells`, replace the current `JOIN spell s ON s.id = ccs.spell_id` with:
  - `LEFT JOIN spell s ON s.content_hash = ccs.spell_content_hash` (prefer hash-based join when column exists).
  - Fallback: if `spell_content_hash` column is absent, keep existing `JOIN spell s ON s.id = ccs.spell_id` so pre-0015 DBs still work (use `table_has_column(conn, "character_class_spell", "spell_content_hash")` to choose query variant).
- Select (14 columns total; both query branches must use the same shape): `cc.character_id`, `COALESCE(s.id, 0) AS spell_id`, `COALESCE(s.name, 'Spell no longer in library') AS spell_name`, `COALESCE(s.level, 0) AS spell_level`, `s.school`, `s.sphere`, `s.is_quest_spell`, `s.is_cantrip`, `CASE WHEN ccs.list_type = 'PREPARED' THEN 1 ELSE 0 END`, `CASE WHEN ccs.list_type = 'KNOWN' THEN 1 ELSE 0 END`, `ccs.notes`, `s.tags`, `ccs.spell_content_hash`, `CASE WHEN s.id IS NULL AND ccs.spell_content_hash IS NOT NULL THEN 1 ELSE 0 END AS missing_from_library`.
- Use null-safe ordering: `ORDER BY COALESCE(s.level, 0), COALESCE(s.name, '')` so missing spells (NULL s) sort deterministically.
- Update both row mappers (the `list_type.is_some()` and `else` branches) to read 14 columns and construct `CharacterSpellbookEntry` with the two new fields (e.g. `row.get(12)?` for spell_content_hash, `row.get(13)?` for missing_from_library; ensure the latter is mapped to a bool, e.g. `row.get::<_, i64>(13)? != 0`).

**Step 4: Run test to verify it passes**

Run: `cargo test get_character_class_spells_missing -- --nocapture`.  
Expected: PASS.

Run: `cargo test commands::characters -- --nocapture` to avoid regressions.  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/characters.rs
git commit -m "feat(commands): get_character_class_spells join by spell_content_hash and return missing placeholder"
```

---

## Task 4: remove_character_spell_by_hash command — ✅ Done

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/characters.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs` (add `remove_character_spell_by_hash` to `invoke_handler`)

**Step 1: Write the failing test**

Add a test that:

- Builds a test DB with `character_class_spell` (e.g. using an in-memory conn and the same schema as existing tests like `test_upsert_character_class_spell_with_hash_*`).
- Inserts a row with `spell_content_hash = 'orphan-hash'` (no matching spell row).
- Calls the same logic the command will use (a sync helper that takes `&Connection` and runs the DELETE + cascade, so the test does not need Tauri app state).
- Asserts the row(s) are deleted.

**Step 2: Run test to verify it fails**

Run: `cargo test remove_character_spell_by_hash -- --nocapture`.  
Expected: FAIL (helper or command not implemented).

**Step 3: Implement command**

- Add a sync helper, e.g. `fn remove_character_spell_by_hash_with_conn(conn: &Connection, character_class_id: i64, spell_content_hash: &str, list_type: &str) -> Result<(), AppError>`, that: (1) runs `DELETE FROM character_class_spell WHERE character_class_id = ? AND spell_content_hash = ? AND list_type = ?`; (2) when `list_type == "KNOWN"`, runs a second DELETE for `list_type = 'PREPARED'` with the same character_class_id and spell_content_hash (cascade "prepared must be known" per AGENTS.md).
- Add `#[tauri::command] pub async fn remove_character_spell_by_hash(state, character_class_id: i64, spell_content_hash: String, list_type: String) -> Result<(), AppError>` that in `spawn_blocking` gets the connection and calls the helper.

**Step 4: Register command**

- Add `remove_character_spell_by_hash` to the `tauri::generate_handler![]` list in `apps/desktop/src-tauri/src/lib.rs`. No change to `commands/mod.rs` needed (re-export is via `pub use characters::*`).

**Step 5: Run test to verify it passes**

Run: `cargo test remove_character_spell_by_hash -- --nocapture`.  
Expected: PASS.

**Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/characters.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat(commands): add remove_character_spell_by_hash for missing-spell cleanup"
```

---

## Task 5: Frontend — Show "Spell no longer in library" and Remove by hash — ✅ Done

**Files:**
- Modify: `apps/desktop/src/ui/CharacterEditor.tsx`
- Optionally: `apps/desktop/src/ui/Spellpicker.tsx` or spell list row component if extracted

**Step 1: Use missingFromLibrary and spellContentHash in list**

- When rendering the spell list, if `entry.missingFromLibrary === true`:
  - Show spell name as "Spell no longer in library" (or use backend-provided placeholder).
  - Disable or hide notes editing for the missing entry (or allow notes but persist via a future endpoint; spec says "Remove" action, so minimal is: show placeholder + Remove).
- For the Remove button (single-row): if `entry.missingFromLibrary`, call `invoke('remove_character_spell_by_hash', { characterClassId: charClass.id, spellContentHash: entry.spellContentHash, listType: activeTab })`; else keep calling `remove_character_spell` with `spellId`.

**Step 2: Bulk remove**

- Bulk remove currently iterates `spellId` and calls `remove_character_spell`. Extend: for each selected entry, if `missingFromLibrary` use `remove_character_spell_by_hash` with `entry.spellContentHash`; otherwise use `remove_character_spell` with `entry.spellId`. Ensure selected set can key by something stable: e.g. when missing use `spellContentHash`, when present use `spellId` (so key in state could be `entry.spellContentHash ?? String(entry.spellId)` or similar).

**Step 3: Row key and checkbox selection**

- Change list key to a stable string key: e.g. `entry.missingFromLibrary ? (entry.spellContentHash ?? '') : String(entry.spellId)` so missing entries (which have `spellContentHash`) and normal entries (which have `spellId`) both have unique keys. Update selection state: keep `selectedRemoveIds` as `Set<number>` for spell_id and add `selectedRemoveHashes` as `Set<string>` for spell_content_hash. When rendering, missing entries use hash for selection; normal entries use id. Bulk remove: for each id in selectedRemoveIds call `remove_character_spell`; for each hash in selectedRemoveHashes call `remove_character_spell_by_hash`.

**Step 4: data-testid for missing row**

- Add a `data-testid` for the missing-spell row so E2E can target it, e.g. `data-testid="spell-row-missing"` or `spell-row-Spell no longer in library`.

**Step 5: Run app and manual check**

Run: `pnpm tauri:dev`. Open a character with a class; add a spell; in DB or via a dev path, break the reference (delete spell or set spell_content_hash to a non-existent hash); reload and confirm "Spell no longer in library" and Remove works.

**Step 6: Commit**

```bash
git add apps/desktop/src/ui/CharacterEditor.tsx
git commit -m "feat(ui): show Spell no longer in library and Remove by hash for missing spell refs"
```

---

## Task 6: Backend tests — Coverage for hash-based list and migration — ✅ Done

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/characters.rs` (tests section)
- Modify: `apps/desktop/src-tauri/src/db/migrations.rs` (tests)

**Step 1: Test unique index exists after migration**

In `db/migrations.rs` tests, after `load_migrations`, assert that index `idx_ccs_character_hash_list` exists (e.g. `SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_ccs_character_hash_list'`).

**Step 2: Test get_character_class_spells with mixed present and missing**

- Seed character_class, character_class_spell with two rows: one with valid spell (hash matches spell table), one with spell_content_hash that has no spell row.
- Call get_character_class_spells; assert two entries; one has missing_from_library false and spell_name from DB, one has missing_from_library true and placeholder name.

**Step 3: Test remove_character_spell_by_hash cascades PREPARED**

- Seed KNOWN and PREPARED for same (character_class_id, spell_content_hash).
- Call remove_character_spell_by_hash with list_type "KNOWN".
- Assert both KNOWN and PREPARED rows are removed.

**Step 4: Run full backend test suite**

Run: `cd apps/desktop/src-tauri && cargo test --lib`.  
Expected: All pass.

**Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/characters.rs apps/desktop/src-tauri/src/db/migrations.rs
git commit -m "test: spell list hash refs and missing-spell handling"
```

---

## Task 7: Verification and docs — ✅ Done

**Files:**
- Modify: `openspec/changes/integrate-spell-hashing-ecosystem/verification.md` (add Task 5 verification steps if present)
- Reference: `docs/TESTING.md`, `docs/ARCHITECTURE.md`

**Step 1: Verification checklist**

- Run `cargo test --lib` and `pnpm tauri:build --debug` (or `pnpm tauri:dev` smoke).
- Confirm migration 0015 adds both indexes on a fresh DB (or from version 14).
- Confirm character spell list UI shows placeholder and Remove for a deliberately broken reference.

**Step 2: Update verification doc**

In `openspec/changes/integrate-spell-hashing-ecosystem/verification.md`, the **Spell List Migration** section (around line 159) already has a test for migration/backfill. Add the following verification items there (or in a new subsection "Missing spell handling"):

- Migration 0015: column spell_content_hash, backfill, and unique index idx_ccs_character_hash_list (and optionally idx_ccs_spell_content_hash) present after migration.
- get_character_class_spells returns missing_from_library and placeholder name when spell row is absent for a given spell_content_hash.
- remove_character_spell_by_hash removes the row and cascades PREPARED when removing KNOWN (same character_class_id and spell_content_hash).

**Step 3: Commit**

```bash
git add openspec/changes/integrate-spell-hashing-ecosystem/verification.md
git commit -m "docs: add Task 5 verification steps"
```

---

## Summary

| Task | Focus | Status |
|------|--------|--------|
| 1 | Migration 0015: unique index (and optional index rename) | ✅ Done |
| 2 | Models: spell_content_hash, missing_from_library | ✅ Done |
| 3 | get_character_class_spells: LEFT JOIN by hash, return placeholder | ✅ Done |
| 4 | remove_character_spell_by_hash command + cascade PREPARED | ✅ Done |
| 5 | Frontend: placeholder UI and Remove by hash (single + bulk) | ✅ Done |
| 6 | Backend tests for migration, get list with missing, remove by hash | ✅ Done |
| 7 | Verification and docs | ✅ Done |

**Out of scope for Task 5 (per tasks.md):** Task 7 (Character Integration) — explicit "Upgrade" action when same name has another hash; that is Task 7.1. Task 5 is spell list migration and missing-spell handling only.

**Optional follow-up:** In `add_character_spell`, when validating "Prepared must be Known", use an EXISTS check on `spell_content_hash` (when the column exists) for consistency with hash-first reads.

---

## Three-pass validation (completeness and accuracy)

**Pass 1 — Completeness (against tasks.md 5.1):**
- Add `spell_content_hash` column: Covered (already in migration; no new step).
- Backfill: Covered (existing 0015 SQL).
- Index `idx_ccs_spell_content_hash`: Covered (existing index; optional rename to spec name in Task 1).
- Unique index `idx_ccs_character_hash_list`: Covered in Task 1.
- Update reads/joins to use `spell_content_hash`: Covered in Task 3 (LEFT JOIN on hash).
- Show "Spell no longer in library": Covered in Tasks 3 (backend) and 5 (frontend).
- Provide Remove action: Covered in Tasks 4 (command) and 5 (UI).

**Pass 2 — Accuracy (codebase and spec):**
- Migration: Column is added in Rust before running 0015 SQL; backfill runs on existing rows. Unique index uses `WHERE spell_content_hash IS NOT NULL` so NULLs are allowed during transition.
- `get_character_class_spells`: Two query variants (with/without `list_type`) both need the same 14-column SELECT, LEFT JOIN on hash, COALESCE(s.id, 0) and COALESCE for spell columns, null-safe ORDER BY, and both row mappers updated to read spell_content_hash and missing_from_library (i64 → bool via != 0).
- `remove_character_spell_by_hash`: Implemented via a sync helper (testable with raw `Connection`); command calls helper in `spawn_blocking`. Cascade PREPARED when removing KNOWN. Registration in `lib.rs` only.
- Frontend: Stable list key uses `spellContentHash` for missing and `String(spellId)` for present; two sets (`selectedRemoveIds`, `selectedRemoveHashes`) for bulk remove.

**Pass 3 — Consistency and gaps:**
- TDD order (failing test → implement → pass) is followed per task where tests are added.
- File paths are exact and under `apps/desktop` or `db/migrations`.
- No duplicate work: Task 6 consolidates backend tests; Task 7 is verification/docs only.
- E2E: Plan relies on manual smoke and backend tests; E2E for "missing spell" can be added in Task 5 or 6 if desired (not required by spec for Task 5).

---

## Execution handoff

**Implementation completed 2026-03-10** via subagent-driven execution (one subagent per task + verification subagent per task). Branch `feat/integrate-spell-hashing-ecosystem` kept as-is per user choice.

Original options (for reference):
- **1. Subagent-Driven (this session)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. *(Used.)*
- **2. Parallel Session (separate)** — Open a new session with executing-plans, batch execution with checkpoints.

---

## Double-check summary (completeness and accuracy)

- **Spec 5.1:** All bullets covered (column, backfill, both indexes, hash-based reads, placeholder, Remove). Artifact table is same migration but Task 6 scope; this plan focuses on `character_class_spell` and UI.
- **Query shape:** Both branches of `get_character_class_spells` (with/without `list_type`) require the same 14-column SELECT, LEFT JOIN on `spell.content_hash = ccs.spell_content_hash`, `COALESCE(s.id, 0)` for non-null `spell_id`, and null-safe `ORDER BY`. Row mappers updated for indices 12 and 13; `missing_from_library` stored as 0/1 in SQL and mapped to `bool` in Rust.
- **remove_character_spell_by_hash:** Implemented as sync helper + Tauri command; tests call the helper with a `Connection` (no Tauri state). Cascade: when `list_type == "KNOWN"`, delete PREPARED row with same (character_class_id, spell_content_hash).
- **verification.md:** Existing "Spell List Migration" section (line ~159) is the right place to add the new verification items; plan references it explicitly.
- **Frontend key/selection:** Key is string (spellContentHash for missing, String(spellId) for present); two sets for bulk remove so both code paths are invoked.
