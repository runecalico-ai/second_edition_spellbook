# Spell Detail Specification

## Purpose
Defines how the spell detail view (implemented as the Spell Editor when editing an existing spell) displays content hash, structured spell data, and component badges. There is no separate read-only `/spell/:id` detail route.

## Requirements

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
- THEN the view MUST display the computed `.text` value (e.g., "10 yd", "1 round/level"). The `.text` value is computed by the backend during canonical serialization and stored in `canonical_data`. If `.text` is missing, the detail view MUST fall back to `raw_legacy_value` (the original authored string preserved by the importer). If `raw_legacy_value` is also absent, the detail view MUST synthesize a display string from the structured algebraic fields. The backend-computed `.text` is authoritative; fallbacks are display-only.

#### Scenario: Casting Time Display
- GIVEN a spell with structured `casting_time` data
- WHEN viewing the detail
- THEN the view MUST display the computed `.text` value (or equivalent human-readable casting time). The `.text` value is computed by the backend during canonical serialization. If `.text` is missing, the detail view MUST fall back to `raw_legacy_value`. If `raw_legacy_value` is also absent, the detail view MUST synthesize a display string from `(base_value, unit)` (the only structured fields on the `CastingTime` flat object).

#### Scenario: Saving Throw Display
- GIVEN a spell with structured `saving_throw` data
- WHEN viewing the detail
- THEN the view MUST dispatch on `kind`:
  - `"single"`: display the `single` entry's `save_type` (the AD&D 2e saving throw matrix row) and `save_vs` (the specific effect being saved against).
  - `"multiple"`: display each entry in the `multiple` array's `save_type` and `save_vs`.
  - `"dm_adjudicated"`: no structured save entries exist; display `raw_legacy_value` (if present) or `notes` as the primary descriptive content.
  - `"none"`: display no saving throw line.
- In all cases, if `notes` is present it MUST also be displayed.
- Since `raw_legacy_value` is now unconditionally populated for all kinds (per this change), the view MUST display it as a secondary "Original source" annotation for `"single"` and `"multiple"` kinds — consistent with how the spell editor presents it as a read-only labelled annotation. For `"dm_adjudicated"`, `raw_legacy_value` remains the primary descriptive content (not a secondary annotation). The annotation MAY be rendered as a collapsible/expandable element to avoid visual clutter when structured data is already displayed.
- If `raw_legacy_value` is present and structured save entries are absent (e.g., `kind = "dm_adjudicated"` with no other content), the view MUST display `raw_legacy_value` as the fallback.

#### Scenario: Magic Resistance Display
- GIVEN a spell with structured `magic_resistance` data
- WHEN viewing the detail
- THEN the view MUST display `kind` and `applies_to` (where applicable). If `source_text` is present (the original legacy descriptor preserved by the importer, excluded from the canonical hash), it MUST also be displayed — this is the primary content when `kind` alone is insufficient (e.g., `kind = "special"`).

#### Scenario: Damage Display
- GIVEN a spell with structured `damage` data
- WHEN viewing the detail
- THEN the view MUST display the damage formula constructed from the structured algebraic fields (e.g., dice, bonus, damage type). If the structured algebraic fields are absent or empty, the view MUST fall back to `source_text` (the original legacy descriptor preserved by the importer, excluded from the canonical hash).

#### Scenario: No Structured Data (Parse Failure Fallback)
- GIVEN a spell field where parsing failed and only `raw_legacy_value` or `source_text` was stored (all algebraic fields are absent)
- WHEN viewing the detail
- THEN the view MUST display the preserved legacy string verbatim (`raw_legacy_value` for `range`, `duration`, `area`, `casting_time`, and `saving_throw`; `source_text` for `damage` and `magic_resistance`). The view MUST NOT attempt to synthesize a string from empty structured fields.

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
