# Tasks: Spell UI Design and Accessibility

## library
### Feedback policy application
- [ ] Replace modal alerts used for routine status in touched spell and library flows with inline or transient non-modal feedback.
- [ ] Preserve modal/dialog usage for destructive confirmations, blocking decisions, and rare high-severity errors only.

### Visual Design
- [ ] Layout and spacing:
    - [ ] Define `StructuredFieldInput` layout: horizontal grouping for scalar, unit, and related controls with existing spacing utilities. **[Blocked until `update-spell-editor-structured-data`]**
    - [ ] Define label placement and container treatment for structured field groups. **[Blocked until `update-spell-editor-structured-data`]**
- [ ] Component styling:
    - [ ] Define `ComponentCheckboxes` spacing and preview treatment. **[Blocked until `update-spell-editor-structured-data`]**
- [ ] Hash display:
    - [ ] Restyle the existing hash display in `src/ui/SpellEditor.tsx` as a dedicated card in the spell detail header area.
    - [ ] Preserve collapsed and expanded states.
    - [ ] Replace modal-based copy confirmation with transient non-modal success feedback plus a polite live-region announcement.
- [ ] Validation error display:
    - [ ] Render inline errors adjacent to invalid fields.
    - [ ] Use specific field messages rather than generic "Invalid value" text.
    - [ ] Apply consistent invalid-state styling and motion using existing shared animation utilities.

### Loading and Save Feedback
- [ ] Save progress:
    - [ ] If save work becomes perceptible, show inline progress feedback on the save action.
    - [ ] Keep the user in context until the save completes.
- [ ] Successful save:
    - [ ] Show transient success feedback.
    - [ ] Return the user to the Library view after save.
- [ ] Spell detail loading:
    - [ ] Avoid introducing flickering loading indicators for imperceptible route loads.
    - [ ] If a route load is perceptible, ensure the loading state is intentional and stable.

### Empty States
- [ ] Empty library:
    - [ ] Add an empty-library state for the case where no spells exist at all.
    - [ ] CTA buttons: "Create Spell" and "Import Spells".
- [ ] Empty search:
    - [ ] Add an empty-search state for the case where filters or query produce no results.
    - [ ] Provide a clear reset action.
- [ ] Empty character spellbook:
    - [ ] Add a dedicated empty state for the character spellbook flow.
    - [ ] CTA: "Add Spell from Library".

### Form Validation UX
- [ ] Validation timing (implement per `specs/library/spec.md` — Scenario: Validation timing):
    - [ ] Implement blur validation for text inputs (name, scalar values).
    - [ ] Implement change validation for select controls.
    - [ ] Immediately revalidate dependent fields when a controlling field such as tradition changes.
    - [ ] Validate all untouched fields on first submit attempt.
    - [ ] Clear field errors as soon as the field becomes valid.
- [ ] Error message clarity:
    - [ ] Prefer messages such as "School is required for Arcane spells".
    - [ ] Prefer messages such as "Base value must be a positive number".
    - [ ] Keep fix-in-place validation feedback inline rather than modal.
- [ ] Save action states:
    - [ ] If the save action is disabled, provide a discoverable explanation that does not rely on hover-only interaction.

## frontend-standards
### Window Size Handling
- [ ] Minimum supported window width: **900px**. No layout testing below this width is required.
- [ ] At widths approaching 900px, structured field groups collapse, wrap, or stack to prevent overflow.
- [ ] No horizontal scrollbars introduced in core editing flows at minimum width.

### Accessibility (WCAG 2.1 AA)
- [ ] Keyboard navigation:
    - [ ] Logical tab order: top-to-bottom, left-to-right where applicable.
    - [ ] Visible focus indicator for all interactive elements.
    - [ ] Escape key: close modals or cancel supported dismissal flows.
    - [ ] Keyboard submit behavior matches the visible submit action.
- [ ] Labels and field descriptions:
    - [ ] Use visible `<label>` as the default accessible name for inputs.
    - [ ] Add `aria-label` only where no visible label exists or where visible text is insufficient.
    - [ ] Associate help text and error text via the appropriate descriptive relationship.
- [ ] Error identification:
    - [ ] Mark invalid fields programmatically.
    - [ ] Ensure error text is associated with the owning field.
    - [ ] Choose and apply a consistent error announcement model: field-level, global, or hybrid.
- [ ] Focus management:
    - [ ] Migrate `Modal.tsx` from `<dialog open>` to `showModal()` / `close()` for native browser focus trapping.
    - [ ] Verify tests rely on resilient selectors rather than modal implementation details.
    - [ ] Return focus to the trigger after modal close, with a logical fallback if needed.
- [ ] Color contrast:
    - [ ] Text: minimum 4.5:1 contrast ratio.
    - [ ] Large text (>=18px): minimum 3:1 contrast ratio.
    - [ ] Interactive elements: minimum 3:1 contrast ratio.
    - [ ] Error and warning text remain readable in all supported themes.

## theme-and-feedback
### Theme Support
- [ ] Add `darkMode: 'class'` to `apps/desktop/tailwind.config.js`.
- [ ] Create Zustand theme store (`src/store/useTheme.ts`):
    - [ ] Theme state: `'light' | 'dark' | 'system'`
    - [ ] Cycle function: advance through `dark -> light -> system -> dark`
    - [ ] Persist to localStorage with key `'spellbook-theme'`
    - [ ] Initialize from localStorage or fall back to `'system'`
- [ ] Add theme initialization script to `index.html`:
    - [ ] Inline script in `<head>` before React hydration
    - [ ] Resolve `'system'` or absence via `prefers-color-scheme`
    - [ ] Apply theme class immediately to avoid flash of incorrect theme
- [ ] Create `ThemeToggle` component (`src/ui/components/ThemeToggle.tsx`):
    - [ ] Inline SVG icons for all three states
    - [ ] Accessible name describes the action the control will perform
    - [ ] Keyboard accessible
    - [ ] Visible focus indicator
- [ ] Theme announcement:
    - [ ] Mount a hidden `<div aria-live="polite">` in `src/ui/App.tsx` for AT-only theme change announcements (see Live-region announcements below and Decision 8 in design.md).
    - [ ] When the theme changes, write the new mode name to the hidden live region (e.g., "Dark mode", "Light mode", "System mode") — no visible toast.
- [ ] Integrate theme toggle into `src/ui/App.tsx`.
- [ ] Update `src/main.tsx` to react to OS theme changes when theme is `'system'`.
- [ ] Remove hardcoded dark-only classes from `index.html` and edited surfaces.

### Tooltip and Notification Patterns
- [ ] Tooltip pattern:
    - [ ] Build a minimal tooltip implementation only for supplemental hints.
    - [ ] Do not rely on tooltips as the sole source of critical information.
- [ ] Toast / transient notification pattern:
    - [ ] Build a minimal non-modal notification component.
    - [ ] Use the notification component for routine status feedback instead of modal alerts in touched flows.
    - [ ] Semantic: `role="status"` / polite announcement where appropriate.
    - [ ] Position and stacking: fixed portal with bounded visible count.
    - [ ] Mount in `src/ui/App.tsx` alongside root-level modal infrastructure.
- [ ] Live-region announcements:
    - [ ] The toast notification container SHALL use `role="status"` / `aria-live="polite"` — this is the live region for all visual notifications (save success, clipboard copy, etc.).
    - [ ] Mount a hidden `<div aria-live="polite">` in `src/ui/App.tsx` at root level — used exclusively for theme change announcements (AT-only, no visible toast).
    - [ ] Clipboard copy success is announced via the toast channel (visual + AT).
    - [ ] Theme change is announced via the hidden live region (AT-only, no visual toast).

### Visual Regression and Theme Testing
- [ ] Capture baselines: `pnpm test:e2e -- --update-snapshots`
- [ ] Run regression checks: `pnpm test:e2e`
- [ ] Screenshot isolation MAY toggle the `dark` class directly on `<html>`.
- [ ] End-to-end coverage MUST also verify the real theme store, persistence, and first-load behavior.
- [ ] Verify edited views in both light and dark modes.

## Testing
### Migrate affected existing tests
All existing tests broken by validation-feedback changes in spell/library flows MUST be fixed
as part of this change. The pattern: remove `handleCustomModal(page, "OK")` after a failed
save, replace with assertions on inline error testids.

Affected files and locations:
- [ ] `tests/spell_editor_structured_data.spec.ts` lines 62–70: Arcane school validation → assert inline `error-school-required-arcane`, remove `handleCustomModal`
- [ ] `tests/spell_editor_structured_data.spec.ts` lines 84–94: Divine sphere validation → assert inline `error-sphere-required-divine`, remove `handleCustomModal`
- [ ] `tests/spell_editor_structured_data.spec.ts` lines 290–297: tradition conflict → assert inline `error-tradition-conflict`, remove `handleCustomModal`
- [ ] `tests/spell_editor_structured_data.spec.ts` lines 340–353: tradition conflict (second scenario) → same pattern
- [ ] `tests/spell_editor_structured_data.spec.ts` lines 425–434: modal text `/mutually exclusive|School and sphere|Import failed/` → move assertion to inline error element
- [ ] `tests/spell_editor_structured_data.spec.ts` lines 541–544: save without name → assert inline `spell-name-error`, remove `handleCustomModal`
- [ ] `tests/epic_and_quest_spells.spec.ts` lines 52–57: epic priest restriction → assert inline error, remove `handleCustomModal` + update subsequent navigation
- [ ] `tests/spell_editor_canon_first.spec.ts` lines 575–583: `<dialog>` "Save Error" heading → replace `<dialog>` check with inline error assertion, remove `handleCustomModal`

Safe — these modals survive per spec (not spell/library routine-status flows):
- `spell_editor_canon_first.spec.ts` lines 1292, 1297, 1643, 1654, 1665 — "Unsaved changes" → blocking decision, stays modal
- `spell_editor_structured_data.spec.ts` line 629 — blocking dialog dismiss → stays modal
- All character/vault/import flow `handleCustomModal` calls → out of scope (not spell/library flows)
- `character_edge_cases.spec.ts` — uses `modal-dialog`/`modal-button-dismiss` testids directly for character-level error modals → out of scope

### E2E Workflows
- [ ] Test: New user creates first spell.
- [ ] Test: Edit legacy spell — basic fields (unblocked).
- [ ] Test: Edit legacy spell — structured field upgrade. **[Blocked until `update-spell-editor-structured-data`]**
- [ ] Test: Validation error handling.
- [ ] Test: Keyboard-only navigation.
- [ ] Test: Theme switching workflow.
- [ ] Test: Empty library state.
- [ ] Test: Empty search state.
- [ ] Test: Empty character spellbook state.

### Visual Regression (Playwright screenshots)
- [ ] Screenshot test: StructuredFieldInput states. **[Blocked until `update-spell-editor-structured-data`]**
- [ ] Screenshot test: SpellEditor with all structured fields in dark mode. **[Blocked until `update-spell-editor-structured-data`]**
- [ ] Screenshot test: SpellEditor with all structured fields in light mode. **[Blocked until `update-spell-editor-structured-data`]**
- [ ] Screenshot test: Empty library state in dark and light themes.
- [ ] Screenshot test: Hash display collapsed and expanded.

## data-testid Definitions
All new interactive elements MUST have a `data-testid` per project standards. Defined names:

| Spec Area | Component / Element | data-testid |
|---|---|---|
| theme-and-feedback | Theme toggle button | `theme-toggle-button` |
| library | Hash display | `spell-detail-hash-display` |
| library | Hash copy button | `spell-detail-hash-copy` |
| library | Hash expand/collapse button | `spell-detail-hash-expand` |
| theme-and-feedback | Toast - success | `toast-notification-success` |
| theme-and-feedback | Toast - warning | `toast-notification-warning` |
| theme-and-feedback | Toast - error | `toast-notification-error` |
| library | Empty library - "Create Spell" CTA | `empty-library-create-button` |
| library | Empty library - "Import Spells" CTA | `empty-library-import-button` |
| library | Empty search - reset filters CTA | `empty-search-reset-button` |
| library | Empty character spellbook - "Add Spell" CTA | `empty-character-add-spell-button` |
| frontend-standards | Validation error for a field | `{fieldname}-error` |
| theme-and-feedback | Tooltip | `{element}-tooltip` |
