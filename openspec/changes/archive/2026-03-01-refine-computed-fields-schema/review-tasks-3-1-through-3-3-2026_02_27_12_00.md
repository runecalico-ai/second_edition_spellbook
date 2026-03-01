# Three-Pass In-Depth Code Review
## Change: `refine-computed-fields-schema`
## Scope: Tasks `3.1`, `3.2`, `3.3` (Frontend Types & Editor Components)
## Date: 2026-02-27
## Build state: All prior P0–P3 fixes from `2026_02_26_fresh` review verified applied

---

## Review Method

| Pass | Focus | Sources Consulted |
|------|-------|-------------------|
| **Pass 1 — Spec Contract Audit** | Enumerate every atomic requirement from tasks 3.1–3.3 and derive a verification checklist from `tasks.md`, `spell-editor-complex-forms/spec.md`, and `spell-editor-structured-fields/spec.md` | `tasks.md`, both delta specs |
| **Pass 2 — Code Reality Audit** | Line-level read of **all three implementation files** against the checklist; TypeScript compiler run (`tsc --noEmit`) to surface hidden type errors | `spell.ts`, `DamageForm.tsx`, `SavingThrowInput.tsx`, `spell.test.ts`, `tsc` output |
| **Pass 3 — Cross-Cutting Audit** | State-transition correctness, field-preservation contracts, utility-function behavioral consistency, downstream compile health | All three implementation files + `SpellEditor.tsx`, Storybook stories |

---

## Pass 1 — Spec Contract Audit

### Task 3.1 — `src/types/spell.ts`

| Req ID | Source | Requirement |
|--------|--------|-------------|
| 3.1-A | tasks.md | `text?: string` added to `DurationSpec` |
| 3.1-B | tasks.md | `text?: string` added to `AreaSpec` |
| 3.1-C | tasks.md | `rawLegacyValue?: string` added to `SavingThrowSpec` |
| 3.1-D | tasks.md | `sourceText?: string` added to `MagicResistanceSpec` |
| 3.1-E | tasks.md | `SpellDamageSpec.rawLegacyValue` renamed → `sourceText` |
| 3.1-F | tasks.md | `dmGuidance` / `dm_guidance` removed from `SavingThrowSpec`; **retained** on `SpellDamageSpec` per Decision 3 |
| 3.1-G | tasks.md | Remove `"action"`, `"bonus_action"`, `"reaction"` from `CastingTimeUnit` type |
| 3.1-H | tasks.md | Remove same three units from `CASTING_TIME_UNIT_LABELS` map |
| 3.1-I | tasks.md | Remove same three units from `defaultCastingTime()` factory |
| 3.1-J | structured-fields spec | `defaultCastingTime()` default: `unit: "segment"`, `text: "1 segment"`, `baseValue: 1` |
| 3.1-K | complex-forms spec | `generateDamagePartId()` output must satisfy `^[a-z][a-z0-9_]{0,31}$` using `part_${Date.now()}_${rand}` pattern |
| 3.1-L | complex-forms spec | `defaultDamagePart()` must init `application: { scope: "per_target" }` and `save: { kind: "none" }` |

### Task 3.2 — `DamageForm.tsx`

| Req ID | Source | Requirement |
|--------|--------|-------------|
| 3.2-A | tasks.md | `sourceText` rendered as read-only annotation ("Original source text") for **all** `kind` values when populated |
| 3.2-B | complex-forms spec | `dmGuidance` textarea shown when `kind === "dm_adjudicated"` |
| 3.2-C | complex-forms spec | `notes` textarea shown when `kind === "modeled"` AND `kind === "dm_adjudicated"`; hidden for `kind === "none"` |
| 3.2-D | tasks.md | No `dmGuidance` or `notes` when `kind === "none"` |
| 3.2-E | complex-forms spec | New parts default to `application: { scope: "per_target" }` |
| 3.2-F | complex-forms spec | New parts default to `save: { kind: "none" }` |
| 3.2-G | complex-forms spec | Part IDs match `^[a-z][a-z0-9_]{0,31}$` via `part_${ts}_${rand}` |
| 3.2-H | tasks.md | `sourceText` preserved across all kind-transition branches (annotation survives kind switch) |

### Task 3.3 — `SavingThrowInput.tsx`

| Req ID | Source | Requirement |
|--------|--------|-------------|
| 3.3-A | tasks.md | All bindings to `dm_guidance` / `dmGuidance` removed |
| 3.3-B | tasks.md | `rawLegacyValue` displayed as read-only annotation for **all** `kind` values when populated |
| 3.3-C | tasks.md / complex-forms spec | `notes` textarea rendered for **all** kinds (none, single, multiple, dm_adjudicated) |
| 3.3-D | complex-forms spec | `dm_adjudicated`: no SingleSave sub-form; `notes` is sole editable narrative field |
| 3.3-E | complex-forms spec | `single`: `SingleSaveForm` sub-form rendered |
| 3.3-F | complex-forms spec | `multiple`: array of `SingleSaveForm` sub-forms with add/remove controls |
| 3.3-G | tasks.md | `rawLegacyValue` preserved across all kind-transition branches |
| 3.3-H | tasks.md | `notes` preserved across all kind-transition branches |

---

## Pass 2 — Code Reality Audit

### Task 3.1 — `src/types/spell.ts`

| Req | Status | Evidence / Line |
|-----|--------|-----------------|
| **3.1-A** `text?: string` on `DurationSpec` | ✅ | `DurationSpec` interface: `text?: string` after `kind` — fieldname order consistent with other specs |
| **3.1-B** `text?: string` on `AreaSpec` | ✅ | `AreaSpec` interface: `text?: string` as second field |
| **3.1-C** `rawLegacyValue?: string` on `SavingThrowSpec` | ✅ | `SavingThrowSpec` has `rawLegacyValue?: string`; no `dmGuidance` present |
| **3.1-D** `sourceText?: string` on `MagicResistanceSpec` | ✅ | `MagicResistanceSpec` has `sourceText?: string` |
| **3.1-E** `SpellDamageSpec.rawLegacyValue → sourceText` | ✅ | `SpellDamageSpec` has `sourceText?: string`; no `rawLegacyValue` field present |
| **3.1-F** Remove `dmGuidance` from `SavingThrowSpec` | ✅ | Not present; `SpellDamageSpec.dmGuidance?: string` retained |
| **3.1-G** Remove 5e units from `CastingTimeUnit` | ✅ | Type union: 7 members (`segment \| round \| turn \| hour \| minute \| special \| instantaneous`) |
| **3.1-H** Remove from `CASTING_TIME_UNIT_LABELS` | ✅ | Map has exactly 7 entries; no `"action"`, `"bonus_action"`, `"reaction"` keys |
| **3.1-I** Remove from `defaultCastingTime()` | ✅ | Factory no longer references any removed unit |
| **3.1-J** `defaultCastingTime()` returns `unit: "segment"`, `text: "1 segment"` | ✅ | **Fixed (2026-02-26).** Returns `{ text: "1 segment", unit: "segment", baseValue: 1, perLevel: 0, levelDivisor: 1 }` |
| **3.1-K** `generateDamagePartId()` pattern | ✅ | `part_${Date.now()}_${r}`.slice(0, 32)`. Date.now() = 13 digits; max string = `part_` (5) + 13 + `_` (1) + 7 = 26 chars. Always under 32, starts with lowercase `p`, all chars `[a-z0-9_]`. `.slice(0, 32)` is a provable no-op (max 26 < 32). |
| **3.1-L** `defaultDamagePart()` defaults | ✅ | Returns `{ id: …, damageType: "fire", base: {…}, application: { scope: "per_target" }, save: { kind: "none" } }` |

**Finding F1 — `areaToText()` omits `spec.text` entirely (Medium):**

```typescript
export function areaToText(spec: AreaSpec): string {
  if (spec.rawLegacyValue) return spec.rawLegacyValue;   // ← checked FIRST
  if (spec.kind === "point") return "Point";
  if (spec.kind === "special") return spec.rawLegacyValue ?? "Special";  // ← dead code: rawLegacyValue was falsy above
  // … structured synthesis
  // ← spec.text is NEVER referenced anywhere in this function
}
```

`spec.text` is **completely absent** from `areaToText()` — not merely wrong-ordered, but never consulted at any point. The task 4.2 display priority chain is:

1. **`spec.text`** — authoritative normalized text from `normalize()`
2. `spec.rawLegacyValue` — original legacy fallback
3. synthesized from structured fields

The current implementation skips priority 1 entirely. A post-migration spell with `kind: "radius_circle"`, `text: "20 ft radius"`, and any populated `rawLegacyValue` (e.g., from pre-migration import) would display the legacy string instead of the canonical text. A post-migration spell with `text: "20 ft radius"` and no `rawLegacyValue` would correctly synthesize from structured fields — but only because the synthesis happens to reproduce the same value, not because `spec.text` was read.

Additionally, the `kind === "special"` branch at line 553 is dead code for the `rawLegacyValue` path: execution only reaches it if `rawLegacyValue` was falsy above, making `spec.rawLegacyValue ?? "Special"` always resolve to `"Special"`.

> **Task scope note:** `areaToText()` lives in `spell.ts` (the task 3.1 file) and affects both the detail-view rendering (task 4.2) and any editor preview that calls it. The fix is `spec.text ?? spec.rawLegacyValue ?? …` prepended before the structured branches. The current `spell.test.ts` test `it("short-circuits to rawLegacyValue")` encodes the broken priority as a passing assertion — that test must also be corrected when the function is fixed.

**Finding F2 — Stale field `.text` omitted from `areaToText()` test (Low):**

The `areaToText` tests in `spell.test.ts` do not assert against `spec.text` at all — they only verify `rawLegacyValue` short-circuit and structured synthesis. No test covers the `spec.text` priority path. Once the priority is corrected (F1), a test asserting `spec.text` takes precedence over both `rawLegacyValue` and synthesis would be needed.

**Finding F3 — `formatDicePool` local shadow in `DamageForm.tsx` (Low):**

`DamageForm.tsx` defines a private `formatDicePool(pool: DicePool)` that only processes `pool.terms[0]` (single-term). The exported `formatDicePool` in `spell.ts` joins all terms. For a spell with a multi-term `DicePool` (e.g., two independently tracked die types), the editor input would show only the first term. The behavior is intentional for the edit-field UX (a single `2d6+3` pattern) but is undocumented. Neither file references the other's implementation.

> **Recommendation:** Add a comment to the local version stating it is a single-term editor representation, not a general formatter, to prevent future confusion.

---

### Task 3.2 — `DamageForm.tsx`

| Req | Status | Evidence |
|-----|--------|----------|
| **3.2-A** `sourceText` read-only annotation | ✅ | `{spec.sourceText && (<div …>Original source text: {spec.sourceText}</div>)}` — placed above all kind-conditional rendering; fires for any truthy `sourceText` |
| **3.2-B** `dmGuidance` for `dm_adjudicated` | ✅ | `{spec.kind === "dm_adjudicated" && (<textarea aria-label="DM guidance" …>)}` |
| **3.2-C** `notes` for `modeled` and `dm_adjudicated` | ✅ | `{spec.kind !== "none" && (<textarea aria-label="Overall damage notes" …>)}` |
| **3.2-D** No `dmGuidance` or `notes` for `none` | ✅ | `spec.kind !== "none"` guard on notes; `dm_adjudicated` guard on `dmGuidance`; kind `"none"` triggers neither |
| **3.2-E/F** New part defaults | ✅ | `addPart()` delegates to `defaultDamagePart()` — all defaults sourced from `spell.ts` |
| **3.2-G** Part ID pattern | ✅ | (See analysis under 3.1-K) |
| **3.2-H** `sourceText` preserved on kind transition | ✅ | **Fixed (2026-02-26).** All three kind-transition branches thread `sourceText: spec.sourceText` |

**Finding F4 — `notes` not shown for `kind === "none"` (Low):**

The `notes` textarea is gated by `spec.kind !== "none"`. If a spell is loaded from storage with `damage: { kind: "none", notes: "See description" }`, the notes field is invisible and not editable. The data is preserved through any kind transition (because the transition handler threads `notes: spec.notes`), but a user cannot access or clear a pre-existing note while `kind === "none"`.

By contrast, `SavingThrowInput` renders `notes` unconditionally for all kinds. The specs describe `notes` as "a top-level field on `SpellDamageSpec`, not scoped to any single kind." Strict reading of the spec implies notes should be visible even for `kind: "none"`.

> **Priority:** Low. The primary use case (adding notes while building damage) works correctly. `kind === "none"` with pre-existing notes from import is an edge case. Acceptable deferral to task 3.6 or later.

**Finding F5 — `addPart()` redundant `generateDamagePartId()` call (Trivial):**

```tsx
const part = defaultDamagePart();   // internally calls generateDamagePartId() → sets part.id
part.id = id;                        // immediately overwrites with the collision-checked id
```

`defaultDamagePart()` calls `generateDamagePartId()` as part of its own setup, but this ID is thrown away and replaced. The function call is not harmful — it just generates an unused ID. Consider either: (a) a `defaultDamagePart(id)` overload that accepts an ID, or (b) accept the minor waste as not worth the refactor. Net effect: zero.

**Finding F6 — Collision guard fallback arithmetic comment absent (Trivial):**

```tsx
id = `${id.slice(0, 27)}_${Math.random().toString(36).slice(2, 6)}`.slice(0, 32);
```

`id` is at most 26 chars (see 3.1-K analysis: `part_` + 13-digit timestamp + `_` + 7 chars = 26). `id.slice(0, 27)` therefore takes all 26 chars (27 > 26, no truncation). Result: 26 + `_` + 4 = **31 chars max**. The outer `.slice(0, 32)` is a no-op (31 < 32). The arithmetic is correct but uncommented — the `slice(0, 27)` appears to reserve room for a 27-char id that can never be produced by the generator. Recommend a brief inline comment clarifying the guaranteed max length.

---

### Task 3.3 — `SavingThrowInput.tsx`

| Req | Status | Evidence |
|-----|--------|----------|
| **3.3-A** All `dm_guidance` / `dmGuidance` bindings removed | ✅ | Zero occurrences of `dmGuidance`, `dm_guidance`, `dm guidance` in file |
| **3.3-B** `rawLegacyValue` read-only annotation | ✅ | `{spec.rawLegacyValue && (<div …>Original source text: {spec.rawLegacyValue}</div>)}` — mirrors DamageForm annotation layout |
| **3.3-C** `notes` for all kinds | ✅ | Direct `<textarea aria-label="Overall saving throw notes" …>` with no condition wrapper |
| **3.3-D** `dm_adjudicated`: no SingleSave sub-form; `notes` only | ✅ | Only `spec.kind === "single"` and `spec.kind === "multiple"` conditionally render `SingleSaveForm`; `dm_adjudicated` falls through to the unconditional notes area |
| **3.3-E** `single` renders `SingleSaveForm` | ✅ | `{spec.kind === "single" && spec.single && <SingleSaveForm …>}` |
| **3.3-F** `multiple` renders array with add/remove | ✅ | `spec.multiple?.map(…)` with Remove buttons; `addMultiple()` appends `DEFAULT_SINGLE_SAVE` |
| **3.3-G** `rawLegacyValue` preserved on kind transition | ✅ | **Fixed (2026-02-26).** All four kind branches thread `rawLegacyValue: spec.rawLegacyValue` |
| **3.3-H** `notes` preserved on kind transition | ✅ | **Fixed (2026-02-26).** All four kind branches thread `notes: spec.notes` |

**Finding F7 — `{true && …}` wrapper removed correctly (Resolved):**

Prior review identified `{true && (<textarea …>)}` as code clutter. The current code renders the textarea directly with a descriptive comment, which is correct:

```tsx
{/* Notes: always rendered in v2 — sole narrative field after dm_guidance removal */}
<textarea
  data-testid="saving-throw-notes"
  …
/>
```

✅ Confirmed resolved.

**Finding F8 — `removeMultiple()` leaves `kind: "multiple"` with empty data (Low):**

When the last save in the `multiple` array is removed:

```tsx
const removeMultiple = (index: number) => {
  const multiple = spec.multiple?.filter((_, i) => i !== index) ?? [];
  updateSpec({ multiple: multiple.length ? multiple : undefined });
};
```

The emitted value becomes `{ kind: "multiple", multiple: undefined }`. The `kind` selector still displays "Multiple" but no sub-forms render. `addMultiple()` correctly handles this degenerate state (`spec.multiple ?? []` → appends to empty array), so the round-trip works. However, the UI remains in an inconsistent state where `kind: "multiple"` shows no saves and no "Add save" button is prominent enough to be discoverable.

> **Not a regression:** This behavior predates the tasks under review. No task 3.3 requirement specifies automatic downgrade to `kind: "none"` on last-save removal. Documented for future UX consideration.

**Finding F9 — Multiple-save key uses index (Informational):**

```tsx
key={`save-${idx}-${s.saveType}-${s.appliesTo}`}
```

Index-based keys cause reconciliation thrashing on reorder/insert. Current `addMultiple()` (append-only) and `removeMultiple()` (filter-by-index) don't reorder, so this is acceptable. Would become an issue if arbitrary insertion were added.

---

## Pass 3 — Cross-Cutting Audit

### 3.X TypeScript compile errors from task 3.1 renames (HIGH — Blocking downstream tasks)

Running `tsc --noEmit` surfaces **9 errors** caused by task 3.1 type changes that have not yet been updated in dependent files:

| File | Error | Fix Owner |
|------|-------|-----------|
| `spell.test.ts:50` | `rawLegacyValue` does not exist on `SpellDamageSpec` | Task 5.5 |
| `spell.test.ts:146` | `dmGuidance` does not exist on `SavingThrowSpec` | Task 5.5 |
| `SavingThrowInput.stories.tsx:95` | `dmGuidance` does not exist on `SavingThrowSpec` | Task 5.4 |
| `SpellEditorCanonFirst.stories.tsx:331` | `Type '"action"' is not assignable to type 'CastingTimeUnit'` | Task 5.4 |
| `StructuredFieldInput.stories.tsx:206` | `Type '"action"' is not assignable to type 'CastingTimeUnit...'` | Task 5.4 |
| `SpellEditor.tsx:274` | `rawLegacyValue` does not exist on `SpellDamageSpec` | Task 3.7a |
| `SpellEditor.tsx:329` | `dmGuidance` does not exist on `SavingThrowSpec` | Task 3.7a |
| `SpellEditor.tsx:1317` | Property `rawLegacyValue` does not exist on `SpellDamageSpec` | Task 3.7a |
| `SpellEditor.tsx:1949` | Property `rawLegacyValue` does not exist on `SpellDamageSpec` | Task 3.7a |

> The two Storybook `'"action"'` casting-time errors were caught by the full `tsc --noEmit` run; the prior review's filtered output (grepping only `spell.test|SavingThrow|rawLegacyValue|dmGuidance`) masked them. Task 5.4 now has 3 Storybook files to update, not 1.

**Impact on tasks 3.1–3.3:** The three task-3 files themselves are clean (zero TS errors). The errors are in files that will be fixed by tasks 3.7a, 5.4, and 5.5, which depend on tasks 3.1–3.3 being complete. The compile errors are expected pre-completion artifacts, but they **prevent `vitest` and any CI type-check from passing** and must be tracked.

**Specifically for `spell.test.ts`:**

The two stale test cases will **fail at runtime**, not just at compile time:

1. **`"uses dm_adjudicated raw legacy fallback"` (line 47–57):**
   - Test constructs `{ kind: "dm_adjudicated", rawLegacyValue: "DM rules this at runtime" }`
   - `damageToText()` returns `spec.dmGuidance ?? spec.sourceText ?? "DM adjudicated"` = `"DM adjudicated"`
   - Assertion `toBe("DM rules this at runtime")` → **FAILS**
   - Fix (task 5.5): rename field to `sourceText` in the test, and verify `damageToText` returns `sourceText` for `dm_adjudicated`

2. **`"formats dm_adjudicated"` (line 134–145):**
   - Test constructs `{ kind: "dm_adjudicated", dmGuidance: "Save outcome varies by terrain" }`
   - `savingThrowToText()` returns `spec.rawLegacyValue ?? spec.notes ?? "DM adjudicated"` = `"DM adjudicated"`
   - Assertion `toBe("Save outcome varies by terrain")` → **FAILS**
   - Fix (task 5.5): replace `dmGuidance` with `rawLegacyValue` in the test

### 3.Y `damageToText()` read chain for `dm_adjudicated` (Medium)

```typescript
if (spec.kind === "dm_adjudicated")
  return spec.dmGuidance ?? spec.sourceText ?? "DM adjudicated";
```

The function reads `dmGuidance` first, then falls back to `sourceText`. `dmGuidance` is the user's structured narrative text for DM adjudicated damage; `sourceText` is the importer-preserved original string. Reading `dmGuidance` first is the correct priority for user-authored content. However, the `dm_adjudicated` form shape is `{ kind: "dm_adjudicated", dmGuidance?: string, sourceText?: string }`. A spell that has neither will return `"DM adjudicated"` — appropriate default.

This is correct behavior. No change needed. The stale test (F3.X above) is the only issue.

### 3.Z `updateSpec` memoization gap in `SavingThrowInput` vs `DamageForm` (Low)

`DamageForm` wraps `updateSpec` and all mutation helpers in `useCallback`. `SavingThrowInput` does not wrap any of `updateSpec`, `updateSingle`, `addMultiple`, `removeMultiple`, `updateMultipleAt` in `useCallback`. These functions close over `spec` (the rendered-per-render local), so fresh instances are created on every re-render. `SingleSaveForm` receives an `onChange` prop on every render, disrupting potential memoization in child components.

This is a pre-existing pattern in `SavingThrowInput` and is not a new regression introduced by tasks 3.1–3.3. However, the inconsistency with `DamageForm` (which was written to use `useCallback` throughout) is worth flagging for alignment.

---

## Summary Verdict

| Task | Completion | Blocking Issues | Non-Blocking Issues |
|------|------------|-----------------|---------------------|
| **3.1** | ✅ **Complete** | None | F1: `areaToText()` never reads `spec.text` — omission, not just priority order (task 4 behavior); F2: no `spec.text` test coverage; F3: local `formatDicePool` shadow undocumented |
| **3.2** | ✅ **Complete** | None | F4: `notes` hidden for `kind: "none"`; F5: redundant ID generation in `addPart()`; F6: no arithmetic comment on collision fallback |
| **3.3** | ✅ **Complete** | None | F7: `{true && …}` wrapper already resolved; F8: `kind: "multiple"` with empty array after last-remove; F9: index-based keys for multiple saves |

### Cross-Cutting Issues

| Priority | Issue | Affected Files | Fix Owner |
|----------|-------|----------------|-----------|
| **P1 — Test failure** | `spell.test.ts:50` uses `rawLegacyValue` on `SpellDamageSpec` → compile error + runtime assertion failure | `spell.test.ts` | Task 5.5 |
| **P1 — Test failure** | `spell.test.ts:146` uses `dmGuidance` on `SavingThrowSpec` → compile error + runtime assertion failure | `spell.test.ts` | Task 5.5 |
| **P1 — Compile error** | `SavingThrowInput.stories.tsx:95` uses `dmGuidance` on `SavingThrowSpec` | `SavingThrowInput.stories.tsx` | Task 5.4 |
| **P1 — Compile errors (×2)** | `SpellEditorCanonFirst.stories.tsx:331` and `StructuredFieldInput.stories.tsx:206` use `"action"` as `CastingTimeUnit` (removed by task 3.1-G) | `*.stories.tsx` | Task 5.4 |
| **P1 — Compile errors (×4)** | `SpellEditor.tsx` lines 274, 329, 1317, 1949 use stale field names (`rawLegacyValue` on `SpellDamageSpec`, `dmGuidance` on `SavingThrowSpec`) | `SpellEditor.tsx` | Tasks 3.7a |
| **P2 — Display** | `areaToText()` never reads `spec.text` at all — `rawLegacyValue` takes priority over the authoritative normalized text field, which is completely absent from the function | `spell.ts` | Task 4.2 implementation |
| **P3 — Informational** | `removeMultiple()` leaves `kind: "multiple"` with `multiple: undefined` state | `SavingThrowInput.tsx` | Future UX cleanup |

### Overall Assessment

Tasks **3.1**, **3.2**, and **3.3** are **individually complete** and spec-conformant. All P0 data-loss bugs identified in the 2026-02-26 review (field erasure on kind transitions) have been verified as fixed. No blocking issues remain within the scope of these three tasks.

The project-wide build currently has **9 TypeScript compile errors** in `spell.test.ts`, three Storybook story files, and `SpellEditor.tsx` — all caused by the task 3.1 type renames propagating into not-yet-updated files. These are expected intermediary state for a multi-task change and are assigned to tasks 3.7a, 5.4, and 5.5. They do not indicate any defect in the task 3.1–3.3 implementations themselves, but the build will not pass type-check until those tasks are completed.
