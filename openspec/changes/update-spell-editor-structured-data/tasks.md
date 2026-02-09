# Tasks: Structure Spell Data UI Components

## Frontend Implementation
### Component Architecture
- **Scalar reference**: Dimension and scalar fields use schema shape `{ mode, value, per_level }` per `#/$defs/scalar` in `apps/desktop/src-tauri/schemas/spell.schema.json`.
- [x] Create `StructuredFieldInput` component (accepts `fieldType`, emits schema-native shape per spell.schema.json):
    - [x] Props: value, onChange, fieldType (range | duration | casting_time).
    - [x] Emit shape by fieldType: **range** → RangeSpec (per `#/$defs/RangeSpec`); **duration** → DurationSpec (per `#/$defs/DurationSpec`); **casting_time** → flat object (base_value, per_level, level_divisor, unit, text).
    - [x] **Modularity**: Implement internally as a set of sub-components or distinct layout blocks for each `fieldType` while sharing the `ScalarInput` foundation.
    - [x] Render inputs appropriate to fieldType. For **range** (full kind support): distance-based kinds → kind + scalar + unit; kind-only kinds → kind selector only; `special` → kind + raw_legacy_value. For **duration** (full kind support): `instant`/`permanent`/`until_dispelled`/`concentration` → kind only; `time` → kind + unit + duration scalar; `conditional`/`until_triggered`/`planar` → kind + condition text; `usage_limited` → kind + uses scalar; `special` → kind + raw_legacy_value. For casting_time: base_value, per_level, level_divisor, unit.
    - [x] Use lowercase unit values per canonical serialization spec for serialization. Common unit examples: Range (`"yd"`, `"ft"`, `"mi"`), Duration (`"round"`, `"turn"`, `"hour"`), Casting time (`"segment"`, `"round"`, `"action"`). UI may show human-friendly labels (e.g. "Yards", "Rounds") that map to these canonical enum values. See `spell.schema.json` for complete unit enum lists.
    - [x] Compute `.text` preview automatically based on inputs.
    - [x] Display text preview below inputs (read-only, italic).
    - [x] Implement locale-aware numeric input (handle `.` vs `,` decimal separators).
    - [x] Validate inputs against schema constraints.
- [x] Create `DamageForm` component:
    - [x] Handle `SpellDamageSpec` structure (per `#/$defs/SpellDamageSpec` in spell.schema.json).
    - [x] Enum selector for `kind`: "modeled", "dm_adjudicated", "none".
    - [x] `modeled`:
        - [x] Validated list of `DamagePart`. Each new part MUST satisfy schema required fields: id, damage_type, base, application, save. Use schema-default or UI defaults for application and save when adding a new part (e.g. instant / none or as defined in schema).
        - [x] **Stable IDs**: Ensure each new part is assigned a unique, schema-compliant ID upon creation matching pattern `^[a-z][a-z0-9_]{0,31}$`. Use: `part_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` (typically 20-25 chars, well under 31 limit). UUIDs are too long. If truncation needed (extremely unlikely), truncate to 31 chars. Handle collisions gracefully (regenerate or append random chars). IDs MUST be assigned immediately upon creation for deterministic hashing.
        - [x] Combine mode selector: sum, max, choose_one, sequence (per `#/$defs/SpellDamageSpec` combine_mode enum).
    - [x] `dm_adjudicated`: Text area for guidance.
- [x] Create `AreaForm` component (per `#/$defs/AreaSpec` in spell.schema.json; dimensions use `#/$defs/scalar`):
    - [x] Enum selector for `kind`: point, radius_circle, radius_sphere, cone, line, rect, rect_prism, cylinder, wall, cube, volume, surface, tiles, creatures, objects, region, scope, special.
        - [x] Dynamic inputs based on kind (required fields per `#/$defs/AreaSpec` in spell.schema.json):
        - [x] radius_circle / radius_sphere: `radius`, `shape_unit`.
        - [x] cone / line: `length`, `shape_unit`.
        - [x] rect: `length`, `width`, `shape_unit`.
        - [x] rect_prism: `length`, `width`, `height`, `shape_unit`.
        - [x] cylinder: `radius`, `height`, `shape_unit`.
        - [x] wall: `length`, `height`, `thickness`, `shape_unit`.
        - [x] cube: `edge`, `shape_unit`.
        - [x] surface: `surface_area`, `unit`.
        - [x] volume: `volume`, `unit`.
        - [x] tiles: `tile_unit`, `tile_count`.
        - [x] creatures / objects: `count`, `count_subject`.
        - [x] region: `region_unit`.
        - [x] scope: `scope_unit`.
        - [x] point / special: kind only (special may show raw_legacy_value).
    - [x] Support scalar inputs for dimensions (scalar = mode, value, per_level per schema; use helper or sub-fields). Geometric dimensions use `shape_unit`; surface/volume kinds use the scalar plus `unit` per AreaSpec.
- [x] Create `SavingThrowInput` and `MagicResistanceInput` components (enum selector for kind + optional custom/special field per spell-editor spec pattern):
    - [x] **Pattern**: Use a shared `EnumWithSpecial` UI pattern or component to handle the "kind selection + optional sub-form/text field" requirement for both inputs.
    - [x] **MR Logic**: In `MagicResistanceInput`, hide or disable the `applies_to` selector when `kind` is `"unknown"`.
    - [x] When kind is "partial", show sub-form for `partial`: scope (required), optional part_ids.
    - [x] When kind is "special", show field for `special_rule` (optional text per schema).
- [x] Create `ComponentCheckboxes` component:
    - [x] Props: `components` (value), `material_components` (value), `onChange` (emits updated components and/or material_components).
    - [x] Render checkboxes: Verbal (V), Somatic (S), Material (M).
    - [x] Output: emit `components` object on checkbox change; emit `material_components` array on sub-form change. Parent handles merging.
    - [x] Display text preview: "V, S" or "V, S, M" based on checked boxes.
    - [x] When Material is checked, show sub-form for `#/$defs/MaterialComponentSpec`:
        - [x] Material name (text input, required).
        - [x] Quantity (number, default: 1.0). UI Validation: >= 1.0 (accepts both integers >= 1 and decimals >= 1.0). Use clamp-on-change to enforce minimum (clamp values < 1.0 to 1.0). Schema has no minimum constraint, but UI enforces >= 1.0. Canonical materialization uses 1.0 when omitted. Default display MUST be 1.0 (not 1) for hashing consistency.
        - [x] GP value (optional number).
        - [x] Is consumed (checkbox, default: false).
        - [x] Description (optional textarea).
        - [x] Unit (optional text input). UI MUST expose this field to ensure full schema coverage.
    - [x] Support multiple material components (add/remove buttons).
    - [x] Preserve material component order (not sorted).
    - [x] **Confirmation Dialog**: If material components exist and user unchecks "Material", show confirmation dialog before clearing data.
- [x] Create shared input validation utilities:
    - [x] Validate number ranges (base_value >= 0, per_level >= 0).
    - [x] Validate unit enums against schema.
    - [x] Format error messages for display.
- [x] Add `data-testid` to all new structured form components: values MUST follow main frontend-standards naming (kebab-case, descriptive). Examples: `range-base-value`, `duration-unit`, `casting-time-unit`, `component-checkbox-material`, `area-form-kind`, `damage-form-add-part`, `saving-throw-dm-guidance`, `magic-resistance-applies-to`, `material-component-name`, `material-component-add`.
    - [x] `StructuredFieldInput` and its sub-inputs (e.g. range-base-value, duration-unit).
    - [x] `AreaForm`, `DamageForm`, `SavingThrowInput`, `MagicResistanceInput` and their key controls.
    - [x] `ComponentCheckboxes` (V/S/M) and material sub-form controls (add/remove, name, quantity, etc.).

### SpellEditor Integration
- [x] Integrate `StructuredFieldInput` into `SpellEditor`:
    - [x] Replace string input for `range` with `StructuredFieldInput`.
    - [x] Replace string input for `duration` with `StructuredFieldInput`.
    - [x] Replace string input for `casting_time` with `StructuredFieldInput`.
- [x] Integrate `AreaForm` into `SpellEditor`:
    - [x] Replace string input for `area` with `AreaForm`.
- [x] Integrate `DamageForm` into `SpellEditor`:
    - [x] Replace string input for `damage` with `DamageForm`.
- [x] Integrate `SavingThrowInput` into `SpellEditor`:
    - [x] Replace string input for `saving_throw` with `SavingThrowInput`.
- [x] Integrate `MagicResistanceInput` into `SpellEditor`:
    - [x] Replace string input for `magic_resistance` with `MagicResistanceInput`.
- [x] Integrate `ComponentCheckboxes` for components field (with material sub-form).
- [x] Add tradition-based validation:
    - [x] If tradition = "ARCANE", require school selection.
    - [x] If tradition = "DIVINE", require sphere selection.
    - [x] If tradition = "BOTH", require both school and sphere. The editor blocks saving when tradition = "BOTH" and either school or sphere is missing, displaying inline validation errors for the missing field(s).
    - [x] Display validation errors inline.
- [x] Legacy data parsing and priority loading:
    - [x] Prioritize loading from `canonical_data` column (JSON blob; see add-spell-canonical-hashing-foundation) if present.
    - [x] Hybrid: If `canonical_data` exists but a field (e.g. range) is null/absent and legacy string exists, parse that field and merge into structured state.
    - [x] If `canonical_data` is null/missing, detect if fields are legacy string format.
    - [x] Call Tauri backend parser commands (see Backend tasks below); frontend MUST NOT duplicate Rust parser logic.
    - [x] Populate structured inputs with parsed values.
    - [x] Display warning banner if parsing fell back to `kind: "special"`. When kind is "special", the authoritative storage for the original legacy string is `raw_legacy_value`; the computed `.text` may mirror it for display.

### Backend (Tauri parser commands)
- [x] Expose spell parsers as Tauri commands if not already present. Tauri command names MUST use `parse_spell_*` prefix (clear for frontend). Commands wrap `SpellParser` in `src-tauri/src/utils/spell_parser.rs`:
    - [x] `parse_spell_range(legacy: string)` → RangeSpec (per `#/$defs/RangeSpec`, wraps `SpellParser::parse_range`).
    - [x] `parse_spell_duration(legacy: string)` → DurationSpec (per `#/$defs/DurationSpec`, wraps `SpellParser::parse_duration`).
    - [x] `parse_spell_casting_time(legacy: string)` → casting_time object (wraps `SpellParser::parse_casting_time` via components).
    - [x] `parse_spell_area(legacy: string)` → AreaSpec | null (per `#/$defs/AreaSpec`, wraps `SpellParser::parse_area`).
    - [x] `parse_spell_damage(legacy: string)` → SpellDamageSpec (per `#/$defs/SpellDamageSpec`, wraps `SpellParser::parse_damage`).
    - [x] `parse_spell_components(legacy: string)` → components + material_components where parseable (wraps `SpellParser::parse_components`; optional for legacy string loading).
    - [x] Register commands in `lib.rs` invoke_handler.
    - [x] Return types MUST use camelCase for IPC per project standard (see project.md, DEVELOPMENT.md, src-tauri AGENTS.md). Backend structs MUST use `#[serde(rename_all = "camelCase")]`. Shapes conceptually match spell.schema.json; canonical storage in `canonical_data` uses snake_case (conversion happens when building CanonicalSpell for persistence).

**Backend Parser Command Details:**
- **Return Type Specifications**: All parser commands return structured types using `camelCase` field names for IPC (e.g. `baseValue`, `perLevel`, `shapeUnit`). Backend structs MUST use `#[serde(rename_all = "camelCase")]` attribute. Return types match schema shapes conceptually but use camelCase instead of snake_case.
- **Error Handling**: 
  - Parser commands MUST handle invalid input strings gracefully. `SpellParser` returns schema-valid structured types (no `Result`); on parse failure it returns fallbacks such as `kind: "special"` with `raw_legacy_value` preserved.
  - Commands MUST NOT panic or return errors for invalid input - always return a valid structured type, even if it's a fallback.
  - Tauri command errors (e.g. serialization failures) are handled by Tauri's error system and returned to frontend as IPC errors.
- **Edge Cases**:
  - **Empty string input**: Commands MUST accept empty strings and return appropriate defaults or `kind: "special"` with empty `raw_legacy_value`.
  - **Null input**: If command receives null (shouldn't happen with Tauri's type system, but handle defensively), return appropriate default structured type.
  - **Whitespace-only input**: Treat as empty string, return defaults or special kind.
  - **Very long strings**: Parser should handle reasonable length limits; extremely long strings may fall back to `kind: "special"`.

### SpellDetail Display
- [x] Add hash display to `SpellDetail` view:
    - [x] Show first 8 characters of hash with "..." suffix.
    - [x] Add "Copy" button to copy full hash to clipboard.
    - [x] Add "Expand" button to show full 64-character hash.
    - [x] Style hash as code block (monospace, light gray background).
    - [x] Add data-testid: `spell-detail-hash-display`, `spell-detail-hash-copy`, `spell-detail-hash-expand` (per frontend-standards).
- [x] Render structured fields in detail view:
    - [x] Display computed `.text` for range, duration, casting_time, area.
    - [x] Display casting_time (e.g. computed `.text` or equivalent).
    - [x] Display saving_throw (kind + summary or dm_guidance).
    - [x] Display magic_resistance (kind + applies_to where applicable).
    - [x] Format components as badges: "V", "S", "M".
    - [x] Show damage formula if present.

## Testing
### Unit Tests
- [x] Test `StructuredFieldInput` component:
    - [x] Initial render with empty value.
    - [x] Value change emits structured object.
    - [x] Text preview auto-computes.
    - [x] Validation enforces constraints.
- [x] Test `ComponentCheckboxes` component:
    - [x] Checkbox state to object conversion.
    - [x] Text preview from checkboxes.
    - [x] Material sub-form visibility when M checked.
    - [x] Multiple material component add/remove.
    - [x] Material quantity validation (>= 1.0).
    - [x] Material name required validation.
- [x] Test legacy data parsing:
    - [x] Parse simple range ("10 yards").
    - [x] Parse variable range ("10 + 5/level yards").
    - [x] Fallback for unparseable data.

### Integration Tests
- [x] Test SpellEditor validation:
    - [x] Arcane spell requires school.
    - [x] Divine spell requires sphere.
    - [x] BOTH tradition requires both.
- [x] Test SpellDetail display:
    - [x] Hash display with copy button.
    - [x] Structured field rendering.
    - [x] Casting time, saving throw, magic resistance rendering.
    - [x] Component badges.

## Documentation
- [x] User documentation:
    - [x] Update user manual with structured field editing:
        - [x] Document StructuredFieldInput component usage.
        - [x] Explain how to enter base value, per-level, and units.
        - [x] Provide examples for common patterns (range, duration, casting_time, area, damage).
        - [x] Document V/S/M checkbox usage and material component sub-form.
    - [x] Update spell editor help:
        - [x] Explain difference between legacy string and structured fields.
        - [x] Document automatic text preview computation.
        - [x] Explain content hash visibility (computed by backend, displayed in UI).
- [x] Developer documentation:
    - [x] Write component API guide:
        - [x] `StructuredFieldInput` props and usage.
        - [x] `AreaForm`, `DamageForm`, `SavingThrowInput`, `MagicResistanceInput` props and usage.
        - [x] `ComponentCheckboxes` props and usage.
        - [x] State management patterns.
        - [x] Event handling (onChange, onBlur).

**Component API Documentation Structure:**
The component API guide MUST include the following sections for each component:
- **Props Interface**: Complete TypeScript interface definition with all props, their types, required/optional status, and descriptions.
- **Event Signatures**: Detailed signatures for all event handlers (onChange, onBlur, etc.) including parameter types and return values.
- **State Management Patterns**: How component state is managed (controlled vs uncontrolled), how parent components should handle state updates, and integration with form state management.
- **Example Usage Code**: Complete, runnable examples showing typical usage patterns, edge cases, and integration with SpellEditor.
- **Common Pitfalls**: Known issues, gotchas, and best practices to avoid common mistakes (e.g. casing conversion, default value handling, validation timing).
    - [x] Create Storybook stories (in-scope for this change):
        - [x] Stories for all StructuredFieldInput variations (range, duration, casting_time) with different kind selections and value combinations.
        - [x] Stories for AreaForm with all area kinds (point, radius_circle, radius_sphere, cone, line, rect, etc.) showing dynamic inputs.
        - [x] Stories for DamageForm (none, modeled with multiple parts, dm_adjudicated).
        - [x] Stories for SavingThrowInput (none, single, multiple, dm_adjudicated).
        - [x] Stories for MagicResistanceInput (all kinds including unknown, partial, special).
        - [x] Stories for ComponentCheckboxes with material sub-form (single and multiple material components).
        - [x] Interaction tests in Storybook (user interactions, state changes, validation) - Stories demonstrate component interactions; @storybook/addon-vitest provides testing capabilities.
        - [x] Accessibility checks in Storybook (keyboard navigation, screen reader compatibility, ARIA labels) - @storybook/addon-a11y configured and will automatically check accessibility.
