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
All application pages SHALL have a proper semantic heading hierarchy.
- **Accessibility**: Controls without sufficient visible text MUST expose an accessible name.
- **WCAG Compliance**: The application SHALL target WCAG 2.1 AA compliance for color contrast and readable text sizing.

#### Scenario: Screen reader navigation
- **WHEN** a user navigates to a new page
- **THEN** the main title is contained in an `<h1>` element
- **AND** all form inputs have an associated `<label>` or `aria-label`

#### Scenario: Icon-only control labeling
- **WHEN** an interactive control has no visible text label
- **THEN** it MUST expose an accessible name such as `aria-label`

#### Scenario: Visible label preferred
- **WHEN** a form input already has an associated visible label
- **THEN** the visible label SHALL be the primary accessible name
- **AND** redundant `aria-label` usage SHALL be avoided unless needed for disambiguation

### Requirement: Window Size Handling
This is a Tauri desktop application. Mobile and tablet breakpoints do not apply. The application SHALL remain usable when the desktop window is resized.

#### Scenario: Narrow Window Layout
- **WHEN** the window width approaches the minimum supported width of 900px
- **THEN** editor sub-layouts with multiple horizontally arranged controls SHALL stack or wrap to avoid overflow
- **AND** the application SHALL remain usable without introducing horizontal scrolling for core editing flows

### Requirement: Keyboard Navigability
The application SHALL be fully navigable via keyboard, with logical focus management and visible focus indicators.

#### Scenario: Tab order
- **WHEN** the user presses `Tab` or `Shift+Tab`
- **THEN** focus SHALL move through interactive controls in a logical visual and semantic order
- **AND** the currently focused control SHALL expose a visible focus indicator

#### Scenario: Form submission by keyboard
- **WHEN** focus is within a form and the user activates the expected keyboard submit interaction
- **THEN** the form SHALL submit or attempt to submit consistently with the visible submit action

#### Scenario: Keyboard dismissal
- **WHEN** the user presses `Escape` in a context that supports dismissal
- **THEN** the relevant modal or editing dismissal action SHALL occur without leaving focus in an undefined state

### Requirement: Focus Management
The application SHALL manage focus programmatically so keyboard and screen reader users are not left in an unexpected context.

#### Scenario: Modal focus trap
- **WHEN** a modal dialog is open
- **THEN** focus SHALL remain trapped within the modal
- **AND** focus SHALL NOT escape to interactive content behind the modal

#### Scenario: Focus return after modal close
- **WHEN** a modal dialog is closed
- **THEN** focus SHALL return to the element that opened the modal, or the nearest logical fallback if the opener no longer exists

### Requirement: Error Identification and Association
Validation and help content SHALL be programmatically associated with the fields they describe.

#### Scenario: Field-level error association
- **WHEN** a field is invalid
- **THEN** the field SHALL expose its invalid state programmatically
- **AND** the associated error text SHALL be linked to the field through the correct descriptive relationship

#### Scenario: Help text association
- **WHEN** additional help text or usage guidance is present for a field
- **THEN** the field SHALL expose that help text through a descriptive association rather than relying on visual proximity alone

#### Scenario: Error announcement pattern
- **WHEN** validation feedback appears
- **THEN** the change SHALL define whether the announcement model is field-level, global, or hybrid
- **AND** the chosen model SHALL be applied consistently across the spell editor

### Requirement: Resize-Safe Structured Inputs
Structured inputs and grouped checkboxes SHALL preserve comprehension when horizontal space is constrained.

#### Scenario: Structured input wrapping
- **WHEN** grouped scalar, unit, or checkbox controls no longer fit comfortably in one row
- **THEN** the controls SHALL reflow into a readable stacked or wrapped layout
- **AND** labels, previews, and validation text SHALL remain visually associated with the correct control group

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

