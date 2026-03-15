# Artifact Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Complete Task 6 of `integrate-spell-hashing-ecosystem` so artifact spell references fully participate in the content-hash ecosystem during the Migration 0015 dual-column period.

**Architecture:** Reuse the Task 5 dual-column transition pattern for artifacts: keep `artifact.spell_id` for rollback and legacy compatibility, but make `artifact.spell_content_hash` the authoritative lookup key for application reads and vault-reference safety. Treat this as a finish-and-harden task, not a greenfield build: Migration 0015, import-side dual writes, and replace cascades already exist, so the work is to close remaining read-path gaps, align helpers, and prove behavior with focused regression coverage.

**Tech Stack:** Rust/Tauri, rusqlite, SQLite migrations, existing spell/artifact backend models, cargo test.

---

## Current Baseline

- Migration 0015 already adds and backfills `artifact.spell_content_hash` and creates `idx_artifact_spell_content_hash`.
- Import conflict replacement already cascades `artifact.spell_content_hash` from old spell hash to new spell hash in `apps/desktop/src-tauri/src/commands/import.rs`.
- Import artifact upserts already populate `spell_content_hash` when the column exists.
- Spell update tests already assert artifact hash cascades during spell mutation.
- Remaining visible gap: `apps/desktop/src-tauri/src/commands/spells.rs` still loads attached artifacts by `artifact.spell_id = ?`, which means artifact reads are not yet hash-first as required by the artifact spec.

## File Map

**Likely modify:**
- `db/migrations/0015_add_hash_reference_columns.sql`
- `apps/desktop/src-tauri/src/db/migrations.rs`
- `apps/desktop/src-tauri/src/commands/spells.rs`
- `apps/desktop/src-tauri/src/commands/import.rs`
- `apps/desktop/src-tauri/src/commands/vault.rs`
- `apps/desktop/src-tauri/src/models/spell.rs`
- `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md`
- `openspec/changes/integrate-spell-hashing-ecosystem/review-task-6_2026_03_13_three-pass.md`

**May modify if audit finds direct artifact readers/writers outside the main path:**
- `apps/desktop/src-tauri/src/commands/io_character.rs`
- `apps/desktop/src-tauri/src/commands/export.rs`

**Primary verification targets:**
- `cargo test db::migrations::tests::`
- `cargo test spells::`
- `cargo test import::`
- `cargo test vault::`

## Chunk 1: Migration And Contract Audit

### Task 1: Freeze The Artifact Migration Contract

**Subagent Unit:** Migration contract reviewer

**Files:**
- Modify: `db/migrations/0015_add_hash_reference_columns.sql`
- Modify: `apps/desktop/src-tauri/src/db/migrations.rs`
- Test: `apps/desktop/src-tauri/src/db/migrations.rs`
- Reference: `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md`
- Reference: `openspec/changes/integrate-spell-hashing-ecosystem/design.md`
- Reference: `openspec/changes/integrate-spell-hashing-ecosystem/specs/artifacts/spec.md`

- [x] **Step 1: Read the current 0015 artifact behavior before changing code**

Confirm all of the following in the existing code:

```sql
UPDATE artifact
SET spell_content_hash = (
    SELECT spell.content_hash
    FROM spell
    WHERE spell.id = artifact.spell_id
)
WHERE spell_content_hash IS NULL
  AND spell_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_artifact_spell_content_hash
ON artifact(spell_content_hash)
WHERE spell_content_hash IS NOT NULL;
```

Expected outcome:
- column exists only when missing
- backfill does not overwrite pre-populated values
- orphan `spell_id` rows keep `spell_content_hash` as `NULL`
- partial index name matches the spec

- [x] **Step 2: Add or tighten migration tests only where coverage is missing**

Required scenarios:
- backfill sets `artifact.spell_content_hash` from `spell.content_hash`
- orphan `artifact.spell_id` leaves `spell_content_hash` null
- existing non-null `artifact.spell_content_hash` is preserved on rerun
- `idx_artifact_spell_content_hash` exists after `load_migrations`

Run: `cargo test db::migrations::tests:: --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS with explicit artifact assertions, not just character spell list assertions.

- [x] **Step 3: Keep SQL and Rust comments aligned with Decision #5**

Add a short SQL or Rust comment clarifying:
- `artifact.hash` is the artifact file hash
- `artifact.spell_content_hash` is the referenced spell canonical hash

- [x] **Step 4: Commit the migration-contract tightening**

```bash
git add db/migrations/0015_add_hash_reference_columns.sql apps/desktop/src-tauri/src/db/migrations.rs
git commit -m "test: harden artifact hash migration contract"
```

## Chunk 2: Artifact Read Path And Dual-Column Behavior

### Task 2: Make Artifact Reads Hash-First

**Subagent Unit:** Backend artifact reader

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/spells.rs`
- Modify: `apps/desktop/src-tauri/src/models/spell.rs`
- Test: `apps/desktop/src-tauri/src/commands/spells.rs`
- Reference: `openspec/changes/integrate-spell-hashing-ecosystem/specs/artifacts/spec.md`

- [x] **Step 1: Write failing tests for spell detail artifact loading**

Add tests covering:
- artifact row with `spell_content_hash` populated and stale or null `spell_id`
- artifact row whose `spell_id` points at the current spell but whose `spell_content_hash` points somewhere else must not leak into the current spell detail
- legacy fallback case where `spell_content_hash` is null and `spell_id` still resolves

Sketch the desired query behavior:

```sql
SELECT id, spell_id, type, path, hash, imported_at
FROM artifact
WHERE
    (spell_content_hash IS NOT NULL AND spell_content_hash = ?)
    OR (spell_content_hash IS NULL AND spell_id = ?);
```

Run: `cargo test spells:: --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: FAIL because current implementation only uses `WHERE spell_id = ?`.

- [x] **Step 2: Update `get_spell_from_conn` to prefer `content_hash`**

Implementation rules:
- read the spell row first
- if `spell.content_hash` is present, load artifacts by `artifact.spell_content_hash = spell.content_hash`
- allow fallback to `artifact.spell_id = spell.id` only for transitional rows where `artifact.spell_content_hash IS NULL`
- do not return duplicate artifact rows when both columns match
- do not include artifacts whose `spell_id` still matches but whose `spell_content_hash` now belongs to a different spell

- [x] **Step 3: Decide whether `SpellArtifact` needs transition metadata**

Audit whether the frontend or IPC needs any additional fields such as:
- `spell_content_hash`
- `missing_from_library`

Default recommendation:
- keep the existing `SpellArtifact` payload unchanged unless a concrete consumer needs the new field now
- prefer backend correctness over expanding the IPC surface unnecessarily

- [x] **Step 4: Re-run focused tests**

Run: `cargo test spells:: --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS for hash-first reads, legacy fallback, and no duplicate artifact rows.

- [x] **Step 5: Commit the read-path change**

```bash
git add apps/desktop/src-tauri/src/commands/spells.rs apps/desktop/src-tauri/src/models/spell.rs
git commit -m "feat: load spell artifacts by content hash"
```

### Task 3: Audit Remaining Artifact Writers And Replace Paths

**Subagent Unit:** Backend artifact writer auditor

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/import.rs`
- Modify: `apps/desktop/src-tauri/src/commands/spells.rs`
- Modify: `apps/desktop/src-tauri/src/commands/vault.rs`
- Test: `apps/desktop/src-tauri/src/commands/import.rs`
- Test: `apps/desktop/src-tauri/src/commands/spells.rs`

- [x] **Step 1: Enumerate every direct artifact write path**

Audit at minimum:
- `upsert_import_artifact` in `commands/import.rs`
- spell update / upsert paths in `commands/spells.rs`
- any vault GC queries that treat artifact hash references as liveness roots

Expected result:
- every new or updated artifact row writes both `spell_id` and `spell_content_hash` during the migration period
- replace flows update `artifact.spell_content_hash`
- vault GC reads `artifact.spell_content_hash`
- if an artifact-centric read path exists outside `spells.rs`, it handles missing referenced spells gracefully and does not crash

- [x] **Step 2: Add failing tests only for uncovered gaps**

Candidate tests:
- spell CRUD path updates `artifact.spell_content_hash` when spell hash changes
- import upsert updates both columns on existing artifact rows
- replace rollback restores artifact hash when downstream failure occurs

Run: `cargo test import:: spells:: vault:: --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: FAIL only if a real uncovered path exists.

- [x] **Step 3: Implement the minimal fixes for any audited gap**

Keep changes small:
- no new dependencies
- no schema churn beyond Task 6 scope
- no artifact-only abstraction layer unless duplication becomes unmanageable

- [x] **Step 4: Re-run focused backend tests**

Run: `cargo test import:: spells:: vault:: --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS with artifact dual-column assertions.

- [x] **Step 5: Commit only if real code changed**

```bash
git add apps/desktop/src-tauri/src/commands/import.rs apps/desktop/src-tauri/src/commands/spells.rs apps/desktop/src-tauri/src/commands/vault.rs
git commit -m "test: close artifact hash write-path gaps"
```

## Chunk 3: Verification And Review Gate

### Task 4: Verify Task 6 End-To-End

**Subagent Unit:** Verification runner

**Files:**
- Review: `apps/desktop/src-tauri/src/db/migrations.rs`
- Review: `apps/desktop/src-tauri/src/commands/spells.rs`
- Review: `apps/desktop/src-tauri/src/commands/import.rs`
- Review: `apps/desktop/src-tauri/src/commands/vault.rs`

- [x] **Step 1: Run the migration test suite**

Run: `cargo test db::migrations::tests:: --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS

- [x] **Step 2: Run artifact-focused spell tests**

Run: `cargo test spells:: --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS

- [x] **Step 3: Run import and vault regressions that touch artifact hash references**

Run: `cargo test import:: --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS

Run: `cargo test vault:: --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS

- [x] **Step 4: Run a final broad safety pass**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS

### Task 5: Three-Pass Review Before Marking Task 6 Complete

**Subagent Unit:** Review controller

**Files:**
- Modify: `openspec/changes/integrate-spell-hashing-ecosystem/review-task-6_2026_03_13_three-pass.md`
- Modify: `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md`

- [x] **Step 1: Pass 1, spec-compliance review**

Review against:
- `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md`
- `openspec/changes/integrate-spell-hashing-ecosystem/design.md`
- `openspec/changes/integrate-spell-hashing-ecosystem/specs/artifacts/spec.md`

Checklist:
- `artifact.spell_content_hash` migration/backfill/index exists
- application reads use `spell_content_hash` and do not rely on `spell_id`
- missing spell references are handled gracefully
- dual-column migration-period writes remain intact

- [x] **Step 2: Pass 2, backend correctness review**

Focus:
- stale `spell_id` tolerance
- no duplicate artifact loading
- rollback behavior on replace/write failures
- vault GC safety with `artifact.spell_content_hash`
- no accidental regression of legacy fallback behavior

- [x] **Step 3: Pass 3, test-and-maintainability review**

Focus:
- tests prove the real spec contract instead of implementation trivia
- migration tests remain idempotent and isolated
- query logic is readable enough to survive the future `spell_id` removal migration
- comments clearly distinguish `artifact.hash` vs `artifact.spell_content_hash`

- [x] **Step 4: Save the review artifact**

Use this structure:
- task checklist
- findings by pass
- fixes made
- residual risks
- final recommendation

Suggested file:
- `openspec/changes/integrate-spell-hashing-ecosystem/review-task-6_2026_03_13_three-pass.md`

- [x] **Step 5: Only then mark Task 6 complete**

Update:
- `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md`

Mark complete:
- `6.1 Migrate artifact spell references to content hash (Migration 0015)`

Commit:

```bash
git add openspec/changes/integrate-spell-hashing-ecosystem/tasks.md openspec/changes/integrate-spell-hashing-ecosystem/review-task-6_2026_03_13_three-pass.md
git commit -m "docs: close artifact integration task"
```

## Subagent Dispatch Order

1. Task 1 `Migration contract reviewer`
2. Task 2 `Backend artifact reader`
3. Task 3 `Backend artifact writer auditor`
4. Task 4 `Verification runner`
5. Task 5 `Review controller`

## Review Units For The Final Three-Pass Code Review

1. Unit A: Migration 0015 artifact contract
2. Unit B: Spell-detail artifact read path
3. Unit C: Import/update/vault regression safety

## Controller Notes

- Do not run implementation subagents in parallel; `spells.rs`, `import.rs`, and migration tests are coupled.
- Fresh reviewer context matters more than speed; provide each reviewer only the changed files plus the artifact spec/design excerpts.
- Treat existing Task 5 work as a pattern to reuse, not as a reason to broaden scope into character UI work.
- Do not add dependencies without explicit approval and dependency provenance review.
- Resist refactoring `SpellArtifact` or artifact-related IPC unless a failing test or concrete consumer requires it.

Plan complete and saved to `docs/superpowers/plans/2026-03-13-artifact-integration-integrate-spell-hashing-ecosystem.md`. Ready to execute?
