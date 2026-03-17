# Tasks 1-4 Three-Pass In-Depth Code Review (Subagent-Oriented)

Date: 2026-03-10
Spec: `openspec/changes/integrate-spell-hashing-ecosystem`
Scope: Tasks 1-4 only

## Review Method

This review was executed as four task-level review tracks, each split into three small logical subagent units:

- Task 1 subagents
  - A: FTS migration and trigger contract
  - B: Search query builder and runtime SQL
  - C: Search tests and verification coverage
- Task 2 subagents
  - A: Import parse/normalize/version/hash pipeline
  - B: Dedup/conflict/replace semantics and transaction boundaries
  - C: Export contract and automated coverage
- Task 3 subagents
  - A: Conflict UI flow and state machine
  - B: Backend conflict-application semantics
  - C: E2E coverage and model coherence
- Task 4 subagents
  - A: Vault file layout and integrity primitives
  - B: Restore/backup/GC/import coordination and failure behavior
  - C: Frontend vault UX and automated coverage

Each task was reviewed in three passes:

1. Spec compliance
2. Correctness and regression risk
3. Implementation readiness and tests

## Verification Status

- Current code was spot-checked directly in:
  - `db/migrations/0014_fts_extend_canonical.sql`
  - `apps/desktop/src-tauri/src/commands/search.rs`
  - `apps/desktop/src-tauri/src/commands/import.rs`
  - `apps/desktop/src-tauri/src/commands/export.rs`
  - `apps/desktop/src/ui/ImportWizard.tsx`
  - `apps/desktop/src/ui/components/SpellConflictDiffDialog.tsx`
  - `apps/desktop/src/ui/components/BulkConflictSummaryDialog.tsx`
  - `apps/desktop/src-tauri/src/commands/vault.rs`
  - `apps/desktop/tests/import_conflict_resolution.spec.ts`
- Fresh Rust test execution was attempted but blocked in this shell because `cargo` is not available on PATH in the current environment.
- Where prior task review files already recorded passing test runs, those results are noted as historical evidence, not fresh verification.

## Findings

### No new blocking implementation defects were found in Tasks 1-4 during this review pass.

The previously documented high/medium issues for Tasks 1-4 appear fixed in the current codebase. The remaining items are implementation-readiness and coverage gaps, not clear correctness defects.

## Task 1: Search Implementation

### Pass 1: Spec Compliance

- Migration `0014_fts_extend_canonical.sql` satisfies the required recreate-and-repopulate pattern.
- Delete and update triggers correctly use `old.*` plus `json_extract(old.canonical_data, ...)`, closing the stale-index bug.
- Search uses `MATCH ?`, not string concatenation, and relevance ordering is wired through `bm25(spell_fts)`.
- Advanced/basic mode fallback logic in `search.rs` now correctly rejects malformed leading and trailing operators.

### Pass 2: Correctness

- The `LIKE`-filter wildcard escaping fix is present across the filter branches.
- The `col` prefix handling is consistently applied for the FTS join path.
- Empty-query handling uses the non-FTS branch and avoids malformed MATCH calls.

### Pass 3: Readiness

- Search tests now cover the previously missing single-token case, malformed operator fallback, empty-query handling, and trigger lifecycle behavior.

Residual follow-up:

1. There is still no explicit assertion for BM25 ordering behavior. The query orders by relevance, but the observable ranking contract is not directly pinned by a test.
2. Trigger lifecycle tests primarily exercise `canonical_range_text`; the other canonical text columns are covered indirectly by SQL symmetry rather than column-specific tests.

Assessment:

- Task 1 is implementation-ready.

## Task 2: Import/Export

### Pass 1: Spec Compliance

- Import pipeline ordering in `import.rs` matches the spec sequence: parse/classify, metadata normalization, schema/version checks, migration/normalize, recompute hash, then dedup/conflict handling.
- Same-hash dedup and same-name/different-hash conflict handling align with the current spec.
- Export uses `content_hash` as exported `id`, includes `schema_version`, and includes `bundle_format_version` only for bundle exports.

### Pass 2: Correctness

- Replace-with-new is transactional and performs cascading `spell_content_hash` updates for `character_class_spell` and `artifact` when those columns exist.
- Keep-both suffix generation is name-global rather than level-scoped.
- Replace collision messaging now reports the conflicting spell and guides the user toward alternative actions.

### Pass 3: Readiness

- Backend tests now cover key apply-path branches, rollback behavior, and export rejection for NULL hash / invalid canonical JSON.

Residual follow-up:

1. I did not find current end-to-end coverage for the full export -> re-import round trip described in the verification plan. Backend behavior is covered; user-level interoperability is still a higher-level gap.
2. Current evidence for Task 2 test health in this review is static plus historical. Fresh `cargo test` execution was blocked by missing `cargo` in the shell.

Assessment:

- Task 2 is implementation-ready, with remaining work mainly in broader workflow verification.

## Task 3: Import Conflict Resolution UI

### Pass 1: Spec Compliance

- The UI presents the required per-conflict actions: Keep Existing, Replace with New, Keep Both, and Apply to All.
- The bulk threshold flow is implemented at `>= 10` conflicts with Skip All, Replace All, Keep All, and Review Each.
- Progress text is present as `Conflict X of Y`.

### Pass 2: Correctness

- Bulk action mapping is explicit and correct:
  - `skip_all -> keep_existing`
  - `replace_all -> replace_with_new`
  - `keep_all -> keep_both`
- Review Each correctly falls through into the per-conflict dialog path.
- Apply to All correctly expands from the current conflict through the remaining conflicts.

### Pass 3: Readiness

- The Playwright suite now covers the missing bulk branches: Skip All, Keep All, and Review Each.
- The current UI/backend contract remains coherent with the documented name-only conflict semantics.

Residual follow-up:

1. Field-level highlighting remains intentionally unavailable because the JSON conflict payload carries names and hashes, not a structured field diff. That is correctly documented as a limitation, but it remains a product gap if richer diffing is desired later.

Assessment:

- Task 3 is implementation-ready.

## Task 4: Vault Implementation

### Pass 1: Spec Compliance

- Vault spell files are stored as `spells/{content_hash}.json`.
- Integrity verification recomputes the canonical content hash from JSON content, not raw file bytes.
- Missing files are re-exported from `canonical_data` when possible, and unrecoverable rows are recorded without crashing.
- GC is preceded by integrity checking.

### Pass 2: Correctness

- Zip-slip hardening is present in restore path handling.
- Restore is staged and rollback-aware instead of mutating live support files up front.
- Long-running backup/restore work has been moved into blocking-safe execution paths.
- `VaultMaintenanceState` prevents GC from running during an active import and prevents import from starting during GC.

### Pass 3: Readiness

- Backend unit coverage exists for zip-slip rejection, rollback on failed restore, path-length handling, integrity recovery, and GC behavior.
- The vault open-time integrity setting is implemented and tested at the unit level.

Residual follow-up:

1. I did not find frontend/E2E coverage for malicious backup archives or restore rollback; those behaviors are currently protected by backend unit tests only.
2. Fresh execution of the vault test slice could not be completed in this environment because `cargo` is unavailable in the shell.

Assessment:

- Task 4 is implementation-ready.

## Recommended Follow-up Order

1. Add a focused search ranking test for BM25 ordering in Task 1.
2. Add an export -> re-import round-trip E2E for Task 2.
3. If richer UX is desired, extend Task 3 conflict payloads to support actual field-level diff/highlighting.
4. Add frontend/E2E coverage for malicious ZIP rejection and failed-restore rollback in Task 4.

## Final Assessment

- Tasks 1-4 appear complete from a code-review perspective.
- I did not find new blocking defects in the current implementation.
- The remaining work is concentrated in verification depth and user-flow coverage rather than missing core behavior.
