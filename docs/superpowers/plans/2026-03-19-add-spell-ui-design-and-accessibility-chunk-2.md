# Chunk 2: Spell Editor Validation and Save Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Chunk 2 of `add-spell-ui-design-and-accessibility`: inline spell-editor validation, accessible error association and focus behavior, delayed save-progress feedback, success toast after navigation to Library, and the required test migrations away from routine validation modals.

**Architecture:** Keep the existing Tauri save path and route flow intact, but replace the current `SpellEditor.tsx` validation model, which combines always-on inline invalid state with a save-time modal summary, with a small pure validation module consumed by `SpellEditor.tsx`. Use that module to drive touched and submit-attempt-based field error rendering, dependent-field revalidation, and first-invalid focus. Reuse the existing Zustand notification store for save success so the toast survives route navigation and renders on the Library view without adding new global infrastructure.

**Tech Stack:** React 18, React Router 6, Zustand, Tailwind CSS, Vitest, Playwright, Tauri desktop runtime.

---

## File Map

**Modify**
- `docs/superpowers/plans/2026-03-19-add-spell-ui-design-and-accessibility-chunk-2.md`
- `apps/desktop/src/globals.d.ts` (Playwright-only `Window` hooks for Task 7 E2E)
- `apps/desktop/src/ui/SpellEditor.tsx`
- `apps/desktop/src/ui/Library.tsx`
- `apps/desktop/src/ui/components/structured/ScalarInput.tsx`
- `apps/desktop/src/ui/components/structured/StructuredFieldInput.tsx`
- `apps/desktop/src/ui/components/structured/AreaForm.tsx`
- `apps/desktop/tests/spell_editor_structured_data.spec.ts`
- `apps/desktop/tests/spell_editor_canon_first.spec.ts`
- `apps/desktop/tests/character_profiles_foundation_one.spec.ts`
- `apps/desktop/tests/character_search_filters.spec.ts`
- `apps/desktop/tests/epic_and_quest_spells.spec.ts`
- `apps/desktop/tests/e2e.spec.ts`
- `apps/desktop/tests/repro_bugs.spec.ts`
- `apps/desktop/tests/page-objects/SpellbookApp.ts`

**Verify / Smoke Only Unless Helper Fallout Forces Edits**
- `apps/desktop/tests/character_master_workflow.spec.ts`
- `apps/desktop/tests/character_remediation.spec.ts`
- `apps/desktop/tests/character_snapshots.spec.ts`
- `apps/desktop/tests/import_conflict_resolution.spec.ts`
- `apps/desktop/tests/spell_notes_persistence.spec.ts`
- `apps/desktop/tests/theme_and_feedback.spec.ts`
- `apps/desktop/tests/vault.spec.ts`

**Create**
- `apps/desktop/src/ui/spellEditorValidation.ts`
- `apps/desktop/src/ui/spellEditorValidation.test.ts`
- `apps/desktop/src/ui/Library.test.tsx`
- `apps/desktop/src/ui/SpellEditor.test.tsx`
- `apps/desktop/tests/spell_editor_save_workflow.spec.ts`

**Reuse Without Modification Unless Tests Prove Necessary**
- `apps/desktop/src/store/useNotifications.ts`
- `apps/desktop/src/ui/components/NotificationViewport.tsx`
- `apps/desktop/tests/utils/dialog-handler.ts`

**Constraints**
- Reuse existing dependencies only. Do not add packages.
- Preserve modal usage for unsaved-changes confirmation, delete confirmation, and real save failures returned from Tauri.
- Do not change backend save/hash contracts in `src-tauri`; Chunk 2 is frontend-only.
- Preserve the existing tradition-validation testids already present in the editor, including `error-school-required-arcane`, `error-sphere-required-divine`, `error-school-required-arcane-tradition`, and `error-tradition-conflict`. Introduce `spell-name-error` as the new spec-required replacement for the current `error-name-required` surface.
- Treat the save button as disabled in three cases only: parser work is pending, a save is in flight, or the user has already attempted submit and blocking validation errors still exist. The visible `Saving…` label is delayed until the save has been pending for 300ms.
- Build a debug Tauri binary before Playwright checkpoints in this chunk. The current fixture runs the Tauri debug binary with a Vite dev-server override, so `pnpm --dir apps/desktop tauri:build --debug` is the executable prerequisite on a clean workspace even though frontend changes are ultimately served through the override.
- Keep Playwright execution serial for this chunk, matching the current fixture and config assumptions.
- Documentation file edits remain out of scope for this Chunk 2 implementation plan and are deferred to the change-wide documentation work in Chunk 6. This plan must still produce a `Chunk 6 documentation handoff` section appended to this plan file when implementation completes, with one bullet per deferred doc target covering the exact deltas discovered here for user, overview, developer, testing, and architecture documentation.

## Task 1: Extract the Validation Model Into a Pure Helper

**Files:**
- Create: `apps/desktop/src/ui/spellEditorValidation.ts`
- Test: `apps/desktop/src/ui/spellEditorValidation.test.ts`
- Modify: `apps/desktop/src/ui/SpellEditor.tsx`

- [x] **Step 1: Write failing unit tests for the validation helper**

Cover these rule combinations in `apps/desktop/src/ui/spellEditorValidation.test.ts`:
- empty name returns the `spell-name-error` field error
- empty description preserves the existing description-required validation
- invalid level preserves the existing level-range validation
- Arcane tradition with no school returns `error-school-required-arcane-tradition`
- Arcane tradition with no school does not also surface `error-tradition-conflict`
- Epic level without school returns `error-school-required-arcane`
- Epic spell with priest/cleric style classes returns a new client-side Arcane-only class restriction error that replaces the current backend-only Save Error path in the targeted validation scenarios
- Divine tradition with no sphere returns `error-sphere-required-divine-tradition`
- Quest spell without sphere returns `error-sphere-required-divine`
- epic-plus-quest conflict preserves the existing blocking validation
- cantrip/quest gating preserves the existing current constraints during helper extraction
- school plus sphere conflict returns `error-tradition-conflict`
- valid spell returns no field errors

Assert exact user-facing copy for the non-scalar validation messages above so generic fallback text like `Invalid value` cannot slip in.
Also assert exact helper-message copy for one scalar field from each in-scope surface:
- one `ScalarInput.tsx` field
- one `StructuredFieldInput.tsx` field
- one `AreaForm.tsx` field

Generic fallback strings are not acceptable for any Chunk 2 scalar validation message surface.

Define the new epic divine-class restriction surface explicitly:
- testid: `error-epic-arcane-class-restriction`
- message: `Epic spells are Arcane only and require Wizard/Mage class access.`

Keep the helper tests pure and Node-safe. Do not put DOM or React rendering into this file.

- [x] **Step 2: Run the helper test to confirm failure**

Run: `pnpm --dir apps/desktop test:unit -- src/ui/spellEditorValidation.test.ts`
Expected: FAIL because the helper file does not exist yet.

- [x] **Step 3: Implement the pure validation helper**

Create `apps/desktop/src/ui/spellEditorValidation.ts` with:
- a typed field key union for all validated inputs and selects used in Chunk 2
- a typed error shape carrying `field`, `message`, `testId`, and `focusTarget`
- a pure function that derives all validation errors from the current spell form, current `tradition`, and derived flags
- a deterministic focus order helper so first-invalid focus does not depend on DOM query order

The helper must cover the structured scalar inputs touched by Chunk 2, not only the top-of-form fields. In-scope scalar targets are:
- range and duration base-value or per-level inputs rendered through `ScalarInput.tsx`
- casting-time numeric inputs rendered directly in `StructuredFieldInput.tsx` (`casting-time-base-value`, `casting-time-per-level`)
- area dimension inputs from `AreaForm.tsx` such as radius, length, width, height, thickness, edge, surface area, volume, tile count, and count

Preserve the existing `casting-time-level-divisor` clamp-to-1 behavior instead of inventing a new inline error path for that field.
Preserve the current clamp-on-change behavior for the other structured numeric inputs as well unless implementation intentionally broadens scope; do not require new blur-reachable negative-number UI states for this chunk.

Use specific messages rather than a generic invalid string, and preserve the repo's current non-negative scalar semantics unless a field already has a stricter existing rule. Default patterns:
- `Base value must be 0 or greater`
- `Length must be 0 or greater`
- `Radius must be 0 or greater`

Use the helper to centralize the existing rules now embedded in `SpellEditor.tsx`:

```ts
export interface SpellEditorFieldError {
  field: string;
  testId: string;
  message: string;
  focusTarget: string;
}
```

For scalar inputs, use the rendered input testid or DOM id as the unique field key so every input can own its own touched state, error id, and focus target. Examples:
- `range-base-value`
- `range-per-level`
- `duration-base-value`
- `area-form-length-value`
- `area-form-radius-per-level`

Keep the top-level named testids from the spec exactly as written, and generate scalar error testids predictably from the input key, for example `error-range-base-value` or `error-area-form-length-value`.

- [x] **Step 4: Re-run the helper test**

Run: `pnpm --dir apps/desktop test:unit -- src/ui/spellEditorValidation.test.ts`
Expected: PASS.

- [x] **Step 5: Run typecheck before wiring the UI**

Run: `pnpm --dir apps/desktop typecheck`
Expected: PASS.

## Task 2: Replace Modal Validation With Inline Field-State in the Editor

**Files:**
- Modify: `apps/desktop/src/ui/SpellEditor.tsx`
- Reuse: `apps/desktop/src/ui/spellEditorValidation.ts`

- [x] **Step 1: Add failing editor tests for submit-attempt state and inline hint behavior**

Before adding these jsdom tests, set up a stable harness: render under a data-router-shaped test harness such as `createMemoryRouter` plus `RouterProvider` or explicitly mock `useBlocker`, stub modal behavior, mock Tauri `invoke`, and reset singleton notification state between tests.

In `apps/desktop/src/ui/SpellEditor.test.tsx`, write failing tests for:
- no save hint while the form is pristine
- pristine required fields do not show inline errors before the first blur or failed submit
- clicking Save with an invalid form renders inline errors and the hint text `Fix the errors above to save`
- fixing the invalid field clears that field's error immediately
- changing `tradition` revalidates `school` and `sphere` immediately
- changing the `tradition` select validates on change rather than waiting for blur or submit
- a newly relevant tradition field fades in with `animate-in fade-in` and the previously relevant field unmounts immediately

Add one explicit assertion for the Arcane-missing-school path:
- `error-school-required-arcane-tradition` is visible
- `error-tradition-conflict` is not visible

For each inline error assertion above, also assert that the error element renders in the same field container as the owning input rather than in a detached summary block.

Put `// @vitest-environment jsdom` at the top of `apps/desktop/src/ui/SpellEditor.test.tsx` so this file can render React DOM under the current Vitest project configuration.

- [x] **Step 2: Run the editor test to confirm failure**

Run: `pnpm --dir apps/desktop test:unit -- src/ui/SpellEditor.test.tsx`
Expected: FAIL because submit-attempt state and inline hint behavior are not implemented yet.

- [x] **Step 3: Add explicit editor validation state**

In `apps/desktop/src/ui/SpellEditor.tsx`, add local state for:
- `hasAttemptedSubmit`
- a per-field error map derived from `spellEditorValidation.ts`
- a touched/validated set that distinguishes blur-driven validation from pristine fields

Rules for this state:
- text inputs and scalar fields validate on blur
- select controls validate on change
- dependent fields revalidate immediately when the controlling value changes
- first submit validates all fields, not only touched fields
- pristine required fields stay quiet until blur or failed submit
- the inline save hint appears only after the first failed submit attempt
- once the first failed submit has happened, keep the save button disabled until the blocking errors are fixed

- [x] **Step 4: Make tradition-driven fields conditional and animated on entry**

Change the school/sphere section in `SpellEditor.tsx` so:
- Arcane shows the School field and hides Sphere
- Divine shows the Sphere field and hides School
- the newly mounted field wrapper receives `animate-in fade-in`
- the hidden field unmounts immediately without an exit animation placeholder
- switching tradition immediately revalidates the newly relevant field and clears stale errors for the hidden field

Coordinate this UI change with the Task 6 Playwright migration work so the branch does not sit in an intermediate state where School or Sphere consumers are broken.

- [x] **Step 5: Remove routine validation modal usage from the save handler**

Change `save()` so this branch:

```ts
if (isInvalid) {
  await modalAlert(validationErrors, "Validation Errors", "error");
  return;
}
```

becomes:
- set `hasAttemptedSubmit`
- populate field errors from the helper
- focus the first invalid field
- disable the save button while blocking validation errors remain after that first attempt
- return without opening a modal

Keep `modalAlert("Save Error")` for real persistence failures thrown by `invoke(...)`.

- [x] **Step 6: Re-run the editor test**

Run: `pnpm --dir apps/desktop test:unit -- src/ui/SpellEditor.test.tsx`
Expected: PASS.

## Task 3: Wire Accessibility, Focus, and Theme-Aware Invalid Styling

**Files:**
- Modify: `apps/desktop/src/ui/SpellEditor.tsx`
- Modify: `apps/desktop/src/ui/components/structured/ScalarInput.tsx`
- Modify: `apps/desktop/src/ui/components/structured/StructuredFieldInput.tsx`
- Modify: `apps/desktop/src/ui/components/structured/AreaForm.tsx`
- Reuse: `apps/desktop/src/ui/spellEditorValidation.ts`
- Test: `apps/desktop/src/ui/SpellEditor.test.tsx`

- [x] **Step 1: Add failing tests for field accessibility wiring**

Extend `apps/desktop/src/ui/SpellEditor.test.tsx` to cover:
- invalid fields receive `aria-invalid="true"`
- each visible inline error is connected through `aria-describedby`
- first failed submit moves focus to the first invalid field
- the tradition conflict banner remains inline and discoverable after focus logic changes
- when an inline validation error first appears, its container carries `animate-in fade-in`

Cover one scalar path from each in-scope surface:
- one range or duration scalar driven by `ScalarInput.tsx`
- one casting-time numeric input from `StructuredFieldInput.tsx`
- one area scalar input from `AreaForm.tsx`

For each structured-field error case above, assert exact field-specific copy, and also assert same-container adjacency between the input and its inline error element. If clamp-on-change semantics are preserved and a blur-reachable invalid UI state does not exist for a given scalar surface, satisfy the copy guarantees at the helper layer and limit runtime coverage to reachable ARIA or container plumbing instead of inventing a new runtime-invalid editing mode.

Also add one test that verifies the new `spell-name-error` testid is rendered in place of the old name error identifier.

- [x] **Step 2: Run the accessibility-focused editor test**

Run: `pnpm --dir apps/desktop test:unit -- src/ui/SpellEditor.test.tsx`
Expected: FAIL on missing ARIA attributes and focus behavior.

- [x] **Step 3: Apply ARIA and focus wiring in `SpellEditor.tsx`**

Implementation requirements:
- give each validated input a stable DOM id and focus target
- set `aria-invalid` only when that field currently has an error
- set `aria-describedby` to the matching inline error id
- keep visible `<label>` elements as the primary accessible name source
- on first failed submit, focus the first invalid field with `preventScroll: false`

Apply the same error plumbing to the in-scope scalar inputs in:
- `ScalarInput.tsx`
- `StructuredFieldInput.tsx`
- `AreaForm.tsx`

Add the missing `spell-name-error` testid while preserving the existing message copy.

- [x] **Step 4: Make invalid, hint, and save-progress styles theme-aware**

Update the touched validation/save styles in `SpellEditor.tsx` so they use light and dark classes similar to `NotificationViewport.tsx` rather than dark-only `neutral-900` assumptions. Limit the styling change to:
- invalid borders and text
- the save hint near the button
- disabled save button state
- any validation container touched by this chunk

Apply equivalent invalid-state and theme-aware styling to the structured scalar surfaces touched by this chunk in:
- `ScalarInput.tsx`
- `StructuredFieldInput.tsx`
- `AreaForm.tsx`

Use existing shared animation utilities for invalid-state motion as well:
- newly shown inline validation feedback uses `animate-in fade-in`
- clearing an inline validation error removes it without leaving detached spacing artifacts

- [x] **Step 5: Re-run the editor test and typecheck**

Run: `pnpm --dir apps/desktop test:unit -- src/ui/SpellEditor.test.tsx`
Expected: PASS.

Run: `pnpm --dir apps/desktop typecheck`
Expected: PASS.

## Task 4: Add Delayed Save Progress and Post-Navigation Success Feedback

**Files:**
- Modify: `apps/desktop/src/ui/SpellEditor.tsx`
- Test: `apps/desktop/src/ui/SpellEditor.test.tsx`

- [x] **Step 1: Add failing tests for the save-progress threshold**

In `apps/desktop/src/ui/SpellEditor.test.tsx`, add fake-timer tests for:
- save label stays `Save Spell` when the mocked save resolves before 300ms and no visible saving state appears before the threshold
- a second immediate save attempt is ignored while the first save is still in flight, even before visible save feedback appears
- save button and any destructive spell-editor action become non-interactive for the duration of the save, and the label becomes `Saving…` only after 300ms if the save is still pending
- editor inputs stop accepting changes once save starts so the submitted payload cannot drift during an in-flight save
- successful save pushes a success notification before navigation
- after a failed submit, the save button is disabled and re-enables only when the blocking errors are cleared
- the editor remains visible until the save promise resolves, then navigation happens

- [x] **Step 2: Run the editor test to confirm failure**

Run: `pnpm --dir apps/desktop test:unit -- src/ui/SpellEditor.test.tsx`
Expected: FAIL because the save threshold behavior is not implemented.

- [x] **Step 3: Implement the 300ms delayed saving state**

In `SpellEditor.tsx`:
- use a save-specific pending state or guard rather than reusing the generic record-loading/reparse state
- start a 300ms timer when the save begins
- if the promise is still pending at 300ms, switch the button label to `Saving…`
- block save re-entry immediately when the first save call starts, even before the 300ms visual threshold, so double-submit cannot occur during fast saves
- clear the timer on success or failure
- preserve the existing fieldset and button gating where practical, and combine parser-pending disable behavior with save-pending state and the post-submit invalid state instead of replacing it

State model clarification:
- internal re-entry guard becomes active immediately on save start
- editor inputs and destructive or save-related actions freeze immediately on save start so the submitted payload cannot diverge while persistence is pending
- visible saving feedback appears only after the 300ms threshold for slow saves; before that, tests should assert the re-entry guard and frozen editor state rather than a changed label
- after a failed submit with blocking validation errors, both the guard and the visible disabled state apply until the errors are fixed

Use three explicit button labels/states:
- pristine or valid idle: `Save Spell`
- slow pending save: `Saving…`
- invalid after failed submit: `Save Spell`, disabled button, and inline hint below the button

- [x] **Step 4: Trigger the toast before navigating back to Library**

After a successful `create_spell` or `update_spell` invoke:
- clear parser fallback state as today
- clear unsaved-state guards as today
- call `pushNotification("success", "Spell saved.")`
- navigate to `/`

Do not delay navigation for the toast; rely on the app-level viewport and Zustand store already mounted in the app shell to render it after routing. No Library-specific toast infrastructure is needed for spell save.

Implement and test both save paths:
- create flow returns to Library and shows success feedback
- edit/update flow returns to Library and shows the same success feedback
- the success toast does not take focus away from the user

- [x] **Step 5: Re-run the editor test**

Run: `pnpm --dir apps/desktop test:unit -- src/ui/SpellEditor.test.tsx`
Expected: PASS.

## Task 5: Replace Routine Library Alerts in Touched Flows With Notifications

**Files:**
- Modify: `apps/desktop/src/ui/Library.tsx`
- Create: `apps/desktop/src/ui/Library.test.tsx`
- Reuse: `apps/desktop/src/store/useNotifications.ts`

- [x] **Step 1: Identify the touched Library alert flows in code and lock them into the plan implementation**

Convert the current `alert(...)` usage in `Library.tsx` for:
- add-to-character success
- add-to-character failure
- save-search failure
- delete-saved-search failure

Use `pushNotification(...)` for routine status instead of browser alerts.

- [x] **Step 2: Add failing deterministic unit/component coverage for all enumerated touched Library notification replacements**

Add assertions in `apps/desktop/src/ui/Library.test.tsx` that verify:
- add-to-character success shows a toast instead of opening an alert dialog
- add-to-character failure shows a toast instead of opening an alert dialog
- save-search failure shows a toast instead of opening an alert dialog
- delete-saved-search failure shows a toast instead of opening an alert dialog
- the toast does not take focus from the triggering control
- the notification is emitted through the existing `notification-viewport` live region rather than a disconnected local container

Mock the relevant `invoke(...)` calls so failure paths are deterministic instead of relying on E2E fault injection.
Stub `window.confirm` to the affirmative path where needed and spy or stub `window.alert` so the pre-migration branches execute deterministically and the test can prove those alert paths were replaced.

Put `// @vitest-environment jsdom` at the top of `apps/desktop/src/ui/Library.test.tsx` so it runs correctly under the current Node-based unit project.

Render `Library.test.tsx` with the global notification viewport present, either by mounting the app shell or by explicitly rendering `NotificationViewport` alongside `Library`, so the live-region assertions target the real notification surface.

- [x] **Step 3: Implement the Library-side notification replacements**

Wire `Library.tsx` to the existing notification store and remove the routine `alert(...)` calls listed above. Leave truly blocking/destructive flows modal if encountered, but do not use routine OK alerts in the touched Library surface after this task.

- [x] **Step 4: Re-run the touched Library notification coverage**

Run: `pnpm --dir apps/desktop test:unit -- src/ui/Library.test.tsx`
Expected: PASS.

## Task 6: Migrate Existing Playwright Validation Tests Away From Routine Modals

**Files:**
- Modify: `apps/desktop/tests/spell_editor_structured_data.spec.ts`
- Modify: `apps/desktop/tests/spell_editor_canon_first.spec.ts`
- Modify: `apps/desktop/tests/character_profiles_foundation_one.spec.ts`
- Modify: `apps/desktop/tests/character_search_filters.spec.ts`
- Modify: `apps/desktop/tests/epic_and_quest_spells.spec.ts`
- Modify: `apps/desktop/tests/e2e.spec.ts`
- Modify: `apps/desktop/tests/repro_bugs.spec.ts`
- Modify: `apps/desktop/tests/page-objects/SpellbookApp.ts`
- Verify / smoke only unless helper fallout forces edits: `apps/desktop/tests/character_master_workflow.spec.ts`, `apps/desktop/tests/character_remediation.spec.ts`, `apps/desktop/tests/character_snapshots.spec.ts`, `apps/desktop/tests/import_conflict_resolution.spec.ts`, `apps/desktop/tests/spell_notes_persistence.spec.ts`, `apps/desktop/tests/theme_and_feedback.spec.ts`, `apps/desktop/tests/vault.spec.ts`

- [x] **Step 1: Add any missing page-object helpers before touching assertions**

Treat the `SpellbookApp.ts` helper update as a blocking prerequisite for the conditional School/Sphere rendering change, not a cleanup task after assertion rewrites.

Extend `SpellbookApp.ts` only if it reduces duplication in the touched specs. Useful helpers for Chunk 2:
- `expectFieldError(testId: string)`
- `expectSaveHint()`
- `expectSuccessToast(message: string)`
- `setTradition("ARCANE" | "DIVINE")` inside `createSpell()` or as a dedicated helper so School/Sphere filling stays valid after the conditional-field change

Do not add helpers that are used once.

- [x] **Step 2: Rewrite the existing migration targets to assert inline validation only**

Before repurposing the current backend-rejected epic cleric save case, add or preserve one dedicated backend `Save Error` modal assertion elsewhere in the same file or a nearby focused spec so backend persistence-failure coverage never drops during the migration.

Update the spec-defined locations so they follow this pattern:

```ts
await page.getByTestId("btn-save-spell").click();
await expect(page.getByTestId("error-school-required-arcane")).toBeVisible();
await expect(page.getByRole("dialog")).not.toBeVisible();
```

Required migrations:
- `apps/desktop/tests/spell_editor_structured_data.spec.ts` for epic school, quest sphere, arcane tradition, tradition conflict, and save-without-name
- `apps/desktop/tests/spell_editor_canon_first.spec.ts` for the backend-rejected epic cleric save case, moving the Arcane-only class restriction into client-side validation and replacing the routine modal assertion with the corresponding inline error assertion after dedicated backend-failure coverage is preserved
- `apps/desktop/tests/epic_and_quest_spells.spec.ts` for the epic priest restriction flow

Do not mass-remove `handleCustomModal` or modal assertions. Remove them only from the routine validation cases named above; preserve backend failure coverage and out-of-scope modal flows exactly as listed below.

Re-scope tradition-conflict assertions to valid UI paths under conditional School/Sphere rendering:
- new-spell flows should no longer try to type both fields at once
- conflict-blocking coverage should use a concrete seeded source: import or load an existing spell record fixture that already contains both School and Sphere, then verify the inline conflict error on edit rather than trying to create the conflict live in a new-spell flow

Shared-helper fallout checks:
- update `apps/desktop/tests/character_profiles_foundation_one.spec.ts` so Divine spell creation still works through the revised `createSpell()` helper
- update `apps/desktop/tests/character_search_filters.spec.ts` so quest/divine spell setup still works through the revised helper
- update `apps/desktop/tests/e2e.spec.ts` for the direct School-field assertions affected by conditional rendering
- update `apps/desktop/tests/repro_bugs.spec.ts` for the direct School-field locator path affected by conditional rendering
- run smoke coverage for the other current `createSpell()` consumers after helper changes: `apps/desktop/tests/character_master_workflow.spec.ts`, `apps/desktop/tests/character_remediation.spec.ts`, `apps/desktop/tests/character_snapshots.spec.ts`, `apps/desktop/tests/import_conflict_resolution.spec.ts`, `apps/desktop/tests/spell_notes_persistence.spec.ts`, `apps/desktop/tests/vault.spec.ts`, and `apps/desktop/tests/theme_and_feedback.spec.ts`

- [x] **Step 3: Preserve the explicitly out-of-scope modal coverage**

Leave these behaviors unchanged:
- at least one backend-driven `Save Error` modal assertion in `apps/desktop/tests/spell_editor_canon_first.spec.ts` or a nearby focused spec so real Tauri persistence failures remain covered even after the backend-rejected epic cleric save case is repurposed
- unsaved-changes modals in `spell_editor_canon_first.spec.ts`
- delete confirmation through `handleDelete()` / `btn-delete-spell`
- delete-failure `Delete Error` modal behavior in `SpellEditor.tsx`
- parser-fallback `Reparse Error` modal behavior in `SpellEditor.tsx`
- blocking dialog dismissal in the unparsed-fields navigation-guard dismissal flow in `spell_editor_structured_data.spec.ts`
- import, vault, and character modal flows

- [x] **Step 4: Build the debug Tauri app and run the migrated Playwright files**

Run: `pnpm --dir apps/desktop tauri:build --debug`
Expected: PASS.

Run: `cd apps/desktop; npx playwright test tests/spell_editor_structured_data.spec.ts tests/spell_editor_canon_first.spec.ts tests/epic_and_quest_spells.spec.ts tests/character_profiles_foundation_one.spec.ts tests/character_search_filters.spec.ts tests/e2e.spec.ts tests/character_master_workflow.spec.ts tests/character_remediation.spec.ts tests/character_snapshots.spec.ts tests/import_conflict_resolution.spec.ts tests/repro_bugs.spec.ts tests/spell_notes_persistence.spec.ts tests/vault.spec.ts tests/theme_and_feedback.spec.ts`
Expected: PASS.

## Task 7: Add Playwright Coverage for Save Workflow and First-Failed-Submit UX

**Files:**
- Create: `apps/desktop/tests/spell_editor_save_workflow.spec.ts`
- Reuse: `apps/desktop/tests/page-objects/SpellbookApp.ts`

- [x] **Step 1: Write the failing save-workflow spec**

Create `apps/desktop/tests/spell_editor_save_workflow.spec.ts` with these cases:
- new spell save returns to Library and shows `toast-notification-success`
- existing spell update returns to Library and shows `toast-notification-success`
- editing a legacy spell through basic fields only remains unblocked, saves successfully, and shows the updated name in the Library list after return
- editing a legacy spell by upgrading one structured field saves successfully, returns to Library, and shows the updated structured value after reopening the spell
- saved spell is visible in the Library after navigation
- keyboard-only spell creation and save works end-to-end with visible focus indication on the interactive path
- first failed submit shows `Fix the errors above to save`
- first failed submit moves focus to the first invalid field
- blur validation shows and clears the name error without any modal
- changing tradition immediately revalidates school and sphere requirements
- switching tradition mounts the newly relevant field container with `animate-in fade-in` and removes the previously relevant field without a lingering gap
- blur validation covers at least one structured scalar field using the specific non-negative validation message
- slow-save coverage proves the editor stays in place until the save resolves, then navigates to Library

Add explicit modal-boundary assertions in this spec:
- routine validation failure does not open a dialog
- delete confirmation still opens a blocking dialog
- save-success toast appears without taking focus
- save-success toast is delivered through the global notification viewport / polite live region

Add one Library-side routine-status assertion here or in a neighboring touched spec so the modal-replacement requirement is checked outside the editor surface and not only in the final audit step.

Treat saved-spell discoverability as a required outcome, not an assumption. If the visibility assertion fails, inspect save completion timing, route remount behavior, and the Playwright helper first. Only patch `Library.tsx` if those checks show the existing reload behavior is actually insufficient.

Do not duplicate the full Settings-route theme workflow here; that already belongs to `theme_and_feedback.spec.ts`. In this save-workflow spec, only add the minimal touched-surface assertions needed to prove the validation UI remains usable under preconfigured light and dark themes.

- [x] **Step 2: Build the debug Tauri app and run only the new save-workflow spec to confirm failure**

Run: `pnpm --dir apps/desktop tauri:build --debug`
Expected: PASS.

Run: `cd apps/desktop; npx playwright test tests/spell_editor_save_workflow.spec.ts`
Expected: FAIL until the save-workflow UI is implemented.

- [x] **Step 3: Implement only the missing behavior needed by the new spec**

If the new spec still fails after Tasks 1-5, finish the remaining gaps in `SpellEditor.tsx` without broad refactors. Keep the implementation local to the editor unless a repeated pattern clearly justifies extraction.

- [x] **Step 4: Re-run the new save-workflow spec**

Run: `cd apps/desktop; npx playwright test tests/spell_editor_save_workflow.spec.ts`
Expected: PASS.

Use stable assertions for the conditional-field animation checks:
- assert that the mounted field container carries the `animate-in fade-in` classes at render time
- avoid timing-sensitive assertions about animation completion

## Task 8: Final Verification for Chunk 2

**Files:**
- Verify all files touched in Tasks 1-7

- [x] **Step 1: Run the focused unit suite**

Run: `pnpm --dir apps/desktop test:unit -- src/ui/spellEditorValidation.test.ts src/ui/SpellEditor.test.tsx`
Expected: PASS.

Run: `pnpm --dir apps/desktop test:unit -- src/ui/Library.test.tsx`
Expected: PASS.

- [x] **Step 2: Run typecheck and lint for touched frontend code**

Run: `pnpm --dir apps/desktop typecheck`
Expected: PASS.

Run: `pnpm --dir apps/desktop exec biome lint src/ui/SpellEditor.tsx src/ui/Library.tsx src/ui/Library.test.tsx src/ui/spellEditorValidation.ts src/ui/spellEditorValidation.test.ts src/ui/SpellEditor.test.tsx src/ui/FieldMapper.tsx src/ui/components/structured/ScalarInput.tsx src/ui/components/structured/StructuredFieldInput.tsx src/ui/components/structured/AreaForm.tsx tests/page-objects/SpellbookApp.ts tests/spell_editor_structured_data.spec.ts tests/spell_editor_canon_first.spec.ts tests/epic_and_quest_spells.spec.ts tests/spell_editor_save_workflow.spec.ts tests/character_profiles_foundation_one.spec.ts tests/character_search_filters.spec.ts tests/e2e.spec.ts tests/character_master_workflow.spec.ts tests/character_remediation.spec.ts tests/character_snapshots.spec.ts tests/import_conflict_resolution.spec.ts tests/repro_bugs.spec.ts tests/spell_notes_persistence.spec.ts tests/vault.spec.ts tests/theme_and_feedback.spec.ts`
Expected: PASS.

- [x] **Step 3: Rebuild the Tauri debug app for E2E**

Run: `pnpm --dir apps/desktop tauri:build --debug`
Expected: PASS.

- [ ] **Step 4: Run the full Chunk 2 Playwright slice**

Run: `cd apps/desktop; npx playwright test tests/spell_editor_structured_data.spec.ts tests/spell_editor_canon_first.spec.ts tests/epic_and_quest_spells.spec.ts tests/spell_editor_save_workflow.spec.ts tests/character_profiles_foundation_one.spec.ts tests/character_search_filters.spec.ts tests/e2e.spec.ts tests/character_master_workflow.spec.ts tests/character_remediation.spec.ts tests/character_snapshots.spec.ts tests/import_conflict_resolution.spec.ts tests/repro_bugs.spec.ts tests/spell_notes_persistence.spec.ts tests/vault.spec.ts tests/theme_and_feedback.spec.ts`
Expected: PASS.

**Partial verification (2026-03-20):** `tests/spell_editor_save_workflow.spec.ts` — **15/15 PASS** after `SpellbookApp` import-reset and Add Spell navigation fixes. Re-run the full 118-test slice locally to close this checkbox (long run; prior WebView2 flake on unrelated specs may still appear intermittently).

- [ ] **Step 5: Audit touched spell/library flows for routine status modals and modal boundaries**

Confirm through concrete test results or explicit manual checklists that:
- validation failures no longer open routine OK modals
- Library-side routine status flows in `Library.tsx` no longer open browser alerts
- real save failures still use the `Save Error` modal
- unsaved-changes confirmation still blocks navigation
- delete confirmation still blocks before destructive action
- no other routine status modal remains in the touched spell editor or `Library.tsx` flows

Back this audit with an explicit closure search over touched surfaces for `alert(`, routine validation modal usage, and routine OK dialog flows before declaring the task complete.

- [ ] **Step 6: Verify light and dark theme coverage for touched Chunk 2 UI**

Confirm through explicit automated tests that the following remain legible in both themes:
- inline validation messages
- invalid borders and text
- save-progress button state
- disabled save button with hint text

- [ ] **Step 7: Manual acceptance gate outside repo-executable checks - perform screen-reader validation-announcement verification**

Run a manual assistive-technology check with NVDA on Windows using Chromium and confirm all of these cases behave consistently:
- one text-input blur validation path
- one select-change or dependent-field revalidation path
- one structured-scalar validation path, or the nearest helper-backed equivalent if clamp-on-change semantics keep the UI path unreachable in this chunk
- the first failed submit moves focus to the first invalid field
- the field label is announced together with its associated error text
- correcting the field removes the stale announcement path because `aria-invalid` and `aria-describedby` update with the field state

Record, for each checked path, the exact label and error text announced by NVDA plus any setup notes needed to reproduce the result in Chromium. Add any resulting testing-guidance delta to the later Chunk 6 documentation handoff.

Append a short evidence block to this plan file with the check date, browser, NVDA version if known, exercised paths, and the exact announced label and error text per path.

This manual gate is outside the repo-executable verification steps above; treat it as human acceptance work rather than an automated agent check.

- [ ] **Step 8: Produce the deferred documentation handoff artifact**

Before declaring Chunk 2 complete, append a `Chunk 6 documentation handoff` section to this plan file with one bullet for each deferred documentation target and the exact delta discovered during implementation:
- `docs/user/spell_editor.md`
- `README.md`
- `docs/dev/spell_editor_components.md`
- `docs/TESTING.md`
- `docs/ARCHITECTURE.md`

The handoff bullets must cover behavior introduced or changed in Chunk 2, including validation timing, conditional School/Sphere rendering, save-progress thresholds, success toast routing behavior, notification-versus-modal boundaries, and any NVDA plus Chromium setup or execution guidance discovered during the manual accessibility gate for the later `docs/TESTING.md` update.
Each handoff bullet must also include the target section or header, the exact behavior delta, any affected testids or user-facing copy, and the verification or manual-test delta that Chunk 6 must preserve.
For `docs/dev/spell_editor_components.md` and `docs/ARCHITECTURE.md`, explicitly capture the new validation-helper contract, field-error shape, deterministic focus-order helper, and touched-versus-submit state model. For `docs/TESTING.md`, explicitly capture the new unit suites, save-workflow Playwright spec, migrated modal-to-inline assertions, build-before-Playwright checkpoint policy, light/dark validation checks, and NVDA/Chromium manual procedure.

- [ ] **Step 9: Prepare optional commit handoff**

```powershell
git add docs/superpowers/plans/2026-03-19-add-spell-ui-design-and-accessibility-chunk-2.md apps/desktop/src/ui/Library.tsx apps/desktop/src/ui/Library.test.tsx apps/desktop/src/ui/SpellEditor.tsx apps/desktop/src/ui/components/structured/ScalarInput.tsx apps/desktop/src/ui/components/structured/StructuredFieldInput.tsx apps/desktop/src/ui/components/structured/AreaForm.tsx apps/desktop/src/ui/spellEditorValidation.ts apps/desktop/src/ui/spellEditorValidation.test.ts apps/desktop/src/ui/SpellEditor.test.tsx apps/desktop/tests/spell_editor_structured_data.spec.ts apps/desktop/tests/spell_editor_canon_first.spec.ts apps/desktop/tests/character_profiles_foundation_one.spec.ts apps/desktop/tests/character_search_filters.spec.ts apps/desktop/tests/e2e.spec.ts apps/desktop/tests/character_master_workflow.spec.ts apps/desktop/tests/character_remediation.spec.ts apps/desktop/tests/character_snapshots.spec.ts apps/desktop/tests/import_conflict_resolution.spec.ts apps/desktop/tests/repro_bugs.spec.ts apps/desktop/tests/spell_notes_persistence.spec.ts apps/desktop/tests/vault.spec.ts apps/desktop/tests/theme_and_feedback.spec.ts apps/desktop/tests/epic_and_quest_spells.spec.ts apps/desktop/tests/spell_editor_save_workflow.spec.ts apps/desktop/tests/page-objects/SpellbookApp.ts
git commit -m "feat: improve spell editor validation and save feedback"
```

Only create the commit if the user explicitly asks for it.
