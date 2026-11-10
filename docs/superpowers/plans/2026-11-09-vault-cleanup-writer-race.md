# Vault Cleanup vs. Concurrent Spell Writers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deleting a spell and running vault GC never remove a `spells/{hash}.json` file that a concurrent spell write has just made live, whether that write comes from the same app instance or another one.

**Architecture:** A new helper, `with_vault_write_lock`, runs a closure inside `BEGIN IMMEDIATE`. That takes SQLite's database-wide write lock, which is shared across connections and processes. Spell writers write the vault file after their first row write, while they hold that lock, or after they commit. So a liveness check and the `remove_file` call inside the helper cannot interleave with a writer. `delete_spell_with_conn` wraps its whole body in the helper. Vault GC keeps its fast snapshot of live hashes as a pre-filter, then re-checks each orphan candidate and removes it under the helper, one short transaction per file.

**Tech Stack:** Rust (Tauri 2), rusqlite (bundled SQLite, rollback journal, default 5 s busy timeout per connection), `tempfile` (tests).

## Global Constraints

- Base: branch `add-cross-platform-installers` at `19b6f3f` or later. Do not push.
- No new or upgraded dependencies (`docs/DEPENDENCY_SECURITY.md`).
- Do not change `VaultMaintenanceState`, `start_import`, `start_gc`, `with_idle_lock`, or their error messages.
- Lock order: take the SQLite write lock (`with_vault_write_lock`) first, then the maintenance-phase mutex (`with_idle_lock`). Never wait for the SQLite lock while holding the phase mutex.
- Keep each `with_vault_write_lock` closure short: one liveness query plus one file removal (delete also runs its two `DELETE` statements). While it runs, a writer that starts by writing (`create_spell`, the import chunks) waits on the busy timeout (5 s). A transaction that reads before it writes (`apply_spell_update_with_conn`) gets `SQLITE_BUSY` at once, because SQLite does not call the busy handler for a read-to-write upgrade. That is already true for every other concurrent writer. Its savepoint rolls back and nothing is lost.
- Do not change the spell writers (`create_spell`, `apply_spell_update_with_conn`, `upsert_spell`, the import paths). They already write the vault file after their first row write, or after commit.
- Rust gate, from `apps/desktop/src-tauri`, before each commit: `cargo fmt -- --check`, `cargo clippy --all-targets -- -D warnings`, `cargo clippy --no-default-features -- -D warnings`, `cargo test`.
- PowerShell does not support bash heredocs. Use `git commit -m "<subject>" -m "<body>"`.
- `.gitattributes` sets `eol=lf`. Keep LF line endings in edited files.
- Write a code comment only for a constraint the code cannot show.
- Out of scope: the integrity check's re-export can leave an orphan file when a delete races it. That is harmless, and the next GC removes it.

## Root cause (verified 2026-11-09 on `19b6f3f`)

**Bug 1, `delete_spell_with_conn`** (`apps/desktop/src-tauri/src/commands/spells.rs`, lines 995–1041). The function runs in autocommit mode. The `DELETE` commits on its own. `is_content_hash_live` and `std::fs::remove_file` then run with no database lock. `with_idle_lock` only excludes import and GC in this process. `create_spell`, `update_spell` and `upsert_spell` never touch it. So this ordering is possible:

1. Delete commits `DELETE FROM spell WHERE id = ?`.
2. Delete's `is_content_hash_live` returns false.
3. A writer on another pool connection, or in another app instance, inserts a row with the same hash, writes `spells/{hash}.json`, and commits.
4. Delete removes that file. The spell row stays live with no vault file.

**Bug 2, `run_vault_gc_with_root`** (`apps/desktop/src-tauri/src/commands/vault.rs`, lines 759–793). GC takes a snapshot with `collect_live_content_hashes`, then walks `spells/` and removes every `.json` file whose stem is not in the snapshot. The `Gc` phase guard does not stop the spell writers. A spell created after the snapshot keeps its row, but GC removes its file.

**Why `BEGIN IMMEDIATE` fixes both bugs:**
- The cleanup takes the write lock before its liveness check and keeps it until after `remove_file`.
- A writer cannot get past its first row write while the cleanup holds the lock. A writer that starts by writing waits on the busy timeout, then writes a fresh file. A read-then-write transaction gets `SQLITE_BUSY` and rolls back. Either way it never writes a file that the cleanup then removes.
- If the writer already holds the lock, the cleanup's `BEGIN IMMEDIATE` waits until the writer commits. The liveness check then sees the new row and keeps the file.
- The JSON import writes its files after `tx.commit()` (`import.rs` line 1263). That is also safe: any liveness check that runs after the commit sees the row.

**Remaining failure mode:** delete's `COMMIT` can fail after the file is removed. The row then comes back with no file. The integrity check re-exports the file from `canonical_data`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/desktop/src-tauri/src/commands/vault.rs` | `with_vault_write_lock` and its test | 1 |
| `apps/desktop/src-tauri/src/commands/spells.rs` | `delete_spell_with_conn` runs under the write lock; race test | 1 |
| `apps/desktop/src-tauri/AGENTS.md` | Rule for where vault files are written and removed | 1 |
| `apps/desktop/src-tauri/src/commands/vault.rs` | GC re-checks and removes each orphan under the write lock; race tests | 2 |

---

### Task 1: Delete cleanup holds the SQLite write lock

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/vault.rs` (add `with_vault_write_lock` after `is_content_hash_live`, line 757; test after `test_gc_handles_missing_artifact_spell_content_hash_column`, around line 1878)
- Modify: `apps/desktop/src-tauri/src/commands/spells.rs` (`use crate::commands::vault::{…}`, lines 4–7; `delete_spell_with_conn`, lines 995–1041; test helpers after `setup_spell_delete_test_db`, line 1623; tests after `test_delete_spell_with_conn_ignores_malformed_content_hash`, line 1787)
- Modify: `apps/desktop/src-tauri/AGENTS.md` (`## Database` bullet list, after the `**Embedding index revision**` bullet)

**Interfaces:**
- Consumes: `is_content_hash_live(conn: &rusqlite::Connection, content_hash: &str) -> Result<bool, AppError>`, `spell_file_path_in_root(root: &Path, hash: &str) -> PathBuf`, `write_spell_json_atomically(root: &Path, content_hash: &str, json: &str) -> Result<PathBuf, AppError>`, `VaultMaintenanceState::with_idle_lock` (all `vault.rs`); `run_in_savepoint(conn: &Connection, name: &str, op: F) -> Result<T, AppError>`, `seed_vaulted_spell(conn, root, id, name) -> String`, `setup_spell_delete_test_db() -> Connection` (`spells.rs`).
- Produces: `pub(crate) fn with_vault_write_lock<T>(conn: &rusqlite::Connection, f: impl FnOnce() -> Result<T, AppError>) -> Result<T, AppError>` in `crate::commands::vault`. It commits when `f` returns `Ok`, rolls back when `f` or `COMMIT` fails, and always leaves `conn` in autocommit mode. Task 2 uses it.

- [ ] **Step 1: Write the failing helper test**

In the `tests` module of `vault.rs`, after `test_gc_handles_missing_artifact_spell_content_hash_column`, add:

```rust
    #[test]
    fn test_with_vault_write_lock_rolls_back_when_closure_fails() {
        let conn = setup_vault_test_db(true);

        let result: Result<(), AppError> = with_vault_write_lock(&conn, || {
            conn.execute("INSERT INTO spell (id, name) VALUES (1, 'Doomed')", [])?;
            Err(AppError::Validation("stop".to_string()))
        });

        assert!(result.is_err());
        assert!(conn.is_autocommit(), "the transaction must be closed");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM spell", [], |row| row.get(0))
            .expect("count spells");
        assert_eq!(count, 0, "a failed closure must roll back its writes");
    }
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `apps/desktop/src-tauri`): `cargo test with_vault_write_lock`
Expected: compile error, `cannot find function with_vault_write_lock in this scope`.

- [ ] **Step 3: Add `with_vault_write_lock`**

In `vault.rs`, directly after the closing `}` of `is_content_hash_live`, add:

```rust
/// Runs `f` in a `BEGIN IMMEDIATE` transaction. Spell writers write
/// `spells/{hash}.json` after their first row write or after commit, so while `f`
/// runs no connection in any app instance can make a hash live. Check liveness and
/// remove vault files inside `f`.
pub(crate) fn with_vault_write_lock<T>(
    conn: &rusqlite::Connection,
    f: impl FnOnce() -> Result<T, AppError>,
) -> Result<T, AppError> {
    let tx =
        rusqlite::Transaction::new_unchecked(conn, rusqlite::TransactionBehavior::Immediate)?;
    let value = f()?;
    tx.commit()?;
    Ok(value)
}
```

`Transaction` rolls back on drop, so an `Err` from `f`, a failed `COMMIT`, and a panic in `f` all release the lock. Without that, a panic would return the pooled connection with `BEGIN IMMEDIATE` still open and block every writer.

Run: `cargo test with_vault_write_lock`
Expected: 1 passed.

- [ ] **Step 4: Add a test seam to `delete_spell_with_conn` (no behavior change)**

In `spells.rs`, replace the signature line and opening of `delete_spell_with_conn`:

```rust
pub(crate) fn delete_spell_with_conn(
    conn: &Connection,
    vault_root: &std::path::Path,
    maintenance: &VaultMaintenanceState,
    id: i64,
) -> Result<(), AppError> {
```

with:

```rust
pub(crate) fn delete_spell_with_conn(
    conn: &Connection,
    vault_root: &std::path::Path,
    maintenance: &VaultMaintenanceState,
    id: i64,
) -> Result<(), AppError> {
    delete_spell_with_conn_and_hook(conn, vault_root, maintenance, id, || {})
}

fn delete_spell_with_conn_and_hook(
    conn: &Connection,
    vault_root: &std::path::Path,
    maintenance: &VaultMaintenanceState,
    id: i64,
    before_remove: impl FnOnce(),
) -> Result<(), AppError> {
```

Keep the rest of the old body as it is. Add one line inside the `with_idle_lock` closure, between `let path = spell_file_path_in_root(vault_root, &hash);` and `match std::fs::remove_file(&path) {`:

```rust
        before_remove();
```

Run: `cargo test delete_spell_with_conn`
Expected: 6 passed (the existing tests).

- [ ] **Step 5: Write the failing race test**

In the `tests` module of `spells.rs`, directly after `setup_spell_delete_test_db`, add:

```rust
    fn setup_spell_delete_test_db_file(db_path: &std::path::Path) -> Connection {
        setup_spell_delete_test_db()
            .execute("VACUUM INTO ?1", [db_path.to_str().expect("UTF-8 db path")])
            .expect("copy test schema to a file");
        Connection::open(db_path).expect("open file-backed test db")
    }
```

After `test_delete_spell_with_conn_ignores_malformed_content_hash`, add:

```rust
    #[test]
    fn test_delete_spell_with_conn_blocks_spell_writers_during_file_cleanup() {
        let root = tempfile::tempdir().expect("vault root");
        let db_path = root.path().join("spellbook.sqlite3");
        let conn = setup_spell_delete_test_db_file(&db_path);
        let hash = seed_vaulted_spell(&conn, root.path(), 1, "Recreated Spell");
        let json: String = conn
            .query_row("SELECT canonical_data FROM spell WHERE id = 1", [], |row| {
                row.get(0)
            })
            .expect("read canonical_data");
        let writer = Connection::open(&db_path).expect("open writer connection");
        writer
            .busy_timeout(std::time::Duration::ZERO)
            .expect("disable writer busy wait");
        let recreate = || {
            run_in_savepoint(&writer, "spell_recreate_write", || {
                writer.execute(
                    "INSERT INTO spell (id, name, level, description, canonical_data, content_hash)
                     VALUES (2, 'Recreated Spell', 1, 'Recreated Spell description', ?1, ?2)",
                    rusqlite::params![json, hash],
                )?;
                crate::commands::vault::write_spell_json_atomically(root.path(), &hash, &json)?;
                Ok(())
            })
        };

        let mut during_cleanup = None;
        delete_spell_with_conn_and_hook(
            &conn,
            root.path(),
            &VaultMaintenanceState::default(),
            1,
            || during_cleanup = Some(recreate()),
        )
        .expect("delete spell");

        let during_cleanup = during_cleanup.expect("cleanup reached file removal");
        assert!(
            matches!(
                &during_cleanup,
                Err(AppError::Database(rusqlite::Error::SqliteFailure(error, _)))
                    if error.code == rusqlite::ErrorCode::DatabaseBusy
            ),
            "a spell writer must wait until the delete commits, got {during_cleanup:?}"
        );
        assert!(
            !spell_file_path_in_root(root.path(), &hash).exists(),
            "the delete removed the unreferenced file while holding the lock"
        );
        recreate().expect("writer succeeds after the delete commits");
        assert!(
            spell_file_path_in_root(root.path(), &hash).exists(),
            "the recreated spell keeps its vault file"
        );
    }
```

The `recreate` closure copies `create_spell`: a deferred savepoint, then `INSERT`, then the vault file write, then release. A zero busy timeout makes the writer fail at once instead of waiting.

- [ ] **Step 6: Run it to verify it fails**

Run: `cargo test test_delete_spell_with_conn_blocks_spell_writers_during_file_cleanup`
Expected: FAIL, panic message `a spell writer must wait until the delete commits, got Ok(())`. The `DELETE` already autocommitted, so the writer inserts and writes its file, and delete then removes it.

- [ ] **Step 7: Run the delete under `with_vault_write_lock`**

In `spells.rs`, change the vault import (lines 4–7) to:

```rust
use crate::commands::vault::{
    export_spell_to_vault_by_hash, is_content_hash_live, spell_file_path_in_root,
    with_vault_write_lock, VaultMaintenanceState,
};
```

Replace the whole body of `delete_spell_with_conn_and_hook` with:

```rust
    with_vault_write_lock(conn, || {
        let content_hash: Option<String> = conn
            .query_row(
                "SELECT content_hash FROM spell WHERE id = ?1",
                [id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?
            .flatten();

        conn.execute("DELETE FROM spell_vec WHERE rowid = ?", [id])?;
        conn.execute("DELETE FROM spell WHERE id = ?", [id])?;

        let Some(hash) = content_hash else {
            return Ok(());
        };
        if !is_well_formed_content_hash(&hash) {
            tracing::warn!(
                spell_id = id,
                "deleted spell has a malformed content_hash; leaving vault files untouched"
            );
            return Ok(());
        }
        let cleanup = maintenance.with_idle_lock(|| {
            if is_content_hash_live(conn, &hash)? {
                return Ok(());
            }
            let path = spell_file_path_in_root(vault_root, &hash);
            before_remove();
            match std::fs::remove_file(&path) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    tracing::warn!(path = %path.display(), %error, "failed to remove deleted spell's vault file; deferred GC will retry");
                }
            }
            Ok(())
        })?;
        if cleanup.is_none() {
            tracing::info!(%hash, "vault maintenance busy; leaving spell file for deferred GC");
        }
        Ok(())
    })
```

- [ ] **Step 8: Run the delete tests and the Rust gate**

Run: `cargo test delete_spell_with_conn`
Expected: 7 passed (the 6 existing tests plus the new race test). The in-memory tests still pass, because `BEGIN IMMEDIATE` works on in-memory connections. `test_delete_spell_with_conn_defers_cleanup_while_import_runs` still passes, because `with_idle_lock` returns `None` inside the transaction.

Run: `cargo test with_vault_write_lock`
Expected: 1 passed.

Run the Rust gate from Global Constraints.
Expected: all exit 0.

- [ ] **Step 9: Document the write-ordering rule**

In `apps/desktop/src-tauri/AGENTS.md`, under `## Database`, directly after the `- **Embedding index revision**: …` bullet, insert:

```markdown
- **Vault file writes and cleanup**: A spell writer writes `spells/{content_hash}.json` after its transaction's first write to `spell` (it then holds SQLite's write lock) or after it commits, never before the row write. Code that removes vault files (`delete_spell_with_conn`, vault GC) checks `is_content_hash_live` and calls `remove_file` inside one `with_vault_write_lock` (`BEGIN IMMEDIATE`) call. The process-local `VaultMaintenanceState` does not stop spell writers or other app instances, so it cannot replace this lock. Take the SQLite lock before `with_idle_lock`, never after.
```

- [ ] **Step 10: Commit**

```powershell
git add apps/desktop/src-tauri/src/commands/vault.rs apps/desktop/src-tauri/src/commands/spells.rs apps/desktop/src-tauri/AGENTS.md
git commit -m "fix(vault): hold the write lock across delete-spell file cleanup" -m "A concurrent create or update with the same content could write and commit the hash's vault file between the liveness check and remove_file. The maintenance mutex is process-local and spell writers never take it. BEGIN IMMEDIATE serializes the cleanup with every writer, across instances too."
```

---

### Task 2: Vault GC re-checks each orphan under the write lock

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/vault.rs` (`run_vault_gc_with_root`, lines 759–793; add `remove_unreferenced_spell_files` directly after it; test helper after `insert_spell_row`, around line 1193; tests after `test_with_vault_write_lock_rolls_back_when_closure_fails` from Task 1)

**Interfaces:**
- Consumes: `with_vault_write_lock` (Task 1); `is_content_hash_live`, `collect_live_content_hashes(conn) -> Result<HashSet<String>, AppError>`, `spell_storage_dir_in_root(root) -> Result<PathBuf, AppError>`, `run_vault_integrity_check_with_root`, `VaultGcSummary { integrity, retained_count, deleted_count, warning_count }` (`Default`), `write_spell_json_atomically`; test helpers `sample_spell()`, `setup_vault_test_db(bool)`, `insert_spell_row(conn, id, &spell, hash, Some(json))`.
- Produces: `fn remove_unreferenced_spell_files(conn: &rusqlite::Connection, candidates: &[(String, PathBuf)], summary: &mut VaultGcSummary, before_remove: impl FnMut()) -> Result<(), AppError>`. Each candidate is `(content_hash, file_path)`. The function adds 1 to `deleted_count` for each file it removes and 1 to `retained_count` for each hash that is live again. Private to `vault.rs`.

- [ ] **Step 1: Extract the removal loop into `remove_unreferenced_spell_files` (no behavior change)**

In `vault.rs`, replace `run_vault_gc_with_root` (lines 759–793) with:

```rust
pub(crate) fn run_vault_gc_with_root(
    conn: &rusqlite::Connection,
    root: &Path,
) -> Result<VaultGcSummary, AppError> {
    let integrity = run_vault_integrity_check_with_root(conn, root)?;
    let live_hashes = collect_live_content_hashes(conn)?;
    let spells_dir = spell_storage_dir_in_root(root)?;
    let mut summary = VaultGcSummary {
        integrity,
        ..VaultGcSummary::default()
    };

    let mut candidates = Vec::new();
    for entry in fs::read_dir(spells_dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() || path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }

        let Some(stem) = path.file_stem().and_then(|stem| stem.to_str()) else {
            continue;
        };

        if live_hashes.contains(stem) {
            summary.retained_count += 1;
            continue;
        }

        let content_hash = stem.to_string();
        candidates.push((content_hash, path));
    }
    remove_unreferenced_spell_files(conn, &candidates, &mut summary, || {})?;

    summary.warning_count = summary.integrity.warning_count;
    Ok(summary)
}

fn remove_unreferenced_spell_files(
    _conn: &rusqlite::Connection,
    candidates: &[(String, PathBuf)],
    summary: &mut VaultGcSummary,
    mut before_remove: impl FnMut(),
) -> Result<(), AppError> {
    for (_content_hash, path) in candidates {
        before_remove();
        fs::remove_file(path)?;
        summary.deleted_count += 1;
    }
    Ok(())
}
```

`_conn` and `_content_hash` are unused until Step 4. Collecting candidates first also stops GC from removing files from `spells/` while `read_dir` is still iterating it.

Run: `cargo test gc_`
Expected: the existing GC tests pass (`test_gc_removes_orphaned_spell_files_and_preserves_referenced_files`, `test_gc_preserves_character_spell_hash_references`, `test_gc_runs_integrity_check_first_and_recovers_missing_live_file`, `test_gc_handles_missing_artifact_spell_content_hash_column`, `test_maintenance_state_blocks_gc_while_import_active`, plus the import GC tests).

- [ ] **Step 2: Write the failing tests**

In the `tests` module of `vault.rs`, directly after `insert_spell_row`, add:

```rust
    fn setup_vault_test_db_file(db_path: &Path) -> Connection {
        setup_vault_test_db(true)
            .execute("VACUUM INTO ?1", [db_path.to_str().expect("UTF-8 db path")])
            .expect("copy test schema to a file");
        Connection::open(db_path).expect("open file-backed test db")
    }
```

After `test_with_vault_write_lock_rolls_back_when_closure_fails`, add:

```rust
    #[test]
    fn test_remove_unreferenced_spell_files_keeps_file_that_became_live() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let conn = setup_vault_test_db(true);
        let mut spell = sample_spell();
        let hash = spell.compute_hash().expect("hash");
        spell.id = Some(hash.clone());
        let json = serde_json::to_string(&spell).expect("serialize spell");
        let path =
            write_spell_json_atomically(temp_dir.path(), &hash, &json).expect("write spell file");
        insert_spell_row(&conn, 1, &spell, &hash, Some(&json));
        let mut summary = VaultGcSummary::default();

        remove_unreferenced_spell_files(&conn, &[(hash.clone(), path.clone())], &mut summary, || {})
            .expect("remove candidates");

        assert_eq!(summary.deleted_count, 0);
        assert_eq!(summary.retained_count, 1);
        assert!(
            path.exists(),
            "a hash that is live when GC removes files keeps its file"
        );
    }

    #[test]
    fn test_remove_unreferenced_spell_files_blocks_spell_writers_until_removal() {
        let temp_dir = tempfile::tempdir().expect("temp dir");
        let db_path = temp_dir.path().join("spellbook.sqlite3");
        let conn = setup_vault_test_db_file(&db_path);
        let mut spell = sample_spell();
        let hash = spell.compute_hash().expect("hash");
        spell.id = Some(hash.clone());
        let json = serde_json::to_string(&spell).expect("serialize spell");
        let path = write_spell_json_atomically(temp_dir.path(), &hash, &json)
            .expect("write leftover spell file");
        let writer = Connection::open(&db_path).expect("open writer connection");
        writer
            .busy_timeout(std::time::Duration::ZERO)
            .expect("disable writer busy wait");
        let recreate = || -> Result<(), AppError> {
            writer.execute_batch("BEGIN")?;
            let written = writer
                .execute(
                    "INSERT INTO spell (id, name, canonical_data, content_hash) VALUES (1, ?1, ?2, ?3)",
                    params![spell.name, json, hash],
                )
                .map_err(AppError::from)
                .and_then(|_| write_spell_json_atomically(temp_dir.path(), &hash, &json));
            match written {
                Ok(_) => {
                    writer.execute_batch("COMMIT")?;
                    Ok(())
                }
                Err(error) => {
                    let _ = writer.execute_batch("ROLLBACK");
                    Err(error)
                }
            }
        };
        let mut summary = VaultGcSummary::default();
        let mut during_removal = None;

        remove_unreferenced_spell_files(
            &conn,
            &[(hash.clone(), path.clone())],
            &mut summary,
            || during_removal = Some(recreate()),
        )
        .expect("remove candidates");

        let during_removal = during_removal.expect("gc reached file removal");
        assert!(
            matches!(
                &during_removal,
                Err(AppError::Database(rusqlite::Error::SqliteFailure(error, _)))
                    if error.code == rusqlite::ErrorCode::DatabaseBusy
            ),
            "a spell writer must wait until GC commits, got {during_removal:?}"
        );
        assert_eq!(summary.deleted_count, 1);
        assert!(!path.exists(), "GC removed the orphan while holding the lock");
        recreate().expect("writer succeeds after GC commits");
        assert!(path.exists(), "the recreated spell keeps its vault file");
    }
```

The first test covers the re-check. The hash went live after the snapshot, so the file must survive. The second test covers the lock. A writer that tries to recreate the hash during the removal must wait.

- [ ] **Step 3: Run them to verify they fail**

Run: `cargo test remove_unreferenced_spell_files`
Expected: 2 FAILED.
- `..._keeps_file_that_became_live` fails with `assertion left == right failed` (`left: 1`, `right: 0`) on `deleted_count`.
- `..._blocks_spell_writers_until_removal` fails with `a spell writer must wait until GC commits, got Ok(())`.

- [ ] **Step 4: Re-check and remove each candidate under the write lock**

In `vault.rs`, replace `remove_unreferenced_spell_files` with:

```rust
fn remove_unreferenced_spell_files(
    conn: &rusqlite::Connection,
    candidates: &[(String, PathBuf)],
    summary: &mut VaultGcSummary,
    mut before_remove: impl FnMut(),
) -> Result<(), AppError> {
    for (content_hash, path) in candidates {
        let removed = with_vault_write_lock(conn, || {
            if is_content_hash_live(conn, content_hash)? {
                return Ok(false);
            }
            before_remove();
            fs::remove_file(path)?;
            Ok(true)
        })?;
        if removed {
            summary.deleted_count += 1;
        } else {
            summary.retained_count += 1;
        }
    }
    Ok(())
}
```

Each candidate gets its own short transaction, so spell writers never wait for the whole scan. The post-import GC reuses the import's connection after `tx.commit()` (`import.rs` line 1263), so that connection is in autocommit mode and `BEGIN IMMEDIATE` succeeds there.

- [ ] **Step 5: Run the GC tests, the benchmark, and the Rust gate**

Run: `cargo test remove_unreferenced_spell_files`
Expected: 2 passed.

Run: `cargo test gc_`
Expected: all GC and import-GC tests pass.

Run: `cargo test test_bench_vault_gc_10000 -- --ignored`
Expected: 1 passed (`deleted_count == 1000`, `retained_count == 9000`, under 30 s). That is 1000 orphans, each in its own short transaction.

Run: `cargo test delete_spell_with_conn`
Expected: 7 passed.

Run the Rust gate from Global Constraints.
Expected: all exit 0.

- [ ] **Step 6: Commit**

```powershell
git add apps/desktop/src-tauri/src/commands/vault.rs
git commit -m "fix(vault): re-check GC orphans under the write lock before removal" -m "GC removed every file missing from its live-hash snapshot. A spell created after the snapshot, in this instance or another, lost its vault file. Each candidate is now re-checked and removed inside BEGIN IMMEDIATE."
```
