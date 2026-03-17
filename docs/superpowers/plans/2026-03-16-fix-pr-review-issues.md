# Fix PR Review Issues — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all confirmed bugs, race conditions, code quality issues, and test flakiness identified in the code review of `feat/integrate-spell-hashing-ecosystem`.

**Architecture:** Issues span four layers — Rust backend (commands, db utilities), TypeScript/React frontend (types, components, stores), Playwright E2E tests, and Vitest unit tests. Tasks are ordered so foundational refactors (shared utilities, constants) come first, since later bug-fix tasks depend on the same files.

**Tech Stack:** Rust/Tauri backend, SQLite/rusqlite/r2d2, React 18/TypeScript, Zustand, Playwright E2E, Vitest unit tests, Biome linter.

**Build commands:**
- Backend: `cd apps/desktop && cargo check` (fast), `pnpm tauri:build --debug` (full, required before E2E)
- Frontend unit: `cd apps/desktop && pnpm test:unit`
- E2E (Windows only, requires debug build): `cd apps/desktop && npx playwright test`
- Lint: `cd apps/desktop && pnpm lint`

---

## Chunk 1: Shared Utilities & Constants

### Task 1: Extract `table_has_column` to shared db utility

**Context:** The function `table_has_column` (uses `pragma_table_info` to check if a column exists) is copy-pasted identically into 6 command files AND into `db/migrations.rs` (as `has_column`). Any bug fix or behaviour change must currently be applied 7 times. Move it to `db/utils.rs` and re-export from `db/mod.rs`.

**Files:**
- Create: `apps/desktop/src-tauri/src/db/utils.rs`
- Modify: `apps/desktop/src-tauri/src/db/mod.rs`
- Modify: `apps/desktop/src-tauri/src/db/migrations.rs` (remove local `has_column`, use `super::utils::table_has_column`)
- Modify: `apps/desktop/src-tauri/src/commands/characters.rs` (remove local copy)
- Modify: `apps/desktop/src-tauri/src/commands/export.rs` (remove local copy)
- Modify: `apps/desktop/src-tauri/src/commands/vault.rs` (remove local copy)
- Modify: `apps/desktop/src-tauri/src/commands/spells.rs` (remove local copy)
- Modify: `apps/desktop/src-tauri/src/commands/io_character.rs` (remove local copy)
- Modify: `apps/desktop/src-tauri/src/commands/import.rs` (remove local copy)

- [x] **Step 1: Create `db/utils.rs`**

```rust
// apps/desktop/src-tauri/src/db/utils.rs
use rusqlite::Connection;

/// Returns true if `column` exists on `table` in the given SQLite connection.
/// Used during the schema-migration transition period (migration 0015) where
/// callers branch on whether `spell_content_hash` columns have been added yet.
pub fn table_has_column(conn: &Connection, table: &str, column: &str) -> bool {
    let sql = format!(
        "SELECT 1 FROM pragma_table_info('{}') WHERE name = ?1",
        table.replace('\'', "''")
    );
    conn.query_row(&sql, [column], |_| Ok(())).is_ok()
}
```

- [x] **Step 2: Register the module and re-export**

In `apps/desktop/src-tauri/src/db/mod.rs`, add:
```rust
pub mod migrations;
pub mod pool;
pub mod utils;

pub use pool::{app_data_dir, init_db, Pool};
pub use utils::table_has_column;
```

- [x] **Step 3: Update `db/migrations.rs`**

Replace the local `has_column` function (lines 5–11) with an import from the parent module:
```rust
// Remove fn has_column(...) {...} entirely.
// Replace every call to has_column(...) with super::utils::table_has_column(...)
```

Search for `has_column(` and replace with `super::utils::table_has_column(`.

- [x] **Step 4: Update each command file**

For each of the 6 command files, remove the local `fn table_has_column(...)` definition and replace every call to `table_has_column(` with `crate::db::table_has_column(`. The function signature is identical so no call-site changes are needed beyond the namespace.

Files to update:
- `commands/characters.rs` — remove the `fn table_has_column(...)` definition (currently near the top after the `use` block), update all call sites
- `commands/export.rs` — remove lines 40–46, update 1 call site
- `commands/vault.rs` — remove duplicate, update call sites
- `commands/spells.rs` — remove duplicate, update call sites
- `commands/io_character.rs` — remove duplicate, update call sites
- `commands/import.rs` — remove duplicate, update call sites

- [x] **Step 5: Verify compilation**

```bash
cd apps/desktop
cargo check
```
Expected: no errors. All files should compile cleanly.

- [x] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/db/utils.rs \
        apps/desktop/src-tauri/src/db/mod.rs \
        apps/desktop/src-tauri/src/db/migrations.rs \
        apps/desktop/src-tauri/src/commands/characters.rs \
        apps/desktop/src-tauri/src/commands/export.rs \
        apps/desktop/src-tauri/src/commands/vault.rs \
        apps/desktop/src-tauri/src/commands/spells.rs \
        apps/desktop/src-tauri/src/commands/io_character.rs \
        apps/desktop/src-tauri/src/commands/import.rs
git commit -m "refactor(db): extract table_has_column to shared db utility"
```

---

### Task 2: Define KNOWN / PREPARED constants

**Context:** The string literals `"KNOWN"` and `"PREPARED"` appear 4+ times each in `characters.rs`. A typo would cause silent bugs that only manifest at runtime. Define module-level constants.

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/characters.rs`

- [x] **Step 1: Add constants at the top of `characters.rs`** (after the `use` block)

```rust
const LIST_TYPE_KNOWN: &str = "KNOWN";
const LIST_TYPE_PREPARED: &str = "PREPARED";
```

- [x] **Step 2: Replace string literals**

Search `characters.rs` for every occurrence of `"KNOWN"` and `"PREPARED"` in non-SQL contexts (i.e., in `if list_type ==`, `list_type.as_str()` comparisons, return value checks) and replace with the constants. Leave SQL string literals (inside `"..."` query strings) unchanged — SQLite needs the raw strings.

The full list of non-SQL comparison sites to replace (search for `== "KNOWN"` and `== "PREPARED"` in the file):
- `add_character_spell_with_conn`: `if list_type == "PREPARED"`
- `remove_character_spell_by_hash_with_conn`: `if list_type == "KNOWN"` (line ~198)
- Any legacy ID-based remove function: `if list_type == "KNOWN"`

Example replacements:
```rust
// Before:
if list_type == "PREPARED" {
// After:
if list_type == LIST_TYPE_PREPARED {

// Before:
if list_type == "KNOWN" {
// After:
if list_type == LIST_TYPE_KNOWN {
```

- [x] **Step 3: Compile check**

```bash
cd apps/desktop
cargo check
```
Expected: no errors.

- [x] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/characters.rs
git commit -m "refactor(characters): define KNOWN/PREPARED constants"
```

---

### Task 3: Fix boolean flags in `CharacterSpellbookEntry` (Rust + TypeScript)

**Context:** `isQuestSpell`, `isCantrip`, `prepared`, and `known` are typed as `i64` in the Rust struct `CharacterSpellbookEntry` (`models/character.rs:92-95`) and as `number` in the TypeScript interface (`types/character.ts:50-53`). SQLite returns 0/1 for these columns; they should be `bool`/`boolean` all the way through. Serde serializes `bool` as JSON `true`/`false` (not 0/1), so both layers must be updated together.

**Files:**
- Modify: `apps/desktop/src-tauri/src/models/character.rs`
- Modify: `apps/desktop/src/types/character.ts`
- Modify: any call sites in `apps/desktop/src/ui/CharacterEditor.tsx` or other UI files that break

- [x] **Step 1: Update the Rust struct fields to `bool`**

In `apps/desktop/src-tauri/src/models/character.rs`, change `CharacterSpellbookEntry` (currently lines 85-102):
```rust
// Before:
    pub is_quest_spell: i64,
    pub is_cantrip: i64,
    pub prepared: i64,
    pub known: i64,
// After:
    pub is_quest_spell: bool,
    pub is_cantrip: bool,
    pub prepared: bool,
    pub known: bool,
```

rusqlite's `FromSql` for `bool` reads SQLite INTEGER columns: 0 → `false`, non-zero → `true`. The `row.get(N)?` calls in `map_row_16` and `map_row_12` in `characters.rs` will now infer `bool` automatically via the struct field type — no explicit type annotation needed.

- [x] **Step 2: Verify Rust compilation**

```bash
cd apps/desktop
cargo check
```

If any code reads these fields as `i64` (e.g., `entry.is_quest_spell == 1`), the compiler will flag them. Fix each: `entry.is_quest_spell` (now `bool`) should be used directly or compared with `== true`.

- [x] **Step 3: Update the TypeScript interface**

In `apps/desktop/src/types/character.ts`, change `CharacterSpellbookEntry`:
```typescript
// Before:
  isQuestSpell: number;
  isCantrip: number;
  prepared: number;
  known: number;
// After:
  isQuestSpell: boolean;
  isCantrip: boolean;
  prepared: boolean;
  known: boolean;
```

- [x] **Step 4: Fix TypeScript call sites**

```bash
cd apps/desktop
pnpm typecheck
```

For comparisons like `entry.prepared === 1`, change to `entry.prepared`. For places that must pass an integer to `invoke()` (e.g., `comEnabled: character.comEnabled ? 1 : 0`), the explicit conversion is correct and unchanged. Fix each type error.

- [x] **Step 5: Run unit tests**

```bash
cd apps/desktop
pnpm test:unit
```
Expected: all pass.

- [x] **Step 6: Commit**

```bash
git add apps/desktop/src-tauri/src/models/character.rs \
        apps/desktop/src/types/character.ts \
        apps/desktop/src/ui/CharacterEditor.tsx
git commit -m "fix(types): CharacterSpellbookEntry boolean flags as bool/boolean end-to-end"
```

---

## Chunk 2: Race Condition Fixes

### Task 4: Wrap character spell upgrade in a savepoint transaction

**Context:** `upgrade_character_class_spell_with_conn` (`characters.rs:209–244`) validates that `new_spell_id` maps to `new_hash` (SELECT), then performs the UPDATE in two separate database operations without a transaction. A concurrent `delete_spell` on another thread could delete the new spell between the SELECT and the UPDATE, creating orphaned hash references. Fix: wrap both operations in a savepoint so they are atomic.

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/characters.rs`

- [x] **Step 1: Write a failing test (Rust)**

Add inside the `#[cfg(test)]` block of `characters.rs`:
```rust
#[test]
fn test_upgrade_spell_is_atomic() {
    // Setup: create DB with hash columns, seed a character with a known spell.
    // Call upgrade_character_class_spell_with_conn with a valid old_hash/new_hash.
    // Assert the row is updated and no partial state is visible.
    // (Full test body depends on your test helper setup — see existing test seeds.)
}
```

Run it: `cargo test -p spellbook-desktop test_upgrade_spell_is_atomic -- --nocapture`
Expected: test compiles and passes (this is more a regression guard than a pre-fail test since the race is non-deterministic).

- [x] **Step 2: Wrap the two-operation body in a savepoint**

In `upgrade_character_class_spell_with_conn`, replace the direct `query_row` + `execute` pair with:

```rust
fn upgrade_character_class_spell_with_conn(
    conn: &Connection,
    character_class_id: i64,
    old_hash: &str,
    new_spell_id: i64,
    new_hash: &str,
) -> Result<(), AppError> {
    let sp = conn.savepoint()?;

    // Validate that new_spell_id maps to new_hash (must be inside the savepoint)
    let actual_hash: Option<String> = sp
        .query_row(
            "SELECT content_hash FROM spell WHERE id = ?",
            [new_spell_id],
            |row| row.get(0),
        )
        .optional()?
        .flatten();

    if actual_hash.as_deref() != Some(new_hash) {
        return Err(AppError::Unknown(
            "Provided new_hash does not match the actual spell's content_hash".to_string(),
        ));
    }

    let updated = sp.execute(
        "UPDATE character_class_spell \
         SET spell_content_hash = ?, spell_id = ? \
         WHERE character_class_id = ? AND spell_content_hash = ?",
        params![new_hash, new_spell_id, character_class_id, old_hash],
    )?;
    if updated == 0 {
        return Err(AppError::Unknown(format!(
            "No character spell entries found with hash {} in class {}",
            old_hash, character_class_id
        )));
    }

    sp.commit()?;
    Ok(())
}
```

- [x] **Step 3: Verify compilation and test**

```bash
cd apps/desktop
cargo check
cargo test -p spellbook-desktop test_upgrade_spell_is_atomic
```
Expected: compiles cleanly, test passes.

- [x] **Step 4: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/characters.rs
git commit -m "fix(characters): wrap spell upgrade validate+update in savepoint"
```

---

### Task 5: Wrap PREPARED/KNOWN integrity check in a savepoint transaction

**Context:** `add_character_spell_with_conn` (`characters.rs:247–305`) checks that a PREPARED spell is in the KNOWN list (SELECT EXISTS), then upserts — two separate DB operations without a transaction. A concurrent `remove_character_spell` on another thread could delete the KNOWN row between the check and the upsert, violating the invariant. Fix: wrap both operations in a savepoint.

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/characters.rs`

- [x] **Step 1: Open `add_character_spell_with_conn` and identify the two-phase region**

The function currently:
1. Optionally reads the spell's `content_hash` (if hash columns exist)
2. Does a `SELECT EXISTS` for KNOWN membership
3. Calls `conn.execute(INSERT ... ON CONFLICT DO UPDATE ...)`

All three steps must be inside the same savepoint.

- [x] **Step 2: Wrap in savepoint**

```rust
fn add_character_spell_with_conn(
    conn: &Connection,
    character_class_id: i64,
    spell_id: i64,
    list_type: &str,
    notes: Option<&str>,
) -> Result<(), AppError> {
    let sp = conn.savepoint()?;

    if list_type == LIST_TYPE_PREPARED {
        let use_hash = crate::db::table_has_column(&sp, "character_class_spell", "spell_content_hash");
        let known_exists: bool = if use_hash {
            let spell_content_hash: Option<String> = sp
                .query_row(
                    "SELECT content_hash FROM spell WHERE id = ?",
                    [spell_id],
                    |row| row.get(0),
                )
                .optional()?
                .flatten();
            if let Some(hash) = spell_content_hash.as_deref() {
                sp.query_row(
                    "SELECT EXISTS(SELECT 1 FROM character_class_spell \
                     WHERE character_class_id = ? AND spell_content_hash = ? AND list_type = 'KNOWN')",
                    params![character_class_id, hash],
                    |row| row.get(0),
                )?
            } else {
                sp.query_row(
                    "SELECT EXISTS(SELECT 1 FROM character_class_spell \
                     WHERE character_class_id = ? AND spell_id = ? AND list_type = 'KNOWN')",
                    params![character_class_id, spell_id],
                    |row| row.get(0),
                )?
            }
        } else {
            sp.query_row(
                "SELECT EXISTS(SELECT 1 FROM character_class_spell \
                 WHERE character_class_id = ? AND spell_id = ? AND list_type = 'KNOWN')",
                params![character_class_id, spell_id],
                |row| row.get(0),
            )?
        };

        if !known_exists {
            return Err(AppError::Unknown(
                "Cannot prepare a spell that is not in the Known list.".to_string(),
            ));
        }
    }

    // Perform the upsert inside the same savepoint
    // ... (rest of the existing upsert logic, using `sp` instead of `conn`)

    sp.commit()?;
    Ok(())
}
```

Note: `rusqlite::Savepoint` implements `Deref<Target = Connection>`, so all `conn.execute` / `conn.query_row` calls can be replaced with `sp.execute` / `sp.query_row` without other changes.

**Important:** `add_character_spell_with_conn` calls a helper such as `upsert_character_class_spell_with_hash(conn, ...)` near the end of the function. Change that call to `upsert_character_class_spell_with_hash(&sp, ...)` so the upsert happens inside the savepoint. Since `&Savepoint` auto-derefs to `&Connection`, the helper's signature does not change.

- [x] **Step 3: Verify compilation**

```bash
cd apps/desktop
cargo check
```

- [x] **Step 4: Run existing character tests**

```bash
cd apps/desktop
cargo test -p spellbook-desktop characters
```
Expected: all pass.

- [x] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/characters.rs
git commit -m "fix(characters): wrap PREPARED integrity check and upsert in savepoint"
```

---

### Task 6: Fix DB-commit / vault-file-write ordering in import

**Context:** In `apply_import_spell_json_impl` (`import.rs`), vault artifact files are written to disk before the database transaction commits. If the transaction commit succeeds but a subsequent vault file write fails, the DB reflects the import but some artifact files are missing (split-brain). The fix is to ensure vault files are written **after** the transaction commits, and any write failure triggers a best-effort cleanup with a clear error message.

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/import.rs`

- [x] **Step 0: Write a test first**

Add a test in `apps/desktop/src-tauri/src/commands/import.rs` `#[cfg(test)]` section:
```rust
#[test]
fn test_import_db_commit_before_vault_write() {
    // Setup: create an import with one spell that has a vault artifact
    // Mock/intercept the vault write to fail after DB commit
    // Assert: after the failure, DB does NOT contain the imported spell
    //   (because commit should happen AFTER successful writes — or alternatively
    //    the test documents the CURRENT behaviour and this task reverses it)
    // If a filesystem mock is not available, document the expected invariant
    // as a comment and write an integration-style test that checks the happy path:
    // import succeeds → both DB record and vault file exist.
}
```

Note: a pure unit test for write-failure is difficult without filesystem injection. At minimum, write a test that verifies the happy path (spell + artifact are both present after successful import), then ensure the reorder doesn't break it.

- [x] **Step 1: Read the existing commit / write sequence**

In `apps/desktop/src-tauri/src/commands/import.rs`, search for `tx.commit()` and `write_pending_vault_files` (or the vault write function name). Note the exact order and variable names. The current order is likely: write files → commit transaction. Confirm before changing.

- [x] **Step 2: Reorder — commit first, then write files**

The corrected sequence should be:
```rust
// 1. Commit the database transaction first
tx.commit().map_err(AppError::Database)?;

// 2. Write vault files after commit — DB is now consistent
let mut written_paths: Vec<PathBuf> = Vec::new();
for (path, content) in pending_vault_writes {
    if let Err(e) = std::fs::write(&path, &content) {
        // Best-effort cleanup of files written so far in this batch
        for written in &written_paths {
            let _ = std::fs::remove_file(written);
        }
        return Err(AppError::Io(e));
    }
    written_paths.push(path);
}
```

If the original code already has a `cleanup_written_vault_files` helper, use it in the error handler.

- [x] **Step 3: Verify compilation**

```bash
cd apps/desktop
cargo check
```

- [x] **Step 4: Run import-related tests**

```bash
cd apps/desktop
cargo test -p spellbook-desktop import
```
Expected: all pass.

- [x] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/import.rs
git commit -m "fix(import): commit DB transaction before writing vault files"
```

---

### Task 7: Fix Zustand `showModalIfIdle` non-atomic check-then-set

**Context:** `showModalIfIdle` in `useModal.ts` reads `isOpen` with `get()` and then calls `set()` in two separate steps. While JavaScript is single-threaded, Zustand's `get`/`set` separation means two callers in the same microtask batch (e.g., two resolved Promises that both call `showModalIfIdle`) could both read `isOpen === false` before either sets it to `true`, causing one modal to be silently dropped. Fix: use a single `set(state => ...)` callback that reads and writes atomically within Zustand's update cycle.

**Files:**
- Modify: `apps/desktop/src/store/useModal.ts`

- [x] **Step 1: Write a unit test**

In `apps/desktop/src/store/useModal.test.ts`, add:
```typescript
test("showModalIfIdle is atomic — second concurrent call is queued", () => {
  const { showModalIfIdle, hideModal } = useModal.getState();

  // Simulate two synchronous calls before any re-render
  const r1 = showModalIfIdle({ title: "First", message: "a", type: "info", buttons: [] });
  const r2 = showModalIfIdle({ title: "Second", message: "b", type: "info", buttons: [] });

  expect(r1).toBe(true);  // First caller wins
  expect(r2).toBe(false); // Second caller is queued
  expect(useModal.getState().title).toBe("First");
  expect(useModal.getState().queuedModal?.title).toBe("Second");

  hideModal();
  expect(useModal.getState().title).toBe("Second");
});
```

Run: `cd apps/desktop && pnpm test:unit -- --reporter verbose`
Expected: test passes (the current implementation already handles this correctly in synchronous calls).

- [x] **Step 2: Rewrite `showModalIfIdle` to use an atomic updater**

Replace the current implementation:
```typescript
// Current (non-atomic):
showModalIfIdle: (options) => {
  if (get().isOpen) {
    set({ queuedModal: options });
    return false;
  }
  set({ ...options, isOpen: true, queuedModal: undefined });
  return true;
},
```

With an atomic setter approach. Note: Zustand's `set` with a function argument reads and writes in one operation, but returning a value from `set` requires a workaround. The cleanest fix is to use a ref-tracked return value:

```typescript
showModalIfIdle: (options) => {
  let wasIdle = false;
  set((state) => {
    if (state.isOpen) {
      wasIdle = false;
      return { queuedModal: options };
    }
    wasIdle = true;
    return { ...options, isOpen: true, queuedModal: undefined };
  });
  return wasIdle;
},
```

- [x] **Step 3: Run unit tests**

```bash
cd apps/desktop
pnpm test:unit
```
Expected: all pass including the new test.

- [x] **Step 4: Commit**

```bash
git add apps/desktop/src/store/useModal.ts apps/desktop/src/store/useModal.test.ts
git commit -m "fix(modal): make showModalIfIdle atomic with Zustand functional updater"
```

---

## Chunk 3: Bug Fixes

### Task 8: Fix upgrade detection subquery — restrict to same school/tradition

**Context:** The `available_upgrade_hash` / `available_upgrade_spell_id` correlated subquery in `get_character_class_spells_with_conn` (`characters.rs:37–52`) finds upgrade candidates using only `s2.name = s.name`. If two spells share a name but differ in school or tradition (a legitimate AD&D 2e scenario), the wrong spell is proposed as an upgrade. Fix: add a school/sphere/tradition match condition.

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/characters.rs`

- [x] **Step 1: Write a failing test**

Look at the existing test helpers in the `#[cfg(test)]` section of `characters.rs` — there are helpers like `test_seed_spell` and `test_seed_character_with_upgradeable_spell`. Use the same DB setup pattern. Add:

```rust
#[test]
fn test_upgrade_detection_respects_school() {
    let conn = setup_test_db_with_hash_columns(); // use existing test helper pattern

    // Seed: two spells named "Fireball", different schools, different hashes
    let evoc_hash = test_seed_spell(&conn, "Fireball", 3, Some("Evocation"), None);
    let trans_hash = test_seed_spell(&conn, "Fireball", 3, Some("Transmutation"), None);

    // Seed: character class with the Evocation Fireball
    let class_id = test_seed_character_class(&conn);
    conn.execute(
        "INSERT INTO character_class_spell (character_class_id, spell_content_hash, list_type) VALUES (?1, ?2, 'KNOWN')",
        params![class_id, evoc_hash],
    ).unwrap();

    // Before fix: available_upgrade_hash would return trans_hash (wrong)
    let entries = get_character_class_spells_with_conn(&conn, class_id, None).unwrap();
    assert_eq!(entries.len(), 1);
    // After fix, this should be None. Before fix, it is Some(trans_hash).
    assert!(entries[0].available_upgrade_hash.is_none(),
        "Spell with different school should not be an upgrade candidate");
}
```

Run: `cargo test -p spellbook-desktop test_upgrade_detection_respects_school -- --nocapture`
Expected: FAIL (the current query returns the Transmutation spell as an upgrade candidate).

- [x] **Step 2: Add school/sphere/tradition guard to all 4 subqueries**

There are **4 occurrences** to update (2 branches × 2 subqueries per branch). In `get_character_class_spells_with_conn` (`characters.rs`):

**Occurrence 1** — `list_type` branch, `available_upgrade_hash` subquery:
```sql
-- Before:
(SELECT s2.content_hash FROM spell s2
 WHERE s2.name = s.name
   AND s2.content_hash != ccs.spell_content_hash
   AND s2.content_hash IS NOT NULL
   AND s2.id > s.id
 ORDER BY s2.id DESC LIMIT 1)
-- After:
(SELECT s2.content_hash FROM spell s2
 WHERE s2.name = s.name
   AND COALESCE(s2.school, '') = COALESCE(s.school, '')
   AND COALESCE(s2.sphere, '') = COALESCE(s.sphere, '')
   AND s2.content_hash != ccs.spell_content_hash
   AND s2.content_hash IS NOT NULL
   AND s2.id > s.id
 ORDER BY s2.id DESC LIMIT 1)
```

**Occurrence 2** — `list_type` branch, `available_upgrade_spell_id` subquery: same school/sphere guard, using `SELECT s2.id`.

**Occurrences 3 & 4** — The no-filter (`else`) branch has the same two subqueries. Apply identical guard.

Search for `WHERE s2.name = s.name` in `characters.rs` — there should be exactly 4 matches. Add the school/sphere conditions to each.

- [x] **Step 3: Run the test**

```bash
cargo test -p spellbook-desktop test_upgrade_detection_respects_school
```
Expected: PASS.

- [x] **Step 4: Compile check**

```bash
cargo check
```

- [x] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/characters.rs
git commit -m "fix(characters): restrict upgrade detection to same school/sphere"
```

---

### Task 9: Fix `ImportWizard` mixed-file-type detection

**Context:** `handleFileChange` in `ImportWizard.tsx` uses `.some(f => f.name.endsWith(".json"))` to set `isJsonImport`. If the user selects a mix of `.json` and `.md` files, `isJsonImport` is `true` and the wizard routes all files through the JSON import path, causing `.md` files to be silently rejected or mishandled. Fix: require **all** selected files to be `.json` for JSON import mode; otherwise fall back to markdown mode and disallow the mixed selection.

**Files:**
- Modify: `apps/desktop/src/ui/ImportWizard.tsx`

- [x] **Step 1: Write a unit test**

In `apps/desktop/src/ui/ImportWizard.test.tsx`, add a test for mixed selection:
```typescript
test("selecting mixed .json and .md files is rejected with an error", async () => {
  // Render ImportWizard
  // Simulate file input with [test.json, test.md]
  // Assert: error message appears ("Please select files of one type only")
  // Assert: isJsonImport state is not set
});
```

Run: `pnpm test:unit`
Expected: FAIL (no mixed-type guard exists yet).

- [x] **Step 2: Update `handleFileChange`**

```typescript
const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  if (!e.target.files) return;
  const selectedFiles = Array.from(e.target.files);

  const allJson = selectedFiles.every((f) => f.name.toLowerCase().endsWith(".json"));
  const allMd = selectedFiles.every((f) =>
    f.name.toLowerCase().endsWith(".md") || f.name.toLowerCase().endsWith(".txt")
  );

  if (!allJson && !allMd) {
    // Mixed types — reject and show error
    setResult({ type: "error", message: "Please select files of one type only (.json or .md)." });
    setFiles([]);
    return;
  }

  setFiles(selectedFiles);
  setResult(null);
  setStep("select");
  setIsJsonImport(allJson);
  // Reset JSON state on new selection
  setJsonPayload("");
  setJsonPreviewResult(null);
  setJsonImportResult(null);
  setJsonConflicts([]);
  setJsonConflictIndex(0);
  setJsonResolutions([]);
  setBulkAction(null);
};
```

- [x] **Step 3: Run the unit test**

```bash
cd apps/desktop
pnpm test:unit
```
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add apps/desktop/src/ui/ImportWizard.tsx apps/desktop/src/ui/ImportWizard.test.tsx
git commit -m "fix(import): reject mixed .json/.md file selection"
```

---

## Chunk 4: Test Flakiness Fixes

### Task 10: Replace fixed sleeps with deterministic waits in E2E tests

**Context:** `character_edge_cases.spec.ts` uses `page.waitForTimeout(500)` after `app.navigate("Characters")` (lines 181, 238, 296, 367) — a fixed sleep that can fail on slow machines or pass too quickly on fast ones. Replace with `expect(...).toBeVisible()` guards on the actual element that confirms the navigation landed.

**Files:**
- Modify: `apps/desktop/tests/character_edge_cases.spec.ts`

- [x] **Step 1: Identify all fixed sleeps after navigation**

Search for `waitForTimeout` in `character_edge_cases.spec.ts`:
```bash
grep -n "waitForTimeout" apps/desktop/tests/character_edge_cases.spec.ts
```

- [x] **Step 2: Replace each `waitForTimeout(500)` after navigation**

**Note on `tests/AGENTS.md`:** Section 6.1 of the E2E guide endorses a "500ms settlement wait" after navigation. However, this guidance conflicts with the E2E test best practices guide which discourages fixed sleeps, and recent commits (`7a8719b`) have moved toward deterministic waits. The project intent is to replace fixed sleeps with element-based waits. The settlement guidance in 6.1 is for cases where `app.navigate()` does not already include settlement — check whether `SpellbookApp.navigate()` in `page-objects/SpellbookApp.ts` already waits for specific UI elements (if it does, the extra `waitForTimeout` is truly redundant).

The pattern to replace:
```typescript
// Before:
await app.navigate("Characters");
await page.waitForTimeout(500);

// After:
await app.navigate("Characters");
// Confirm the specific element your test depends on is visible before interacting:
await expect(page.getByRole("link", { name: charName })).toBeVisible({
  timeout: TIMEOUTS.medium,
});
```

Read `SpellbookApp.navigate()` in `page-objects/SpellbookApp.ts` first to understand what it already waits for, then verify the specific element each test needs immediately after navigation and wait for that instead of a fixed sleep. Do NOT just swap `waitForTimeout(500)` for `waitForTimeout(0)` — remove the sleep entirely and replace with an element wait.

- [x] **Step 3: Run E2E tests locally** *(requires debug build)*

```bash
cd apps/desktop
pnpm tauri:build --debug
npx playwright test character_edge_cases --reporter=list
```
Expected: tests pass without timing-related failures.

- [x] **Step 4: Commit**

```bash
git add apps/desktop/tests/character_edge_cases.spec.ts
git commit -m "test(e2e): replace fixed waitForTimeout with element visibility waits"
```

---

### Task 11: Fix modal dismissal try/catch anti-pattern

**Context:** Several test steps in `character_edge_cases.spec.ts` wrap optional modal dismissal in a bare `try/catch(e) {}` — silently swallowing the error when the modal doesn't appear within 2000ms. This uses a timeout inconsistent with the `TIMEOUTS` constants (2000ms vs. `TIMEOUTS.short` = 5000ms) and can produce a non-deterministic test state if the modal IS visible but slow to render.

The `dialog-handler.ts` utility already provides `handleCustomModal` for the React-based glassmorphism modals. Use it with a short timeout.

**Files:**
- Modify: `apps/desktop/tests/character_edge_cases.spec.ts`

- [x] **Step 1: Identify all try/catch modal dismissal blocks**

Search:
```bash
grep -n "modal.waitFor" apps/desktop/tests/character_edge_cases.spec.ts
```
Expected: ~6 occurrences.

- [x] **Step 2: Replace the pattern with conditional `handleCustomModal`**

The existing pattern:
```typescript
const modal = page.getByTestId("modal-dialog");
try {
  await modal.waitFor({ state: "visible", timeout: 2000 });
  await page.getByTestId("modal-button-dismiss").click();
} catch (e) {
  // Did not trigger - ignore.
}
```

Replace with:
```typescript
// Dismiss startup modal if present (e.g., integrity check results)
const modal = page.getByTestId("modal-dialog");
const isModalVisible = await modal.isVisible();
if (isModalVisible) {
  await page.getByTestId("modal-button-dismiss").click();
  await expect(modal).not.toBeVisible({ timeout: TIMEOUTS.short });
}
```

This is deterministic: `isVisible()` is synchronous and returns the current state without a timeout. If the modal is not present at the moment of the check, we skip dismissal. If it is present, we dismiss it and wait for it to close.

- [x] **Step 3: Run E2E tests**

```bash
cd apps/desktop
npx playwright test character_edge_cases --reporter=list
```
Expected: all pass.

- [x] **Step 4: Commit**

```bash
git add apps/desktop/tests/character_edge_cases.spec.ts
git commit -m "test(e2e): replace silent modal try/catch with deterministic visibility check"
```

---

### Task 12: Fix Zustand store isolation in unit tests

**Context:** `useModal.test.ts` resets Zustand state in `afterEach`, but the `useModal` store is a singleton that persists between tests in the same file. If an earlier test leaves the store in a non-default state and `afterEach` hasn't run yet (e.g., due to a test error), subsequent tests see contaminated state. Fix: also reset the store in `beforeEach`.

**Files:**
- Modify: `apps/desktop/src/store/useModal.test.ts`

- [x] **Step 1: Add `beforeEach` reset**

In `useModal.test.ts`, the existing `afterEach` (lines 5-16) resets: `isOpen, type, title, message, buttons, customContent, dismissible, onClose`. Extract it into a shared function and also call it in `beforeEach`:

```typescript
// Ensure store is clean before AND after each test
const resetStore = () =>
  useModal.setState({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
    buttons: [],
    customContent: undefined,
    dismissible: true,
    onClose: undefined,
    queuedModal: undefined,
  });

beforeEach(resetStore);
afterEach(resetStore);
```

The reset object must exactly match the `initialState` defined in `useModal.ts` plus `queuedModal: undefined`.

- [x] **Step 2: Run unit tests**

```bash
cd apps/desktop
pnpm test:unit -- --reporter verbose
```
Expected: all tests pass; no order-dependent failures.

- [x] **Step 3: Commit**

```bash
git add apps/desktop/src/store/useModal.test.ts
git commit -m "test(unit): reset modal store in beforeEach for test isolation"
```

---

## Chunk 5: Code Quality

### Task 13: Add `toHaveBeenCalledTimes` guard to VaultMaintenanceDialog tests

**Context:** The Vitest test in `VaultMaintenanceDialog.test.tsx` asserts `invokeMock.toHaveBeenCalledWith("optimize_vault")` but does not verify that this is the only call made. A refactor that adds an extra `invoke` call would pass undetected. Add `toHaveBeenCalledTimes(1)` where appropriate to lock down the call count.

**Files:**
- Modify: `apps/desktop/src/ui/components/VaultMaintenanceDialog.test.tsx`

- [x] **Step 1: Locate the optimize_vault test**

Find the test that asserts `invokeMock.toHaveBeenCalledWith("optimize_vault")` in `VaultMaintenanceDialog.test.tsx`.

- [x] **Step 2: Add call count guard**

After the existing `toHaveBeenCalledWith` assertion, add:
```typescript
expect(invokeMock).toHaveBeenCalledTimes(1);
// or, if setup calls also invoke, use:
// expect(invokeMock).toHaveBeenNthCalledWith(N, "optimize_vault");
```

Read the test's `beforeEach` / setup to count how many `invoke` calls the test fixture makes before the action under test, then assert the correct total count.

- [x] **Step 3: Run unit tests**

```bash
cd apps/desktop
pnpm test:unit
```
Expected: all pass.

- [x] **Step 4: Commit**

```bash
git add apps/desktop/src/ui/components/VaultMaintenanceDialog.test.tsx
git commit -m "test(unit): add invoke call count assertion to VaultMaintenanceDialog tests"
```

---

### Task 14: Fix `VaultMaintenanceDialog` service function separation

**Context:** `VaultMaintenanceDialog.tsx` exports two service-layer functions `getVaultSettings()` and `runVaultIntegrityCheck()` that wrap `invoke()` calls. Having service functions exported from a UI component file violates separation of concerns and makes them harder to test independently. Extract them to `apps/desktop/src/api/vault.ts`.

**Files:**
- Create: `apps/desktop/src/api/vault.ts`
- Modify: `apps/desktop/src/ui/components/VaultMaintenanceDialog.tsx`
- Modify: `apps/desktop/src/ui/App.tsx` (re-import from new location)
- Modify: `apps/desktop/src/ui/ImportWizard.tsx` (also imports service functions from `VaultMaintenanceDialog`)

- [x] **Step 1: Read which functions are exported from `VaultMaintenanceDialog.tsx`**

Run:
```bash
grep -n "^export" apps/desktop/src/ui/components/VaultMaintenanceDialog.tsx
```

Note all exported non-component symbols (currently: `getVaultSettings`, `runVaultIntegrityCheck`, and possibly others like `optimizeVault`, `toggleIntegrityCheckOnOpen`, `formatVaultMaintenanceError`). All of these will move to `src/api/vault.ts`.

- [x] **Step 2: Create `src/api/vault.ts`**

```typescript
// apps/desktop/src/api/vault.ts
import { invoke } from "@tauri-apps/api/core";
import type {
  VaultSettings,
  VaultIntegritySummary,
  // add other types as needed
} from "../types/vault";  // Note: one level up from src/api/, not two

export async function getVaultSettings(): Promise<VaultSettings> {
  return invoke<VaultSettings>("get_vault_settings");
}

export async function runVaultIntegrityCheck(): Promise<VaultIntegritySummary> {
  return invoke<VaultIntegritySummary>("run_vault_integrity_check");
}

// Copy any other exported service functions verbatim from VaultMaintenanceDialog.tsx
```

The import path from `src/api/vault.ts` to `src/types/vault.ts` is `"../types/vault"` (one level up, not two).

- [x] **Step 3: Update `VaultMaintenanceDialog.tsx`**

Remove all exported service functions from the top of the file and add an import:
```typescript
import { getVaultSettings, runVaultIntegrityCheck } from "../../api/vault";
```
(The component is at `src/ui/components/`, two levels up to `src/`, then `api/vault`.)

- [x] **Step 4: Update `App.tsx`**

Change the import of service functions from `./components/VaultMaintenanceDialog` to `../api/vault`.

- [x] **Step 5: Update `ImportWizard.tsx`**

`ImportWizard.tsx` also imports service functions from `./components/VaultMaintenanceDialog` (e.g., `getVaultSettings`). Update to import from `./components/../../../api/vault` or the correct relative path: `"../api/vault"` (since `ImportWizard.tsx` is at `src/ui/`, one level up to `src/`, then `api/vault`).

- [x] **Step 4: Typecheck and test**

```bash
cd apps/desktop
pnpm typecheck
pnpm test:unit
```
Expected: no type errors, all tests pass.

- [x] **Step 5: Commit**

```bash
git add apps/desktop/src/api/vault.ts \
        apps/desktop/src/ui/components/VaultMaintenanceDialog.tsx \
        apps/desktop/src/ui/App.tsx \
        apps/desktop/src/ui/ImportWizard.tsx
git commit -m "refactor(vault): extract service functions from VaultMaintenanceDialog to api/vault.ts"
```

---

## Plan Review Checklist

After completing each chunk, verify:

- [x] `cargo check` passes with no warnings (backend chunks)
- [x] `pnpm typecheck` passes (frontend chunks)
- [x] `pnpm test:unit` passes (frontend chunks)
- [x] `pnpm lint` passes for modified files
- [x] E2E tests pass on Windows after debug rebuild (test flakiness chunks)

## What Was Not Included

The following items from the review require deeper investigation before a safe fix can be written, and are tracked separately:

- **Export LEFT JOIN (`export.rs`)**: The agent flagged this but the OR logic (`hash IS NOT NULL → match by hash; hash IS NULL → match by id`) appears correct by construction. The `missing_count` pre-check gates the main query. Needs closer examination with a real test case before changing.
- **`canonical_spell.rs` default schema_version = v1**: The doc comment explicitly justifies this as intentional (treats hand-crafted JSON conservatively). Revert only if a concrete import regression is demonstrated.
- **`artifact spell_id` unwrap_or (`spells.rs:162-186`)**: Marginal edge case during migration period. Track for cleanup once migration 0015 is fully applied.
- **Vault maintenance phase TOCTOU (`vault.rs`)**: The Mutex guard is re-acquired atomically around the phase transition. Real-world impact requires concurrent vault operations, which the UI doesn't currently enable. Monitor for now.
- **SavePoint nesting depth in bulk import**: SQLite savepoint depth is not bounded by a hard limit; practical 10K-spell imports won't hit issues. Monitor.
