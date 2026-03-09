# Design: Spell Data Migration Infrastructure

## Context

The application is adopting a canonical spell representation (Spec #1: `add-spell-canonical-hashing-foundation`) with a content hash for deduplication and integrity. Existing spell data lives in legacy string columns (e.g., `range`, `duration`, `casting_time`, `area`, `components`). Migrating thousands of spells from free text into structured JSON carries risk: incomplete parsing, data corruption, or downtime. This design describes how to implement migration infrastructure so that legacy data is parsed safely, stored alongside legacy columns (Expand and Contract), and kept in sync with rollback and admin tooling.

**Current state**: SQLite stores spells in flat columns; no `canonical_data` or `content_hash` yet. Parsers and migration logic are to be added. Spec #1 defines `CanonicalSpell` and `compute_hash()`.

**Constraints**: Non-destructive migration (no dropping legacy columns during Expand phase); dependency on Spec #1 for schema and hashing; logging and CLI must work in the existing Tauri/desktop CLI surface.

**Stakeholders**: Users (transparent upgrade, recoverable failures), developers (parser API, migration scripts, docs), and operations (admin CLI, integrity checks, backups).

## Goals / Non-Goals

**Goals:**

- Parse legacy string fields into structured JSON per `parser-specification.md` and spell schema, with fallback to `raw_legacy_value` / `.text` when parsing fails.
- Add `canonical_data` and `content_hash` columns; run hash backfill on startup for spells with NULL hash, with transaction safety and backup-before-migrate.
- Keep legacy columns and `canonical_data` in sync on every write (sync check), with discrepancies logged.
- Provide rollback: automatic backup before migration, `--restore-backup <path>`, integrity check after restore; document recovery in TROUBLESHOOTING.
- Provide admin CLI: `--recompute-hashes`, `--check-integrity`, `--detect-collisions`, `--restore-backup`, `--list-backups`; migration progress and final stats to stderr and `migration.log`.
- Log migration steps, parse failures, and collision/backfill outcomes; rotate `migration.log` (e.g., 10MB / 30 days).

**Non-Goals:**

- Defining the canonical schema or hash algorithm (Spec #1).
- UI for migration (Spec #3) or import/export (Spec #5).
- Removing legacy columns (Contract phase is future work).
- Parsing formats not specified in `parser-specification.md` beyond best-effort fallback.

## Decisions

### 1. Expand-and-Contract with dual-write and sync check

**Decision:** Add `canonical_data` and `content_hash` alongside legacy columns. On every spell write (create/update/import), populate both legacy columns and canonical JSON; run a sync check that compares legacy values to values derived from `canonical_data` and log discrepancies.

**Rationale:** Allows phased rollout and rollback without big-bang schema change. Sync check catches drift early. Specs require sync on write paths only (no read-path check).

**Alternatives considered:** (a) One-way migration then drop legacy — rejected because it blocks parallel use of old code paths. (b) Optional sync check — rejected; spec requires consistency enforcement on every update.

### 2. Backfill on startup inside a transaction with backup first

**Decision:** Before backfill, copy the DB to a timestamped backup file in the user data directory and verify backup (e.g., size/read test). Run backfill in a single transaction (iterate spells with NULL `content_hash`, parse → build CanonicalSpell → compute hash → update row); commit only if all succeed. On UNIQUE constraint on `content_hash`, roll back, log collision message, and optionally allow app to start without failing hard.

**Rationale:** Single transaction keeps DB consistent; backup allows restore without manual copy. Failing gracefully on collision lets users run `--detect-collisions` and fix data.

**Alternatives considered:** (a) Per-spell transactions — more overhead and no all-or-nothing guarantee. (b) No backup — rejected for user recoverability.

### 3. Parsers as pure functions with fallback to raw + defaults

**Decision:** Each parser (range, duration, area, casting time, components, damage, etc.) is a pure function: string in, structured object out. On parse failure, store original string in `text` / `raw_legacy_value`, use safe defaults (e.g., `base_value: 0`, `unit: "Special"`), and log spell ID + field name to migration.log. No separate “flagged” table; fallback is part of the canonical JSON.

**Rationale:** Keeps migration non-blocking and avoids data loss. Logs give admins a path to fix or extend parsers later.

**Alternatives considered:** (a) Fail migration on first unparseable string — too strict for messy legacy data. (b) Separate “needs review” table — adds schema and UI scope; out of scope.

### 4. Admin CLI as process-level flags, output to stderr and migration.log

**Decision:** Implement `--recompute-hashes`, `--check-integrity`, `--detect-collisions`, `--restore-backup <path>`, `--list-backups` (and any `--rollback-migration` / `--export-migration-report` from tasks) as Tauri/CLI arguments. Report counts and errors to stderr and append the same (or a summary) to `migration.log` so both interactive use and scripts get consistent feedback.

**Rationale:** Matches spec wording (“report to stderr and migration.log”). Single log file keeps audit trail in one place.

**Alternatives considered:** (a) Separate log per command — harder to correlate with backfill. (b) Stdout for reports — would mix with other CLI output; stderr is conventional for tooling.

### 5. Restore backup then run PRAGMA integrity_check

**Decision:** When `--restore-backup <path>` runs, copy (or replace) the active DB with the backup, open the restored DB, run `PRAGMA integrity_check`, and return an error if the result is not `"ok"`.

**Rationale:** Ensures we don’t leave the user with a corrupted file after restore. Spec explicitly requires this check.

**Alternatives considered:** (a) Skip integrity check — rejected for safety. (b) Checksum only — SQLite’s integrity_check is standard and sufficient.

### 6. Hash collision: abort backfill, log clearly, do not commit

**Decision:** If during backfill two spells produce the same `content_hash`, the UNIQUE constraint will fail. Catch that, roll back the transaction, log to migration.log and stderr that duplicate hashes exist and migration was aborted, and suggest fixing duplicates or running `--detect-collisions`. Application may still start (e.g., skip or defer backfill) so the user can fix data.

**Rationale:** Prevents committing a DB that violates the unique hash invariant. Clear message and graceful degradation improve supportability.

**Alternatives considered:** (a) Overwrite one of the hashes — would hide data bugs. (b) Crash on collision — worse UX than graceful fail + CLI fix path.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Regex/parser gaps for rare legacy strings | Fallback: store raw string in JSON, log failure; no data loss. Extend parsers later. |
| Backfill duration on very large libraries | Log progress every N spells; run in transaction so one commit at end; consider future “background” chunked run if needed. |
| Sync check false positives (round-trip differences) | Normalize when writing canonical from legacy so comparison is consistent; log only when values actually differ. |
| Backup disk space | Single timestamped backup before backfill; document location and `--list-backups`; user can prune old backups. |
| SQLite DDL (ADD COLUMN) outside transaction on some setups | Where supported, run schema changes in a transaction; otherwise document and rely on backup + restore for rollback. |
| True hash collision (different content, same hash) | Spec and tasks require `--detect-collisions` to compare `canonical_data` and report “True hash collision”; fix data or hash algorithm if ever found. |

## Migration Plan

1. **Schema (Expand)**  
   Apply `ALTER TABLE spell ADD COLUMN canonical_data TEXT` and `ADD COLUMN content_hash TEXT`; create unique partial index `ON spell(content_hash) WHERE content_hash IS NOT NULL`. Run after or as part of app startup/migration runner; backup DB before schema change if not already covered by backfill backup.

2. **Deploy code**  
   Ship parser module, backfill logic, sync check on write paths, backup/restore, and CLI flags. Ensure Spec #1 (`CanonicalSpell`, `compute_hash`) is present.

3. **First run (backfill)**  
   On startup, if any spell has `content_hash IS NULL`: create timestamped backup, then in one transaction parse legacy → build CanonicalSpell → compute hash → UPDATE. Commit; log progress every 100 spells and final stats (processed, updated, parse fallback count, hash failure count). On unique constraint failure, roll back and log collision message.

4. **Ongoing**  
   All spell writes go through dual-write + sync check. Admins can use `--recompute-hashes`, `--check-integrity`, `--detect-collisions`, `--restore-backup`, `--list-backups` as needed.

5. **Rollback**  
   If migration or backfill causes issues: use `--restore-backup <path>` to restore from the timestamped backup; integrity check runs automatically. Document in TROUBLESHOOTING.md. No automatic rollback of schema (columns remain); Contract phase (dropping legacy columns) is future work.

## Open Questions

- **Log rotation**: Exact policy (10MB and/or 30 days) and naming of rotated file (e.g. `migration.log.old`) — confirm against existing logging in the app.
- **`--rollback-migration` vs `--restore-backup`**: Tasks mention both; clarify whether rollback is an alias for “restore latest backup” or a separate flow.
- **Chunked backfill**: If libraries grow very large, whether to add a mode that processes spells in chunks (e.g., 1000 at a time) with intermediate commits to avoid long-running transactions; can be deferred until needed.
