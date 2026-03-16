# Review: Task 8 Implementation - Three Pass Review

## Findings

### Medium: Direct spell writes persist pre-normalization flat columns after canonical validation

- Scope: Task 8.2 `Validate all fields against schema before insertion after required normalization/truncation preprocessing`
- Files:
  - `C:\Users\vitki\OneDrive\GitHub\runecalico-ai\second_edition_spellbook\apps\desktop\src-tauri\src\commands\spells.rs:605`
  - `C:\Users\vitki\OneDrive\GitHub\runecalico-ai\second_edition_spellbook\apps\desktop\src-tauri\src\commands\spells.rs:615`
  - `C:\Users\vitki\OneDrive\GitHub\runecalico-ai\second_edition_spellbook\apps\desktop\src-tauri\src\commands\spells.rs:892`
  - `C:\Users\vitki\OneDrive\GitHub\runecalico-ai\second_edition_spellbook\apps\desktop\src-tauri\src\commands\spells.rs:903`
  - `C:\Users\vitki\OneDrive\GitHub\runecalico-ai\second_edition_spellbook\apps\desktop\src-tauri\src\commands\spells.rs:990`
  - `C:\Users\vitki\OneDrive\GitHub\runecalico-ai\second_edition_spellbook\apps\desktop\src-tauri\src\commands\spells.rs:1005`
  - `C:\Users\vitki\OneDrive\GitHub\runecalico-ai\second_edition_spellbook\apps\desktop\src-tauri\src\commands\import.rs:564`
  - `C:\Users\vitki\OneDrive\GitHub\runecalico-ai\second_edition_spellbook\apps\desktop\src-tauri\src\commands\import.rs:1229`

`canonicalize_spell_detail()` correctly converts request data into a `CanonicalSpell`, runs normalization, then validates via `compute_hash()`. But the direct CRUD write paths in `spells.rs` do not persist the normalized canonical values into the flat DB columns. They write the original request fields (`spell.name`, `spell.description`, `spell.class_list`, `spell.tags`, and related text columns) while only `canonical_data` and `content_hash` come from the post-normalization canonical object. That means the inserted or updated row is not wholly composed of post-normalization, schema-validated values, which misses the Task 8.2 requirement as written. The import path already avoids this mismatch by converting the processed canonical spell back into flat row values with `canonical_spell_to_flat_row()`, so the inconsistency is isolated to direct-write flows.

Implementation direction:
- Build flat write values from the canonical spell in `spells.rs`, matching the import path.
- Add regression tests proving `create_spell`, `upsert_spell`, and `apply_spell_update_with_conn` persist normalized values into flat columns.

### Medium: Long-field rejection happens only after whitespace-collapsing normalization

- Scope: Task 8.2 `Reject spells with excessively long fields (DoS prevention)`
- Files:
  - `C:\Users\vitki\OneDrive\GitHub\runecalico-ai\second_edition_spellbook\apps\desktop\src-tauri\src\models\canonical_spell.rs:564`
  - `C:\Users\vitki\OneDrive\GitHub\runecalico-ai\second_edition_spellbook\apps\desktop\src-tauri\src\models\canonical_spell.rs:783`
  - `C:\Users\vitki\OneDrive\GitHub\runecalico-ai\second_edition_spellbook\apps\desktop\src-tauri\src\models\canonical_spell.rs:971`
  - `C:\Users\vitki\OneDrive\GitHub\runecalico-ai\second_edition_spellbook\apps\desktop\src-tauri\src\commands\import.rs:466`
  - `C:\Users\vitki\OneDrive\GitHub\runecalico-ai\second_edition_spellbook\apps\desktop\src-tauri\src\commands\spells.rs:492`

The max-length policy is enforced through schema validation after `normalize()` runs. `normalize_string()` collapses whitespace aggressively for structured fields and collapses horizontal whitespace for textual fields. As a result, an attacker can submit a raw field that is far over the intended limit, but still have it accepted if normalization shrinks it under the schema `maxLength`. That is a real DoS gap for the checklist item: oversized attacker-controlled text is still accepted and processed instead of being rejected on input length. The current tests appear to cover oversized fields made of non-collapsible characters, but not whitespace-inflated payloads that normalize below the cap.

Implementation direction:
- Enforce raw pre-normalization length caps on the attacker-controlled text fields covered by Task 8.2, before normalization collapses whitespace.
- Add regressions for whitespace-inflated `name`, `description`, `author`, and `SourceRef` members on both import and direct-write paths.

## Scope

Reviewed against:
- `C:\Users\vitki\OneDrive\GitHub\runecalico-ai\second_edition_spellbook\openspec\changes\integrate-spell-hashing-ecosystem\tasks.md` Task 8
- `C:\Users\vitki\OneDrive\GitHub\runecalico-ai\second_edition_spellbook\openspec\changes\integrate-spell-hashing-ecosystem\plan-task-8-security.md`

Review method:
- Three-pass review
- One subagent per Task 8 leaf item
- Local verification of any reported issue before inclusion

Task 8 leaf items reviewed:
1. Audit all database queries use parameterized statements
2. FTS uses a single bound `MATCH` parameter and escapes special syntax before binding
3. FTS query construction avoids user-controlled string concatenation
4. Malicious search inputs are covered by tests
5. All fields are validated against schema after required preprocessing
6. Excessively long fields are rejected
7. Spell names and descriptions render safely

## Pass 1 - Spec Compliance

Verdict: Fails due to the two findings above.

Confirmed:
- Search uses bound parameters for `MATCH` and `LIKE`, with only hardcoded SQL fragments interpolated.
- Search tests cover malicious FTS payloads, malformed operators, and wildcard-heavy `LIKE` inputs.
- Display paths in React render spell text as text nodes, and Python HTML export escapes attacker-controlled spell content.

Failed:
- Direct CRUD writes do not fully persist post-normalization, schema-validated values.
- Long-field rejection is incomplete because validation runs only after normalization can shrink raw attacker input.

## Pass 2 - Code Quality

Verdict: Mixed.

Strengths:
- The import path has a cleaner contract than direct writes by deriving flat columns from the processed canonical spell.
- Search query construction is disciplined and intentionally documents the hardcoded dynamic fragments.
- Export HTML output uses explicit escaping on attacker-controlled content.

Risks:
- `spell` table flat columns can drift away from the validated canonical form on direct-write paths.
- Raw oversized payloads can still consume normalization and validation work even when the logical field limits are meant to prevent that.

## Pass 3 - Verification

Verdict: Partial.

What was verified:
- Local static verification of both reported issues against the current workspace code.
- Subagent review coverage for every Task 8 leaf item.

What was not executed in this review session:
- `cargo test` or other automated suites. The shell environment here did not reliably start the Rust toolchain, so this artifact is based on code inspection plus subagent review rather than fresh command output.

Test gaps that remain after the review:
- No direct-write regression proving normalized canonical values are also what land in flat DB columns.
- No regression proving whitespace-inflated raw fields are rejected before normalization shrinks them under schema limits.
- Search coverage is strong, but there is still no exhaustive live `MATCH` test sweep for every non-quote FTS metacharacter.
- XSS coverage is strongest in general JSON preview/export flows, not in every individual import-conflict rendering surface.

## Per-Item Results

### 8.1.1 Parameterized statements

- Subagent result: No findings
- Residual gap: the audit covered the cited query sites, not literally every database query in the repository

### 8.1.2 Single bound `MATCH` parameter and FTS escaping

- Subagent result: No findings
- Residual gap: no exhaustive live `MATCH` test sweep for all non-quote FTS metacharacters

### 8.1.3 No unsafe FTS string concatenation

- Subagent result: No findings
- Residual gap: verification here was static, not test-executed

### 8.1.4 Malicious-input testing

- Subagent result: No findings
- Residual gap: targeted search tests were not executed in this review session

### 8.2.1 Schema validation after preprocessing

- Subagent result: Medium finding
- Accepted into final review after local verification

### 8.2.2 Reject excessively long fields

- Subagent result: Medium finding
- Accepted into final review after local verification

### 8.2.3 Safe display of names and descriptions

- Subagent result: No findings
- Residual gap: test evidence is less explicit for every import-conflict subview than for the main preview/export flows

## Outcome

Task 8 is close, but not complete. Search-side SQL hardening and display-side XSS handling review clean. The remaining work is in Task 8.2:
- make direct spell writes persist canonical normalized values into flat columns
- reject oversized attacker-controlled text before normalization can shrink it under schema caps
