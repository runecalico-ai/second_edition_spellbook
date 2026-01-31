# Tasks: Structure Spell Data UI Components

## Frontend Implementation
### Component Architecture
- [ ] Create `StructuredFieldInput` component:
    - [ ] Props: value, onChange, fieldType (range/duration/etc.).
    - [ ] Render inputs: base_value (number), per_level (number), level_divisor (number), unit (dropdown).
    - [ ] Compute `.text` preview automatically based on inputs.
    - [ ] Display text preview below inputs (read-only, italic).
    - [ ] Implement locale-aware numeric input (handle `.` vs `,` decimal separators).
    - [ ] Validate inputs against schema constraints.
- [ ] Create `ComponentCheckboxes` component:
    - [ ] Render checkboxes: Verbal (V), Somatic (S), Material (M).
    - [ ] Output: `{verbal: boolean, somatic: boolean, material: boolean}`.
    - [ ] Display text preview: "V, S" or "V, S, M" based on checked boxes.
- [ ] Create shared input validation utilities:
    - [ ] Validate number ranges (base_value >= 0, per_level >= 0).
    - [ ] Validate unit enums against schema.
    - [ ] Format error messages for display.

### SpellEditor Integration
- [ ] Integrate `StructuredFieldInput` into `SpellEditor`:
    - [ ] Replace string input for `range` with `StructuredFieldInput`.
    - [ ] Replace string input for `duration` with `StructuredFieldInput`.
    - [ ] Replace string input for `casting_time` with `StructuredFieldInput`.
    - [ ] Replace string input for `area` with `StructuredFieldInput`.
- [ ] Integrate `ComponentCheckboxes` for components field.
- [ ] Add tradition-based validation:
    - [ ] If tradition = "ARCANE", require school selection.
    - [ ] If tradition = "DIVINE", require sphere selection.
    - [ ] If tradition = "BOTH", require both school and sphere.
    - [ ] Display validation errors inline.
- [ ] Legacy data parsing and priority loading:
    - [ ] Prioritize loading from `canonical_data` (JSON) if present.
    - [ ] If `canonical_data` is missing, detect if fields are legacy string format.
    - [ ] Auto-parse legacy strings using migration parser logic (reimplemented in frontend).
    - [ ] Populate structured inputs with parsed values.
    - [ ] Display warning if parsing failed (fallback used).

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
        - [ ] Provide examples for common patterns (range, duration, damage).
        - [ ] Document V/S/M checkbox usage.
    - [ ] Update spell editor help:
        - [ ] Explain difference between legacy string and structured fields.
        - [ ] Document automatic text preview computation.
        - [ ] Explain content hash visibility.
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
