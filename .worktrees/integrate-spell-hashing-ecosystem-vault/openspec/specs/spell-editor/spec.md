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
- AND the component MUST emit the **schema-native shape** for that type, using **camelCase field names** as defined in the TypeScript interfaces (IPC layer standard — see Casing Note below):
  - **range** → `RangeSpec` (per `#/$defs/RangeSpec`): `kind`, `unit`, `distance: { mode, value, perLevel }` where applicable, `text`
  - **duration** → `DurationSpec` (per `#/$defs/DurationSpec`): `kind`, `unit`, `duration` scalar where applicable, `text` *(new field introduced by this change — not present in existing schema or TypeScript types before implementation)*
  - **casting_time** → `SpellCastingTime`: `baseValue`, `perLevel`, `levelDivisor`, `unit`, `text`
- AND the component MUST be internally modular, using `ScalarInput` as the shared scalar/unit input primitive but providing distinct layout and kind-selection logic for each `fieldType`.
- AND the component MUST initialize with a valid default state when created empty:
  - **Range**: `kind: "distance"`, `unit: "ft"`, `distance: { mode: "fixed", value: 0 }`
  - **Duration**: `kind: "instant"` (simplest valid state)
  - **Casting Time**: `baseValue: 1`, `unit: "segment"`, `text: "1 segment"`
    - `"action"`, `"bonus_action"`, and `"reaction"` are **not valid 2nd Edition units** and MUST be removed from the `CastingTimeUnit` type, the `CASTING_TIME_UNIT_LABELS` map, and the `defaultCastingTime()` factory in `src/types/spell.ts`.
- AND the component MUST display a computed text preview in real-time.
- AND when the user changes a `kind` that makes previously-visible sub-fields irrelevant, those sub-fields MUST be cleared from the emitted value (not merely hidden in the UI) — see Kind Transition Behaviour below.

> **Casing Note:** Schema JSON and canonical storage use `snake_case` (e.g. `base_value`, `per_level`, `level_divisor`). The React component layer operates exclusively in `camelCase` (e.g. `baseValue`, `perLevel`, `levelDivisor`) per the IPC casing standard. The `onChange` handler MUST always emit camelCase values. Conversion to `snake_case` happens at the IPC/serialization boundary, not within the component.

---

**Default Values Clarification:**
- **UI defaults** (editor initialization): Use user-friendly defaults optimized for UX (e.g. casting_time uses `unit: "segment"` for clarity).
- **Canonical materialization defaults** (backend storage): Use schema-defined defaults when fields are omitted (e.g. casting_time uses `unit: "segment"` when unit is omitted per schema).
- **User clears field**: When user explicitly clears/deletes a field value in the editor, treat as empty state and reinitialize with UI defaults. For numeric inputs this means an empty or non-parseable string is treated as `0`, **not** as a signal to reinitialize with the default (e.g. clearing `baseValue` yields `0`, not `1`). Full reinitialization only occurs when the entire field object is `undefined` or `null` on prop load.
- **Field omitted from canonical_data**: When field is missing from `canonical_data` (undefined), initialize with UI defaults.

---

**Text Preview Computation:**
- **Frontend computation**: The editor component computes `.text` in real-time for preview display as the user types, and writes the computed value to the `.text` field of the emitted value for **all three field types** (Range, Duration, and Casting Time). This ensures the `onChange` payload always contains an up-to-date `.text` regardless of field type.
- **Backend computation**: The backend computes `.text` during canonical serialization when saving (authoritative source of truth for storage).
- **Consistency**: Both frontend and backend MUST produce the same `.text` value for identical input. The backend computation is authoritative.
- **Kind-change staleness**: When the user switches `kind`, the emitted `.text` MUST reflect the new kind's computed preview immediately. Stale text from the previous kind MUST NOT be retained in the emitted value. Example: switching `duration.kind` from `"time"` (text: `"3 round"`) to `"instant"` MUST emit `text: "Instant"`. (`durationToText` produces bare unit strings — `"3 round"`, not `"3 rounds"`.)

---

**Kind Transition Behaviour:**

When a `kind` selector changes, the component MUST clear sub-fields that are not relevant to the new kind from the emitted value. Preserved sub-fields (e.g. `notes`) persist across kind changes. The rules per field type are:

**Range:**
| New kind | `distance` | `unit` | `rawLegacyValue` |
|---|---|---|---|
| `distance` / `distance_los` / `distance_loe` | Initialize to `{ mode: "fixed", value: 0 }` if absent | Initialize to `"ft"` if absent | Clear |
| Any kind-only (personal, touch, etc.) | Clear | Clear | Clear |
| `special` | Clear | Clear | Preserve (user-editable) |

**Duration:**
| New kind | `unit` | `duration` | `condition` | `uses` | `rawLegacyValue` |
|---|---|---|---|---|---|
| `instant` / `permanent` / `until_dispelled` / `concentration` | Clear | Clear | Clear | Clear | Clear |
| `time` | Initialize to `"round"` if absent | Initialize to `{ mode: "fixed", value: 1 }` if absent | Clear | Clear | Clear |
| `conditional` / `until_triggered` / `planar` | Clear | Clear | Initialize to `""` if absent | Clear | Clear |
| `usage_limited` | Clear | Clear | Clear | Initialize to `{ mode: "fixed", value: 1 }` if absent | Clear |
| `special` | Clear | Clear | Clear | Clear | Preserve (user-editable) |

> **Schema note:** The schema's `allOf` constraints for `DurationSpec` are:
> - `instant` / `permanent`: prohibit `unit`, `duration`, and `uses`.
> - `until_dispelled`: prohibit `unit` and `duration` only (`uses` is not prohibited by the schema, but the UI clears it as part of treating `until_dispelled` as kind-only).
> - `conditional` / `until_triggered` / `planar`: require `condition`.
> - `usage_limited`: require `uses`.
  - `concentration`: **no `allOf` constraint at all in the schema.** The UI treats it as kind-only by convention, consistent with `until_dispelled` and the existing `DURATION_KIND_ONLY` constant. *Data-loss note:* A spell with `concentration + unit/duration` sub-fields (valid per schema) would lose those sub-fields when opened in this editor because the kind-only treatment clears them. This is an accepted trade-off — 2e `concentration` spells do not use time-bounded duration sub-fields in practice.

---

#### UI mapping to schema shapes
- **Scalar shape**: Dimension and scalar fields use the TypeScript `SpellScalar` shape (`{ mode: "fixed" | "per_level", value?, perLevel?, ... }` per `#/$defs/scalar`). The shared `ScalarInput` component handles both fixed and per-level modes.
- **Range** (full support for all RangeSpec kinds):
  - Distance-based kinds (`distance`, `distance_los`, `distance_loe`) → kind selector + `ScalarInput` (distance) + unit selector
  - Kind-only kinds (personal, touch, los, loe, sight, hearing, voice, senses, same\_room, same\_structure, same\_dungeon\_level, wilderness, same\_plane, interplanar, anywhere\_on\_plane, domain, unlimited) → kind selector only
  - **Special** → kind selector + `rawLegacyValue` text input (manually editable only when `kind === "special"`)
  - **Notes** (`notes` field): rendered as a textarea for all kinds; persists across kind changes.
  - **Out of scope for this component version**: `anchor`, `region_unit`, and `requires` fields defined in `RangeSpec` are not exposed in the UI. They may be populated by the parser/importer but are not editable here.
- **Duration** (full support for all DurationSpec kinds):
  - `instant` / `permanent` / `until_dispelled` / `concentration` → kind selector only
  - `time` → kind selector + `ScalarInput` (duration) + unit selector
  - `conditional` / `until_triggered` / `planar` → kind selector + condition text input
  - `usage_limited` → kind selector + `ScalarInput` (uses)
  - **Special** → kind selector + `rawLegacyValue` text input (manually editable only when `kind === "special"`)
  - **`text`** *(new field)*: written to `spec.text` in the emitted value for all kinds via real-time computation (see Text Preview Computation above).
  - **Notes** (`notes` field): rendered as a textarea for all kinds; persists across kind changes.
- **Casting time**: Maps 1:1 to the flat `SpellCastingTime` object (`baseValue`, `perLevel`, `levelDivisor`, `unit`, `text`). The `rawLegacyValue` input is shown when `unit === "special"` OR when a pre-existing `rawLegacyValue` is present (e.g. loaded from legacy data with a non-special unit). The schema-required `text` field is always written via `castingTimeToText()` before emitting. *Data supersession note:* When the user changes `unit` (whether from `"special"` to a structured unit or from any non-special unit that happened to carry a pre-existing `rawLegacyValue`), `rawLegacyValue` is cleared and the legacy string is considered superseded by the new structured entry. This one-way transition is intentional — the importer-supplied legacy string is no longer needed once the user takes explicit control of the structured fields.

> **`casting_time.text` is schema-required.** The schema marks `"required": ["text", "unit"]` on the `casting_time` object. The component MUST always emit a non-empty `text`. `DurationSpec.text` and `RangeSpec.text` are optional in the schema; the frontend MUST still populate them via computed preview, but an empty string is valid at save-time if the computed result is empty.

---

**Fields Emitted Per Kind (contract for tests and implementers):**

**Range:**
| Kind | Required output fields | Optional output fields |
|---|---|---|
| `distance` / `distance_los` / `distance_loe` | `kind`, `distance`, `unit` | `notes`, `text`, `rawLegacyValue` (never set by component for non-special) |
| Kind-only (personal, touch, etc.) | `kind` | `notes`, `text` |
| `special` | `kind` | `rawLegacyValue`, `notes`, `text` |

**Duration:**
| Kind | Required output fields | Optional output fields |
|---|---|---|
| `instant` | `kind` | `notes`, `text` |
| `permanent` | `kind` | `notes`, `text` |
| `until_dispelled` | `kind` | `notes`, `text` |
| `concentration` | `kind` | `notes`, `text` |
| `time` | `kind`, `unit`, `duration` | `notes`, `text`, `rawLegacyValue` (never set for non-special) |
| `conditional` / `until_triggered` / `planar` | `kind`, `condition` | `notes`, `text`, `rawLegacyValue` (never set for non-special) |
| `usage_limited` | `kind`, `uses` | `notes`, `text`, `rawLegacyValue` (never set for non-special) |
| `special` | `kind` | `rawLegacyValue`, `notes`, `text` |

---

#### Additional Scenarios

##### Scenario: Kind Transition Clears Irrelevant Sub-fields
- GIVEN a Range component with `kind: "distance"`, `unit: "ft"`, `distance: { mode: "fixed", value: 30 }`
- WHEN the user changes `kind` to `"personal"`
- THEN the emitted value MUST NOT contain `distance` or `unit`
- AND `notes` (if previously set) MUST be preserved in the emitted value

##### Scenario: Duration Kind Transition — Time to Instant
- GIVEN a Duration component with `kind: "time"`, `unit: "round"`, `duration: { mode: "fixed", value: 3 }`, computed `text: "3 round"`
- WHEN the user changes `kind` to `"instant"`
- THEN the emitted value MUST NOT contain `unit` or `duration`
- AND the emitted `text` MUST equal `"Instant"` (not the stale `"3 round"`)

##### Scenario: Duration Kind Transition — Instant to Time
- GIVEN a Duration component with `kind: "instant"`
- WHEN the user changes `kind` to `"time"`
- THEN the emitted value MUST contain `unit: "round"` and `duration: { mode: "fixed", value: 1 }` (initialized defaults)

##### Scenario: Duration Kind Transition — Any to Special
- GIVEN a Duration component with any `kind` and any sub-fields set
- WHEN the user changes `kind` to `"special"`
- THEN `unit`, `duration`, `condition`, and `uses` MUST be cleared from the emitted value
- AND `rawLegacyValue` MUST be preserved if previously entered, or empty otherwise

##### Scenario: Casting Time Unit Switches to Special
- GIVEN a Casting Time component with `unit: "segment"`, `baseValue: 3`
- WHEN the user changes `unit` to `"special"`
- THEN the `rawLegacyValue` input MUST become visible
- AND `rawLegacyValue` MUST NOT be cleared if already populated

##### Scenario: Casting Time Unit Switches Away from Special
- GIVEN a Casting Time component with `unit: "special"`, `rawLegacyValue: "varies"`, `baseValue: 1`
- WHEN the user changes `unit` to `"segment"`
- THEN `rawLegacyValue` MUST be cleared from the emitted value
- AND the `rawLegacyValue` input MUST no longer be visible
- AND `.text` MUST be recomputed from `baseValue` and the new `unit` via `castingTimeToText()` (e.g., `"1 segment"`). Since `casting_time.text` is schema-required, the component MUST always emit a non-empty `.text` after this transition.

##### Scenario: Usage-Limited Duration Round-Trip
- GIVEN a Duration component with `kind: "usage_limited"` and `uses: { mode: "fixed", value: 2 }`
- WHEN the user changes `kind` to `"instant"` and then back to `"usage_limited"`
- THEN the `uses` scalar MUST be reinitialized to `{ mode: "fixed", value: 1 }` (not restored from the prior value — it was cleared on the first kind transition)

### Requirement: Spell Editor Data Loading
The Spell Editor MUST handle loading spell data from multiple sources with graceful fallbacks.

#### Scenario: Canonical Data Loading
- GIVEN a spell with `canonical_data` column populated
- WHEN opening the spell in the editor
- THEN the editor MUST load structured values from `canonical_data`
- AND populate all structured input components with those values (`StructuredFieldInput` for Range, Duration, and Casting Time; `SavingThrowInput` and `MagicResistanceInput` for their respective fields).

#### Scenario: Hybrid canonical_data (partial)
- GIVEN a spell where `canonical_data` exists (is not null)
- BUT a specific key (e.g. "range", "duration") is **absent or explicitly `null`** in the JSON object
- AND a legacy string exists for that field (e.g. from flat columns), OR no data exists for that field at all
- WHEN opening the spell in the editor
- THEN the editor MUST parse that field via the Tauri parser commands and merge the parsed structured value into the editor state for that field.
- AND for `savingThrow` and `magicResistance` keys absent or `null` in `canonical_data`, the editor MUST apply the same fallback mapping used in the Legacy String Parsing scenario (no parser command; map legacy text to structured state).
- AND if any parsed field falls back to `kind: "special"`, the warning banner MUST be displayed (same rules as Legacy String Parsing).
- AND while parser invocations are in flight, the editor MUST render the form in a loading/disabled state until all pending parser calls resolve.

**Hybrid Loading Logic Details:**
- **`canonical_data` exists**: JSON.parse succeeds and result is an object (not null). This includes empty objects `{}`.
- **Missing field**: Field is absent or explicitly `null`. The canonical check MUST be: `canonicalData[field] == null` (loose equality), which covers both `undefined` (key absent) and `null` (key present with null value) in a single expression. Do NOT use strict `=== undefined` or the `in` operator separately — the loose equality check is the prescribed pattern to avoid subtle divergence.
- **Empty object `{}`**: All fields are missing per the above check; parse all legacy strings for all fields that have legacy string values.
- **No legacy string available**: If a field is missing from `canonical_data` AND no legacy string exists for it, initialize the field to its UI default state. See `spell-editor-structured-fields` for the authoritative UI-defaults contract per field type.
- **Parallel parsing**: When multiple fields require parser commands simultaneously, all invocations MUST be dispatched in parallel (`Promise.all`). Sequential dispatch is not acceptable.
- **savingThrow / magicResistance**: `canonicalData.savingThrow` and `canonicalData.magicResistance` are checked with the same `== null` predicate. When absent/null, apply fallback mapping from legacy text; do not invoke a parser command.

#### Scenario: Legacy String Parsing
- GIVEN a spell with null `canonical_data` and legacy string values
- WHEN opening the spell in the editor
- THEN the editor MUST call Tauri backend parser commands. Command names use `parse_spell_*` prefix: `parse_spell_range`, `parse_spell_duration`, `parse_spell_casting_time`, `parse_spell_area`, `parse_spell_damage`, and `parse_spell_components` when a legacy component string is present (i.e. a non-empty legacy component column value exists rather than structured `components.*` boolean flags). These commands wrap `SpellParser` in `src-tauri/src/utils/spell_parser.rs`. Each accepts a legacy string and returns the schema-native structured type.
- AND all parser invocations MUST be dispatched in parallel (`Promise.all`). Sequential dispatch is not acceptable.
- AND while parser invocations are in flight, the editor MUST render the form in a loading/disabled state until all pending parser calls resolve.
- AND if a Tauri invocation itself fails (IPC error, command not found, serialization error), the affected field MUST be treated as a parser failure and handled as follows — log the error in all cases:
  - **Fields with `kind: "special"`** (`RangeSpec`, `DurationSpec`, `AreaSpec`, `MagicResistanceSpec`): initialize to `kind: "special"` with the original legacy string in `raw_legacy_value`; include the field in the warning banner.
  - **`casting_time`** (no `kind` field; uses `unit: "special"`): initialize to `unit: "special"` with the original legacy string in `raw_legacy_value`; include in the warning banner.
  - **`SpellDamageSpec`** (kinds: `"none"`, `"modeled"`, `"dm_adjudicated"` — no `"special"` kind): initialize to `kind: "none"`, preserve the original legacy string in `source_text`. This does NOT trigger the warning banner since damage has no `kind: "special"` fallback.
- AND `savingThrow` and `magicResistance` are handled without parser commands: when `canonical_data` is missing for those fields, the editor MUST use fallback mapping from legacy text to structured state. The fallback mapping for `savingThrow` resolves common 2e strings (e.g. "Save vs. Spell", "Save vs. Rod") to `save_type` + `save_vs` pairs per the AD&D 2e saving throw matrix; for `magicResistance`, the legacy value may be a percentage string (e.g. "20%"), "Yes", "No", or a descriptive string — map to the structured `MagicResistanceSpec` kind accordingly.
- AND populate structured inputs with parsed values. If a field has no legacy string AND no `canonical_data` value, initialize it to its UI default (see `spell-editor-structured-fields`).
- AND display a warning banner if any field's parsing fell back to `kind: "special"`. The banner MUST appear as a single banner at the top of the form, listing the fields that fell back to special (e.g. "Range and Duration could not be fully parsed; original text preserved"). Note: `raw_legacy_value` is unconditionally preserved for all kinds, but acts as the primary user-editable display text when kind is "special".

**Warning Banner UX Details:**
- **Placement**: Banner at the very top of the form, above all field inputs and labels.
- **Dismissibility**: Banner is **non-dismissible** - user must either fix the data or accept the `kind: "special"` fallback by saving the spell.
- **Persistence**: Banner persists until user edits affected field(s) to valid non-special values, or the spell is saved with `kind: 'special'` still active. The banner tracks active special-fallback fields individually: after a successful save, each field that is no longer `kind: 'special'` (because the user fixed it before saving) is removed from the banner independently. Fields that are saved with `kind: 'special'` still active are also dismissed from the banner — the fallback value is now durably stored and no unsaved changes remain for that field. The banner is fully dismissed only when no fields remain listed. After a failed save, the banner persists unchanged for all listed fields.
- **Navigation guard**: This guard is a *specialized extension* of the general unsaved-changes guard. If the user attempts to navigate away while the warning banner is active AND the form has unsaved changes, the editor MUST show a confirmation dialog (e.g. "You have unparsed fields. Navigating away will discard your current editor state. Continue?"). If the form has no unsaved changes (i.e. the spell was loaded with special fallbacks but the user made no edits), navigation away is permitted without a prompt — the original data in the database is unchanged. If a general unsaved-changes guard already exists in the editor, this scenario MUST be handled within that same guard rather than as a separate interceptor.

**Casing Standards for IPC and Storage:**
- **Parser commands** return structured types using **`camelCase`** field names for IPC (via `#[serde(rename_all = "camelCase")]` on backend structs).
- **Frontend state** MUST use `camelCase` to match IPC return values.
- **Canonical storage** (`canonical_data` column) uses **`snake_case`** per the canonical serialization spec.
- **Reading from `canonical_data`**: The stored JSON blob uses `snake_case` keys. When loading into frontend state, the editor MUST convert keys from `snake_case` to `camelCase` (e.g. `raw_legacy_value` → `rawLegacyValue`, `save_type` → `saveType`). This conversion MUST be applied consistently; do not access `canonical_data` fields by their `snake_case` key names directly in React component state.
- **Conversion** from camelCase (frontend/IPC) to snake_case (canonical storage) happens when building `CanonicalSpell` for persistence.

**Parser fallbacks:** SpellParser returns schema-valid structured types and ALWAYS unconditionally preserves the original source string. For `RangeSpec`, `DurationSpec`, `AreaSpec`, `SavingThrowSpec`, and `casting_time`, this is stored in `raw_legacy_value` (hashed content). For `SpellDamageSpec`, this is stored in `source_text` (non-hashed metadata). On parse failure, the parser returns fallbacks such as `kind: "special"` where the preserved string is presented to the user. The UI MUST handle parser errors defensively (show error, fall back to kind=special with the original string). Invalid parser output MUST be validated by the frontend using a type guard or schema validator (e.g. Zod) against the expected structured type; if validation fails, treat as a parser failure and include the field in the warning banner.

**v1-Shaped `canonical_data` Compatibility:**

The backend's `migrate_to_v2()` runs lazily on `normalize()` (i.e., on save). Until a spell is re-saved, its `canonical_data` column may still contain schema version 1 JSON with the following v1-only shapes:
- `SavingThrowSpec` may contain a `dm_guidance` field (deleted in v2).
- `SpellDamageSpec` may contain `raw_legacy_value` (renamed to `source_text` in v2).

The frontend MUST tolerate these v1-shaped fields without crashing or data loss:
- `dm_guidance` read from `canonical_data`: MUST be remapped to `notes` client-side before populating editor state. If `notes` is already non-empty, append `dm_guidance` content after a newline (matching the backend migration logic). Do NOT bind UI components directly to `dm_guidance`.
- `SpellDamageSpec.raw_legacy_value` read from `canonical_data`: MUST be treated as `source_text` (display as the original source annotation). Do NOT leave the field unread or treat it as an unknown field.
- `SpellDamageSpec.source_text` and `SpellDamageSpec.raw_legacy_value` both present: prefer `source_text` (post-migration value); discard `raw_legacy_value`.

*Implementation guidance:* A lightweight client-side normalization function that maps v1 → v2 field names on the parsed `canonical_data` object before dispatching to editor state is the cleanest approach. This function runs once on load and handles both migrated (v2) and un-migrated (v1) spells transparently.

**Save path:** On save, the editor MUST always produce v2-shaped `canonical_data` (no `dm_guidance` on SavingThrowSpec, `source_text` on SpellDamageSpec). Backend `normalize()` and `migrate_to_v2()` remain authoritative for persisted data; any code path that serializes editor state to `canonical_data` must emit the v2 shape.

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
- AND if Modeled, allow adding multiple damage parts. Each DamagePart MUST satisfy schema required fields (id, damage_type, base, application, save). When adding a new part, the UI MUST initialize `application` to `{ scope: "per_target" }` and `save` to `{ kind: "none" }` as schema-compliant defaults.
- AND each DamagePart MUST be assigned a stable, unique ID upon creation matching schema pattern `^[a-z][a-z0-9_]{0,31}$`. Use the pattern: `part_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`. IDs MUST be assigned immediately upon part creation. No runtime uniqueness verification is required — the combined timestamp + 7-character base-36 suffix provides sufficient entropy for human-edited spells with a small number of parts.
- AND allow configuring damage type, dice pool, and scaling for each part.
- AND for `"modeled"` kind, a `notes` text area MUST also be provided (schema `allOf` requires either `parts` or `notes` for this kind; notes supports text-only modeled descriptions when no parts are defined).
- AND if kind is `"dm_adjudicated"`, the form MUST show a `dm_guidance` text area (required by schema `allOf` conditional for this kind) and an optional `notes` text area. No damage parts sub-form is shown.
- AND if kind is `"none"`, no damage parts sub-form or `dm_guidance` field is shown.
- AND if `source_text` is populated (the original legacy string preserved by the importer, excluded from the canonical hash), the form MUST display it as a read-only labelled annotation (e.g., "Original source text") for all kinds. It MUST NOT be editable by the user.

#### Scenario: Area Editing
- GIVEN the Spell Editor form
- WHEN editing Area
- THEN the editor MUST render an `AreaForm`
- AND allow selecting kind (Cone, Cube, Sphere, etc.)
- AND allow entering specific scalars (radius, length, etc.) based on kind. Geometric dimensions use `shape_unit` per `#/$defs/AreaSpec`; surface/volume kinds use the scalar plus `unit`.
- AND when kind is NOT "special", the form MUST bind to the `.text` property of the `AreaSpec` for the computed canonical text preview (read-only or auto-recomputed).
- AND when kind IS "special", the user-editable field MUST be `raw_legacy_value` (consistent with Range and Duration special handling). The `.text` property is NOT directly edited by the user in this case; it MUST be derived from `raw_legacy_value` when `raw_legacy_value` is non-empty (the same text, before normalization is applied on save), or set to `None` when `raw_legacy_value` is empty/absent. Do NOT emit an empty string for `.text` when there is nothing to derive from — `AreaSpec.text` is optional in the schema, so `None` is correct for the no-input state. See `spell-editor-structured-fields` for the real-time `.text` preview computation contract.

#### Pattern: Enum selector + optional custom/special field
For fields whose schema has a kind/enum and optional custom or special content (e.g. notes, or a manually editable `raw_legacy_value` when kind is special), the editor MUST provide an enum-based selector for kind/options plus an optional custom or special field when the schema allows. SavingThrowInput and MagicResistanceInput follow this pattern.

#### Scenario: Saving Throw and MR Editing
- GIVEN the Spell Editor form
- WHEN editing Saving Throw
- THEN the editor MUST render `SavingThrowInput` per `#/$defs/SavingThrowSpec` (kind: none, single, multiple, dm_adjudicated)
- AND when kind is `"single"` or `"multiple"`, MUST show SingleSave sub-form(s) (save_type, save_vs, applies_to, on_success, on_failure). `save_type` selects the saving throw matrix *category* (e.g. `"paralyzation_poison_death"`, `"rod_staff_wand"`); `save_vs` selects the *specific effect* being saved against (e.g. `"spell"`, `"poison"`, `"death_magic"`). Both MUST be rendered as enum selectors.
- AND when kind is `"dm_adjudicated"`, no SingleSave sub-form is shown. The `notes` field (the sole narrative field after `dm_guidance` removal) MUST be surfaced as an editable text area.
- AND when kind is `"none"`, no sub-form or additional fields are shown.
- AND for all kinds: if `raw_legacy_value` is populated (new field — stored unconditionally per Decision 1), it MUST be shown as a read-only labelled annotation. The `notes` field (top-level on `SavingThrowSpec`, not scoped to any single kind) MUST be available as an editable text area for all kinds.
- WHEN editing Magic Resistance
- THEN the editor MUST render specific enum-based inputs (not generic strings)
- AND the `applies_to` enum selector MUST be displayed for all kinds EXCEPT `unknown`. When kind is `unknown`, the `applies_to` selector MUST be hidden or disabled as it is not applicable per schema logic.
- AND a `notes` text area MUST be shown for all kinds (it is optional per schema and applies across all MR kinds).
- AND if `source_text` is populated (the original legacy descriptor preserved by the importer, excluded from the canonical hash), it MUST be displayed as a read-only labelled annotation. It MUST NOT be editable by the user.
- UI labels MUST map to schema enum values: `whole_spell` → "Whole Spell"; `harmful_effects_only` → "Harmful Effects Only"; `beneficial_effects_only` → "Beneficial Effects Only"; `dm` → "DM Discretion".

#### Scenario: Magic Resistance partial and special
- GIVEN the Spell Editor form and Magic Resistance is being edited
- WHEN kind is "partial"
- THEN the editor MUST show the `applies_to` selector AND a sub-form for `#/$defs/MagicResistanceSpec`.partial: scope (required enum: `damage_only`, `non_damage_only`, `primary_effect_only`, `secondary_effects_only`, `by_part_id`) and optional part_ids (array of strings referencing `DamagePart.id` values from the spell's damage model — only applicable when scope is `by_part_id`). If scope is `by_part_id` and the spell's `damage.kind` is not `"modeled"` (i.e., no `DamagePart` entries exist), the part_ids picker MUST be disabled and MUST display an informational message (e.g., "No modeled damage parts available — set Damage to Modeled first").
- WHEN kind is "special"
- THEN the editor MUST show the `applies_to` selector AND a field for special_rule (optional text, per schema).
