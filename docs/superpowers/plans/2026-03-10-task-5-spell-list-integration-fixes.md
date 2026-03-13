# Task 5 Spell List Integration Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Status:** All tasks and steps completed (2026-03-10). Commits: `ae9e63e`, `03cf023`, `e5cbb34`, `d4633c0`, `dbbe306`.

**Goal:** Fix the Task 5 regressions so `character_class_spell` uses `spell_content_hash` as the canonical identity after Migration 0015, make the migration artifact coherent, and add backend/UI coverage for missing-library and restored-hash behavior.

**Architecture:** Keep the existing backward-compatible transition model, but make all post-0015 write paths resolve and validate by `spell_content_hash` whenever that column exists. Preserve legacy fallback for pre-0015 schemas, and make Migration 0015 explicit and verifiable by aligning the SQL artifact, runtime wrapper, and tests around the same contract.

**Tech Stack:** Rust (`rusqlite`, Tauri commands, unit tests), TypeScript/React, Playwright, SQLite migrations.

---

### Task 1: Make hash identity the canonical write path in character spell commands ✅

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/characters.rs`
- Test: `apps/desktop/src-tauri/src/commands/characters.rs`

**Step 1: Write the failing test for PREPARED add after hash recovery** ✅

Add a unit test in `apps/desktop/src-tauri/src/commands/characters.rs` that:
- creates `character_class_spell` with `spell_content_hash`
- seeds a KNOWN row with `spell_id = 0` and `spell_content_hash = 'restored-hash'`
- seeds `spell` row later with `id = 5` and `content_hash = 'restored-hash'`
- calls the command helper path used by `add_character_spell(..., "PREPARED", ...)`
- asserts the PREPARED row is inserted successfully

Use a test shape like:

```rust
#[test]
fn test_add_prepared_spell_succeeds_when_known_row_matches_by_hash() {
    // seed orphan KNOWN by hash, then reintroduce spell row with same hash
    // assert PREPARED add succeeds
}
```

**Step 2: Run the test to verify it fails** ✅

Run:

```powershell
cd apps/desktop/src-tauri
cargo test test_add_prepared_spell_succeeds_when_known_row_matches_by_hash -- --exact
```

Expected: FAIL because the PREPARED validation still checks `spell_id`.

**Step 3: Write the failing test for upsert collision on existing hash row** ✅

Add a unit test in `apps/desktop/src-tauri/src/commands/characters.rs` that:
- creates a KNOWN row with stale `spell_id = 0` and valid `spell_content_hash`
- seeds the matching `spell` row with a real `id`
- calls `upsert_character_class_spell_with_hash(...)`
- asserts the existing row is updated instead of causing a unique-index violation on `(character_class_id, spell_content_hash, list_type)`

Use a test shape like:

```rust
#[test]
fn test_upsert_character_class_spell_with_hash_updates_existing_hash_row() {
    // seed stale row by hash, then upsert using resolved spell id
    // assert single row remains and spell_id is refreshed
}
```

**Step 4: Run the new upsert test to verify it fails** ✅

Run:

```powershell
cd apps/desktop/src-tauri
cargo test test_upsert_character_class_spell_with_hash_updates_existing_hash_row -- --exact
```

Expected: FAIL with unique constraint conflict or stale-row behavior.

**Step 5: Refactor `upsert_character_class_spell_with_hash` to resolve hash first** ✅

Modify `apps/desktop/src-tauri/src/commands/characters.rs` so that when `spell_content_hash` exists:
- resolve `spell_content_hash` from `spell.id`
- try an `UPDATE` by `(character_class_id, spell_content_hash, list_type)` first
- refresh `spell_id` and `notes` on that row when found
- only `INSERT` when no row exists for that hash/list tuple
- keep the legacy `spell_id` path only for schemas without `spell_content_hash`

Target logic:

```rust
let spell_content_hash: Option<String> = ...;
if let Some(hash) = spell_content_hash.as_deref() {
    let updated = conn.execute(
        "UPDATE character_class_spell
         SET spell_id = ?, notes = ?, spell_content_hash = ?
         WHERE character_class_id = ? AND spell_content_hash = ? AND list_type = ?",
        params![spell_id, notes, hash, character_class_id, hash, list_type],
    )?;
    if updated == 0 {
        conn.execute(
            "INSERT INTO character_class_spell (...) VALUES (?, ?, ?, ?, ?)",
            params![character_class_id, spell_id, list_type, notes, hash],
        )?;
    }
}
```

**Step 6: Refactor PREPARED validation to check KNOWN membership by hash** ✅

Modify `add_character_spell` in `apps/desktop/src-tauri/src/commands/characters.rs` so that when `spell_content_hash` exists:
- resolve the incoming spell’s `content_hash`
- verify KNOWN membership with:

```sql
SELECT EXISTS(
  SELECT 1
  FROM character_class_spell
  WHERE character_class_id = ?
    AND spell_content_hash = ?
    AND list_type = 'KNOWN'
)
```

- keep the existing `spell_id` validation only for legacy schemas

**Step 7: Run the targeted command tests** ✅

Run:

```powershell
cd apps/desktop/src-tauri
cargo test commands::characters::tests -- --nocapture
```

Expected: PASS, including the two new regression tests.

**Step 8: Commit** ✅

```powershell
git add apps/desktop/src-tauri/src/commands/characters.rs
git commit -m "fix: use hash identity for character spell writes"
```

### Task 2: Align Migration 0015 artifact and migration verification ✅

**Files:**
- Modify: `db/migrations/0015_add_hash_reference_columns.sql`
- Modify: `apps/desktop/src-tauri/src/db/migrations.rs`
- Test: `apps/desktop/src-tauri/src/db/migrations.rs`

**Step 1: Write the failing migration verification test for index naming** ✅

Add a test in `apps/desktop/src-tauri/src/db/migrations.rs` that asserts Migration 0015 creates:
- `idx_ccs_spell_content_hash`
- `idx_ccs_character_hash_list`
- `idx_artifact_spell_content_hash`

Use a test shape like:

```rust
#[test]
fn test_migration_0015_creates_task_5_index_names() {
    // load migrations, assert sqlite_master contains expected names
}
```

**Step 2: Run the migration verification test to verify it fails** ✅

Run:

```powershell
cd apps/desktop/src-tauri
cargo test test_migration_0015_creates_task_5_index_names -- --exact
```

Expected: FAIL because the current non-unique character index is named `idx_character_class_spell_content_hash`.

**Step 3: Make Migration 0015 artifact-level intent explicit** ✅

Modify `db/migrations/0015_add_hash_reference_columns.sql` to:
- rename the non-unique index to `idx_ccs_spell_content_hash`
- add a leading comment that column creation is performed by the Rust wrapper before this SQL runs, if you decide to keep the current split

Suggested top-of-file comment:

```sql
-- Migration 0015 (phase 2)
-- Column creation for spell_content_hash is performed in load_migrations()
-- before this SQL is executed so the migration remains idempotent on upgraded DBs.
```

If you prefer a fully self-contained artifact instead, update the Rust wrapper comment to say the wrapper exists only to keep `ALTER TABLE ... ADD COLUMN` idempotent and the SQL file is still the canonical migration body.

**Step 4: Align runtime migration comments with the SQL artifact** ✅

Modify `apps/desktop/src-tauri/src/db/migrations.rs` around `apply_hash_reference_columns_migration()` so the contract is explicit:
- why column creation happens here
- why the SQL file assumes the columns already exist
- that the expected index name is `idx_ccs_spell_content_hash`

**Step 5: Run the migration tests** ✅

Run:

```powershell
cd apps/desktop/src-tauri
cargo test src::db::migrations -- --nocapture
```

If the exact module filter does not work in this workspace, run:

```powershell
cd apps/desktop/src-tauri
cargo test migration_0015 -- --nocapture
```

Expected: PASS, including the new index-name assertion.

**Step 6: Commit** ✅

```powershell
git add db/migrations/0015_add_hash_reference_columns.sql apps/desktop/src-tauri/src/db/migrations.rs
git commit -m "fix: align migration 0015 hash reference contract"
```

### Task 3: Add backend regression coverage for restored-hash list behavior ✅

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/characters.rs`

**Step 1: Add a test that stale `spell_id` is refreshed on hash-based upsert** ✅

Expand the Task 1 upsert test so it also asserts:
- row count remains `1`
- `spell_id` changes from `0` to the live spell id
- `spell_content_hash` remains unchanged

Assertion example:

```rust
let (spell_id, hash): (i64, String) = conn.query_row(...)?;
assert_eq!(spell_id, 5);
assert_eq!(hash, "restored-hash");
```

**Step 2: Add a test that remove-by-hash still cascades after a row is recovered** ✅

Add a test that:
- seeds KNOWN and PREPARED rows by hash with stale `spell_id = 0`
- inserts the matching `spell` row later
- removes KNOWN by hash
- asserts both rows are deleted

**Step 3: Run the focused regression tests** ✅

Run:

```powershell
cd apps/desktop/src-tauri
cargo test restored_hash -- --nocapture
```

If no shared substring exists yet, run the explicit test names you added.

Expected: PASS.

**Step 4: Commit** ✅

```powershell
git add apps/desktop/src-tauri/src/commands/characters.rs
git commit -m "test: cover restored hash spell list regressions"
```

### Task 4: Add frontend and Playwright coverage for missing-library rows ✅

**Files:**
- Modify: `apps/desktop/tests/character_edge_cases.spec.ts`
- Modify: `apps/desktop/tests/page-objects/SpellbookApp.ts` if reusable helpers are needed
- Review: `apps/desktop/src/ui/CharacterEditor.tsx`
- Review: `apps/desktop/tests/AGENTS.md`

**Step 1: Write the failing E2E for the visible missing-library placeholder** ✅

Add a Playwright test to `apps/desktop/tests/character_edge_cases.spec.ts` that:
- creates a character with a spell list entry
- manipulates test data through backend setup or seeded DB state so one `character_class_spell` row resolves only by `spell_content_hash` with no matching `spell` row
- opens `CharacterEditor`
- asserts the placeholder text `Spell no longer in library` is visible
- asserts the remove button with test id `btn-remove-spell-hash-<hash>` is present

**Step 2: Write the failing E2E for removing a missing-library row** ✅

Extend the same spec or add a second one that:
- clicks the missing-row remove button
- confirms the modal if required
- waits for reload
- asserts the placeholder row disappears

**Step 3: Add a small page-object helper only if reused** ✅

If the locator chain is used more than once, extend `apps/desktop/tests/page-objects/SpellbookApp.ts` with a helper such as:

```ts
getMissingSpellRow() {
  return this.page.getByTestId("spell-row-missing");
}
```

Do not add page-object code if the test only needs one simple locator.

**Step 4: Rebuild the desktop app** ✅

Run:

```powershell
cd apps/desktop
pnpm tauri:build --debug
```

Expected: successful debug build.

**Step 5: Run the focused Playwright test** ✅

Run:

```powershell
cd apps/desktop
npx playwright test tests/character_edge_cases.spec.ts --grep "missing-library"
```

Expected: FAIL first, then PASS after the test setup and assertions are correct.

**Step 6: Commit** ✅

```powershell
git add apps/desktop/tests/character_edge_cases.spec.ts apps/desktop/tests/page-objects/SpellbookApp.ts
git commit -m "test: cover missing library spell list actions"
```

### Task 5: Run final verification for Task 5 fixes ✅

**Files:**
- Review: `openspec/changes/integrate-spell-hashing-ecosystem/review-task-5_2026_03_10_three-pass.md`
- Review: `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md`

**Step 1: Run backend character command tests** ✅

Run:

```powershell
cd apps/desktop/src-tauri
cargo test commands::characters::tests -- --nocapture
```

Expected: PASS.

**Step 2: Run migration tests**

Run:

```powershell
cd apps/desktop/src-tauri
cargo test migration_0015 -- --nocapture
```

Expected: PASS.

**Step 3: Run the focused Playwright coverage** ✅

Run:

```powershell
cd apps/desktop
npx playwright test tests/character_edge_cases.spec.ts --grep "missing-library"
```

Expected: PASS.

**Step 4: Optionally run broader regression coverage**

Run:

```powershell
cd apps/desktop/src-tauri
cargo test
```

and:

```powershell
cd apps/desktop
npx playwright test tests/character_edge_cases.spec.ts tests/character_profiles_foundation_two.spec.ts
```

Expected: PASS, or document any unrelated failures without rolling back user work.

**Step 5: Update the task 5 review artifact if every issue is resolved** ✅

If all fixes and tests pass, update:
- `openspec/changes/integrate-spell-hashing-ecosystem/review-task-5_2026_03_10_three-pass.md`

Mark findings as resolved only after the verification commands pass.

**Step 6: Commit** ✅

```powershell
git add openspec/changes/integrate-spell-hashing-ecosystem/review-task-5_2026_03_10_three-pass.md
git commit -m "docs: update task 5 review status after fixes"
```
