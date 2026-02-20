# frontend-standards Specification

## Purpose
This specification defines the collective frontend development standards for the application, ensuring consistency, accessibility, and robust testability through mandatory patterns like data-testid attributes, semantic HTML structures, and strict input validation.
## Requirements
### Requirement: Frontend Identifiability
All interactive UI elements and list items SHALL use `data-testid` attributes to ensure stable testability.
- **Scope**: Buttons, Inputs, Selects, List/Table Rows, Modals.
- **Naming**: `kebab-case` descriptive IDs (e.g., `save-button`, `spell-level-input`, `spell-row-fireball`).

#### Scenario: Test locates element reliably
- **WHEN** an automated test attempts to find the "Save" button
- **THEN** it can locate it via `[data-testid="save-button"]` regardless of CSS class changes

#### Scenario: Dynamic list items
- **WHEN** a list of items is rendered (e.g., spells)
- **THEN** each item container has a `data-testid` incorporating the item's unique key or name (e.g. `spell-row-123` or `spell-row-magic-missile`)

### Requirement: Robust Input Validation
Numeric inputs MUST use strict "clamp-on-change" validation to prevent invalid values from persisting in the component state.

#### Scenario: User types invalid number
- **WHEN** a user types a value outside the allowed range (e.g., "-5" for level)
- **THEN** the input immediately clamps the value to the nearest valid bound (e.g., "0")
- **AND** the component state never reflects the invalid value

#### Scenario: User types non-numeric text
- **WHEN** a user types non-numeric characters into a number input
- **THEN** the input defaults to a safe fallback (e.g., 0) or ignores the input, ensuring `NaN` is not rendered

#### Scenario: Documentation presence
- **WHEN** a developer consults `AGENTS.md`
- **THEN** the "Clamp-on-Change" pattern and "Atomic Side-Effects" guidance are explicitly documented with examples

### Requirement: Semantic Structure
All application pages SHALL have a proper semantic heading hierarchy starting with `<h1>` and all inputs MUST have accessible labels.

#### Scenario: Screen reader navigation
- **WHEN** a user navigates to a new page
- **THEN** the main title is contained in an `<h1>` element
- **AND** all form inputs have an associated `<label>` or `aria-label`

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

### Requirement: Identity Visibility
The application MUST expose the unique identity of the spell to the user.

#### Scenario: Display Hash
- GIVEN a viewing of a spell
- THEN the spell detail view MUST display the first 8 characters of the content hash with "..." suffix
- AND provide an "Expand" button to reveal the full 64-character hash
- AND the hash MUST be copyable (via Copy button or click-to-copy).

