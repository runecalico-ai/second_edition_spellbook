# Installer Review Fixes, Part 4: Race-Free Vault Cleanup on Spell Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deleting a spell never removes a vault file that a concurrent import has just made live again, and it never makes a concurrent import fail with "Vault optimization is currently in progress".

**Architecture:** `VaultMaintenanceState` gets `with_idle_lock`. The method holds the maintenance-phase mutex while a short closure runs, and only when no import or GC is active. `delete_spell_with_conn` moves its liveness check and its `remove_file` into that closure. The check and the delete then happen together with respect to import and GC start. An import that starts at the same time waits a few milliseconds on the mutex instead of failing, because delete no longer switches the phase to `Gc`.

**Tech Stack:** Rust (Tauri 2), rusqlite, `std::sync::Mutex`, `std::thread::scope` (test only).

**Series:** Code review of `add-cross-platform-installers` on 2026-11-04. This plan fixes finding 4. Part 1 fixes 1, Part 2 fixes 2 and 5, Part 3 fixes 3, Part 5 fixes 6 and 7. The parts are independent.

## Global Constraints

- Base: branch `add-cross-platform-installers` at `aaeea8b` or later. Do not push.
- No new or upgraded dependencies (`docs/DEPENDENCY_SECURITY.md`).
- Do not change `start_import`, `start_gc`, or the error messages they return. Optimize Vault and import keep their current exclusive behavior.
- The closure passed to `with_idle_lock` must stay short (one query plus one file removal). Imports and GC block on the mutex while it runs.
- Rust gate, from `apps/desktop/src-tauri`, before each commit: `cargo fmt -- --check`, `cargo clippy --all-targets -- -D warnings`, `cargo clippy --no-default-features -- -D warnings`, `cargo test`.
- PowerShell does not support bash heredocs. Use `git commit -m "<subject>" -m "<body>"`.
- `.gitattributes` sets `eol=lf`. Keep LF line endings in edited files.
- Write a code comment only for a constraint the code cannot show.
- Out of scope: `create_spell` / `update_spell` write vault files without the maintenance state; the existing deferred GC has the same exposure. Do not change them here.

## Root cause (verified 2026-11-05 on `aaeea8b`)

`delete_spell_with_conn` in `apps/desktop/src-tauri/src/commands/spells.rs` (lines 995–1040):

1. It runs `is_content_hash_live(conn, &hash)` before it takes `maintenance.start_gc()`. An import can start, write the same `spells/{hash}.json`, insert a row with that hash, and finish between the two calls. Delete then removes a file that a live row needs.
2. While it holds the `Gc` guard, `start_import` returns `AppError::Import("Vault optimization is currently in progress.")`. A user who starts an import while a delete is running sees that error, although they never ran Optimize Vault.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/desktop/src-tauri/src/commands/vault.rs` | `VaultMaintenanceState::with_idle_lock` and its tests | 1 |
| `apps/desktop/src-tauri/src/commands/spells.rs` | `delete_spell_with_conn` checks liveness and removes the file under the lock | 1 |
| `docs/TROUBLESHOOTING.md` | Vault maintenance: deleting a spell removes its unreferenced file | 1 |

---

### Task 1: Check liveness and remove the file under the maintenance lock

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/vault.rs` (`impl VaultMaintenanceState`, lines 422–470; tests next to `test_maintenance_state_blocks_import_while_gc_active`, around line 1497)
- Modify: `apps/desktop/src-tauri/src/commands/spells.rs` (`delete_spell_with_conn`, lines 1023–1039; tests after `test_delete_spell_with_conn_defers_cleanup_while_import_runs`)
- Modify: `docs/TROUBLESHOOTING.md` (the `- **Optimize Vault (GC):**` bullet)

**Interfaces:**
- Consumes: `VaultMaintenanceState { phase: Mutex<VaultMaintenancePhase> }`, `VaultMaintenancePhase::{Idle, Import, Gc}`, `is_content_hash_live(conn, hash) -> Result<bool, AppError>`, `spell_file_path_in_root(root, hash) -> PathBuf` (all in `vault.rs`).
- Produces: `pub(crate) fn with_idle_lock<T>(&self, f: impl FnOnce() -> Result<T, AppError>) -> Result<Option<T>, AppError>` on `VaultMaintenanceState`. It returns `Ok(None)` without running `f` when an import or GC is active.

- [ ] **Step 1: Write the failing tests**

In the `tests` module of `vault.rs`, after `test_maintenance_state_blocks_import_while_gc_active`, add:

```rust
    #[test]
    fn test_with_idle_lock_skips_while_import_active() {
        let maintenance_state = VaultMaintenanceState::default();
        let _import_guard = maintenance_state.start_import().expect("start import");

        let ran = maintenance_state
            .with_idle_lock(|| Ok(()))
            .expect("lock maintenance state");

        assert!(
            ran.is_none(),
            "closure must not run while an import is active"
        );
    }

    #[test]
    fn test_with_idle_lock_makes_concurrent_import_wait_instead_of_fail() {
        let maintenance_state = VaultMaintenanceState::default();
        std::thread::scope(|scope| {
            let mut import = None;
            maintenance_state
                .with_idle_lock(|| {
                    import = Some(scope.spawn(|| maintenance_state.start_import().map(drop)));
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    assert!(
                        !import.as_ref().expect("import thread").is_finished(),
                        "import must wait for the lock"
                    );
                    Ok(())
                })
                .expect("lock maintenance state")
                .expect("maintenance state is idle");
            import
                .expect("import thread")
                .join()
                .expect("import thread panicked")
                .expect("import starts once the lock is released");
        });
    }
```

In the `tests` module of `spells.rs`, after `test_delete_spell_with_conn_defers_cleanup_while_import_runs`, add:

```rust
    #[test]
    fn test_delete_spell_with_conn_leaves_maintenance_idle() {
        let root = tempfile::tempdir().expect("vault root");
        let conn = setup_spell_delete_test_db();
        seed_vaulted_spell(&conn, root.path(), 1, "Brief Spell");
        let maintenance = VaultMaintenanceState::default();

        delete_spell_with_conn(&conn, root.path(), &maintenance, 1).expect("delete spell");

        maintenance
            .start_import()
            .expect("an import can start right after a delete");
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/desktop/src-tauri`): `cargo test with_idle_lock`
Expected: compile error, `no method named with_idle_lock found for struct VaultMaintenanceState`.

- [ ] **Step 3: Add `with_idle_lock`**

In `vault.rs`, inside `impl VaultMaintenanceState`, after `start_gc`, add:

```rust
    /// Runs `f` while holding the phase lock, only when no import or GC is active.
    /// Imports and GC that start meanwhile wait for `f` instead of failing, so keep
    /// `f` short.
    pub(crate) fn with_idle_lock<T>(
        &self,
        f: impl FnOnce() -> Result<T, AppError>,
    ) -> Result<Option<T>, AppError> {
        let phase = self
            .phase
            .lock()
            .map_err(|_| AppError::Unknown("Vault maintenance state is poisoned".to_string()))?;
        if *phase != VaultMaintenancePhase::Idle {
            return Ok(None);
        }
        f().map(Some)
    }
```

Run: `cargo test with_idle_lock`
Expected: 2 passed.

- [ ] **Step 4: Move the liveness check and file removal under the lock**

In `spells.rs` `delete_spell_with_conn`, replace everything from `if is_content_hash_live(conn, &hash)? {` through the end of the function with:

```rust
    let cleanup = maintenance.with_idle_lock(|| {
        if is_content_hash_live(conn, &hash)? {
            return Ok(());
        }
        let path = spell_file_path_in_root(vault_root, &hash);
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
}
```

The malformed-hash guard above it (`is_well_formed_content_hash`) stays where it is, outside the lock.

- [ ] **Step 5: Run the delete and maintenance tests, then the Rust gate**

Run: `cargo test delete_spell_with_conn`
Expected: 6 passed (the 5 existing `test_delete_spell_with_conn_*` tests plus `test_delete_spell_with_conn_leaves_maintenance_idle`). `test_delete_spell_with_conn_defers_cleanup_while_import_runs` must still pass: `with_idle_lock` returns `None` while the import guard is held.

Run: `cargo test maintenance_state`
Expected: the existing import/GC exclusion tests still pass.

Run the Rust gate from Global Constraints. Expected: all exit 0.

- [ ] **Step 6: Document the delete cleanup**

In `docs/TROUBLESHOOTING.md`, directly after the `- **Optimize Vault (GC):** …` bullet, insert:

```markdown
- **Deleting a spell:** Also removes that spell's file from `spells/` when no other spell, artifact, or character entry uses the same content hash. If an import or Optimize Vault is running at that moment, the file stays until the next GC.
```

- [ ] **Step 7: Commit**

```powershell
git add apps/desktop/src-tauri/src/commands/vault.rs apps/desktop/src-tauri/src/commands/spells.rs docs/TROUBLESHOOTING.md
git commit -m "fix(vault): delete-spell cleanup checks liveness under the maintenance lock" -m "Closes the window where an import could make the hash live between the check and remove_file, and stops delete from failing concurrent imports with 'Vault optimization is currently in progress'."
```
