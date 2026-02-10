# Spell Editor Structured Components – Developer Guide

## Overview

The spell editor uses a set of controlled React components that emit **schema-native shapes** (matching `spell.schema.json` / `apps/desktop/src/types/spell.ts`). The parent (e.g. `SpellEditor`) owns state and passes `value` + `onChange`; components are stateless with respect to the spell data.

**Location:** `apps/desktop/src/ui/components/structured/`

**Exports (from `index.ts`):**

- `StructuredFieldInput`, `rangeToText`, `durationToText`, `castingTimeToText`
- `ScalarInput`
- `DamageForm`, `AreaForm`, `SavingThrowInput`, `MagicResistanceInput`, `ComponentCheckboxes`

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

Structured components use `data-testid` attributes (kebab-case) for Playwright. See `apps/desktop/src/AGENTS.md` and the change tasks for the full list. Examples: `structured-field-input`, `range-base-value`, `duration-unit`, `area-form-kind`, `damage-form-add-part`, `component-checkbox-material`, `material-component-name`, `spell-editor-special-fallback-banner`.

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

**Problem:** Validation happens on every change, but save validation might need different rules.

**Solution:**
- Components validate input constraints immediately (e.g., clamp negative numbers)
- Parent validates business rules on save (e.g., tradition requirements)
- Use `onChange` for immediate feedback, `onBlur` is not needed (parent persists on Save)

**Example:**
```typescript
// Component validates immediately (clamp, parse)
<StructuredFieldInput
  fieldType="range"
  value={range}
  onChange={(spec) => {
    // Component already clamped negative values
    setStructuredRange(spec);
  }}
/>

// Parent validates on save
const save = async () => {
  const errors = [];
  if (tradition === "BOTH" && (!school || !sphere)) {
    errors.push("BOTH tradition requires both school and sphere");
  }
  if (errors.length > 0) {
    await modalAlert(errors, "Validation Errors", "error");
    return;
  }
  // Save...
};
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
- Pattern: `part_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
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

#### `StructuredFieldInput` Stories (18 stories)

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

#### `AreaForm` Stories (18 stories)

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

#### `DamageForm` Stories (7 stories)

- `Empty` - Empty state
- `None` - No damage
- `DMAdjudicated` - DM-adjudicated damage with guidance text
- `ModeledSinglePart` - Single damage part (e.g., "1d6 fire")
- `ModeledMultipleParts` - Multiple damage parts with combine mode
- `ModeledWithModifier` - Damage with flat modifier (e.g., "2d6+3")
- `ModeledMaxCombine` - Multiple parts with "max" combine mode

#### `SavingThrowInput` Stories (6 stories)

- `Empty` - Empty state
- `None` - No saving throw
- `Single` - Single save type
- `SingleParalyzation` - Single save with specific type
- `Multiple` - Multiple save types
- `DMAdjudicated` - DM-adjudicated with guidance text

#### `MagicResistanceInput` Stories (7 stories)

- `Empty` - Empty state
- `Unknown` - Unknown MR (applies-to hidden)
- `Normal` - Normal MR
- `IgnoresMR` - Ignores MR
- `Partial` - Partial MR with scope
- `PartialWithPartIds` - Partial MR with specific part IDs
- `Special` - Special MR with custom rule

#### `ComponentCheckboxes` Stories (8 stories)

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
- Accessibility checks run automatically via `@storybook/addon-a11y`

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
import { fn } from '@storybook/test';
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
    onChange: fn(),
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

All Storybook stories are automatically tested using Vitest and the Storybook Vitest addon. Tests run automatically to detect defects, rendering errors, and accessibility violations.

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
- All 65+ story tests run automatically
- Accessibility violations cause test failures
- Rendering errors are caught immediately
- No manual intervention required

#### Fixing Test Failures

When tests fail:
1. **Rendering errors** - Check component code for bugs, missing props, or type errors
2. **Accessibility violations** - Fix ARIA labels, keyboard navigation, or semantic HTML
3. **Console errors** - Address JavaScript errors, warnings, or missing dependencies

Example test output:
```
✓ |storybook (chromium)| StructuredFieldInput.stories.tsx (18 tests) 1008ms
✓ |storybook (chromium)| AreaForm.stories.tsx (19 tests) 1058ms
✓ |storybook (chromium)| DamageForm.stories.tsx (7 tests) 629ms

Test Files  6 passed (6)
     Tests  65 passed (65)
```

### Integration with Testing

Stories complement E2E tests:

- **Stories:** Test components in isolation, visual regression, accessibility
- **E2E Tests:** Test full user workflows, integration with backend, data persistence

Use both approaches for comprehensive test coverage.
