# PR Review Summary (Branch vs `main`)

- Date: 2026-04-19
- Branch: `add-spell-ui-design-and-accessibility`
- Diff basis: `main...HEAD`
- Method: 6 parallel focused reviews (security, code quality, bugs, race, test flakiness, maintainability)

## 1. Security issue

- Verdict: No material security findings.
- Summary:
- No newly introduced exploitable injection, unsafe deserialization, filesystem abuse, command execution, auth bypass, or sensitive-data leak path was identified.
- Security-relevant backend changes appear to harden debug-only command handling in `apps/desktop/src-tauri/src/lib.rs:74` and `apps/desktop/src-tauri/src/commands/characters.rs:16,962,985,1009`.
- Residual risk:
- Debug-only seed IPC commands remain available in debug builds (`apps/desktop/src-tauri/src/lib.rs:74-82`), so a renderer compromise in a debug binary could still modify local vault data.

## 2. Code quality

- Verdict: Net improvements exist, but there are material quality regressions in core editor boundaries.
- Findings:
- [high] Divergent parser hydration paths for the same domain model in `apps/desktop/src/ui/SpellEditor.tsx:1211` (legacy fallback path vs canonical `buildParserTasks`) increase drift risk and inconsistency.
- [medium] E2E fault-injection hooks are embedded in production UI paths (`apps/desktop/src/ui/SpellEditor.tsx:104`, `apps/desktop/src/ui/CharacterEditor.tsx:1054`), weakening abstraction boundaries.
- [low] Validation focus target is stringly typed in `apps/desktop/src/ui/spellEditorValidation.ts:56`, reducing compile-time guarantees.
- Residual risk:
- The branch is large; additional consistency issues may exist outside the highest-risk files reviewed.

## 3. Bugs

- Verdict: One likely functional regression was identified.
- Findings:
- [medium] Selecting a saved search appears to stop auto-executing search in `apps/desktop/src/ui/Library.tsx:650`; execution appears mount-only (`:325`) or manual button/Enter, which can leave stale results that do not match displayed filters.
- Residual risk:
- Given branch size and UI scope, additional edge-case regressions may still exist.

## 4. Race

- Verdict: One high-impact async ordering hazard was identified.
- Findings:
- [high] In `apps/desktop/src/ui/SpellEditor.tsx:915`, form reset is delayed with a timer (`:916-920`) while load completion clears loading in `finally` (`:1270-1275`) without a `catch`; if `get_spell` fails quickly, stale form state may remain and later save can call `update_spell` with stale data (`:2109`).
- Residual risk:
- Other async flows looked generally guarded, but this failure-path stale-write risk is material.

## 5. Test flakiness

- Verdict: The branch introduces material flakiness risk in E2E coverage.
- Findings:
- [high] Test mutates private runtime invoke internals in `apps/desktop/tests/spellbook_app_open_spell.spec.ts:186`, tightly coupling to internal invoke timing/plumbing.
- [medium] Multiple fixed sleeps (`waitForTimeout(500)`) are used as readiness gates in `apps/desktop/tests/accessibility_and_resize.spec.ts:53`, increasing CI timing sensitivity.
- [medium] Conditional runtime skip in `apps/desktop/tests/accessibility_and_resize.spec.ts:76` can make run-vs-skip nondeterministic based on resize timing.
- [low] Storybook startup uses free-port probe then delayed spawn in `apps/desktop/tests/spell_editor_visual.spec.ts:95` (TOCTOU port-race risk).
- Residual risk:
- Large E2E/visual test additions still include explicit time-based waits that can continue to flake.

## 6. Maintainability of the code

- Verdict: Maintainability regressed in several central surfaces.
- Findings:
- [high] `apps/desktop/src/ui/SpellEditor.tsx:657` continues accumulating responsibilities (validation orchestration, save flow, rendering), increasing blast radius.
- [medium] Test-only behavior branches in production code (`apps/desktop/src/ui/SpellEditor.tsx:104`, with related paths at `:124`, `:663`, `:2102`) increase cognitive load and hidden behavior.
- [medium] Filter state logic is duplicated across workflows in `apps/desktop/src/ui/Library.tsx:156,186,269,285,330`, making change propagation error-prone.
- [medium] Tests are coupled to async-search internals through DOM attributes from `apps/desktop/src/ui/Library.tsx:748` and polling in `apps/desktop/tests/page-objects/SpellbookApp.ts:106`.
- [medium] `apps/desktop/tests/page-objects/SpellbookApp.ts:99` has become a broad cross-domain abstraction, increasing scenario coupling and refactor friction.
- Residual risk:
- Future editor and search/filter changes are likely to require high-touch edits across UI and E2E layers.

## Consolidated Priority

- Immediate triage:
- [high] Race-condition stale write path in `SpellEditor` load/save lifecycle.
- [high] Test flakiness from runtime invoke monkeypatching and sleep-based synchronization.
- [high] Maintainability pressure from `SpellEditor` centralization.
- Next pass:
- [medium] Saved-search behavior regression in `Library`.
- [medium] Remove production-embedded E2E hooks or isolate behind stronger build/test boundaries.
