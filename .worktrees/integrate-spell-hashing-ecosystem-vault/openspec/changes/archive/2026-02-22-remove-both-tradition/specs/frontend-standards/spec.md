## MODIFIED Requirements

### Requirement: Structured Data Editing
The Spell Editor interface MUST support the creation of strictly typed, structured spell data.

#### Scenario: Structured Fields (Range, Duration, Casting Time)
- GIVEN the Spell Editor
- WHEN editing Range, Duration, or Casting Time
- THEN the user MUST be able to define specific Base Value, Per Level Value, Divisor, and Unit (as applicable per schema shape)
- AND units MUST use lowercase canonical values per the serialization spec for storage. Common unit examples:
  - **Range**: `"yd"` (yards), `"ft"` (feet), `"mi"` (miles)
  - **Duration**: `"round"` (rounds), `"turn"` (turns), `"hour"` (hours)
  - **Casting time**: `"segment"` (segments), `"round"` (rounds), `"action"` (actions)
  Display labels MAY be human-friendly (e.g. "Yards", "Feet", "Rounds") while serialization uses canonical enum values. See `spell.schema.json` for complete unit enum lists.
- AND the read-only display for such fields MUST show the computed `.text` value (text preview) derived from structured inputs, not a separate free-text field.
- Area and Damage use specialized forms with kind-specific fields per schema (`#/$defs/AreaSpec`, `#/$defs/SpellDamageSpec`), not a single scalar tuple.

#### Scenario: Material Component Details
- GIVEN the Spell Editor
- WHEN the user checks the "Material" component checkbox
- THEN the editor MUST display a sub-form for material component details
- AND the sub-form MUST support: name (required), quantity, GP value (optional), is_consumed, description (optional), and unit (optional). The UI MUST expose the `unit` field.
- AND quantity is stored as a number and materialized as 1.0 in canonical form; validation MUST enforce quantity >= 1 (or >= 1.0); default display 1.0 keeps hashing consistent.
- AND users MUST be able to add multiple material components
- AND the order of material components MUST be preserved (not sorted).

#### Scenario: Numeric input behavior
- GIVEN a structured scalar input (base_value, per_level, quantity, etc.)
- WHEN the user enters a value outside the allowed range
- THEN the input MUST use clamp-on-change (per main frontend-standards) to keep the value within valid bounds
- AND tradition/school/sphere validation MUST use "block save + inline error" (semantic rules), not clamp.

#### Scenario: Tradition Validation
- Tradition validation MUST follow the spell-editor spec: ARCANE → school required; DIVINE → sphere required. The editor MUST block save and display inline validation errors when requirements are not met.
- Having both school and sphere set simultaneously is invalid data; the editor MUST surface a data-integrity error and block saving until resolved.
