# Character Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Complete Task 7 of `integrate-spell-hashing-ecosystem` so character spellbook entries offer an explicit "Upgrade" action when a newer version of the same-name spell is in the library.

**Architecture:** Tasks 7.1 prerequisite items (hash-first reads, missing-spell placeholders, Remove action, dual-column writes) are already implemented. The only remaining gap is the explicit upgrade flow: extend `CharacterSpellbookEntry` with upgrade-detection columns, add `upgrade_character_class_spell` backend command, and add the "Upgrade" UI button in `CharacterEditor.tsx`. Follow the existing TDD pattern from Tasks 5–6.

**Tech Stack:** Rust/Tauri backend (`characters.rs`, `models/character.rs`, `lib.rs`), TypeScript/React frontend (`CharacterEditor.tsx`, `types/character.ts`), Playwright E2E (`character_edge_cases.spec.ts`), `cargo test`.

---

## Current Baseline

- Migration 0015 already adds `character_class_spell.spell_content_hash` and indexes.
- `get_character_class_spells_with_conn` uses hash-first LEFT JOIN (14-column path) with `missing_from_library` flag.
- `remove_character_spell_by_hash` command and matching frontend "Remove" button handle orphan rows.
- `CharacterSpellbookEntry` model has `spell_content_hash: Option<String>` and `missing_from_library: bool`.
- `CharacterEditor.tsx` shows "Spell no longer in library" placeholder and Remove button.
- E2E tests for placeholder and remove already pass.
- **Remaining gap:** No upgrade detection or command. `CharacterSpellbookEntry` has no `available_upgrade_hash` or `available_upgrade_spell_id` fields. No "Upgrade" button in UI. No E2E test for upgrade.

## File Map

**Modify:**
- `apps/desktop/src-tauri/src/models/character.rs` — add 2 new fields to `CharacterSpellbookEntry`
- `apps/desktop/src-tauri/src/commands/characters.rs` — extend query (rename `map_row_14` → `map_row_16`, add 2 SQL columns), add `upgrade_character_class_spell` command, add `test_seed_character_with_upgradeable_spell` E2E-helper command
- `apps/desktop/src-tauri/src/lib.rs` — register 2 new commands
- `apps/desktop/src/types/character.ts` — add `availableUpgradeHash` and `availableUpgradeSpellId` to `CharacterSpellbookEntry`
- `apps/desktop/src/ui/CharacterEditor.tsx` — add "Upgrade" button to spell row
- `apps/desktop/tests/character_edge_cases.spec.ts` — add upgrade E2E test

**Do NOT modify:** migration SQL, vault, import, spells.rs, any other file.

## Subagent Dispatch Order

1. **Task 1–3** → Backend subagent (sequential: model → query → command → registration)
2. **Task 4** → Frontend subagent (after backend is committed)
3. **Task 5** → E2E subagent (after frontend is committed and binary rebuilt)
4. **Task 6** → Verification runner
5. **Tasks 7–9** → Three review subagents (one per pass, dispatched sequentially)

---

## Chunk 1: Backend — Model, Query Extension, Upgrade Command

### Task 1: Extend `CharacterSpellbookEntry` Model

**Files:**
- Modify: `apps/desktop/src-tauri/src/models/character.rs:85-100`

- [x] **Step 1: Read the current model**

Read `apps/desktop/src-tauri/src/models/character.rs` lines 82–100 to confirm the current struct fields before editing.

- [x] **Step 2: Add 2 new fields to `CharacterSpellbookEntry`**

Add after `missing_from_library: bool,`:

```rust
    pub available_upgrade_hash: Option<String>,
    pub available_upgrade_spell_id: Option<i64>,
```

The full struct after the edit:

```rust
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct CharacterSpellbookEntry {
    pub character_id: i64,
    pub spell_id: i64,
    pub spell_name: String,
    pub spell_level: i64,
    pub spell_school: Option<String>,
    pub spell_sphere: Option<String>,
    pub is_quest_spell: i64,
    pub is_cantrip: i64,
    pub prepared: i64,
    pub known: i64,
    pub notes: Option<String>,
    pub tags: Option<String>,
    pub spell_content_hash: Option<String>,
    pub missing_from_library: bool,
    pub available_upgrade_hash: Option<String>,
    pub available_upgrade_spell_id: Option<i64>,
}
```

- [x] **Step 3: Verify compilation will fail (expected)**

Run: `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: **Compilation errors** — `map_row_14` and `map_row_12` do not populate `available_upgrade_hash` and `available_upgrade_spell_id`. This is intentional; these are fixed in Task 2, Step 2. Do not attempt to fix them here. Proceed to Task 2.

---

### Task 2: Extend the Hash-Path Query and Row Mapper

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/characters.rs:21-148`

- [x] **Step 1: Write failing test for upgrade detection**

In the `#[cfg(test)]` block (around line 887 in `characters.rs`), add:

```rust
#[test]
fn test_get_character_class_spells_detects_available_upgrade() {
    // Setup: spell A (hash-a) in character list, spell B (same name, hash-b) in library
    let conn = setup_character_spell_test_db(true);
    // Extend the spell table BEFORE inserting rows — the minimal schema only has id and content_hash
    conn.execute_batch(
        "ALTER TABLE spell ADD COLUMN name TEXT;
         ALTER TABLE spell ADD COLUMN level INTEGER;
         ALTER TABLE spell ADD COLUMN school TEXT;
         ALTER TABLE spell ADD COLUMN sphere TEXT;
         ALTER TABLE spell ADD COLUMN is_quest_spell INTEGER NOT NULL DEFAULT 0;
         ALTER TABLE spell ADD COLUMN is_cantrip INTEGER NOT NULL DEFAULT 0;",
    ).unwrap();
    conn.execute(
        "INSERT INTO spell (id, content_hash, name, level, school, sphere, is_quest_spell, is_cantrip) \
         VALUES (1, 'hash-a', 'Fireball', 3, 'Evocation', NULL, 0, 0)",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO spell (id, content_hash, name, level, school, sphere, is_quest_spell, is_cantrip) \
         VALUES (2, 'hash-b', 'Fireball', 3, 'Evocation', NULL, 0, 0)",
        [],
    ).unwrap();
    // Insert character_class_spell
    conn.execute(
        "INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes, spell_content_hash) \
         VALUES (99, 1, 'KNOWN', NULL, 'hash-a')",
        [],
    ).unwrap();
    // Add character_class row so JOIN works
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS character_class (id INTEGER PRIMARY KEY, character_id INTEGER NOT NULL, class_name TEXT, class_label TEXT, level INTEGER);
         INSERT INTO character_class (id, character_id, class_name, level) VALUES (99, 7, 'Mage', 5);
         CREATE TABLE IF NOT EXISTS \"character\" (id INTEGER PRIMARY KEY, name TEXT);
         INSERT INTO \"character\" (id, name) VALUES (7, 'TestChar');",
    ).unwrap();

    let spells = get_character_class_spells_with_conn(&conn, 99, None).unwrap();
    assert_eq!(spells.len(), 1);
    assert_eq!(spells[0].spell_name, "Fireball");
    assert_eq!(spells[0].spell_content_hash.as_deref(), Some("hash-a"));
    assert_eq!(spells[0].available_upgrade_hash.as_deref(), Some("hash-b"),
        "upgrade should point to hash-b (the other Fireball version)");
    assert_eq!(spells[0].available_upgrade_spell_id, Some(2));
    assert!(!spells[0].missing_from_library);
}

#[test]
fn test_get_character_class_spells_no_upgrade_when_single_version() {
    let conn = setup_character_spell_test_db(true);
    // Extend spell table with columns needed by subquery and row mapper
    conn.execute_batch(
        "ALTER TABLE spell ADD COLUMN name TEXT;
         ALTER TABLE spell ADD COLUMN level INTEGER;
         ALTER TABLE spell ADD COLUMN school TEXT;
         ALTER TABLE spell ADD COLUMN sphere TEXT;
         ALTER TABLE spell ADD COLUMN is_quest_spell INTEGER NOT NULL DEFAULT 0;
         ALTER TABLE spell ADD COLUMN is_cantrip INTEGER NOT NULL DEFAULT 0;",
    ).unwrap();
    conn.execute(
        "INSERT INTO spell (id, content_hash, name, level, school, sphere, is_quest_spell, is_cantrip) \
         VALUES (1, 'hash-only', 'Magic Missile', 1, 'Evocation', NULL, 0, 0)",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes, spell_content_hash) \
         VALUES (88, 1, 'KNOWN', NULL, 'hash-only')",
        [],
    ).unwrap();
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS character_class (id INTEGER PRIMARY KEY, character_id INTEGER NOT NULL, class_name TEXT, class_label TEXT, level INTEGER);
         INSERT INTO character_class (id, character_id, class_name, level) VALUES (88, 6, 'Mage', 3);
         CREATE TABLE IF NOT EXISTS \"character\" (id INTEGER PRIMARY KEY, name TEXT);
         INSERT INTO \"character\" (id, name) VALUES (6, 'SoloChar');",
    ).unwrap();

    let spells = get_character_class_spells_with_conn(&conn, 88, None).unwrap();
    assert_eq!(spells.len(), 1);
    assert!(spells[0].available_upgrade_hash.is_none(),
        "no upgrade should be available when only one version exists");
    assert!(spells[0].available_upgrade_spell_id.is_none());
}

#[test]
fn test_get_character_class_spells_no_upgrade_for_missing_spell() {
    let conn = setup_character_spell_test_db(true);
    // Extend spell table so the row mapper and subquery don't fail on missing columns
    conn.execute_batch(
        "ALTER TABLE spell ADD COLUMN name TEXT;
         ALTER TABLE spell ADD COLUMN level INTEGER;
         ALTER TABLE spell ADD COLUMN school TEXT;
         ALTER TABLE spell ADD COLUMN sphere TEXT;
         ALTER TABLE spell ADD COLUMN is_quest_spell INTEGER NOT NULL DEFAULT 0;
         ALTER TABLE spell ADD COLUMN is_cantrip INTEGER NOT NULL DEFAULT 0;",
    ).unwrap();
    // No spell row with this hash — it's orphaned
    conn.execute(
        "INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes, spell_content_hash) \
         VALUES (77, 0, 'KNOWN', NULL, 'orphan-hash')",
        [],
    ).unwrap();
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS character_class (id INTEGER PRIMARY KEY, character_id INTEGER NOT NULL, class_name TEXT, class_label TEXT, level INTEGER);
         INSERT INTO character_class (id, character_id, class_name, level) VALUES (77, 5, 'Mage', 1);
         CREATE TABLE IF NOT EXISTS \"character\" (id INTEGER PRIMARY KEY, name TEXT);
         INSERT INTO \"character\" (id, name) VALUES (5, 'OrphanChar');",
    ).unwrap();

    let spells = get_character_class_spells_with_conn(&conn, 77, None).unwrap();
    assert_eq!(spells.len(), 1);
    assert!(spells[0].missing_from_library, "should be marked missing");
    assert!(spells[0].available_upgrade_hash.is_none(),
        "no upgrade for missing spells");
}
```

Run: `cargo test characters:: --manifest-path apps/desktop/src-tauri/Cargo.toml 2>&1 | grep -E "FAILED|test.*upgrade"`

Expected: FAIL — `available_upgrade_hash` and `available_upgrade_spell_id` are not yet populated.

- [x] **Step 2: Rename `map_row_14` to `map_row_16` and update its column reads**

Find `fn map_row_14` (around line 112) and replace it with `map_row_16` that reads 16 columns:

```rust
fn map_row_16(row: &rusqlite::Row<'_>) -> rusqlite::Result<CharacterSpellbookEntry> {
    Ok(CharacterSpellbookEntry {
        character_id: row.get(0)?,
        spell_id: row.get(1)?,
        spell_name: row.get(2)?,
        spell_level: row.get(3)?,
        spell_school: row.get(4)?,
        spell_sphere: row.get(5)?,
        is_quest_spell: row.get(6)?,
        is_cantrip: row.get(7)?,
        prepared: row.get(8)?,
        known: row.get(9)?,
        notes: row.get(10)?,
        tags: row.get(11)?,
        spell_content_hash: row.get(12)?,
        missing_from_library: row.get::<_, i64>(13)? != 0,
        available_upgrade_hash: row.get(14)?,
        available_upgrade_spell_id: row.get(15)?,
    })
}
```

Also update `map_row_12` to set the new fields to `None`:

```rust
fn map_row_12(row: &rusqlite::Row<'_>) -> rusqlite::Result<CharacterSpellbookEntry> {
    Ok(CharacterSpellbookEntry {
        character_id: row.get(0)?,
        spell_id: row.get(1)?,
        spell_name: row.get(2)?,
        spell_level: row.get(3)?,
        spell_school: row.get(4)?,
        spell_sphere: row.get(5)?,
        is_quest_spell: row.get(6)?,
        is_cantrip: row.get(7)?,
        prepared: row.get(8)?,
        known: row.get(9)?,
        notes: row.get(10)?,
        tags: row.get(11)?,
        spell_content_hash: None,
        missing_from_library: false,
        available_upgrade_hash: None,
        available_upgrade_spell_id: None,
    })
}
```

- [x] **Step 3: Update the hash-path SQL query to include upgrade detection columns**

In `get_character_class_spells_with_conn`, find the two SQL string literals (the one with `list_type` filter and the one without). Both must be updated. Replace the column list in both queries.

The two new columns to add (after `missing_from_library`):

```sql
CASE WHEN s.id IS NOT NULL AND ccs.spell_content_hash IS NOT NULL THEN
    (SELECT s2.content_hash FROM spell s2
     WHERE s2.name = s.name
       AND s2.content_hash != ccs.spell_content_hash
       AND s2.content_hash IS NOT NULL
     ORDER BY s2.id DESC LIMIT 1)
ELSE NULL END AS available_upgrade_hash,
CASE WHEN s.id IS NOT NULL AND ccs.spell_content_hash IS NOT NULL THEN
    (SELECT s2.id FROM spell s2
     WHERE s2.name = s.name
       AND s2.content_hash != ccs.spell_content_hash
       AND s2.content_hash IS NOT NULL
     ORDER BY s2.id DESC LIMIT 1)
ELSE NULL END AS available_upgrade_spell_id
```

Full updated query for the **with-list-type** branch:

```rust
"SELECT cc.character_id, COALESCE(s.id, 0) AS spell_id, COALESCE(s.name, 'Spell no longer in library') AS spell_name, COALESCE(s.level, 0) AS spell_level, s.school, s.sphere, COALESCE(s.is_quest_spell, 0), COALESCE(s.is_cantrip, 0),
        CASE WHEN ccs.list_type = 'PREPARED' THEN 1 ELSE 0 END,
        CASE WHEN ccs.list_type = 'KNOWN' THEN 1 ELSE 0 END,
        ccs.notes,
        s.tags,
        ccs.spell_content_hash,
        CASE WHEN s.id IS NULL AND ccs.spell_content_hash IS NOT NULL THEN 1 ELSE 0 END AS missing_from_library,
        CASE WHEN s.id IS NOT NULL AND ccs.spell_content_hash IS NOT NULL THEN
            (SELECT s2.content_hash FROM spell s2
             WHERE s2.name = s.name
               AND s2.content_hash != ccs.spell_content_hash
               AND s2.content_hash IS NOT NULL
             ORDER BY s2.id DESC LIMIT 1)
        ELSE NULL END AS available_upgrade_hash,
        CASE WHEN s.id IS NOT NULL AND ccs.spell_content_hash IS NOT NULL THEN
            (SELECT s2.id FROM spell s2
             WHERE s2.name = s.name
               AND s2.content_hash != ccs.spell_content_hash
               AND s2.content_hash IS NOT NULL
             ORDER BY s2.id DESC LIMIT 1)
        ELSE NULL END AS available_upgrade_spell_id
 FROM character_class_spell ccs
 LEFT JOIN spell s ON
    (ccs.spell_content_hash IS NOT NULL AND s.content_hash = ccs.spell_content_hash)
    OR (ccs.spell_content_hash IS NULL AND s.id = ccs.spell_id)
 JOIN character_class cc ON cc.id = ccs.character_class_id
 WHERE ccs.character_class_id = ? AND ccs.list_type = ?
 ORDER BY COALESCE(s.level, 0), COALESCE(s.name, '')"
    .to_string(),
```

Full updated query for the **without-list-type** branch (same columns, different WHERE):

```rust
"SELECT cc.character_id, COALESCE(s.id, 0) AS spell_id, COALESCE(s.name, 'Spell no longer in library') AS spell_name, COALESCE(s.level, 0) AS spell_level, s.school, s.sphere, COALESCE(s.is_quest_spell, 0), COALESCE(s.is_cantrip, 0),
        CASE WHEN ccs.list_type = 'PREPARED' THEN 1 ELSE 0 END,
        CASE WHEN ccs.list_type = 'KNOWN' THEN 1 ELSE 0 END,
        ccs.notes,
        s.tags,
        ccs.spell_content_hash,
        CASE WHEN s.id IS NULL AND ccs.spell_content_hash IS NOT NULL THEN 1 ELSE 0 END AS missing_from_library,
        CASE WHEN s.id IS NOT NULL AND ccs.spell_content_hash IS NOT NULL THEN
            (SELECT s2.content_hash FROM spell s2
             WHERE s2.name = s.name
               AND s2.content_hash != ccs.spell_content_hash
               AND s2.content_hash IS NOT NULL
             ORDER BY s2.id DESC LIMIT 1)
        ELSE NULL END AS available_upgrade_hash,
        CASE WHEN s.id IS NOT NULL AND ccs.spell_content_hash IS NOT NULL THEN
            (SELECT s2.id FROM spell s2
             WHERE s2.name = s.name
               AND s2.content_hash != ccs.spell_content_hash
               AND s2.content_hash IS NOT NULL
             ORDER BY s2.id DESC LIMIT 1)
        ELSE NULL END AS available_upgrade_spell_id
 FROM character_class_spell ccs
 LEFT JOIN spell s ON
    (ccs.spell_content_hash IS NOT NULL AND s.content_hash = ccs.spell_content_hash)
    OR (ccs.spell_content_hash IS NULL AND s.id = ccs.spell_id)
 JOIN character_class cc ON cc.id = ccs.character_class_id
 WHERE ccs.character_class_id = ?
 ORDER BY COALESCE(s.level, 0), COALESCE(s.name, '')"
    .to_string(),
```

Update the `query_map` call to use `map_row_16`:

```rust
let rows = stmt.query_map(rusqlite::params_from_iter(params.iter()), map_row_16)?;
```

- [x] **Step 4: Run tests to verify detection works**

Run: `cargo test characters:: --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: All existing tests PASS. The 3 new upgrade tests PASS.

If any existing test fails, it's because `setup_character_spell_test_db` doesn't create the `character_class` or `"character"` tables — adjust the new tests to match the existing test schema helper exactly (or add the character/class rows within the new tests as shown above).

- [x] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/models/character.rs apps/desktop/src-tauri/src/commands/characters.rs
git commit -m "feat: extend CharacterSpellbookEntry with upgrade detection fields"
```

---

### Task 3: Add `upgrade_character_class_spell` Command and E2E Seed Helper

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/characters.rs` (append commands)
- Modify: `apps/desktop/src-tauri/src/lib.rs` (register 2 new commands)

- [x] **Step 1: Write failing test for upgrade command**

In the `#[cfg(test)]` block, add:

```rust
#[test]
fn test_upgrade_character_class_spell_updates_hash_and_spell_id() {
    let conn = setup_character_spell_test_db(true);
    conn.execute(
        "INSERT INTO spell (id, content_hash) VALUES (1, 'hash-old'), (2, 'hash-new')",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes, spell_content_hash) \
         VALUES (10, 1, 'KNOWN', NULL, 'hash-old')",
        [],
    ).unwrap();
    conn.execute(
        "INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes, spell_content_hash) \
         VALUES (10, 1, 'PREPARED', NULL, 'hash-old')",
        [],
    ).unwrap();

    upgrade_character_class_spell_with_conn(&conn, 10, "hash-old", 2, "hash-new")
        .expect("upgrade should succeed");

    let hashes: Vec<String> = conn
        .prepare("SELECT spell_content_hash FROM character_class_spell WHERE character_class_id = 10 ORDER BY list_type")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert_eq!(hashes, vec!["hash-new", "hash-new"],
        "both KNOWN and PREPARED rows should be upgraded to new hash");

    let spell_ids: Vec<i64> = conn
        .prepare("SELECT spell_id FROM character_class_spell WHERE character_class_id = 10 ORDER BY list_type")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert_eq!(spell_ids, vec![2, 2], "both rows should point to new spell_id");
}

#[test]
fn test_upgrade_character_class_spell_errors_on_missing_hash() {
    let conn = setup_character_spell_test_db(true);
    conn.execute(
        "INSERT INTO spell (id, content_hash) VALUES (1, 'hash-old')",
        [],
    ).unwrap();
    // No character_class_spell row with 'hash-old'

    let result = upgrade_character_class_spell_with_conn(&conn, 10, "hash-old", 1, "hash-new");
    assert!(result.is_err(), "should fail when no rows match old_hash");
}
```

Run: `cargo test test_upgrade_character_class_spell --manifest-path apps/desktop/src-tauri/Cargo.toml 2>&1 | grep -E "FAILED|error\["`

Expected: FAIL — `upgrade_character_class_spell_with_conn` does not exist yet.

- [x] **Step 2: Implement `upgrade_character_class_spell_with_conn` sync helper**

Add after `remove_character_spell_by_hash_with_conn` (around line 169):

```rust
/// Sync helper: update all character_class_spell rows for a class from old_hash to new_hash.
/// Updates both KNOWN and PREPARED list types in one statement.
fn upgrade_character_class_spell_with_conn(
    conn: &Connection,
    character_class_id: i64,
    old_hash: &str,
    new_spell_id: i64,
    new_hash: &str,
) -> Result<(), AppError> {
    let updated = conn.execute(
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
    Ok(())
}
```

- [x] **Step 3: Add the Tauri command**

Add after the `remove_character_spell_by_hash` command (around line 728):

```rust
#[tauri::command]
pub async fn upgrade_character_class_spell(
    state: State<'_, Arc<Pool>>,
    character_class_id: i64,
    old_hash: String,
    new_spell_id: i64,
    new_hash: String,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        upgrade_character_class_spell_with_conn(
            &conn,
            character_class_id,
            &old_hash,
            new_spell_id,
            &new_hash,
        )
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;
    Ok(())
}
```

- [x] **Step 4: Add the E2E seed helper command**

Add after `test_seed_character_with_orphan_spell` (around line 885):

```rust
/// Test-only: seeds a character with one Mage class and one known spell (spell_content_hash set,
/// matching spell row with spell_name and spell_hash_a) for E2E upgrade scenario tests.
/// Only use in E2E tests.
#[tauri::command]
pub async fn test_seed_character_with_upgradeable_spell(
    state: State<'_, Arc<Pool>>,
    character_name: String,
    spell_name: String,
    spell_hash_a: String,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        if !table_has_column(&conn, "character_class_spell", "spell_content_hash") {
            return Err(AppError::Unknown(
                "test_seed_character_with_upgradeable_spell requires spell_content_hash column (Migration 0015)"
                    .to_string(),
            ));
        }
        // Insert spell A into library
        conn.execute(
            "INSERT INTO spell (name, level, description, content_hash, is_quest_spell, is_cantrip) \
             VALUES (?, 1, 'Test spell for upgrade scenario', ?, 0, 0)",
            params![spell_name, spell_hash_a],
        )?;
        let spell_id_a = conn.last_insert_rowid();
        // Insert character
        conn.execute(
            "INSERT INTO \"character\" (name, type, notes) VALUES (?, 'PC', NULL)",
            params![character_name],
        )?;
        let character_id = conn.last_insert_rowid();
        // Insert class
        conn.execute(
            "INSERT INTO character_class (character_id, class_name, class_label, level) VALUES (?, 'Mage', NULL, 1)",
            params![character_id],
        )?;
        let class_id = conn.last_insert_rowid();
        // Insert character_class_spell with hash A
        conn.execute(
            "INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes, spell_content_hash) \
             VALUES (?, ?, 'KNOWN', NULL, ?)",
            params![class_id, spell_id_a, spell_hash_a],
        )?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;
    Ok(())
}
```

- [x] **Step 5: Register both commands in `lib.rs`**

Read `apps/desktop/src-tauri/src/lib.rs` to find the `invoke_handler` block. Add `upgrade_character_class_spell` and `test_seed_character_with_upgradeable_spell` next to the other character commands:

```rust
upgrade_character_class_spell,
test_seed_character_with_upgradeable_spell,
```

Location context (near existing character commands):
```rust
// existing:
remove_character_spell_by_hash,
// add after:
upgrade_character_class_spell,
test_seed_character_with_upgradeable_spell,
```

- [x] **Step 6: Run all character tests**

Run: `cargo test characters:: --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: ALL tests PASS, including the 5 new tests added in Tasks 2 and 3.

- [x] **Step 7: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/characters.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "feat: add upgrade_character_class_spell command and upgrade detection query"
```

---

## Chunk 2: Frontend — TypeScript Type and Upgrade Button

### Task 4: Add TypeScript Fields and Upgrade Button UI

**Files:**
- Modify: `apps/desktop/src/types/character.ts:43-58`
- Modify: `apps/desktop/src/ui/CharacterEditor.tsx` (spell row section, around line 910–960)

- [x] **Step 1: Read current TypeScript type**

Read `apps/desktop/src/types/character.ts` lines 43–58 to confirm current `CharacterSpellbookEntry` interface before editing.

- [x] **Step 2: Add new fields to `CharacterSpellbookEntry` TypeScript interface**

Add after `missingFromLibrary?: boolean;`:

```typescript
  availableUpgradeHash?: string | null;
  availableUpgradeSpellId?: number | null;
```

Full updated interface:

```typescript
export interface CharacterSpellbookEntry {
  characterId: number;
  spellId: number;
  spellName: string;
  spellLevel: number;
  spellSchool?: string | null;
  spellSphere?: string | null;
  isQuestSpell: number;
  isCantrip: number;
  prepared: number;
  known: number;
  notes?: string | null;
  tags?: string | null;
  spellContentHash?: string | null;
  missingFromLibrary?: boolean;
  availableUpgradeHash?: string | null;
  availableUpgradeSpellId?: number | null;
}
```

- [x] **Step 3: Read the spell row rendering in CharacterEditor.tsx**

Read `apps/desktop/src/ui/CharacterEditor.tsx` lines 905–965 to locate the exact position of the button group (the `<div className="flex items-center gap-2">` that holds the notes input and Remove button).

- [x] **Step 4: Add "Upgrade" button to the spell row**

Inside the button group `<div className="flex items-center gap-2">`, add the Upgrade button **before** the Remove button, but only when `!missing && spell.availableUpgradeHash && spell.availableUpgradeSpellId`:

```tsx
{!missing && spell.availableUpgradeHash && spell.availableUpgradeSpellId && (
  <button
    type="button"
    data-testid={`btn-upgrade-spell-${spell.spellId}`}
    onClick={async () => {
      try {
        await invoke("upgrade_character_class_spell", {
          characterClassId: charClass.id,
          oldHash: spell.spellContentHash,
          newSpellId: spell.availableUpgradeSpellId,
          newHash: spell.availableUpgradeHash,
        });
        loadSpells();
      } catch (e) {
        modalAlert(`Failed to upgrade spell: ${e}`, "Error", "error");
      }
    }}
    className="text-yellow-500 hover:text-yellow-300 transition-colors text-[10px] font-mono uppercase"
    aria-label="Upgrade to newer version"
    title="Upgrade to newer version of this spell"
  >
    ↑ Upgrade
  </button>
)}
```

Place this immediately before the existing Remove button (`<button ... onClick={handleRemove}`).

- [x] **Step 5: Verify TypeScript compilation**

Run: `cd apps/desktop && pnpm tsc --noEmit`

Expected: No errors. If any errors appear about `availableUpgradeHash` or `availableUpgradeSpellId`, fix the type mismatch.

- [x] **Step 6: Run frontend lint**

Run: `cd apps/desktop && pnpm lint` (or equivalent biome check)

Expected: No new lint errors.

- [x] **Step 7: Commit**

```bash
git add apps/desktop/src/types/character.ts apps/desktop/src/ui/CharacterEditor.tsx
git commit -m "feat: add Upgrade button to character spellbook entry row"
```

---

## Chunk 3: E2E Test, Verification, and Three-Pass Review

### Task 5: E2E Test for Upgrade Flow

**Files:**
- Modify: `apps/desktop/tests/character_edge_cases.spec.ts`

> **Prerequisite:** Backend and frontend are committed. Rebuild binary before running E2E tests.
> Run: `cd apps/desktop && pnpm tauri:build --debug`

- [x] **Step 1: Read the existing edge-case tests**

Read `apps/desktop/tests/character_edge_cases.spec.ts` lines 1–30 to understand imports and test structure.

- [x] **Step 2: Add upgrade E2E test to `character_edge_cases.spec.ts`**

Add a new `test.describe("upgrade-flow")` block after the existing `"missing-library"` describe block:

```typescript
test.describe("upgrade-flow", () => {
  test("upgrade: Upgrade button appears and upgrades spell hash to newer version", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `UpgradeChar_${runId}`;
    const spellName = `Upgradeable Spell ${runId}`;
    const hashA = `hash-upgrade-a-${runId}`;
    const hashB = `hash-upgrade-b-${runId}`;

    await test.step("Setup: seed character with spell Hash A and library spell Hash B (same name)", async () => {
      await app.navigate("Characters");
      await page.waitForTimeout(500);

      // Seed character + class + character_class_spell pointing to hash A
      await page.evaluate(
        async ({ name, spell, hash }: { name: string; spell: string; hash: string }) => {
          const inv = (
            window as Window & {
              __TAURI_INTERNALS__?: { invoke: (c: string, a?: object) => Promise<unknown> };
            }
          ).__TAURI_INTERNALS__?.invoke;
          if (!inv) throw new Error("Tauri invoke not available");
          await inv("test_seed_character_with_upgradeable_spell", {
            characterName: name,
            spellName: spell,
            spellHashA: hash,
          });
        },
        { name: charName, spell: spellName, hash: hashA },
      );

      // Seed a second spell with same name but different hash (Hash B = upgrade target)
      await page.evaluate(
        async ({ name, hash }: { name: string; hash: string }) => {
          const inv = (
            window as Window & {
              __TAURI_INTERNALS__?: { invoke: (c: string, a?: object) => Promise<unknown> };
            }
          ).__TAURI_INTERNALS__?.invoke;
          if (!inv) throw new Error("Tauri invoke not available");
          await inv("test_seed_spell", { name, hash });
        },
        { name: spellName, hash: hashB },
      );

      await page.reload();
      await expect(page.getByRole("link", { name: charName })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await page.waitForTimeout(2000);

      // Dismiss any startup modal
      if (
        await page
          .getByTestId("modal-dialog")
          .isVisible({ timeout: 2000 })
          .catch(() => false)
      ) {
        await page.getByTestId("modal-button-dismiss").click();
        await page.waitForTimeout(300);
      }
    });

    await test.step("Open CharacterEditor and verify Upgrade button appears on the spell row", async () => {
      await app.openCharacterEditor(charName);
      if (
        await page
          .getByTestId("modal-dialog")
          .isVisible({ timeout: 2000 })
          .catch(() => false)
      ) {
        await page.getByTestId("modal-button-dismiss").click();
        await page.waitForTimeout(300);
      }
      const mageSection = page.locator('[aria-label="Class section for Mage"]');
      await mageSection.getByRole("button", { name: "KNOWN" }).click();
      await page.waitForTimeout(500);

      // Spell should resolve (not missing)
      await expect(page.getByText("Spell no longer in library")).not.toBeVisible();

      // Upgrade button should be visible
      const upgradeBtn = page.locator("[data-testid^='btn-upgrade-spell-']");
      await expect(upgradeBtn).toBeVisible({ timeout: TIMEOUTS.medium });
    });

    await test.step("Click Upgrade and verify spell still resolves without errors", async () => {
      const upgradeBtn = page.locator("[data-testid^='btn-upgrade-spell-']");
      await upgradeBtn.click();
      await page.waitForTimeout(800);

      // No error modal should appear
      const modalVisible = await page
        .getByTestId("modal-dialog")
        .isVisible({ timeout: 1000 })
        .catch(() => false);
      expect(modalVisible).toBe(false);

      // Spell row should still be visible (now pointing to Hash B)
      await expect(page.getByText("Spell no longer in library")).not.toBeVisible();
      // Spell name should still show
      await expect(page.getByText(spellName)).toBeVisible({ timeout: TIMEOUTS.medium });
    });

    await app.navigate("Characters");
    await app.deleteCharacterFromList(charName);
  });
});
```

- [x] **Step 3: Rebuild the application binary**

Run: `cd apps/desktop && pnpm tauri:build --debug`

Expected: Build succeeds. Both Rust backend and frontend bundle are compiled.

- [x] **Step 4: Run the new upgrade E2E test in isolation**

Run: `cd apps/desktop && npx playwright test character_edge_cases.spec.ts --grep "upgrade-flow"`

Expected: PASS. If it fails, check for:
- Binary not rebuilt (must rebuild after backend/frontend changes)
- `test_seed_character_with_upgradeable_spell` command not registered in `lib.rs`
- Missing `data-testid` on the Upgrade button
- Settlement timing issues (increase `page.waitForTimeout` after setup if needed)

- [x] **Step 5: Run the full edge-cases suite to check for regressions**

Run: `cd apps/desktop && npx playwright test character_edge_cases.spec.ts`

Expected: ALL tests PASS (existing missing-library tests + new upgrade test).

- [x] **Step 6: Commit**

```bash
git add apps/desktop/tests/character_edge_cases.spec.ts
git commit -m "test: E2E upgrade flow for character spellbook hash upgrade"
```

---

### Task 6: Full Verification

**Files:** Review only — no edits.

- [x] **Step 1: Run the full Rust test suite**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: PASS — no regressions in any module.

- [x] **Step 2: Run targeted character command tests**

Run: `cargo test characters:: --manifest-path apps/desktop/src-tauri/Cargo.toml`

Expected: PASS — all 5 new tests + all existing character tests pass.

- [x] **Step 3: Run TypeScript type check**

Run: `cd apps/desktop && pnpm tsc --noEmit`

Expected: No errors.

- [x] **Step 4: Run frontend lint**

Run: `cd apps/desktop && pnpm lint`

Expected: No new errors.

- [x] **Step 5: Run full E2E character edge-cases suite**

Run: `cd apps/desktop && npx playwright test character_edge_cases.spec.ts`

Expected: PASS.

---

### Task 7: Pass 1 — Spec Compliance Review

**Subagent Unit:** Spec-compliance reviewer

Read these files before reviewing:
- `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md` (Task 7 section)
- `openspec/changes/integrate-spell-hashing-ecosystem/specs/characters/spec.md`
- `openspec/changes/integrate-spell-hashing-ecosystem/design.md` (Decision #5)
- `apps/desktop/src-tauri/src/commands/characters.rs` (upgrade detection query + command)
- `apps/desktop/src-tauri/src/models/character.rs`
- `apps/desktop/src/types/character.ts`
- `apps/desktop/src/ui/CharacterEditor.tsx` (spell row section)

Checklist:
- [x] Character spellbook reads use `spell_content_hash` (hash-first), with `spell_id` fallback ✓ (pre-existing)
- [x] "Spell no longer in library" placeholder shown when `missingFromLibrary` is true ✓ (pre-existing)
- [x] "Remove" action clears orphan reference ✓ (pre-existing)
- [x] `available_upgrade_hash` and `available_upgrade_spell_id` populated when same-name different-hash spell exists
- [x] "Upgrade" button only shown when upgrade is available and spell is NOT missing from library
- [x] On upgrade, `spell_content_hash` updated to new hash for ALL list types (KNOWN and PREPARED) in the same class
- [x] `spell_id` updated alongside `spell_content_hash` (dual-column write rule)
- [x] No upgrade offered for missing-from-library spells
- [x] `data-testid` on Upgrade button follows `btn-upgrade-spell-{spellId}` convention

Save findings to: `openspec/changes/integrate-spell-hashing-ecosystem/review-task-7_2026_03_13_three-pass.md`

---

### Task 8: Pass 2 — Backend Correctness Review

**Subagent Unit:** Backend correctness reviewer

Read these files:
- `apps/desktop/src-tauri/src/commands/characters.rs` (full upgrade section: helper + command + seed helper)
- `apps/desktop/src-tauri/src/models/character.rs` (CharacterSpellbookEntry struct)

Checklist:
- [x] `upgrade_character_class_spell_with_conn` uses parameterized SQL (no string injection)
- [x] Returns error when 0 rows match `old_hash` — no silent no-op
- [x] Updates both KNOWN and PREPARED in a single UPDATE (no partial update risk)
- [x] `test_seed_character_with_upgradeable_spell` guard for missing column is present
- [x] The upgrade detection subquery uses `ORDER BY s2.id DESC LIMIT 1` — deterministic (picks newest spell id)
- [x] No upgrade returned for `spell_content_hash IS NULL` rows (legacy path)
- [x] `map_row_16` reads column 14 as `Option<String>` and column 15 as `Option<i64>` — matches SQL column types
- [x] `map_row_12` (legacy path) sets both new fields to `None` — no panic
- [x] New commands registered in `lib.rs`

Save findings to: `openspec/changes/integrate-spell-hashing-ecosystem/review-task-7_2026_03_13_three-pass.md` (append to existing file)

---

### Task 9: Pass 3 — Test and Maintainability Review

**Subagent Unit:** Test and maintainability reviewer

Read these files:
- `apps/desktop/src-tauri/src/commands/characters.rs` (new tests)
- `apps/desktop/tests/character_edge_cases.spec.ts` (new upgrade test)

Checklist:
- [x] Rust unit tests prove spec contract (upgrade detected, no upgrade for single version, no upgrade for missing spell)
- [x] `test_upgrade_character_class_spell_updates_hash_and_spell_id` asserts BOTH KNOWN and PREPARED are updated
- [x] `test_upgrade_character_class_spell_errors_on_missing_hash` proves error case
- [x] E2E upgrade test seeds deterministic data (unique runId in spell name and hashes)
- [x] E2E test verifies: Upgrade button visible before action, no error modal after action, spell still resolves after upgrade
- [x] E2E test cleans up character after completion
- [x] No `page.waitForTimeout` values longer than 2000ms in non-startup context
- [x] Upgrade button `data-testid` pattern is consistent with existing remove button pattern

Save findings to: `openspec/changes/integrate-spell-hashing-ecosystem/review-task-7_2026_03_13_three-pass.md` (append to existing file)

---

### Task 10: Mark Task 7 Complete

**Files:**
- Modify: `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md`

- [x] **Step 1: Only if all three review passes give Approved status**

Update `tasks.md` Task 7 section:

```markdown
## 7. Character Integration

> **Note:** Character Integration and Spell List Integration (above) both operate on the `character_class_spell` table.

- [x] 7.1 Update Character Spellbook:
    - [x] Reference spells by `content_hash` (pinned version).
    - [x] If that hash is missing from the library:
        - [x] Show "Spell no longer in library" placeholder.
        - [x] Provide "Remove" action to clear the broken reference.
    - [x] Implement explicit spell upgrade:
        - [x] When character references Hash A and Hash B exists for the same spell name, offer "Upgrade" action.
        - [x] On upgrade, update `spell_content_hash` from Hash A to Hash B.
```

- [x] **Step 2: Commit**

```bash
git add openspec/changes/integrate-spell-hashing-ecosystem/tasks.md openspec/changes/integrate-spell-hashing-ecosystem/review-task-7_2026_03_13_three-pass.md
git commit -m "docs: close Task 7 character integration with upgrade flow"
```

---

## Controller Notes

- Tasks 1–3 must run sequentially (model → query → command). Do not parallelize backend subagents.
- Frontend (Task 4) must come after backend commits are in place.
- E2E test (Task 5) requires a full binary rebuild (`pnpm tauri:build --debug`) before running.
- Three review passes (Tasks 7–9) may be dispatched sequentially with the review file appended by each reviewer.
- Do not add any new dependencies.
- Do not change migration SQL, vault, import, or spells.rs — this plan touches only character management.
- The `available_upgrade_spell_id` field is essential for the frontend invoke call (the backend command takes `new_spell_id: i64`); do not omit it from the query or the model.
- The `setup_character_spell_test_db` helper creates a minimal `spell` table with only `id` and `content_hash`. All three upgrade-detection tests extend it with `ALTER TABLE spell ADD COLUMN ...` before inserting spell rows (as shown in the test code). Do not modify the shared helper — keep the `ALTER TABLE` inline within each new test.
- The `character_class` and `"character"` tables are also absent from `setup_character_spell_test_db`; the new tests create them inline via `execute_batch` (as shown in the test code). This matches the pattern advised by the Controller Notes.
