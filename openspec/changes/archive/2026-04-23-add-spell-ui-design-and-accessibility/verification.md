# Verification Plan: Spell UI Design and Accessibility

## Test Commands

```bash
# Run all E2E tests
cd apps/desktop && npx playwright test

# Run with Playwright UI (interactive mode)
cd apps/desktop && npx playwright test --ui

# Capture / update visual regression baselines
cd apps/desktop && npx playwright test --update-snapshots
```

Test files are located in `apps/desktop/tests/`.

## Documentation Verification

- [ ] **Verify: User documentation updated**
  - Confirm `docs/user/spell_editor.md` documents the final spell-editor behaviors introduced by this change: inline validation timing and messaging, save progress and success behavior, Library-view success notification after save, hash card display and copy feedback, and any changed structured-field transition behavior.
  - Confirm `README.md` documents any user-visible application overview changes introduced by this change: Light/Dark/System theme support, non-modal feedback conventions for routine status, and library-state UX such as empty-library, empty-search, or empty-character-spellbook behavior if those flows are described at the overview level.

- [ ] **Verify: Developer and architecture documentation updated**
  - Confirm `docs/dev/spell_editor_components.md` describes the finalized structured-editor, accessibility, and shared UI conventions introduced by this change.
  - Confirm `docs/ARCHITECTURE.md` describes the finalized theme, notification, live-region, and shared UI behavior introduced by this change.

- [ ] **Verify: Testing documentation updated**
  - Confirm `docs/TESTING.md` reflects the current E2E, accessibility, and visual-regression expectations for this change.

## Existing Test Migration

The shift from modal-based validation errors to inline errors breaks 8 existing test locations.
Each must be fixed before this change can be considered complete.

### Fix pattern

```ts
// BEFORE (broken after this change)
await page.getByTestId("btn-save-spell").click();
await handleCustomModal(page, "OK");           // ← will timeout, no modal appears
await page.waitForTimeout(300);

// AFTER
await page.getByTestId("btn-save-spell").click();
await expect(page.getByTestId("spell-name-error")).toBeVisible({ timeout: TIMEOUTS.short });
await expect(page.getByRole("heading", { name: /Edit Spell|New Spell/ })).toBeVisible(); // still on editor
```

### Affected locations

| File | Lines | Inline error testid to assert |
|---|---|---|
| `apps/desktop/tests/spell_editor_structured_data.spec.ts` | 62–70 | `error-school-required-arcane` |
| `apps/desktop/tests/spell_editor_structured_data.spec.ts` | 84–94 | `error-sphere-required-divine` |
| `apps/desktop/tests/spell_editor_structured_data.spec.ts` | 290–297 | `error-school-required-arcane-tradition` while `error-tradition-conflict` remains hidden |
| `apps/desktop/tests/spell_editor_structured_data.spec.ts` | 340–353 | `error-tradition-conflict` |
| `apps/desktop/tests/spell_editor_structured_data.spec.ts` | 541–544 | `spell-name-error` |
| `apps/desktop/tests/epic_and_quest_spells.spec.ts` | 52–57 | tradition/class inline error; update post-error navigation |
| `apps/desktop/tests/spell_editor_canon_first.spec.ts` | 575–583 | inline error (replaces `<dialog>` "Save Error" check) |

### Safe — not affected

These calls are NOT in scope and must NOT be changed:
- "Unsaved changes" / discard dialogs in `apps/desktop/tests/spell_editor_canon_first.spec.ts` — blocking decisions, stay modal
- `apps/desktop/tests/spell_editor_structured_data.spec.ts` line 629 — `handleCustomModal(page, "Cancel")` dismissing a blocking decision dialog — stays modal
- The import rejection case in `apps/desktop/tests/spell_editor_structured_data.spec.ts` remains out of scope because it exercises import-flow modal behavior rather than spell/library inline validation
- All `apps/desktop/tests/character_io.spec.ts`, `apps/desktop/tests/character_master_workflow.spec.ts`, `apps/desktop/tests/character_remediation.spec.ts`, `apps/desktop/tests/character_profiles_foundation_one.spec.ts`, `apps/desktop/tests/character_edge_cases.spec.ts`, `apps/desktop/tests/vault.spec.ts` — character/vault flows, out of scope

---

## End-to-End Workflows

### Workflow: New User Creates First Spell
- [ ] **E2E: Complete First Spell Creation**
  1. User opens application with no existing spells
  2. User enters the spell creation flow from the Library
  3. Spell editor opens with empty or default field state
  4. User enters a spell name
  5. User selects Arcane tradition
  6. School becomes required
  7. User selects a school
  8. User enters a valid level
  9. User fills at least one structured field included in this change
  10. User fills required descriptive content
  11. User saves
  12. If the save exceeds 300ms, the save button shows "Saving…" until the operation completes
  13. User returns to Library
  14. Transient success notification is visible on the Library view
  15. Saved spell appears in the library list
  16. User opens the spell
  17. Hash display is visible for the saved spell

### Workflow: Edit Legacy Spell — Basic Fields
- [ ] **E2E: Edit a spell that has only raw text fields (no structured data)**
  1. Library shows at least one legacy spell with text-only detail fields
  2. User opens the spell editor
  3. Spell editor loads legacy values with the expected fallback presentation
  4. User edits the spell name
  5. User saves
  6. If the save exceeds 300ms, the save button shows "Saving…" until the operation completes
  7. User returns to Library
  8. Updated name is visible in the library list
  9. Hash display is present for the saved spell

### Workflow: Edit Legacy Spell — Structured Field Upgrade
- [ ] **E2E: Upgrade a legacy spell by editing a structured field**
  1. Library shows at least one legacy spell with text-only detail fields
  2. User opens the spell editor
  3. User edits one structured field covered by the dependent structured-data change
  4. Preview text updates to reflect the structured value
  5. User saves
  6. If the save exceeds 300ms, the save button shows "Saving…" until the operation completes
  7. User returns to Library
  8. Updated structured values are visible after reopening the spell
  9. Hash display is present for the saved spell

### Workflow: Validation Feedback
- [ ] **E2E: Error Handling Experience**
  1. User opens spell editor
  2. User enters a spell name
  3. User selects Arcane tradition without selecting School
  4. User enters an invalid structured or scalar value
  5. User attempts to save
  6. Save is blocked
  7. Field-level error styling and text appear
  8. Error text is associated with the invalid field
  9. User fixes the controlling field and dependent validation updates appropriately
  10. User fixes the invalid field and the error clears according to the documented validation timing

### Workflow: Empty States
- [ ] **E2E: Empty library**
  1. User opens the Library with no spells present
  2. Empty-library state appears
  3. "Create Spell" and "Import Spells" actions are visible

- [ ] **E2E: Empty search**
  1. Library contains spells
  2. User applies a search or filters that return no matches
  3. Empty-search state appears
  4. Reset action is visible and functional

- [ ] **E2E: Empty character spellbook**
  1. User opens a character spellbook with no spells
  2. Empty character spellbook state appears
  3. "Add Spell from Library" action is visible

## Accessibility Tests (WCAG 2.1 AA)

### Keyboard Navigation
- [ ] **Test: Complete spell creation without mouse**
  - GIVEN user at the Library
  - WHEN using only Tab, Enter, Space, Arrows, and Escape
  - THEN user MUST be able to complete the primary spell-creation workflow
  - AND focus indicator MUST remain visible

### Screen Reader
- [ ] **Test: Form validation announcements**
  - GIVEN an invalid field in the editor
  - THEN error text MUST be associated with the field via `aria-describedby`
  - AND the field MUST expose `aria-invalid="true"` when in error state
  - AND on first failed submit attempt, focus MUST move to the first invalid field so screen readers announce its label and error text naturally
  - **Tool**: NVDA (Windows) with Chromium; add setup instructions to `docs/TESTING.md` as part of the documentation update if they are not already present

### Modal Focus
- [ ] **Test: Focus trap and return**
  - GIVEN a modal dialog is opened
  - THEN focus MUST remain inside the modal until dismissal
  - AND focus MUST return to the trigger or logical fallback after close

## Theme and Feedback Tests

### Real Theme Flow
- [ ] **Test: Theme preference persists via Settings page**
  - User opens `/settings` via the gear icon
  - User selects "Dark" or "Light" from the theme select
  - Preference persists across reload

- [ ] **Test: Follow system preference checkbox**
  - User checks "Follow system preference" — select becomes disabled, theme reflects OS
  - User unchecks — select becomes active, defaults to currently-resolved theme (no visual flash)
  - Preference persists across reload

- [ ] **Test: System preference behavior**
  - With no saved preference, initial theme follows OS preference
  - In System mode, OS preference changes are reflected in-session

- [ ] **Test: Theme change announcement**
  - Changing the theme via the Settings page emits the expected non-disruptive announcement through the hidden live region for assistive technology users
  - No visible toast appears for theme changes

### Transient Feedback
- [ ] **Test: Non-modal notifications**
  - Success, warning, and clipboard feedback appear without taking focus
  - Notifications remain readable when multiple are present
  - Routine status feedback in touched flows does not require modal dismissal before the user can continue

- [ ] **Test: Clipboard live-region announcement**
  - Copying the spell hash announces success without shifting focus

### Modal Boundaries
- [ ] **Test: Modal usage reserved for decision points**
  - Destructive confirmations and blocking choices still use modal/dialog patterns where applicable
  - Routine confirmations such as save success, clipboard success, and add-to-character success do not use modal alerts

## Visual Regression (Playwright Screenshots)

Visual regression uses Playwright's built-in `toHaveScreenshot()`.

**Workflow:**
1. `cd apps/desktop && npx playwright test --update-snapshots` - capture baselines
2. Make UI changes
3. `cd apps/desktop && npx playwright test` - verify no visual regressions

**Screenshot isolation:**
```ts
await page.evaluate(() => document.documentElement.classList.remove('dark'));
await page.evaluate(() => document.documentElement.classList.add('dark'));
```

**Screenshot targets:**

- [ ] **Test: StructuredFieldInput States**
  - Capture empty, filled, focused, error, and disabled states

- [ ] **Test: SpellEditor - dark mode**
  - Capture full editor with relevant structured fields filled

- [ ] **Test: SpellEditor - light mode**
  - Capture full editor with relevant structured fields filled

- [ ] **Test: Empty Library State**
  - Capture empty-library state in dark and light themes

- [ ] **Test: Hash Display**
  - Capture collapsed and expanded hash display states
