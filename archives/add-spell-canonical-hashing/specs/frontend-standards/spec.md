# Capability: Frontend Standards (Spell Editor)

## MODIFIED Requirements

### Requirement: Structured Data Editing
The Spell Editor interface MUST support the creation of strictly typed, structured spell data.

#### Scenario: Structured Fields
- GIVEN the Spell Editor
- WHEN editing Duration, Range, Area, or Casting Time
- THEN the user MUST be able to define specific Base Value, Per Level Value, Divisor, and Unit
- AND simple text strings used previously should be migrated to the "Text" display field.

#### Scenario: Tradition Validation
- GIVEN a spell marked as "Arcane"
- WHEN the user attempts to save without a "School" selected
- THEN the editor MUST prevent saving
- AND display a validation error.

### Requirement: Identity Visibility
The application MUST expose the unique identity of the spell to the user.

#### Scenario: Display Hash
- GIVEN a viewing of a spell
- THEN the full SHA-256 Content Hash MUST be visible (or accessible via tooltip/copy)
- TO allow verification of identity against external sources.
