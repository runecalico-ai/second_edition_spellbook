## Scope

This spec covers **two distinct importer layers**, both of which require changes:

| Layer | File(s) | Responsibility |
|---|---|---|
| Python extraction pipeline | `services/ml/spellbook_sidecar.py` | Raw source text → structured dict extraction |
| Rust in-app parser | `apps/desktop/src-tauri/src/utils/spell_parser.rs`, `apps/desktop/src-tauri/src/utils/parsers/area.rs`, `apps/desktop/src-tauri/src/utils/parsers/mechanics.rs`, `apps/desktop/src-tauri/src/utils/parsers/range.rs`, `apps/desktop/src-tauri/src/utils/parsers/duration.rs` | Typed `CanonicalSpell` field parsing from structured dicts |

All paths are relative to the repository root unless otherwise stated.

---

## MODIFIED Requirements

### Requirement: Upgrade Legacy Text Storage from Failure-Only to Unconditional

Prior to this change, `raw_legacy_value` was populated only when a parse failed (or not at all for some fields). This requirement upgrades all existing storage to be unconditional.

#### Scenario: RangeSpec Unconditional Legacy Value Population
- **GIVEN** a spell with range text (e.g., `"100 ft + 10 ft/level"`)
- **WHEN** the importer parses the range into a structured `RangeSpec`
- **THEN** it MUST unconditionally populate `RangeSpec.raw_legacy_value` with the original source string, regardless of whether the parse succeeded or fell back to `kind="special"`
- **AND** this applies to both the Python pipeline and the Rust parser (`apps/desktop/src-tauri/src/utils/parsers/`).

#### Scenario: CastingTime Unconditional Legacy Value Population
- **GIVEN** a spell with casting time text (e.g., `"1 segment"` or `"5 rounds"`)
- **WHEN** the importer parses the casting time into a structured `SpellCastingTime` flat object
- **THEN** it MUST unconditionally populate `casting_time.raw_legacy_value` with the original source string
- **AND** if the source text contains a 5th Edition unit (`"action"`, `"bonus_action"`, `"reaction"`), the importer MUST still store the original string in `raw_legacy_value` before remapping the unit to `"special"` — the v2 migration in the backend `normalize()` pipeline handles the unit remap for already-stored spells, but new imports must be correct from the start.

#### Scenario: SpellDamageSpec Field Rename (raw_legacy_value → source_text)
- **GIVEN** existing Python or Rust importer code that writes `SpellDamageSpec.raw_legacy_value`
- **WHEN** this change is applied
- **THEN** all such code MUST be updated to write `source_text` instead
- **AND** `raw_legacy_value` MUST NOT be set on `SpellDamageSpec` in any new or existing importer code
- **AND** `source_text` is non-hashed metadata excluded from the canonical hash per §2.3 of `docs/architecture/canonical-serialization.md`.

---

## ADDED Requirements

### Requirement: Full Preservation of Computed Field Legacy Text

The parsing layer MUST unconditionally save the original textual representation of computed fields to ensure an auditable ground truth for 2nd edition sources.

#### Scenario: Computed Field Parsing Success
- **WHEN** the importer successfully parses a computed field (Area, Duration, Range, Saving Throw, Casting Time) into a structured schema
- **THEN** it MUST unconditionally populate the `raw_legacy_value` property with the original source text used for the parse
- **AND** this applies whether the parser produced a fully-structured result or fell back to `kind="special"`.

#### Scenario: Computed Field Parse Failure (special fallback)
- **GIVEN** a spell with area text `"special (see description)"`
- **WHEN** the Rust area parser cannot extract structured dimensions
- **THEN** it MUST fall back to `kind="special"`
- **AND** `AreaSpec.raw_legacy_value` MUST be set to `"special (see description)"` (the original string, stored as-is — no normalization applied)
- **AND** `AreaSpec.text` MUST also be set to `"special (see description)"` (the `raw_legacy_value` value, since `kind="special"` has no structured synthesis).

#### Scenario: Empty or Null Input
- **GIVEN** a computed field with an empty string or null/missing value (e.g., a spell with no saving throw)
- **WHEN** the importer processes the field
- **THEN** `raw_legacy_value` MUST be set to `None` (not `Some("")`)
- **AND** the parsed spec MAY be omitted entirely or returned as a default/empty struct depending on the field — populating `raw_legacy_value` is not required when there is no source text to preserve.

#### Scenario: Text Population at Import Time
- **GIVEN** a spell with area text `"20 ft. radius"`
- **WHEN** the importer successfully parses it into `kind="radius_circle"`, `radius=20`, `unit="ft"`
- **THEN** the importer MUST synthesize `.text` as a canonical display string from the structured fields (e.g., `"20 ft radius"`)
- **AND** the synthesized `.text` is a best-effort initial value; the backend normalizer re-computes `.text` authoritatively during `normalize()` on save, so importer-produced `.text` does not need to match the final normalized form exactly
- **AND** spells imported without `.text` populated will have `text: null` until the first normalization pass — this is acceptable.

  *Note: The authoritative `.text` derivation rule (Design Decision 2) states that structured algebraic fields are always the primary source; `raw_legacy_value` is only used when `kind="special"` (no structured fields exist to synthesize from). Importers SHOULD prefer synthesizing `.text` from structured fields when the parse succeeded, consistent with this rule. The backend's authoritative `normalize()` pass will overwrite any importer-produced `.text` on save regardless, so importer-produced `.text` does not need to match the final normalized form exactly.*

#### Scenario: Non-Hashed Legacy Text Preservation — MagicResistanceSpec (NEW)
- **GIVEN** a spell with magic resistance text `"Yes"`, `"No"`, or `"Special (see below)"`
- **WHEN** the importer processes the Magic Resistance field
- **THEN** it MUST populate `MagicResistanceSpec.source_text` with the original source string
- **AND** `source_text` is non-hashed metadata excluded from the canonical hash per §2.3 of `docs/architecture/canonical-serialization.md`
- **AND** `raw_legacy_value` MUST NOT be set on `MagicResistanceSpec`.

#### Scenario: Non-Hashed Legacy Text Preservation — SpellDamageSpec (RENAMED)
- **GIVEN** a spell with damage text `"1d6+1 per level"`
- **WHEN** the importer processes the Damage field
- **THEN** it MUST populate `SpellDamageSpec.source_text` with the original source string (see also: Scenario: SpellDamageSpec Field Rename in MODIFIED Requirements)
- **AND** `source_text` is non-hashed metadata excluded from the canonical hash per §2.3 of `docs/architecture/canonical-serialization.md`.

#### Scenario: Non-Hashed Legacy Text Preservation — ExperienceComponentSpec (NO CHANGE)
- **GIVEN** a spell with experience component text
- **WHEN** the importer processes the Experience Component field
- **THEN** `ExperienceComponentSpec.source_text` MUST be populated with the original source string (this behavior is **already correct** — no code change required)
- **AND** `source_text` remains non-hashed metadata excluded from the canonical hash per §2.3 (unchanged from v1).

### Requirement: SavingThrowSpec Legacy Value Population (NEW)

The importer MUST add `raw_legacy_value` storage to `SavingThrowSpec`, which currently has no such field.

#### Scenario: SavingThrowSpec Legacy Value Population
- **GIVEN** a spell with saving throw text `"Save vs. Spell at -2"`
- **WHEN** the importer parses the saving throw
- **THEN** `SavingThrowSpec.raw_legacy_value` MUST be set to `"Save vs. Spell at -2"` (the original string, stored unconditionally and as-is)
- **AND** this MUST occur whether the parse produced a structured `single` or `multiple` result, or fell back to a default
- **AND** `raw_legacy_value` is included in the canonical hash per §2.2.1 of `docs/architecture/canonical-serialization.md`.

### Requirement: 2nd Edition Saving Throw Mapping

The parsing layer MUST correctly map legacy saving throw text to the two distinct `SingleSave` properties: `save_type` (the saving throw matrix *category/row*) and `save_vs` (the *specific effect* being saved against). See Design Decision 4 for the full semantic distinction.

`save_type` valid values: `"paralyzation_poison_death"`, `"rod_staff_wand"`, `"petrification_polymorph"`, `"breath_weapon"`, `"spell"`, `"special"`.

`save_vs` valid values: `"spell"`, `"poison"`, `"death_magic"`, `"polymorph"`, `"petrification"`, `"breath"`, `"weapon"`, `"other"`.

#### Scenario: Legacy Save Mapping

The following table defines the required mapping from source text keywords to `save_type` and the default `save_vs`. The importer MUST apply these rules in the order listed (first match wins). This order matches the existing `parse_single_save_intern` if-else chain in `apps/desktop/src-tauri/src/utils/parsers/mechanics.rs`:

| Source text contains | `save_type` | `save_vs` | Notes |
|---|---|---|---|
| `"paraly"` / `"poison"` / `"death"` | `"paralyzation_poison_death"` | `"poison"` if `"poison"` in text; else `"death_magic"` | `"paraly"` catches both "paralyzation" and "paralysis". The else-branch (`death_magic`) covers both `"death"` and `"paraly"`-only inputs |
| `"breath"` | `"breath_weapon"` | `"breath"` | |
| `"rod"` / `"staff"` / `"wand"` | `"rod_staff_wand"` | `"other"` | |
| `"poly"` / `"petrif"` | `"petrification_polymorph"` | `"polymorph"` if `"poly"` in text; else `"petrification"` | `"poly"` is checked first |
| `"special"` | `"special"` | `"spell"` (default, unchanged) | Explicit keyword; `save_vs` is not modified |
| (no keyword matched) | `"spell"` (default) | `"spell"` (default) | This is the fallback; standard inputs like "Save vs. Spell" reach this row since `"spell"` is not an explicit keyword trigger |

- **WHEN** a saving throw string matches one of the above patterns
- **THEN** the importer MUST assign the corresponding `save_type` and derive `save_vs` per the table
- **AND** MUST also populate `SavingThrowSpec.raw_legacy_value` with the original source string (see Requirement: SavingThrowSpec Legacy Value Population)
- **AND** MUST NOT include a `dm_guidance` property on `SavingThrowSpec` (`dm_guidance` is removed in v2; use `notes` instead).

#### Scenario: Saving Throw — Multiple Saves Input
- **GIVEN** a saving throw string that contains multiple distinct save categories joined by `";"`, `" then "`, or `" and "` (e.g., `"Save vs. Spell, then Save vs. Poison"`)
- **WHEN** the importer splits and parses the components
- **THEN** each component MUST produce its own `SingleSave` entry under `SavingThrowSpec.multiple`
- AND `SavingThrowSpec.raw_legacy_value` MUST still be populated with the full original unsplit string, including all original whitespace and delimiters exactly as received. Since `raw_legacy_value` is stored as-is (no normalization mode applied), leading/trailing whitespace in the source string IS preserved.

  *Note: Strings like `"Rod, Staff, or Wand"` contain `"or"` but are NOT multiple saves — they name a single matrix category. The parser must detect these standard complex category names before attempting to split. See `apps/desktop/src-tauri/src/utils/parsers/mechanics.rs` for the existing `is_standard_complex` heuristic.*

### Requirement: Schema Version Stamp for New Imports

Spells produced by the importer pipeline (Python or Rust) after this change is deployed MUST be emitted at `schema_version = 2`. This ensures newly imported spells do not trigger `migrate_to_v2()` and are immediately compatible with the v2 schema shape (correct `source_text` on `SpellDamageSpec`, no `dm_guidance` on `SavingThrowSpec`, `casting_time.unit` restricted to 2e values).

#### Scenario: New Import Schema Version
- **GIVEN** a spell produced by the importer after this change is applied
- **WHEN** the spell is persisted to the database
- **THEN** the spell MUST carry `schema_version = 2`
- **AND** the importer MUST NOT emit 5e casting time units or `dm_guidance`; all output MUST already conform to the v2 schema shape
- **AND** `migrate_to_v2()` MUST be idempotent for such spells (it will skip them because `schema_version >= 2`).
