## MODIFIED Requirements

### Requirement: Structured Field Rendering
The Spell Detail view MUST render structured spell data in a human-readable format.

#### Scenario: Range/Duration/Area Display
- GIVEN a spell with structured `range`, `duration`, or `area` data
- WHEN viewing the detail
- THEN the view MUST display the computed `.text` value (e.g., "10 yd", "1 round/level"). The `.text` value is computed by the backend during canonical serialization and stored in `canonical_data`. If `.text` is missing, the detail view MAY compute it from structured fields for display, but the backend-computed value is authoritative.

#### Scenario: Casting Time Display
- GIVEN a spell with structured `casting_time` data
- WHEN viewing the detail
- THEN the view MUST display the computed `.text` value (or equivalent human-readable casting time). The `.text` value is computed by the backend during canonical serialization. If missing, compute from structured fields (base_value, per_level, unit) for display.

#### Scenario: Saving Throw Display
- GIVEN a spell with structured `saving_throw` data
- WHEN viewing the detail
- THEN the view MUST display kind and summary or notes in a human-readable format.

#### Scenario: Magic Resistance Display
- GIVEN a spell with structured `magic_resistance` data
- WHEN viewing the detail
- THEN the view MUST display kind and applies_to (where applicable) in a human-readable format.

#### Scenario: Damage Display
- GIVEN a spell with structured `damage` data
- WHEN viewing the detail
- THEN the view MUST display the damage formula in a readable format.
