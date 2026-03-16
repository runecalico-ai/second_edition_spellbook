# Task 8 Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development if subagents are available. Keep one owner per task, then run spec-compliance review followed by code-quality review before moving to the next task.

**Goal:** Close Task 8 of `integrate-spell-hashing-ecosystem`, plus the directly coupled import-security work from Task 9, by proving SQL-safe query construction, enforcing import/input limits, and verifying that imported spell content cannot produce unsafe rendering paths.

**Architecture:** The work stays inside the existing Rust Tauri backend and current React/Python rendering paths. The backend remains the enforcement point for SQL safety, import payload limits, schema and field validation, and malicious-input tests; the frontend only adds user-facing warning UX where the spec explicitly requires it and regression coverage where rendering safety must be proven.

**Tech Stack:** Rust (`rusqlite`, Tauri commands, JSON schema validation), TypeScript/React, Playwright/Vitest as needed, Python sidecar export rendering.

---

## Scope Notes

- Task 8.1 is mostly an audit-and-proof task because current query code is already parameterized in the primary paths.
- Task 8.2 is partly missing today: import file-size limits, JSON structure limits, and explicit field-length policy are not fully enforced.
- The plan intentionally includes Task 9.1-9.3 where those controls are inseparable from implementing the requested security hardening for imports.
- The plan does not cover Task 10 performance validation or Task 11 documentation.
- Frontend XSS mitigation should not add ad hoc sanitization if existing text rendering is already safe; the task is to verify and lock that behavior down with regression coverage.
- Do not add dependencies unless strictly necessary and cleared under `docs/DEPENDENCY_SECURITY.md`.

## File Map

**Primary backend files**
- Modify: `apps/desktop/src-tauri/src/commands/search.rs`
- Modify: `apps/desktop/src-tauri/src/commands/import.rs`
- Modify: `apps/desktop/src-tauri/src/commands/spells.rs`
- Modify: `apps/desktop/src-tauri/src/models/canonical_spell.rs`
- Modify: `apps/desktop/src-tauri/schemas/spell.schema.json`

**Primary frontend / rendering files**
- Modify: `apps/desktop/src/ui/ImportWizard.tsx`
- Verify only unless needed: `apps/desktop/src/ui/Library.tsx`
- Verify only unless needed: `apps/desktop/src/ui/components/SpellConflictDiffDialog.tsx`
- Verify only unless needed: `services/ml/spellbook_sidecar.py`

**Likely test surfaces**
- Test: `apps/desktop/src-tauri/src/commands/search.rs`
- Test: `apps/desktop/src-tauri/src/commands/import.rs`
- Test: `apps/desktop/src-tauri/src/commands/spells.rs`
- Test: `apps/desktop/tests/batch_import.spec.ts`
- Test: `apps/desktop/tests/import_conflict_resolution.spec.ts`
- Test: `services/ml/tests/test_export.py`

## Test Locations and Evidence

- Rust unit tests should stay inline in the source modules they cover:
	- `apps/desktop/src-tauri/src/commands/search.rs::tests`
	- `apps/desktop/src-tauri/src/commands/import.rs::tests`
	- `apps/desktop/src-tauri/src/commands/spells.rs::tests`
- Frontend or E2E security regressions should extend existing import-facing specs before creating new files:
	- prefer `apps/desktop/tests/batch_import.spec.ts`
	- use `apps/desktop/tests/import_conflict_resolution.spec.ts` if the scenario depends on import conflict UI
- Python export safety coverage should extend `services/ml/tests/test_export.py`.
- Final closure evidence should be written to `openspec/changes/integrate-spell-hashing-ecosystem/review-task-8_<YYYY_MM_DD>_three-pass.md`.

## Subagent Units

### Task 1: Search and SQL Safety Proof

**Owner:** Backend/search subagent

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/search.rs`
- Verify for audit notes only: `apps/desktop/src-tauri/src/commands/characters.rs`
- Verify for audit notes only: `apps/desktop/src-tauri/src/commands/spells.rs`

- [x] **Step 0: Capture baseline backend health**

Run:
```powershell
cd apps/desktop/src-tauri
cargo test commands::search::tests -- --nocapture
cargo test commands::import::tests -- --nocapture
cargo test commands::spells::tests -- --nocapture
```

Expected: existing targeted suites are green before Task 8 changes start.

- [x] **Step 1: Freeze the current SQL/FTS contract in tests**

Add targeted tests in `search.rs` that exercise:
- FTS payload `'; DROP TABLE spell;--`
- malformed operator payloads
- wildcard-heavy LIKE payloads (`%`, `_`, `\\`)
- advanced query cases that must still bind a single MATCH parameter

- [x] **Step 2: Run focused backend tests and confirm failures or gaps**

Run:
```powershell
cd apps/desktop/src-tauri
cargo test commands::search::tests -- --nocapture
```

Expected:
- Existing escaping tests stay green.
- New malicious-input tests either fail first or demonstrate any remaining assertion gaps.

- [x] **Step 3: Tighten query construction only where a real gap exists**

Keep the current architecture:
- `spell_fts MATCH ?` must stay a single bound parameter.
- `LIKE ? ESCAPE '\\'` must stay parameterized.
- No user-controlled SQL fragments may be concatenated into query text.

Only add code changes if tests prove a missing guard or missing explanatory invariant.

- [x] **Step 4: Add code comments for non-obvious safe dynamic SQL**

Document that the `col` prefix and other interpolated fragments are hardcoded, not user-controlled, so future edits do not regress into string-injected SQL.

- [x] **Step 5: Re-run focused backend tests**

Run:
```powershell
cd apps/desktop/src-tauri
cargo test commands::search::tests -- --nocapture
```

Expected: targeted search tests pass, including malicious-input coverage.

### Task 2: Import Payload Size and JSON Structure Limits

**Owner:** Backend/import pipeline subagent

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/import.rs`
- Verify only: `apps/desktop/src-tauri/src/commands/export.rs`
- Verify only: `apps/desktop/src-tauri/src/commands/vault.rs`
- Test: `apps/desktop/src-tauri/src/commands/import.rs`

- [x] **Step 0: Add or confirm import guardrail constants**

Define or confirm constants for:
- hard reject over 100 MB in the backend preview/import path
- frontend warning threshold at 10 MB
- maximum bundle size of 10,000 spells
- maximum JSON nesting depth of 50

Prefer one Rust source of truth if the constants are reused across multiple backend paths.

- [x] **Step 0b: Audit already-implemented URL policy behavior**

Before changing code, verify the existing `SourceRef` protections in `import.rs`:
- protocol allowlist (`http`, `https`, `mailto`)
- invalid protocol rejection for `javascript:`, `data:`, `ipfs:`, and others
- `drop-ref` vs `reject-spell` policy behavior

Only add implementation work here if tests expose a real gap.

- [x] **Step 1: Write failing tests for payload and structure limits**

Add tests for:
- reject payloads larger than 100 MB
- reject bundles larger than 10,000 spells
- reject JSON nesting deeper than 50 levels
- preserve current valid import behavior below the thresholds

- [x] **Step 2: Run the focused import test subset**

Run:
```powershell
cd apps/desktop/src-tauri
cargo test commands::import::tests -- --nocapture
```

Expected: new guardrail tests fail first.

- [x] **Step 3: Implement backend guardrails before expensive parsing or processing**

Implementation targets:
- Enforce hard reject in the backend using the incoming payload byte length available in `preview_import_spell_json` and the final import execution path.
- Reject malformed or excessively nested JSON with clear import errors.
- Reject bundles above the spell-count limit.
- Keep the import order explicit: structure and size checks first, metadata normalization/truncation next, then version/schema validation, migration, hash computation, and dedup/conflict handling.
- If JSON depth cannot be enforced cleanly with current parsing helpers, isolate that work in a dedicated helper instead of scattering ad hoc recursion checks.

- [x] **Step 4: Preserve current URL policy and normalization flow**

Do not regress:
- `import.sourceRefUrlPolicy`
- tag/source-ref normalization and truncation
- schema-version and bundle-version checks
- deduplication and conflict preview behavior

- [x] **Step 5: Re-run import tests**

Run:
```powershell
cd apps/desktop/src-tauri
cargo test commands::import::tests -- --nocapture
```

Expected: guardrail tests and existing import tests pass together.

### Task 3: Field-Length Policy and Canonical Validation Enforcement

**Owner:** Backend/schema-validation subagent

**Files:**
- Modify: `apps/desktop/src-tauri/src/models/canonical_spell.rs`
- Modify: `apps/desktop/src-tauri/src/commands/spells.rs`
- Modify: `apps/desktop/src-tauri/schemas/spell.schema.json`
- Test: `apps/desktop/src-tauri/src/commands/import.rs`
- Test: `apps/desktop/src-tauri/src/commands/spells.rs`

- [x] **Step 1: Define explicit max-length policy for attacker-controlled text fields**

Inventory first:
- read `apps/desktop/src-tauri/schemas/spell.schema.json` and document current string-field constraints
- list which free-text fields are populated from imports or direct spell writes

Decide and encode limits for at least:
- spell name
- description
- author
- source
- `SourceRef` string members such as `system`, `book`, `note`, and URL-like fields where applicable

Policy must be consistent across direct spell writes and JSON import.
Cardinality truncation for `tags` and `source_refs` remains separate from field-width validation; do not silently clip arbitrary text fields unless the spec already mandates truncation.

- [x] **Step 2: Write failing tests for overlong field rejection**

Add tests proving rejection of excessive field sizes during:
- import preview / import execution
- direct spell creation or update paths if those paths can bypass import validation

Use explicit test names for the high-risk cases, for example:
- oversized spell name
- oversized description
- oversized `SourceRef.book` / `SourceRef.note`
- boundary-value acceptance exactly at the configured maximum

- [x] **Step 3: Implement validation after normalization/truncation preprocessing**

Respect Task 8 wording:
- perform required normalization/truncation first
- then validate schema and field limits before insert/update
- return explicit validation errors instead of silent clipping except where the spec already mandates truncation (`tags`, `source_refs`)

- [x] **Step 4: Keep canonical hashing behavior stable for valid inputs**

Ensure valid spells still normalize, validate, and hash identically after the new limits are introduced.

- [x] **Step 5: Run targeted backend tests**

Run:
```powershell
cd apps/desktop/src-tauri
cargo test commands::import::tests -- --nocapture
cargo test commands::spells::tests -- --nocapture
```

Expected: oversized-field tests pass without breaking existing canonical/hash behavior.

### Task 4: Frontend Warning UX and Rendering-Safety Regression Coverage

**Owner:** Frontend/security UX subagent

**Files:**
- Modify: `apps/desktop/src/ui/ImportWizard.tsx`
- Verify only unless required: `apps/desktop/src/ui/Library.tsx`
- Verify only unless required: `apps/desktop/src/ui/components/SpellConflictDiffDialog.tsx`
- Verify only unless required: `services/ml/spellbook_sidecar.py`
- Test: `apps/desktop/tests/`

- [x] **Step 0: Implement the 10 MB warning in the frontend before Tauri import preview**

`preview_import_spell_json` receives the full payload string after the frontend has already read the file, so the user-facing warning must happen in `ImportWizard.tsx` using `File.size` before preview/import is invoked.

Required behavior:
- no warning at or below 10 MB
- confirmation warning above 10 MB
- backend still performs the hard reject over 100 MB

- [x] **Step 1: Add failing test coverage for the 10 MB warning path if UX changes are needed**

Extend `apps/desktop/tests/batch_import.spec.ts` unless a new file is clearly cleaner. Add coverage that proves:
- files above 10 MB trigger a confirmation step
- files at or below the threshold continue normally
- boundary behavior is correct at exactly 10 MB and 10 MB + 1 byte

- [x] **Step 2: Add regression coverage for malicious display strings**

Extend `apps/desktop/tests/batch_import.spec.ts` or `apps/desktop/tests/import_conflict_resolution.spec.ts` with a focused regression that imports or seeds strings such as:
- `<img src=x onerror=alert(1)>`
- `<script>alert(1)</script>`

Assert the payload is rendered as text and not executed.
Also verify there is no unsafe HTML sink in the affected rendering paths before adding any sanitization code.

- [x] **Step 3: Implement only the required UI delta**

Likely implementation:
- `ImportWizard.tsx` warns for files larger than 10 MB before preview/import.

Do not introduce manual HTML sanitization into normal React text rendering unless an actual unsafe HTML sink is found.

- [x] **Step 4: Verify export rendering remains escaped**

Extend `services/ml/tests/test_export.py` if current coverage does not already prove `html_escape()` behavior for spell names/descriptions.

- [x] **Step 5: Run focused frontend verification**

Run the smallest relevant set:
```powershell
cd apps/desktop
pnpm tsc --noEmit
```

If frontend unit coverage is added outside Playwright:
```powershell
cd apps/desktop
pnpm test:unit
```

If UI behavior or E2E flows changed:
```powershell
cd apps/desktop
pnpm tauri:build --debug
npx playwright test tests/batch_import.spec.ts
```

If import conflict UI coverage was touched:
```powershell
cd apps/desktop
npx playwright test tests/import_conflict_resolution.spec.ts
```

If sidecar export coverage was touched:
```powershell
cd services/ml
pytest tests/test_export.py -q
```

Expected: warning UX and malicious-string rendering checks pass.

### Task 5: Final Security Regression Sweep and Spec Closure

**Owner:** Integration/verification subagent

**Files:**
- Modify: `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md`
- Review: all files changed by Tasks 1-4

- [x] **Step 1: Re-read Task 8 and compare each checkbox against the code diff**

Checklist:
- all DB query paths audited or covered by tests
- FTS MATCH still bound safely
- malicious-input tests exist
- schema validation happens after required preprocessing
- oversized fields are rejected
- rendering safety is verified

- [x] **Step 2: Run final targeted verification commands**

Run at minimum:
```powershell
cd apps/desktop/src-tauri
cargo test commands::search::tests -- --nocapture
cargo test commands::import::tests -- --nocapture
cargo test commands::spells::tests -- --nocapture
```

If frontend files changed:
```powershell
cd apps/desktop
pnpm tsc --noEmit
```

If Playwright coverage was added or touched:
```powershell
cd apps/desktop
pnpm tauri:build --debug
npx playwright test tests/batch_import.spec.ts
```

If conflict-resolution coverage was touched:
```powershell
cd apps/desktop
npx playwright test tests/import_conflict_resolution.spec.ts
```

If sidecar export coverage was touched:
```powershell
cd services/ml
pytest tests/test_export.py -q
```

- [x] **Step 3: Update the OpenSpec task checklist**

Mark Task 8 subtasks complete only after verification output confirms them.

- [x] **Step 4: Produce final review artifact**

Write a three-pass review note beside the change artifacts summarizing:
- spec compliance
- code quality / maintainability
- verification evidence and residual risks

Use the file name:
`openspec/changes/integrate-spell-hashing-ecosystem/review-task-8_<YYYY_MM_DD>_three-pass.md`

## Sequencing and Ownership

- Execute Task 1 first because it confirms whether search/SQL work is a proof task or a real code-change task.
- Execute Task 2 next because payload and structure limits are the clearest missing security controls.
- Execute Task 3 after Task 2 because field-limit enforcement must align with the established import preprocessing pipeline.
- Execute Task 4 after backend constraints are stable so frontend warnings and rendering regressions match the final backend behavior.
- Execute Task 5 last as the integration gate.

## Review Gates Per Subagent Task

For each task above:
- Implementation subagent finishes the scoped change and runs only its targeted tests.
- Spec-review subagent checks the diff against Task 8 and the relevant spec/design sections.
- Code-quality subagent checks for regressions, overreach, missing negative tests, and maintainability issues.
- Only then move to the next task.

## Final Verification Matrix

- Search safety: malicious FTS and LIKE inputs do not alter SQL behavior and return safely.
- Import payload safety: oversized payloads, deep nesting, and overlarge bundles fail with explicit errors.
- Field validation: overlong attacker-controlled fields are rejected after required normalization/truncation preprocessing.
- Rendering safety: malicious strings render inertly in React and escaped HTML export output.
- Task bookkeeping: `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md` updated only after fresh verification evidence.