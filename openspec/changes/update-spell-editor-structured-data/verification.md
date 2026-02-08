# Verification Plan: Spell Editor Structured Data Components

## Component Tests

### StructuredFieldInput Component
- [ ] **Test: Initial render with empty value**
  - GIVEN `StructuredFieldInput` with no value
  - THEN all numeric inputs MUST show schema defaults
  - AND unit selector MUST show default unit

- [ ] **Test: Value change emits structured object**
  - GIVEN user enters base_value = 10, unit = "yd"
  - WHEN onChange fires
  - THEN callback MUST receive `{text: "10 yd", unit: "yd", base_value: 10, per_level: 0, divisor: 1}`

- [ ] **Test: Text preview auto-computes**
  - GIVEN base_value = 10, per_level = 5, unit = "yd"
  - THEN text preview MUST display "10 + 5/level yd"

- [ ] **Test: Validation enforces schema constraints**
  - GIVEN unit selector
  - WHEN user selects invalid unit (not in enum)
  - THEN component MUST reject and show error

- [ ] **Test: Negative number rejection**
  - GIVEN user enters base_value = -5
  - THEN component MUST show validation error
  - AND value MUST NOT be accepted

- [ ] **Test: Decimal precision handling**
  - GIVEN user enters per_level = 0.5
  - THEN component MUST accept the value
  - AND value MUST be serialized with up to 6 decimal places per canonical spec

- [ ] **Test: Locale-aware decimal input**
  - GIVEN user locale uses comma as decimal separator
  - WHEN user enters "1,5" in per_level field
  - THEN component MUST interpret as 1.5
  - AND display in locale-appropriate format

- [ ] **Test: Maximum value limits**
  - GIVEN user enters base_value exceeding reasonable maximum (e.g., 999999)
  - THEN component MUST either accept or show warning based on field type

### ComponentCheckboxes Component
- [ ] **Test: Checkbox state to object**
  - GIVEN user checks V and S, unchecks M
  - THEN component MUST emit `{verbal: true, somatic: true, material: false}`

- [ ] **Test: Text preview from checkboxes**
  - GIVEN V=true, S=true, M=false
  - THEN preview MUST show "V, S"

- [ ] **Test: Material sub-form visibility**
  - GIVEN user checks M checkbox
  - THEN material component sub-form MUST appear
  - AND sub-form MUST include: name, quantity, gp_value, is_consumed, description

- [ ] **Test: Multiple material components**
  - GIVEN material sub-form is visible
  - WHEN user clicks "Add Material" button
  - THEN a new material component row MUST appear
  - AND user MUST be able to remove individual components

- [ ] **Test: Material component output structure**
  - GIVEN user enters: name="powdered diamond", quantity=1, gp_value=100, is_consumed=true
  - THEN component MUST emit `material_components: [{name: "powdered diamond", quantity: 1.0, gp_value: 100.0, is_consumed: true}]`

- [ ] **Test: Material quantity validation**
  - GIVEN user enters quantity = 0 or negative
  - THEN component MUST show validation error
  - AND quantity MUST default to 1.0 per schema

- [ ] **Test: Material name required**
  - GIVEN user adds material component
  - WHEN name field is empty
  - THEN component MUST show validation error
  - AND save MUST be blocked


### Legacy Data Parsing
- [ ] **Test: Parse legacy string on first edit**
  - GIVEN spell with legacy `range = "10 yards"`
  - WHEN user opens spell in editor
  - THEN `StructuredFieldInput` MUST auto-parse to `{base_value: 10, unit: "yd"}`

- [ ] **Test: Fallback for unparseable legacy**
  - GIVEN spell with `range = "Special (DM discretion)"`
  - WHEN editor opens
  - THEN text field MUST show "Special (DM discretion)"
  - AND structured fields MUST show defaults (`kind: "special"`, `base_value: 0`) with warning banner

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
  - GIVEN spell with structured `range = {kind: "distance", base_value: 10, unit: "yd"}`
  - WHEN viewing detail
  - THEN display MUST show computed text "10 yd"

- [ ] **Test: Component badges**
  - GIVEN spell with `components = {verbal: true, somatic: true, material: false}`
  - THEN display MUST show "V, S" badges

#### Scenario: Damage Editing
- GIVEN the Spell Editor form
- WHEN editing Damage
- THEN the editor MUST render a `DamageForm`
- AND allow selecting kind (None, Modeled, DM Adjudicated)
- AND if Modeled, allow adding multiple damage parts
- AND allow configuring damage type, dice pool, and scaling for each part.

#### Scenario: Area Editing
- GIVEN the Spell Editor form
- WHEN editing Area
- THEN the editor MUST render an `AreaForm`
- AND allow selecting kind (Cone, Cube, Sphere, etc.)
- AND allow entering specific scalars (radius, length, etc.) based on kind.

### Material Component Confirmation
- [ ] **Test: Uncheck with existing data**
  - GIVEN material components list has 1 item
  - WHEN user unchecks "Material"
  - THEN a confirmation dialog MUST appear
  - AND data MUST NOT be cleared yet

- [ ] **Test: Confirming uncheck clears data**
  - GIVEN confirmation dialog is open
  - WHEN user clicks "Confirm"
  - THEN `material` property MUST become false
  - AND `material_components` array MUST become empty

- [ ] **Test: Canceling uncheck preserves data**
  - GIVEN confirmation dialog is open
  - WHEN user clicks "Cancel"
  - THEN `material` property MUST remain true
  - AND `material_components` array MUST be preserved

### Complex Form Components

#### DamageForm
- [ ] **Test: Kind selection**
  - GIVEN `DamageForm`
  - WHEN user selects "Modeled"
  - THEN `parts` list and `combine_mode` selector MUST appear

- [ ] **Test: Add Damage Part**
  - GIVEN `DamageForm` in Modeled mode
  - WHEN user clicks "Add Part"
  - THEN a new `DamagePart` sub-form MUST appear
  - AND it MUST have default values (e.g. 1d6 bludgeoning)

- [ ] **Test: Dice Pool editing**
  - GIVEN a `DamagePart`
  - WHEN user changes dice count or sides
  - THEN the changes MUST be reflected in the output object

#### AreaForm
- [ ] **Test: Kind selection**
  - GIVEN `AreaForm`
  - WHEN user selects "Cone"
  - THEN `length` and `shape_unit` inputs MUST appear

- [ ] **Test: Dynamic Inputs**
  - GIVEN `AreaForm` with Kind="Cylinder"
  - THEN `radius`, `height`, and `shape_unit` inputs MUST be visible

#### SavingThrowInput
- [ ] **Test: Kind serialization**
  - GIVEN `SavingThrowInput`
  - WHEN user selects "Half"
  - THEN output MUST be `{kind: "half"}`
  - AND partial fraction inputs MUST be hidden

#### MagicResistanceInput
- [ ] **Test: Applies To selection**
  - GIVEN `MagicResistanceInput`
  - WHEN user selects "Beneficial Effects Only"
  - THEN output MUST be `{kind: "normal", applies_to: "beneficial_effects_only"}`
