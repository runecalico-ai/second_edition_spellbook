## MODIFIED Requirements

### Requirement: Structured Field Editing
The Spell Editor MUST provide dedicated input components for structured spell data.

#### Scenario: StructuredFieldInput Integration
- GIVEN the Spell Editor form
- WHEN editing Range, Duration, or Casting Time
- THEN the editor MUST render a `StructuredFieldInput` component with a `fieldType` (range | duration | casting_time)
- AND the component MUST emit the **schema-native shape** for that type:
  - **range** → RangeSpec (per `#/$defs/RangeSpec`, e.g. `kind`, `unit`, `distance: { mode, value, per_level }` where applicable)
  - **duration** → DurationSpec (per `#/$defs/DurationSpec`, e.g. `kind`, `unit`, `duration` scalar where applicable, `text`)
  - **casting_time** → flat object (`base_value`, `per_level`, `level_divisor`, `unit`, `text`)
- AND the component MUST be internally modular, using a common scalar/unit input foundation but providing distinct layout or kind-selection logic for each `fieldType`.
- AND the component MUST initialize with a valid default state when created empty:
  - **Range**: `kind: "distance"`, `unit: "ft"`, `distance: { mode: "fixed", value: 0 }`
  - **Duration**: `kind: "instant"` (simplest valid state)
  - **Casting Time**: `base_value: 1`, `unit: "segment"`, `text: "1 segment"` (default for 2nd Edition; 'action' is no longer valid)
- AND the component MUST display a computed text preview in real-time.

**Default Values Clarification:**
- **UI defaults** (editor initialization): Use user-friendly defaults optimized for UX (e.g. casting_time uses `unit: "segment"` for clarity).
- **Canonical materialization defaults** (backend storage): Use schema-defined defaults when fields are omitted (e.g. casting_time uses `unit: "segment"` when unit is omitted per schema).
- **User clears field**: When user explicitly clears/deletes a field value in the editor, treat as empty state and reinitialize with UI defaults.
- **Field omitted from canonical_data**: When field is missing from `canonical_data` (undefined), initialize with UI defaults.

**Text Preview Computation:**
- **Frontend computation**: The editor component computes `.text` in real-time for preview display as the user types, and binds it to the corresponding `.text` output fields for Area and Duration.
- **Backend computation**: The backend computes `.text` during canonical serialization when saving (authoritative source of truth for storage).
- **Consistency**: Both frontend and backend MUST produce the same `.text` value for identical input. The backend computation is authoritative.

#### UI mapping to schema shapes
- **Scalar shape**: Dimension and scalar fields use the schema scalar shape `{ mode: "fixed" | "per_level", value?, per_level?, ... }` per `#/$defs/scalar` in spell.schema.json.
- **Range** (full support for all RangeSpec kinds): Distance-based kinds → kind + scalar + unit; Kind-only kinds → kind selector only; **Special** → kind + `raw_legacy_value` text field (manually editable only when Special).
- **Duration** (full support for all DurationSpec kinds): instant/permanent/until_dispelled/concentration → kind only; time → kind + unit + duration scalar; conditional/until_triggered/planar → kind + condition text; usage_limited → kind + uses scalar; special → kind + `raw_legacy_value` (manually editable only when Special).
- **Casting time**: The UI maps 1:1 to the flat casting_time object (base_value, per_level, level_divisor, unit, text).
