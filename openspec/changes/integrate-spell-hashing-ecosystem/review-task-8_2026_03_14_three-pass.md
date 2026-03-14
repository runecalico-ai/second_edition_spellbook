# Review: Task 8 Plan — SQL Injection and Input Validation

## Scope

Reviewed artifact:
- `openspec/changes/integrate-spell-hashing-ecosystem/plan-task-8-security.md`

Reviewed against:
- `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md` (Task 8 plus directly coupled Task 9 import-security items)
- `openspec/changes/integrate-spell-hashing-ecosystem/design.md`
- `openspec/changes/integrate-spell-hashing-ecosystem/specs/search/spec.md`
- `openspec/changes/integrate-spell-hashing-ecosystem/specs/import-export/spec.md`

## Pass 1 — Spec Compliance

**Verdict:** Pass for Task 8 scope and the coupled Task 9 import-security scope included by the plan.

Confirmed:
- FTS MATCH safety and malicious-input coverage are planned.
- Input validation work is split into payload/structure limits, field-width validation, and rendering-safety verification.
- The plan preserves required preprocessing order: structural checks, normalization/truncation, schema/version validation, migration, hashing, dedup/conflict handling.
- Frontend 10 MB warning and backend 100 MB hard reject are both covered.

Non-blocking note:
- Tasks 10 and 11 are intentionally out of scope for this plan and should remain separate unless the change owner wants a combined release plan.

## Pass 2 — Codebase Accuracy

**Verdict:** Pass.

Confirmed:
- Primary code surfaces are correct: `search.rs`, `import.rs`, `spells.rs`, `canonical_spell.rs`, `spell.schema.json`, `ImportWizard.tsx`, and sidecar export rendering.
- Existing protections are recognized accurately: parameterized SQL, URL allowlist logic, React text rendering, and Python `html_escape()`.
- Test locations align with the current repo layout: inline Rust tests, existing Playwright import specs, and `services/ml/tests/test_export.py`.

Expected implementation gaps already captured by the plan:
- payload-size constants and checks
- frontend file-size warning flow
- JSON depth enforcement helper if current parsing is insufficient
- malicious-string regression tests

## Pass 3 — Verification Completeness

**Verdict:** Pass.

Confirmed:
- Baseline targeted backend test commands are included before implementation.
- Targeted verification commands are defined for backend, frontend type-checking, Playwright import flows, and Python export tests.
- The plan now specifies where new tests should live and where final review evidence should be written.
- Final OpenSpec closure is gated on fresh verification output, not assumption.

## Outcome

The Task 8 implementation plan is ready to execute with subagents.

Residual note:
- During implementation, Task 2 should settle the exact JSON depth-measurement strategy by writing failing tests first and then choosing the smallest helper that enforces the 50-level limit cleanly.