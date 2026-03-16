# Task 3 Three-Pass In-Depth Code Review (Subagent-Oriented)

Date: 2026-03-07
Spec: `openspec/changes/integrate-spell-hashing-ecosystem` (Task 3: Import Conflict Resolution UI)
Scope: `apps/desktop/src/ui/ImportWizard.tsx`, `apps/desktop/src/ui/components/SpellConflictDiffDialog.tsx`, `apps/desktop/src/ui/components/BulkConflictSummaryDialog.tsx`, `apps/desktop/src-tauri/src/commands/import.rs`, `apps/desktop/src-tauri/src/models/import.rs`, `apps/desktop/tests/import_conflict_resolution.spec.ts`

## Subagent Split (Logical Units)

- Subagent A: Conflict UI flow/state machine
  - `ImportWizard` `resolve-json` flow, bulk threshold routing, Apply-to-All behavior
- Subagent B: Backend conflict apply semantics
  - `apply_import_spell_json_impl`, Keep Both suffix generation, action resolution contracts
- Subagent C: Validation and regression safety
  - E2E coverage for task-3 scenarios and model/documentation coherence

## Findings (Ordered by Severity)

### 1. [High] Keep Both suffix uniqueness is still level-scoped, but Task 3 conflict semantics are name-scoped — **Complete**

Evidence:
- Conflict detection is name-only: `apps/desktop/src-tauri/src/commands/import.rs:937`
- Keep Both naming still queries by `level` and name pattern: `apps/desktop/src-tauri/src/commands/import.rs:651`, `apps/desktop/src-tauri/src/commands/import.rs:661`
- Task/design require numeric suffix increment until unique, aligned to same-name conflict handling:
  - `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md:68`
  - `openspec/changes/integrate-spell-hashing-ecosystem/design.md:149`

Impact:
- If `Fireball (1)` exists at another level, Keep Both can generate a duplicate `Fireball (1)` instead of incrementing to `(2)`.
- This is inconsistent with name-based conflict identity and can create confusing duplicate display names.

Implementation guidance:
1. Remove `level` from Keep Both uniqueness lookup.
2. Determine next suffix across all rows matching `name = base` or `name LIKE 'base (%)'`.
3. Add regression tests for cross-level collisions (existing `Name (1)` at another level => next is `(2)`).

**Done:** SQL already name-only; doc comment added in `import.rs`; existing test `test_keep_both_suffix_is_name_global_across_levels` covers cross-level.

### 2. [Medium] Bulk conflict flow tests do not cover required action branches (`Skip All`, `Keep All`, `Review Each`) — **Complete**

Evidence:
- Task 3.2 requires all summary options and Review Each path:
  - `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md:73`
  - `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md:74`
- Current E2E file covers only bulk `Replace All`; no assertions for other bulk actions:
  - `apps/desktop/tests/import_conflict_resolution.spec.ts`
- UI/backend paths exist but are unguarded by tests:
  - `apps/desktop/src/ui/ImportWizard.tsx:463`, `apps/desktop/src/ui/ImportWizard.tsx:471`

Impact:
- Regressions in `review_each` fallback or `skip_all`/`keep_all` mapping can ship undetected.

Implementation guidance:
1. Add E2E for bulk `Review Each` and verify per-conflict dialog appears with progress text.
2. Add E2E for bulk `Skip All` and bulk `Keep All` action mapping and result counts.
3. Assert post-import library state for each action path (not only result screen visibility).

**Done:** E2E tests added for bulk Skip All, Keep All, and Review Each with result-screen and library-state assertions (`import_conflict_resolution.spec.ts` tests 6–8).

### 3. [Low] Backend model/docs still describe conflict identity as "same name (and level)" — **Complete**

Evidence:
- Model comment is stale after name-only conflict change:
  - `apps/desktop/src-tauri/src/models/import.rs:225`
- Task 3 requirement is same name + different hash:
  - `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md:60`

Impact:
- Future contributors may reintroduce level-coupled conflict logic due to misleading contract text.

Implementation guidance:
1. Update `ImportSpellJsonConflict` comment to name-only conflict semantics.
2. Align related command comments to remove `name+level` phrasing.

**Done:** `ImportSpellJsonConflict` comment updated in `models/import.rs`; command comment at `import.rs:835` already "conflict by name".

## Pass Breakdown

## Pass 1: Spec Compliance

- Confirmed implemented:
  - Conflict dialog appears for same name/different hash and includes Keep Existing / Replace with New / Keep Both / Apply to All.
    - `apps/desktop/src/ui/components/SpellConflictDiffDialog.tsx`
  - Bulk summary dialog appears at `>= 10` conflicts with required action set.
    - `apps/desktop/src/ui/ImportWizard.tsx:1137`
    - `apps/desktop/src/ui/components/BulkConflictSummaryDialog.tsx`
  - Progress indicator shown as `Conflict X of Y`.
    - `apps/desktop/src/ui/components/SpellConflictDiffDialog.tsx:46`

- ~~Compliance gap: Keep Both suffix uniqueness implementation remains level-scoped (Finding #1).~~ **Resolved:** name-global doc + existing test.

## Pass 2: Correctness / Flow Integrity

- Confirmed behavior:
  - Bulk action mapping is explicit and correct (`skip_all -> keep_existing`, `replace_all -> replace_with_new`, `keep_all -> keep_both`).
    - `apps/desktop/src/ui/ImportWizard.tsx:471`
  - Per-conflict Apply-to-All applies to current and all remaining conflicts in the session.
    - `apps/desktop/src/ui/ImportWizard.tsx:507`

- ~~Correctness risk: Keep Both naming algorithm can violate expected global suffix monotonicity (Finding #1).~~ **Resolved:** no level in query.

## Pass 3: Test and Implementation Readiness

- Confirmed coverage:
  - E2E covers per-conflict Keep Existing / Replace / Keep Both / Apply to All.
  - E2E covers bulk-dialog visibility and Replace All happy path.
    - `apps/desktop/tests/import_conflict_resolution.spec.ts`

- ~~Readiness gaps: Missing E2E for bulk Skip All, Keep All, Review Each (Finding #2); stale model comments (Finding #3).~~ **Resolved:** E2E tests 6–8 added; model comment updated.

## Recommended Fix Order

1. Fix Keep Both suffix uniqueness to be name-global (not level-scoped) and add regression tests.
2. Add missing bulk action E2E coverage (Skip All, Keep All, Review Each).
3. Update stale model/comment phrasing to match name-only conflict semantics.

## Final Assessment

~~Task 3 is largely implemented and functionally close, but not fully spec-safe yet due to the Keep Both suffix uniqueness mismatch. Address Finding #1 before considering task-3 implementation complete.~~

**All findings complete (2026-03-07).** Finding #1: Keep Both is name-global (doc + test). Finding #2: E2E bulk Skip All, Keep All, Review Each added. Finding #3: Model comment updated to name-only conflict semantics. Task 3 implementation is complete.
