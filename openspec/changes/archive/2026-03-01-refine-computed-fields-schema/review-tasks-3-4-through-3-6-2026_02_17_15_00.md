# Review: Tasks 3.4-3.6 (Frontend Components)

## 1. Executive Summary
This review evaluates the implementation of `MagicResistanceInput` (Task 3.4), `AreaForm` (Task 3.5), and `StructuredFieldInput` (Task 3.6) against the `refine-computed-fields-schema` spec.
Overall, the implementation accurately captures the schema changes, successfully handles complex nested states, and synchronizes well with real-time computations. However, three subtle bugs were identified:

1. **MagicResistanceInput Data Hygiene (Task 3.4):** Sibling fields are not accurately cleared on kind transition between `partial` and `special`.
2. **AreaForm Empty "special" State (Task 3.5.2):** Toggling into the `"special"` kind explicitly coerces empty strings for `rawLegacyValue` rather than preserving `undefined`, and abandons `.text` synchronization until the text input is explicitly typed into.
3. **StructuredField pre-existing legacy render (Task 3.6.4):** Visibility logic for `rawLegacyValue` inside Range and Duration explicitly triggers only on the `kind === "special"` enum, fully preventing the secondary required trigger (pre-existing legacy data from the importer on non-special fields) from showing up.

## 2. Pass 1: Spec vs. Reality Mapping

### Task 3.4: `MagicResistanceInput.tsx`
- **[Pass]** 3.4.1 Display `sourceText` as a read-only labelled annotation when populated.
- **[Pass]** 3.4.2 Ensure `appliesTo` selector is hidden/disabled on `unknown`.
- **[Pass]** 3.4.3 When MR `kind === "partial"`: render `scope` enum selector and conditional `part_ids` picker.
- **[Pass]** 3.4.4 When MR `kind === "special"`: render `appliesTo` selector and `special_rule` text input.
- **[Pass]** 3.4.5 Show `notes` text area for all kinds.
- **[Bug]** Unspecified but critical behavior: When switching between MR kinds `partial` and `special`, the sibling specific objects (`partial` scope map, `specialRule` string) are not explicitly un-set in the `.onChange` dispatcher, which causes the spec output object to bloat with effectively invisible orphaned keys.

### Task 3.5: `AreaForm.tsx`
- **[Pass]** 3.5.1 When `kind` is NOT `"special"`: bind `.text` as the computed canonical text preview (read-only, auto-recomputed).
- **[Fail]** 3.5.2 When `kind` IS `"special"`: expose `rawLegacyValue` as the user-editable field; derive `.text` from `rawLegacyValue` when non-empty, or emit `text: undefined` when empty/absent.
  - *Reality:* The `onChange` text-box behavior perfectly matches this rule (`e.target.value || undefined`). However, the `onChange` for the primary Kind `select` dropdown assigns `""` explicitly (`next.rawLegacyValue = spec.rawLegacyValue ?? "";`) and fails to apply any updates to `next.text` at all, creating a desync during the transition.

### Task 3.6: `StructuredFieldInput.tsx`
- **[Pass]** 3.6.1 Ensure real-time `.text` derivation is written to the emitted value for all three field types on every change.
- **[Pass]** 3.6.2 Implement kind-transition field-clearing rules per the structured-fields spec Kind Transition Behaviour tables. (E.g. Setting to `"personal"` properly deletes `distance` and `unit`).
- **[Pass]** 3.6.3 `rawLegacyValue` show/hide — trigger 1 (kind/unit): visible when `kind/unit === "special"`; cleared when switching away.
- **[Fail]** 3.6.4 `rawLegacyValue` show/hide — trigger 2 (pre-existing data): also visible when a pre-existing `rawLegacyValue` is loaded from legacy data, regardless of current unit.
  - *Reality:* `CastingTime` successfully accommodates this via condition `(ct.unit === "special" || ct.rawLegacyValue)`. However, `Range` and `Duration` only use the `{isSpecial && <input .../>}` boolean trap, ignoring the secondary trigger completely.
- **[Pass]** 3.6.5 `casting_time.text` always emitted non-empty. `DurationSpec.text` and `RangeSpec.text` optional but must be computed/emitted.

## 3. Pass 2: Required Implementation Fixes

Please apply the following changes to achieve 100% compliance with both the spec and underlying data integrity behaviors.

- [x] **Fix 1: `MagicResistanceInput.tsx` Orphaned Sibling Data**
  - **Location & Action:** Inside the `onChange` dispatcher for the `<select>` tag controlling the MR kind:
    - In the `"partial"` conditional block, explicitly assign `next.specialRule = undefined;`.
    - In the `"special"` conditional block, explicitly assign `next.partial = undefined;`.

- [x] **Fix 2: `AreaForm.tsx` "special" Kind Transition Logic**
  - **Location & Action:** Inside the `onChange` dispatcher for the `<select>` tag controlling the Area kind:
    - Update the `"special"` case block to properly reflect empty inputs as `undefined` and to simultaneously sync the `.text` property:
      ```tsx
      if (kind === "special") {
        next.rawLegacyValue = spec.rawLegacyValue || undefined;
        next.text = next.rawLegacyValue;
      }
      ```
    - In the `else` block (for non-special transitions), consider adding `next.text = undefined;` to guarantee any old statically-assigned Legacy text doesn't stick around behind the scenes.

- [x] **Fix 3: `StructuredFieldInput.tsx` Pre-existing Data Visibility**
  - **Location & Action:** Around line 150 (Range block) and line 302 (Duration block):
    - Change the boolean condition guarding the raw legacy `<input>` render from `{isSpecial && (...)}` to `{(isSpecial || spec.rawLegacyValue) && (...)}`.
