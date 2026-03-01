# Capability: Spell Core

## Purpose

Backend spell core: canonical schema compliance, canonical hashing for identity, and tradition-specific validation. Spells are normalized to a strict schema and identified by the SHA-256 hash of their canonical JSON.

## Requirements

### Requirement: Canonical Schema Compliance
All spells processed by the backend MUST support mapping to the Strict Spell Schema.

#### Scenario: Schema Mapping
- GIVEN a `SpellDetail` model
- WHEN converted to `CanonicalSpell`
- THEN it MUST conform to `spell.schema.json` structure, which now introduces `.text` as a populated optional field on `DurationSpec` and `AreaSpec`, `raw_legacy_value` across hashed computed fields (and `source_text` for non-hashed metadata on `SpellDamageSpec`, `MagicResistanceSpec`, and `ExperienceComponentSpec`), and standard 2nd Edition `save_vs` and `casting_time` units.

#### Scenario: Complex Area Parsing
- GIVEN a spell with area text "20 ft. radius"
- WHEN converted to `CanonicalSpell`
- THEN it MUST be structured as an `AreaSpec` object with `kind="radius_circle"`
- AND `radius` MUST be `{"mode": "fixed", "value": 20}`
- AND `.text` MUST be synthesized from the structured algebraic fields and normalized with Structured + unit alias normalization per Decision 6. The sole exception is `kind="special"` — when no structured fields exist, `.text` MUST be derived from `raw_legacy_value` instead. `raw_legacy_value` and `.text` are always distinct values: `raw_legacy_value` is stored as-is while `.text` is normalized (e.g., for a successfully parsed spec `raw_legacy_value = "20 ft. radius"` yields `text = "20 ft radius"` after normalization; for `kind="special"` they may be identical before normalization is applied).

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

#### Scenario: SavingThrowSpec Legacy Preservation — Parse Success
- GIVEN a spell with saving throw text "Save vs. Spell"
- WHEN the parser successfully produces a structured `SavingThrowSpec`
- THEN `SavingThrowSpec.raw_legacy_value` MUST be populated with `"Save vs. Spell"` (the original source string, stored as-is)
- AND `raw_legacy_value` population is unconditional — it MUST occur on both parse success and parse failure (this is the primary behavioral change for `SavingThrowSpec` in this change, aligning it with all other hashed computed fields).

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
- AND preserve the original text in `AreaSpec.raw_legacy_value` (previously stored in `notes`; now in raw_legacy_value only.)
- AND `raw_legacy_value` is stored as-is (no additional normalization mode applied, consistent with existing `raw_legacy_value` fields on `SpellCastingTime`, `RangeSpec`, and `DurationSpec`).

#### Scenario: Complex Range Parsing
- GIVEN a spell with range text "100 ft + 10 ft/level"
- WHEN converted to `CanonicalSpell`
- THEN it MUST be structured as a `RangeSpec` object with `kind="distance"`
- AND `distance` scalar MUST be `{"mode": "per_level", "value": 100, "per_level": 10}`
- AND `unit` MUST be `"ft"` (normalized)
- AND `RangeSpec.raw_legacy_value` MUST be populated with the original source string `"100 ft + 10 ft/level"` (stored as-is, no normalization applied).

> [!NOTE]
> **Mixed-Unit Fallback**: To preserve "Unit-Based Identity" without lossy or "absurd" numerical conversions (e.g., "1 yd + 1 ft/level"), variable ranges with distinct units MUST NOT be modeled as `kind="distance"`. Instead, they MUST fallback to `kind="special"` with normalized `text` preservation.

#### Scenario: Complex Duration Parsing
- GIVEN a spell with duration text "1 round / level"
- WHEN converted to `CanonicalSpell`
- THEN it MUST be structured as a `DurationSpec` object with `kind="time"`
- AND `duration` scalar MUST be `{"mode": "per_level", "value": 0, "per_level": 1}`
- AND `unit` MUST be `"round"` (normalized)
- AND `.text` MUST be synthesized from the structured algebraic fields and normalized with Structured + unit alias normalization per Decision 6. The sole exception is `kind="special"` — when no structured fields exist, `.text` MUST be derived from `raw_legacy_value` instead. `raw_legacy_value` and `.text` are always distinct values: `raw_legacy_value` is stored as-is while `.text` is normalized (e.g., for a successfully parsed spec `raw_legacy_value = "1 round / level"` yields `text = "1 round/level"` after normalization).

### Requirement: Schema Version 2 Migration
The backend MUST increment `CURRENT_SCHEMA_VERSION` to `2` and implement a `migrate_to_v2()` step in the `normalize()` pipeline to handle breaking schema changes.

#### Scenario: Version 1 Spell Migration
- GIVEN a spell with `schema_version` less than `2`
- WHEN the spell is normalized via `normalize()`
- THEN `migrate_to_v2()` MUST run before any other normalization
- AND if `SavingThrowSpec.dm_guidance` is populated, its content MUST be appended **after** any existing `notes` content (result: `existing_notes + "\n" + dm_guidance_content` if `notes` is non-empty, or just `dm_guidance_content` if `notes` is empty); `dm_guidance` MUST then be cleared. If the concatenated string would exceed `notes` `maxLength: 2048`, `migrate_to_v2()` MUST truncate the result to 2048 characters and set a truncation flag that the caller can inspect; the caller MUST surface this as an error (in bulk migration: record the spell in `failed`; in single-spell normalization: return an `Err`).
- AND if `casting_time.unit` is `"action"`, `"bonus_action"`, or `"reaction"`, the unit MUST be remapped to `"special"` and the existing `casting_time.text` value (which already exists as a `String` property on the v1 flat `casting_time` object) MUST be copied into `raw_legacy_value` if `raw_legacy_value` is not already populated; if `raw_legacy_value` IS already populated, it MUST be preserved as-is (no overwrite). If `casting_time.text` is also empty/null, fall back to synthesizing a string from `base_value` + `unit` (e.g. `"1 action"`) before storing in `raw_legacy_value`.
- AND if `SpellDamageSpec.raw_legacy_value` is populated, its value MUST be moved to `source_text` and `raw_legacy_value` MUST be cleared
- AND `schema_version` MUST be set to `2`.

> **Execution order note:** `migrate_to_v2()` runs before default materialization (§2.5 of `docs/architecture/canonical-serialization.md`). A spell with `schema_version = 0` satisfies `< 2` and WILL trigger migration (the §2.5 default of `0 → 1` does not pre-empt this check). After `migrate_to_v2()` stamps `schema_version = 2`, subsequent normalization steps see the updated value.

#### Scenario: Post-Migration Re-Hashing
- GIVEN a spell that has been migrated by `migrate_to_v2()`
- WHEN normalization completes
- THEN the spell MUST be fully re-normalized and re-hashed
- AND the new `content_hash` MUST replace the old value in the database.

#### Scenario: Version 2 Spell Passthrough
- GIVEN a spell with `schema_version` equal to or greater than `2`
- WHEN the spell is normalized
- THEN `migrate_to_v2()` MUST NOT run
- AND normalization proceeds as normal.

#### Scenario: schema_version 0 → 2 Migration
- GIVEN a spell with `schema_version` equal to `0` (the SQLite default before the §2.5 version materialization step)
- WHEN `normalize()` runs
- THEN `migrate_to_v2()` MUST run first (because `0 < 2`), migrating the spell and stamping `schema_version = 2`
- AND the §2.5 default materialization step (which would set `schema_version 0 → 1`) MUST see `schema_version = 2` after migration and therefore leave it unchanged
- AND the final persisted spell MUST have `schema_version = 2`, not `1`.
> **Rationale:** `migrate_to_v2()` runs before §2.5 default materialization, so a version-0 spell never transiently reaches version 1 — it goes directly to version 2 in a single normalize pass.

**`migrate_to_v2()` Internal Function Contract:**
- **Rust signature**: `fn migrate_to_v2(spell: &mut CanonicalSpell) -> MigrateV2Result` where `MigrateV2Result { notes_truncated: bool, truncated_spell_id: Option<i64> }` carries any warnings that the caller MUST inspect and surface as appropriate. `notes_truncated: true` indicates that the `SavingThrowSpec.notes` field was truncated to `maxLength: 2048` during `dm_guidance` migration. For all non-overflow cases the result is success; mutations are applied in-place regardless.
- **Called from**: `normalize()`, as the first step, guarded by `if spell.schema_version < 2`.
- **Side effects**: Mutates `spell` in-place across the three migration steps and stamps `schema_version = 2` on completion.
- **Re-entrant safety**: The `schema_version = 2` stamp ensures a second call to `normalize()` on an already-migrated spell skips `migrate_to_v2()` entirely.
- **Single-spell normalization:** When `normalize()` is invoked for a single spell (e.g. save/update path) and `migrate_to_v2()` returns `notes_truncated: true`, the caller MUST return an error and MUST NOT persist the spell. In that context `truncated_spell_id` is typically `None` (no batch context); the caller surfaces the error from `notes_truncated` alone.

#### Scenario: Bulk Migration Command
- GIVEN a database with spells at schema version 1
- WHEN a bulk re-hash command is invoked
- THEN ALL spells MUST be loaded; spells already at `schema_version >= 2` MUST be counted as `skipped` per the idempotency contract below; remaining spells MUST be migrated via `migrate_to_v2()`, re-normalized, re-hashed, and persisted with the new `content_hash` and `schema_version = 2`.

**Bulk Migration Command Contract:**
- **Tauri command name**: `migrate_all_spells_to_v2`
- **Input parameters**: None (operates on the active database).
- **Return type**: `MigrationResult { total: u32, migrated: u32, skipped: u32, failed: Vec<MigrationFailure> }` where `MigrationFailure { spell_id: i64, spell_name: Option<String>, error: String }`.
- **Progress reporting**: The command MUST emit Tauri events (`migration-progress`) with `{ current: u32, total: u32 }` payload so the frontend can display a progress indicator. Emit after each spell (or each N spells) is processed; `current` = number of spells processed so far (0 before any, 1 after first, …), `total` = total count of spells to process. Optionally emit a final event with `current === total` when the batch completes.
- **Transaction semantics**: All successful SQL writes MUST be batched inside a single `BEGIN`/`COMMIT`. Spell-level failures (parse errors, normalization errors) are handled entirely in-memory before any SQL write is issued for that spell — no SQL statement is emitted for a failed spell, so no per-spell rollback is needed. The failed spell is recorded in `failed` and processing continues. All successful writes are committed together at the end; the caller receives the full `MigrationResult` including failures.
- **Error behavior**: If a database-level error occurs (e.g., disk full, locked database), the entire transaction MUST be rolled back and the command MUST return an error. Individual spell-level parse/normalization failures do NOT abort the batch — they are collected in `failed`.
- **Idempotency**: Spells already at `schema_version >= 2` MUST be counted in `skipped`, not re-processed.

### Requirement: Removal of 5th Edition Mechanics
The backend canonical schema validation MUST reject data containing elements from 5th edition mechanics.

#### Scenario: Invalid Casting Time Units
- **WHEN** a spell is provided with a `casting_time` unit of `"action"`, `"bonus_action"`, or `"reaction"`
- **THEN** schema validation MUST fail
- **AND** reject the spell.

> **Ordering note:** `migrate_to_v2()` MUST run before schema validation. Spells at `schema_version < 2` that contain 5e units are remapped to `"special"` by migration before validation runs. This rejection therefore applies only to spells at `schema_version >= 2` that still carry a 5e unit — which is a data error, not a migration case. Rejection MAY be enforced by JSON Schema validation (unit enum) and/or explicit backend validation before persistence.

### Requirement: Normalization Modes for New Text Fields
All new text fields introduced by this change MUST apply the normalization mode specified in the design document (Decision 6).

#### Scenario: AreaSpec and DurationSpec Text Normalization
- GIVEN a spell with populated `AreaSpec.text` or `DurationSpec.text`
- WHEN the spell is normalized via `normalize()`
- THEN `AreaSpec.text` MUST be normalized with Structured mode + unit alias normalization (word boundaries), matching `RangeSpec.text`
- AND `DurationSpec.text` MUST be normalized with Structured mode + unit alias normalization (word boundaries), matching `RangeSpec.text`
- AND unit alias normalization MUST apply the same word-boundary-aware replacements as `RangeSpec.text` per the unit alias list in `docs/architecture/canonical-serialization.md` §2.10 / §3 (e.g., "yards" → "yd", "feet" → "ft", "miles" → "mi", "inches" → "inch"; "backyard" unchanged).

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

### Requirement: JSON Schema File Updates
The `apps/desktop/src-tauri/schemas/spell.schema.json` file MUST be updated to reflect all field additions, removals, and enum changes introduced by this change.

#### Scenario: New Properties Added to Schema
- GIVEN the JSON Schema file
- WHEN this change is applied
- THEN `AreaSpec` MUST gain an optional `text` (string) property
- AND `DurationSpec` MUST gain an optional `text` (string) property
- AND `SavingThrowSpec` MUST gain an optional `raw_legacy_value` (string) property
- AND `MagicResistanceSpec` MUST gain an optional `source_text` (string) property.

#### Scenario: Properties Removed from Schema
- GIVEN the JSON Schema file
- WHEN this change is applied
- THEN `SavingThrowSpec` MUST have `dm_guidance` removed from its properties definition
- AND `SpellDamageSpec` MUST have `raw_legacy_value` removed and `source_text` added as an optional string property.

#### Scenario: Casting Time Enum Values Removed
- GIVEN the JSON Schema file
- WHEN this change is applied
- THEN `SpellCastingTime.unit` enum MUST NOT contain `"action"`, `"bonus_action"`, or `"reaction"`.

### Requirement: Rust Type Bindings
All new and modified fields MUST have correct Rust type declarations and serde attributes.

#### Scenario: New Optional Fields Declared Correctly
- GIVEN the new fields `AreaSpec.text`, `DurationSpec.text`, `SavingThrowSpec.raw_legacy_value`, and `MagicResistanceSpec.source_text`
- WHEN this change is applied to the Rust model files
- THEN each MUST be declared as `Option<String>`
- AND each MUST carry `#[serde(skip_serializing_if = "Option::is_none")]` so absent values are omitted from canonical JSON.

#### Scenario: source_text Fields Pruned from Hash
- GIVEN the `source_text` fields on `SpellDamageSpec` and `MagicResistanceSpec` (non-hashed metadata per §2.3)
- WHEN `prune_metadata_recursive()` runs during hash computation
- THEN these fields MUST be pruned by the same key-name exclusion (`"source_text"`) that already handles `ExperienceComponentSpec.source_text`.

#### Scenario: SpellDamageSpec Field Rename in Rust
- GIVEN the existing `raw_legacy_value: Option<String>` field on `SpellDamageSpec`
- WHEN this change is applied
- THEN it MUST be renamed to `source_text: Option<String>`
- AND `source_text` MUST carry `#[serde(alias = "raw_legacy_value")]` to support deserializing spells serialized before the rename.

#### Scenario: dm_guidance Field Removal in Rust
- GIVEN the existing `dm_guidance: Option<String>` field on `SavingThrowSpec`
- WHEN this change is applied
- THEN the field MUST be removed from the struct definition
- AND because `migrate_to_v2()` must read `dm_guidance` from pre-migration JSON, a deserialization-only shadow field MUST be used to capture `dm_guidance` during deserialization before clearing it. This field MUST carry both `#[serde(default)]` (so absence from JSON deserializes to `None`) and `#[serde(skip_serializing)]` (so the removed field never re-appears in serialized output). An equivalent mechanism (e.g., a custom `Deserialize` impl) is acceptable as long as it satisfies both constraints.

### Requirement: Resolved Specs Unchanged
The resolved schema specs MUST NOT be modified by this change.

#### Scenario: Resolved Specs Exclude New Fields
- GIVEN the resolved schema specs (`resolved-area-spec.schema.md`, `resolved-duration-spec.schema.md`, `resolved-range-spec.schema.md`)
- WHEN this change is applied
- THEN resolved specs MUST NOT gain `text`, `raw_legacy_value`, or `source_text` properties
- AND resolved specs remain fully-evaluated algebraic snapshots with fixed scalar values only
- AND this is because resolved specs represent deterministic computational output (not authored content), where synthesized display strings and legacy preservation are not applicable.


### Requirement: Advanced Attribute Modeling
The backend MUST support high-fidelity modeling of advanced spell attributes including experience costs, multi-part damage, magic resistance, and complex saving throws.

#### Scenario: Multi-Part Damage Modeling
- GIVEN a spell that deals both Fire and Cold damage
- WHEN converted to `CanonicalSpell`
- THEN the `damage` field MUST be an object of `kind="modeled"`
- AND `parts` MUST contain separate entries for each damage type with their respective scaling and saves.

#### Scenario: Experience Cost Modeling
- GIVEN a spell with an experience cost (e.g., *Restoration*)
- WHEN converted to `CanonicalSpell`
- THEN the `components` structure MUST contain the `experience` boolean flag set to true
- AND the `experience_cost` field MUST follow the `ExperienceComponentSpec`
- AND correctly identify the `payer`, `amount_xp` (if fixed), or `formula`.

#### Scenario: Magic Resistance Normalization
- GIVEN a spell with Magic Resistance interaction
- WHEN converted to `CanonicalSpell`
- THEN the `magic_resistance` field MUST be structured according to `MagicResistanceSpec`
- AND identify if the spell `ignores_mr`, is `partial`, or follows `normal` rules.

#### Scenario: Complex Saving Throw Sequencing
- GIVEN a spell requiring multiple saves (e.g. *Prismatic Spray* sub-effects)
- WHEN converted to `CanonicalSpell`
- THEN the `saving_throw` field MUST follow `SavingThrowSpec`
- AND correctly sequence `multiple` saves if required
- AND the order of the `multiple` saves MUST be preserved (NOT sorted).

#### Scenario: Valued Material Component Modeling
- GIVEN a spell with a valued material (e.g. "diamond dust worth 100 gp")
- WHEN converted to `CanonicalSpell`
- THEN the `material_components` MUST follow `MaterialComponentSpec`
- AND correctly identify the `gp_value` and whether it `is_consumed`.

### Requirement: Deterministic Identity
A spell's identity MUST be defined by the SHA-256 hash of its canonical JSON representation.

#### Scenario: Hashing Consistency
- GIVEN two spell objects with identical semantic content
- BUT different key ordering
- WHEN hashed
- THEN they MUST produce the exact same SHA-256 hash.

#### Scenario: Unit-Based Identity
- GIVEN two spells with equivalent physical distances (e.g., "10 yd" vs "30 ft")
- WHEN converted to `CanonicalSpell` and hashed
- THEN they MUST produce **different** SHA-256 hashes (preserving unit distinction).

#### Scenario: Array Normalization
- GIVEN unordered metadata (e.g. `tags = ["Fire", "Fire", "Damage"]`)
- WHEN hashed
- THEN they MUST be deduplicated and sorted (Result: `["Damage", "Fire"]`)
- AND produce a predictable hash.

#### Scenario: Unicode NFC Normalization
- GIVEN strings with equivalent Unicode representations (e.g. "Fiancé" in NFC vs NFD)
- WHEN hashed
- THEN they MUST be normalized to NFC
- AND produce the exact same hash.

#### Scenario: Floating Point Precision
- GIVEN `number` fields with infinitesimal noise (e.g. `1.0000001` vs `1.0000004`)
- WHEN hashed
- THEN they MUST be rounded/truncated to 6 decimal places
- AND produce the exact same hash.

#### Scenario: Enum Normalization
- GIVEN enum fields with loose casing (e.g. `tradition = "arcane"`)
- WHEN hashed
- THEN they MUST be normalized to the exact schema casing (Result: `"ARCANE"`)
- AND produce a predictable hash.

#### Scenario: Empty Collection Stability (Lean Hashing)
- GIVEN a spell with an empty array (e.g. `tags = []`)
- WHEN hashed
- THEN the canonical JSON MUST OMIT the empty array field entirely
- AND produce a predictable hash that is stable as the schema evolves.

#### Scenario: Semantic Whitespace Collapse
- GIVEN short text fields with redundant internal whitespace (e.g. `range.text = "10  yards"`)
- WHEN hashed
- THEN multiple internal spaces MUST be collapsed to a single space (Result: `"10 yards"`)
- AND produce the exact same hash.

#### Scenario: Narrative Paragraph Preservation
- GIVEN a description with multiple paragraphs separated by a blank line
- WHEN hashed
- THEN the canonical JSON MUST preserve the line break (normalized to `\n`)
- BUT MUST NOT collapse the entire description into a single line.

### Requirement: Tradition-Specific Integrity
The backend MUST enforce strict logical dependencies between traditions and metadata fields.

#### Scenario: School and Sphere Co-presence Rejection
- GIVEN a spell record with both `school` and `sphere` set (co-present)
- WHEN the backend attempts to infer tradition and construct a `CanonicalSpell`
- THEN the backend MUST return an error
- AND the error message MUST identify the spell name and state that school and sphere are mutually exclusive.

#### Scenario: Prohibited Field Omission for Canonical Output
- GIVEN an Arcane spell (with or without `sphere` set in source data)
- WHEN canonicalized for hashing
- THEN the canonical output MUST omit the `sphere` key
- AND the hash MUST be identical to the same spell where `sphere` was never present.
- GIVEN a Divine spell (with or without `school` set in source data)
- WHEN canonicalized for hashing
- THEN the canonical output MUST omit the `school` key
- AND the hash MUST be stable regardless of source data for the other tradition's field.

### Requirement: Metadata Isolation
Internal record metadata MUST NOT influence the content-addressed identity.

#### Scenario: Metadata Exclusion
- GIVEN a spell record
- WHEN `schema_version` or `source_refs` are updated
- THEN the `id` (content hash) MUST NOT change.
