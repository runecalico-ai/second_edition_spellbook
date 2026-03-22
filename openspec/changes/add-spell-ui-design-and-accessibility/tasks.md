# Tasks: Spell UI Design and Accessibility

## Implementation Order

Work top-to-bottom. Each chunk is intended to be implementable and reviewable on its own.

- Chunks 1-6 are the recommended implementation order for this change.
- `update-spell-editor-structured-data` is complete, so structured editor polish and verification are now part of the main sequence.
- Within a chunk, complete the infrastructure items before the feature-level polish items that consume them.

---

## Chunk 1: Shared Theme and Feedback Foundations

**Depends on:** none

**Why first:** Library save feedback, hash copy confirmation, light-theme coverage, and accessibility announcements all depend on shared root-level theme and transient-feedback infrastructure.

### theme-and-feedback

#### Theme support foundation
- [x] Add `darkMode: 'class'` to `apps/desktop/tailwind.config.js`.
- [x] Create Zustand theme store (`apps/desktop/src/store/useTheme.ts`):
  - [x] Theme state: `'light' | 'dark' | 'system'`
  - [x] `setTheme(value: ThemeMode)` function to update theme state explicitly
  - [x] Persist to localStorage with key `'spellbook-theme'`
  - [x] Initialize from localStorage or fall back to `'system'`
- [x] Add theme initialization script to `apps/desktop/index.html`:
  - [x] Inline script in `<head>` before React hydration
  - [x] Resolve `'system'` or absence via `prefers-color-scheme`
  - [x] Apply theme class immediately to avoid flash of incorrect theme
- [x] Create `SettingsPage` component (`apps/desktop/src/ui/SettingsPage.tsx`):
  - [x] "Appearance" section containing a native `<select>` with Light and Dark options
  - [x] "Follow system preference" checkbox below the select
  - [x] When checkbox is checked: select is disabled and displays the current OS-resolved theme value
  - [x] When checkbox is unchecked: select is active and defaults to the currently-resolved theme (no visual flash on transition)
  - [x] Accessible `<label>` elements for both controls
- [x] Register `/settings` route in the application router pointing to `SettingsPage`.
- [x] Add a gear icon (⚙) button at the far right of the `apps/desktop/src/ui/App.tsx` header that navigates to `/settings`.
- [x] Update `apps/desktop/src/main.tsx` to react to OS theme changes when theme is `'system'`.

#### Shared transient feedback infrastructure
- [x] Build a minimal non-modal notification component.
- [x] Use lint-safe polite status semantics on the notification portal via a semantic `<output aria-live="polite">`.
- [x] Position the notification container fixed at the bottom-right of the viewport.
- [x] Stack toasts upward; limit visible count to a maximum of 3 (oldest removed when a fourth arrives).
- [x] Auto-dismiss each toast after its type duration (default 3000ms for success, warning, and error; store duration per type so each can be changed independently).
- [x] Always allow manual dismissal via a close (×) button on each toast.
- [x] Mount the notification container in `apps/desktop/src/ui/App.tsx` alongside root-level modal infrastructure.

#### Shared live-region infrastructure
- [x] Mount a hidden `<div aria-live="polite">` in `apps/desktop/src/ui/App.tsx` for AT-only theme change announcements.
- [x] When the theme changes, write the new mode name to the hidden live region (for example: "Dark mode", "Light mode", "System mode") without showing a visible toast.

---

## Chunk 2: Spell Editor Validation and Save Workflow

**Depends on:** Chunk 1

**Why second:** This is the highest-value behavior change in the spell editor and it consumes the non-modal feedback primitives from Chunk 1.

### library

#### Feedback policy application in touched spell/library flows
- [x] Replace modal alerts used for routine status in touched spell and library flows with inline or transient non-modal feedback.
- [x] Preserve modal/dialog usage for destructive confirmations, blocking decisions, and rare high-severity errors only.

#### Validation feedback and timing
- [x] Apply `animate-in fade-in` to conditional fields when they mount (enter only — no exit animation).
- [x] Ensure newly relevant fields fade into view; hidden fields unmount instantly without leaving visual gaps.
- [x] Render inline errors adjacent to invalid fields.
- [x] Use specific field messages rather than generic "Invalid value" text.
- [x] Apply consistent invalid-state styling and motion using existing shared animation utilities.
- [x] Implement blur validation for text inputs (name, scalar values).
- [x] Implement change validation for select controls.
- [x] Immediately revalidate dependent fields when a controlling field such as tradition changes.
- [x] Validate all untouched fields on first submit attempt.
- [x] Clear field errors as soon as the field becomes valid.
- [x] Prefer messages such as "School is required for Arcane spells".
- [x] Prefer messages such as "Base value must be a positive number".
- [x] Keep fix-in-place validation feedback inline rather than modal.

#### Save workflow feedback
- [x] If the save operation exceeds 300ms, change the save button label to "Saving…" and disable it for the duration. Below 300ms the operation completes before the state becomes visible.
- [x] Keep the user in context until the save completes.
- [x] Trigger transient success feedback through the notification store as save completes.
- [x] Return the user to the Library view after save.
- [x] Ensure the success notification renders on the Library view after navigation rather than only on the editor.
- [x] Ensure the saved spell is discoverable in the Library after navigation.
- [x] After the first failed submit attempt, show a hint near the save button explaining why it is disabled (e.g. "Fix the errors above to save"). The hint must not appear while the form is pristine.

### frontend-standards

#### Error identification and announcement model
- [x] Mark invalid fields with `aria-invalid="true"` when they are in an error state.
- [x] Associate each error message with its field via `aria-describedby`.
- [x] On first failed submit attempt, move focus to the first invalid field so screen readers announce its label and error text naturally.
- [x] Apply this hybrid model consistently across the spell editor: field-level association always present, focus-on-submit for the initial blocked-save announcement.

### theme-and-feedback

#### Theme coverage for spell-editor changes introduced in this chunk
- [x] Apply intentional light and dark theme styling to the validation, invalid-state, save-progress, and disabled-action UI introduced in this chunk.

---

## Chunk 3: Library Presentation, Hash UX, and Empty States

**Depends on:** Chunks 1-2

**Why third:** Once validation and save behavior are stable, the remaining spell/library-facing polish can be implemented without reopening the core form flow.

### library

#### Hash display
- [x] Restyle the existing hash display in `apps/desktop/src/ui/SpellEditor.tsx` as a dedicated card in the spell detail header area.
- [x] Preserve collapsed and expanded states.
- [x] Show 16 characters in the collapsed state (previously 8).
- [x] Remove the `title` attribute from the hash `<code>` element.
- [x] Replace modal-based copy confirmation with transient non-modal success feedback plus a polite live-region announcement.

#### Spell detail loading boundaries
- [x] Avoid introducing flickering loading indicators for imperceptible route loads.
  - [x] Verify a fast spell-detail route transition does not briefly flash a loading-only state before the editor content appears.
  - [x] Verify previously rendered editor content is not replaced by a transient loading indicator during same-editor data refreshes that settle within a perceptually instant interval.
- [x] If a route load is perceptible, ensure the loading state is intentional and stable.
  - [x] Verify a perceptible spell-detail route load shows a single, stable loading state rather than flashing between partial and loading-only content.
  - [x] Verify the loading state persists until the target spell data is ready, then resolves directly to the final editor content without intermediate flicker.

#### Empty states
All three empty states share a common skeleton: heading, one-line description, CTA buttons (no icon). Copy is defined in design.md Decision 16.

- [x] Add an empty-library state: heading "No Spells Yet", description "Your spell library is empty. Create your first spell or import spells from a file."
- [x] Add CTA buttons: "Create Spell" and "Import Spells".
- [x] Add an empty-search state: heading "No Results", description "No spells match your current search or filters."
- [x] Provide a clear reset action ("Reset Filters").
- [x] Add a dedicated empty state for the character spellbook flow: heading "No Spells Added", description "This character's spellbook is empty."
- [x] Add CTA: "Add Spell from Library".

### theme-and-feedback

#### Theme coverage on touched surfaces
- [x] Remove hardcoded dark-only classes from `apps/desktop/index.html` and edited surfaces.
- [x] Verify muted text, borders, controls, and feedback states stay legible in both light and dark modes for the views changed in this chunk.

---

## Chunk 4: Structured Editor Visual Polish

**Depends on:** Chunks 1-3

**Why fourth:** The structured editor surfaces are now available, so their layout and presentation can be polished before the cross-app accessibility pass and before final verification.

### library

#### Structured field layout and presentation
- [ ] Define `StructuredFieldInput` layout: horizontal grouping for scalar, unit, and related controls with existing spacing utilities.
- [ ] Define label placement and container treatment for structured field groups.
- [x] Define `ComponentCheckboxes` spacing and preview treatment.

### theme-and-feedback

#### Theme coverage on structured editor surfaces
- [ ] Verify the structured editor controls introduced or refined in this chunk remain legible and intentional in both light and dark modes.

---

## Chunk 5: Cross-App Accessibility and Resize Hardening

**Depends on:** Chunks 1-4

**Why fifth:** These changes are shared polish across touched flows and are easier to validate after the core library and structured-editor behavior exists.

### frontend-standards

#### Window size handling
- [ ] Treat **900px** as the minimum supported window width.
- [ ] At widths approaching 900px, ensure structured field groups collapse, wrap, or stack to prevent overflow.
- [ ] Ensure no horizontal scrollbars are introduced in core editing flows at minimum width.

#### Keyboard navigation and labels
- [ ] Ensure logical tab order: top-to-bottom, left-to-right where applicable.
- [ ] Ensure a visible focus indicator exists for all interactive elements.
- [ ] Ensure Escape closes modals or cancels supported dismissal flows.
- [ ] Ensure keyboard submit behavior matches the visible submit action.
- [ ] Audit touched pages and dialogs for proper semantic heading hierarchy.
- [ ] Use visible `<label>` as the default accessible name for inputs.
- [ ] Add `aria-label` only where no visible label exists or where visible text is insufficient.
- [ ] Associate help text and error text via the appropriate descriptive relationship.

#### Focus management and modal behavior
- [ ] Migrate `Modal.tsx` from `<dialog open>` to `showModal()` / `close()` for native browser focus trapping.
- [ ] Verify tests rely on resilient selectors rather than modal implementation details.
- [ ] Return focus to the trigger after modal close, with a logical fallback if needed.

#### Color contrast
- [ ] Ensure text meets minimum 4.5:1 contrast ratio.
- [ ] Ensure text sizing remains readable on touched pages and components.
- [ ] Ensure large text (>=18px) meets minimum 3:1 contrast ratio.
- [ ] Ensure interactive elements meet minimum 3:1 contrast ratio.
- [ ] Ensure error and warning text remain readable in all supported themes.

---

## Chunk 6: Test Migration and Verification

**Depends on:** Chunks 1-5

**Why sixth:** Update documentation, migrate broken tests, and add targeted coverage and visual baselines once implementation details have settled.

### Documentation

#### Application documentation updates
- [ ] Update `docs/user/spell_editor.md` to document the final spell-editor behaviors introduced by this change: inline validation timing and messaging, save progress and success behavior, Library-view success notification after save, hash card display and copy feedback, and any changed structured-field transition behavior.
- [ ] Update `README.md` to document any user-visible application overview changes introduced by this change: Light/Dark/System theme support, non-modal feedback conventions for routine status, and library-state UX such as empty-library, empty-search, or empty-character-spellbook behavior if those flows are described at the overview level.
- [ ] Update `docs/dev/spell_editor_components.md` to reflect the finalized structured-editor, accessibility, and shared UI conventions introduced by this change.
- [ ] Update `docs/TESTING.md` to reflect the current theme-flow, accessibility, and visual-regression expectations introduced by this change.
- [ ] Update `docs/ARCHITECTURE.md` to reflect the finalized theme, notification, live-region, and shared UI behavior introduced by this change.

### Testing

#### Migrate affected existing tests
All existing tests broken by validation-feedback changes in spell/library flows MUST be fixed as part of this change. The pattern: remove `handleCustomModal(page, "OK")` after a failed save and replace it with assertions on inline error testids.

- [ ] `apps/desktop/tests/spell_editor_structured_data.spec.ts` lines 62-70: Arcane school validation -> assert inline `error-school-required-arcane`, remove `handleCustomModal`
- [ ] `apps/desktop/tests/spell_editor_structured_data.spec.ts` lines 84-94: Divine sphere validation -> assert inline `error-sphere-required-divine`, remove `handleCustomModal`
- [ ] `apps/desktop/tests/spell_editor_structured_data.spec.ts` lines 290-297: Arcane tradition with missing school -> assert inline `error-school-required-arcane-tradition`, keep `error-tradition-conflict` hidden, remove `handleCustomModal`
- [ ] `apps/desktop/tests/spell_editor_structured_data.spec.ts` lines 340-353: tradition conflict (second scenario) -> assert inline `error-tradition-conflict`, remove `handleCustomModal`
- [ ] `apps/desktop/tests/spell_editor_structured_data.spec.ts` lines 541-544: save without name -> assert inline `spell-name-error`, remove `handleCustomModal`
- [ ] `apps/desktop/tests/epic_and_quest_spells.spec.ts` lines 52-57: epic priest restriction -> assert inline error, remove `handleCustomModal` and update subsequent navigation
- [ ] `apps/desktop/tests/spell_editor_canon_first.spec.ts` lines 575-583: `<dialog>` "Save Error" heading -> replace `<dialog>` check with inline error assertion, remove `handleCustomModal`

Safe, unchanged modal coverage per spec:
- [ ] Keep `apps/desktop/tests/spell_editor_canon_first.spec.ts` lines 1292, 1297, 1643, 1654, 1665 for "Unsaved changes" blocking dialogs.
- [ ] Keep `apps/desktop/tests/spell_editor_structured_data.spec.ts` line 629 for blocking dialog dismiss behavior.
- [ ] Leave character, vault, and import-flow `handleCustomModal` usage out of scope.
- [ ] Leave the import rejection case in `apps/desktop/tests/spell_editor_structured_data.spec.ts` out of scope because it exercises import-flow modal behavior rather than spell/library inline validation.
- [ ] Leave `apps/desktop/tests/character_edge_cases.spec.ts` modal testids out of scope.

#### End-to-end workflows
- [ ] Test: New user creates first spell.
- [ ] Test: Edit legacy spell - basic fields (unblocked).
- [ ] Test: Edit legacy spell - structured field upgrade.
- [ ] Test: Validation error handling.
- [ ] Test: Conditional field transitions animate and collapse cleanly when controlling fields change.
- [ ] Test: Keyboard-only navigation.
- [ ] Test: Theme switching workflow (navigate to `/settings` via gear icon, use theme select and follow-system checkbox, verify immediate application and persistence across reload).
- [ ] Test: Empty library state.
- [ ] Test: Empty search state.
- [ ] Test: Empty character spellbook state.

#### Accessibility verification
- [ ] Test: Screen reader validation announcements verify the chosen error-announcement model behaves consistently and error text is associated with the owning field.
- [ ] Test: Modal focus trap and focus return for preserved dialogs.

### theme-and-feedback

#### Real theme and feedback verification
- [ ] End-to-end coverage MUST verify the real theme store, persistence, and first-load behavior.
- [ ] Verify the theme change announcement is emitted through the hidden live region without showing a visible toast.
- [ ] Verify edited views in both light and dark modes.
- [ ] Capture baselines: `cd apps/desktop && npx playwright test --update-snapshots`
- [ ] Run regression checks: `cd apps/desktop && npx playwright test`
- [ ] Screenshot isolation MAY toggle the `dark` class directly on `<html>`.

#### Transient feedback and modal-boundary verification
- [ ] Test: Non-modal notifications do not take focus, remain readable when multiple are present, and cover routine status feedback in touched flows.
- [ ] Test: Clipboard copy success is announced through the toast/live-region channel without shifting focus.
- [ ] Test: Modal usage remains reserved for destructive confirmations, blocking choices, and rare high-severity errors in the touched flows.
- [ ] Verify preserved dialogs identified in `modal_review.md` remain modal after the modal implementation changes.

### Visual Regression (Playwright screenshots)

- [ ] Screenshot test: StructuredFieldInput states.
- [ ] Screenshot test: SpellEditor with all structured fields in dark mode.
- [ ] Screenshot test: SpellEditor with all structured fields in light mode.
- [ ] Screenshot test: Empty library state in dark and light themes.
- [ ] Screenshot test: Hash display collapsed and expanded.

---

## data-testid Definitions

All new interactive elements MUST have a `data-testid` per project standards. These testids apply in the chunk where the corresponding UI is introduced.

Validation error testids MUST stay consistent with the migrated tests in Chunk 6. Existing named examples include `spell-name-error`, `error-school-required-arcane`, `error-sphere-required-divine`, and `error-tradition-conflict`; do not collapse these into a contradictory generic naming rule.

| Spec Area | Component / Element | data-testid |
|---|---|---|
| theme-and-feedback | Gear icon / settings entry point | `settings-gear-button` |
| theme-and-feedback | Settings page theme select | `settings-theme-select` |
| theme-and-feedback | Settings page follow-system checkbox | `settings-follow-system-checkbox` |
| library | Hash display | `spell-detail-hash-display` |
| library | Hash copy button | `spell-detail-hash-copy` |
| library | Hash expand/collapse button | `spell-detail-hash-expand` |
| theme-and-feedback | Toast - success | `toast-notification-success` |
| theme-and-feedback | Toast - warning | `toast-notification-warning` |
| theme-and-feedback | Toast - error | `toast-notification-error` |
| theme-and-feedback | Toast dismiss button | `toast-dismiss-button` |
| library | Empty library - "Create Spell" CTA | `empty-library-create-button` |
| library | Empty library - "Import Spells" CTA | `empty-library-import-button` |
| library | Empty search - reset filters CTA | `empty-search-reset-button` |
| library | Empty character spellbook - "Add Spell" CTA | `empty-character-add-spell-button` |
| frontend-standards | Validation error for a field | Use the concrete field/error testid contract exercised by the migrated tests |
| frontend-standards | Accessible label for settings select | visible `<label>` — no testid needed |
