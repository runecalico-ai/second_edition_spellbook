# Spell Editor Specification

## Purpose
Defines the Spell Editor component: structured field editing (range, duration, casting time, area, damage, saving throw, magic resistance, components), legacy and hybrid data loading via Tauri parser commands, input validation, and complex field forms.

## Requirements

### Requirement: Structured Field Editing
The Spell Editor MUST provide dedicated input components for structured spell data.

#### Scenario: StructuredFieldInput Integration
- GIVEN the Spell Editor form
- WHEN editing Range, Duration, or Casting Time
- THEN the editor MUST render a `StructuredFieldInput` component with a `fieldType` (range | duration | casting_time)
- AND the component MUST emit the **schema-native shape** for that type:
  - **range** → RangeSpec (per `#/$defs/RangeSpec`, e.g. `kind`, `unit`, `distance: { mode, value, per_level }` where applicable)
  - **duration** → DurationSpec (per `#/$defs/DurationSpec`, e.g. `kind`, `unit`, `duration` scalar where applicable)
  - **casting_time** → flat object (`base_value`, `per_level`, `level_divisor`, `unit`, `text`)
- AND the component MUST be internally modular, using a common scalar/unit input foundation but providing distinct layout or kind-selection logic for each `fieldType`.
- AND the component MUST initialize with a valid default state when created empty:
  - **Range**: `kind: "distance"`, `unit: "ft"`, `distance: { mode: "fixed", value: 0 }`
  - **Duration**: `kind: "instant"` (simplest valid state)
  - **Casting Time**: `base_value: 1`, `unit: "action"`, `text: "1 action"` (editor default for blank state; canonical materialization uses unit "segment" when unit is omitted)
- AND the component MUST display a computed text preview in real-time.

**Default Values Clarification:**
- **UI defaults** (editor initialization): Use user-friendly defaults optimized for UX (e.g. casting_time uses `unit: "action"` for clarity).
- **Canonical materialization defaults** (backend storage): Use schema-defined defaults when fields are omitted (e.g. casting_time uses `unit: "segment"` when unit is omitted per schema).
- **User clears field**: When user explicitly clears/deletes a field value in the editor, treat as empty state and reinitialize with UI defaults.
- **Field omitted from canonical_data**: When field is missing from `canonical_data` (undefined), initialize with UI defaults.

**Text Preview Computation:**
- **Frontend computation**: The editor component computes `.text` in real-time for preview display as the user types.
- **Backend computation**: The backend computes `.text` during canonical serialization when saving (authoritative source of truth for storage).
- **Consistency**: Both frontend and backend MUST produce the same `.text` value for identical input. The backend computation is authoritative.

#### UI mapping to schema shapes
- **Scalar shape**: Dimension and scalar fields use the schema scalar shape `{ mode: "fixed" | "per_level", value?, per_level?, ... }` per `#/$defs/scalar` in spell.schema.json.
- **Range** (full support for all RangeSpec kinds): Distance-based kinds → kind + scalar + unit; Kind-only kinds → kind selector only; **Special** → kind + `raw_legacy_value` text field.
- **Duration** (full support for all DurationSpec kinds): instant/permanent/until_dispelled/concentration → kind only; time → kind + unit + duration scalar; conditional/until_triggered/planar → kind + condition text; usage_limited → kind + uses scalar; special → kind + raw_legacy_value.
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

**Hybrid Loading Logic Details:**
- **`canonical_data` exists**: JSON.parse succeeds and result is an object (not null). This includes empty objects `{}`.
- **Missing field**: Field is `undefined` (not present in object). Check using `field === undefined` or `!(field in canonicalData)`.
- **`null` field**: Field exists but value is `null`. Treat as missing for hybrid loading purposes (parse legacy string if available).
- **Empty object `{}`**: All fields are missing, parse all legacy strings for all fields that have legacy string values.

#### Scenario: Legacy String Parsing
- GIVEN a spell with null `canonical_data` and legacy string values
- WHEN opening the spell in the editor
- THEN the editor MUST call Tauri backend parser commands. Command names use `parse_spell_*` prefix: `parse_spell_range`, `parse_spell_duration`, `parse_spell_casting_time`, `parse_spell_area`, `parse_spell_damage`, and optionally `parse_spell_components` for legacy component strings. These commands wrap `SpellParser` in `src-tauri/src/utils/spell_parser.rs`. Each accepts a legacy string and returns the schema-native structured type.
- AND populate structured inputs with parsed values
- AND display a warning banner if parsing fell back to `kind: "special"`. The banner MUST appear as a single banner at the top of the form, listing the fields that fell back to special (e.g. "Range and Duration could not be fully parsed; original text preserved"). When kind is "special", the authoritative storage for the original legacy string is `raw_legacy_value`.

**Warning Banner UX Details:**
- **Placement**: Banner at the very top of the form, above all field inputs and labels.
- **Dismissibility**: Banner is **non-dismissible** - user must either fix the data or accept the `kind: "special"` fallback by saving the spell.
- **Persistence**: Banner persists until user edits affected field(s) to valid values, saves with kind=special, or navigates away.

**Casing Standards for IPC and Storage:**
- **Parser commands** return structured types using **`camelCase`** field names for IPC (via `#[serde(rename_all = "camelCase")]` on backend structs).
- **Frontend state** MUST use `camelCase` to match IPC return values.
- **Canonical storage** (`canonical_data` column) uses **`snake_case`** per the canonical serialization spec.
- **Conversion** from camelCase (frontend/IPC) to snake_case (canonical storage) happens when building `CanonicalSpell` for persistence.

**Parser fallbacks:** SpellParser returns schema-valid structured types; on parse failure it returns fallbacks such as `kind: "special"` with `raw_legacy_value` preserved. The UI MUST handle parser errors defensively (show error, fall back to kind=special with raw string). Invalid parser output MUST be validated by the frontend; if validation fails, treat as parser failure and include in warning banner.

### Requirement: Component Input
The Spell Editor MUST provide explicit controls for spell components.

#### Scenario: V/S/M Checkboxes
- GIVEN the Spell Editor form
- WHEN editing spell components
- THEN the editor MUST render checkboxes for Verbal, Somatic, and Material only. Focus, divine_focus, and experience remain schema defaults (false) and are not exposed in the editor UI.
- AND display a text preview (e.g., "V, S, M") based on selections.
- ComponentCheckboxes MUST accept `components` and `material_components` as props.
- It MUST emit `components: { verbal, somatic, material }` on change.
- It MUST also emit `material_components` (array of MaterialComponentSpec per `#/$defs/MaterialComponentSpec`) when the material sub-form is modified.
- The parent `SpellEditor` is responsible for merging these distinct events into the form state.

#### Scenario: Material Component Details
- GIVEN the Material checkbox is checked
- THEN the editor MUST display a sub-form for material component details
- AND the sub-form MUST include: name (required), quantity, gp_value (optional), is_consumed, description (optional), and unit (optional). The UI MUST expose the `unit` field.
- AND quantity MUST be stored as a number; canonical serialization materializes it as 1.0 when omitted. Validation MUST enforce quantity >= 1.0. UI validation MUST use clamp-on-change to enforce minimum (clamp values < 1.0 to 1.0). Default display MUST be 1.0 (not 1) for hashing consistency.
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
- The advisory cap for structured scalar numeric fields is **999999**.
- GIVEN a structured scalar input
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
- AND allow selecting kind (None, Modeled, DM Adjudicated) with human-readable labels; form value and serialization MUST use schema enums (`"none"`, `"modeled"`, `"dm_adjudicated"`)
- AND if Modeled, allow adding multiple damage parts. Each DamagePart MUST satisfy schema required fields (id, damage_type, base, application, save). When adding a new part, the UI MUST provide default or schema-compliant values for application and save.
- AND each DamagePart MUST be assigned a stable, unique ID upon creation matching schema pattern `^[a-z][a-z0-9_]{0,31}$`. Use the pattern: `part_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`. IDs MUST be assigned immediately upon part creation.
- AND allow configuring damage type, dice pool, and scaling for each part.

#### Scenario: Area Editing
- GIVEN the Spell Editor form
- WHEN editing Area
- THEN the editor MUST render an `AreaForm`
- AND allow selecting kind (Cone, Cube, Sphere, etc.)
- AND allow entering specific scalars (radius, length, etc.) based on kind. Geometric dimensions use `shape_unit` per `#/$defs/AreaSpec`; surface/volume kinds use the scalar plus `unit`.

#### Pattern: Enum selector + optional custom/special field
For fields whose schema has a kind/enum and optional custom or special content (e.g. dm_guidance, raw_legacy_value), the editor MUST provide an enum-based selector for kind/options plus an optional custom or special field when the schema allows. SavingThrowInput and MagicResistanceInput follow this pattern.

#### Scenario: Saving Throw and MR Editing
- GIVEN the Spell Editor form
- WHEN editing Saving Throw
- THEN the editor MUST render `SavingThrowInput` per `#/$defs/SavingThrowSpec` (kind: none, single, multiple, dm_adjudicated)
- AND when kind is single or multiple, MUST show SingleSave sub-form(s) (save_type, applies_to, on_success, on_failure).
- WHEN editing Magic Resistance
- THEN the editor MUST render specific enum-based inputs (not generic strings)
- AND the `applies_to` enum selector MUST be displayed for all kinds EXCEPT `unknown`. When kind is `unknown`, the `applies_to` selector MUST be hidden or disabled as it is not applicable per schema logic.
- UI labels MUST map to schema enum values: `whole_spell` → "Whole Spell"; `harmful_effects_only` → "Harmful Effects Only"; `beneficial_effects_only` → "Beneficial Effects Only"; `dm` → "DM Discretion".

#### Scenario: Magic Resistance partial and special
- GIVEN the Spell Editor form and Magic Resistance is being edited
- WHEN kind is "partial"
- THEN the editor MUST show the `applies_to` selector AND a sub-form for `#/$defs/MagicResistanceSpec`.partial: scope (required) and optional part_ids.
- WHEN kind is "special"
- THEN the editor MUST show the `applies_to` selector AND a field for special_rule (optional text, per schema).
