# Capability: Spell Editor Component

## MODIFIED Requirements

### Requirement: Structured Field Editing
The Spell Editor MUST provide dedicated input components for structured spell data.

#### Scenario: StructuredFieldInput Integration
- GIVEN the Spell Editor form
- WHEN editing Range, Duration, or Casting Time
- THEN the editor MUST render a `StructuredFieldInput` component
- AND the component MUST provide inputs for: base_value, per_level, divisor, unit
- AND the component MUST display a computed text preview in real-time.

#### Scenario: Legacy Data Loading
- GIVEN a spell with `canonical_data` column populated
- WHEN opening the spell in the editor
- THEN the editor MUST load structured values from `canonical_data`
- AND populate all `StructuredFieldInput` components with those values.

#### Scenario: Legacy String Parsing
- GIVEN a spell with null `canonical_data` and legacy string values
- WHEN opening the spell in the editor
- THEN the editor MUST call Tauri backend parser commands
- AND populate structured inputs with parsed values
- AND display a warning banner if parsing fell back to `kind: "special"`.

### Requirement: Component Input
The Spell Editor MUST provide explicit controls for spell components.

#### Scenario: V/S/M Checkboxes
- GIVEN the Spell Editor form
- WHEN editing spell components
- THEN the editor MUST render checkboxes for Verbal, Somatic, and Material
- AND display a text preview (e.g., "V, S, M") based on selections.

#### Scenario: Material Component Details
- GIVEN the Material checkbox is checked
- THEN the editor MUST display a sub-form for material component details
- AND the sub-form MUST include: name (required), quantity, gp_value, is_consumed, description
- AND the editor MUST support multiple material components with add/remove controls.
- AND the editor MUST preserve order of components.

#### Scenario: Material Component Uncheck Confirmation
- GIVEN the Material checkbox is checked
- AND the material components list is NOT empty
- WHEN the user unchecks the Material checkbox
- THEN the editor MUST display a confirmation dialog
- AND ONLY clear the material data IF the user confirms.

### Requirement: Input Validation
The Spell Editor MUST enforce schema-compliant input.

#### Scenario: Numeric Validation
- GIVEN a numeric input field (base_value, per_level, quantity)
- WHEN user enters a negative number
- THEN the editor MUST display a validation error
- AND prevent saving until corrected.

#### Scenario: Unit Enum Validation
- GIVEN a unit dropdown
- WHEN the value does not match the schema enum
- THEN the editor MUST display a validation error.

#### Scenario: Tradition Validation
- GIVEN a spell with tradition = "ARCANE"
- WHEN school is not selected
- THEN the editor MUST block saving
- AND display an inline validation error.

### Requirement: Complex Field Editing
The Spell Editor MUST provide specialized forms for complex fields.

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

#### Scenario: Saving Throw and MR Editing
- GIVEN the Spell Editor form
- WHEN editing Saving Throw or Magic Resistance
- THEN the editor MUST render specific enum-based inputs (not generic strings).
