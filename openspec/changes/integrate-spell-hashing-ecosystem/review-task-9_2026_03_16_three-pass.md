# Code Review: Task 9 - Import Security

**Change:** `integrate-spell-hashing-ecosystem`  
**Task:** `9. Import Security`  
**Review Date:** `2026-03-16`  
**Method:** Three-pass review with one subagent per item (`9.1`, `9.2`, `9.3`) plus local synthesis  
**Overall Verdict:** Partially complete

## Findings

### High

1. Task `9.1` is not enforced across all import paths.
   - The spec requires import size limits generally, not only for JSON preview/import.
   - JSON imports have a `>100 MB` backend rejection and `>10 MB` UI confirmation in `apps/desktop/src-tauri/src/commands/import.rs:43`, `apps/desktop/src-tauri/src/commands/import.rs:50`, `apps/desktop/src/ui/ImportWizard.tsx:485`.
   - The legacy file-import flow (`preview_import` / `import_files`) has no equivalent size guard in `apps/desktop/src/ui/ImportWizard.tsx:639`, `apps/desktop/src/ui/ImportWizard.tsx:690`, and the backend path around `apps/desktop/src-tauri/src/commands/import.rs:1985`.
   - Result: task `9.1` is implemented for JSON imports only, while the task wording reads as broader import security coverage.

2. The `>100 MB` JSON rejection occurs after the renderer has already read the whole file into memory.
   - `goToJsonPreview()` reads `jsonFile.text()` before calling the backend in `apps/desktop/src/ui/ImportWizard.tsx:501` and `apps/desktop/src/ui/ImportWizard.tsx:512`.
   - The backend still rejects oversized payloads in `apps/desktop/src-tauri/src/commands/import.rs:50`, but this weakens the stated DoS-prevention goal because the expensive client-side read has already happened.

3. Task `9.3` is incomplete for spell name/description sanitization.
   - The requirement says to sanitize spell names/descriptions before display and strip malicious HTML/scripts.
   - The normalization path only trims and normalizes text; it does not strip markup from `name` or `description` in `apps/desktop/src-tauri/src/models/canonical_spell.rs:783` and `apps/desktop/src-tauri/src/models/canonical_spell.rs:790`.
   - Imported values then flow through unchanged into storage/output in `apps/desktop/src-tauri/src/commands/import.rs:562`.
   - Existing UI behavior intentionally preserves the literal malicious text rather than stripping it, as verified by the E2E test in `apps/desktop/tests/import_conflict_resolution.spec.ts:158` and `apps/desktop/tests/import_conflict_resolution.spec.ts:183`.

4. The current E2E test suite codifies behavior that conflicts with the task `9.3` requirement.
   - `apps/desktop/tests/import_conflict_resolution.spec.ts:183` asserts the imported malicious name/description remain visible as literal `<img ...>` / `<script>...</script>` strings.
   - That proves the implementation is aligned with "escape-only rendering" rather than the spec's stronger "strip malicious HTML/scripts" requirement.

### Medium

5. Task `9.2` does not satisfy the spec's "validate JSON schema before parsing" wording.
   - The payload is first parsed into `CanonicalSpell` via `serde_json::from_value` in `apps/desktop/src-tauri/src/commands/import.rs:373` and `apps/desktop/src-tauri/src/commands/import.rs:380`.
   - Schema validation exists, but later, via `process_spell()` -> `compute_hash()` -> `validate()` in `apps/desktop/src-tauri/src/commands/import.rs:466`, `apps/desktop/src-tauri/src/models/canonical_spell.rs:564`, and `apps/desktop/src-tauri/src/models/canonical_spell.rs:582`.
   - This is decent validation, but it is not schema validation before parse as the task and design specify.

6. Bundle-envelope structure is checked ad hoc, not by schema.
   - The bundle wrapper validates `spells` array presence/type and `bundle_format_version` in `apps/desktop/src-tauri/src/commands/import.rs:351`.
   - The repo contains `spell.schema.json`, and `CanonicalSpell::validate()` compiles and uses it in `apps/desktop/src-tauri/src/models/canonical_spell.rs:584`, but there is no equivalent JSON schema validation for the top-level bundle envelope.

7. URL validation is mostly present, but it is scheme-only, not full URL validation.
   - `validate_source_ref_url()` checks only the scheme allowlist in `apps/desktop/src-tauri/src/commands/import.rs:191`.
   - `sanitize_url_for_display()` strips tags but can leave malformed strings that still pass the scheme check in `apps/desktop/src-tauri/src/commands/import.rs:205`.
   - This may be acceptable if the requirement is strictly protocol allowlisting, but it is weaker than full URL syntax validation.

### Low

8. Test coverage is good on the happy path for JSON-only security controls, but thin on task-wide enforcement.
   - Covered:
   - `10 MB` threshold warning behavior in `apps/desktop/tests/import_conflict_resolution.spec.ts:101` and `apps/desktop/tests/import_conflict_resolution.spec.ts:125`
   - `>100 MB` backend rejection in `apps/desktop/src-tauri/src/commands/import.rs:3216`
   - `10,000` spell cap and depth guard in `apps/desktop/src-tauri/src/commands/import.rs:3541` and `apps/desktop/src-tauri/src/commands/import.rs:3564`
   - URL policy persistence/reject behavior in `apps/desktop/tests/import_conflict_resolution.spec.ts:197`
   - Missing:
   - legacy import size-limit enforcement
   - local UI hard-block for `>100 MB` before reading file contents
   - cancellation path for the `>10 MB` confirmation
   - end-to-end proof for default `drop-ref`

## Pass 1: Completeness

### 9.1 File Size Limits

- Implemented:
- reject JSON payloads `>100 MB`
- confirm JSON preview for files `>10 MB`
- Not complete:
- no equivalent protection found for the non-JSON import flow

### 9.2 JSON Structure Validation

- Implemented:
- payload nesting limit `>50` rejected
- top-level bundle spell count capped at `10,000`
- schema validation exists for `CanonicalSpell`
- Not complete:
- schema validation is not performed before parse
- bundle envelope is not schema-validated

### 9.3 Content Sanitization

- Implemented:
- `source_refs[].url` allowlist enforcement for `http`, `https`, `mailto`
- persisted `import.sourceRefUrlPolicy` with default `drop-ref` and optional `reject-spell`
- Not complete:
- spell `name` / `description` content is not stripped of HTML/scripts
- current tests and runtime behavior preserve raw markup strings

## Pass 2: Correctness

### 9.1

- The JSON path works as coded, but the `>100 MB` rejection happens too late to fully satisfy the DoS intent because the renderer reads the file before backend validation.
- The `>10 MB` warning/confirm flow appears correct for JSON preview.

### 9.2

- The depth scanner and bundle spell-count pre-scan are straightforward and well tested.
- The schema validation path is real and substantial through `CanonicalSpell::validate()`.
- The main correctness issue is ordering: validation happens after deserialization into the domain struct, not before.

### 9.3

- The URL-policy implementation is coherent end-to-end:
- backend policy parsing in `apps/desktop/src-tauri/src/commands/import.rs:225`
- URL filtering in `apps/desktop/src-tauri/src/commands/import.rs:386`
- settings persistence in `apps/desktop/src-tauri/src/commands/vault.rs:64` and `apps/desktop/src-tauri/src/commands/vault.rs:796`
- UI wiring in `apps/desktop/src/ui/ImportWizard.tsx:469`
- The blocking correctness problem is that names/descriptions are escaped by the UI, not sanitized/stripped per spec.

## Pass 3: Risks And Test Sufficiency

- Main product risk: task `9` can be marked done while only JSON import is protected; the older file-import path remains outside the same guardrail model.
- Main spec-compliance risk: task `9.3` currently behaves contrary to the written requirement, and the test suite reinforces that divergence.
- Main maintenance risk: future contributors may interpret the presence of schema validation in `CanonicalSpell` as satisfying "before parsing," even though the actual import pipeline order differs.

## Implementation Follow-Up

1. Decide whether task `9.1` applies to all import entry points or only JSON import. If it applies broadly, add equivalent size checks to legacy file import and its UI flow.
2. Add a client-side hard stop for JSON files `>100 MB` before calling `File.text()`.
3. Move JSON-schema validation earlier in the import path if the spec wording is to remain "before parsing", or amend the spec to match the current deserialize-then-validate pipeline.
4. Decide whether task `9.3` should mean:
   - escape on render only, or
   - destructive stripping/sanitization of imported `name` and `description`
   The current code and tests implement the first; the spec currently says the second.
5. If the spec remains unchanged, replace the current XSS E2E expectations with stripping assertions and add backend/unit coverage for sanitized `name` and `description`.
6. Add coverage for:
   - canceling the `>10 MB` confirmation
   - persisted `drop-ref` end-to-end behavior
   - any legacy import size limits that are added

## Final Assessment

Task `9` is **partially complete**.

- `9.1`: incomplete
- `9.2`: partially complete
- `9.3`: partially complete, with a spec/implementation contradiction on name/description sanitization
