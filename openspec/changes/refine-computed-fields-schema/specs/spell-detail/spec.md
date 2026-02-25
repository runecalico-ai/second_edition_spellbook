## MODIFIED Requirements

> **Change note:** Removed reference to `dm_guidance` from the Saving Throw Display scenario. `dm_guidance` is deleted from `SavingThrowSpec` in this change; `notes` is the sole narrative field. (See proposal Decision 3.)

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
