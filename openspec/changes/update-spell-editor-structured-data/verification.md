# Verification Plan: Spell Editor Structured Data Components

**Parser behavior:** SpellParser returns schema-valid structured types; on parse failure it returns fallbacks (e.g. `kind: "special"` with `raw_legacy_value`). The UI must handle unexpected parser errors (e.g. Tauri command failure) defensively.

## Component Tests

### StructuredFieldInput Component
- [ ] **Test: Initial render with empty value**
  - GIVEN `StructuredFieldInput` with no value
  - THEN all numeric inputs MUST show schema defaults
  - AND unit selector MUST show default unit

- [ ] **Test: Value change emits structured object (casting_time)**
  - GIVEN `StructuredFieldInput` with fieldType = casting_time and user enters base_value = 10, unit = "round"
  - WHEN onChange fires
  - THEN callback MUST receive flat casting_time shape (e.g. `{text: "10 round", unit: "round", base_value: 10, per_level: 0, level_divisor: 1}`)

- [ ] **Test: Value change emits structured object (range)**
  - GIVEN `StructuredFieldInput` with fieldType = range and user enters distance value 10, unit = "yd"
  - WHEN onChange fires
  - THEN callback MUST receive RangeSpec shape (e.g. `{kind: "distance", distance: {mode: "fixed", value: 10}, unit: "yd"}`)

- [ ] **Test: Value change emits structured object (duration)**
  - GIVEN `StructuredFieldInput` with fieldType = duration and user enters duration value 1, unit = "round"
  - WHEN onChange fires
  - THEN callback MUST receive DurationSpec shape (e.g. `kind` + `duration` scalar + `unit` where applicable)

- [ ] **Test: Duration kind=time (scalar + unit)**
  - GIVEN `StructuredFieldInput` with fieldType = duration, kind = "time"
  - WHEN user enters duration value 1, per_level 0.5, unit = "round"
  - THEN output MUST include `kind: "time"`, `unit: "round"`, and `duration` scalar with mode/value/per_level
  - AND text preview MUST display the computed duration (e.g. "1 + 0.5/level round")

- [ ] **Test: Text preview auto-computes**
  - GIVEN `StructuredFieldInput` (e.g. casting_time) with base_value = 10, per_level = 5, unit = "round"
  - THEN text preview MUST display "10 + 5/level round"

- [ ] **Test: Text preview auto-computes (range with yd)**
  - GIVEN `StructuredFieldInput` with fieldType = range, distance value = 10, unit = "yd"
  - THEN text preview MUST display the computed range text (e.g. "10 yd")

- [ ] **Test: Validation enforces schema constraints**
  - GIVEN unit selector
  - WHEN user selects invalid unit (not in enum)
  - THEN component MUST reject and show error

- [ ] **Test: Negative number handling (clamp-on-change)**
  - GIVEN user enters base_value = -5
  - THEN component MUST clamp to valid range (e.g. 0) per frontend-standards
  - AND component state MUST NOT persist the invalid value

- [ ] **Test: Decimal precision handling**
  - GIVEN user enters per_level = 0.5
  - THEN component MUST accept the value
  - AND value MUST be serialized with up to 6 decimal places per canonical spec

- [ ] **Test: Locale-aware decimal input**
  - GIVEN user locale uses comma as decimal separator
  - WHEN user enters "1,5" in per_level field
  - THEN component MUST interpret as 1.5
  - AND display in locale-appropriate format

- [ ] **Test: Maximum value limits**
  - GIVEN user enters a value exceeding the documented cap (999999) in a structured scalar field
  - THEN component MUST show a warning and MUST allow the value (no clamp, no block save)

- [ ] **Test: Internal modularity of StructuredFieldInput**
  - GIVEN `StructuredFieldInput`
  - THEN the component MUST be internally modular (shared scalar foundation but distinct kind-selection logic per fieldType)
  - AND verify that changing `fieldType` updates the kind-selection options correctly.

### ComponentCheckboxes Component
- [ ] **Test: Checkbox state to object**
  - GIVEN user checks V and S, unchecks M
  - THEN component MUST emit object including `components: { verbal: true, somatic: true, material: false }`

- [ ] **Test: Text preview from checkboxes**
  - GIVEN V=true, S=true, M=false
  - THEN preview MUST show "V, S"

- [ ] **Test: Material sub-form visibility**
  - GIVEN user checks M checkbox
  - THEN material component sub-form MUST appear
  - AND sub-form MUST include: name, quantity, gp_value, is_consumed, description, unit

- [ ] **Test: Multiple material components**
  - GIVEN material sub-form is visible
  - WHEN user clicks "Add Material" button
  - THEN a new material component row MUST appear
  - AND user MUST be able to remove individual components

- [ ] **Test: Material component output structure**
  - GIVEN user enters: name="powdered diamond", quantity=1, gp_value=100, is_consumed=true
  - THEN component MUST emit `material_components: [{name: "powdered diamond", quantity: 1.0, gp_value: 100.0, is_consumed: true}]`

- [ ] **Test: Material quantity validation**
  - GIVEN user enters negative quantity or value < 1
  - THEN component MUST show validation error
  - AND component MUST clamp to minimum 1 (or 1.0) per spec so persisted value is >= 1

- [ ] **Test: Material name required**
  - GIVEN user adds material component
  - WHEN name field is empty
  - THEN component MUST show validation error
  - AND save MUST be blocked


### Legacy Data Parsing
- [ ] **Test: Parse legacy string on first edit**
  - GIVEN spell with legacy `range = "10 yards"`
  - WHEN user opens spell in editor
  - THEN `StructuredFieldInput` (range) MUST auto-parse to RangeSpec shape (e.g. `{kind: "distance", distance: {mode: "fixed", value: 10}, unit: "yd"}`)

- [ ] **Test: Fallback for unparseable legacy**
  - GIVEN spell with `range = "Special (DM discretion)"`
  - WHEN editor opens
  - THEN text field MUST show "Special (DM discretion)"
  - AND structured fields MUST show defaults (`kind: "special"`, `raw_legacy_value` preserved) with warning banner

- [ ] **Test: Warning banner when legacy unparseable (kind special)**
  - GIVEN spell with legacy range, duration, or casting_time that is unparseable (parser falls back to kind "special")
  - WHEN editor loads the spell
  - THEN a warning banner MUST be visible
  - AND `raw_legacy_value` MUST be preserved for the unparseable field(s)

- [ ] **Test: Single banner lists all fields that fell back to special**
  - GIVEN spell with legacy range and duration both unparseable (e.g. custom text)
  - WHEN editor loads the spell
  - THEN a single warning banner MUST appear at the top of the form
  - AND the banner MUST list all affected fields (e.g. "Range and Duration could not be fully parsed; original text preserved")
  - AND there MUST NOT be separate banners per field

- [ ] **Test: Legacy parsing uses Tauri parser commands**
  - GIVEN spell with null canonical_data and legacy string for range (e.g. "10 yards")
  - WHEN editor loads the spell
  - THEN the frontend MUST obtain structured range by calling the Tauri command `parse_spell_range` (or equivalent) with the legacy string, not by parsing in the frontend

- [ ] **Test: No client-side parsing for structured fields**
  - GIVEN spell with null canonical_data and legacy strings for range, duration, casting_time, area, or damage
  - WHEN editor loads the spell
  - THEN the frontend MUST use only Tauri parse commands (`parse_spell_range`, `parse_spell_duration`, etc.) to populate structured fields
  - AND MUST NOT implement or invoke duplicate parsing logic in the frontend for these fields

## Integration Tests

### SpellEditor Tradition Validation
- [ ] **Test: Arcane spell requires school**
  - GIVEN user selects tradition = "ARCANE"
  - AND leaves school = null
  - WHEN attempting to save
  - THEN save MUST be blocked
  - AND validation message MUST appear

- [ ] **Test: Divine spell requires sphere**
  - GIVEN user selects tradition = "DIVINE"
  - AND leaves sphere = null
  - WHEN attempting to save
  - THEN save MUST be blocked

- [ ] **Test: BOTH tradition requires both**
  - GIVEN tradition = "BOTH"
  - WHEN either school or sphere is null
  - THEN save MUST be blocked

### SpellDetail Display
- [ ] **Test: Hash display with copy button**
  - GIVEN spell with hash "abc123...xyz789"
  - WHEN viewing spell detail
  - THEN hash MUST be visible (first 8 chars or expandable)
  - AND clicking copy button MUST copy full hash

- [ ] **Test: Structured field rendering**
  - GIVEN spell with structured `range = {kind: "distance", distance: {mode: "fixed", value: 10}, unit: "yd"}`
  - WHEN viewing detail
  - THEN display MUST show computed text "10 yd"

- [ ] **Test: Component badges**
  - GIVEN spell with `components = {verbal: true, somatic: true, material: false}`
  - THEN display MUST show "V, S" badges

- [ ] **Test: Casting time rendering**
  - GIVEN spell with structured casting_time (e.g. `.text` = "1 action")
  - WHEN viewing detail
  - THEN display MUST show the casting time in human-readable form

- [ ] **Test: Saving throw rendering**
  - GIVEN spell with structured saving_throw (e.g. kind + dm_guidance or single save)
  - WHEN viewing detail
  - THEN display MUST show saving throw info in human-readable form

- [ ] **Test: Magic resistance rendering**
  - GIVEN spell with structured magic_resistance (e.g. kind + applies_to)
  - WHEN viewing detail
  - THEN display MUST show magic resistance info in human-readable form

### SpellEditor Damage and Area Forms
- [ ] **Test: DamageForm visible when editing damage**
  - GIVEN the Spell Editor form
  - WHEN the user is editing the Damage field
  - THEN the editor MUST render a `DamageForm`
  - AND the form MUST allow selecting kind (None, Modeled, DM Adjudicated)
  - AND if Modeled, allow adding multiple damage parts and configuring damage type, dice pool, and scaling for each part

- [ ] **Test: AreaForm visible when editing area**
  - GIVEN the Spell Editor form
  - WHEN the user is editing the Area field
  - THEN the editor MUST render an `AreaForm`
  - AND the form MUST allow selecting kind (Cone, Cube, Sphere, etc.) and entering specific scalars (radius, length, etc.) based on kind

### Material Component Confirmation
- [ ] **Test: Uncheck with existing data**
  - GIVEN material components list has 1 item
  - WHEN user unchecks "Material"
  - THEN a confirmation dialog MUST appear
  - AND data MUST NOT be cleared yet

- [ ] **Test: Confirming uncheck clears data**
  - GIVEN confirmation dialog is open
  - WHEN user clicks "Confirm"
  - THEN `material` property MUST become false
  - AND `material_components` array MUST become empty

- [ ] **Test: Canceling uncheck preserves data**
  - GIVEN confirmation dialog is open
  - WHEN user clicks "Cancel"
  - THEN `material` property MUST remain true
  - AND `material_components` array MUST be preserved

### Complex Form Components

#### DamageForm
- [ ] **Test: Kind selection**
  - GIVEN `DamageForm`
  - WHEN user selects "Modeled"
  - THEN `parts` list and `combine_mode` selector MUST appear

- [ ] **Test: Kind selection (None)**
  - GIVEN `DamageForm` with existing parts
  - WHEN user selects "None"
  - THEN `parts` list and `combine_mode` selector MUST be hidden
  - AND output MUST be `{kind: "none"}` (parts cleared or ignored)

- [ ] **Test: Add Damage Part**
  - GIVEN `DamageForm` in Modeled mode
  - WHEN user clicks "Add Part"
  - THEN a new `DamagePart` sub-form MUST appear
  - AND it MUST have default values (e.g. 1d6 bludgeoning)
  - AND it MUST have a unique, stable ID assigned immediately.

- [ ] **Test: Dice Pool editing**
  - GIVEN a `DamagePart`
  - WHEN user changes dice count or sides
  - THEN the changes MUST be reflected in the output object

#### AreaForm
- [ ] **Test: Kind selection**
  - GIVEN `AreaForm`
  - WHEN user selects "Cone"
  - THEN `length` and `shape_unit` inputs MUST appear

- [ ] **Test: Dynamic Inputs**
  - GIVEN `AreaForm` with Kind="Cylinder"
  - THEN `radius`, `height`, and `shape_unit` inputs MUST be visible

#### SavingThrowInput
- [ ] **Test: Kind serialization (SavingThrowSpec)**
  - GIVEN `SavingThrowInput`
  - WHEN user selects "None"
  - THEN output MUST be `{kind: "none"}`

- [ ] **Test: Single save sub-form**
  - GIVEN `SavingThrowInput`
  - WHEN user selects "Single"
  - THEN SingleSave sub-form MUST appear (save_type, applies_to, on_success, on_failure)
  - AND output MUST include `single` with valid SingleSave structure when filled

- [ ] **Test: Multiple saves**
  - GIVEN `SavingThrowInput`
  - WHEN user selects "Multiple"
  - THEN list of SingleSave sub-forms MUST appear with add/remove
  - AND output MUST include `multiple` array of SingleSave

- [ ] **Test: DM adjudicated**
  - GIVEN `SavingThrowInput`
  - WHEN user selects "DM Adjudicated"
  - THEN dm_guidance text area MUST appear
  - AND output MUST include `kind: "dm_adjudicated"` and `dm_guidance`

#### MagicResistanceInput
- [ ] **Test: Applies To selection visibility**
  - GIVEN `MagicResistanceInput`
  - WHEN kind is "unknown"
  - THEN `applies_to` selector MUST be hidden or disabled
  - WHEN kind is "normal"
  - THEN `applies_to` selector MUST be visible.
  - AND the UI label "Beneficial Effects Only" MUST map to the schema value `beneficial_effects_only`

- [ ] **Test: Partial sub-form**
  - GIVEN `MagicResistanceInput`
  - WHEN user selects kind = "partial"
  - THEN sub-form for `partial` MUST appear (scope required, optional part_ids)
  - AND output MUST include `partial: { scope, part_ids? }` when filled

- [ ] **Test: Special rule field**
  - GIVEN `MagicResistanceInput`
  - WHEN user selects kind = "special"
  - THEN `special_rule` field MUST appear (optional text)
  - AND output MUST include `special_rule` when provided

#### AreaForm (scalar per-level)
- [ ] **Test: AreaForm scalar with per_level**
  - GIVEN `AreaForm` with kind = "radius_circle"
  - WHEN user sets radius to mode = "per_level", value = 5, per_level = 2, shape_unit = "ft"
  - THEN output MUST include radius scalar `{ mode: "per_level", value: 5, per_level: 2 }` and shape_unit "ft"

**Note:** Other Duration kinds (`instant`, `permanent`, `conditional`, `usage_limited`, etc.) and Area kinds (`point`, `special`, `region`, `scope`, etc.) are covered by schema validation and manual QA. Add targeted tests if gaps emerge.
