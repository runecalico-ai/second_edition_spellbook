# Installer Review Fixes, Part 5: Existing-Vault Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user installs a new Spellbook version over an existing vault, the vault picks up the bundled sqlite-vec library from the new install. A spell that keeps failing to embed no longer forces a full re-embed of every spell on each startup.

**Architecture:** Task 1 changes `install_sqlite_vec_if_needed` (`db/pool.rs`). When a bundled library exists and its bytes differ from the vault copy, the function stages a copy beside the vault file and renames it over the old one. If the rename fails (for example, another running instance has the DLL loaded), it keeps the old library and retries on the next start. Task 2 changes the forced reindex (`commands/embeddings.rs`). When a chunk fails, the reindex deletes that chunk's old vectors. Then no vector from an older model revision can remain, and the run can record the new `embedding_index_revision` despite failures. The spells that failed have no vector, so the next startup's incremental backfill retries only them.

**Tech Stack:** Rust (Tauri 2), rusqlite, r2d2, sqlite-vec 0.1.6, tokio.

**Series:** Code review of `add-cross-platform-installers` on 2026-11-04. This plan fixes findings 6 and 7. Part 1 fixes 1, Part 2 fixes 2 and 5, Part 3 fixes 3, Part 4 fixes 4. The parts are independent, and so are Tasks 1 and 2 here.

## Global Constraints

- Base: branch `add-cross-platform-installers` at `aaeea8b` or later. Do not push.
- No new or upgraded dependencies (`docs/DEPENDENCY_SECURITY.md`).
- `ReindexResult` (`models/embeddings.rs`) and the `reindex_embeddings` IPC response shape do not change.
- `embeddings.rs` compiles only with the default `llm` feature (`commands/mod.rs` uses `llm_stubs.rs` otherwise). `pool.rs` compiles in both configurations.
- Rust gate, from `apps/desktop/src-tauri`, before each commit: `cargo fmt -- --check`, `cargo clippy --all-targets -- -D warnings`, `cargo clippy --no-default-features -- -D warnings`, `cargo test`.
- PowerShell does not support bash heredocs. Use `git commit -m "<subject>" -m "<body>"`.
- `.gitattributes` sets `eol=lf`. Keep LF line endings in edited files.
- Write a code comment only for a constraint the code cannot show.
- Out of scope: loading `vec0` directly from the install folder instead of the user-writable vault copy. That changes the load path for dev builds and the CLI, which run `init_db(None, …)`. Raise it as a separate change.

## Root causes (verified 2026-11-05 on `aaeea8b`)

- `apps/desktop/src-tauri/src/db/pool.rs` `install_sqlite_vec_if_needed` returns at once when `{vault}/vec0.dll` (or `.so`) exists. An installer that ships a newer sqlite-vec never replaces the vault copy, so existing users keep the old library.
- `apps/desktop/src-tauri/src/commands/embeddings.rs` `should_record_embedding_index_revision(force, result)` is `force && result.failed == 0`. On a forced reindex, a failed chunk keeps its vectors from the old model, because the upsert transaction rolls back. The revision therefore cannot be recorded. Every startup then sees a missing or different revision and runs another full forced reindex. If one spell always fails, every startup re-embeds every spell.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/desktop/src-tauri/src/db/pool.rs` | Refresh the vault sqlite-vec copy from a different bundled library | 1 |
| `apps/desktop/src-tauri/src/commands/embeddings.rs` | Forced reindex clears failed chunks' vectors; revision recorded when no stale vectors remain | 2 |
| `apps/desktop/src-tauri/AGENTS.md` | Database section: sqlite-vec refresh; embedding index revision rule | 1, 2 |
| `docs/TROUBLESHOOTING.md` | sqlite-vec entry: upgrades refresh the vault copy | 1 |

---

### Task 1: Refresh the vault sqlite-vec copy when the bundled library differs

**Files:**
- Modify: `apps/desktop/src-tauri/src/db/pool.rs` (`install_sqlite_vec_if_needed` lines 73–111; tests module, replacing `install_sqlite_vec_leaves_existing_destination_in_place`)
- Modify: `apps/desktop/src-tauri/AGENTS.md` (`## Database` list)
- Modify: `docs/TROUBLESHOOTING.md` (entry `### 5. "semantic search requires sqlite-vec; …"`)

**Interfaces:**
- Consumes: `sqlite_vec_library_name()`, `sqlite_vec_bundled_source_candidates(resource_dir, exe_dir)` (unchanged).
- Produces: unchanged signature `fn install_sqlite_vec_if_needed(data_dir: &Path, resource_dir: Option<&Path>, exe_dir: Option<&Path>) -> Result<Option<PathBuf>, AppError>`; new private helpers `fn same_file_contents(a: &Path, b: &Path) -> bool` and `fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()>`.

- [ ] **Step 1: Write the failing tests**

In the `tests` module of `pool.rs`, delete `install_sqlite_vec_leaves_existing_destination_in_place` and add:

```rust
    fn staged_copy_path(destination: &Path) -> PathBuf {
        let mut name = destination.as_os_str().to_os_string();
        name.push(".new");
        PathBuf::from(name)
    }

    #[test]
    fn install_sqlite_vec_replaces_outdated_vault_copy() {
        let tmp = tempdir().expect("temp dir");
        let resource_dir = tmp.path().join("Spellbook");
        let data_dir = tmp.path().join("vault");
        fs::create_dir_all(&data_dir).expect("create vault");
        let destination = data_dir.join(sqlite_vec_library_name());
        fs::write(&destination, b"old-sqlite-vec").expect("seed outdated vault copy");
        write_dummy_library(
            &resource_dir
                .join("sqlite-vec")
                .join(sqlite_vec_library_name()),
        );

        let result = install_sqlite_vec_if_needed(&data_dir, Some(&resource_dir), None)
            .expect("install should not error");

        assert_eq!(result, Some(destination.clone()));
        assert_eq!(
            fs::read(&destination).expect("read vault copy"),
            b"fake-sqlite-vec"
        );
        assert!(!staged_copy_path(&destination).exists());
    }

    #[test]
    fn install_sqlite_vec_keeps_identical_vault_copy() {
        let tmp = tempdir().expect("temp dir");
        let resource_dir = tmp.path().join("Spellbook");
        let data_dir = tmp.path().join("vault");
        fs::create_dir_all(&data_dir).expect("create vault");
        let destination = data_dir.join(sqlite_vec_library_name());
        fs::write(&destination, b"fake-sqlite-vec").expect("seed vault copy");
        write_dummy_library(
            &resource_dir
                .join("sqlite-vec")
                .join(sqlite_vec_library_name()),
        );

        let result = install_sqlite_vec_if_needed(&data_dir, Some(&resource_dir), None)
            .expect("install should not error");

        assert_eq!(result, Some(destination.clone()));
        assert_eq!(
            fs::read(&destination).expect("read vault copy"),
            b"fake-sqlite-vec"
        );
    }

    #[test]
    fn install_sqlite_vec_keeps_vault_copy_without_bundled_library() {
        let tmp = tempdir().expect("temp dir");
        let data_dir = tmp.path().join("vault");
        fs::create_dir_all(&data_dir).expect("create vault");
        let destination = data_dir.join(sqlite_vec_library_name());
        fs::write(&destination, b"dev-sqlite-vec").expect("seed vault copy");

        let result =
            install_sqlite_vec_if_needed(&data_dir, None, None).expect("install should not error");

        assert_eq!(result, Some(destination.clone()));
        assert_eq!(
            fs::read(&destination).expect("read vault copy"),
            b"dev-sqlite-vec"
        );
    }

    #[test]
    fn install_sqlite_vec_keeps_vault_entry_when_refresh_fails() {
        let tmp = tempdir().expect("temp dir");
        let resource_dir = tmp.path().join("Spellbook");
        let data_dir = tmp.path().join("vault");
        let destination = data_dir.join(sqlite_vec_library_name());
        // A directory at the destination makes the rename fail on every platform.
        fs::create_dir_all(&destination).expect("create blocking directory");
        write_dummy_library(
            &resource_dir
                .join("sqlite-vec")
                .join(sqlite_vec_library_name()),
        );

        let result = install_sqlite_vec_if_needed(&data_dir, Some(&resource_dir), None)
            .expect("a failed refresh must not fail startup");

        assert_eq!(result, Some(destination.clone()));
        assert!(destination.is_dir());
        assert!(!staged_copy_path(&destination).exists());
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/desktop/src-tauri`): `cargo test install_sqlite_vec`
Expected: `install_sqlite_vec_replaces_outdated_vault_copy` FAILS (`left: b"old-sqlite-vec"`, `right: b"fake-sqlite-vec"`). The other `install_sqlite_vec_*` tests pass.

- [ ] **Step 3: Implement**

In `pool.rs`, replace `install_sqlite_vec_if_needed` with:

```rust
fn install_sqlite_vec_if_needed(
    data_dir: &Path,
    resource_dir: Option<&Path>,
    exe_dir: Option<&Path>,
) -> Result<Option<PathBuf>, AppError> {
    let destination = data_dir.join(sqlite_vec_library_name());
    let bundled = sqlite_vec_bundled_source_candidates(resource_dir, exe_dir)
        .into_iter()
        .find(|path| path.exists());

    let Some(candidate) = bundled else {
        if destination.exists() {
            return Ok(Some(destination));
        }
        warn!(
            resource_dir = ?resource_dir,
            exe_dir = ?exe_dir,
            "sqlite-vec: no bundled library found in candidate paths"
        );
        return Ok(None);
    };

    if destination.exists() {
        if same_file_contents(&candidate, &destination) {
            return Ok(Some(destination));
        }
        match replace_file(&candidate, &destination) {
            Ok(()) => info!(
                path = %destination.display(),
                "sqlite-vec: refreshed vault copy from the bundled library"
            ),
            Err(error) => warn!(
                source = %candidate.display(),
                destination = %destination.display(),
                %error,
                "sqlite-vec: could not refresh vault copy; keeping the existing library"
            ),
        }
        return Ok(Some(destination));
    }

    fs::create_dir_all(data_dir)?;
    fs::copy(&candidate, &destination).map_err(|e| {
        AppError::Io(std::io::Error::other(format!(
            "sqlite-vec: failed to copy {} to {}: {}",
            candidate.display(),
            destination.display(),
            e
        )))
    })?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::Permissions::from_mode(0o755);
        fs::set_permissions(&destination, perms)?;
    }
    Ok(Some(destination))
}

fn same_file_contents(a: &Path, b: &Path) -> bool {
    match (fs::read(a), fs::read(b)) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

/// Stages the copy beside `destination` and renames it into place, so a failed or
/// interrupted copy never leaves a truncated library where `try_load_sqlite_vec`
/// will load it.
fn replace_file(source: &Path, destination: &Path) -> std::io::Result<()> {
    let mut staged_name = destination.as_os_str().to_os_string();
    staged_name.push(".new");
    let staged = PathBuf::from(staged_name);
    let result = fs::copy(source, &staged).and_then(|_| {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&staged, fs::Permissions::from_mode(0o755))?;
        }
        fs::rename(&staged, destination)
    });
    if result.is_err() {
        let _ = fs::remove_file(&staged);
    }
    result
}
```

`init_db` calls this before it opens any pool connection, so this process has not loaded the old library yet. On Windows, `fs::rename` replaces an existing file. It fails only when another process holds the DLL loaded; the warning path covers that case.

- [ ] **Step 4: Run the tests and the Rust gate**

Run: `cargo test install_sqlite_vec`
Expected: all `install_sqlite_vec_*` tests pass (7: the 3 kept from before plus the 4 new ones).

Run the Rust gate from Global Constraints. Expected: all exit 0.

- [ ] **Step 5: Document the refresh**

In `apps/desktop/src-tauri/AGENTS.md`, in the `## Database` list, directly after the `- **Vector Search**: …` bullet, insert:

```markdown
- **Bundled sqlite-vec**: `init_db` copies the installed `resources/sqlite-vec/vec0.*` into the vault, then loads the vault copy. When the bundled file differs (an app upgrade), it stages `vec0.*.new` and renames it over the vault copy. If the rename fails (another instance has the library loaded), it keeps the old copy and retries on the next start.
```

In `docs/TROUBLESHOOTING.md`, at the end of the `- **Fix**:` line of entry `### 5. "semantic search requires sqlite-vec; spell_vec is blob-backed in this database"`, append:

```markdown
 After an app upgrade, startup replaces the vault copy with the newly installed library. If the log shows `sqlite-vec: could not refresh vault copy`, close every Spellbook window and start the app again.
```

- [ ] **Step 6: Commit**

```powershell
git add apps/desktop/src-tauri/src/db/pool.rs apps/desktop/src-tauri/AGENTS.md docs/TROUBLESHOOTING.md
git commit -m "fix(db): refresh the vault sqlite-vec copy after app upgrades" -m "install_sqlite_vec_if_needed returned early whenever a vault copy existed, so new installers never replaced an older vec0 library."
```

---

### Task 2: A failed chunk no longer blocks recording the embedding index revision

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/embeddings.rs` (`should_record_embedding_index_revision` line 1079; `reindex_embeddings_internal` lines 1083–1115; `run_reindex_chunks` lines 1117–1217; tests near `embedding_index_revision_recorded_only_after_clean_forced_reindex`, line 2171)
- Modify: `apps/desktop/src-tauri/AGENTS.md` (`- **Embedding index revision**:` bullet)

**Interfaces:**
- Consumes: `invalidate_spell_vec_rows_blocking(pool: &crate::db::Pool, spell_ids: &[i64]) -> Result<(), AppError>` (line 140), `type SpellEmbeddingRow = (i64, String, String)`, `ReindexResult { total, indexed, skipped, failed }`, `test_support::IsolatedTestPool`.
- Produces (all private):
  - `struct ReindexRun { result: ReindexResult, stale_vectors_remain: bool }`. `run_reindex_chunks` now returns `Result<ReindexRun, AppError>`.
  - `async fn clear_failed_chunk_vectors(db: Arc<crate::db::Pool>, chunk: &[SpellEmbeddingRow]) -> bool`. Returns `true` when the chunk's vectors are gone.
  - `fn should_record_embedding_index_revision(force: bool, stale_vectors_remain: bool) -> bool`
  - `reindex_embeddings_internal` keeps its signature and still returns `Result<ReindexResult, AppError>`.

- [ ] **Step 1: Write the failing tests**

In the `tests` module of `embeddings.rs`, replace `embedding_index_revision_recorded_only_after_clean_forced_reindex` with:

```rust
    #[test]
    fn embedding_index_revision_recorded_after_forced_reindex_without_stale_vectors() {
        assert!(should_record_embedding_index_revision(true, false));
        assert!(!should_record_embedding_index_revision(true, true));
        assert!(!should_record_embedding_index_revision(false, false));
    }

    fn seed_spell_vec_row_for_test(conn: &rusqlite::Connection, spell_id: i64) {
        let vector_json =
            serde_json::to_string(&vec![0.0_f32; 384]).expect("serialize test vector");
        if conn
            .execute(
                "INSERT INTO spell_vec(rowid, v) VALUES(?1, vec_f32(?2))",
                rusqlite::params![spell_id, vector_json],
            )
            .is_ok()
        {
            return;
        }
        let bytes: Vec<u8> = vec![0.0_f32; 384]
            .into_iter()
            .flat_map(f32::to_le_bytes)
            .collect();
        conn.execute(
            "INSERT INTO spell_vec(rowid, v) VALUES(?1, ?2)",
            rusqlite::params![spell_id, bytes],
        )
        .expect("insert spell_vec row (blob fallback)");
    }

    #[tokio::test]
    async fn clear_failed_chunk_vectors_drops_only_that_chunks_vectors() {
        let isolated =
            IsolatedTestPool::new("clear_failed_chunk_vectors_drops_only_that_chunks_vectors");
        let pool = Arc::clone(&isolated.pool);
        let ids: Vec<i64> = {
            let conn = pool.get().expect("test db connection");
            let first: i64 = conn
                .query_row("SELECT IFNULL(MAX(id), 0) + 1 FROM spell", [], |row| {
                    row.get(0)
                })
                .expect("next spell id");
            let ids = vec![first, first + 1, first + 2];
            for id in &ids {
                conn.execute(
                    "INSERT INTO spell (id, name, level, description, content_hash) VALUES (?1, 'Spell', 1, 'Desc', ?2)",
                    rusqlite::params![id, format!("hash-clear-failed-chunk-{id}")],
                )
                .expect("insert spell");
                seed_spell_vec_row_for_test(&conn, *id);
            }
            ids
        };
        let failed_chunk: Vec<SpellEmbeddingRow> = ids[..2]
            .iter()
            .map(|id| (*id, "Spell".to_string(), "Desc".to_string()))
            .collect();

        assert!(clear_failed_chunk_vectors(Arc::clone(&pool), &failed_chunk).await);

        let conn = pool.get().expect("test db connection");
        let remaining: Vec<i64> = conn
            .prepare("SELECT rowid FROM spell_vec ORDER BY rowid")
            .expect("prepare")
            .query_map([], |row| row.get(0))
            .expect("query spell_vec")
            .collect::<Result<_, _>>()
            .expect("read rowids");
        assert_eq!(remaining, vec![ids[2]]);
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/desktop/src-tauri`): `cargo test clear_failed_chunk_vectors`
Expected: compile errors, `cannot find function clear_failed_chunk_vectors` and `mismatched types` for the `bool` second argument of `should_record_embedding_index_revision`.

- [ ] **Step 3: Implement**

Replace `should_record_embedding_index_revision` with:

```rust
fn should_record_embedding_index_revision(force: bool, stale_vectors_remain: bool) -> bool {
    force && !stale_vectors_remain
}

struct ReindexRun {
    result: ReindexResult,
    /// A forced run left vectors from an older model revision in `spell_vec`.
    stale_vectors_remain: bool,
}

/// Forced reindex only: drops a failed chunk's old vectors so they cannot outlive a
/// model revision change. Those spells then have no vector, and the next incremental
/// backfill retries them. Returns `false` when old vectors may remain.
async fn clear_failed_chunk_vectors(db: Arc<crate::db::Pool>, chunk: &[SpellEmbeddingRow]) -> bool {
    let spell_ids: Vec<i64> = chunk.iter().map(|(id, _, _)| *id).collect();
    match tokio::task::spawn_blocking(move || invalidate_spell_vec_rows_blocking(&db, &spell_ids))
        .await
    {
        Ok(Ok(())) => true,
        Ok(Err(error)) => {
            tracing::warn!(?error, "failed to clear vectors of a failed reindex chunk");
            false
        }
        Err(join_error) => {
            tracing::warn!(?join_error, "clear failed reindex chunk task failed");
            false
        }
    }
}
```

In `reindex_embeddings_internal`, replace the body from `let result = {` through the final `result` with:

```rust
    let run = {
        let _reindex_guard = ReindexInProgressGuard::try_acquire(Arc::clone(&state))?;
        run_reindex_chunks(app, Arc::clone(&state), Arc::clone(&db), force).await
    };
    if let Ok(run) = &run {
        if should_record_embedding_index_revision(force, run.stale_vectors_remain) {
            let pool = Arc::clone(&db);
            match tokio::task::spawn_blocking(move || {
                let conn = pool.get()?;
                record_embedding_index_revision(&conn)
            })
            .await
            {
                Ok(Ok(())) => {}
                Ok(Err(error)) => {
                    tracing::warn!(?error, "failed to record embedding index revision")
                }
                Err(join_error) => {
                    tracing::warn!(?join_error, "embedding index revision task failed")
                }
            }
        }
    }
    reembed_pending_spells(Arc::clone(&state), db).await;
    run.map(|run| run.result)
```

In `run_reindex_chunks`:

1. Change the return type to `Result<ReindexRun, AppError>`.
2. Replace the early return for `candidate_count == 0` with:

```rust
    if candidate_count == 0 {
        return Ok(ReindexRun {
            result: ReindexResult {
                total,
                indexed: 0,
                skipped: initial_skipped,
                failed: 0,
            },
            stale_vectors_remain: false,
        });
    }
```

3. After `let mut failed = 0_u32;`, add `let mut stale_vectors_remain = false;`.
4. Replace the whole `match tokio::task::spawn_blocking(move || { … embed_spell_texts_batch … }).await { … }` statement inside the loop with:

```rust
        let chunk_ok = match tokio::task::spawn_blocking(move || {
            let mut guard = model_for_chunk
                .lock()
                .map_err(|_| AppError::Search("embedding model lock poisoned".to_string()))?;
            embed_spell_texts_batch(&mut guard, &texts)
        })
        .await
        {
            Ok(Ok(vectors)) => match upsert_embedding_chunk(Arc::clone(&db), chunk, &vectors).await
            {
                Ok(()) => true,
                Err(error) => {
                    tracing::warn!(
                        ?error,
                        chunk_len = chunk.len(),
                        "reindex chunk upsert failed"
                    );
                    false
                }
            },
            Ok(Err(error)) => {
                tracing::warn!(?error, chunk_len = chunk.len(), "reindex chunk failed");
                false
            }
            Err(join_error) => {
                tracing::warn!(
                    ?join_error,
                    chunk_len = chunk.len(),
                    "reindex chunk join failed (non-fatal)"
                );
                false
            }
        };
        if chunk_ok {
            indexed += chunk.len() as u32;
        } else {
            failed += chunk.len() as u32;
            if force && !clear_failed_chunk_vectors(Arc::clone(&db), chunk).await {
                stale_vectors_remain = true;
            }
        }
```

5. Replace the final `Ok(ReindexResult { total, indexed, skipped, failed })` with:

```rust
    Ok(ReindexRun {
        result: ReindexResult {
            total,
            indexed,
            skipped,
            failed,
        },
        stale_vectors_remain,
    })
```

An incremental run (`force == false`) only embeds spells that have no vector, so a failed chunk there has nothing stale to clear.

- [ ] **Step 4: Run the tests and the Rust gate**

Run: `cargo test embedding_index`, then `cargo test clear_failed_chunk_vectors`, then `cargo test reindex`
Expected: all pass. The existing reindex tests must not change behavior: `ReindexResult` values are the same as before.

Run the Rust gate from Global Constraints. Expected: all exit 0.

- [ ] **Step 5: Update the revision rule in AGENTS.md**

In `apps/desktop/src-tauri/AGENTS.md`, in the `- **Embedding index revision**:` bullet, replace:

```markdown
and every forced reindex with no failures records it.
```

with:

```markdown
and every forced reindex records it once no older vectors remain. A chunk that fails in a forced reindex loses its old vectors, and the next startup's incremental backfill retries only those spells.
```

- [ ] **Step 6: Commit**

```powershell
git add apps/desktop/src-tauri/src/commands/embeddings.rs apps/desktop/src-tauri/AGENTS.md
git commit -m "fix(embeddings): failed chunks no longer force a full re-embed every startup" -m "A forced reindex clears the old vectors of chunks that fail and then records the index revision, so the next startup retries only the missing spells."
```
