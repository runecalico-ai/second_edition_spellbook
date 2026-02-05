# Tasks: Structure Spell Data UI

## Frontend Implementation
**Spec:** [specs/frontend-standards/spec.md](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/update-spell-editor-structured-data/specs/frontend-standards/spec.md)

### Component Architecture
- [ ] Design `StructuredFieldInput` component API:
    - [ ] Props: `fieldName`, `fieldType` (range | duration | area | casting_time), `value`, `schema`, `onChange`.
    - [ ] State: `baseValue`, `perLevel`, `levelDivisor`, `unit`, `text` (display preview).
    - [ ] Events: `onChange(structuredObject)` - emits complete structured object.
    - [ ] Validation: Enforce schema constraints (enum values, required fields).
- [ ] Implement subcomponents:
    - [ ] `NumericInput` - for base_value, per_level, level_divisor (number inputs with validation).
    - [ ] `UnitSelector` - dropdown with schema-defined enum values (e.g., "Yards", "Touch", "Unlimited").
    - [ ] `TextPreview` - computed display text (e.g., "10 yards + 5 yards/level") - read-only, auto-updates.
    - [ ] `DamageInput` - specialized for damage dice notation (base_dice, per_level_dice, cap_level).
- [ ] Create shared component: `ComponentCheckboxes`:
    - [ ] Props: `components` object `{verbal, somatic, material}`.
    - [ ] Renders: Three checkboxes (V, S, M).
    - [ ] Displays: Computed text preview ("V, S, M" or "V, S").

### SpellEditor Integration
- [ ] Update `SpellEditor.tsx`:
    - [ ] Replace string inputs for range, duration, casting_time, area with `StructuredFieldInput`.
    - [ ] Integrate `ComponentCheckboxes` for V/S/M selection.
    - [ ] Add tradition-based validation:
        - [ ] If tradition = "ARCANE", require `school` selection.
        - [ ] If tradition = "DIVINE", require `sphere` selection.
        - [ ] If tradition = "BOTH", require both `school` and `sphere`.
    - [ ] Add multi-select inputs for:
        - [ ] `tags` (array of strings, user can add custom tags).
        - [ ] `subschools` (multi-select from schema enum).
        - [ ] `descriptors` (multi-select from schema enum).
        - [ ] `class_list` (multi-select from available classes).
    - [ ] Display structured data summary before save (review panel).
- [ ] Handle legacy data migration in editor:
    - [ ] If spell has string range/duration (legacy), parse on first edit.
    - [ ] Fallback: If parsing fails, set `.text` only and warn user.
    - [ ] Allow user to manually enter structured fields if auto-parse incomplete.

### SpellDetail Display
- [ ] Update `SpellDetail.tsx`:
    - [ ] Display `content_hash` prominently:
        - [ ] Show first 8 characters + "..." with click-to-expand.
        - [ ] Add "Copy Hash" button.
    - [ ] Display structured fields as formatted text:
        - [ ] Use computed `.text` field for range, duration, etc.
        - [ ] Show components as "V, S, M" badges.
    - [ ] Add metadata section:
        - [ ] Show `source_refs` as formatted citations.
        - [ ] Show `edition`, `author`, `version`, `license` if present.

### Testing
- [ ] Add unit tests for each component:
    - [ ] `StructuredFieldInput`: Test value changes, validation, text preview computation.
    - [ ] `NumericInput`: Test bounds, decimal handling, empty values.
    - [ ] `UnitSelector`: Test enum constraint enforcement.
    - [ ] `ComponentCheckboxes`: Test boolean state, text preview.
- [ ] Add integration tests:
    - [ ] Test `SpellEditor` with structured inputs.
    - [ ] Test validation (missing required fields, invalid enums).
    - [ ] Test legacy data handling (string to structured migration).
- [ ] Add Storybook stories for design review:
    - [ ] `StructuredFieldInput` in different states (empty, filled, error).
    - [ ] `SpellEditor` with sample spell data.
    - [ ] `SpellDetail` with various spell types.

## Documentation
- [ ] User documentation:
    - [ ] Update user manual with structured field editing:
        - [ ] Document StructuredFieldInput component usage.
        - [ ] Explain how to enter base value, per-level, and units.
        - [ ] Provide examples for common patterns (range, duration, damage).
        - [ ] Document V/S/M checkbox usage.
    - [ ] Create visual guide:
        - [ ] Screenshot: Structured field input (annotated).
        - [ ] Video: Editing a spell with all structured fields.
        - [ ] GIF: Using tradition validation (Arcane requires school).
    - [ ] Update spell editor help:
        - [ ] Explain difference between legacy string and structured fields.
        - [ ] Document automatic text preview computation.
        - [ ] Explain content hash visibility.
- [ ] Developer documentation:
    - [ ] Write component API guide:
        - [ ] `StructuredFieldInput` props and usage.
        - [ ] `ComponentCheckboxes` props and usage.
        - [ ] State management patterns.
        - [ ] Event handling (onChange, onBlur).
    - [ ] Create Storybook stories:
        - [ ] Stories for all StructuredFieldInput variations.
        - [ ] Interaction tests in Storybook.
        - [ ] Accessibility checks in Storybook.

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
    - [ ] Message: "No spells yet. Create your first spell or import a bundle."
    - [ ] CTA buttons: "Create Spell" | "Import Spells".
- [ ] Search no results:
    - [ ] Message: "No spells match your search."
    - [ ] Suggestion: "Try different keywords or clear filters."
- [ ] Character has no spells:
    - [ ] Message: "No memorized spells."
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
    - [ ] Skip links for long forms (optional, if form is very long).
- [ ] Error identification:
    - [ ] Errors identified programmatically (`aria-invalid="true"`).
    - [ ] Error messages associated with fields (`aria-describedby`).
    - [ ] Success states announced (`role="status"`).
