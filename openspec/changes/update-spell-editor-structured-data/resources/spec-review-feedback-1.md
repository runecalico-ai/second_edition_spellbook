# Spec Review: Update Spell Editor Structured Data

## Inconsistencies & Unclear Points

### 1. Damage Field Suitability in `StructuredFieldInput` (RESOLVED)
- **Finding**: `DamageSpec` in `spell.schema.json` (lines 1283+) is a complex object with `parts`, `combine_mode`, and recursive `DamagePart` structures involving dice pools and scaling rules.
- **Conclusion**: `StructuredFieldInput` (scalar + unit) is **completely insufficient** for Damage.
- **Action**: Remove Damage from `StructuredFieldInput` scope. Define a dedicated `DamageForm` component task.

### 2. Unit Enum vs. Display Text
- **Issue**: `tasks.md` (Line 8) specifies using lowercase unit values like `"yd"`, `"ft"`. `verification.md` (Line 18) expects the text preview to be `"10 + 5/level yd"`.
- **Suggestion**: The UI should display friendly labels ("yards") but serialize to schema enums ("yd"). The `StructuredFieldInput` should likely take an optional `unitFormat` prop or map.

### 3. Material Component "Uncheck" Behavior (RESOLVED)
- **Requirement**: User requested "Confirm dialog on uncheck if data exists".
- **Action**: Add this behavior to `ComponentCheckboxes` requirements.

### 4. Missing Structured Fields
- **Finding**:
    - `SavingThrowSpec` (Schema line 1562): Enum `kind` + optional `partial` fraction.
    - `MagicResistanceSpec` (Schema line 1586): Enum `kind` + enum `applies_to`.
- **Conclusion**: These are not "StructuredFieldInputs" (scalar) but they *are* structured forms that need explicit UI components, distinct from simple strings.
- **Action**: Add `SavingThrowInput` and `MagicResistanceInput` to scope to ensure a complete "Structured Data" editor update.

## Improvement Suggestions

### 1. Rename `StructuredFieldInput` to `ScalarInput`
- **Reason**: The schema defines a `$defs/scalar` type which exactly matches this component's purpose (base, per_level, etc.).
- **Benefit**: Clearer mapping between React component and Schema type.

### 2. Explicit Damage Mode
- **Action**: Create a `DamageForm` that handles:
    - `kind` (modeled vs dm_adjudicated)
    - `parts` list (add/remove)
    - `DamagePart` editor (Types, Dice Pools, Scaling)
