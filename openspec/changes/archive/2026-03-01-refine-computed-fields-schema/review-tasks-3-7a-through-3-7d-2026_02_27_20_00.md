# Three-Pass In-Depth Code Review
## Change: `refine-computed-fields-schema`
## Scope: Tasks `3.7a`, `3.7b`, `3.7c`, `3.7d` (SpellEditor.tsx — loading, parsers, save path; WarningBanner.tsx)
## Review Date: 2026-02-27 | Fixes Applied: 2026-02-28

> **All 6 findings fixed and committed** on `refine-computed-fields` branch.
> A 7th finding (Delete button not guarded) was surfaced by the post-fix three-pass review and also fixed.
>
> | Commit | Fix |
> |--------|-----|
> | `42f43bd` | F1 — `normalizeSavingThrowSpec` preserves `rawLegacyValue` |
> | `722cf69` | F2 — `mapLegacySavingThrow` 6-row matrix + `rawLegacyValue` on all returns |
> | `8bbf4c7` | F3 — `mapLegacyMagicResistance` adds `sourceText: legacy`; F4 — fieldset disabled wrapper |
> | `7fb6acb` | F5 — removed 5e units from `CASTING_TIME_UNITS`; F6 — `validateSpellDamageSpec` checks `sourceText` |
> | `8072b02` | F7 — Delete button disabled during `parsersPending` |

---

## Review Method

| Pass | Focus | Files Read |
|------|-------|------------|
| **Pass 1 — Spec Requirement Matrix** | Line-level audit against tasks.md 3.7a–d, `spell-editor-data-loading/spec.md`, and `importers/spec.md`; check each requirement box | `SpellEditor.tsx`, `WarningBanner.tsx`, `parserValidation.ts`, `spell.ts` |
| **Pass 2 — Data-Flow Correctness** | Trace every field through: canonical load normalizer → state → save path; verify no field is dropped, mis-named, or left as the wrong type | Same files + cross-reference type definitions |
| **Pass 3 — Edge Cases & Cross-Cutting** | Race conditions, defensive-in-depth gaps, banner lifecycle invariants, nav-guard integration | Same files |

---

## Pass 1 — Spec Requirement Matrix

### Task 3.7a — `SpellEditor.tsx`: canonical_data loading and normalization

| Req | Source | Requirement | Status | Evidence |
|-----|--------|-------------|--------|----------|
| 3.7a-A | tasks.md | v1 `dm_guidance → notes` remap on `SavingThrowSpec` | ✅ | `normalizeSavingThrowSpec` lines 213–228: reads `s.dmGuidance ?? s.dm_guidance`, appends to `notes` with `"\n"` separator when `notes` non-empty; falsy guard on empty string treated as absent per comment |
| 3.7a-B | tasks.md | v1 `SpellDamageSpec.raw_legacy_value → sourceText` remap | ✅ | `normalizeDamageSpec` line 183: `sourceText: (d.sourceText ?? d.source_text ?? d.rawLegacyValue ?? d.raw_legacy_value)` — falls through the chain, preferring v2 `sourceText` |
| 3.7a-C | tasks.md | Prefer `sourceText` when both `sourceText` and `rawLegacyValue` are present on `SpellDamageSpec` | ✅ | Same expression — `d.sourceText ?? d.source_text` evaluated before `d.rawLegacyValue` |
| 3.7a-D | tasks.md / spec | Loose equality `== null` for missing-field checks | ✅ | `const canonicalHasMaterialComponentsSpec = canonicalRaw["material_components"] != null` line 783, and `decideCanonicalField` uses `== null` predicate throughout |
| 3.7a-E | tasks.md / spec | `snake_case → camelCase` conversion for canonical_data keys | ✅ | All normalizer functions (`normalizeAreaSpec`, `normalizeDamageSpec`, `normalizeSavingThrowSpec`, etc.) explicitly read both `snake_case` and `camelCase` aliases with `??` fallback |
| **3.7a-F** | tasks.md / spec | `SavingThrowSpec.rawLegacyValue` preserved from canonical_data | ✅ | Fixed `42f43bd` — `rawLegacyValue: (s.rawLegacyValue ?? s.raw_legacy_value)` added to `normalizeSavingThrowSpec` return (Finding F1) |

---

### Task 3.7b — `SpellEditor.tsx`: parser dispatch and validation

| Req | Source | Requirement | Status | Evidence |
|-----|--------|-------------|--------|----------|
| 3.7b-A | tasks.md | Parser commands dispatched in parallel (`Promise.all`) | ✅ | `buildParserTasks` returns array; caller calls `Promise.all(parserTasks)` at lines 967 and 1037; both canonical-data-with-gaps path and no-canonical-data path use the same pattern |
| 3.7b-B | tasks.md | Form in loading/disabled state while parsers in flight | ✅ | Fixed `8bbf4c7` — `<fieldset disabled={parsersPending} className="contents">` wraps all form inputs (Finding F4) |
| 3.7b-C | tasks.md | Zod / type guard validation for Tauri parser responses | ✅ | `parserValidation.ts` implements `validateRangeSpec`, `validateDurationSpec`, `validateSpellCastingTime`, `validateAreaSpec`, `validateSpellDamageSpec`; each validates structure and key-field types |
| 3.7b-D | tasks.md | Validation failure → `kind: "special"` fallback + warning banner (non-damage fields) | ✅ | Every `.then()` branch in `buildParserTasks` checks `validateX(parsed)`, calls `toSpecialXSpec(legacy)` and `setters.addParserFallback` on failure |
| 3.7b-E | tasks.md | `SpellDamageSpec` failure → `kind: "none"` with `sourceText`; no banner | ✅ | Damage branch (line 515): `setters.setStructuredDamage({ kind: "none", sourceText: legacy })` — no `addParserFallback` call |
| 3.7b-F | tasks.md | `savingThrow` / `magicResistance`: client-side fallback, no invoke | ✅ | Both use `mapLegacySavingThrow` / `mapLegacyMagicResistance`; no `invoke` call in either path |
| 3.7b-G | tasks.md / spec | Saving throw: common 2e strings → `save_type` + `save_vs` per the 6-row matrix | ✅ | Fixed `722cf69` — 6-row matrix implemented in `mapLegacySavingThrow`; `rawLegacyValue: legacy` on all non-`none` returns (Finding F2) |
| 3.7b-H | tasks.md / spec | Magic resistance: "Yes" → `normal`, "No" → `ignores_mr`, descriptive → `special` with `sourceText` | ✅ | Fixed `8bbf4c7` — `sourceText: legacy` added to `kind: "special"` return in `mapLegacyMagicResistance` (Finding F3) |
| **3.7b-I** | spec | Removed 5e units rejected by `validateSpellCastingTime` | ✅ | Fixed `7fb6acb` — `"action"`, `"bonus_action"`, `"reaction"` removed from `CASTING_TIME_UNITS` with explanatory comment (Finding F5) |

---

### Task 3.7c — `SpellEditor.tsx`: save path

| Req | Source | Requirement | Status | Evidence |
|-----|--------|-------------|--------|----------|
| 3.7c-A | tasks.md | Save path always produces v2-shaped `canonical_data` | ✅ | `toV2SavingThrowSpec` strips `dmGuidance` / `dm_guidance` before constructing save payload (line 365); `toV2SpellDamageSpec` migrates `rawLegacyValue → sourceText` and deletes old key (line 376); both applied at lines 1764–1769 |
| 3.7c-B | tasks.md | No `dm_guidance` on `SavingThrowSpec` at save time | ✅ | `toV2SavingThrowSpec` deletes both `dmGuidance` and `dm_guidance` defensively |
| 3.7c-C | tasks.md | `sourceText` (not `rawLegacyValue`) on `SpellDamageSpec` at save time | ✅ | `toV2SpellDamageSpec` copies `rawLegacyValue → sourceText` if `sourceText` absent, then deletes `rawLegacyValue` / `raw_legacy_value` |

---

### Task 3.7d — `WarningBanner.tsx`: banner UX and nav guard

| Req | Source | Requirement | Status | Evidence |
|-----|--------|-------------|--------|----------|
| 3.7d-A | tasks.md | Non-dismissible (no dismiss button) | ✅ | `WarningBanner` renders a `<div role="alert">` with no button or close control |
| 3.7d-B | tasks.md | Per-field dismissal on edit | ✅ | `handleChange` line 1181: calls `setParserFallbackFields` removing the fallback label for the edited field |
| 3.7d-C | tasks.md | Per-field dismissal on successful save (fields at `kind: "special"` also dismissed) | ✅ | Post-save path line 1833: `setParserFallbackFields(new Set())` clears all fields after successful save |
| 3.7d-D | tasks.md | Banner persists after failed save | ✅ | The `catch` block in `save()` only shows a modal alert; `setParserFallbackFields` is NOT called in the catch/finally, so the set is unchanged |
| 3.7d-E | tasks.md | Nav guard: confirm only when banner active AND unsaved changes; integrates with existing guard | ✅ | `useBlocker(hasUnsavedState)` — triggers on unsaved changes; the blocker effect checks `parserFallbackFieldsRef.current.size > 0` to select the enhanced message ("You have unparsed fields…") vs generic message; a single intercept handles both cases |

---

## Pass 2 — Data-Flow Correctness

### Finding F1 (Important — Data Loss Bug) ✅ FIXED `42f43bd` — `normalizeSavingThrowSpec` drops `rawLegacyValue`

**Location:** `apps/desktop/src/ui/SpellEditor.tsx`, lines 213–228 (`normalizeSavingThrowSpec`)

**Evidence:**

```tsx
function normalizeSavingThrowSpec(s: Record<string, unknown>): SavingThrowSpec {
  const existingNotes = s.notes as string | undefined;
  const dmGuidanceVal = (s.dmGuidance ?? s.dm_guidance) as string | undefined;
  const notes = dmGuidanceVal
    ? existingNotes
      ? `${existingNotes}\n${dmGuidanceVal}`
      : dmGuidanceVal
    : existingNotes;
  return {
    kind: (s.kind as SavingThrowSpec["kind"]) ?? "none",
    single: normalizeSingleSave(s.single),
    multiple: (s.multiple as unknown[] | undefined)
      ?.map(normalizeSingleSave)
      .filter(Boolean) as SingleSave[],
    notes: notes as string | undefined,
    // ← rawLegacyValue is ABSENT from this return object
  } as SavingThrowSpec;
}
```

The `SavingThrowSpec` interface (task 3.3) was updated to include `rawLegacyValue?: string`. After `normalize()` runs on the backend, `saving_throw.raw_legacy_value` is stored in `canonical_data`. When the editor loads a canonically-stored spell, `normalizeSavingThrowSpec` is called with the raw JSON object — but the returned object never reads `s.rawLegacyValue ?? s.raw_legacy_value`. The consequence:

1. `structuredSavingThrow.rawLegacyValue` is always `undefined` for canonically-loaded spells.
2. `SavingThrowInput.tsx` shows the `rawLegacyValue` annotation only when populated, so the annotation is silent for all existing loaded spells even when the backend has data.
3. Round-tripping a correctly-stored spell through the editor strips `rawLegacyValue` from the next `canonical_data` write (the v2 save strips `dm_guidance`, not `rawLegacyValue`). The field is dropped on the next save.

**Recommended fix:**

```tsx
function normalizeSavingThrowSpec(s: Record<string, unknown>): SavingThrowSpec {
  // …existing notes/dmGuidance logic…
  return {
    kind: (s.kind as SavingThrowSpec["kind"]) ?? "none",
    single: normalizeSingleSave(s.single),
    multiple: (s.multiple as unknown[] | undefined)
      ?.map(normalizeSingleSave)
      .filter(Boolean) as SingleSave[],
    notes: notes as string | undefined,
    rawLegacyValue: (s.rawLegacyValue ?? s.raw_legacy_value) as string | undefined,  // ← ADD
  } as SavingThrowSpec;
}
```

---

### Finding F2 (Important — Spec Gap) ✅ FIXED `722cf69` — `mapLegacySavingThrow` ignores the 6-row `save_type`/`save_vs` matrix

**Location:** `apps/desktop/src/ui/SpellEditor.tsx`, lines 296–337

**Evidence:**

```tsx
function mapLegacySavingThrow(legacy: string): SavingThrowSpec {
  // …negates / half / partial branches each return:
  return {
    kind: "single",
    single: {
      saveType: "spell",     // ← always "spell" regardless of source text
      onSuccess: { result: "..." },
      onFailure: { result: "full_effect" },
    },
  };
}
```

The spec (`importers/spec.md` §Legacy Save Mapping and task 3.7b) requires the client-side fallback to resolve common 2e strings to the full `save_type` + `save_vs` pair, matching the 6-row matrix (same logic as `parse_single_save_intern` in `mechanics.rs`). The current function maps only the *outcome* (negates / half / partial) but always assigns `saveType: "spell"` — ignoring whether the source text says "Poison", "Breath", "Rod/Staff/Wand", "Polymorph", etc.

**Examples of incorrect mapping:**

| Input string | Expected `saveType` | Expected `saveVs` | Actual `saveType` | Gap |
|---|---|---|---|---|
| `"Save vs. Poison, negates"` | `"paralyzation_poison_death"` | `"poison"` | `"spell"` | ❌ Wrong save category and vs |
| `"Save vs. Breath Weapon, half damage"` | `"breath_weapon"` | `"breath"` | `"spell"` | ❌ Wrong |
| `"Save vs. Rod, Staff, or Wand"` | `"rod_staff_wand"` | `"other"` | falls through to `dm_adjudicated` | ❌ Never structured |
| `"Save vs. Petrification negates"` | `"petrification_polymorph"` | `"petrification"` | `"spell"` | ❌ Wrong |

Additionally, `rawLegacyValue` is not populated on the structured results. The spec (§"SavingThrowSpec Legacy Value Population") says `raw_legacy_value` MUST be set unconditionally for every parse call. The client-side mapping must also preserve the source string in `rawLegacyValue`.

**Recommended fix:** Implement the 6-row matrix inline in `mapLegacySavingThrow`, applied first, followed by the outcome detection for `onSuccess`/`onFailure`. Always set `rawLegacyValue: legacy` on every returned `SavingThrowSpec`. Example structure:

```tsx
function mapLegacySavingThrow(legacy: string): SavingThrowSpec {
  const normalized = normalizeLegacyText(legacy);
  if (!normalized || hasTokenPattern(normalized, /^(none|no|n\/a|na|nil|—|-)$|\bno save\b/)) {
    return { kind: "none" };
  }

  // --- 6-row save_type/save_vs matrix (first match wins) ---
  let saveType: SaveType = "spell";
  let saveVs: string = "spell";
  if (hasTokenPattern(normalized, /\bparaly\b|\bpoison\b|\bdeath\b/)) {
    saveType = "paralyzation_poison_death";
    saveVs = hasTokenPattern(normalized, /\bpoison\b/) ? "poison" : "death_magic";
  } else if (hasTokenPattern(normalized, /\bbreath\b/)) {
    saveType = "breath_weapon";
    saveVs = "breath";
  } else if (hasTokenPattern(normalized, /\brod\b|\bstaff\b|\bwand\b/)) {
    saveType = "rod_staff_wand";
    saveVs = "other";
  } else if (hasTokenPattern(normalized, /\bpoly\b|\bpetrif\b/)) {
    saveType = "petrification_polymorph";
    saveVs = hasTokenPattern(normalized, /\bpoly\b/) ? "polymorph" : "petrification";
  } else if (hasTokenPattern(normalized, /\bspecial\b/)) {
    saveType = "special";
    // saveVs remains "spell" (default)
  }
  // else: fall through to saveType = "spell" / saveVs = "spell"

  // --- Outcome detection ---
  let onSuccess: SaveOutcomeEffect = { result: "no_effect" };
  if (hasTokenPattern(normalized, /\bhalf\b|\b1\s*\/\s*2\b/)) {
    onSuccess = { result: "reduced_effect" };
  } else if (hasTokenPattern(normalized, /\bpartial\b/)) {
    onSuccess = { result: "partial_non_damage_only" };
  }

  // dm_adjudicated fallback — no structured outcome detected
  if (!hasTokenPattern(normalized, /\bnegat(?:e|es|ed|ing)?\b|\bhalf\b|\b1\s*\/\s*2\b|\bpartial\b/)) {
    return { kind: "dm_adjudicated", rawLegacyValue: legacy };
  }

  return {
    kind: "single",
    single: {
      saveType,
      saveVs,
      onSuccess,
      onFailure: { result: "full_effect" },
    },
    rawLegacyValue: legacy,  // Always populated per spec
  };
}
```

---

### Finding F3 (Important — Spec Gap) ✅ FIXED `8bbf4c7` — `mapLegacyMagicResistance` missing `sourceText` for `kind: "special"`

**Location:** `apps/desktop/src/ui/SpellEditor.tsx`, lines 340–360

**Evidence:**

```tsx
// Current:
return { kind: "special", appliesTo: "whole_spell", specialRule: legacy };
```

Task 3.7b specifies: "Magic resistance: '20%' / descriptive strings → `kind: 'special'` with original string in `sourceText`". The `sourceText` field is the provenance annotation shown read-only in `MagicResistanceInput` (task 3.4). The `specialRule` field is the user-editable structured text input for special MR behaviour. These are distinct roles:

- `sourceText`: non-hashed, read-only, original importer provenance
- `specialRule`: user-editable, describes the custom MR rule

When loading a legacy MR value of `"20% partial (see text)"` via `mapLegacyMagicResistance`, the result has `specialRule: "20% partial (see text)"` but `sourceText: undefined`. The consequence: `MagicResistanceInput` shows the editable `specialRule` textarea but the "Original source text" annotation (`sourceText`) never appears — the user sees no indication of what the original source said, defeating the provenance annotation added in task 3.4.

**Recommended fix:**

```tsx
return {
  kind: "special",
  appliesTo: "whole_spell",
  specialRule: legacy,      // editable special-rule field
  sourceText: legacy,       // provenance annotation (non-hashed, read-only in UI)
};
```

---

### Finding F4 (Medium — Spec Gap) ✅ FIXED `8bbf4c7` — Form inputs not disabled during `parsersPending`

**Location:** `apps/desktop/src/ui/SpellEditor.tsx`, line 1978 (Save button) and the form body

**Evidence:**

```tsx
// Only the Save button is gated:
<button
  id="btn-save-spell"
  disabled={parsersPending}
  …
>
  Save Spell
</button>

// No fieldset disabled={parsersPending} wrapping the form inputs.
// Name input (line ~2041), level, description, school, etc. are NOT disabled.
```

The spec (`spell-editor-data-loading/spec.md` §Hybrid Canonical Data and §Legacy String Parsing) explicitly requires: "while parser invocations are in flight, the editor MUST render the form in a **loading/disabled state** until all pending parser calls resolve."

"Loading/disabled state" in context means form inputs are not interactable, not merely that the Save button is locked. The risk without full disabling:

1. User edits `form.range` while `parse_spell_range` is still in flight.
2. Parser resolves → `setStructuredRange(parsed)` is called, populating `structuredRange` with the backend's result.
3. At save time, `structuredRange` (the stale parser result) is used to build `rangeSpec`; the user's manual edit to the range text field is overwritten in the canonical data.

The "Parsing fields…" indicator banner does communicate loading visually, but does not prevent interaction.

**Recommended fix:** Wrap the form body in a `<fieldset disabled={parsersPending}>` or disable each input individually. The `<fieldset disabled>` approach is a single change and browsers propagate the disabled state to all descendant form controls:

```tsx
<fieldset disabled={parsersPending} className="contents">
  {/* all form inputs */}
</fieldset>
```

Alternatively, add `disabled={parsersPending}` to only the affected field group (the detail-field expansion area) since the name/level/description fields don't directly interact with parser state.

---

### Finding F5 (Medium — Defense-in-Depth Gap) ✅ FIXED `7fb6acb` — `CASTING_TIME_UNITS` in `parserValidation.ts` still includes removed 5e units

**Location:** `apps/desktop/src/lib/parserValidation.ts`, lines 43–54

**Evidence:**

```typescript
const CASTING_TIME_UNITS: Set<string> = new Set([
  "segment",
  "round",
  "turn",
  "hour",
  "minute",
  "action",        // ← removed from schema in task 1.1 / type in task 3.1
  "bonus_action",  // ← removed
  "reaction",      // ← removed
  "special",
  "instantaneous",
]);
```

Tasks 3.1 removed `"action"`, `"bonus_action"`, and `"reaction"` from `CastingTimeUnit` type, `CASTING_TIME_UNIT_LABELS`, and `defaultCastingTime()`. The validator set was not updated in sync. The behavioral consequence:

If the Rust backend returns a `SpellCastingTime` with `unit: "action"` from a pre-migration v1 spell (the Rust shim normalizes before `validate()`, but direct canonical-data reads bypass `normalize()`), `validateSpellCastingTime` returns `true` and the spec is applied as-is. The editor silently accepts an invalid unit without triggering the `kind: "special"` fallback and the warning banner. This violates the spec's "defense-in-depth" intent: removed units reaching the frontend should be treated as parse failures.

Note: This is a defense-in-depth gap, not a primary logic error — pre-migration spells are expected to have their `casting_time.unit` already remapped to `"special"` by the Rust shim before `canonical_data` is written. But keeping these units in the validator set means the frontend cannot detect the case where a v1 unit slips through.

**Recommended fix:**

```typescript
const CASTING_TIME_UNITS: Set<string> = new Set([
  "segment",
  "round",
  "turn",
  "hour",
  "minute",
  // "action", "bonus_action", "reaction" removed in v2 schema (task 3.1)
  "special",
  "instantaneous",
]);
```

---

### Finding F6 (Low — Stale Field Reference) ✅ FIXED `7fb6acb` — `validateSpellDamageSpec` checks `rawLegacyValue` on `dm_adjudicated`

**Location:** `apps/desktop/src/lib/parserValidation.ts`, lines 271–273

**Evidence:**

```typescript
if (kind === "dm_adjudicated") {
  if (d.rawLegacyValue != null && typeof d.rawLegacyValue !== "string") return false;
}
```

`SpellDamageSpec.rawLegacyValue` was renamed to `sourceText` (task 3.1). The validator still inspects the old key. `normalizeDamageSpec` handles the migration transparently, so this is not a correctness bug. However, the validator is checking a field that no longer exists in the v2 model. New spells emitted from the backend will not carry `rawLegacyValue`, so the check is a no-op. The validator should be updated to reflect the renamed field:

```typescript
if (kind === "dm_adjudicated") {
  // sourceText replaced rawLegacyValue on SpellDamageSpec in v2 schema (task 3.1)
  if (d.sourceText != null && typeof d.sourceText !== "string") return false;
}
```

---

## Pass 3 — Cross-Cutting & Edge-Case Audit

### A. `parserFallbackFields` lifecycle invariants

| Lifecycle event | Behavior | Status |
|---|---|---|
| Parser returns fallback (parallel load) | `addParserFallback(field)` adds to Set | ✅ |
| Parser returns fallback (expand-on-demand) | `setParserFallbackFields((prev) => new Set([...prev, "Field"]))` | ✅ |
| User edits canon text field | `next.delete(fallbackLabel)` in `handleChange` | ✅ |
| User edits structured sub-field (e.g. kind) | `setDetailDirtyFor` → `setParserFallbackFields` NOT called | Acceptable — structured edit does not dismiss; only canon-text edit dismisses per-field |
| Successful save | `setParserFallbackFields(new Set())` clears all | ✅ |
| Failed save | No call to `setParserFallbackFields` (persists) | ✅ |
| Spell load / route change | `resetStructuredLoadState()` calls `setParserFallbackFields(new Set())` | ✅ |
| Nav guard prompt when banner active + unsaved changes | `hasBannerActive && unsavedRef.current` both checked | ✅ |
| Nav guard when NO unsaved changes but banner active | `useBlocker(hasUnsavedState)` → blocker fires only if `hasUnsavedState`; if `hasUnsavedState` is false the blocker does not intercept → navigation proceeds | ✅ matches spec ("If the form has no unsaved changes, navigation away is permitted without a prompt") |

All banner lifecycle invariants are correctly implemented. Note: F3 (`sourceText` now populated in `mapLegacyMagicResistance`) does not affect banner population — the banner check is `kind === "special"`, which is unchanged. F1 (`rawLegacyValue` now preserved) does not affect banner population but does correctly populate the `SavingThrowInput` annotation display.

### B. Race-condition analysis for parallel parsers

`buildParserTasks` uses an `isActive` closure variable (from `let isActive = true` in the containing `useEffect`). Each `.then()` / `.catch()` handler checks `if (!getIsActive()) return`. This correctly guards against stale parser results after the component unmounts or the spell changes.

For the on-demand expand path (`expandDetailField`), `expandRequestId.current` is incremented on each expand, and results are abandoned if `requestId !== expandRequestId.current`. Both race guards are present and correct. ✅

However, with F4 (form not disabled during `parsersPending`), there was a race vector: after the user edits a canon field (e.g., manually types in the range textarea), `handleChange("range", ...)` clears `structuredRange`. If a parallel load parser then resolved _after_ this edit, `setStructuredRange(parsed)` would overwrite the user's intent — the `isActive` guard protects only against unmount/route-change, not against user interaction. **F4 (fixed `8bbf4c7`) closes this race** by making form inputs non-interactable while parsers are in flight.

### C. Snake_case → camelCase conversion completeness

| Field | Conversion Applied | Status |
|---|---|---|
| `range.raw_legacy_value → rawLegacyValue` | Line 804: `rawLegacyValue: r.raw_legacy_value ?? r.rawLegacyValue` | ✅ |
| `duration.raw_legacy_value → rawLegacyValue` | Line 831: same pattern | ✅ |
| `casting_time.raw_legacy_value → rawLegacyValue` | Line 858: `c.rawLegacyValue ?? c.raw_legacy_value` | ✅ |
| `area.raw_legacy_value → rawLegacyValue` | `normalizeAreaSpec` line 126: `a.rawLegacyValue ?? a.raw_legacy_value` | ✅ |
| `damage.raw_legacy_value → sourceText` | `normalizeDamageSpec` line 183: four-way fallback | ✅ |
| `damage.dm_guidance → dmGuidance` | Line 184: `d.dmGuidance ?? d.dm_guidance` | ✅ |
| `saving_throw.dm_guidance → notes` | `normalizeSavingThrowSpec` lines 215–222 | ✅ |
| `saving_throw.raw_legacy_value → rawLegacyValue` | `normalizeSavingThrowSpec` line 229: `rawLegacyValue: (s.rawLegacyValue ?? s.raw_legacy_value)` | ✅ Fixed `42f43bd` |
| `magic_resistance.source_text → sourceText` | `normalizeMagicResistanceSpec` line 245: `m.sourceText ?? m.source_text` | ✅ |
| `magic_resistance.special_rule → specialRule` | Line 242: `m.specialRule ?? m.special_rule` | ✅ |
| `magic_resistance.part_ids → partIds` | Line 241: `m.partIds ?? m.part_ids` | ✅ |

`saving_throw.raw_legacy_value` is the only field in the conversion inventory that is missing (Finding F1). All other snake_case → camelCase conversions are present.

### D. `toV2SavingThrowSpec` and `toV2SpellDamageSpec` save-path defense

Both functions correctly emit v2 shapes:
- `toV2SavingThrowSpec`: deletes `dmGuidance` and `dm_guidance` defensively. Does not touch `rawLegacyValue` (correct — `rawLegacyValue` IS a v2 field on `SavingThrowSpec` and must be preserved on save). ✅
- `toV2SpellDamageSpec`: migrates `rawLegacyValue → sourceText` (last-resort), then deletes both `rawLegacyValue` and `raw_legacy_value`. Does not delete `sourceText`. ✅

One subtle point: `toV2SpellDamageSpec` deletes `rawLegacyValue` even if `sourceText` was already populated. This is correct — sending `rawLegacyValue` to the v2 backend would fail schema validation.

### E. WarningBanner `fields` prop: `Set → Array` conversion

The banner is invoked as `<WarningBanner fields={[...parserFallbackFields]} />`. Converting the `Set<string>` to an array via spread is correct, but insertion order of `Set` in JavaScript follows insertion sequence, not alphabetical. Fields will appear in the banner in the order they were parsed (typically Range, Duration, CastingTime, Area, SavingThrow, MagicResistance), which is a reasonable display order. ✅

The `fields.join(" and ")` in `WarningBanner` produces "Range and Duration and Area" for three fields — the Oxford-comma-free join may read awkwardly for three or more fields. This is cosmetic (P4), no fix required.

---

## Pass 3 — Post-Fix Three-Pass Review (2026-02-28)

A second three-pass review was performed after all fixes were committed to verify correctness and check for regressions.

**Pass 1 (Spec Matrix):** All 6 original findings verified fully spec-compliant in code. ✅ 6/6

**Pass 2 (Data-Flow):** Seven specific data-flow paths traced — saving_throw `rawLegacyValue` round-trip, "Save vs. Poison, negates" through the 6-row matrix, "Save vs. Rod, Staff, or Wand" → `dm_adjudicated`, MR `sourceText` population, fieldset scope, removed-unit rejection, `sourceText` validation. All correct. ✅ 7/7

**Pass 3 (Edge Cases):** Found one secondary issue:

### Finding F7 (Medium) ✅ FIXED `8072b02` — Delete button callable during `parsersPending`

The Delete button (`id="btn-delete-spell"`) is rendered outside the `<fieldset disabled={parsersPending}>` scope (in the header bar, above line 2036). `handleDelete` invokes the Tauri backend while parallel parser tasks are concurrently writing React state — a potential race that could result in stale state after a successful delete. `disabled={parsersPending}` added to the Delete button.

Print buttons (Print Compact, Print Stat-block) are also outside the fieldset; they were noted but not gated since printing stale structured data is low-severity and does not corrupt backend state.

---

## Finding Summary

| ID | Component | Severity | Status | Commit | Description |
|----|-----------|----------|--------|--------|-------------|
| **F1** | `SpellEditor.tsx` — `normalizeSavingThrowSpec` | P2 — Important | ✅ Fixed | `42f43bd` | `rawLegacyValue: (s.rawLegacyValue ?? s.raw_legacy_value)` added to return object |
| **F2** | `SpellEditor.tsx` — `mapLegacySavingThrow` | P2 — Important | ✅ Fixed | `722cf69` | 6-row `save_type`/`save_vs` matrix implemented; `rawLegacyValue: legacy` on all non-`none` returns |
| **F3** | `SpellEditor.tsx` — `mapLegacyMagicResistance` | P2 — Important | ✅ Fixed | `8bbf4c7` | `sourceText: legacy` added alongside `specialRule: legacy` on `kind: "special"` return |
| **F4** | `SpellEditor.tsx` — form disabled state | P3 — Medium | ✅ Fixed | `8bbf4c7` | `<fieldset disabled={parsersPending} className="contents">` wraps all form inputs (lines 2036–2582); race vector closed |
| **F5** | `parserValidation.ts` — `CASTING_TIME_UNITS` | P3 — Medium | ✅ Fixed | `7fb6acb` | `"action"`, `"bonus_action"`, `"reaction"` removed; comment added explaining v2 schema removal |
| **F6** | `parserValidation.ts` — `validateSpellDamageSpec` | P4 — Low | ✅ Fixed | `7fb6acb` | `dm_adjudicated` check updated from `rawLegacyValue` to `sourceText` with explanatory comment |
| **F7** | `SpellEditor.tsx` — Delete button | P3 — Medium | ✅ Fixed | `8072b02` | *Surfaced by post-fix Pass 3 review.* Delete button outside fieldset had no `parsersPending` guard; `disabled={parsersPending}` added |

---

## Fix Order (Completed 2026-02-28)

1. ✅ **F1 (P2)** — `42f43bd` — `rawLegacyValue: (s.rawLegacyValue ?? s.raw_legacy_value) as string | undefined` added to `normalizeSavingThrowSpec` return.
2. ✅ **F2 (P2)** — `722cf69` — 6-row matrix + `rawLegacyValue: legacy` on all non-`none` paths in `mapLegacySavingThrow`.
3. ✅ **F3 (P2)** — `8bbf4c7` — `sourceText: legacy` added to `mapLegacyMagicResistance` `kind: "special"` return.
4. ✅ **F4 (P3)** — `8bbf4c7` — `<fieldset disabled={parsersPending} className="contents">` wraps all form inputs.
5. ✅ **F5 (P3)** — `7fb6acb` — Removed `"action"`, `"bonus_action"`, `"reaction"` from `CASTING_TIME_UNITS`.
6. ✅ **F6 (P4)** — `7fb6acb` — `validateSpellDamageSpec` now checks `sourceText` under `dm_adjudicated`.
7. ✅ **F7 (P3, post-fix)** — `8072b02` — Delete button guarded with `disabled={parsersPending}`.

---

## Overall Assessment

| Dimension | Rating |
|-----------|--------|
| Spec compliance (task 3.7a) | ✅ Excellent — F1 fixed; `rawLegacyValue` survives load → state → save round-trip |
| Spec compliance (task 3.7b) | ✅ Excellent — F2, F3, F4, F5 all fixed; parallel dispatch, matrix, MR sourceText, form disabled state, and removed-unit rejection all correct |
| Spec compliance (task 3.7c) | ✅ Excellent — v2 shape enforced on both `SavingThrowSpec` and `SpellDamageSpec` via dedicated helpers |
| Spec compliance (task 3.7d) | ✅ Excellent — all banner UX invariants, nav guard, and per-field dismissal correctly implemented |
| Code quality | ✅ Good — clean async patterns, correct race guards, good use of type helpers; F6 validator stale-ref cleaned up |
| Save-path data integrity | ✅ v2-shape guaranteed; defensive deletion of v1 keys; `rawLegacyValue` preserved on `SavingThrowSpec` |
| Banner lifecycle | ✅ All add/remove paths correctly gated; F3 fix confirmed to not affect `kind === "special"` banner trigger |
| Race guard | ✅ Full guard restored — F4 fieldset closes the user-edit race; F7 closes the Delete-during-parse race |

**Verdict:** All 6 original findings fixed across 4 commits. A 7th finding (Delete button race) was surfaced by the post-fix three-pass review and fixed in a 5th commit. Post-fix three-pass review confirmed all fixes correct with no regressions — spec matrix ✅ 6/6, data-flow traces ✅ 7/7, edge-case audit ✅ with one additional fix applied.
