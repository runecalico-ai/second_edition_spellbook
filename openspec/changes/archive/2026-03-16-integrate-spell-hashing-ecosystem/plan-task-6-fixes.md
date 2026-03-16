# Task 6 Review Findings Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address the code review findings (F1, F3, F4, F5, F6) for Task 6.1 (Integrate artifact spell hashes) to ensure robust tests, clear errors, and perfect maintainability.

**Architecture:** We are making targeted, localized test improvements in `import.rs` and `migrations.rs`, a small UX tweak to error logging in `vault.rs`, a signature cleanup in `import.rs`, and adding a tracking TODO for future work.

**Tech Stack:** Rust (Tauri Backend), SQLite, rusqlite.

---

### Task 1: [F1] Artifact Cascade Rollback Test

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/import.rs`

- [x] **Step 1: Write the failing test assertion**
Modify `test_apply_import_replace_failure_rolls_back_item_and_keeps_other_rows` to seed an artifact and test its rollback.
Find the test setup where `character_class_spell` is inserted (around line 4068):
```rust
        conn.execute(
            "INSERT INTO character_class_spell (id, spell_id, spell_content_hash) VALUES (1, 1, ?)",
            params![replace_old_hash.clone()],
        )
        .expect("seed old character_class_spell hash reference");
        // ADD THIS:
        conn.execute(
            "INSERT INTO artifact (id, spell_id, spell_content_hash) VALUES (1, 1, ?)",
            params![replace_old_hash.clone()],
        )
        .expect("seed old artifact hash reference");
```

At the end of the test (around line 4132), after verifying the `character_class_spell` hash, add the artifact assertion:
```rust
        let artifact_rolled_back_hash: String = conn
            .query_row(
                "SELECT spell_content_hash FROM artifact WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .expect("query artifact hash after rollback");
        assert_eq!(
            artifact_rolled_back_hash, replace_old_hash,
            "failed replace must rollback cascaded artifact hash update"
        );
```

- [x] **Step 2: Run test to verify it passes**
Run: `cargo test --package app-desktop test_apply_import_replace_failure_rolls_back_item_and_keeps_other_rows`
Expected: PASS (This tests existing functionality so it should pass immediately).

- [x] **Step 3: Commit**
```bash
git add apps/desktop/src-tauri/src/commands/import.rs
git commit -m "test: verify artifact cascade rollback on import failure (F1)"
```

---

### Task 2: [F3] Cleanup `replace_with_new_impl` unused parameter

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/import.rs`

- [x] **Step 1: Clean up signature**
Find `fn replace_with_new_impl(` (around line 695).
Change `_new_hash: &str` to `_incoming_hash_unused: &str`.
Add a clarifying comment inside the function near `let stored_hash = ...compute_hash()`:
```rust
    // We recompute the hash from the canonical payload rather than trusting _incoming_hash_unused
    // to ensure complete integrity before saving to the DB and vault.
```

- [x] **Step 2: Run tests to verify**
Run: `cargo test --package app-desktop`
Expected: PASS.

- [x] **Step 3: Commit**
```bash
git add apps/desktop/src-tauri/src/commands/import.rs
git commit -m "refactor: clarify unused parameter in replace_with_new_impl (F3)"
```

---

### Task 3: [F4] Partial Index Verification Test

**Files:**
- Modify: `apps/desktop/src-tauri/src/db/migrations.rs`

- [x] **Step 1: Write the failing test**
Modify `test_migration_0015_creates_task_5_index_names` (around line 172). Instead of just checking existence, check the SQL for `WHERE spell_content_hash IS NOT NULL`.

```rust
        let partial_indexes = vec![
            "idx_ccs_spell_content_hash",
            "idx_artifact_spell_content_hash",
            "idx_ccs_character_hash_list",
        ];
        
        for index in partial_indexes {
            let sql: String = conn
                .query_row(
                    "SELECT sql FROM sqlite_master WHERE type='index' AND name=?",
                    params![index],
                    |row| row.get(0),
                )
                .expect("query index sql");
            assert!(
                sql.contains("WHERE spell_content_hash IS NOT NULL"),
                "Index {} must be a partial index, got SQL: {}",
                index,
                sql
            );
        }
```

- [x] **Step 2: Run tests to verify it passes**
Run: `cargo test --package app-desktop test_migration_0015`
Expected: PASS.

- [x] **Step 3: Commit**
```bash
git add apps/desktop/src-tauri/src/db/migrations.rs
git commit -m "test: verify task 5 indexes are partial indexes (F4)"
```

---

### Task 4: [F5] Improve Unrecoverable Vault Error Message

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/vault.rs`
- Modify: `apps/desktop/src-tauri/src/commands/import.rs` (if test asserts string)

- [x] **Step 1: Write the failing test**
Modify `test_integrity_reports_missing_artifact_only_hash_as_unrecoverable` (around line 1535) and `test_integrity_reports_missing_file_as_unrecoverable_when_canonical_data_missing` (around line 1520) in `vault.rs` to assert the specific message reason.

For artifact only hash (L1535):
```rust
        assert_eq!(
            summary.unrecoverable[0].reason,
            "Hash referenced only by artifact/list; spell row deleted, cannot recover vault file"
        );
```

For missing canonical data (L1520):
```rust
        assert_eq!(
            summary.unrecoverable[0].reason,
            "Missing vault file and canonical_data is NULL in spell table"
        );
```

- [x] **Step 2: Run tests to verify they fail**
Run: `cargo test --package app-desktop test_integrity_reports_missing_file`
Expected: FAIL (strings don't match).

- [x] **Step 3: Implement minimal fix**
In `vault.rs`, `run_vault_integrity_check_with_root` (around line 568):
Check if the content hash exists in the `spell` table. If the row doesn't exist, use the artifact-specific message.

```rust
        let spell_exists: bool = conn
            .query_row(
                "SELECT 1 FROM spell WHERE content_hash = ?",
                [content_hash.as_str()],
                |_| Ok(true),
            )
            .optional()?
            .unwrap_or(false);

        let canonical_data = if spell_exists {
            conn.query_row(
                "SELECT canonical_data FROM spell WHERE content_hash = ?",
                [content_hash.as_str()],
                |row| row.get::<_, Option<String>>(0),
            ).optional()?.flatten()
        } else {
            None
        };
```
Then adjust the `record_unrecoverable` messages accordingly. If `!spell_exists`, use `"Hash referenced only by artifact/list; spell row deleted, cannot recover vault file"`. Else if `canonical_data.is_none()`, use `"Missing vault file and canonical_data is NULL in spell table"`. Update both the missing file block (L598) and invalid file block (L635).

- [x] **Step 4: Run tests to verify they pass**
Run: `cargo test --package app-desktop vault::tests`
Expected: PASS.

- [x] **Step 5: Commit**
```bash
git add apps/desktop/src-tauri/src/commands/vault.rs
git commit -m "fix: improve vault unrecoverable error clarity for artifact-only hashes (F5)"
```

---

### Task 5: [F6] Track Artifact-By-Hash Read Path

**Files:**
- Modify: `c:\Users\vitki\OneDrive\GitHub\runecalico-ai\second_edition_spellbook\openspec\changes\integrate-spell-hashing-ecosystem\tasks.md`

- [x] **Step 1: Track the task**
In `tasks.md`, under `## 6. Artifact Integration`, add a sub-task or note:
```markdown
    - [ ] 6.2 Follow-up tracking
        - [ ] Update frontend/backend read paths to load artifacts by `spell_content_hash` instead of `spell_id` before `spell_id` is officially dropped.
        - [ ] Implement grace placeholder for artifact UI when referenced `spell_content_hash` does not exist in the library.
```

- [x] **Step 2: Commit**
```bash
git add openspec/changes/integrate-spell-hashing-ecosystem/tasks.md
git commit -m "docs: track artifact-by-hash read path for future implementation (F6)"
```
