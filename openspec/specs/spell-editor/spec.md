# Spell Editor Specification

## Purpose
Defines the Spell Editor component: structured field editing (range, duration, casting time, area, damage, saving throw, magic resistance, components), legacy and hybrid data loading via Tauri parser commands, input validation, and complex field forms.

## Requirements

### Requirement: Canon-First Default (Details Block)

The Spell Editor MUST present the Details block in a canon-first way: by default the user SHALL see and edit **canon text** (one single-line text input per field), not the full structured schema. Structured controls (StructuredFieldInput, AreaForm, DamageForm, SavingThrowInput, MagicResistanceInput, ComponentCheckboxes) MUST NOT be visible in the default view and MUST be revealed per field only when the user opts in via a per-field expand control (Option B: hybrid single-line + expand/collapse). Each expand control MUST be placed below or adjacent to its single-line input so the relationship is clear to users and implementers. First-open rule: when the user expands a field, if the spell was loaded with `canonical_data` that includes this field, use that structured value; otherwise parse the current text via the corresponding Tauri parser command where one exists (`range`, `duration`, `casting_time`, `area`, `damage`, and optionally `components`); `savingThrow` and `magicResistance` use fallback mapping because no parser commands exist for those fields. This applies to the Details block only (Range, Components, Duration, Casting Time, Area of Effect, Saving Throw, Damage, Magic Resistance, Description). All other editor fields (name, level, school, sphere, class list, source, edition, author, license, tags, reversible, quest, cantrip) are unchanged.

#### Scenario: Default view is canon text only

- **GIVEN** the Spell Editor form and the Details section
- **WHEN** the user views the editor (or has not expanded any detail field)
- **THEN** the editor MUST show one single-line text input per canon field in this order: Range, Components, Duration, Casting Time, Area of Effect, Saving Throw, Damage, Magic Resistance
- **AND** the Details block MAY include an optional ninth row **Material Component** (single-line input + expand control) after the eight standard fields and before Tags; when present, field order is: Range, Components, Duration, Casting Time, Area of Effect, Saving Throw, Damage, Magic Resistance, and optionally Material Component, then Tags
- **AND** when the optional Material Component row is implemented: the single-line input MUST be bound to material component text (e.g. form.materialComponents); when expanded, the editor MUST show ComponentCheckboxes and the material list (same collapse/expand and dirty serialization rules as for other detail fields)
- **AND** the Description MUST remain a textarea as today (after the above fields)
- **AND** the editor MUST NOT reorder these fields so that layout is consistent and testable
- **AND** the editor MUST NOT render StructuredFieldInput, AreaForm, DamageForm, SavingThrowInput, MagicResistanceInput, or ComponentCheckboxes in the default (collapsed) view
- **AND** each single-line input MUST be bound to the corresponding form text field (e.g. form.range, form.duration) so save persists those strings
- **AND** Damage and Magic Resistance MUST always be shown in the same order; when there is no value, the single-line input MUST be shown empty as a visual aid so the user sees the field exists and can fill it

#### Scenario: Damage and Magic Resistance always visible when empty

- **GIVEN** the canon-first Details block
- **THEN** Damage and Magic Resistance MUST always be shown in the fixed field order (after Saving Throw, before Description)
- **AND** when the spell has no value for Damage or Magic Resistance, the corresponding single-line input MUST be shown empty (not hidden), so the user has a clear visual indication that the field exists and can be filled

#### Scenario: Only one detail field expanded at a time

- **GIVEN** the Spell Editor form and at most one detail field is currently expanded
- **WHEN** the user activates the expand control for a different detail field
- **THEN** the editor MUST collapse the currently expanded field first (if that field is dirty, serialize its spec to the canon line; otherwise leave the line unchanged), then expand the newly selected field
- **AND** only one detail field MUST be expanded at any time

A detail field is **dirty** when the user has edited its structured form since the last time that field was committed: i.e. since the last collapse that serialized that field, since the last direct edit to that field's canon line, or since load. A field is not dirty when the user has only expanded to view (view-only).

The editor MUST clear the dirty flag for a detail field when (a) the user collapses that field and the editor serializes it to the canon line, (b) the user edits that field's canon line directly, or (c) the spell is loaded. The editor SHOULD clear the dirty flag for each field that was serialized into the persistence payload when the user saves, so that view-only expand → collapse does not re-serialize if the user remains on the editor after save.

#### Scenario: Per-field expand reveals structured form

- **GIVEN** the Spell Editor form and a canon field (e.g. Duration) in collapsed state
- **WHEN** the user activates the expand control for that field
- **THEN** the editor MUST reveal the structured component for that field (e.g. StructuredFieldInput for range/duration/casting_time, AreaForm for area, DamageForm for damage, SavingThrowInput, MagicResistanceInput, ComponentCheckboxes plus material list for components)
- **AND** the editor MUST populate that structured form: if the spell was loaded with `canonical_data` that includes this field, use that structured value; otherwise, for fields with Tauri parser commands (`range`, `duration`, `casting_time`, `area`, `damage`, and optionally `components`), parse the current text via the corresponding Tauri parser command and show the result (or "special" + raw_legacy_value on parse failure or if the command rejects/throws; per main spell-editor spec, handle defensively). For `savingThrow` and `magicResistance`, no corresponding parser command exists; the editor MUST apply the existing fallback mapping from legacy text to structured state.
- **AND** when the editor must parse via a Tauri command (no `canonical_data` for a field with a parser command), parser commands are async—the editor MUST show a loading state (e.g. spinner, disabled inputs, or skeleton) in the expanded area until the structured form is populated; only then MAY the user edit. When the form is populated from `canonical_data` (synchronous), no loading state is required. For fallback-only fields (`savingThrow`, `magicResistance`), no async parser loading state is required.
- **AND** the expand control MUST be keyboard and screen-reader friendly (e.g. aria-expanded, aria-controls, focus management); keyboard activation (Enter/Space); focus moves into expanded content when opened, back to expand control when closed (or follow frontend-standards)

#### Scenario: On collapse, line updates from spec only when dirty

- **GIVEN** a detail field is expanded and the user has edited the structured form (field is dirty)
- **WHEN** the user collapses that field
- **THEN** the editor MUST serialize the current structured value to text using the existing helpers (e.g. durationToText, rangeToText, componentsToText)
- **AND** MUST update the form text field and the single-line input with that value so the canon line stays in sync with the structured form

#### Scenario: On collapse without edit, canon line unchanged

- **GIVEN** a detail field is expanded and the user has not edited the structured form (field is not dirty; they only expanded to view)
- **WHEN** the user collapses that field
- **THEN** the editor MUST NOT overwrite the canon line
- **AND** the existing text in the single-line input and form text field MUST remain unchanged

#### Scenario: Manual adjustment of structured form is allowed

- **GIVEN** a detail field was expanded and the parser returned "special" (or the user wishes to adjust the structured value)
- **WHEN** the user edits the structured form (e.g. changes kind, fills in unit and duration, or corrects a parsed value)
- **THEN** the field is marked dirty
- **AND** on collapse the editor MUST serialize the current structured value to text and update the canon line so the user's manual fix is persisted

#### Scenario: Components collapsed and expanded

- **GIVEN** the Components detail field
- **WHEN** the field is collapsed
- **THEN** the editor MUST show a single line (e.g. "V, S, M" or "V, S, M (ruby dust 50 gp)") bound to form.components (and material display as needed)
- **WHEN** the user expands Components
- **THEN** the editor MUST show ComponentCheckboxes and the material component list; on collapse, if the components structured form was edited (dirty), MUST serialize to form.components and form.materialComponents via componentsToText; otherwise MUST NOT overwrite the canon line

#### Scenario: New spell starts collapsed

- **GIVEN** the user is creating a new spell
- **WHEN** the editor loads
- **THEN** all detail fields MUST be collapsed with empty or placeholder canon text lines
- **AND** on first expand of a field, the editor MUST parse the current text (or treat empty string per design: default or "special" with empty raw) and show the structured form

#### Scenario: First expand with empty canon line

- **GIVEN** a canon field (e.g. Duration) whose current text is empty (e.g. new spell or user cleared the line)
- **WHEN** the user expands that field
- **THEN** for fields with a Tauri parser command (`range`, `duration`, `casting_time`, `area`, `damage`, and optionally `components`), the editor MUST call the corresponding parser with the empty string; for fallback-only fields (`savingThrow`, `magicResistance`), the editor MUST apply the default structured state (e.g. `defaultSavingThrowSpec()`, `defaultMagicResistanceSpec()`)
- **AND** if the parser returns a defined default (a valid spec), the editor MUST show that spec in the structured form
- **AND** if the parser does not return a valid default, the editor MUST treat the field as "special" with empty `raw_legacy_value` and show the structured form in that state

#### Scenario: Warning when expanded and spec is special

- **GIVEN** a detail field is expanded and the structured value for that field has kind "special" (or parse failed)
- **THEN** the editor MUST show the existing "could not be fully parsed" hint for that field (inline or in the expanded section)
- **AND** when that field is collapsed, the editor MUST show a subtle indicator (e.g. icon or tooltip) if the last parse or loaded spec for that field was "special", so the user knows the line is stored but not fully structured for hashing
- **AND** the "special" indicator MAY also be shown for other non-canonical kinds (e.g. `dm_adjudicated` for Saving Throw or Damage) where the value is stored but not fully structured for hashing

#### Scenario: Persistence unchanged

- **GIVEN** the user edits only in the canon (collapsed) view and saves
- **THEN** the editor MUST persist the flat text columns as today
- **AND** when structured state exists (e.g. user expanded and edited), the editor MUST continue to build and persist canonical_data from current specs on save; persistence shape (flat columns + canonical_data) is unchanged
- **AND** on explicit Save, if any detail field is currently expanded and dirty, the editor MUST serialize that field to the canon line before building the persistence payload so flat text and canonical_data stay in sync. After applying those serialized values to the form for the persistence payload, the editor SHOULD clear the dirty flag for those fields (so that a subsequent view-only collapse does not overwrite the canon line)

#### Scenario: Validation applies when saving from canon view

- **GIVEN** the user edits only in the canon (collapsed) view (no expanded structured forms)
- **WHEN** the user attempts to save
- **THEN** existing validation rules MUST still apply (e.g. required name, Epic requires School, Quest requires Sphere, other tradition/semantic rules from the main spell-editor spec)
- **AND** the editor MUST block save and display the same inline errors as today until the form is valid

#### Scenario: Unsaved changes — warn on navigate or close; no auto-serialize; save is explicit

- **GIVEN** the user has unsaved changes (e.g. edited canon lines and/or has a detail field expanded with edits not yet collapsed or saved)
- **WHEN** the user attempts to navigate away from the spell (e.g. to another route, spell, or Add Spell) or to **close the editor** (e.g. closing the editor window or leaving the spell route so the spell is no longer being edited)
- **THEN** the editor MUST warn the user about unsaved changes (e.g. confirm dialog or equivalent) and MUST allow the user to cancel and stay, or to leave and discard
- **AND** the editor MUST NOT automatically serialize any dirty expanded field to the canon line on navigate/close—serialization to the canon line happens only when the user explicitly collapses that field or when the user explicitly saves
- **AND** saving MUST always be explicit (user activates Save); the editor MUST NOT auto-save or serialize-and-persist on navigate or close

#### Scenario: Stable test IDs for canon-first UI

- **GIVEN** the canon-first Details block is rendered
- **THEN** each canon single-line input MUST have a stable `data-testid` (e.g. `detail-range-input`, `detail-duration-input`, and equivalents for Components, Casting Time, Area of Effect, Saving Throw, Damage, Magic Resistance)
- **AND** each per-field expand control MUST have a stable `data-testid` (e.g. `detail-range-expand`, `detail-duration-expand`, and equivalents for the same fields)
- **AND** when the optional ninth row (Material Component) is implemented, it MUST use `detail-material-components-input` and `detail-material-components-expand`
- **SO THAT** E2E tests and Storybook can target elements without relying on labels or DOM order. The exact IDs are listed in Documentation Updates (developer doc).

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
- AND `savingThrow` and `magicResistance` are handled without parser commands: when `canonical_data` is missing for those fields, the editor MUST use fallback mapping from legacy text to structured state.
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

#### Scenario: Tradition Load Error (School and Sphere Co-presence)
- GIVEN a spell record loaded from the database that has both `school` and `sphere` set (co-present)
- WHEN the editor loads the spell
- THEN the editor MUST display a data-integrity warning identifying that school and sphere cannot both be set
- AND MUST block saving until the conflict is resolved by clearing either school or sphere.

#### Scenario: Dismissing the Tradition Load Error via Tradition Change
- GIVEN a spell that triggered the tradition load error (both school and sphere set)
- WHEN the user selects a new value from the tradition dropdown
- THEN the tradition load error flag MUST be cleared and the data-integrity warning MUST be dismissed
- AND normal tradition validation MUST take effect immediately: if school is not set for ARCANE, the ARCANE school-required error MUST appear and block save; if sphere is not set for DIVINE, the DIVINE sphere-required error MUST appear and block save.
- The user must also clear the field that does not belong to the chosen tradition (sphere for ARCANE; school for DIVINE). The JSON schema `allOf` constraint enforces this at save time — a record with both fields set will fail schema validation regardless of tradition. Save is unblocked only when the required field is set AND the opposing tradition's field is cleared.

#### Scenario: Class List and Tradition
- NOTE: `class_list` is currently a plain array of strings with no schema-level enforcement of Arcane/Divine membership. Arcane spells are intended for Arcane casters (e.g. Wizard, Bard); Divine spells are intended for Divine casters (e.g. Priest, Druid). No UI-level validation or restriction of `class_list` by tradition is required at this time. A future class schema feature will implement spell-list access control.

### Testing Requirements

The following behaviors MUST be verified using Playwright E2E tests:
- The UI properly reflects the removal of the BOTH tradition (i.e. tradition dropdown only contains "Arcane" and "Divine").
- Existing inline errors and block-save logic persist when saving a new spell with no school (ARCANE).

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
