# Fix Character Edge Cases Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Remove test-only Tauri commands from production builds, fix spell upgrade matching logic and validation, and stabilize E2E edge cases.

**Architecture:** 
- Restrict test Tauri commands to `cfg(debug_assertions)`
- Enforce strict validation on `upgrade_character_class_spell`
- Limit available upgrades to strictly newer spells (higher ID)
- Replace fixed timeouts in E2E tests with deterministic await/expect logic

**Tech Stack:** Rust (Tauri), TypeScript (Playwright)

---

## Chunk 1: Remove Test-Only Tauri Commands from Production

### Task 1: Conditionally Compile Test Commands

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/characters.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

- [x] **Step 1: Wrap test commands in characters.rs**
  Locate `test_seed_spell`, `test_seed_character_with_orphan_spell`, and `test_seed_character_with_upgradeable_spell` around lines 906-1014. Add `#[cfg(debug_assertions)]` above each `#[tauri::command]`.

- [x] **Step 2: Wrap command invocations in lib.rs**
  Locate `generate_handler!` in `lib.rs` around lines 74-77. Add `#[cfg(debug_assertions)]` above each test command reference so they are excluded from release builds.

```rust
            #[cfg(debug_assertions)]
            test_seed_character_with_upgradeable_spell,
            update_character_spell_notes,
            #[cfg(debug_assertions)]
            test_seed_spell,
            #[cfg(debug_assertions)]
            test_seed_character_with_orphan_spell,
```

- [x] **Step 3: Verify the build**
  Run `cargo check` and `cargo check --release` in `apps/desktop/src-tauri` to ensure development compiles with the commands and release compiles without them.

- [x] **Step 4: Commit**
```bash
git add apps/desktop/src-tauri/src/commands/characters.rs apps/desktop/src-tauri/src/lib.rs
git commit -m "fix(backend): hide test-only characters.rs commands from release builds"
```

---

## Chunk 2: Backend Upgrade Logic and Validation

### Task 2: Fix upgrade validation and newer-spell logic

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/characters.rs`

- [x] **Step 1: Write a failing unit test or proceed to fix upgrade validation**
  Locate `upgrade_character_class_spell_with_conn` around line 205. Modify it to validate that the provided `new_spell_id` has a `content_hash` matching `new_hash`.

```rust
fn upgrade_character_class_spell_with_conn(
    conn: &Connection,
    character_class_id: i64,
    old_hash: &str,
    new_spell_id: i64,
    new_hash: &str,
) -> Result<(), AppError> {
    // Validate that new_spell_id maps to new_hash
    let actual_hash: Option<String> = conn
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

    let updated = conn.execute(
        "UPDATE character_class_spell SET spell_content_hash = ?, spell_id = ? WHERE character_class_id = ? AND spell_content_hash = ?",
        rusqlite::params![new_hash, new_spell_id, character_class_id, old_hash],
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

- [x] **Step 2: Restrict upgrade lookup to strictly newer spells**
  Locate `get_character_class_spells_with_conn` (around line 37 and 70).
  In both complex `SELECT` statements (for `list_type` filtered and unfiltered), add `AND s2.id > s.id` to the `available_upgrade_hash` and `available_upgrade_spell_id` subqueries.

```sql
                        CASE WHEN s.id IS NOT NULL AND ccs.spell_content_hash IS NOT NULL THEN
                            (SELECT s2.content_hash FROM spell s2
                             WHERE s2.name = s.name
                               AND s2.content_hash != ccs.spell_content_hash
                               AND s2.content_hash IS NOT NULL
                               AND s2.id > s.id
                             ORDER BY s2.id DESC LIMIT 1)
                        ELSE NULL END AS available_upgrade_hash,
                        CASE WHEN s.id IS NOT NULL AND ccs.spell_content_hash IS NOT NULL THEN
                            (SELECT s2.id FROM spell s2
                             WHERE s2.name = s.name
                               AND s2.content_hash != ccs.spell_content_hash
                               AND s2.content_hash IS NOT NULL
                               AND s2.id > s.id
                             ORDER BY s2.id DESC LIMIT 1)
                        ELSE NULL END AS available_upgrade_spell_id
```

- [x] **Step 3: Run backend tests**
  Run `cd apps/desktop/src-tauri && cargo test` to verify no regressions in existing character spell functionality.

- [x] **Step 4: Commit**
```bash
git add apps/desktop/src-tauri/src/commands/characters.rs
git commit -m "fix(backend): validate spell updates and only report newer spells as upgrades"
```

---

## Chunk 3: E2E Test Hardening

### Task 3: Remove fixed sleeps from Character Edge Cases

**Files:**
- Modify: `apps/desktop/tests/character_edge_cases.spec.ts`

- [x] **Step 1: Replace fixed wait and conditionally dismiss the modal optimally**
  Locate `test("missing-library: shows placeholder..."` around line 171.
  Replace the `page.waitForTimeout` parts with a robust check that doesn't fail the test runner or wait blindly when unnecessary. Instead of fixed 2000ms sleeps, wait for the expected page state to be fully loaded (e.g. rows or UI elements), and check for the modal using `waitFor` if you expect it to appear due to the test conditions.

```typescript
      await page.reload();
      await expect(page.getByRole("link", { name: charName })).toBeVisible({
        timeout: 5000,
      });
      
      const modal = page.getByTestId("modal-dialog");
      // Conditionally dismiss without expect() to avoid false failures in test reports
      try {
        await modal.waitFor({ state: "visible", timeout: 2000 });
        await page.getByTestId("modal-button-dismiss").click();
      } catch (e) {
        // Did not trigger - ignore.
      }
```
Do the same pattern for when CharacterEditor is reopened (the second wait block in the same test). Ensure you wait for the target element (like the Mage section or spell row) to be visible instead of resting on fixed timeouts.

- [x] **Step 2: Apply the same fix to the other E2E tests**
  Locate `test("missing-library: removing missing-library row..."` around line 234.
  Locate `test("upgrade: Upgrade button appears..."` around line 357.
  Replace all `waitForTimeout(2000)` and `waitForTimeout(800)` modal dismissal chunks and `waitForTimeout(500)` calls with deterministic state assertions (e.g. `await expect(selector).toBeVisible()`). Wait for the actual UI elements to reach the desired state instead of predicting time.

- [x] **Step 3: Run Playwright tests**
  Run `cd apps/desktop && pnpm playwright test tests/character_edge_cases.spec.ts` to ensure the tests pass faster and deterministically.

- [x] **Step 4: Commit**
```bash
git add apps/desktop/tests/character_edge_cases.spec.ts
git commit -m "test(e2e): replace fixed sleeps with deterministic modal dismissal"
```
