# Task 4 Three-Pass Code Review (Vault Implementation)

Date: 2026-03-10
Spec: `openspec/changes/integrate-spell-hashing-ecosystem` (Task 4: Vault Implementation)
Scope: Vault storage, integrity/recovery, GC/import coordination, backup/restore, frontend maintenance UI, and Task 4 test coverage.

## Review Units

- Unit A: Vault backend primitives and integrity/file-layout logic
- Unit B: Transactionality, restore behavior, import/GC coordination, and long-running command behavior
- Unit C: Frontend vault UX, IPC wiring, and automated coverage

## Findings

### 1. [FIXED] Restore path is vulnerable to zip-slip writes outside the vault root

- Evidence: `restore_supporting_files_from_archive()` accepts any entry whose name is `vault-settings.json` or starts with `spells/`, then writes it with `data_dir.join(Path::new(&entry_name))` without rejecting `..`, root, or prefix components.
- References:
  - `apps/desktop/src-tauri/src/commands/vault.rs:241`
  - `apps/desktop/src-tauri/src/commands/vault.rs:258`
  - `apps/desktop/src-tauri/src/commands/vault.rs:262`
- Impact: A crafted backup can write outside `SpellbookVault` via entries such as `spells/../../somewhere/else`, which turns restore into an arbitrary file overwrite primitive on the local machine.
- Status: **FIXED**. Path validation now rejects parent, root, and prefix components, and enforces staging directory boundaries.
- Recommendation: Normalize archive paths component-by-component and reject anything containing `ParentDir`, `RootDir`, or `Prefix`. After building the destination, enforce that it remains under `data_dir`. Restrict restored spell payloads to expected `.json` files under `spells/`.

### 2. [FIXED] Restore is not atomic across DB and supporting files

- Evidence: `restore_vault()` extracts `vault-settings.json` and `spells/` into the live vault before the SQLite restore runs. If `Backup::run_to_completion()` or the subsequent integrity check fails, the supporting files have already been overwritten while the database may still be the old one.
- References:
  - `apps/desktop/src-tauri/src/commands/vault.rs:800`
  - `apps/desktop/src-tauri/src/commands/vault.rs:803`
  - `apps/desktop/src-tauri/src/commands/vault.rs:813`
  - `apps/desktop/src-tauri/src/commands/vault.rs:818`
- Impact: A failed restore can leave the vault in a mixed state: old DB plus new spell files/settings. That is a real data-integrity failure for the content-hash model and will be hard for users to reason about.
- Status: **FIXED**. Implementation now uses staging directories and backup `.old` files to ensure atomicity and rollback on failure.
- Recommendation: Stage restored supporting files in a temp directory and swap them into place only after DB restore and integrity verification succeed. Alternatively, restore into a staged vault root and atomically replace the whole vault on success.

### 3. [FIXED] Backup and restore run heavy file/SQLite work on the command thread

- Evidence: `backup_vault()` and `restore_vault()` are async Tauri commands but do not use `tokio::task::spawn_blocking`, unlike the other vault maintenance commands.
- References:
  - `apps/desktop/src-tauri/src/commands/vault.rs:679`
  - `apps/desktop/src-tauri/src/commands/vault.rs:746`
  - `apps/desktop/src-tauri/src/commands/vault.rs:649`
  - `apps/desktop/src-tauri/src/commands/vault.rs:663`
- Impact: Large backups/restores can block the Tauri runtime and freeze the UI during long file copies, zip operations, and SQLite backup/restore work.
- Status: **FIXED**. Both commands now use `spawn_blocking`.
- Recommendation: Move both commands into `spawn_blocking` and keep the command body to argument capture and result mapping. That matches the backend guidance already followed by `run_vault_integrity_check()` and `optimize_vault()`.

## Pass Notes

### Pass 1: Unit A

- Verified the hash-addressed storage contract is implemented as `spells/{content_hash}.json`.
- Verified write-time integrity uses canonical spell hashing rather than raw file bytes.
- Verified integrity check attempts recovery from `canonical_data` and records unrecoverable rows instead of crashing when `canonical_data` is NULL.
- Main issue from this pass: restore extraction path validation is insufficient.

### Pass 2: Unit B

- Verified import/GC mutual exclusion is implemented with `VaultMaintenanceState`, `start_import()`, and `start_gc()`.
- Verified post-import GC goes through `run_vault_gc_with_root()`, so integrity runs before deletion.
- Verified import code writes pending vault files before commit and cleans them up on commit failure.
- Main issues from this pass:
  - restore is not atomic across DB and supporting files
  - backup/restore are still long-running synchronous command bodies

### Pass 3: Unit C

- Verified frontend exposes manual integrity check, optimize-vault action, and the `vault.integrityCheckOnOpen` setting.
- Verified optimize is disabled in the UI when import activity is active.
- Startup warning/failure modal helpers are covered by unit tests.
- Coverage is still skewed toward happy paths:
  - `apps/desktop/tests/vault.spec.ts:10` only exercises successful backup and restore
  - there is no backend or E2E test for malicious zip entries
  - there is no restore-failure test proving rollback of supporting files

## Suggested Follow-up

1. [RESOLVED] Fix zip path validation in `restore_supporting_files_from_archive()`.
2. [RESOLVED] Make restore transactional at the vault-directory level, not just the SQLite level.
3. [RESOLVED] Move `backup_vault()` and `restore_vault()` into `spawn_blocking`.
4. [RESOLVED] Add backend tests for zip-slip rejection and partial-restore rollback.
5. Expand Playwright E2E tests to cover malicious ZIP entries and restore-failure rollback (UI-level verification).
