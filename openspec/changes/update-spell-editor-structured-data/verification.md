# Verification Plan: Spell Editor Structured Data Components

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

### Legacy Data Parsing
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
