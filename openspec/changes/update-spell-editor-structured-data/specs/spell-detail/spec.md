# Capability: Spell Detail Component

## MODIFIED Requirements

### Requirement: Content Hash Display
The Spell Detail view MUST expose the spell's unique content hash.

#### Scenario: Hash Visibility
- GIVEN a spell with a computed content_hash
- WHEN viewing the spell detail
- THEN the view MUST display the first 8 characters of the hash with "..." suffix
- AND provide an "Expand" button to reveal the full 64-character hash.

#### Scenario: Hash Copy
- GIVEN the hash display is visible
- WHEN user clicks the "Copy" button
- THEN the full content_hash MUST be copied to the clipboard
- AND a confirmation toast or indicator MUST appear.

#### Scenario: Hash Styling
- GIVEN the hash display
- THEN the hash MUST be styled as a code block (monospace font, light gray background).

#### Scenario: Hash data-testid (E2E)
- GIVEN the hash display
- THEN the view MUST include `data-testid="spell-detail-hash-display"` on the hash text element, `data-testid="spell-detail-hash-copy"` on the Copy button, and `data-testid="spell-detail-hash-expand"` on the Expand button (per frontend-standards kebab-case naming).

### Requirement: Structured Field Rendering
The Spell Detail view MUST render structured spell data in a human-readable format.

#### Scenario: Range/Duration/Area Display
- GIVEN a spell with structured `range`, `duration`, or `area` data
- WHEN viewing the detail
- THEN the view MUST display the computed `.text` value (e.g., "10 yd", "1 round/level").

#### Scenario: Casting Time Display
- GIVEN a spell with structured `casting_time` data
- WHEN viewing the detail
- THEN the view MUST display the computed `.text` value (or equivalent human-readable casting time).

#### Scenario: Saving Throw Display
- GIVEN a spell with structured `saving_throw` data
- WHEN viewing the detail
- THEN the view MUST display kind and summary or dm_guidance in a human-readable format.

#### Scenario: Magic Resistance Display
- GIVEN a spell with structured `magic_resistance` data
- WHEN viewing the detail
- THEN the view MUST display kind and applies_to (where applicable) in a human-readable format.

#### Scenario: Damage Display
- GIVEN a spell with structured `damage` data
- WHEN viewing the detail
- THEN the view MUST display the damage formula in a readable format.

### Requirement: Component Badge Display
The Spell Detail view MUST display spell components as visual badges.

#### Scenario: V/S/M Badges
- GIVEN a spell with `components = {verbal: true, somatic: true, material: false}`
- WHEN viewing the detail
- THEN the view MUST display "V" and "S" badges
- AND "M" badge MUST NOT appear.

#### Scenario: Material Component List
- GIVEN a spell with material_components populated
- WHEN viewing the detail
- THEN the view MUST display material component details
- AND include name, quantity, gp_value, and consumed status where applicable, and description and unit when present.
