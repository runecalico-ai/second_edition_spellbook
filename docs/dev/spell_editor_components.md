# Spell Editor Structured Components – Developer Guide

## Overview

The spell editor uses a set of controlled React components that emit **schema-native shapes** (matching `spell.schema.json` / `apps/desktop/src/types/spell.ts`). The parent (e.g. `SpellEditor`) owns state and passes `value` + `onChange`; components are stateless with respect to the spell data.

**Location:** `apps/desktop/src/ui/components/structured/`

**Canon-first Details block:** The Spell Editor’s default view for the Details section is **canon-first**: one row per field (Range, Components, Duration, Casting Time, Area of Effect, Saving Throw, Damage, Magic Resistance, and optionally Material Component) with a label, single-line text input, and an expand control. Structured components (`StructuredFieldInput`, `AreaForm`, `DamageForm`, etc.) are **not** rendered until the user expands that field. Data flow: on load, the form is populated with flat text; on expand, the editor uses `canonical_data` for that field if present, otherwise parses via Tauri command; on collapse, the canon line is serialized from the structured value **only when the field is dirty** (user edited the structured form).

**Exports (from `index.ts`):**

- `StructuredFieldInput`, `rangeToText`, `durationToText`, `castingTimeToText`
- `ScalarInput`
- `DamageForm`, `AreaForm`, `SavingThrowInput`, `MagicResistanceInput`, `ComponentCheckboxes`

## Validation Helper Contract

Spell-editor validation lives in `apps/desktop/src/ui/spellEditorValidation.ts` and is treated as a shared contract, not an implementation detail.

- `deriveSpellEditorFieldErrors(input)` is pure and side-effect free. It accepts the flat form, the current tradition, and the in-scope structured specs, then returns `SpellEditorFieldError[]`.
- `SpellEditorFieldError` must preserve the exact `field`, `testId`, `message`, and `focusTarget` values used by the live editor.
- `sortFieldErrorsByFocusOrder(errors)` and `getFirstInvalidFocusTarget(errors)` define the first-invalid focus path used after a failed save.
- Stable error `data-testid` values include `spell-name-error`, `error-school-required-arcane`, `error-school-required-arcane-tradition`, `error-sphere-required-divine`, `error-sphere-required-divine-tradition`, `error-epic-arcane-class-restriction`, and `error-tradition-conflict`.
- When a field can show an inline error, the field owns the `id`, `aria-invalid`, and `aria-describedby` wiring to the matching error element. Do not move these errors into a detached summary block or replace them with a toast.

---

## Component API

### `StructuredFieldInput`

Single component for **Range**, **Duration**, and **Casting time**; behaviour depends on `fieldType`.

**Props:**

| Prop       | Type                                                                 | Description |
|-----------|----------------------------------------------------------------------|-------------|
| `fieldType` | `"range" \| "duration" \| "casting_time"`                           | Which field to render. |
| `value`     | `RangeSpec \| DurationSpec \| SpellCastingTime \| null \| undefined` | Current value; `null`/`undefined` use internal defaults. |
| `onChange`  | `(v: StructuredFieldValue) => void`                                  | Called with the full spec on any change. |

**Emitted shapes:**

- **range** → `RangeSpec` (e.g. `kind`, `unit`, `distance: { mode, value, perLevel }`, `rawLegacyValue`).
- **duration** → `DurationSpec` (e.g. `kind`, `unit`, `duration`, `condition`, `uses`, `rawLegacyValue`).
- **casting_time** → `SpellCastingTime` (e.g. `text`, `unit`, `baseValue`, `perLevel`, `levelDivisor`, `rawLegacyValue`).

**Exported helpers (for serialization / display):**

- `rangeToText(spec: RangeSpec): string`
- `durationToText(spec: DurationSpec): string`
- `castingTimeToText(spec: SpellCastingTime): string`

**Event Signatures:**

```typescript
// onChange is called whenever any field changes (kind, value, unit, etc.)
onChange: (v: StructuredFieldValue) => void

// StructuredFieldValue is a union type:
type StructuredFieldValue = RangeSpec | DurationSpec | SpellCastingTime

// The type depends on fieldType:
// - fieldType="range" → onChange receives RangeSpec
// - fieldType="duration" → onChange receives DurationSpec
// - fieldType="casting_time" → onChange receives SpellCastingTime
```

**Example Usage:**

```typescript
import { StructuredFieldInput, rangeToText, durationToText, castingTimeToText } from "./components/structured";
import type { RangeSpec, DurationSpec, SpellCastingTime } from "../types/spell";

function SpellEditor() {
  const [structuredRange, setStructuredRange] = useState<RangeSpec | null>(null);
  const [structuredDuration, setStructuredDuration] = useState<DurationSpec | null>(null);
  const [structuredCastingTime, setStructuredCastingTime] = useState<SpellCastingTime | null>(null);

  return (
    <>
      {/* Range field */}
      <StructuredFieldInput
        fieldType="range"
        value={structuredRange ?? undefined}
        onChange={(spec) => {
          const r = spec as RangeSpec;
          setStructuredRange(r);
          // Optionally update legacy string field for backward compatibility
          handleChange("range", rangeToText(r));
        }}
      />

      {/* Duration field */}
      <StructuredFieldInput
        fieldType="duration"
        value={structuredDuration ?? undefined}
        onChange={(spec) => {
          const d = spec as DurationSpec;
          setStructuredDuration(d);
          handleChange("duration", durationToText(d));
        }}
      />

      {/* Casting time field */}
      <StructuredFieldInput
        fieldType="casting_time"
        value={structuredCastingTime ?? undefined}
        onChange={(spec) => {
          const c = spec as SpellCastingTime;
          setStructuredCastingTime(c);
          handleChange("castingTime", castingTimeToText(c));
        }}
      />
    </>
  );
}
```

---

### `ScalarInput`

Shared input for a **scalar** value: fixed number or per-level, with optional `data-testid` overrides.

**Props:**

| Prop             | Type           | Description |
|------------------|----------------|-------------|
| `value`          | `SpellScalar`  | `{ mode: "fixed" \| "per_level", value?, perLevel? }`. |
| `onChange`       | `(s: SpellScalar) => void` | Called when value or mode changes. |
| `data-testid`    | `string`       | Optional; default `"scalar-input"`. |
| `baseValueTestId`| `string`       | Optional; default `"range-base-value"`. |
| `perLevelTestId` | `string`       | Optional; default `"range-per-level"`. |

Used inside `StructuredFieldInput` (range/duration) and `AreaForm` for dimensions. Not typically used directly by the spell editor page.

---

### `AreaForm`

Area of effect: kind selector + kind-specific dimension inputs (scalars + units).

**Props:**

| Prop        | Type                    | Description |
|-------------|-------------------------|-------------|
| `value`     | `AreaSpec \| null \| undefined` | Current area spec. |
| `onChange`  | `(v: AreaSpec) => void`  | Called with the full spec. |

**Behaviour:** Renders kind dropdown; for each kind (e.g. `radius_circle`, `cone`, `rect`) shows the required fields (e.g. `radius`, `length`, `width`, `shape_unit`). Dimensions use `SpellScalar` (fixed or per-level). Kind `special` shows a single `rawLegacyValue` text field.

**Event Signatures:**

```typescript
// onChange is called whenever kind or any dimension field changes
onChange: (v: AreaSpec) => void

// AreaSpec includes:
// - kind: AreaKind (e.g. "point", "radius_circle", "cone", "line", etc.)
// - Dimensions vary by kind (radius, length, width, height, etc.)
// - All dimensions use SpellScalar (mode, value, perLevel)
// - shapeUnit: ShapeUnit for geometric kinds
// - unit: AreaUnit for surface/volume kinds
// - rawLegacyValue?: string for kind="special"
```

**Example Usage:**

```typescript
import { AreaForm } from "./components/structured";
import { areaToText } from "../types/spell";
import type { AreaSpec } from "../types/spell";

function SpellEditor() {
  const [structuredArea, setStructuredArea] = useState<AreaSpec | null>(null);

  return (
    <AreaForm
      value={structuredArea ?? undefined}
      onChange={(spec) => {
        setStructuredArea(spec);
        handleChange("area", areaToText(spec));
      }}
    />
  );
}

// Edge case: Loading from canonical_data
useEffect(() => {
  if (spellData.canonicalData) {
    const canonical = JSON.parse(spellData.canonicalData);
    if (canonical.area) {
      // Normalize snake_case to camelCase if needed
      setStructuredArea(normalizeAreaSpec(canonical.area));
    }
  }
}, [spellData]);
```

Defaults: `value ?? defaultAreaSpec()` from `types/spell`.

---

### `DamageForm`

Damage: kind (none / modeled / dm_adjudicated), and when modeled: parts list + combine mode.

**Props:**

| Prop       | Type                              | Description |
|------------|-----------------------------------|-------------|
| `value`    | `SpellDamageSpec \| null \| undefined` | Current damage spec. |
| `onChange` | `(v: SpellDamageSpec) => void`    | Called with the full spec. |

**Behaviour:** Kind selector; for **modeled**, list of damage parts (each with id, damageType, base dice, application, save) and combine mode (sum, max, choose_one, sequence). New parts get a stable id via `generateDamagePartId()`. For **dm_adjudicated**, a text area for guidance.

**Event Signatures:**

```typescript
// onChange is called whenever kind, parts, combineMode, or dmGuidance changes
onChange: (v: SpellDamageSpec) => void

// SpellDamageSpec includes:
// - kind: "none" | "modeled" | "dm_adjudicated"
// - parts?: DamagePart[] (when kind="modeled")
// - combineMode?: CombineMode (when kind="modeled")
// - dmGuidance?: string (when kind="dm_adjudicated")
// - rawLegacyValue?: string
```

**Example Usage:**

```typescript
import { DamageForm } from "./components/structured";
import { damageToText, defaultSpellDamageSpec } from "../types/spell";
import type { SpellDamageSpec } from "../types/spell";

function SpellEditor() {
  const [structuredDamage, setStructuredDamage] = useState<SpellDamageSpec | null>(null);

  // Initialize with default if null
  useEffect(() => {
    if (!structuredDamage) {
      setStructuredDamage(defaultSpellDamageSpec());
    }
  }, []);

  return (
    <DamageForm
      value={structuredDamage ?? undefined}
      onChange={(spec) => {
        setStructuredDamage(spec);
        handleChange("damage", damageToText(spec));
      }}
    />
  );
}

// Edge case: Adding a new damage part
// The component automatically generates stable IDs via generateDamagePartId()
// Parent doesn't need to manage IDs
```

Defaults: `value ?? defaultSpellDamageSpec()`.

---

### `SavingThrowInput`

Saving throw: kind (none / single / multiple / dm_adjudicated) and sub-forms for single/multiple.

**Props:**

| Prop       | Type                            | Description |
|------------|---------------------------------|-------------|
| `value`    | `SavingThrowSpec \| null \| undefined` | Current spec. |
| `onChange` | `(v: SavingThrowSpec) => void`  | Called with the full spec. |

**Behaviour:** Kind selector; for **single** shows save type, applies-to, on-success, on-failure; for **multiple** a list of single-save entries with add/remove; for **dm_adjudicated** a text area for guidance.

**Event Signatures:**

```typescript
// onChange is called whenever kind, single, multiple, or dmGuidance changes
onChange: (v: SavingThrowSpec) => void

// SavingThrowSpec includes:
// - kind: "none" | "single" | "multiple" | "dm_adjudicated"
// - single?: SingleSave (when kind="single")
// - multiple?: SingleSave[] (when kind="multiple")
// - dmGuidance?: string (when kind="dm_adjudicated")
```

**Example Usage:**

```typescript
import { SavingThrowInput } from "./components/structured";
import { savingThrowToText, defaultSavingThrowSpec } from "../types/spell";
import type { SavingThrowSpec } from "../types/spell";

function SpellEditor() {
  const [structuredSavingThrow, setStructuredSavingThrow] = useState<SavingThrowSpec | null>(null);

  return (
    <SavingThrowInput
      value={structuredSavingThrow ?? undefined}
      onChange={(spec) => {
        setStructuredSavingThrow(spec);
        handleChange("savingThrow", savingThrowToText(spec));
      }}
    />
  );
}

// Edge case: Legacy string parsing
useEffect(() => {
  if (data.savingThrow && !structuredSavingThrow) {
    // Parse legacy string or set as dm_adjudicated
    setStructuredSavingThrow({
      kind: "dm_adjudicated",
      dmGuidance: data.savingThrow,
    });
  }
}, [data.savingThrow]);
```

Defaults: `value ?? defaultSavingThrowSpec()`.

---

### `MagicResistanceInput`

Magic resistance: kind + optional applies-to and sub-fields.

**Props:**

| Prop       | Type                                  | Description |
|------------|---------------------------------------|-------------|
| `value`    | `MagicResistanceSpec \| null \| undefined` | Current spec. |
| `onChange` | `(v: MagicResistanceSpec) => void`   | Called with the full spec. |

**Behaviour:** Kind selector (unknown, normal, ignores_mr, partial, special). **Applies-to** is hidden when kind is `unknown`. For **partial**, shows scope and optional part_ids; for **special**, shows optional special_rule text.

**Event Signatures:**

```typescript
// onChange is called whenever kind, appliesTo, partial, or specialRule changes
onChange: (v: MagicResistanceSpec) => void

// MagicResistanceSpec includes:
// - kind: "unknown" | "normal" | "ignores_mr" | "partial" | "special"
// - appliesTo?: AppliesTo (hidden when kind="unknown")
// - partial?: PartialMR (when kind="partial")
// - specialRule?: string (when kind="special")
```

**Example Usage:**

```typescript
import { MagicResistanceInput } from "./components/structured";
import { magicResistanceToText, defaultMagicResistanceSpec } from "../types/spell";
import type { MagicResistanceSpec } from "../types/spell";

function SpellEditor() {
  const [structuredMagicResistance, setStructuredMagicResistance] = useState<MagicResistanceSpec | null>(null);

  return (
    <MagicResistanceInput
      value={structuredMagicResistance ?? undefined}
      onChange={(spec) => {
        setStructuredMagicResistance(spec);
        handleChange("magicResistance", magicResistanceToText(spec));
      }}
    />
  );
}

// Edge case: appliesTo is automatically hidden when kind="unknown"
// Component handles this internally, no parent logic needed
```

Defaults: `value ?? defaultMagicResistanceSpec()`.

---

### `ComponentCheckboxes`

Verbal, Somatic, Material checkboxes + material component sub-form.

**Props:**

| Prop                     | Type                                                                 | Description |
|--------------------------|----------------------------------------------------------------------|-------------|
| `components`             | `SpellComponents \| null \| undefined`                               | `{ verbal, somatic, material }`. |
| `materialComponents`      | `MaterialComponentSpec[] \| null \| undefined`                       | List of material entries (name, quantity, gpValue, isConsumed, description, unit). |
| `onChange`               | `(components: SpellComponents, materialComponents: MaterialComponentSpec[]) => void` | Called when V/S/M or material list changes. |
| `onUncheckMaterialConfirm` | `() => Promise<boolean>` (optional)                               | If provided, called when user unchecks Material while materials exist; return `true` to clear. |

**Event Signatures:**

```typescript
// onChange is called when V/S/M checkboxes change OR material list changes
onChange: (
  components: SpellComponents,
  materialComponents: MaterialComponentSpec[]
) => void

// SpellComponents: { verbal: boolean, somatic: boolean, material: boolean }
// MaterialComponentSpec: { name: string, quantity?: number, gpValue?: number,
//                           isConsumed?: boolean, description?: string, unit?: string }

// onUncheckMaterialConfirm (optional): Called when Material checkbox is unchecked
// and materialComponents array is non-empty
onUncheckMaterialConfirm?: () => Promise<boolean>
// Return true to clear materials, false to cancel uncheck
```

**Example Usage:**

```typescript
import { ComponentCheckboxes } from "./components/structured";
import { componentsToText } from "../types/spell";
import type { SpellComponents, MaterialComponentSpec } from "../types/spell";
import { useModal } from "../store/useModal";

function SpellEditor() {
  const { confirm: modalConfirm } = useModal();
  const [structuredComponents, setStructuredComponents] = useState<SpellComponents | null>(null);
  const [structuredMaterialComponents, setStructuredMaterialComponents] = useState<MaterialComponentSpec[]>([]);

  return (
    <ComponentCheckboxes
      components={structuredComponents}
      materialComponents={structuredMaterialComponents}
      onChange={(comp, mats) => {
        setStructuredComponents(comp);
        setStructuredMaterialComponents(mats);
        // Convert to legacy string format for backward compatibility
        const { components: cs, materialComponents: ms } = componentsToText(comp, mats);
        handleChange("components", cs);
        handleChange("materialComponents", ms);
      }}
      onUncheckMaterialConfirm={async () => {
        // Show confirmation dialog before clearing material data
        return await modalConfirm(
          "Clear all material component data?",
          "Uncheck Material"
        );
      }}
    />
  );
}

// Edge case: Material quantity validation
// Component automatically clamps quantity to >= 1.0
// Parent doesn't need to validate quantity values
```

**Behaviour:** Three checkboxes; when Material is checked, shows material list with add/remove. Each material row: name (required), quantity (≥ 1), optional gp value, consumed, description, unit. If user unchecks Material and there are materials, `onUncheckMaterialConfirm` is used (or `window.confirm`) before clearing. Parent is responsible for merging the two outputs into form state.

---

## State management patterns

- **Controlled components:** All structured components are controlled. The parent (e.g. `SpellEditor`) holds state (e.g. `useState<RangeSpec | null>(null)`) and passes `value` and `onChange`.
- **Single source of truth:** Spell data lives in the parent; on load, parent fills state from `canonical_data` or from legacy parsing (`parse_spell_*` commands), then passes values into the components.
- **Serialization:** Parent converts structured state back to text or canonical JSON for save. Use the exported helpers (`rangeToText`, `durationToText`, `castingTimeToText`, plus `areaToText`, `damageToText`, `savingThrowToText`, `magicResistanceToText`, `componentsToText` from `types/spell`) when building the payload.
- **Defaults:** Components use `value ?? defaultX()` internally so `null`/`undefined` is safe; parent can also pre-fill defaults before first render.

---

## Event handling

- **onChange:** Every structured component exposes `onChange(newValue)`. The argument is the full updated spec; parent replaces its state with it. No need for `onBlur` for persistence—parent persists on explicit Save.
- **ComponentCheckboxes:** `onChange(components, materialComponents)` returns both the V/S/M object and the material array; parent merges into its state and may also update flat `form.components` / `form.materialComponents` for display or legacy columns.
- **onUncheckMaterialConfirm:** Optional async callback; used to show a confirmation dialog before clearing material data when Material is unchecked.

---

## Types and validation

- **Types:** All value types live in `apps/desktop/src/types/spell.ts` (e.g. `RangeSpec`, `DurationSpec`, `AreaSpec`, `SpellDamageSpec`, `SpellComponents`, `MaterialComponentSpec`). Use these for props and state.
- **Validation:** Numeric clamping and parsing helpers are in `apps/desktop/src/lib/validation.ts` (`clampScalar`, `parseNumericInput`, etc.). Components use these so stored values stay within schema constraints (e.g. non-negative, optional cap).

---

## E2E and test IDs

All application `data-testid` attributes use **kebab-case** (e.g. `detail-range-input`, `detail-casting-time-expand`, `range-kind-select`). Structured components and the Spell Editor follow this convention for Playwright E2E and Storybook. See `apps/desktop/src/AGENTS.md` (Naming Conventions for `data-testid`) and the change tasks for the full list.

**Canon-first Details block (SpellEditor):** Each canon single-line input and expand control has a stable test ID so E2E and Storybook can target without relying on labels or DOM order.

| Field | Input test ID | Expand test ID |
|-------|----------------|-----------------|
| Range | `detail-range-input` | `detail-range-expand` |
| Components | `detail-components-input` | `detail-components-expand` |
| Duration | `detail-duration-input` | `detail-duration-expand` |
| Casting Time | `detail-casting-time-input` | `detail-casting-time-expand` |
| Area of Effect | `detail-area-input` | `detail-area-expand` |
| Saving Throw | `detail-saving-throw-input` | `detail-saving-throw-expand` |
| Damage | `detail-damage-input` | `detail-damage-expand` |
| Magic Resistance | `detail-magic-resistance-input` | `detail-magic-resistance-expand` |
| Material Component | `detail-material-components-input` | `detail-material-components-expand` |

When a field is expanded and parsing is in progress, a loading state is shown with test ID `detail-{field}-loading` (field in kebab-case, e.g. `detail-duration-loading`). When expanded (and panel mounted), expand buttons use `aria-controls="detail-{field}-panel"`; expanded sections use matching `id` values in kebab-case (e.g. `detail-casting-time-panel`, `detail-saving-throw-panel`). **Note:** multi-word detail keys use **kebab-case** in `data-testid` but may use **camelCase** segments in paired DOM `id`s (e.g. `detail-castingTime-expand` alongside `detail-casting-time-expand`). When the expanded spec is "special" (or another non-canonical kind such as `dm_adjudicated` for Saving Throw), a hint is shown with a **kebab-case** test ID for most detail rows, including `detail-range-special-hint`, `detail-duration-special-hint`, `detail-casting-time-special-hint`, `detail-area-special-hint`, `detail-saving-throw-special-hint`, `detail-damage-special-hint`, and `detail-magic-resistance-special-hint`. The **Components** and **Material Component** rows do **not** render `detail-*-special-hint` test IDs in the current `SpellEditor.tsx` implementation (no collapsed **(special)** marker for those rows today).

**Material Component row:** The Material Component row shares its structured state with the Components field (ComponentCheckboxes + material list). There is no dedicated Tauri parser for material-only; when expanded, the editor reuses the component parsing logic and initializes the material list from `form.materialComponents`. Serialization on collapse uses `componentsToText` to produce both `form.components` and `form.materialComponents`.

**Structured components (visible when expanded):** Examples: `range-kind-select`, `range-base-value`, `duration-kind-select`, `duration-unit`, `area-form-kind`, `damage-form-add-part`, `component-checkbox-material`, `material-component-name`, `spell-editor-special-fallback-banner`.

---

## Common Pitfalls

### 1. Casing Conversion (snake_case ↔ camelCase)

**Problem:** Backend uses `snake_case` for canonical storage, but frontend components use `camelCase` for IPC.

**Solution:**
- **Tauri commands:** Backend structs MUST use `#[serde(rename_all = "camelCase")]` for IPC
- **Frontend types:** Use `camelCase` in TypeScript interfaces (matches IPC)
- **Canonical data:** When loading from `canonical_data` JSON blob, normalize `snake_case` → `camelCase` before passing to components
- **Saving:** Convert `camelCase` → `snake_case` when building canonical JSON for persistence

**Example:**
```typescript
// Loading from canonical_data (snake_case)
const canonical = JSON.parse(data.canonicalData);
const range = canonical.range; // { kind, unit, distance: { mode, value, per_level } }

// Normalize to camelCase for component
setStructuredRange({
  kind: range.kind,
  unit: range.unit,
  distance: {
    mode: range.distance.mode,
    value: range.distance.value,
    perLevel: range.distance.per_level, // snake_case → camelCase
  },
});

// Saving: convert back to snake_case for canonical JSON
const canonicalRange = {
  kind: structuredRange.kind,
  unit: structuredRange.unit,
  distance: {
    mode: structuredRange.distance.mode,
    value: structuredRange.distance.value,
    per_level: structuredRange.distance.perLevel, // camelCase → snake_case
  },
};
```

### 2. Default Value Handling

**Problem:** Components accept `null | undefined`, but parent state might be uninitialized.

**Solution:**
- Components use `value ?? defaultX()` internally, so `null`/`undefined` is safe
- Parent can pre-initialize state with defaults before first render
- Use `value ?? undefined` when passing to components (converts `null` to `undefined`)

**Example:**
```typescript
// ✅ Good: Component handles null/undefined
<AreaForm value={structuredArea ?? undefined} onChange={...} />

// ✅ Also good: Pre-initialize with default
const [area, setArea] = useState<AreaSpec | null>(defaultAreaSpec());

// ❌ Avoid: Passing null directly (though it works, undefined is clearer)
<AreaForm value={structuredArea} onChange={...} />
```

### 3. Validation Timing

**Problem:** Structured sub-controls clamp and parse on change, but spell-level business rules must not be shown as blocking modals.

**Solution:**
- Components validate input constraints immediately (e.g., clamp negative numbers) via `onChange`.
- `SpellEditor` runs `deriveSpellEditorFieldErrors` for tradition/school/sphere/required-field rules and structured scalars, then renders **inline** errors with stable `data-testid` values (see [Spell Editor Validation Architecture](#spell-editor-validation-architecture)).
- Text-ish controls surface errors on **blur**; selects surface on **change**; the first failed **Save** attempt sets `hasAttemptedSubmit`, shows all blocking errors, focuses the first invalid target, and shows the save hint — never `modalAlert` for routine validation.

**Example:**
```typescript
// Component validates immediately (clamp, parse)
<StructuredFieldInput
  fieldType="range"
  value={range}
  onChange={(spec) => {
    setStructuredRange(spec);
  }}
/>

// Parent (SpellEditor) collects errors from deriveSpellEditorFieldErrors; maps them to inline nodes + ARIA; Save Error modal is reserved for backend persistence failures only
```

### 4. Legacy Data Parsing Priority

**Problem:** Spell might have both `canonical_data` and legacy string fields.

**Solution:**
- **Priority 1:** Load from `canonical_data` if present (structured data)
- **Priority 2:** If `canonical_data` field is null/absent, parse legacy string via Tauri commands
- **Hybrid:** If `canonical_data` exists but a field is null, parse that field's legacy string

**Example:**
```typescript
useEffect(() => {
  if (data.canonicalData) {
    const canonical = JSON.parse(data.canonicalData);
    if (canonical.range) {
      // Use canonical data
      setStructuredRange(normalizeRangeSpec(canonical.range));
    } else if (data.range) {
      // Fallback: parse legacy string
      invoke<RangeSpec>("parse_spell_range", { legacy: data.range })
        .then(setStructuredRange);
    }
  } else if (data.range) {
    // No canonical data, parse legacy
    invoke<RangeSpec>("parse_spell_range", { legacy: data.range })
      .then(setStructuredRange);
  }
}, [data]);
```

### 5. Material Component Quantity Defaults

**Problem:** Material quantity defaults to `1.0` (not `1`) for hashing consistency.

**Solution:**
- Always use `1.0` (decimal) as default, not `1` (integer)
- Component clamps values < 1.0 to 1.0
- Schema has no minimum constraint, but UI enforces >= 1.0

**Example:**
```typescript
// ✅ Good: Use 1.0 (decimal)
const newMaterial: MaterialComponentSpec = {
  name: "Diamond",
  quantity: 1.0, // Not 1
};

// Component handles clamping
<ComponentCheckboxes
  materialComponents={materials}
  onChange={(comp, mats) => {
    // mats[0].quantity will be >= 1.0 (clamped if needed)
    setStructuredMaterialComponents(mats);
  }}
/>
```

### 6. Damage Part ID Generation

**Problem:** Damage parts need stable IDs for deterministic hashing.

**Solution:**
- Component generates IDs automatically via `generateDamagePartId()`
- Implementation: `generateDamagePartId()` in `apps/desktop/src/types/spell.ts` builds `part_<timestamp>_<random>` and truncates to **32 characters** (`.slice(0, 32)`) for schema compatibility.
- IDs are assigned immediately upon creation (not on save)
- Parent should NOT generate IDs manually

**Example:**
```typescript
// ✅ Good: Component handles ID generation
<DamageForm
  value={damage}
  onChange={(spec) => {
    // spec.parts[0].id is already generated
    setStructuredDamage(spec);
  }}
/>

// ❌ Avoid: Generating IDs in parent
const addPart = () => {
  const newPart = {
    id: generateId(), // Don't do this!
    // ...
  };
};
```

### 7. Text Preview Computation

**Problem:** Components compute `.text` automatically, but parent might need it for display.

**Solution:**
- Components compute `.text` internally for preview display
- Use helper functions (`rangeToText`, `durationToText`, etc.) for serialization
- Don't manually construct `.text` values

**Example:**
```typescript
// ✅ Good: Use helper function
const rangeText = rangeToText(structuredRange);
// Returns: "10 yd" or "10 + 5/level yd" or "Special"

// ❌ Avoid: Manually constructing text
const rangeText = `${structuredRange.distance.value} ${structuredRange.unit}`;
```

### 8. Empty vs Null vs Undefined

**Problem:** Different components handle empty values differently.

**Solution:**
- `null` and `undefined` are treated the same (use defaults)
- Empty strings (`""`) are valid for optional text fields
- Use `value ?? undefined` pattern for consistency

**Example:**
```typescript
// All equivalent for components:
<AreaForm value={null} onChange={...} />
<AreaForm value={undefined} onChange={...} />
<AreaForm value={area ?? undefined} onChange={...} />

// But empty string is different:
const spec: AreaSpec = {
  kind: "special",
  rawLegacyValue: "", // Empty string is valid
};
```

---

## Storybook Stories

All structured components have comprehensive Storybook stories for development, testing, and documentation.

### Running Storybook

Start the Storybook development server:

```bash
cd apps/desktop
pnpm storybook
```

This starts Storybook on `http://localhost:6006` where you can:
- Browse all component stories interactively
- Test component behavior in isolation
- View automatic accessibility checks
- See component documentation and props

### Available Stories

Stories are located in `apps/desktop/src/ui/components/structured/*.stories.tsx`:

#### `StructuredFieldInput` Stories (many variants; count changes over time)

**Range variations:**
- `RangeEmpty` - Empty state
- `RangeDistance` - Fixed distance (e.g., "10 ft")
- `RangeDistancePerLevel` - Per-level distance (e.g., "10 + 5/level yd")
- `RangeTouch` - Touch range
- `RangeSpecial` - Special/legacy range

**Duration variations:**
- `DurationEmpty` - Empty state
- `DurationInstant` - Instant duration
- `DurationTime` - Time-based duration (e.g., "1 round")
- `DurationTimePerLevel` - Per-level time (e.g., "1 hour/level")
- `DurationConcentration` - Concentration duration
- `DurationConditional` - Conditional duration with text
- `DurationUsageLimited` - Usage-limited duration
- `DurationSpecial` - Special/legacy duration

**Casting time variations:**
- `CastingTimeEmpty` - Empty state
- `CastingTimeSimple` - Simple casting time (e.g., "1 segment")
- `CastingTimeWithPerLevel` - With per-level modifier
- `CastingTimeComplex` - Complex formula (e.g., "1 + 2/3/level action")
- `CastingTimeSpecial` - Special/legacy casting time

#### `AreaForm` Stories

Covers all area kinds:
- `Point` - Point area
- `RadiusCircle` - Circle radius
- `RadiusSphere` - Sphere radius
- `Cone` - Cone area
- `Line` - Line area
- `Rectangle` - Rectangular area
- `RectangularPrism` - 3D rectangular area
- `Cylinder` - Cylindrical area
- `Wall` - Wall area
- `Cube` - Cubic area
- `Volume` - Volume-based area
- `Surface` - Surface area
- `Tiles` - Tile-based area
- `Creatures` - Creature count area
- `Objects` - Object count area
- `Region` - Region-based area
- `Scope` - Scope-based area
- `Special` - Special/legacy area

#### `DamageForm` Stories

- `Empty` - Empty state
- `None` - No damage
- `DMAdjudicated` - DM-adjudicated damage with guidance text
- `ModeledSinglePart` - Single damage part (e.g., "1d6 fire")
- `ModeledMultipleParts` - Multiple damage parts with combine mode
- `ComplexScalingAndClamping` - Scaling/clamping edge cases
- `MultiLevelBands` - Multi-level band behaviour

#### `SavingThrowInput` Stories (6 stories)

- `Empty` - Empty state
- `None` - No saving throw
- `Single` - Single save type
- `SingleParalyzation` - Single save with specific type
- `Multiple` - Multiple save types
- `DMAdjudicated` - DM-adjudicated with guidance text

#### `MagicResistanceInput` Stories

- `Empty` - Empty state
- `Unknown` - Unknown MR (applies-to hidden)
- `Normal` - Normal MR
- `IgnoresMR` - Ignores MR
- `Partial` - Partial MR with scope
- `PartialWithPartIds` - Partial MR with specific part IDs
- `Special` - Special MR with custom rule

#### `ComponentCheckboxes` Stories

- `Empty` - Empty state
- `VerbalOnly` - V only
- `VerbalSomatic` - V, S
- `AllComponents` - V, S, M (no materials)
- `WithSingleMaterial` - V, S, M with one material component
- `WithMultipleMaterials` - V, S, M with multiple materials
- `WithComplexMaterial` - Material with all fields (name, quantity, GP value, consumed, unit, description)
- `WithQuantityGreaterThanOne` - Material with quantity > 1.0

### Using Stories for Development

**Component Development:**
- Use stories to develop components in isolation
- Test different prop combinations quickly
- Verify visual appearance and behavior

**Testing:**
- Stories demonstrate expected component behavior
- Use as reference for E2E test scenarios
- Use `@storybook/addon-a11y` from the Storybook UI for accessibility review (see automated-test caveat below)

**Documentation:**
- Stories serve as living documentation
- Show real examples of component usage
- Demonstrate edge cases and variations

**Debugging:**
- Isolate component issues by testing in Storybook
- Compare working vs. broken states
- Test specific prop combinations

### Accessibility Testing

The `@storybook/addon-a11y` addon is configured and automatically checks all stories for accessibility violations. The addon will:

- Check ARIA labels and roles
- Verify keyboard navigation
- Validate color contrast
- Detect missing semantic HTML

View accessibility results in the Storybook UI under the "Accessibility" tab for each story.

### Building Storybook

Build a static Storybook for deployment or sharing:

```bash
cd apps/desktop
pnpm build-storybook
```

This creates a static build in `storybook-static/` that can be deployed or shared with team members.

### Story Structure

Each story file follows this pattern:

```typescript
import type { Meta, StoryObj } from '@storybook/react';
// Structured spell-editor stories often use local `./storybook-utils` instead of `@storybook/test` `fn` — follow nearby files in this folder.
import { ComponentName } from './ComponentName';

const meta = {
  title: 'SpellEditor/ComponentName',
  component: ComponentName,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ComponentName>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StoryName: Story = {
  args: {
    // Component props
    value: { /* ... */ },
    onChange: () => {},
  },
};
```

### Adding New Stories

When adding new components or variations:

1. Create a new story file: `ComponentName.stories.tsx`
2. Follow the existing story structure
3. Include variations for different prop combinations
4. Add edge cases and empty states
5. Ensure all stories pass accessibility checks

### Automated Testing with Vitest

All Storybook stories are automatically tested using Vitest and the Storybook Vitest addon. Tests run automatically to detect defects, rendering errors, and console noise; accessibility addon coverage is interactive-first (see below).

#### Running Tests

Run all Storybook tests:

```bash
cd apps/desktop
pnpm test:storybook
```

**Test modes:**
- `pnpm test:storybook` - Run all tests once (CI mode)
- `pnpm test:storybook:watch` - Watch mode, re-runs on file changes
- `pnpm test:storybook:ui` - Interactive UI mode for debugging

#### What Gets Tested

The Vitest addon automatically:
- ✅ **Renders all stories** - Verifies each story renders without errors
- ✅ **Browser testing** - Tests run in real Chromium browser via Playwright
- ✅ **Error detection** - Catches React errors, console errors, and rendering failures
- ⚠️ **Accessibility checks** - Available in interactive Storybook UI (a11y addon disabled in automated tests due to compatibility)

#### Test Output

Tests produce:
- **Console output** - Real-time test results with pass/fail status
- **JUnit XML** - `test-results/storybook-junit.xml` for CI integration
- **Verbose reporting** - Detailed information about each story test

#### Continuous Integration

The tests are designed to run automatically in CI:
- All Storybook Vitest stories run automatically (exact count changes as stories are added).
- **Automated runs** focus on render and console health; the **@storybook/addon-a11y** checks are primarily used from the interactive Storybook UI (the addon is not the source of truth for CI accessibility gating in the current pipeline).
- Rendering errors and unexpected console output are caught immediately.
- No manual intervention required for a green story suite.

#### Fixing Test Failures

When tests fail:
1. **Rendering errors** - Check component code for bugs, missing props, or type errors
2. **Accessibility violations** - Fix ARIA labels, keyboard navigation, or semantic HTML
3. **Console errors** - Address JavaScript errors, warnings, or missing dependencies

Example test output (illustrative — run `pnpm test:storybook` for current counts):
```
✓ |storybook (chromium)| StructuredFieldInput.stories.tsx (…)
…
Test Files  … passed (…)
     Tests  … passed (…)
```
As of 2026-04, a full local run reported on the order of **14** story files and **140+** story tests including structured components, canon-first editor stories, and other UI groups.

### Integration with Testing

Stories complement E2E tests:

- **Stories:** Test components in isolation, visual regression, accessibility
- **E2E Tests:** Test full user workflows, integration with backend, data persistence

Use both approaches for comprehensive test coverage.

---

## Spell Editor Validation Architecture

### Pure validation helper

The spell editor's validation logic is extracted into a pure, side-effect-free module:

**File:** `apps/desktop/src/ui/spellEditorValidation.ts`

```typescript
export interface SpellEditorFieldError {
  field: SpellEditorValidatedFieldKey; // Typed union (e.g. "spell-name", "range-base-value")
  testId: string;      // data-testid of the rendered error element
  message: string;     // User-facing error copy
  focusTarget: string; // DOM id of the input to focus
}
```

The module exports (among helpers):

- **`deriveSpellEditorFieldErrors(input: SpellEditorValidationInput)`** — returns `SpellEditorFieldError[]` for all currently blocking errors from the flat `form`, selected `tradition`, and in-scope structured specs (`rangeSpec`, `durationSpec`, `castingTimeSpec`, `areaSpec`). Pure: no DOM access, no React, no side effects. Safe to call in Node/Vitest unit tests.
- **`sortFieldErrorsByFocusOrder(errors)`** — orders errors by `SPELL_EDITOR_FOCUS_ORDER` (the order `SpellEditor` uses when focusing after a failed save).
- **`getFirstInvalidFocusTarget(errors)`** — returns the `focusTarget` of the first error after that sort (utility; the live editor also skips targets that are not yet in the DOM until panels expand).

**Covered validation rules (exact message strings from `spellEditorValidation.ts`):**

| Rule | testId | Message |
|------|--------|---------|
| Name empty | `spell-name-error` | *Name is required.* |
| Description empty | `error-description-required` | *Description is required.* |
| Level out of range | `error-level-range` | *Level must be 0-12.* |
| School + Sphere conflict | `error-tradition-conflict` | *This spell has both a School and a Sphere set — school and sphere are mutually exclusive. Remove one before saving.* |
| Epic, disallowed classes | `error-epic-arcane-class-restriction` | *Epic spells are Arcane only and require Wizard/Mage class access.* |
| Levels 10–12 without Arcane school data | `error-epic-level-arcane-only` | *Levels 10-12 are Arcane (has School) only* |
| Quest checked but not Divine data | `error-quest-spell-divine-only` | *Quest spells are Divine (has Sphere) only* |
| Epic + Quest | `error-epic-quest-conflict` | *Cannot be both Epic and Quest spell.* |
| Cantrip + level ≠ 0 | `error-cantrip-level` | *Cantrips must be Level 0* |
| Arcane tradition, no school (levels 0–9) | `error-school-required-arcane-tradition` | *School is required for Arcane tradition.* |
| Epic, no school | `error-school-required-arcane` | *School is required for Epic (Arcane) spells.* |
| Divine tradition, no sphere (not Quest) | `error-sphere-required-divine-tradition` | *Sphere is required for Divine tradition.* |
| Quest checked, no sphere | `error-sphere-required-divine` | *Sphere is required for Quest (Divine) spells.* |
| Casting time base / per-level negative | `error-casting-time-base-value`, `error-casting-time-per-level` | *Base value must be 0 or greater* / *Per level must be 0 or greater* (no trailing period) |
| Range / duration scalars | `error-range-base-value`, etc. | *Base value must be 0 or greater* / *Per level must be 0 or greater* (no trailing period) |
| Area dimension scalars | `error-area-form-radius-value`, … | *Radius must be 0 or greater*, *Length must be 0 or greater*, etc. (no trailing period; see `AREA_SCALAR_FIELDS` in source) |

Scalar error testids are generated predictably from the input key, e.g. `error-range-base-value`, `error-area-form-length-value`.

**Unit test file:** `apps/desktop/src/ui/spellEditorValidation.test.ts`

### Validation-visibility and submit state model

`SpellEditor.tsx` maintains two pieces of validation state:

| State | Purpose |
|-------|---------|
| `fieldValidationVisible: Set<string>` | Fields whose inline validation is currently allowed to render before submit. `revealFieldValidation(...)` is called from blur and from controlling changes that should immediately reveal related errors. |
| `hasAttemptedSubmit: boolean` | Set to `true` on the first failed save click. Once set, all blocking errors are shown regardless of touch state, and the save button is disabled until they are resolved. |

Validation timing by control type:

- **Text inputs**: validate on `blur` — error appears when the user leaves the field.
- **Select controls**: validate on `change` — error appears immediately when the value changes (e.g. switching Tradition triggers instant revalidation of School/Sphere).
- **Dependent fields**: `revealFieldValidation(...)` and revalidation run immediately when their controlling value changes (e.g. changing Tradition clears stale errors for the hidden field and triggers inline validation of the newly visible field).
- **First submit attempt**: validates all fields unconditionally, sorts errors with `sortFieldErrorsByFocusOrder`, expands a detail panel if the first error’s `focusTarget` is not yet mounted, then focuses the first error with a real DOM `id`, and shows the save hint.

### Tradition-conditional School/Sphere rendering

Arcane and Divine are mutually exclusive in terms of which classification field is shown:

- Arcane tradition → School field rendered; Sphere field unmounted.
- Divine tradition → Sphere field rendered; School field unmounted.
- The newly mounted field wrapper receives `animate-in fade-in` so it fades in smoothly.
- The previously visible field is unmounted immediately without an exit-animation placeholder.
- Switching tradition instantly revalidates the newly relevant field and clears stale errors from the hidden field.

### ARIA wiring contract

Each validated input must satisfy:

```html
<input
  id="spell-name"
  aria-invalid="true"
  aria-describedby="spell-name-error"
/>
<span id="spell-name-error" data-testid="spell-name-error" class="animate-in fade-in …">
  Name is required.
</span>
```

- `aria-invalid="true"` is set only when the field currently has an error; the attribute is removed (or set to `false`) when the error is cleared.
- `aria-describedby` points to the matching inline error element id.
- Visible `<label>` elements remain the primary accessible name source; `aria-label` is not used to override them.
- Inline errors appear in the same field container as their input (not in a detached summary block).
- Newly shown inline errors receive `animate-in fade-in`; removed errors leave no detached spacing.

This contract applies to all in-scope scalar surfaces:

- `ScalarInput.tsx` (range and duration base-value / per-level inputs)
- `StructuredFieldInput.tsx` (`casting-time-base-value`, `casting-time-per-level`)
- `AreaForm.tsx` (radius, length, width, height, thickness, edge, surface area, volume, tile count, count)

### Save-progress state model

`SpellEditor.tsx` tracks save progress independently from parser/loading state:

| Phase | Button label | Button disabled | Editor inputs |
|-------|-------------|-----------------|---------------|
| Idle, valid | `Save Spell` | No | Editable |
| Idle, post-failed-submit | `Save Spell` | Yes (errors remain) | Editable |
| Save in flight < 300 ms | `Save Spell` | Yes (re-entry guard) | Frozen |
| Save in flight ≥ 300 ms | `Saving…` | Yes | Frozen |
| Save complete | navigates away | — | — |

- The re-entry guard activates immediately on save start so double-submit cannot occur during fast saves, even before the 300 ms visual threshold.
- A 300 ms timer is started when the save begins; if still pending at threshold, the label changes to `Saving…`.
- The timer is cleared on success or failure.
- On success: `pushNotification("success", "Spell saved.")` is called before `navigate("/")`.

### Notification-versus-modal boundary contract

| Scenario | Feedback |
|----------|----------|
| Routine save success | Toast: *Spell saved.* |
| Add spell to character success (Library row) | Toast: *Spell added to character!* |
| Add spell to character failure (Library row) | Toast (error) |
| Spellbook Builder add/remove failure | `window.alert` (not migrated to toast) |
| Save search failure | Toast (error) |
| Delete saved search failure | Toast (error) |
| Backend persistence failure (`Save Error`) | Modal dialog |
| Unsaved-changes navigation guard | Modal confirm |
| Delete confirmation | Modal confirm |
| Parser reparse failure | Modal dialog |

The toast is delivered through the shared Zustand notification store and rendered by the global `NotificationViewport` (live region `aria-live="polite"`). It survives route navigation because the viewport is mounted in the app shell above the router outlet.

### Developer test coverage

| File | Scope |
|------|-------|
| `src/ui/spellEditorValidation.test.ts` | Pure validation helper — all rule combinations, exact copy assertions, Node-safe |
| `src/ui/SpellEditor.test.tsx` | Editor validation state, ARIA wiring, save-progress thresholds, toast routing (jsdom, `// @vitest-environment jsdom`) |
| `src/ui/Library.test.tsx` | Library notification replacements — toast vs alert, live-region targeting (jsdom) |
| `tests/spell_editor_save_workflow.spec.ts` | Full Playwright save/validation/modal-boundary E2E spec |

---

## Grouped Layout Contract (Chunk 4 Visual Polish)

Chunk 4 introduced explicit visual grouping to `StructuredFieldInput` and `ComponentCheckboxes`. This section documents the surface vocabulary, DOM structure, and the intended relationship between `SpellEditor` labels and their child group containers.

### Surface class constants (`StructuredFieldInput.tsx`)

Six named class constants form the visual grammar used consistently across range, duration, and casting-time modes:

| Constant | Tailwind classes | Purpose |
|----------|-----------------|---------|
| `structuredGroupSurfaceClass` | `space-y-3 rounded-xl border border-neutral-300 bg-white p-3 text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100` | Root bordered subpanel, light and dark surface pair |
| `structuredPrimaryControlRowClass` | `flex min-w-0 flex-wrap items-center gap-2` | Main control row — flex-wrap for 900 px Chunk 5 compatibility |
| `structuredSupportingRowClass` | `rounded-lg border border-neutral-200 bg-neutral-50/70 p-2 dark:border-neutral-800 dark:bg-neutral-700` | Notes / secondary inputs, subordinate surface |
| `structuredPreviewRowClass` | `rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 dark:border-neutral-800 dark:bg-neutral-700` | Preview output row, intentionally lighter than the surface |
| `structuredInlineScalarClusterClass` | `flex min-w-0 flex-wrap items-center gap-2` | Nested wrapping cluster for scalar + unit pairs |
| `structuredPreviewOutputClass` | `text-sm italic text-neutral-700 dark:text-neutral-300` | Preview text style, applied to `<output>` elements |

All classes are local constants in `StructuredFieldInput.tsx`. They are not exported; do not import them from outside the component file.

### `StructuredFieldInput` DOM structure

`range` and `duration` render a three-row layout inside a single root group (`data-testid="structured-field-input"`):

```
[structured-field-input]          ← structuredGroupSurfaceClass (root)
  [structured-field-primary-row]  ← structuredPrimaryControlRowClass
    kind select                   ← range-kind-select / duration-kind-select / casting-time-unit
    scalar cluster                ← structuredInlineScalarClusterClass (range/duration)
    unit select                   ← range-unit / casting-time more selects
    raw-legacy input              ← range-raw-legacy / duration-raw-legacy (special kind only)
  [structured-field-supporting-row]  ← structuredSupportingRowClass
    notes field                   ← range-notes / duration-notes
  [structured-field-preview-row]  ← structuredPreviewRowClass
    <output>                      ← range-text-preview / duration-text-preview
```

Key rules:

- Range and duration always render both the notes row and preview row so those test IDs stay stable regardless of kind.
- The `<output>` element carries `aria-label="Computed {field} text"` and has no `aria-live`; preview updates are not announced by screen readers.
- Raw-legacy inputs appear inside the primary row, not below it, so the single grouped surface remains intact for special/legacy kinds.
- Casting-time mode uses the same root surface and preview row, but it does not render `structured-field-supporting-row`. Base / per-level / divisor / unit all stay inside the primary row with `+`, `/`, `/level` separators rendered as `<span>` support text rather than labels.

### `ComponentCheckboxes` DOM structure

```
[component-checkboxes]          ← root surface (same palette as structuredGroupSurfaceClass)
  [component-checkbox-strip]    ← flex-wrap container for checkbox labels
    (Verbal) (Somatic) (Material) [(Focus) (Divine Focus) (XP) — all variant only]
  <output component-text-preview>  ← preview row (structuredPreviewRowClass palette)
  [material-subform]            ← subordinate nested panel (only when material === true)
    header + Add button
    [material-component-row]    ← one per material entry
```

Key rules:

- The root container uses the same `rounded-xl border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-800` palette as `StructuredFieldInput`.
- `component-text-preview` renders as an `<output>` element and uses `structuredPreviewRowClass` palette for visual consistency.
- `material-subform` uses the same bordered subpanel palette (`border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-800`) to read as a nested surface rather than a peer.
- Material rows use `bg-neutral-50 dark:bg-neutral-800` with a `border-neutral-200 dark:border-neutral-700` border — slightly de-emphasised relative to the subform surface.
- No classes assume a dark background; every surface states both a light value and a `dark:` variant.

### Relationship between `SpellEditor` labels and structured child containers

Labels for Range, Duration, Casting Time, and Components remain owned by `SpellEditor.tsx`. The child components do **not** render field labels internally. The intended visual relationship is:

```
SpellEditor detail panel
  label ("Range")                          ← owned by SpellEditor
  single-line text input (detail-range-input)  ← owned by SpellEditor
  expand/collapse control (detail-range-expand) ← owned by SpellEditor
  [expanded panel]
    StructuredFieldInput (range)           ← child component; the root group provides
                                             the subpanel surface below the label
```

When expanded, the `StructuredFieldInput` or `ComponentCheckboxes` root group appears directly inside the expanded panel surface from `SpellEditor`. The grouping classes provide a rounded bordered inset that sits below the `SpellEditor` label row without double-bordering the outer panel. `SpellEditor` does not add its own inner border around the child group.

Shared UI conventions to preserve:

- Keep the grouped child surface visually nested, not full-width and not detached from the owning label row.
- Preserve the current stable `data-testid` values for the root group, the primary row, the preview row, and the component strip. Preserve `structured-field-supporting-row` for the field types that actually render a notes row (`range` and `duration`).
- Keep validation messages inline with the control that owns them so `aria-describedby` can point at a visible element in the same field container.
- Preserve the `animate-in fade-in` transition on newly mounted conditional fields and the immediate unmount of hidden fields so stale errors do not linger in the DOM.

### 900 px layout compatibility

The primary control row uses `flex-wrap` and `min-w-0` so scalar controls and selects wrap to a second line when the panel is approximately 900 px wide. This is the direct foundation for Chunk 5 resize hardening. Do not remove these properties without updating the Chunk 5 plan and re-running the 900 px wrap checks in `tests/spell_editor_structured_data.spec.ts`.
