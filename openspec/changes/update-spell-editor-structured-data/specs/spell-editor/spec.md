# Capability: Spell Editor Component

## MODIFIED Requirements

### Requirement: Structured Field Editing
The Spell Editor MUST provide dedicated input components for structured spell data.

#### Scenario: StructuredFieldInput Integration
- GIVEN the Spell Editor form
- WHEN editing Range, Duration, or Casting Time
- THEN the editor MUST render a `StructuredFieldInput` component with a `fieldType` (range | duration | casting_time)
- AND the component MUST emit the **schema-native shape** for that type:
  - **range** → RangeSpec (e.g. `kind`, `unit`, `distance: { mode, value, per_level }` where applicable)
  - **duration** → DurationSpec (e.g. `kind`, `unit`, `duration` scalar where applicable)
  - **casting_time** → flat object (`base_value`, `per_level`, `level_divisor`, `unit`, `text`)
- AND the component MUST be internally modular, using a common scalar/unit input foundation but providing distinct layout or kind-selection logic for each `fieldType`.
- AND the component MUST initialize with a valid default state when created empty:
  - **Range**: `kind: "distance"`, `unit: "ft"`, `distance: { mode: "fixed", value: 0 }`
  - **Duration**: `kind: "instant"` (simplest valid state)
  - **Casting Time**: `base_value: 1`, `unit: "action"`, `text: "1 action"` (editor default for blank state; canonical materialization uses unit "segment" when unit is omitted)
- AND the component MUST display a computed text preview in real-time.

#### UI mapping to schema shapes
- **Scalar shape**: Dimension and scalar fields use the schema scalar shape `{ mode: "fixed" | "per_level", value?, per_level?, ... }` per `#/$defs/scalar` in spell.schema.json. Range distance, duration duration, and Area dimensions (radius, length, etc.) all use this shape.
- **Range** (full support for all RangeSpec kinds per `#/$defs/RangeSpec`):
  - **Distance-based** (`distance`, `distance_los`, `distance_loe`): kind selector + scalar (mode, value, per_level) + unit.
  - **Kind-only** (`personal`, `touch`, `los`, `loe`, `sight`, `hearing`, `voice`, `senses`, `same_room`, `same_structure`, `same_dungeon_level`, `wilderness`, `same_plane`, `interplanar`, `anywhere_on_plane`, `domain`, `unlimited`): kind selector only; no distance/unit (schema forbids them).
  - **Special**: kind selector + `raw_legacy_value` text field.
  - Kind selector is always shown; scalar/unit inputs are shown only when kind requires them.
- **Duration** (full support for all DurationSpec kinds per `#/$defs/DurationSpec`):
  - `instant`, `permanent`, `until_dispelled`, `concentration`: kind selector only (no unit/duration).
  - `time`: kind + `unit` + `duration` scalar (mode, value, per_level).
  - `conditional`, `until_triggered`, `planar`: kind + `condition` text.
  - `usage_limited`: kind + `uses` scalar.
  - `special`: kind + `raw_legacy_value` text.
- **Casting time**: The UI maps 1:1 to the flat casting_time object (base_value, per_level, level_divisor, unit, text).

#### Scenario: Legacy Data Loading
- GIVEN a spell with `canonical_data` column populated
- WHEN opening the spell in the editor
- THEN the editor MUST load structured values from `canonical_data`
- AND populate all `StructuredFieldInput` components with those values.

#### Scenario: Hybrid canonical_data (partial)
- GIVEN a spell where `canonical_data` exists (is not null)
- BUT a specific key (e.g. "range", "duration") is **missing** from the JSON object (undefined, not just null)
- AND a legacy string exists for that field (e.g. from flat columns)
- WHEN opening the spell in the editor
- THEN the editor MUST parse that field via the Tauri parser commands and merge the parsed structured value into the editor state for that field.

#### Scenario: Legacy String Parsing
- GIVEN a spell with null `canonical_data` and legacy string values
- WHEN opening the spell in the editor
- THEN the editor MUST call Tauri backend parser commands. Command names use `parse_spell_*` prefix: `parse_spell_range`, `parse_spell_duration`, `parse_spell_casting_time`, `parse_spell_area`, `parse_spell_damage`, and optionally `parse_spell_components` for legacy component strings. These commands wrap `SpellParser::parse_range`, `SpellParser::parse_duration`, etc. in `src-tauri/src/utils/spell_parser.rs`. Each accepts a legacy string and returns the schema-native structured type.
- AND populate structured inputs with parsed values
- AND display a warning banner if parsing fell back to `kind: "special"`. The banner MUST appear as a single banner at the top of the form, listing the fields that fell back to special (e.g. "Range and Duration could not be fully parsed; original text preserved"). When kind is "special", the authoritative storage for the original legacy string is `raw_legacy_value`; the computed `.text` may mirror it for display.

**Parser fallbacks:** SpellParser returns schema-valid structured types (no `Result`); on parse failure it returns fallbacks such as `kind: "special"` with `raw_legacy_value` preserved. The UI MUST handle any unexpected parser errors (e.g. Tauri command failure) defensively (e.g. show error message, fall back to kind=special with raw string). If a parse command is unavailable or returns an IPC error, the editor MUST treat the field as unparseable: show the warning banner and preserve raw legacy value (kind=special) where possible; if the whole load fails, show a clear error message and do not corrupt form state.

### Requirement: Component Input
The Spell Editor MUST provide explicit controls for spell components.

#### Scenario: V/S/M Checkboxes
- GIVEN the Spell Editor form
- WHEN editing spell components
- THEN the editor MUST render checkboxes for Verbal, Somatic, and Material only. Focus, divine_focus, and experience remain schema defaults (false) and are not exposed in the editor UI.
- AND display a text preview (e.g., "V, S, M") based on selections.
- ComponentCheckboxes MUST accept `components` and `material_components` as props.
- It MUST emit `components: { verbal, somatic, material }` on change.
- It MUST also emit `material_components` (array of MaterialComponentSpec) when the material sub-form is modified.
- The parent `SpellEditor` is responsible for merging these distinct events into the form state.

#### Scenario: Material Component Details
- GIVEN the Material checkbox is checked
- THEN the editor MUST display a sub-form for material component details
- AND the sub-form MUST include: name (required), quantity, gp_value (optional), is_consumed, description (optional), and unit (optional). The UI MUST expose the `unit` field.
- AND quantity MUST be stored as a number; canonical serialization materializes it as 1.0 when omitted. Validation MUST enforce quantity >= 1 (or >= 1.0); default display 1.0 keeps hashing consistent.
- AND the editor MUST support multiple material components with add/remove controls.
- AND the editor MUST preserve order of components.

#### Scenario: Material Component Uncheck Confirmation
- GIVEN the Material checkbox is checked
- AND the material components list is NOT empty
- WHEN the user unchecks the Material checkbox
- THEN the editor MUST display a confirmation dialog
- AND ONLY clear the material data IF the user confirms.

### Requirement: Input Validation
The Spell Editor MUST enforce schema-compliant input.

#### Scenario: Numeric Validation
- GIVEN a numeric scalar input (base_value, per_level, quantity)
- WHEN user enters a value outside the allowed range (e.g. negative)
- THEN the editor MUST use clamp-on-change per frontend-standards (e.g. clamp to 0) so the persisted value is valid
- AND MUST NOT persist the invalid value. Semantic validation (e.g. required tradition/school/sphere) continues to use block save + inline error.

#### Scenario: Maximum value cap
- The advisory cap for structured scalar numeric fields (base_value, value in distance/duration scalars, etc.) is **999999**.
- GIVEN a structured scalar input (e.g. base_value or value in a distance/duration scalar)
- WHEN the user enters a value above 999999
- THEN the component MUST show a warning and MUST allow the value (no clamp, no block save); the cap is advisory for UX consistency.

#### Scenario: Unit Enum Validation
- GIVEN a unit dropdown
- WHEN the value does not match the schema enum
- THEN the editor MUST display a validation error.

#### Scenario: Tradition Validation (Arcane)
- GIVEN a spell with tradition = "ARCANE"
- WHEN school is not selected
- THEN the editor MUST block saving
- AND display an inline validation error.

#### Scenario: Tradition Validation (Divine)
- GIVEN a spell with tradition = "DIVINE"
- WHEN sphere is not selected
- THEN the editor MUST block saving
- AND display an inline validation error.

#### Scenario: Tradition Validation (Both)
- GIVEN a spell with tradition = "BOTH"
- WHEN either school or sphere is not selected
- THEN the editor MUST block saving
- AND display inline validation errors for the missing field(s).

### Requirement: Complex Field Editing
The Spell Editor MUST provide specialized forms for complex fields.

#### Scenario: Damage Editing
- GIVEN the Spell Editor form
- WHEN editing Damage
- THEN the editor MUST render a `DamageForm`
- AND allow selecting kind (None, Modeled, DM Adjudicated) with human-readable labels; form value and serialization MUST use schema enums (e.g. `"none"`, `"modeled"`, `"dm_adjudicated"`)
- AND if Modeled, allow adding multiple damage parts. Each DamagePart MUST satisfy schema required fields (id, damage_type, base, application, save). When adding a new part, the UI MUST provide default or schema-compliant values for application and save (e.g. instant/none per schema); implementation MAY defer to backend/parser defaults when creating a part.
- AND each DamagePart MUST be assigned a stable, unique ID upon creation (e.g. `part_<timestamp>_<random>` or similar, matching schema pattern `^[a-z][a-z0-9_]{0,31}$`) to ensure deterministic hashing and list stability.
- AND allow configuring damage type, dice pool, and scaling for each part.

#### Scenario: Area Editing
- GIVEN the Spell Editor form
- WHEN editing Area
- THEN the editor MUST render an `AreaForm`
- AND allow selecting kind (Cone, Cube, Sphere, etc.)
- AND allow entering specific scalars (radius, length, etc.) based on kind. Geometric dimensions use `shape_unit` per AreaSpec; surface/volume kinds use the scalar plus `unit`.

#### Pattern: Enum selector + optional custom/special field
For fields whose schema has a kind/enum and optional custom or special content (e.g. dm_guidance, raw_legacy_value), the editor MUST provide an enum-based selector for kind/options plus an optional custom or special field when the schema allows. SavingThrowInput and MagicResistanceInput follow this pattern; implementing these via a shared `EnumWithSpecial` pattern or helper is RECOMMENDED for UI consistency.

#### Scenario: Saving Throw and MR Editing
- GIVEN the Spell Editor form
- WHEN editing Saving Throw
- THEN the editor MUST render `SavingThrowInput` per SavingThrowSpec (kind: none, single, multiple, dm_adjudicated)
- AND when kind is single or multiple, MUST show SingleSave sub-form(s) (save_type, applies_to, on_success, on_failure).
- WHEN editing Magic Resistance
- THEN the editor MUST render specific enum-based inputs (not generic strings)
- AND the `applies_to` enum selector MUST be displayed for all kinds EXCEPT `unknown`. When kind is `unknown`, the `applies_to` selector MUST be hidden or disabled as it is not applicable per schema logic.
- UI labels MUST map to schema enum values as follows:
  | Schema Value | UI Label |
  |---|---|
  | `whole_spell` | "Whole Spell" |
  | `harmful_effects_only` | "Harmful Effects Only" |
  | `beneficial_effects_only` | "Beneficial Effects Only" |
  | `dm` | "DM Discretion" |

#### Scenario: Magic Resistance partial and special
- GIVEN the Spell Editor form and Magic Resistance is being edited
- WHEN kind is "partial"
- THEN the editor MUST show the `applies_to` selector AND a sub-form for MagicResistanceSpec.partial: scope (required) and optional part_ids.
- WHEN kind is "special"
- THEN the editor MUST show the `applies_to` selector AND a field for special_rule (optional text, per schema).
