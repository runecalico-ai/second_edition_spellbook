# Verification Plan: Spell UI Design and Accessibility

## End-to-End Workflows

### Workflow: New User Creates First Spell
- [ ] **E2E: Complete First Spell Creation**
  1. User opens application (never created spell before)
  2. Clicks "Create Spell" button
  3. Spell editor opens (all fields empty)
  4. User enters name: "Test Fireball"
  5. Selects tradition dropdown: "ARCANE"
  6. School dropdown becomes required (validation enforced)
  7. Selects school: "Evocation"
  8. Enters level: 3
  9. StructuredFieldInput for range:
     - Enters base: 100
     - Selects unit: "Feet"
     - Modifies per-level: 10
     - Verifies preview: "100 + 10/level feet"
  10. StructuredFieldInput for duration: "Instantaneous"
  11. Checkboxes for components: V, S (Material unchecked)
  12. Fills description and damage
  13. Clicks Save
  14. Button shows loading spinner "Computing hash..."
  15. Redirects to Spell Detail view
  16. Verifies content matches input
  17. Verifies hash is displayed
  18. Verifies "Success" toast appeared

### Workflow: Validation Feedback
- [ ] **E2E: Error Handling Experience**
  1. User opens spell editor
  2. Enters "Bad Spell"
  3. Selects "ARCANE" tradition but NO school
  4. Enters negative range base value (-50)
  5. Tries to Save
  6. Save is blocked
  7. School dropdown shows red border and "Required" error
  8. Range input shows "Must be positive" error
  9. User fixes school -> Error clears immediately
  10. User fixes range -> Error clears on blur
  11. Takes > 5 seconds to save (simulated slow hash)
  12. Warning appears: "Taking longer than expected..."

## Accessibility Tests (WCAG 2.1 AA)

### Keyboard Navigation
- [ ] **Test: Complete spell creation without mouse**
  - GIVEN user at dashboard
  - WHEN using only Tab, Enter, Space, Arrows, Escape
  - THEN user MUST be able to complete "New User Creates First Spell" workflow
  - AND focus indicator MUST be visible at all times

### Screen Reader
- [ ] **Test: Form validation announcements**
  - GIVEN user focuses invalid input
  - THEN screen reader MUST announce error message via `aria-describedby`
  - OR live region MUST announce global validation failure

## Visual Regression

- [ ] **Test: StructuredFieldInput States**
  - Capture screenshots: Empty, Filled, Focused, Error, Disabled
  - Verify alignment, spacing, and colors match design specs

- [ ] **Test: Spell Detail Layout**
  - Capture full spell detail view
  - Verify hash card position and styling
  - Verify badges for components
