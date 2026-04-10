# Code Review: Chunk 6 — Test Migration and Verification

Plan source: `openspec/changes/add-spell-ui-design-and-accessibility/tasks.md` (Chunk 6 only, lines 206-320)

Method: Three sequential read-only review passes focused on spec completeness, spec accuracy, and edge cases/gaps. Findings below were deduplicated and verified against the current implementation files.

## Summary

Total: 6 findings — 0 Critical, 1 High, 4 Medium, 1 Low

## Findings

### Critical

None.

### High

[H-001] (62) — Backend `Save Error` path still uses modal coverage despite the migration bullet requiring inline assertion

Plan ref: `tasks.md` line 232 — `apps/desktop/tests/spell_editor_canon_first.spec.ts` lines 575-583: `<dialog>` "Save Error" heading -> replace `<dialog>` check with inline error assertion, remove `handleCustomModal``. Related boundary rule: `tasks.md` line 270 — `Test: Modal usage remains reserved for destructive confirmations, blocking choices, and rare high-severity errors in the touched flows.`

Location: `apps/desktop/tests/spell_editor_canon_first.spec.ts` lines 589, 607, 614; `README.md` line 153; `docs/dev/spell_editor_components.md` line 1122; `docs/ARCHITECTURE.md` line 220

Detail: The current test still expects a visible `Save Error` dialog and dismisses it with `handleCustomModal(page, "OK")`. That directly conflicts with the literal migration requirement to replace that check with an inline error assertion. At the same time, the updated documentation now codifies backend persistence failure as a modal path. The implementation is internally consistent, but it no longer matches the migration bullet as written, so the fix step needs to reconcile the plan and the intended behavior.

### Medium

[M-001] (48) — Screen-reader announcement verification is only documented/manual; spoken output remains unverified

Plan ref: `tasks.md` line 254 — `Test: Screen reader validation announcements verify the chosen error-announcement model behaves consistently and error text is associated with the owning field.`

Location: `apps/desktop/tests/accessibility_and_resize.spec.ts` line 468; `docs/TESTING.md` lines 1061, 1074, 1104

Detail: Playwright verifies `aria-invalid`, `aria-describedby`, and first-invalid focus for the spell-name field, but `docs/TESTING.md` explicitly states that the automated tests `do not capture spoken output` and that spoken announcements `are not on file` until the manual evidence table is completed. Chunk 6 requires verification that announcements behave consistently; the current implementation proves DOM wiring plus a manual procedure, but not the spoken-output result itself.

[M-002] (44) — Transition behavior is functionally tested, but the required animation itself is never verified

Plan ref: `tasks.md` line 246 — `Test: Conditional field transitions animate and collapse cleanly when controlling fields change.`

Location: `apps/desktop/tests/spell_editor_save_workflow.spec.ts` lines 601, 629; `apps/desktop/tests/spell_editor_visual.spec.ts` lines 292-383

Detail: The workflow tests prove that School/Sphere fields swap correctly, stale errors clear, and only the active wrapper remains. The screenshot suite cannot verify motion because all relevant shots disable animation with `animations: "disabled"`. There is no assertion covering the required fade-in behavior or that collapse resolves without flicker/jank.

[M-003] (39) — Hash-copy notification path does not verify the required no-focus-shift behavior

Plan ref: `tasks.md` line 269 — `Test: Clipboard copy success is announced through the toast/live-region channel without shifting focus.`

Location: `apps/desktop/tests/theme_and_feedback.spec.ts` lines 330-347, 350-378; comparison control in `apps/desktop/tests/spell_editor_save_workflow.spec.ts` lines 223-230, 776-780

Detail: The hash-copy test checks toast delivery through the `OUTPUT` live region and absence of blocking dialogs, but it never asserts that focus remains on the trigger or otherwise avoids shifting into the toast UI. Other toast flows in `spell_editor_save_workflow.spec.ts` do make that assertion by checking that the dismiss button is not focused. The hash-copy path is missing the same verification the plan explicitly calls for.

[M-004] (34) — Preserved-dialog verification covers only part of the `modal_review.md` inventory

Plan ref: `tasks.md` line 271 — `Verify preserved dialogs identified in modal_review.md remain modal after the modal implementation changes.`

Location: `openspec/changes/add-spell-ui-design-and-accessibility/modal_review.md` lines 10, 16, 24, 32, 35; current preserved-dialog tests at `apps/desktop/tests/accessibility_and_resize.spec.ts` line 377 and `apps/desktop/tests/spell_editor_canon_first.spec.ts` lines 589, 1063, 1308

Detail: The current suite clearly exercises unsaved-changes dialogs and the backend `Save Error` modal, but the preserved inventory also includes delete spell, reparse-from-artifact, delete saved search, restore confirm, and startup vault-integrity dialogs. Those preserved entries are not correspondingly verified in the current Playwright suite, so the `modal_review.md` preservation check is only partially implemented.

### Low

[L-001] (18) — Migration checklist points to stale line numbers

Plan ref: `tasks.md` lines 226-232 — the migration bullets for `spell_editor_structured_data.spec.ts` and `spell_editor_canon_first.spec.ts`

Location: `openspec/changes/add-spell-ui-design-and-accessibility/tasks.md` lines 226-232 versus current implementations at `apps/desktop/tests/spell_editor_structured_data.spec.ts` lines 121, 141, 468, 533, 750 and `apps/desktop/tests/spell_editor_canon_first.spec.ts` line 589

Detail: The intended migrated scenarios are present, but the checklist still points at old line ranges (`62-70`, `84-94`, `290-297`, `340-353`, `541-544`, `575-583`) that no longer match the file layout. That makes the plan harder to audit and can send future fix work to the wrong location.