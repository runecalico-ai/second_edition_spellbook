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

