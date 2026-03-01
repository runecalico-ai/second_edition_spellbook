## MODIFIED Requirements

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
