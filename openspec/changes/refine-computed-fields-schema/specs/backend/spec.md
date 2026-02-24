## MODIFIED Requirements

### Requirement: Canonical Schema Compliance
All spells processed by the backend MUST support mapping to the Strict Spell Schema.

#### Scenario: Schema Mapping
- GIVEN a `SpellDetail` model
- WHEN converted to `CanonicalSpell`
- THEN it MUST conform to `spell.schema.json` structure, which now mandates `.text` in `DurationSpec` and `AreaSpec`, `raw_legacy_value` across hashed computed fields (and `source_text` for non-hashed metadata on `SpellDamageSpec`, `MagicResistanceSpec`, and `ExperienceComponentSpec`), and standard 2nd Edition `save_vs` and `casting_time` units.

#### Scenario: Complex Area Parsing
- GIVEN a spell with area text "20 ft. radius"
- WHEN converted to `CanonicalSpell`
- THEN it MUST be structured as an `AreaSpec` object with `kind="radius_circle"`
- AND `radius` MUST be `{"mode": "fixed", "value": 20}`
- AND `.text` MUST accurately reflect the canonical synthesized string or legacy string.

#### Scenario: Universal Legacy Value Preservation
- GIVEN a spell with original text for any computed field
- WHEN converted to `CanonicalSpell`
- THEN for hashed fields (`AreaSpec`, `DurationSpec`, `RangeSpec`, `SavingThrowSpec`, `casting_time`), the canonical output MUST populate `raw_legacy_value` with the original source string
- AND for non-hashed metadata fields (`SpellDamageSpec`, `MagicResistanceSpec`, `ExperienceComponentSpec`), the canonical output MUST populate `source_text` with the original source string
- AND this MUST occur regardless of whether the parser successfully extracted algebraic properties or fell back to special.

#### Scenario: SavingThrowSpec Legacy Preservation and dm_guidance Removal
- GIVEN a spell with saving throw text "Save vs. Spell at -2"
- WHEN converted to `CanonicalSpell`
- THEN `SavingThrowSpec` MUST populate `raw_legacy_value` with the original source string
- AND `SavingThrowSpec` MUST NOT contain a `dm_guidance` property (removed; use `notes` instead)
- AND `raw_legacy_value` MUST be preserved regardless of parse success or failure.

#### Scenario: MagicResistanceSpec Source Text Preservation
- GIVEN a spell with magic resistance text "Yes" or "No" or "Special (see below)"
- WHEN converted to `CanonicalSpell`
- THEN `MagicResistanceSpec` MUST populate `source_text` with the original source string
- AND `source_text` is non-hashed metadata excluded from the canonical hash per §2.3.

#### Scenario: SpellDamageSpec Source Text Preservation
- GIVEN a spell with damage text "1d6+1 per level"
- WHEN converted to `CanonicalSpell`
- THEN `SpellDamageSpec` MUST populate `source_text` (not `raw_legacy_value`) with the original source string
- AND `source_text` is non-hashed metadata excluded from the canonical hash per §2.3
- AND `SpellDamageSpec` MUST NOT contain a `raw_legacy_value` property (renamed to `source_text`).

#### Scenario: ExperienceComponentSpec Source Text Unchanged
- GIVEN a spell with experience component text "100 XP per casting"
- WHEN converted to `CanonicalSpell`
- THEN `ExperienceComponentSpec.source_text` MUST be populated with the original source string
- AND `source_text` remains non-hashed metadata excluded from the canonical hash per §2.3 (no change from v1).

#### Scenario: Unparseable Area Fallback
- GIVEN a spell with area text "special (see description)" or other unparseable area
- WHEN the parser cannot extract structured dimensions
- THEN it MUST fallback to `kind="special"`
- AND preserve the original text in `AreaSpec.raw_legacy_value` (no longer in `notes`)
- AND `raw_legacy_value` is stored as-is (no additional normalization mode applied, consistent with existing `raw_legacy_value` fields on `SpellCastingTime`, `RangeSpec`, and `DurationSpec`).

#### Scenario: Complex Range Parsing
- GIVEN a spell with range text "100 ft + 10 ft/level"
- WHEN converted to `CanonicalSpell`
- THEN it MUST be structured as a `RangeSpec` object with `kind="distance"`
- AND `distance` scalar MUST be `{"mode": "per_level", "value": 100, "per_level": 10}`
- AND `unit` MUST be `"ft"` (normalized).

#### Scenario: Complex Duration Parsing
- GIVEN a spell with duration text "1 round / level"
- WHEN converted to `CanonicalSpell`
- THEN it MUST be structured as a `DurationSpec` object with `kind="time"`
- AND `duration` scalar MUST be `{"mode": "per_level", "value": 0, "per_level": 1}`
- AND `unit` MUST be `"round"` (normalized)
- AND `.text` MUST accurately reflect the synthesized canonical string.

## ADDED Requirements

### Requirement: Schema Version 2 Migration
The backend MUST increment `CURRENT_SCHEMA_VERSION` to `2` and implement a `migrate_to_v2()` step in the `normalize()` pipeline to handle breaking schema changes.

#### Scenario: Version 1 Spell Migration
- GIVEN a spell with `schema_version` less than `2`
- WHEN the spell is normalized via `normalize()`
- THEN `migrate_to_v2()` MUST run before any other normalization
- AND if `SavingThrowSpec.dm_guidance` is populated, its content MUST be appended to `SavingThrowSpec.notes` (with a newline separator if `notes` already has content), and `dm_guidance` MUST be cleared
- AND if `casting_time.unit` is `"action"`, `"bonus_action"`, or `"reaction"`, the unit MUST be remapped to `"special"` and the original `casting_time.text` MUST be preserved in `raw_legacy_value` if not already populated
- AND if `SpellDamageSpec.raw_legacy_value` is populated, its value MUST be moved to `source_text` and `raw_legacy_value` MUST be cleared
- AND `schema_version` MUST be set to `2`.

#### Scenario: Post-Migration Re-Hashing
- GIVEN a spell that has been migrated by `migrate_to_v2()`
- WHEN normalization completes
- THEN the spell MUST be fully re-normalized and re-hashed
- AND the new `content_hash` MUST replace the old value in the database.

#### Scenario: Version 2 Spell Passthrough
- GIVEN a spell with `schema_version` equal to `2`
- WHEN the spell is normalized
- THEN `migrate_to_v2()` MUST NOT run
- AND normalization proceeds as normal.

#### Scenario: Bulk Migration Command
- GIVEN a database with spells at schema version 1
- WHEN a bulk re-hash command is invoked
- THEN ALL spells MUST be loaded, migrated via `migrate_to_v2()`, re-normalized, re-hashed, and persisted with the new `content_hash` and `schema_version = 2`.

### Requirement: Removal of 5th Edition Mechanics
The backend canonical schema validation MUST reject data containing elements from 5th edition mechanics.

#### Scenario: Invalid Casting Time Units
- **WHEN** a spell is provided with a `casting_time` unit of `"action"`, `"bonus_action"`, or `"reaction"`
- **THEN** schema validation MUST fail
- **AND** reject the spell.

### Requirement: Normalization Modes for New Text Fields
All new text fields introduced by this change MUST apply the normalization mode specified in the design document (Decision 5).

#### Scenario: AreaSpec and DurationSpec Text Normalization
- GIVEN a spell with populated `AreaSpec.text` or `DurationSpec.text`
- WHEN the spell is normalized via `normalize()`
- THEN `AreaSpec.text` MUST be normalized with Structured mode + unit alias normalization (word boundaries), matching `RangeSpec.text`
- AND `DurationSpec.text` MUST be normalized with Structured mode + unit alias normalization (word boundaries), matching `RangeSpec.text`
- AND unit alias normalization MUST apply the same word-boundary-aware replacements as `RangeSpec.text` (e.g., "yards" → "yd", "feet" → "ft", "miles" → "mi", "inches" → "inch"; "backyard" unchanged).

#### Scenario: raw_legacy_value Not Normalized
- GIVEN a spell with populated `raw_legacy_value` on any spec (`SpellCastingTime`, `RangeSpec`, `AreaSpec`, `DurationSpec`, `SavingThrowSpec`)
- WHEN the spell is normalized via `normalize()`
- THEN `raw_legacy_value` MUST NOT undergo additional normalization (stored as-is, no mode applied)
- AND this is consistent with all existing `raw_legacy_value` implementations which do not apply normalization in their spec's `normalize()` method.

#### Scenario: source_text Textual Normalization
- GIVEN a spell with populated `source_text` on `MagicResistanceSpec` or `SpellDamageSpec`
- WHEN the spell is normalized via `normalize()`
- THEN `source_text` MUST be normalized with Textual mode (NFC, trim horizontal whitespace, preserve distinct lines)
- AND this matches the existing `ExperienceComponentSpec.source_text` normalization behavior.

### Requirement: Resolved Specs Unchanged
The resolved schema specs MUST NOT be modified by this change.

#### Scenario: Resolved Specs Exclude New Fields
- GIVEN the resolved schema specs (`resolved-area-spec.schema.md`, `resolved-duration-spec.schema.md`, `resolved-range-spec.schema.md`)
- WHEN this change is applied
- THEN resolved specs MUST NOT gain `text`, `raw_legacy_value`, or `source_text` properties
- AND resolved specs remain fully-evaluated algebraic snapshots with fixed scalar values only
- AND this is because resolved specs represent deterministic computational output (not authored content), where synthesized display strings and legacy preservation are not applicable.
