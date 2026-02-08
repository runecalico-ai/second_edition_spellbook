# Capability: Frontend Standards (Spell Editor)

## MODIFIED Requirements

### Requirement: Structured Data Editing
The Spell Editor interface MUST support the creation of strictly typed, structured spell data.

#### Scenario: Structured Fields
- GIVEN the Spell Editor
- WHEN editing Duration, Range, Area, Casting Time, or Damage
- THEN the user MUST be able to define specific Base Value, Per Level Value, Divisor, and Unit
- AND units MUST use lowercase canonical values per the serialization spec (e.g., `"yd"`, `"ft"`, `"round"`)
- AND simple text strings used previously should be migrated to the "Text" display field.

#### Scenario: Material Component Details
- GIVEN the Spell Editor
- WHEN the user checks the "Material" component checkbox
- THEN the editor MUST display a sub-form for material component details
- AND the sub-form MUST support: name, quantity, GP value, is_consumed, and description
- AND users MUST be able to add multiple material components
- AND the order of material components MUST be preserved (not sorted).


#### Scenario: Tradition Validation (Arcane)
- GIVEN a spell marked as "ARCANE"
- WHEN the user attempts to save without a "School" selected
- THEN the editor MUST prevent saving
- AND display a validation error.

#### Scenario: Tradition Validation (Divine)
- GIVEN a spell marked as "DIVINE"
- WHEN the user attempts to save without a "Sphere" selected
- THEN the editor MUST prevent saving
- AND display a validation error.

#### Scenario: Tradition Validation (Both)
- GIVEN a spell marked as "BOTH"
- WHEN the user attempts to save without both "School" and "Sphere" selected
- THEN the editor MUST prevent saving
- AND display validation errors for missing fields.

### Requirement: Identity Visibility
The application MUST expose the unique identity of the spell to the user.

#### Scenario: Display Hash
- GIVEN a viewing of a spell
- THEN the full SHA-256 Content Hash MUST be visible in the spell detail view
- AND the hash MUST be copyable (via button or click-to-copy).

