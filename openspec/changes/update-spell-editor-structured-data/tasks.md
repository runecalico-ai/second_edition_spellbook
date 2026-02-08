# Tasks: Structure Spell Data UI Components

## Frontend Implementation
### Component Architecture
- [ ] Create `StructuredFieldInput` component:
    - [ ] Props: value, onChange, fieldType (range/duration/casting_time).
    - [ ] Render inputs: base_value (number), per_level (number), divisor (number), unit (dropdown).
    - [ ] Use lowercase unit values per canonical serialization spec (e.g., `"yd"`, `"ft"`, `"round"`).
    - [ ] Compute `.text` preview automatically based on inputs.
    - [ ] Display text preview below inputs (read-only, italic).
    - [ ] Implement locale-aware numeric input (handle `.` vs `,` decimal separators).
    - [ ] Validate inputs against schema constraints.
- [ ] Create `DamageForm` component:
    - [ ] Handle `DamageSpec` structure (schema lines 1283+).
    - [ ] Enum selector for `kind`: "modeled", "dm_adjudicated", "none".
    - [ ] `modeled`:
        - [ ] Validated list of `DamagePart`.
        - [ ] Combine mode selector (sum, max, etc.).
    - [ ] `dm_adjudicated`: Text area for guidance.
- [ ] Create `AreaForm` component:
    - [ ] Enum selector for `kind` (cone, cube, sphere, cylinder, line, etc.).
    - [ ] Dynamic inputs based on kind:
        - [ ] Cone/Line: `length`, `shape_unit`.
        - [ ] Sphere/Circle: `radius`, `shape_unit`.
        - [ ] Cube/Square: `edge`, `shape_unit`.
        - [ ] Cylinder: `radius`, `height`, `shape_unit`.
        - [ ] Wall: `length`, `height`, `thickness`, `shape_unit`.
        - [ ] Creatures/Objects: `count`, `count_subject`.
    - [ ] Support `Scalar` inputs for dimensions (using helper or `StructuredFieldInput` for sub-fields).
- [ ] Create `SavingThrowInput` component:
    - [ ] Enum selector for `kind`: "none", "half", "negates", "partial", "special".
    - [ ] If `partial`, show numerator/denominator inputs.
- [ ] Create `MagicResistanceInput` component:
    - [ ] Enum selector for `kind`: "unknown", "normal", "ignores_mr", "partial", "special".
    - [ ] Enum selector for `applies_to`.
- [ ] Create `ComponentCheckboxes` component:
    - [ ] Render checkboxes: Verbal (V), Somatic (S), Material (M).
    - [ ] Output: `{verbal: boolean, somatic: boolean, material: boolean}`.
    - [ ] Display text preview: "V, S" or "V, S, M" based on checked boxes.
    - [ ] When Material is checked, show sub-form for `MaterialComponentSpec`:
        - [ ] Material name (text input).
        - [ ] Quantity (number, default: 1.0).
        - [ ] GP value (optional number).
        - [ ] Is consumed (checkbox, default: false).
        - [ ] Description (optional textarea).
    - [ ] Support multiple material components (add/remove buttons).
    - [ ] Preserve material component order (not sorted).
    - [ ] **Confirmation Dialog**: If material components exist and user unchecks "Material", show confirmation dialog before clearing data.
- [ ] Create shared input validation utilities:
    - [ ] Validate number ranges (base_value >= 0, per_level >= 0).
    - [ ] Validate unit enums against schema.
    - [ ] Format error messages for display.

### SpellEditor Integration
- [ ] Integrate `StructuredFieldInput` into `SpellEditor`:
    - [ ] Replace string input for `range` with `StructuredFieldInput`.
    - [ ] Replace string input for `duration` with `StructuredFieldInput`.
    - [ ] Replace string input for `casting_time` with `StructuredFieldInput`.
- [ ] Integrate `AreaForm` into `SpellEditor`:
    - [ ] Replace string input for `area` with `AreaForm`.
- [ ] Integrate `DamageForm` into `SpellEditor`:
    - [ ] Replace string input for `damage` with `DamageForm`.
- [ ] Integrate `SavingThrowInput` into `SpellEditor`:
    - [ ] Replace string input for `saving_throw` with `SavingThrowInput`.
- [ ] Integrate `MagicResistanceInput` into `SpellEditor`:
    - [ ] Replace string input for `magic_resistance` with `MagicResistanceInput`.
- [ ] Integrate `ComponentCheckboxes` for components field (with material sub-form).
- [ ] Add tradition-based validation:
    - [ ] If tradition = "ARCANE", require school selection.
    - [ ] If tradition = "DIVINE", require sphere selection.
    - [ ] If tradition = "BOTH", require both school and sphere.
    - [ ] Display validation errors inline.
- [ ] Legacy data parsing and priority loading:
    - [ ] Prioritize loading from `canonical_data` column (JSON blob, added in migration 12) if present.
    - [ ] If `canonical_data` is null/missing, detect if fields are legacy string format.
    - [ ] Call Tauri backend parser commands (avoid duplicating Rust parser logic in frontend).
    - [ ] Populate structured inputs with parsed values.
    - [ ] Display warning banner if parsing fell back to `kind: "special"` (original text preserved in `.text` or `raw_legacy_value`).

### SpellDetail Display
- [ ] Add hash display to `SpellDetail` view:
    - [ ] Show first 8 characters of hash with "..." suffix.
    - [ ] Add "Copy" button to copy full hash to clipboard.
    - [ ] Add "Expand" button to show full 64-character hash.
    - [ ] Style hash as code block (monospace, light gray background).
- [ ] Render structured fields in detail view:
    - [ ] Display computed `.text` for range, duration, casting_time, area.
    - [ ] Format components as badges: "V", "S", "M".
    - [ ] Show damage formula if present.

## Testing
### Unit Tests
- [ ] Test `StructuredFieldInput` component:
    - [ ] Initial render with empty value.
    - [ ] Value change emits structured object.
    - [ ] Text preview auto-computes.
    - [ ] Validation enforces constraints.
- [ ] Test `ComponentCheckboxes` component:
    - [ ] Checkbox state to object conversion.
    - [ ] Text preview from checkboxes.
    - [ ] Material sub-form visibility when M checked.
    - [ ] Multiple material component add/remove.
    - [ ] Material quantity validation (>= 1.0).
    - [ ] Material name required validation.
- [ ] Test legacy data parsing:
    - [ ] Parse simple range ("10 yards").
    - [ ] Parse variable range ("10 + 5/level yards").
    - [ ] Fallback for unparseable data.

### Integration Tests
- [ ] Test SpellEditor validation:
    - [ ] Arcane spell requires school.
    - [ ] Divine spell requires sphere.
    - [ ] BOTH tradition requires both.
- [ ] Test SpellDetail display:
    - [ ] Hash display with copy button.
    - [ ] Structured field rendering.
    - [ ] Component badges.

## Documentation
- [ ] User documentation:
    - [ ] Update user manual with structured field editing:
        - [ ] Document StructuredFieldInput component usage.
        - [ ] Explain how to enter base value, per-level, and units.
        - [ ] Provide examples for common patterns (range, duration, casting_time, area, damage).
        - [ ] Document V/S/M checkbox usage and material component sub-form.
    - [ ] Update spell editor help:
        - [ ] Explain difference between legacy string and structured fields.
        - [ ] Document automatic text preview computation.
        - [ ] Explain content hash visibility (computed by backend, displayed in UI).
- [ ] Developer documentation:
    - [ ] Write component API guide:
        - [ ] `StructuredFieldInput` props and usage.
        - [ ] `ComponentCheckboxes` props and usage.
        - [ ] State management patterns.
        - [ ] Event handling (onChange, onBlur).
    - [ ] Create Storybook stories:
        - [ ] Stories for all StructuredFieldInput variations.
        - [ ] Interaction tests in Storybook.
        - [ ] Accessibility checks in Storybook.
