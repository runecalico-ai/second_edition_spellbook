# Task 2 Three-Pass In-Depth Code Review (Subagent Split)

Date: 2026-03-05
Spec: `openspec/changes/integrate-spell-hashing-ecosystem` (Task 2)
Scope: `apps/desktop/src-tauri/src/commands/import.rs`, `apps/desktop/src-tauri/src/commands/export.rs`, related models/spec/tests

## Subagent Work Split

- Subagent A: Ingest pipeline and version/schema/security gates
  - Parse/classify payload, URL policy, normalize/hash pipeline
- Subagent B: Dedup/conflict/replace transaction behavior and metadata merge semantics
  - Hash-first dedup, name conflict actions, merge/cascade behavior
- Subagent C: Export contract and test sufficiency
  - Single/bundle export semantics, coverage against verification checklist

## Pass 1: Spec Compliance Findings

### 1. [High] SourceRef dedup key policy does not implement "both have URL" condition
- Spec requirement: dedup by URL only when both refs have non-empty URL; otherwise dedup by `(system, book, page, note)`.
- Current implementation always prefers URL when a ref has URL.
- Evidence:
  - Spec: `openspec/changes/integrate-spell-hashing-ecosystem/specs/import-export/spec.md:17-19`
  - Code: `apps/desktop/src-tauri/src/commands/import.rs:86-102`
- Impact:
  - Wrong dedup behavior when one ref has URL and the other does not.
  - Can produce duplicate logical refs and incorrect truncation outcomes near the 50 limit.
- Implementation guidance:
  - Replace single-ref key function with pair-aware comparison logic.
  - For dedup loops, evaluate candidate against existing refs using:
    - if both URLs present/non-empty -> compare URLs
    - else compare tuple `(system, book, page, note)`

### 2. [High] Tamper-hash input path only checks `id`, not `content_hash` field described in Task 2 text
- Task text references imported `content_hash` mismatch warnings.
- Current implementation reads imported hash from `spell.id` only.
- Evidence:
  - Task text: `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md:38`
  - Code: `apps/desktop/src-tauri/src/commands/import.rs:318-323`
  - Schema accepts `id` but not `content_hash`: `apps/desktop/src-tauri/schemas/spell.schema.json:8`
- Impact:
  - Payloads using `content_hash` semantics (without `id`) cannot participate in tamper-warning flow as written in Task 2 wording.
- Implementation guidance:
  - Choose one and align code+spec consistently:
    - Option A: treat `id` as canonical interchange hash and update task/spec wording to `id`.
    - Option B: add import alias handling for `content_hash` in ingest path before canonical deserialization.

## Pass 2: Code Quality and Data Integrity Findings

### 3. [High] Duplicate-hash metadata merge updates DB `tags` column but not `canonical_data.tags`
- In duplicate skip path, merged tags are written to `spell.tags`, but canonical JSON is only merged for `source_refs`.
- Evidence:
  - Merge update path: `apps/desktop/src-tauri/src/commands/import.rs:860-879`
  - Canonical merge helper only handles source refs: `apps/desktop/src-tauri/src/commands/import.rs:138-167`
- Impact:
  - `spell.tags` and `canonical_data.tags` diverge.
  - JSON export reads from canonical_data and can miss merged tags.
- Implementation guidance:
  - Add canonical metadata merge for tags (and keep both representations in sync in same update statement).
  - Add a small helper: merge canonical JSON tags using same cap/sort/dedup rules as flat tags.

### 4. [Medium] Replace-failure handling aborts whole batch transaction, not just the replace operation
- Replace errors are escalated as hard error via `?` while all items are in one transaction.
- Evidence:
  - One transaction for all items: `apps/desktop/src-tauri/src/commands/import.rs:811`
  - Replace error propagation: `apps/desktop/src-tauri/src/commands/import.rs:909-916`
- Impact:
  - One failing replace can roll back unrelated successful imports in the same batch.
  - Could conflict with user expectations of mixed-result imports.
- Implementation guidance:
  - Clarify intended behavior in spec text.
  - If partial success is desired, use savepoints per item or per conflict resolution.

## Pass 3: Test Adequacy and Implementation Readiness

### 5. [Medium] Task 2 apply/export behavior lacks focused unit/integration tests
- Current `import.rs` tests are mostly parse/normalize/url-policy preview tests.
- No `export.rs` command tests found.
- Evidence:
  - Import tests block starts: `apps/desktop/src-tauri/src/commands/import.rs:2060`
  - No `mod tests` in export command file: `apps/desktop/src-tauri/src/commands/export.rs`
  - Verification checklist still has unchecked Task 2 tests: `openspec/changes/integrate-spell-hashing-ecosystem/verification.md:405-469`
- Gaps to add immediately:
  - Apply-phase duplicate merge test asserting both `spell.tags` and `canonical_data.tags` update together.
  - SourceRef dedup matrix tests for "both URL" vs "only one URL" cases.
  - Export single/bundle tests for `id`, `schema_version`, `bundle_format_version`, NULL-hash rejection.
  - Tampered hash warning test verifying dedup uses recomputed hash.

## Overall Assessment

- Status: Not ready for implementation sign-off for Task 2.
- Primary blockers:
  - SourceRef dedup policy mismatch (spec violation).
  - Canonical metadata drift in duplicate-tag merge path.
- Secondary work:
  - Resolve `id` vs `content_hash` contract ambiguity.
  - Close test gaps for apply/export paths before final verification sign-off.

## Recommended Fix Order

1. Fix SourceRef dedup policy logic (spec-critical).
2. Fix canonical_data tag merge synchronization in duplicate path.
3. Align tamper-hash field contract (`id` vs `content_hash`) across spec and code.
4. Add apply/export tests covering verification checklist items 405-469.
