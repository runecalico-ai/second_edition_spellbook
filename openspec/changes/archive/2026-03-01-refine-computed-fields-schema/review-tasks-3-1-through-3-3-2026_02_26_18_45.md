# Three-Pass In-Depth Code Review
## Change: `refine-computed-fields-schema`
## Scope: Tasks `3.1`, `3.2`, `3.3` (Frontend Types & Editor Components)
## Date: 2026-02-26 18:45 CST

---

## Review Method (3 Passes)

1. **Pass 1 — Spec Contract Audit**
   Independent verification of each requirement from tasks 3.1, 3.2, and 3.3 against the intended TypeScript design and component behavior.
2. **Pass 2 — Code Reality Audit**
   Fresh line-level read of `src/types/spell.ts`, `DamageForm.tsx`, and `SavingThrowInput.tsx` to verify the exact types, bindings, conditions, defaults, and ID generators.
3. **Pass 3 — Test Sufficiency Audit**
   Note: Task 3 does not inherently ask for tests; those are found contextually in section 5. But as an impact analysis pass, we verify that these frontend types do not violate downstream TS rules.

---

## Pass 1 & 2 — Spec Contract and Code Reality Audit

### Task 3.1 — Update TypeScript types (`apps/desktop/src/types/spell.ts`)

| ID | Requirement | Code Status | Evidence |
|---|---|---|---|
| 3.1-A | Add `text?: string` to `AreaSpec` and `DurationSpec` | ✅ | `DurationSpec` (L147) and `AreaSpec` (L268) now both have `text?: string`. |
| 3.1-B | Add `rawLegacyValue?: string` to `SavingThrowSpec` | ✅ | `SavingThrowSpec` (L446) defines `rawLegacyValue?: string`. |
| 3.1-C | Add `sourceText?: string` to `MagicResistanceSpec` | ✅ | `MagicResistanceSpec` (L464) explicitly defines `sourceText?: string`. |
| 3.1-D | Rename `rawLegacyValue` → `sourceText` on `SpellDamageSpec` | ✅ | `SpellDamageSpec` (L405) has `sourceText?: string`, and `rawLegacyValue` has been removed. |
| 3.1-E | Remove `dm_guidance` from `SavingThrowSpec` (retained on `SpellDamageSpec`) | ✅ | `dm_guidance`/`dmGuidance` is absent in `SavingThrowSpec` (L441-447). `SpellDamageSpec` retains `dmGuidance` (L403). |
| 3.1-F | Remove 5e casting time units from `CastingTimeUnit`, generic map, and default factory | ✅ | `CastingTimeUnit` (L156-163) excludes action/bonus/reaction. `CASTING_TIME_UNIT_LABELS` (L193) is sanitized. `defaultCastingTime()` (L218) specifies `unit: "round"`. |

### Task 3.2 — Update `DamageForm.tsx`

| ID | Requirement | Code Status | Evidence |
|---|---|---|---|
| 3.2-A | Display `sourceText` as a read-only labelled annotation for all `kind` values | ✅ | UI checks `spec.sourceText` (L248-253) and displays an alert box highlighting "Original source text:" for all variations regardless of `kind`. |
| 3.2-B | `dm_guidance` behavior: Show text area for `dm_adjudicated`, show `notes` for `modeled` and `dm_adjudicated`, hide both for `none` | ✅ | `spec.kind === "dm_adjudicated"` strictly reveals the `dmGuidance` text area (L255-264). `spec.kind !== "none"` reveals the `notes` textarea (L652-661). Both conditional rendering clauses perfectly satisfy the spec constraints. |
| 3.2-C | New part defaults (`application` scope, `save` kind, ID pattern constraint) | ✅ | Found in `apps/desktop/src/types/spell.ts`. `generateDamagePartId` (L488) derives a string format fitting schema: `part_${ts}_${r}` (guaranteed max 32 chars). `defaultDamagePart()` specifies `application: { scope: "per_target" }`, `save: { kind: "none" }`. `DamageForm.tsx` leverages this exactly via `defaultDamagePart()`. |

### Task 3.3 — Update `SavingThrowInput.tsx`

| ID | Requirement | Code Status | Evidence |
|---|---|---|---|
| 3.3-A | Remove all bindings to `dm_guidance` | ✅ | `SavingThrowInput.tsx` makes no reference whatsoever to `dmGuidance` or `dm_guidance` internally. |
| 3.3-B | Display `rawLegacyValue` as read-only annotation when populated | ✅ | Analogous block to `DamageForm` present at line L136-141 checking `spec.rawLegacyValue`. |
| 3.3-C | `notes` textarea rendered for all kinds (none, single, multiple, dm_adjudicated); `dm_adjudicated` shows *only* this. | ✅ | `notes` renders unconditionally below mapping logic (`true && textarea...` at L187). Form controls correctly isolate view based on `kind`: `single` has `SingleSaveForm`, `multiple` aggregates it, and `dm_adjudicated` lacks specific conditional children, thereby effectively leaving only `notes` as editable narrative control. |

---

## Pass 3 — Consistency and Impact

1. **Naming & Types**: The component usages flawlessly adhere to camelCase frontend norms derived from snake_case backend norms. The new `sourceText` / `rawLegacyValue` / `text` parameters have been slotted into the TS models without perturbing legacy fallbacks unexpectedly.
2. **Form Reset Handlers**: In `DamageForm.tsx`, triggering `none` erases the `parts` cleanly, and switching to `dm_adjudicated` flushes layout noise while preserving `dmGuidance` string accurately.
3. **Empty / Default State Compliance**: The fallback mechanisms strictly invoke the `default*` variants verified above. When adding new elements in an array to arrays such as `parts` or `multiple`, the strict structure overrides take precedence smoothly. Nothing remains ambiguous for schema validation.

---

## Verdict

| Task | Status | Confidence | Blocking Issues | Notes |
|---|---|---|---|---|
| **3.1** | ✅ Complete | **High** | None | Type definitions comprehensively satisfy explicit schema additions and sanitization requests. |
| **3.2** | ✅ Complete | **High** | None | Strict rendering boundaries achieved for conditionally displayed data formats exactly per Decision 3. |
| **3.3** | ✅ Complete | **High** | None | Narrative field hierarchy migrated flawlessly from `dmGuidance` to generic layout `notes`. |

**Overall Assessment:** The task items in Section 3 (`3.1`, `3.2`, `3.3`) have been perfectly fulfilled in `spell.ts`, `DamageForm.tsx`, and `SavingThrowInput.tsx`. Code structure directly tracks the stated acceptance criteria with no deviations, bugs, or missing edge case defenses. Review complete. No modifications required for these files.
