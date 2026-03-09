# Vault Implementation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task.

**Goal:** Implement Task 4 of `integrate-spell-hashing-ecosystem` so the vault stores canonical spell files by content hash, verifies and recovers them safely, exposes manual maintenance controls, and enforces the required import/GC coordination.

**Architecture:** Add a dedicated vault service layer in the Tauri backend for hash-addressed spell file IO, integrity sweeps, and garbage collection, then integrate it into spell writes, import completion, and vault-open lifecycle hooks. Keep the database as the source of truth for spell existence; treat `spells/{content_hash}.json` as recoverable content-addressable storage derived from canonical spell JSON plus metadata.

**Tech Stack:** Rust/Tauri, rusqlite, React, TypeScript, Vitest, existing Tauri IPC.

---

## Completion status (2026-03-08)

| Task | Status | Notes |
|------|--------|--------|
| Task 1: Backend vault primitives | Done | Pathing, integrity verify, atomic write, spell/import write-through |
| Task 2: Integrity sweep, recovery, GC | Done | Sweep, re-export, GC with live hash set, schema-conditional artifact ref |
| Task 3: Import/GC coordination | Done | Guard, post-import GC, replace/keep_both vault writes |
| Task 4: User-facing vault controls | Done | VaultMaintenanceDialog, integrity-on-open, Optimize Vault, startup UX |
| Task 5: Verification and three-pass review | Done | Full verify (cargo test 292, typecheck, test:unit 73), review artifact saved |
| Task 6: Documentation close-out | Done | tasks.md Task 4 marked complete, TROUBLESHOOTING vault section, backup/restore scope documented |

Verification: `cargo test --lib` (292 passed), `pnpm --dir apps/desktop typecheck`, `pnpm --dir apps/desktop test:unit` (73 passed). Four previously failing import/vault tests were fixed (artifact table for get_spell_from_conn, skip-merge for replace resolution, mutex poisoning resolved).

---

### [DONE] Task 1: Build Backend Vault Primitives

**Subagent Unit:** Backend vault core

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/vault.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/error.rs`
- Modify: `apps/desktop/src-tauri/src/models/canonical_spell.rs`
- Modify: `apps/desktop/src-tauri/src/commands/spells.rs`
- Test: `apps/desktop/src-tauri/src/commands/vault.rs`
- Test: `apps/desktop/src-tauri/src/commands/spells.rs`

**Step 1: Add failing unit tests for vault pathing and integrity helpers**

- Cover `spells/{content_hash}.json` path generation.
- Cover Windows path-length warning threshold behavior.
- Cover integrity verification recomputing hash from canonical JSON via normalize -> validate -> metadata strip -> JCS -> SHA-256, not raw file bytes.
- Cover write rejection when computed hash does not match the target filename.

Run: `cargo test vault:: --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: FAIL on missing helpers and commands.

**Step 2: Extract vault root and spell-path helpers**

- Keep existing backup/restore root logic, but centralize:
  - vault root lookup
  - `spells/` directory creation
  - `spell_file_path(content_hash)`
  - path-length warning logging
- Use `tracing::warn!` for path-limit warnings.

**Step 3: Add canonical spell export/write helpers**

- Read the full canonical spell payload from DB `canonical_data`.
- Ensure written file content is full `CanonicalSpell` JSON including metadata.
- Verify the computed canonical hash matches `content_hash` before atomic write.
- Use temp-file + rename semantics so partial writes do not leave corrupt files.

**Step 4: Hook spell create/update flows to persist vault files**

- After successful spell create/update/upsert writes and canonical hash computation, write or refresh the corresponding vault file.
- Keep DB transaction semantics intact: only write vault files after DB state is durable, and surface backend errors cleanly.

**Step 5: Hook JSON import write paths to persist vault files**

- Update the direct JSON import mutation paths in `commands/import.rs`, not just `spells.rs` CRUD entry points.
- Cover all hash-affecting and vault-relevant cases:
  - new insert
  - duplicate-hash metadata merge that updates `canonical_data`
  - `replace_with_new`
  - `keep_both`
- Ensure post-write vault persistence happens for rows mutated inside import transactions so imports do not rely on a later integrity sweep to materialize files.

**Step 6: Re-run focused tests**

Run: `cargo test vault:: spells:: --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS for new pathing/integrity/write-through tests.

### [DONE] Task 2: Implement Integrity Sweep, Recovery, and GC Engine

**Subagent Unit:** Backend maintenance engine

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/vault.rs`
- Modify: `apps/desktop/src-tauri/src/models/spell.rs`
- Modify: `apps/desktop/src-tauri/src/models/character.rs`
- Modify: `apps/desktop/src-tauri/src/error.rs`
- Test: `apps/desktop/src-tauri/src/commands/vault.rs`

**Step 1: Add failing tests for integrity recovery and GC**

- Missing vault file with DB `canonical_data` re-exports successfully.
- Missing vault file with NULL `canonical_data` is logged and reported as unrecoverable without crashing.
- Present vault file with invalid JSON or hash mismatch is detected and either re-exported from DB `canonical_data` or reported as unrecoverable without crashing.
- GC removes files not referenced by any `spell.content_hash` or `artifact.spell_content_hash`.
- GC preserves files still referenced by DB rows.
- Integrity sweep runs before GC and repairs missing files before orphan deletion logic proceeds.
- GC behaves safely when `artifact.spell_content_hash` is not yet present in the schema.

Run: `cargo test vault::integrity vault::gc --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: FAIL on missing sweep/GC implementation.

**Step 2: Add backend result models for vault maintenance**

- Define response payloads for:
  - integrity check summary
  - GC summary
  - unrecoverable entry list
  - warning counts
- Keep serde output in `camelCase`.

**Step 3: Implement integrity check command(s)**

- Scan DB for spell rows with non-NULL `content_hash`.
- Re-export missing files from `canonical_data` when possible.
- Verify existing files by recomputing canonical hash from parsed JSON.
- If an existing file fails JSON parsing or hash verification, repair it from DB `canonical_data` when possible; otherwise report it as unrecoverable.
- Return structured summary for UI use.

**Step 4: Implement GC command**

- Require integrity sweep first in the GC path.
- Build the live hash set from `spell.content_hash` and `artifact.spell_content_hash`.
- Make the artifact reference lookup schema-conditional so GC still works before Migration 0015 lands.
- Remove only orphaned `spells/*.json` files.
- Ignore non-spell files outside the `spells/` subtree.

**Step 5: Add performance-oriented coverage**

- Add a non-flaky test that exercises GC over a larger fixture set and asserts correctness without sleeping.
- Add a lightweight timing-oriented verification for single-file vault writes so the `< 100ms` target is at least measured in a controlled local test or manual benchmark.
- Leave the <30s benchmark as a manual verification step if no benchmark harness exists yet.

Run: `cargo test vault:: --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS for recovery and GC scenarios.

### [DONE] Task 3: Enforce Import/GC Coordination and Post-Import Cleanup

**Subagent Unit:** Backend import integration

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/import.rs`
- Modify: `apps/desktop/src-tauri/src/commands/vault.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Test: `apps/desktop/src-tauri/src/commands/import.rs`
- Test: `apps/desktop/src-tauri/src/commands/vault.rs`

**Step 1: Add failing tests for import/GC mutual exclusion**

- GC request during active JSON import is rejected or deferred per chosen guard strategy.
- Successful import of one or more spells triggers post-import GC.
- Import failure does not trigger GC.

Run: `cargo test import:: vault::gc_block --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: FAIL on missing import-state guard and post-import hook.

**Step 2: Introduce a process-wide vault maintenance guard**

- Use shared Tauri-managed state such as `Arc<Mutex<...>>` or an equivalent explicit import/GC gate.
- Keep the design simple: one import in progress blocks manual and automatic GC.
- Ensure the guard is released on all success and error paths.

**Step 3: Integrate post-import GC**

- After a successful JSON import apply phase that imports or mutates at least one spell, invoke vault GC.
- Decide whether legacy file imports should also trigger post-import GC; keep behavior consistent and document it in code comments.
- Ensure the import path writes or refreshes vault files before the post-import GC decision point.

**Step 4: Add spell replacement coverage**

- Verify `replace_with_new` updates the new vault file.
- Verify the old vault file becomes GC-eligible after replacement.
- Verify no race deletes the incoming hash while the import transaction is still active.

**Step 5: Re-run focused backend tests**

Run: `cargo test import:: vault:: --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS for import guard and post-import cleanup coverage.

### [DONE] Task 4: Add User-Facing Vault Controls and Settings

**Subagent Unit:** Frontend + IPC integration

**Files:**
- Modify: `apps/desktop/src/ui/App.tsx`
- Modify: `apps/desktop/src/ui/ImportWizard.tsx`
- Modify: `apps/desktop/src/store/useModal.ts`
- Create: `apps/desktop/src/ui/components/VaultMaintenanceDialog.tsx`
- Create: `apps/desktop/src/types/vault.ts`
- Modify: `apps/desktop/src-tauri/src/commands/vault.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Test: `apps/desktop/src/ui/components/VaultMaintenanceDialog.test.tsx`
- Test: `apps/desktop/src/ui/ImportWizard.tsx`

**Step 1: Add failing UI tests for manual maintenance controls**

- Manual "Optimize Vault" trigger is visible and invokes the GC command.
- GC control is disabled while import is in progress.
- Integrity-on-open setting can be toggled and persisted through IPC.
- Integrity summary / unrecoverable results are shown in the modal flow.

Run: `pnpm --dir apps/desktop test:unit`
Expected: FAIL on missing vault maintenance UI and types.

**Step 2: Add backend settings storage for `vault.integrityCheckOnOpen`**

- If no settings subsystem exists, add a minimal persisted settings file or table only for this key.
- Expose Tauri commands to read and update the setting.
- Default to `true`.

**Step 3: Add open-time integrity behavior**

- On app startup or initial vault-open lifecycle, read `vault.integrityCheckOnOpen`.
- If enabled, run integrity check automatically and surface actionable warnings without blocking app startup indefinitely.

**Step 4: Add a vault maintenance dialog in the app shell**

- Reuse the existing modal style and add stable `data-testid` values.
- Show:
  - run integrity check
  - optimize vault / GC
  - toggle automatic integrity-on-open
  - results summary
- Keep button types explicit and IPC args in `camelCase`.

**Step 5: Wire import UI disabling**

- While import commands are active, disable the manual optimize button.
- If a user still triggers the backend command through stale UI state, show the backend guard error cleanly.

**Step 6: Re-run frontend tests**

Run: `pnpm --dir apps/desktop test:unit`
Expected: PASS for vault settings and maintenance dialog coverage.

### [DONE] Task 5: Full Verification and Three-Pass Review Using Subagents

**Subagent Unit:** Verification + review

**Files:**
- Review: `apps/desktop/src-tauri/src/commands/vault.rs`
- Review: `apps/desktop/src-tauri/src/commands/import.rs`
- Review: `apps/desktop/src-tauri/src/commands/spells.rs`
- Review: `apps/desktop/src/ui/App.tsx`
- Review: `apps/desktop/src/ui/ImportWizard.tsx`
- Review: `apps/desktop/src/ui/components/VaultMaintenanceDialog.tsx`
- Review: any new vault/types/settings files introduced during Tasks 1-4

**Step 1: Run full verification before claiming completion**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
Expected: PASS

Run: `pnpm --dir apps/desktop typecheck`
Expected: PASS

Run: `pnpm --dir apps/desktop test:unit`
Expected: PASS

If practical during implementation:
Run: `pnpm --dir apps/desktop lint`
Expected: PASS or only pre-existing unrelated issues.

Manual verification:
- Measure representative single-spell vault write latency against the `< 100ms` non-functional target.
- Measure GC behavior over a large local fixture set and record whether it meets the `< 30s` target.

**Step 2: Pass 1 review with a spec-compliance subagent**

- Review only against:
  - `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md`
  - `openspec/changes/integrate-spell-hashing-ecosystem/design.md`
  - `openspec/changes/integrate-spell-hashing-ecosystem/specs/vault/spec.md`
- Confirm all Task 4.1 bullets are implemented with no under-build or over-build.
- Fix every finding before moving to Pass 2.

**Step 3: Pass 2 review with a backend correctness subagent**

- Focus on:
  - atomic file writes
  - hash verification correctness
  - DB-to-vault recovery logic
  - GC reference-set correctness
  - import/GC race handling
  - Windows path-length handling
- Add or tighten tests for each real finding.

**Step 4: Pass 3 review with a frontend/integration quality subagent**

- Focus on:
  - UI mutual exclusion while import is active
  - error messaging and recoverability
  - `data-testid` coverage
  - IPC casing and response typing
  - startup integrity-check UX
- Fix every finding before declaring the task done.

**Step 5: Save the review artifact**

- Write a review note under `openspec/changes/integrate-spell-hashing-ecosystem/` summarizing:
  - review date
  - pass scope
  - findings
  - fixes made
  - residual risks, if any

Suggested filename:
- `openspec/changes/integrate-spell-hashing-ecosystem/review-task-4_2026_03_08_three-pass.md`

### [DONE] Task 6: Optional Documentation Close-Out

**Subagent Unit:** Docs follow-through

**Files:**
- Modify: `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md`
- Modify: `openspec/changes/integrate-spell-hashing-ecosystem/verification.md`
- Modify: `docs/TROUBLESHOOTING.md`

**Step 1: Mark Task 4 complete only after verification and review pass**

- Update the OpenSpec task checklist after code, tests, and three-pass review are complete.

**Step 2: Add operator-facing troubleshooting notes**

- Document:
  - what "Optimize Vault" does
  - how unrecoverable spell files are reported
  - how to mitigate Windows path-length warnings
  - whether backup/restore includes `spells/` files directly or relies on integrity recovery to rebuild them after DB restore

Run: `pnpm --dir apps/desktop format:check`
Expected: PASS for touched frontend docs/files or no new formatter issues.

## Subagent Dispatch Order

1. Task 1 `Backend vault core`
2. Task 2 `Backend maintenance engine`
3. Task 3 `Backend import integration`
4. Task 4 `Frontend + IPC integration`
5. Task 5 `Verification + review`
6. Task 6 `Docs follow-through`

## Review Units For The Final Three-Pass Code Review

1. Unit A: Vault backend primitives and integrity hashing
2. Unit B: Recovery, GC, and import/GC concurrency guard
3. Unit C: UI settings, maintenance controls, and startup integration

## Notes For The Controller Session

- Do not dispatch implementation subagents in parallel; these tasks share backend files and Tauri command registration.
- Do dispatch fresh review subagents for each pass in Task 5.
- Keep all new IPC request keys and TS response types in `camelCase`.
- Do not add dependencies without first reading `docs/DEPENDENCY_SECURITY.md`.
- Resolve backup/restore scope explicitly during implementation: either include `spells/` in vault archives or document and test the recovery-based rebuild path after restoring only the DB.
