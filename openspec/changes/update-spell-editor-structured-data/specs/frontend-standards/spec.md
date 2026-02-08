# Capability: Frontend Standards (Spell Editor)

## MODIFIED Requirements

### Requirement: Structured Data Editing
The Spell Editor interface MUST support the creation of strictly typed, structured spell data.

#### Scenario: Structured Fields (Range, Duration, Casting Time)
- GIVEN the Spell Editor
- WHEN editing Range, Duration, or Casting Time
- THEN the user MUST be able to define specific Base Value, Per Level Value, Divisor, and Unit (as applicable per schema shape)
- AND units MUST use lowercase canonical values per the serialization spec for storage (e.g., `"yd"`, `"ft"`, `"round"`); display labels MAY be human-friendly (e.g. "Yards", "Feet") while serialization uses canonical enums
- AND the read-only display for such fields MUST show the computed `.text` value (text preview) derived from structured inputs, not a separate free-text field.
- Area and Damage use specialized forms with kind-specific fields per schema (AreaSpec, SpellDamageSpec), not a single scalar tuple.

#### Scenario: Material Component Details
- GIVEN the Spell Editor
- WHEN the user checks the "Material" component checkbox
- THEN the editor MUST display a sub-form for material component details
- AND the sub-form MUST support: name (required), quantity, GP value (optional), is_consumed, and description (optional). Material component sub-form MAY include optional `unit` when the UI exposes it; schema supports optional `unit`.
- AND quantity is stored as a number and materialized as 1.0 in canonical form; validation MUST enforce quantity >= 1 (or >= 1.0); default display 1.0 keeps hashing consistent.
- AND users MUST be able to add multiple material components
- AND the order of material components MUST be preserved (not sorted).


#### Scenario: Numeric input behavior
- GIVEN a structured scalar input (base_value, per_level, quantity, etc.)
- WHEN the user enters a value outside the allowed range
- THEN the input MUST use clamp-on-change (per main frontend-standards) to keep the value within valid bounds
- AND tradition/school/sphere validation MUST use "block save + inline error" (semantic rules), not clamp.

#### Scenario: Tradition Validation (Arcane)
- GIVEN a spell marked as "ARCANE"
- WHEN the user attempts to save without a "School" selected
- THEN the editor MUST prevent saving
- AND display a validation error. (Tradition validation rules are defined in the Spell Editor spec; frontend-standards references them for consistency.)

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
- THEN the spell detail view MUST display the first 8 characters of the content hash with "..." suffix
- AND provide an "Expand" button to reveal the full 64-character hash
- AND the hash MUST be copyable (via Copy button or click-to-copy).

