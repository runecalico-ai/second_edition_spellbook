# Task 4 Three-Pass Code Review (Vault Implementation)

Date: 2026-03-08
Spec: `openspec/changes/integrate-spell-hashing-ecosystem` (Task 4: Vault Implementation — user-facing controls, settings, backup/restore)
Scope: Vault backend primitives, integrity/recovery/GC, import/GC coordination, spell update cascades, migration 0015, character/artifact hash refs, import atomicity, backup/restore, frontend vault UI and startup integration.

## Pass Scope

- **Pass 1 (Unit A):** Vault backend primitives, integrity hashing, file layout `spells/{content_hash}.json`, canonical write/read.
- **Pass 2 (Unit B):** Recovery, GC, import/GC concurrency guard, spell update savepoints and hash cascades, migration 0015 backfill, import vault-write-first atomicity.
- **Pass 3 (Unit C):** UI settings (`vault.integrityCheckOnOpen`), maintenance dialog (Optimize Vault, integrity summary), startup integrity-check UX, IPC and `data-testid` coverage.

## Findings Addressed This Session

1. **Atomicity:** Spell updates and imports now run DB work and vault writes in a single transactional boundary (savepoints / vault-write-before-commit). Rollback on vault or validation failure; no partial commits.
2. **Hash cascades:** `apply_spell_update_with_conn` cascades `spell_content_hash` to `character_class_spell` and `artifact` when columns exist; migration 0015 backfills and adds indexes.
3. **Import:** JSON and legacy import paths use `write_pending_vault_files` before commit; legacy path uses `run_legacy_import_chunk_with_vault_writes`; cleanup on commit failure.
4. **Backup/restore:** Backup includes `spells/` and `vault-settings.json`; restore extracts them then runs DB restore and `run_vault_integrity_check_with_root` (after dropping backup handle to avoid borrow conflict).
5. **ID fidelity / path contract:** Import and vault paths preserve content_hash as file identity; Windows path-length handling documented and warned where applicable.
6. **Frontend:** Vault maintenance dialog tests and startup warning/failure modal tests added; Optimize Vault disabled while import in progress.

## Residual Risks

- E2E coverage for full backup → restore → integrity flow is not yet added; manual verification recommended.
- Performance benchmarks (e.g. GC for 10k files, FTS rebuild) are in verification plan but not automated in this change.

## Verification

- Backend: `cargo check` and `cargo test` (326+ tests) passed in worktree.
- Frontend: `pnpm --dir apps/desktop run typecheck` and `pnpm --dir apps/desktop run test:unit` (87 tests) passed.
- Format: `pnpm --dir apps/desktop format:check` to be run as part of Task 6.
