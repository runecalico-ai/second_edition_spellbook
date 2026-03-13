# Integrate Spell Hashing Task 5 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Status:** All tasks completed. Character unit tests: 10/10 pass. E2E test added; run with `npx playwright test tests/character_edge_cases.spec.ts -g "restored-row"`.

**Goal:** Fix regressions in spell list migration, member mutations for hash-backed rows, and NULL hash handling.

**Architecture:**
- **Read Path:** Update the join logic in `get_character_class_spells_with_conn` to fallback to `spell_id` when `spell_content_hash` is NULL.
- **Mutation Path:** Update `remove_character_spell` and `update_character_spell_notes` to be hash-authoritative. They will resolve the `content_hash` of the provided `spell_id` and mutate the `character_class_spell` row by hash if the column exists.
- **Verification:** Multi-tiered testing with backend unit tests for transition cases and an E2E regression test for the restored-row UI path.

**Tech Stack:** Rust (Tauri/Rusqlite), TypeScript (React/Playwright)

---

### Task 1: Fix Read Path Fallback for NULL Hash References ✅

- [x] **Step 1:** Update the SQL join in `get_character_class_spells_with_conn`

```rust
// Replace both occurrences (with and without list_type filter)
// From:
// LEFT JOIN spell s ON s.content_hash = ccs.spell_content_hash
// To:
LEFT JOIN spell s ON
    (ccs.spell_content_hash IS NOT NULL AND s.content_hash = ccs.spell_content_hash)
    OR (ccs.spell_content_hash IS NULL AND s.id = ccs.spell_id)
```

- [x] **Step 2:** Add a unit test for NULL-hash fallback resolution (in `tests` module in `apps/desktop/src-tauri/src/commands/characters.rs`):

```rust
    #[test]
    fn test_get_character_class_spells_fallback_to_id_when_hash_null() {
        let conn = Connection::open_in_memory().expect("open db");
        conn.execute_batch(
            r#"
            CREATE TABLE spell (id INTEGER PRIMARY KEY, content_hash TEXT, name TEXT, level INTEGER);
            CREATE TABLE "character" (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE character_class (id INTEGER PRIMARY KEY, character_id INTEGER);
            CREATE TABLE character_class_spell (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                character_class_id INTEGER NOT NULL,
                spell_id INTEGER NOT NULL,
                list_type TEXT NOT NULL,
                spell_content_hash TEXT
            );
            INSERT INTO "character" (id, name) VALUES (1, 'Test');
            INSERT INTO character_class (id, character_id) VALUES (1, 1);
            -- Spell is present but character_class_spell row has NULL hash (legacy or incomplete backfill)
            INSERT INTO spell (id, content_hash, name, level) VALUES (100, 'some-hash', 'Legacy Spell', 1);
            INSERT INTO character_class_spell (character_class_id, spell_id, list_type, spell_content_hash)
            VALUES (1, 100, 'KNOWN', NULL);
            "#,
        ).expect("seed");

        let entries = get_character_class_spells_with_conn(&conn, 1, Some("KNOWN")).expect("read");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].spell_name, "Legacy Spell");
        assert!(!entries[0].missing_from_library);
    }
```

- [x] **Step 3:** Run tests — `cargo test -p spellbook-desktop --lib commands::characters::tests` (PASS)

**Files:** `apps/desktop/src-tauri/src/commands/characters.rs`

---

### Task 2: Standardize Mutation Commands (Hash-Authoritative) ✅

- [x] **Step 1:** Update `remove_character_spell` to mutate by hash if possible

Modify `remove_character_spell` (around line 659) to use a hash-authoritative path with a legacy fallback:
```rust
#[tauri::command]
pub async fn remove_character_spell(
    state: State<'_, Arc<Pool>>,
    character_class_id: i64,
    spell_id: i64,
    list_type: String,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let use_hash = table_has_column(&conn, "character_class_spell", "spell_content_hash");

        let mut deleted = 0;
        if use_hash {
            // AUTHORITATIVE HASH PATH: handles restored rows with stale IDs
            let spell_content_hash: Option<String> = conn
                .query_row("SELECT content_hash FROM spell WHERE id = ?", [spell_id], |row| row.get(0))
                .optional()?
                .flatten();

            if let Some(hash) = spell_content_hash {
                deleted = conn.execute(
                    "DELETE FROM character_class_spell WHERE character_class_id = ? AND spell_content_hash = ? AND list_type = ?",
                    params![character_class_id, hash, list_type],
                )?;
                if deleted > 0 && list_type == "KNOWN" {
                    conn.execute(
                        "DELETE FROM character_class_spell WHERE character_class_id = ? AND spell_content_hash = ? AND list_type = 'PREPARED'",
                        params![character_class_id, hash],
                    )?;
                }
            }
        }

        // LEGACY OR UNRESOLVABLE PATH: fallback for rows with NULL hash or very old legacy DBs
        if deleted == 0 {
            conn.execute(
                "DELETE FROM character_class_spell WHERE character_class_id = ? AND spell_id = ? AND list_type = ?",
                params![character_class_id, spell_id, list_type],
            )?;

            if list_type == "KNOWN" {
                 conn.execute(
                    "DELETE FROM character_class_spell WHERE character_class_id = ? AND spell_id = ? AND list_type = 'PREPARED'",
                    params![character_class_id, spell_id],
                )?;
            }
        }

        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(())
}
```

- [x] **Step 2:** Update `update_character_spell_notes` to mutate by hash if possible
```rust
#[tauri::command]
pub async fn update_character_spell_notes(
    state: State<'_, Arc<Pool>>,
    character_class_id: i64,
    spell_id: i64,
    list_type: String,
    notes: Option<String>,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        let use_hash = table_has_column(&conn, "character_class_spell", "spell_content_hash");

        let mut updated = 0;
        if use_hash {
            let spell_content_hash: Option<String> = conn
                .query_row("SELECT content_hash FROM spell WHERE id = ?", [spell_id], |row| row.get(0))
                .optional()?
                .flatten();

            if let Some(hash) = spell_content_hash {
                updated = conn.execute(
                    "UPDATE character_class_spell SET notes=? WHERE character_class_id = ? AND spell_content_hash = ? AND list_type = ?",
                    params![notes, character_class_id, hash, list_type],
                )?;
            }
        }

        if updated == 0 {
            conn.execute(
                "UPDATE character_class_spell SET notes=? WHERE character_class_id = ? AND spell_id = ? AND list_type = ?",
                params![notes, character_class_id, spell_id, list_type],
            )?;
        }
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;

    Ok(())
}
```

- [x] **Step 3:** Run tests — `cargo test -p spellbook-desktop --lib commands::characters::tests` (PASS). Suggested commit: `feat(characters): make spell mutations hash-authoritative`

**Files:** `apps/desktop/src-tauri/src/commands/characters.rs`

---

### Task 3: UI/E2E Regression Test for Restored Row Removal ✅

- [x] **Step 1:** Implement `test_seed_spell` helper in `characters.rs` (and register in `lib.rs`)

Add this test-only command to `apps/desktop/src-tauri/src/commands/characters.rs`:

```rust
#[tauri::command]
pub async fn test_seed_spell(
    state: State<'_, Arc<Pool>>,
    name: String,
    hash: String,
) -> Result<i64, AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO spell (name, level, description, content_hash) VALUES (?, 1, 'Test', ?)",
            params![name, hash],
        )?;
        Ok::<i64, AppError>(conn.last_insert_rowid())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??
}
```

- [x] **Step 2:** Add the restored-row regression test to `character_edge_cases.spec.ts`

```typescript
  test("restored-row: removing a recovered hash-backed row works from normal UI path", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `RestoredRowChar_${runId}`;

    await test.step("Setup: seed orphan row and then restore it with a live spell", async () => {
      await app.navigate("Characters");
      await page.waitForTimeout(500);
      await page.evaluate(
        async (name: string) => {
          const inv = (window as any).__TAURI_INTERNALS__?.invoke;
          // 1. Create orphan (uses 'e2e-orphan-hash')
          await inv("test_seed_character_with_orphan_spell", { characterName: name });
        },
        charName,
      );

      // 2. Restore the spell into library
      await page.evaluate(async () => {
          const inv = (window as any).__TAURI_INTERNALS__?.invoke;
          await inv("test_seed_spell", {
              name: "Restored E2E Spell",
              hash: "e2e-orphan-hash"
          });
      });

      await page.reload();
      await expect(page.getByRole("link", { name: charName })).toBeVisible({ timeout: 5000 });
    });

    await test.step("Verify row renders as normal and can be removed", async () => {
      await app.openCharacterEditor(charName);
      const row = page.getByTestId("spell-row-Restored E2E Spell");
      await expect(row).toBeVisible();

      // Verify it's NOT rendered as missing
      await expect(page.getByText("Spell no longer in library")).not.toBeVisible();

      // Click standard remove button (uses spellId)
      const removeBtn = row.locator("[data-testid^='btn-remove-spell-']");
      await removeBtn.click();

      await expect(row).not.toBeVisible();
    });

    await app.navigate("Characters");
    await app.deleteCharacterFromList(charName);
  });
```

- [x] **Step 3:** E2E test added. Run: `npx playwright test tests/character_edge_cases.spec.ts -g "restored-row"` (from `apps/desktop`)

**Files:** `apps/desktop/src-tauri/src/commands/characters.rs`, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/tests/character_edge_cases.spec.ts`
