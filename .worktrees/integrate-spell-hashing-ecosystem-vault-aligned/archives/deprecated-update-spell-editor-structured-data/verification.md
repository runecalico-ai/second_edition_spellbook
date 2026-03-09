# Verification Plan: UI Structured Data

## Component Tests

### StructuredFieldInput Component
- [ ] **Test: Initial render with empty value**
  - GIVEN `StructuredFieldInput` with no value
  - THEN all numeric inputs MUST show schema defaults
  - AND unit selector MUST show default unit

- [ ] **Test: Value change emits structured object**
  - GIVEN user enters base_value = 10, unit = "Yards"
  - WHEN onChange fires
  - THEN callback MUST receive `{text: "10 yards", unit: "Yards", base_value: 10, per_level: 0, level_divisor: 1}`

- [ ] **Test: Text preview auto-computes**
  - GIVEN base_value = 10, per_level = 5, unit = "Yards"
  - THEN text preview MUST display "10 + 5/level yards"

- [ ] **Test: Validation enforces schema constraints**
  - GIVEN unit selector
  - WHEN user selects invalid unit (not in enum)
  - THEN component MUST reject and show error

### ComponentCheckboxes Component
- [ ] **Test: Checkbox state to object**
  - GIVEN user checks V and S, unchecks M
  - THEN component MUST emit `{verbal: true, somatic: true, material: false}`

- [ ] **Test: Text preview from checkboxes**
  - GIVEN V=true, S=true, M=false
  - THEN preview MUST show "V, S"

### Legacy Data Migration
- [ ] **Test: Parse legacy string on first edit**
  - GIVEN spell with legacy `range = "10 yards"`
  - WHEN user opens spell in editor
  - THEN `StructuredFieldInput` MUST auto-parse to `{base_value: 10, unit: "Yards"}`

- [ ] **Test: Fallback for unparseable legacy**
  - GIVEN spell with `range = "Special (DM discretion)"`
  - WHEN editor opens
  - THEN text field MUST show "Special (DM discretion)"
  - AND structured fields MUST show defaults with warning

## Integration Tests

### SpellEditor Tradition Validation
- [ ] **Test: Arcane spell requires school**
  - GIVEN user selects tradition = "ARCANE"
  - AND leaves school = null
  - WHEN attempting to save
  - THEN save MUST be blocked
  - AND validation message MUST appear

- [ ] **Test: Divine spell requires sphere**
  - GIVEN user selects tradition = "DIVINE"
  - AND leaves sphere = null
  - WHEN attempting to save
  - THEN save MUST be blocked

- [ ] **Test: BOTH tradition requires both**
  - GIVEN tradition = "BOTH"
  - WHEN either school or sphere is null
  - THEN save MUST be blocked

### SpellDetail Display
- [ ] **Test: Hash display with copy button**
  - GIVEN spell with hash "abc123...xyz789"
  - WHEN viewing spell detail
  - THEN hash MUST be visible (first 8 chars or expandable)
  - AND clicking copy button MUST copy full hash

- [ ] **Test: Structured field rendering**
  - GIVEN spell with structured `range = {base_value: 10, unit: "Yards"}`
  - WHEN viewing detail
  - THEN display MUST show computed text "10 yards"

- [ ] **Test: Component badges**
  - GIVEN spell with `components = {verbal: true, somatic: true, material: false}`
  - THEN display MUST show "V, S" badges

## End-to-End Tests

### Create Spell with Structured Data
- [ ] **Test: Full spell creation workflow**
  - GIVEN user opens create spell dialog
  - WHEN user enters:
    - Name: "Test Spell"
    - Tradition: "ARCANE"
    - School: "Evocation"
    - Level: 3
    - Range: base=10, per_level=5, unit="Yards"
    - Duration: base=1, per_level=1, unit="Round"
    - Components: V=true, S=true, M=false
  - THEN spell MUST be created
  - AND backend MUST receive structured objects
  - AND hash MUST be computed from structured data

### Edit Existing Spell
- [ ] **Test: Edit spell and verify hash update**
  - GIVEN existing spell with hash A
  - WHEN user changes range from "10 yards" to "20 yards"
  - THEN hash MUST change to hash B
  - AND new hash MUST be visible in detail view

### Visual Regression Tests
- [ ] **Test: StructuredFieldInput appearance**
  - Screenshot test for component in different states:
    - Empty
    - Filled
    - Validation error
    - Disabled

- [ ] **Test: SpellEditor with structured inputs**
  - Screenshot test for full editor with all structured fields

## Accessibility Tests
- [ ] **Test: Keyboard navigation**
  - GIVEN StructuredFieldInput focused
  - WHEN user presses Tab
  - THEN focus MUST move to next input field in logical order

- [ ] **Test: Screen reader labels**
  - GIVEN StructuredFieldInput
  - THEN each input MUST have accessible label
  - AND validation errors MUST be announced

## Performance Tests
- [ ] **Test: Text preview computation**
  - GIVEN large spell dataset (1000 spells)
  - WHEN rendering list with previews
  - THEN rendering MUST complete within 100ms

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
     - Enters base_value: 10
     - Leaves per_level: 0 (default)
     - Selects unit: "Yards"
     - Text preview updates: "10 yards"
  10. StructuredFieldInput for duration:
      - Enters base_value: 1
      - Enters per_level: 1
      - Selects unit: "Round"
      - Text preview updates: "1 + 1/level rounds"
  11. ComponentCheckboxes for components:
      - Checks Verbal (V)
      - Checks Somatic (S)
      - Checks Material (M)
      - Preview shows: "V, S, M"
  12. Enters description: "A ball of fire explodes from your hands."
  13. Clicks "Save" button
  14. Spinner shows: "Computing hash..."
  15. Toast notification: "Spell saved successfully"
  16. Redirected to spell detail view
  17. Hash displayed at top-right (first 8 chars + "...")
  18. Click "Expand hash"
  19. Full 64-char hash shown
  20. Click "Copy hash" button
  21. Tooltip: "Hash copied to clipboard"
  22. Verify clipboard contains full hash

### Workflow: Edit Legacy Spell
- [ ] **E2E: Legacy to Structured Migration**
  1. Database contains legacy spell with `range = "10 yards"` (string)
  2. User opens spell library
  3. Selects legacy spell "Magic Missile"
  4. Spell detail view shows range as "10 yards" (text)
  5. User clicks "Edit" button
  6. Spell editor opens
  7. StructuredFieldInput auto-parses:
     - base_value = 10
     - unit = "Yards"
     - Text preview = "10 yards"
  8. User changes base_value from 10 to 20
  9. Text preview updates: "20 yards"
  10. User clicks "Save"
  11. Hash recomputed (different from before because range changed)
  12. Toast: "Spell updated successfully"
  13. Return to detail view
  14. Range now shows "20 yards" (structured data)
  15. Hash has changed (old hash A → new hash B)

### Workflow: Validation Error Handling
- [ ] **E2E: User Encounters Validation Errors**
  1. User creates new spell
  2. Enters name: "Invalid Spell"
  3. Selects tradition: "ARCANE"
  4. Skips school selection (leaves null)
  5. Clicks "Save"
  6. Save button disabled, tooltip shows: "Complete required fields"
  7. Validation error appears below school dropdown:
     - Icon: Warning triangle (red)
     - Message: "School is required for Arcane spells"
  8. School dropdown border turns red
  9. User selects school: "Evocation"
  10. Validation error disappears
  11. School dropdown border returns to normal
  12. Save button becomes enabled
  13. User clicks "Save"
  14. Spell saves successfully

### Error Scenarios

#### Error: Unparseable Legacy Data
- [ ] **E2E: Fallback for Complex Legacy Field**
  - GIVEN legacy spell with range "Special (varies, see description)"
  - WHEN user opens spell in editor
  - THEN StructuredFieldInput shows:
    - Text field: "Special (varies, see description)"
    - Structured inputs: defaults (base=0, per_level=0, unit="Special")
    - Warning banner: "Could not parse range automatically. Please review."
  - WHEN user manually updates structured fields
  - AND saves spell
  - THEN warning disappears
  - AND structured data is used going forward

#### Error: Network Failure During Save
- [ ] **E2E: Handle Save Failure**
  - GIVEN user has edited spell
  - WHEN clicking "Save"
  - AND network request fails (simulated)
  - THEN error toast appears: "Failed to save spell. Please try again."
  - AND form remains open (data not lost)
  - AND user can retry save

#### Error: Invalid Characters in Numeric Input
- [ ] **E2E: Validate Numeric Input**
  - GIVEN StructuredFieldInput for range
  - WHEN user types "abc" in base_value field
  - THEN input rejects non-numeric characters
  - OR validation error shows: "Base value must be a number"
  - WHEN user enters valid number "10"
  - THEN error clears

### Accessibility Workflows

#### Workflow: Keyboard-Only Navigation
- [ ] **E2E: Complete Spell Creation Without Mouse**
  1. User opens spell editor (keyboard only)
  2. Tab to name field, enter "Keyboard Spell"
  3. Tab to tradition dropdown
  4. Arrow down to "ARCANE", press Enter
  5. Tab to school dropdown (auto-focused due to validation)
  6. Arrow down to "Evocation", press Enter
  7. Tab to level field, enter "3"
  8. Tab to range base_value, enter "10"
  9. Tab to range per_level, enter "0"
  10. Tab to range unit dropdown, arrow down to "Yards", Enter
  11. Tab to duration inputs, enter values
  12. Tab to component checkboxes, Space to toggle
  13. Tab to description textarea, enter text
  14. Tab to "Save" button
  15. Press Enter to save
  16. Spell saves successfully
  17. Focus moves to detail view

#### Workflow: Screen Reader Experience
- [ ] **E2E: Screen Reader Announces All Changes**
  - GIVEN screen reader enabled (NVDA/JAWS)
  - WHEN user tabs to StructuredFieldInput
  - THEN screen reader announces: "Range, base value, edit text"
  - WHEN user enters value
  - THEN preview updates
  - AND live region announces: "Range preview: 10 yards"
  - WHEN validation error occurs
  - THEN live region announces: "Error: School is required for Arcane spells"
  - WHEN spell saves successfully
  - THEN live region announces: "Spell saved successfully"

