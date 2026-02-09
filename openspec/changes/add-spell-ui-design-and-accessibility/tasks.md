# Tasks: Spell UI Design and Accessibility

## UI Design Specifications
### Visual Design
- [ ] Layout and spacing:
    - [ ] Define StructuredFieldInput layout: horizontal (base_value | per_level | unit) with 8px gaps.
    - [ ] Define input widths: base_value (80px), per_level (80px), unit (120px dropdown).
    - [ ] Define label position: above inputs, 4px margin.
    - [ ] Define container: fieldset with 16px padding, 1px border.
- [ ] Component styling:
    - [ ] ComponentCheckboxes: inline layout, 16px gap between checkboxes.
    - [ ] Label: before checkbox, 8px gap.
    - [ ] Text preview: below inputs, italic, gray (#666), 12px font size.
- [ ] Hash display:
    - [ ] Location: Top-right of spell detail view, separate card.
    - [ ] Visual: Code block style, monospace font, light gray background.
    - [ ] Copy button: Icon button (clipboard icon), tooltip "Copy hash".
    - [ ] States: Collapsed (first 8 chars + "..."), expanded (full 64 chars).
- [ ] Validation error display:
    - [ ] Position: Inline, below each invalid field.
    - [ ] Color: Red text (#d32f2f), red border on input.
    - [ ] Icon: Warning triangle, 16px, left of message.
    - [ ] Animation: Fade in (200ms), subtle shake on submit attempt.

### Responsive Design
- [ ] Mobile (< 640px):
    - [ ] StructuredFieldInput: Stack vertically (base_value, per_level, unit).
    - [ ] Input widths: 100% (full width).
    - [ ] Touch targets: minimum 44x44px for buttons.
    - [ ] Dropdowns: Use native `<select>` for better mobile UX.
- [ ] Tablet (640px - 1024px):
    - [ ] StructuredFieldInput: Horizontal layout (same as desktop).
    - [ ] Reduce padding: 12px instead of 16px.
- [ ] Desktop (> 1024px):
    - [ ] StructuredFieldInput: Horizontal layout, full specification.
    - [ ] Optional: Show hints/tooltips on hover.

### Loading & Empty States
- [ ] Spell save loading:
    - [ ] Disable save button with spinner icon.
    - [ ] Show message: "Computing hash...".
    - [ ] Timeout: If save takes > 5 seconds, show warning.
- [ ] Spell library empty:
    - [ ] Message: "No spells yet. Create your first spell or import a bundle.".
    - [ ] CTA buttons: "Create Spell" | "Import Spells".
- [ ] Search no results:
    - [ ] Message: "No spells match your search.".
    - [ ] Suggestion: "Try different keywords or clear filters.".
- [ ] Character has no spells:
    - [ ] Message: "No memorized spells.".
    - [ ] CTA: "Add Spell from Library" button.

### Form Validation UX
- [ ] Validation timing:
    - [ ] Validate on blur (after user leaves field).
    - [ ] Real-time validation for tradition-dependent fields (school/sphere).
    - [ ] Final validation on form submit.
- [ ] Error message clarity:
    - [ ] Bad: "Invalid value" ❌
    - [ ] Good: "School is required for Arcane spells" ✅
    - [ ] Good: "Base value must be a positive number" ✅
- [ ] Success feedback:
    - [ ] Green checkmark icon when field is valid (optional).
    - [ ] Toast notification on successful save: "Spell saved successfully".
    - [ ] Auto-redirect to spell detail view after save.
- [ ] Disabled state:
    - [ ] If save button disabled, show tooltip: "Complete required fields to save".

## Accessibility (WCAG 2.1 AA)
- [ ] Keyboard navigation:
    - [ ] Logical tab order: top-to-bottom, left-to-right.
    - [ ] Visible focus indicator: 2px blue outline (or theme color).
    - [ ] Escape key: Cancel edit, close modals.
    - [ ] Enter key: Submit form (when focus on input).
- [ ] Screen reader support:
    - [ ] ARIA labels for all inputs: `aria-label="Base value"`.
    - [ ] ARIA live regions for validation errors: `aria-live="polite"`.
    - [ ] ARIA describedby for help text: `aria-describedby="range-help"`.
    - [ ] Announce hash copy success: "Hash copied to clipboard".
- [ ] Color contrast:
    - [ ] Text: minimum 4.5:1 contrast ratio.
    - [ ] Large text (≥18px): minimum 3:1 contrast ratio.
    - [ ] Interactive elements: minimum 3:1 contrast ratio.
    - [ ] Error text: ensure red (#d32f2f) has sufficient contrast on white.
- [ ] Focus management:
    - [ ] Focus trap in modals (tab cycles within modal).
    - [ ] Return focus to trigger element after modal close.
    - [ ] Skip links for long forms (optional).
- [ ] Error identification:
    - [ ] Errors identified programmatically (`aria-invalid="true"`).
    - [ ] Error messages associated with fields (`aria-describedby`).
    - [ ] Success states announced (`role="status"`).

## Theme Support
### Application Theme System
- [ ] Create Zustand theme store (`store/useTheme.ts`):
    - [ ] Theme state: 'light' | 'dark' | 'system'
    - [ ] Toggle function: switch between light/dark
    - [ ] Persist to localStorage with key 'theme'
    - [ ] Initialize from localStorage or system preference
- [ ] Add theme initialization script to `index.html`:
    - [ ] Inline script in `<head>` (before React hydration)
    - [ ] Read localStorage or system preference
    - [ ] Apply `dark` class to `<html>` element immediately
- [ ] Create ThemeToggle component (`ui/components/ThemeToggle.tsx`):
    - [ ] Icon button with sun/moon icons
    - [ ] ARIA labels: "Switch to light mode" / "Switch to dark mode"
    - [ ] `aria-pressed` to indicate current state
    - [ ] Keyboard accessible (Enter/Space)
    - [ ] Visible focus indicator (2px outline)
- [ ] Integrate theme toggle into navigation (`ui/App.tsx`):
    - [ ] Add ThemeToggle to header/navigation
    - [ ] Ensure accessible placement
- [ ] Update `main.tsx` to initialize theme store on mount
- [ ] Remove hardcoded dark classes from `index.html`:
    - [ ] Remove `class="bg-neutral-950 text-neutral-100"` from `<body>`
    - [ ] Use theme-aware Tailwind classes instead

### Storybook Theme Integration
- [ ] Install theme addon (if needed): `@storybook/addon-toolbars` or use built-in
- [ ] Create Storybook decorator for theme application:
    - [ ] Read theme from Zustand store or localStorage
    - [ ] Apply `dark` class to Storybook's HTML element
    - [ ] Sync with toolbar selection
- [ ] Update `.storybook/preview.ts`:
    - [ ] Add theme toolbar with light/dark options
    - [ ] Configure decorator to apply theme class
    - [ ] Ensure theme persists across story navigation
- [ ] Test components in both themes:
    - [ ] Verify all components render correctly in light mode
    - [ ] Verify all components render correctly in dark mode
    - [ ] Check color contrast in both themes

### Theme Accessibility & Testing
- [ ] Verify theme toggle keyboard navigation:
    - [ ] Tab to theme toggle button
    - [ ] Activate with Enter/Space
    - [ ] Screen reader announces theme change
- [ ] Test color contrast in both themes:
    - [ ] Use Storybook a11y addon to verify WCAG 2.1 AA
    - [ ] Test all text colors (body, headings, links)
    - [ ] Test interactive elements (buttons, inputs)
    - [ ] Test error states (red text on both backgrounds)
- [ ] Add E2E test for theme switching:
    - [ ] Test: User toggles theme, preference persists on reload
    - [ ] Test: System preference detection on first visit
    - [ ] Test: Theme applies immediately (no flash)

## Testing
### E2E Workflows
- [ ] Test: New user creates first spell (22-step workflow).
- [ ] Test: Edit legacy spell (15-step workflow).
- [ ] Test: Validation error handling (14-step workflow).
- [ ] Test: Keyboard-only navigation (17-step workflow).
- [ ] Test: Screen reader experience.
- [ ] Test: Theme switching workflow.

### Visual Regression
- [ ] Screenshot test: StructuredFieldInput (empty, filled, error, disabled).
- [ ] Screenshot test: SpellEditor with all structured fields.
- [ ] Screenshot test: Components in light theme.
- [ ] Screenshot test: Components in dark theme.
