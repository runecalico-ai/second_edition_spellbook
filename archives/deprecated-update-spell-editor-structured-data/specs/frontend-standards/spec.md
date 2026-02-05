# Capability: Frontend Standards (Spell Editor)

## MODIFIED Requirements

### Requirement: Structured Data Editing
The Spell Editor interface MUST support the creation of strictly typed, structured spell data.

#### Scenario: Structured Fields
- GIVEN the Spell Editor
- WHEN editing Duration, Range, Area, or Casting Time
- THEN the user MUST be able to define specific Base Value, Per Level Value, Divisor, and Unit
- AND simple text strings used previously should be migrated to the "Text" display field.

#### Scenario: Tradition Validation (Arcane)
- GIVEN a spell marked as "Arcane"
- WHEN the user attempts to save without a "School" selected
- THEN the editor MUST prevent saving
- AND display a validation error.

#### Scenario: Tradition Validation (Divine)
- GIVEN a spell marked as "Divine"
- WHEN the user attempts to save without a "Sphere" selected
- THEN the editor MUST prevent saving
- AND display a validation error.

#### Scenario: Tradition Validation (Both)
- GIVEN a spell marked as "Both"
- WHEN the user attempts to save without both "School" and "Sphere" selected
- THEN the editor MUST prevent saving
- AND display validation errors for missing fields.

### Requirement: Identity Visibility
The application MUST expose the unique identity of the spell to the user.

#### Scenario: Display Hash
- GIVEN a viewing of a spell
- THEN the full SHA-256 Content Hash MUST be visible in the spell detail view
- AND the hash MUST be copyable (via button or click-to-copy).

