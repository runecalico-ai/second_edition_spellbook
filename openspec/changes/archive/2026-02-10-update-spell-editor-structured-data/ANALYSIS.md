# In-Depth Analysis: update-spell-editor-structured-data

Analysis date: 2025-02-09. This document summarizes gaps, conflicts, and potential bugs between the OpenSpec change artifacts (proposal, tasks, verification, delta specs) and the current implementation.

---

## 1. Summary

| Category   | Count | Severity |
|-----------|--------|----------|
| Gaps      | 6     | Mixed    |
| Conflicts | 2     | Low      |
| Bugs / Risks | 5   | Low–Medium |

Overall the implementation aligns well with the spec. Remaining items are mostly edge cases, consistency tweaks, and verification coverage.

---

## 2. Gaps

### 2.1 Parser output validation is minimal (verification § Invalid parser output)

**Spec:** Verification says: "Frontend MUST validate parser output against TypeScript types. If validation fails, treat as parser failure."

**Implementation:** `SpellEditor.tsx` uses lightweight guards (e.g. `isRangeSpec`, `isDurationSpec`, `isAreaSpec`, `isSpellDamageSpec`, `isSpellCastingTimeLike`) that only check presence and type of `kind` (or `unit` for casting time). They do not validate required nested fields (e.g. `distance`, `unit` for range; `duration` for duration when `kind === "time"`).

**Gap:** A malformed parser response that has `kind` but missing or wrong shape (e.g. `{ kind: "distance" }` without `distance` or `unit`) would be accepted and could produce broken UI or invalid persisted data.

**Recommendation:** Either strengthen the guards to validate required fields per kind, or add a small validation layer (e.g. Zod/io-ts or hand-written validators) and treat failure as parse failure (fallback to `kind: "special"` and add to warning banner).

---

### 2.2 Spell Detail view vs Spell Editor

**Spec:** Delta spec `spell-detail/spec.md` describes a "Spell Detail view" with hash display, structured field rendering, and component badges.

**Implementation:** There is no separate read-only "Spell Detail" route. The app has Library (list) and `edit/:id` (SpellEditor). Hash and structured data are shown inside **SpellEditor** when editing an existing spell (`!isNew && form.contentHash`).

**Gap:** If "Spell Detail view" is intended to be a dedicated read-only view (e.g. `/spell/:id`), that view does not exist; all detail behavior lives in the editor. If the spec treats "the view where you see spell details" as the editor itself, then there is no gap.

**Recommendation:** Clarify in the spec whether a separate read-only detail page is required. If yes, add a route and view that reuses the same hash/structured display requirements.

---

### 2.3 DamageForm: kind "none" does not clear `parts` in state

**Spec:** Verification says for DamageForm kind "None": "output MUST be `{kind: "none"}` (parts cleared or ignored)."

**Implementation:** When the user selects "None" from the kind dropdown, `DamageForm` calls `onChange({ kind: "none" })` and does **not** set `parts: undefined`. So the parent still holds the previous `parts` array. When the user switches back to "Modeled", those parts reappear.

**Gap:** For persistence, backend/canonical can ignore `parts` when `kind === "none"`, so behavior is "ignored". For UI consistency and verification ("parts cleared or ignored"), "cleared" is cleaner.

**Recommendation:** When switching to `kind: "none"` in the dropdown, pass `parts: undefined` (or `[]`) so state and output are consistently `{ kind: "none" }`.

---

### 2.4 Material quantity: emit 1.0 for hashing consistency

**Spec:** Tasks and frontend-standards say: "Default display MUST be 1.0 (not 1) for hashing consistency" and "canonical materialization uses 1.0 when omitted."

**Implementation:** New material uses `VALIDATION.quantityMinDecimal` (1.0). Display shows `"1.0"` when `quantity` is null or 1. Clamp uses `clampScalar`/`Math.max(..., 1.0)`, which returns a number that may be `1` or `1.0` depending on input. Emitted `material_components[].quantity` can therefore be `1` (number).

**Gap:** Verification expects output like `quantity: 1.0`. In JSON and hashing, 1 and 1.0 are often equivalent; if the canonical pipeline normalizes to 1.0, this is low impact. If the hasher is strict about number representation, emitting 1.0 when value is 1 avoids drift.

**Recommendation:** When updating material quantity, normalize to 1.0 when the value is 1 (e.g. `quantity: clamped === 1 ? 1.0 : clamped`) so emitted and stored shape matches the spec.

---

### 2.5 Advisory cap (999999) warning not shown in UI

**Spec:** Frontend-standards and spell-editor spec: "When the user enters a value above 999999, the component MUST show a warning and MUST allow the value (no clamp, no block save)."

**Implementation:** `validation.ts` exposes `isAboveAdvisoryCap(value)` and `VALIDATION.advisoryCap`, but no structured form component (StructuredFieldInput, AreaForm, DamageForm, etc.) was found to call it or display a warning when the user enters a value > 999999.

**Gap:** The advisory-cap warning is not implemented in the UI.

**Recommendation:** In scalar/structured inputs (e.g. `ScalarInput`, or wherever base_value / value / per_level are edited), call `isAboveAdvisoryCap` and show a non-blocking warning (e.g. inline text) when the value exceeds 999999.

---

### 2.6 Verification checklist unchecked

**Spec:** `verification.md` defines many component, integration, and legacy-parsing tests; all checkboxes are `[ ]` (unchecked).

**Implementation:** Tasks mark testing as done (`[x]`), but verification is the source of truth for *what* to test. The presence of Storybook stories and any unit/integration tests was not fully audited.

**Gap:** It is unclear which verification items are covered by automated tests and which remain manual.

**Recommendation:** Run through verification.md and either (1) mark items that are covered by existing tests or (2) add tests for missing items, then update the checkboxes.

---

## 3. Conflicts

### 3.1 ComponentCheckboxes default variant vs scope

**Spec:** Proposal/tasks say only Verbal, Somatic, and Material are editable; focus/divine_focus/experience remain schema defaults and are not exposed.

**Implementation:** `ComponentCheckboxes` has `variant?: "vsm" | "all"` (default `"all"`). SpellEditor correctly passes `variant="vsm"`, so only V/S/M are shown in the editor.

**Conflict:** Default is `"all"`, which would show F/DF/XP if a parent omitted `variant`. The spec only allows V/S/M in this change.

**Severity:** Low; only SpellEditor uses the component and it passes `variant="vsm"`.

**Recommendation:** Consider defaulting `variant` to `"vsm"` so any new usage matches the spec by default, or document that spell-editor usage must always pass `variant="vsm"`.

---

### 3.2 Hash display data-testid in editor vs spell-detail spec

**Spec:** spell-detail spec asks for `data-testid="spell-detail-hash-display"`, `spell-detail-hash-copy`, `spell-detail-hash-expand` on the Spell Detail view.

**Implementation:** The same testids are used in SpellEditor when `!isNew && form.contentHash`. There is no separate Spell Detail view.

**Conflict:** None if "Spell Detail view" is defined as the editor when viewing an existing spell. Only a naming/scope clarification.

**Recommendation:** Keep as is; optionally add a short note in the spell-detail spec that, in the current app, the Spell Detail view is the Spell Editor when editing an existing spell.

---

## 4. Bugs / Risks

### 4.1 Normalize from canonical: snake_case vs camelCase

**Implementation:** When loading from `canonical_data`, the code reads keys in snake_case (e.g. `canonical.range`, `r.distance.per_level`, `canonical.casting_time`, `c.base_value`). It then maps to frontend camelCase (e.g. `perLevel`, `baseValue`). The casting_time block uses both: `c.baseValue ?? c.base_value`, etc.

**Risk:** If the backend ever stores camelCase in `canonical_data` (e.g. by mistake), or if a field is added only in one casing, some paths might not read it. Current backend/canonical contract is snake_case in storage, so this is low risk as long as that contract is kept.

**Recommendation:** Document that `canonical_data` is always snake_case; keep dual reads (`c.baseValue ?? c.base_value`) for resilience during migration or mixed sources.

---

### 4.2 DamageForm: ID length 32 vs schema 31

**Spec:** Schema and tasks: part ID must match `^[a-z][a-z0-9_]{0,31}$` (so max length 31 after the first character, i.e. total 32 is acceptable depending on interpretation). Tasks say "truncate to 31 chars" if needed.

**Implementation:** `generateDamagePartId()` returns `part_${ts}_${r}` and then `.slice(0, 32)`. So the string length is at most 32. The regex allows 1 char + 0–31 chars = 32 total. So length 32 is valid. The tasks say "typically 20-25 chars, well under 31 limit" and "truncate to 31 chars" — the 31 likely refers to the *suffix* length (a-z0-9_), not total. So 32 total is correct.

**Verdict:** No bug; implementation is correct. Noted only for clarity.

---

### 4.3 Legacy saving_throw / magic_resistance: no parse commands

**Spec:** Tasks list parse commands for range, duration, casting_time, area, damage, components. There are no `parse_spell_saving_throw` or `parse_spell_magic_resistance` commands.

**Implementation:** When `canonical_data` is missing for saving_throw or magic_resistance, the editor sets a single fallback: saving_throw → `{ kind: "dm_adjudicated", dmGuidance: legacy }`, magic_resistance → `{ kind: "special", specialRule: legacy }`. No Tauri parse is called.

**Risk:** None; spec does not require parsers for these fields. Legacy strings are preserved in a valid structured form.

---

### 4.4 parse_spell_components and material_components

**Implementation:** When components are not from canonical and legacy `data.components` exists, the editor invokes `parse_spell_components`. On success it sets structured components; if `data.materialComponents` exists and parsed `material` is true, it sets `materialComponents` to a single item `[{ name: data.materialComponents, quantity: 1 }]`. So the legacy material component is a single string (name); quantity is defaulted to 1 (not 1.0).

**Risk:** Minor. For hashing, quantity should be 1.0 when defaulted; easy to change to `quantity: 1.0`.

---

### 4.5 Warning banner: "Casting time" vs structuredCastingTime

**Implementation:** `specialFallbackFields` includes "Casting time" when `structuredCastingTime?.rawLegacyValue` is set. So the banner shows "Casting time" for any casting time that has a raw legacy value (e.g. after parse fallback), which matches the intent.

**Verdict:** Correct; no bug.

---

## 5. Positive Findings

- **Legacy loading:** Empty `canonical_data` `{}` and null/missing fields are handled: no fromCanonical set, legacy parsing runs for each field.
- **Warning banner:** Single, non-dismissible banner at top of form; message lists all fields that fell back to "special"; data-testid present.
- **Tradition validation:** Arcane/Divine/BOTH and school/sphere requirements are enforced; save is blocked with inline errors.
- **ComponentCheckboxes:** V/S/M only in editor (`variant="vsm"`); material sub-form has name, quantity, gp_value, is_consumed, description, unit; add/remove and order preserved; confirmation when unchecking Material with existing data; modalConfirm used for confirm.
- **Parser commands:** All six `parse_spell_*` commands are implemented and registered; they use SpellParser and return camelCase via `parsed_to_camel_value`.
- **StructuredFieldInput:** Range/Duration/Casting time with kind-specific UI and text preview; scalar and unit handling; defaults align with spec.
- **DamageForm:** Kind none/modeled/dm_adjudicated; stable part IDs with collision handling; combine_mode; part sub-form with application/save/clamp/scaling.
- **AreaForm, SavingThrowInput, MagicResistanceInput:** Present with kind-based UI; MR hides applies_to when kind is "unknown"; partial/special sub-forms for MR.

---

## 6. Recommended Next Steps

1. **High:** Add stricter parser output validation (or explicit validators) and fallback to `kind: "special"` + banner on failure.
2. **Medium:** When DamageForm kind is set to "none", pass `parts: undefined` (or clear parts) so output is consistently `{ kind: "none" }`.
3. **Medium:** Implement advisory cap (999999) warning in structured scalar inputs (show warning, allow value).
4. **Low:** Normalize material quantity to 1.0 when value is 1 for emission; use 1.0 in parse_spell_components legacy material default.
5. **Low:** Default ComponentCheckboxes variant to `"vsm"` or document that spell-editor must pass it.
6. **Process:** Walk verification.md and either add tests or mark items as covered; keep checkboxes in sync with reality.

---

*End of analysis.*
