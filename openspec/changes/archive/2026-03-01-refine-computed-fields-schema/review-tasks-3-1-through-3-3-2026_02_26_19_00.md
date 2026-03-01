# Three-Pass In-Depth Code Review
## Change: `refine-computed-fields-schema`
## Scope: Tasks `3.1`, `3.2`, `3.3` (Frontend Types & Editor Components)
## Date: 2026-02-26
## Reviewer: Independent fresh pass (not based on prior review)

---

## Review Method

| Pass | Focus | Files Read |
|------|-------|------------|
| **Pass 1 — Spec Contract Audit** | Enumerate every atomic requirement from tasks 3.1–3.3 and cross-reference against the specs (`tasks.md`, `spell-editor-complex-forms/spec.md`, `spell-editor-structured-fields/spec.md`) | tasks.md, specs/* |
| **Pass 2 — Code Reality Audit** | Line-level read of the three implementation files to verify each requirement is satisfied, note line numbers, and flag deviations | `src/types/spell.ts`, `DamageForm.tsx`, `SavingThrowInput.tsx` |
| **Pass 3 — Behavioral & Cross-Cutting Audit** | Evaluate state-transition correctness, field-preservation contracts, ID pattern validity, type-safety gaps, and downstream impact | All three files cross-referenced |

---

## Pass 1 — Spec Contract Audit

### 3.1 TypeScript types (`src/types/spell.ts`)

**Derived from:** `tasks.md §3.1` + `spell-editor-structured-fields/spec.md` (default values section)

| Req ID | Requirement Source | Requirement |
|--------|--------------------|-------------|
| 3.1-A | tasks.md | `text?: string` added to `DurationSpec` |
| 3.1-B | tasks.md | `text?: string` added to `AreaSpec` |
| 3.1-C | tasks.md | `rawLegacyValue?: string` added to `SavingThrowSpec` |
| 3.1-D | tasks.md | `sourceText?: string` added to `MagicResistanceSpec` |
| 3.1-E | tasks.md | `SpellDamageSpec.rawLegacyValue → sourceText` (rename) |
| 3.1-F | tasks.md | `dm_guidance` / `dmGuidance` removed from `SavingThrowSpec`; retained on `SpellDamageSpec` |
| 3.1-G | tasks.md | Remove `"action"`, `"bonus_action"`, `"reaction"` from `CastingTimeUnit` type |
| 3.1-H | tasks.md | Remove same three units from `CASTING_TIME_UNIT_LABELS` |
| 3.1-I | tasks.md | Remove same three units from `defaultCastingTime()` factory |
| 3.1-J | structured-fields spec | `defaultCastingTime()` UI default: `unit: "segment"`, `text: "1 segment"`, `baseValue: 1` |
| 3.1-K | complex-forms spec | `generateDamagePartId()` must match pattern `^[a-z][a-z0-9_]{0,31}$` |
| 3.1-L | complex-forms spec | `defaultDamagePart()` must init `application: { scope: "per_target" }` and `save: { kind: "none" }` |

### 3.2 `DamageForm.tsx`

| Req ID | Requirement Source | Requirement |
|--------|--------------------|-------------|
| 3.2-A | tasks.md | `sourceText` displayed as read-only annotation ("Original source text") for **all** `kind` values when populated |
| 3.2-B | tasks.md / complex-forms spec | `dmGuidance` textarea shown when `kind === "dm_adjudicated"` |
| 3.2-C | tasks.md / complex-forms spec | `notes` textarea shown when `kind === "modeled"` AND when `kind === "dm_adjudicated"` |
| 3.2-D | tasks.md / complex-forms spec | No `dm_guidance` or `notes` when `kind === "none"` |
| 3.2-E | complex-forms spec | New parts must use `application: { scope: "per_target" }` default |
| 3.2-F | complex-forms spec | New parts must use `save: { kind: "none" }` default |
| 3.2-G | complex-forms spec | Part IDs must match pattern `^[a-z][a-z0-9_]{0,31}$` using `part_${Date.now()}_${rand}` format |

### 3.3 `SavingThrowInput.tsx`

| Req ID | Requirement Source | Requirement |
|--------|--------------------|-------------|
| 3.3-A | tasks.md | All bindings to `dm_guidance` removed |
| 3.3-B | tasks.md | `rawLegacyValue` displayed as read-only annotation when populated, for **all** `kind` values |
| 3.3-C | tasks.md / complex-forms spec | `notes` textarea rendered for **all** kinds (none, single, multiple, dm_adjudicated) |
| 3.3-D | complex-forms spec | For `dm_adjudicated`: no SingleSave sub-form is shown; `notes` is the sole editable narrative field |
| 3.3-E | complex-forms spec | For `single`: `SingleSaveForm` sub-form rendered |
| 3.3-F | complex-forms spec | For `multiple`: array of `SingleSaveForm` sub-forms rendered with add/remove controls |

---

## Pass 2 — Code Reality Audit

### Task 3.1 — `src/types/spell.ts`

| Req | Status | Evidence |
|-----|--------|----------|
| **3.1-A** `text?: string` on `DurationSpec` | ✅ | `DurationSpec` interface contains `text?: string` (before `unit?: DurationUnit`) |
| **3.1-B** `text?: string` on `AreaSpec` | ✅ | `AreaSpec` interface contains `text?: string` as its second field |
| **3.1-C** `rawLegacyValue?: string` on `SavingThrowSpec` | ✅ | `SavingThrowSpec` has `rawLegacyValue?: string` field |
| **3.1-D** `sourceText?: string` on `MagicResistanceSpec` | ✅ | `MagicResistanceSpec` has `sourceText?: string` field |
| **3.1-E** Rename `SpellDamageSpec.rawLegacyValue → sourceText` | ✅ | `SpellDamageSpec` has `sourceText?: string`; no `rawLegacyValue` field present |
| **3.1-F** Remove `dmGuidance` from `SavingThrowSpec` | ✅ | `SavingThrowSpec` interface: `kind`, `single?`, `multiple?`, `notes?`, `rawLegacyValue?` — no `dmGuidance` |
| **3.1-F** Retain `dmGuidance` on `SpellDamageSpec` | ✅ | `SpellDamageSpec` retains `dmGuidance?: string` |
| **3.1-G** Remove `"action"\|"bonus_action"\|"reaction"` from `CastingTimeUnit` | ✅ | `CastingTimeUnit` is `"segment"\|"round"\|"turn"\|"hour"\|"minute"\|"special"\|"instantaneous"` — 7 members only |
| **3.1-H** Remove from `CASTING_TIME_UNIT_LABELS` | ✅ | Map has exactly 7 entries matching the 7 `CastingTimeUnit` members |
| **3.1-I** Remove from `defaultCastingTime()` factory | ✅ | Factory returns `{ text: "1 round", unit: "round", baseValue: 1, perLevel: 0, levelDivisor: 1 }` — no invalid unit used |
| **3.1-J** `defaultCastingTime()` UI default should be `unit: "segment"` | ⚠️ **MISMATCH** | Factory returns `unit: "round"`, but `spell-editor-structured-fields/spec.md` (Default Values section) states: *"Casting Time: `baseValue: 1`, `unit: "segment"`, `text: "1 segment"`"*. The task 3.1 text only says to *remove* the invalid units — it does not specify what the new default should be. But the spec is the authoritative definition of what the default should be. |
| **3.1-K** `generateDamagePartId()` must match `^[a-z][a-z0-9_]{0,31}$` | ✅ | Returns `` `part_${Date.now()}_${r}`.slice(0, 32) ``. Starts with `p` (lowercase letter ✅), all subsequent chars are digits, `_`, or lowercase base-36 (a–z, 0–9) ✅, length capped at 32 = `1 + 31` ✅. Pattern satisfied. |
| **3.1-K** Edge case: `r` = empty string when `Math.random() → 0` | ℹ️ | `Math.random().toString(36).substring(2, 9)` would yield `""` if `Math.random()` returns 0 (producing `"0"`). Result: `part_1234567890123_` (18 chars) — still pattern-valid. Extremely low probability; collision guard in `addPart()` handles repeated calls. |
| **3.1-L** `defaultDamagePart()` init defaults | ✅ | Returns `{ id: generateDamagePartId(), damageType: "fire", base: {...}, application: { scope: "per_target" }, save: { kind: "none" } }` |

**Ancillary finding — `areaToText()` field priority:**  
The utility function `areaToText()` tests `if (spec.rawLegacyValue) return spec.rawLegacyValue` as its very first branch, before any structured-field synthesis, even for non-`special` kinds. For a spell with `kind="radius_circle"` that also carries a stale `rawLegacyValue` (e.g., from a pre-migration import), this function returns the legacy string instead of the computed structured display string. This matches the task 4.2 detail-view fallback chain ("rawLegacyValue when .text absent") but creates a possible UX surprise in task 3 editor context if this utility is also used in editor previews. Not a task 3 bug per se, but should be tracked.

**Ancillary finding — `savingThrowToText()` for `dm_adjudicated`:**  
`savingThrowToText()` reads `rawLegacyValue ?? notes ?? "DM adjudicated"` for the `dm_adjudicated` case, which is correct post-`dm_guidance` removal. The task 5.5 Vitest test update will need to match this.

---

### Task 3.2 — `DamageForm.tsx`

| Req | Status | Evidence |
|-----|--------|----------|
| **3.2-A** `sourceText` read-only annotation for all kinds | ✅ | `{spec.sourceText && (<div ...>Original source text:</div>)}` placed above all kind-specific rendering; fires for any truthy `sourceText` regardless of `spec.kind` |
| **3.2-B** `dmGuidance` textarea for `dm_adjudicated` | ✅ | `{spec.kind === "dm_adjudicated" && (<textarea aria-label="DM guidance" ...>)}` |
| **3.2-C** `notes` for `modeled` | ✅ | `{spec.kind !== "none" && (<textarea aria-label="Overall damage notes" ...>)}` — covers `modeled` ✅ |
| **3.2-C** `notes` for `dm_adjudicated` | ✅ | Same `spec.kind !== "none"` condition also covers `dm_adjudicated` ✅ |
| **3.2-D** No `dm_guidance` or `notes` for `none` | ✅ | `spec.kind !== "none"` guards `notes`; `dm_guidance` guard is `spec.kind === "dm_adjudicated"` |
| **3.2-E** New parts: `application: { scope: "per_target" }` | ✅ | `defaultDamagePart()` in `spell.ts` provides this; `addPart()` in `DamageForm` calls `defaultDamagePart()` |
| **3.2-F** New parts: `save: { kind: "none" }` | ✅ | Same path through `defaultDamagePart()` |
| **3.2-G** ID pattern | ✅ | `addPart()` calls `generateDamagePartId()` with a 5-retry collision guard; fallback format `${id.slice(0, 27)}_${rand}.slice(0, 32)` also satisfies the pattern |

**Bug — `sourceText` dropped on kind transition (3.2-A impact):**

The kind `<select>` `onChange` handler creates fresh spec objects on each transition:

```tsx
// none:
onChange({ kind: "none", parts: undefined });

// dm_adjudicated:
onChange({ kind: "dm_adjudicated", dmGuidance: spec.dmGuidance ?? "" });

// modeled:
onChange({ kind: "modeled", combineMode: spec.combineMode ?? "sum", parts });
```

None of these paths forward `spec.sourceText`. Consequence: if the initial loaded spec is `{ kind: "none", sourceText: "1d6 fire" }` and the user changes to `"modeled"`, the emitted value is `{ kind: "modeled", ... }` with no `sourceText`. The annotation — which the spec says to show **for all `kind` values** — silently disappears after the first kind switch.

**Fix:** Thread `sourceText` through all kind-transition paths:

```tsx
// none:
onChange({ kind: "none", parts: undefined, sourceText: spec.sourceText });

// dm_adjudicated:
onChange({ kind: "dm_adjudicated", dmGuidance: spec.dmGuidance ?? "", sourceText: spec.sourceText });

// modeled:
onChange({ kind: "modeled", combineMode: spec.combineMode ?? "sum", parts, sourceText: spec.sourceText });
```

**Secondary concern — `notes` dropped on `dm_adjudicated` transition:**  
Switching to `"dm_adjudicated"` creates `{ kind: "dm_adjudicated", dmGuidance: spec.dmGuidance ?? "" }`, discarding any previously-set `spec.notes`. The spec says `notes` is an optional field on `SpellDamageSpec` across all kinds. While losing notes on a kind switch is not explicitly prohibited by the spec, it is inconsistent with how `SavingThrowInput` is designed (`notes` persists for all kinds there). Recommend also threading `notes: spec.notes` through the kind-transition handlers for `DamageForm`.

---

### Task 3.3 — `SavingThrowInput.tsx`

| Req | Status | Evidence |
|-----|--------|----------|
| **3.3-A** All `dm_guidance` bindings removed | ✅ | Grepping the full file: no occurrence of `dm_guidance`, `dmGuidance`, or `dm guidance` anywhere |
| **3.3-B** `rawLegacyValue` as read-only annotation for all kinds | ✅ | `{spec.rawLegacyValue && (<div ...>Original source text: {spec.rawLegacyValue}</div>)}` — placed above kind-specific rendering; does not require any specific kind to be active |
| **3.3-C** `notes` textarea for **all** kinds | ✅ (functionally) | `{true && (<textarea aria-label="Overall saving throw notes" ...>)}` renders unconditionally |
| **3.3-D** `dm_adjudicated`: no SingleSave sub-form | ✅ | Only `spec.kind === "single"` and `spec.kind === "multiple"` render `SingleSaveForm`; `dm_adjudicated` renders neither |
| **3.3-D** `dm_adjudicated`: `notes` is sole narrative | ✅ | Confirmed by 3.3-C: `notes` appears for all kinds including `dm_adjudicated`; no other editable narrative fields exist |
| **3.3-E** `single`: `SingleSaveForm` rendered | ✅ | `{spec.kind === "single" && spec.single && <SingleSaveForm ...>}` |
| **3.3-F** `multiple`: array with add/remove | ✅ | `spec.multiple?.map(...)` with `Remove` buttons per entry; `addMultiple()` appends `DEFAULT_SINGLE_SAVE` |

**Code smell — `{true && ...}` unconditional render:**  
The `notes` textarea is wrapped in `{true && (<textarea ...>)}`. The inline comment explains the intent: *"Notes is always available in v2 as the primary narrative field after dm_guidance removal"*. The `{true && ...}` is meant as a self-documenting unconditional. However, `true &&` is a no-op that adds visual noise and will likely confuse future readers. The textarea should simply be rendered directly:

```tsx
{/* Notes: always rendered in v2 — sole narrative field after dm_guidance removal */}
<textarea ... />
```

**Bug — `notes` and `rawLegacyValue` dropped on kind transitions:**

The kind `<select>` `onChange` handler creates fresh spec objects:

```tsx
// none:
onChange({ kind: "none" });

// dm_adjudicated:
onChange({ kind: "dm_adjudicated" });

// single:
onChange({ kind: "single", single: spec.single ?? DEFAULT_SINGLE_SAVE });

// multiple:
onChange({ kind: "multiple", multiple: spec.multiple?.length ? spec.multiple : [DEFAULT_SINGLE_SAVE] });
```

All four paths discard `spec.notes` and `spec.rawLegacyValue`. Consequences:

1. **`notes` data loss on kind switch:** User types notes under `single`, switches to `dm_adjudicated` to test it — notes vanish. The spec explicitly states `notes` is a "top-level field on `SavingThrowSpec`, not scoped to any single kind." The kind-transition handler should not act as a notes-wiping operation.

2. **`rawLegacyValue` erasure on kind switch:** `rawLegacyValue` is read-only (set by the importer/parser, not by user input). If it is present on the loaded spec and the user changes the kind selector, `rawLegacyValue` is erased from state. On the next save, the stored value would lose the original legacy string. This is the more critical issue.

**Fix:**

```tsx
// none:
onChange({ kind: "none", notes: spec.notes, rawLegacyValue: spec.rawLegacyValue });

// dm_adjudicated:
onChange({ kind: "dm_adjudicated", notes: spec.notes, rawLegacyValue: spec.rawLegacyValue });

// single:
onChange({ kind: "single", single: spec.single ?? DEFAULT_SINGLE_SAVE, notes: spec.notes, rawLegacyValue: spec.rawLegacyValue });

// multiple:
onChange({ kind: "multiple", multiple: ..., notes: spec.notes, rawLegacyValue: spec.rawLegacyValue });
```

---

## Pass 3 — Behavioral & Cross-Cutting Audit

### 3.A `defaultCastingTime()` default unit discrepancy

The `spell-editor-structured-fields` spec, under **Default Values**, explicitly states:

> **Casting Time**: `baseValue: 1`, `unit: "segment"`, `text: "1 segment"`

The current implementation uses `unit: "round"`, `text: "1 round"`. Both `"segment"` and `"round"` are valid post-cleanup `CastingTimeUnit` values. The task 3.1 requirement text says only to *remove* the three invalid units from the factory — it does not specify the replacement default. Since the structured-fields spec is the authoritative source for component initialization behavior, and it says `"segment"`, the factory is non-conformant.

**Priority:** Medium. Does not affect hashing or migration. Affects UX for new spells only. Will cause task 3.6/5.5 tests to fail if they assert the `"segment"` default. Should be aligned with the spec before task 3.6 is implemented.

### 3.B `sourceText` field preservation in `DamageForm`

See Pass 2, §Task 3.2. The root cause is that all three kind-transition branches construct a new spec object from only the fields relevant to the new kind (a "field reset" pattern). This destroys observer-only fields like `sourceText` that should survive any kind.

The spec requirement is unambiguous: *"display `sourceText` (formerly `rawLegacyValue`) as a read-only labelled annotation for **all** `kind` values, when populated."* The "all kinds" language presupposes the value survives kind transitions.

**Impact:** Affects spells loaded from import before the user has saved them. Potential data loss path: 
1. Open spell with imported `damage.sourceText = "3d6 fire + 2d4 cold"`.
2. Spec loads as `kind: "none"` (parse fallback).
3. User switches to `modeled` to fill in structured data.
4. `sourceText` is lost from state.
5. Save produces a v2 object with no `sourceText`.

**Priority:** High. Data loss for imported spells.

### 3.C `notes` field preservation in kind transitions (both components)

Both `DamageForm` and `SavingThrowInput` drop top-level `notes` on kind transitions. The schema defines `notes` as an optional top-level field on both `SpellDamageSpec` and `SavingThrowSpec`, not scoped to any particular kind. Kind transitions should not clear it.

**Priority:** Medium. `notes` is user-entered data — dropping it silently is unexpected. Less critical than `sourceText` (which is importer-set read-only data) but a UX regression.

### 3.D `rawLegacyValue` field preservation in `SavingThrowInput`

See Pass 2, §Task 3.3. `rawLegacyValue` is populated by the Rust parser at import time and is read-only in the frontend. If it is erased on a kind switch and the spell is then saved, the canonical storage record permanently loses the original legacy string. This is contrary to the spec's intent to *unconditionally preserve* `raw_legacy_value` for all hashed computed fields.

**Priority:** High. Data loss on save after kind switch for any imported spell with a saving throw.

### 3.E `{true && ...}` pattern in `SavingThrowInput`

Minor code quality issue. Already described in Pass 2, §Task 3.3. No behavioral impact.

### 3.F `DamageForm` kind-transition: `dm_adjudicated → none` orphans `dmGuidance`

When switching from `dm_adjudicated` to `none`:

```tsx
onChange({ kind: "none", parts: undefined });
```

The previous `dmGuidance` string is discarded. If the user switches back to `dm_adjudicated`, `dmGuidance` is re-initialized: `dmGuidance: spec.dmGuidance ?? ""`. At this point `spec.kind` is `"none"` (the form's current state), so `spec.dmGuidance` is `undefined` and the field is reset to `""`. User loses their previously typed DM guidance.

This is consistent with the general pattern of the component (all kind-specific sub-fields are cleared on kind change) and is probably acceptable UX. Calling it out for awareness.

### 3.G `addPart()` collision guard correctness

The collision guard in `DamageForm.addPart()`:

```tsx
let id = generateDamagePartId();
for (let i = 0; i < 5 && existingIds.has(id); i++) {
  id = generateDamagePartId();
}
if (existingIds.has(id)) {
  id = `${id.slice(0, 27)}_${Math.random().toString(36).slice(2, 6)}`.slice(0, 32);
}
const part = defaultDamagePart();
part.id = id;
```

Note: `defaultDamagePart()` internally calls `generateDamagePartId()` again (inside `spell.ts`). The mutation `part.id = id` then overwrites it with the collision-checked ID. This is correct. However, there is a subtle issue: the final fallback `slice(0, 32)` on the fallback suffix `${id.slice(0, 27)}_${Math.random().toString(36).slice(2, 6)}` — `27 + 1 + 4 = 32` characters exactly, so the `.slice(0, 32)` is a no-op identity (the string is already 32 chars). This is fine but slightly confusing. Suggest adding a comment noting the arithmetic.

### 3.H `SavingThrowInput` multiple-saves key stability

The `key` for the `multiple` list items:

```tsx
key={`save-${idx}-${s.saveType}-${s.appliesTo}`}
```

Using `idx` in the key means React reconciliation is index-stable. Inserting or reordering saves would cause reconciliation thrashing. For the current `addMultiple()` (appends at end) and `removeMultiple()` (filters by index) pattern, this is acceptable but would become an issue if arbitrary insertion were added. Noted for future-proofing; not a task 3 deficiency.

---

## Summary Verdict

| Task | Completion | Blocking Issues | Non-Blocking Issues |
|------|-----------|-----------------|---------------------|
| **3.1** | ✅ **Complete** | None | ~~⚠️ `defaultCastingTime()` returns `unit: "round"` but spec says `unit: "segment"`~~ **Fixed 2026-02-26** |
| **3.2** | ✅ **Complete** (post-fix) | ~~🔴 `sourceText` silently dropped on every damage kind transition~~ **Fixed 2026-02-26** | ~~🟡 `notes` dropped on `dm_adjudicated` kind transition~~ **Fixed 2026-02-26** |
| **3.3** | ✅ **Complete** (post-fix) | ~~🔴 `rawLegacyValue` dropped on every saving throw kind transition~~ **Fixed 2026-02-26** ~~🔴 `notes` dropped on all kind transitions~~ **Fixed 2026-02-26** | ~~🟡 `{true && ...}` wrapper on `notes` textarea~~ **Fixed 2026-02-26** |

### Prioritized Fix List

| Priority | File | Issue | Status |
|----------|------|-------|--------|
| P0 — Data Loss | `DamageForm.tsx` | Thread `sourceText: spec.sourceText` through all three kind-transition branches in the kind `<select>` onChange handler | ✅ **Fixed 2026-02-26** |
| P0 — Data Loss | `SavingThrowInput.tsx` | Thread `rawLegacyValue: spec.rawLegacyValue` through all four kind-transition branches in the kind `<select>` onChange handler | ✅ **Fixed 2026-02-26** |
| P1 — Data Loss | `SavingThrowInput.tsx` | Thread `notes: spec.notes` through all four kind-transition branches | ✅ **Fixed 2026-02-26** |
| P1 — Data Loss | `DamageForm.tsx` | Thread `notes: spec.notes` through all three kind-transition branches | ✅ **Fixed 2026-02-26** |
| P2 — Spec Conformance | `spell.ts` | Change `defaultCastingTime()` to return `unit: "segment"`, `text: "1 segment"` (aligns with structured-fields spec Default Values section) | ✅ **Fixed 2026-02-26** |
| P3 — Code Quality | `SavingThrowInput.tsx` | Replace `{true && (<textarea ...>)}` with a direct unconditional textarea render | ✅ **Fixed 2026-02-26** |

### Resolution

All 6 issues from the fix list were implemented and verified on **2026-02-26**. TypeScript reports zero errors across all three files post-fix. Tasks 3.1, 3.2, and 3.3 are now fully conformant with their spec requirements.
