# Three-Pass In-Depth Code Review
## Change: `refine-computed-fields-schema`
## Scope: Tasks `4.1`, `4.2`, `4.2b`, `4.3` (Spell Detail Views — `src/ui/spell-detail/`)
## Review Date: 2026-02-28

> **All findings fixed and committed** on `refine-computed-fields` branch.
> Implementation: commit `c03586d`. Four fix commits applied after three review passes.
>
> | Commit | Fix |
> |--------|-----|
> | `c03586d` | Initial implementation — all 8 files in `src/ui/spell-detail/` |
> | `15a8e1e` | F1 — `SavingThrowDetail` spec deviation: `notes` unconditionally shown (spec compliance pass) |
> | `ec5cdf5` | F2 — `SavingThrowDetail` `dm_adjudicated` double-render; F3 — synthesis guard for Area/Duration/Range; F4 — duplicate `data-testid` in `MagicResistanceDetail` (code quality pass) |
> | `f59e383` | F5 — `AreaDetail` synthesis guard excludes `kind="special"`; F6 — `DamageDetail` includes `dmGuidance` in fallback; F7 — `MagicResistanceDetail` surfaces `specialRule` (three-pass findings) |

---

## Review Method

| Pass | Focus | Files Read |
|------|-------|------------|
| **Pass 1 — Spec Requirement Matrix** | Line-level audit against tasks.md 4.1–4.3 and `specs/spell-detail/spec.md`; check each requirement box | All files in `src/ui/spell-detail/` |
| **Pass 2 — Data-Flow Correctness** | Cross-reference TypeScript interfaces in `spell.ts`; trace every field through its rendering path; verify no field is dropped or mis-named | Same files + `src/types/spell.ts` |
| **Pass 3 — Edge Cases & Cross-Cutting** | Null/undefined handling, empty string semantics, spec-mentioned edge cases, `data-testid` coverage, semantic HTML, barrel exports | Same files |

---

## Components Created

| File | Implements |
|------|-----------|
| `SavingThrowDetail.tsx` | Task 4.1 — per-kind dispatch; `<details>/<summary>` collapsible `rawLegacyValue` for single/multiple; `rawLegacyValue` as primary for `dm_adjudicated`; `notes` always shown; zero `dmGuidance` references |
| `RangeDetail.tsx` | Task 4.2 — 3-tier chain: `spec.text → rawLegacyValue → rangeToText(spec)` with `hasStructuredFields` guard |
| `DurationDetail.tsx` | Task 4.2 — 3-tier chain: `spec.text → rawLegacyValue → durationToText(spec)` with kind-aware guard |
| `AreaDetail.tsx` | Task 4.2 — 3-tier chain: `spec.text → rawLegacyValue → areaToText(spec)` with dimensional-field guard (excludes `kind="special"`) |
| `CastingTimeDetail.tsx` | Task 4.2b — 3-tier chain: `spec.text → rawLegacyValue → castingTimeToText(spec)` using `\|\|` for empty-string `text` |
| `DamageDetail.tsx` | Task 4.3 — algebraic formula from `parts` when present; `sourceText ?? dmGuidance` fallback; `notes` separately |
| `MagicResistanceDetail.tsx` | Task 4.3 — `kind` label + `appliesTo`; `sourceText` primary for `kind="special"`; `specialRule` supplementary when `sourceText` absent |
| `index.ts` | Barrel export of all 7 components |

---

## Pass 1 — Spec Requirement Matrix

| Req | Source | Requirement | Status | Evidence |
|-----|--------|-------------|--------|----------|
| 4.1-A | tasks.md | `dmGuidance`/`dm_guidance` absent from all logic | ✅ | Logic-free; appears only in JSDoc comment |
| 4.1-B | tasks.md | `kind="single"`: displays `saveType` and `saveVs` | ✅ | `SavingThrowDetail.tsx` L62 |
| 4.1-C | tasks.md | `kind="single"`: `rawLegacyValue` as collapsible secondary annotation | ✅ | `<details>/<summary>Original source</summary>` L65 |
| 4.1-D | tasks.md | `kind="multiple"`: displays each entry's `saveType` and `saveVs` | ✅ | Maps `spec.multiple` array at L82 |
| 4.1-E | tasks.md | `kind="multiple"`: `rawLegacyValue` as collapsible annotation | ✅ | Same `<details>` pattern at L93 |
| 4.1-F | tasks.md | `kind="dm_adjudicated"`: `rawLegacyValue` is PRIMARY content | ✅ | `{spec.rawLegacyValue ?? "DM adjudicated"}` at L108 |
| 4.1-G | tasks.md | `kind="dm_adjudicated"` no `rawLegacyValue` → static label, NOT `notes` in primary block | ✅ | Literal `"DM adjudicated"` fallback; `notes` in separate block |
| 4.1-H | tasks.md | `notes` always shown when present (unconditional) | ✅ | Fixed F1 — `{spec.notes && ...}` outside all kind branches at L115 |
| 4.2-A | tasks.md | Range/Duration/Area: primary `.text` | ✅ | First in `?? ` chain: `spec.text ?? ...` |
| 4.2-B | tasks.md | First fallback: `rawLegacyValue` | ✅ | Second in chain: `?? spec.rawLegacyValue ?? ...` |
| 4.2-C | tasks.md | Second fallback: synthesize ONLY when structured fields non-empty | ✅ | Fixed F3/F5 — all three have `hasStructuredFields(spec) ? toText(spec) : null` |
| 4.2-D | tasks.md | Will NOT synthesize from empty/absent structured fields | ✅ | `kind="special"` returns `false` in all three guards; final `?? "—"` |
| 4.2b-A | tasks.md | CastingTime: primary `.text` | ✅ | `spec.text \|\| ...` (truthy, handles empty string) |
| 4.2b-B | tasks.md | First fallback: `rawLegacyValue` | ✅ | `\|\| spec.rawLegacyValue \|\| ...` |
| 4.2b-C | tasks.md | Second fallback: synthesize from `(baseValue, unit)` | ✅ | `castingTimeToText(spec)` — no guard needed (fields always present) |
| 4.3-A | tasks.md | Damage: structured formula from algebraic fields when present | ✅ | `kind === "modeled" && hasAlgebraicParts(spec.parts)` → `DamagePartRow` |
| 4.3-B | tasks.md | Damage: fall back to `sourceText` when algebraic absent | ✅ | `spec.sourceText ?? spec.dmGuidance` fallback path |
| 4.3-C | tasks.md | Damage: NOT using `rawLegacyValue` | ✅ | No `rawLegacyValue` reference in `DamageDetail.tsx` |
| 4.3-D | tasks.md | MR: displays `kind` and `appliesTo` | ✅ | Both rendered with label maps |
| 4.3-E | tasks.md | MR: displays `sourceText` when present | ✅ | Primary for `kind="special"`, supplementary for others |
| 4.3-F | tasks.md | MR: `sourceText` is primary for `kind="special"` | ✅ | `data-testid="magic-resistance-source-text-primary"` on `kind="special"` path |
| 4.3-G | tasks.md | MR: NOT using `rawLegacyValue` | ✅ | No `rawLegacyValue` reference in `MagicResistanceDetail.tsx` |
| tasks.md | tasks.md | All sub-bullets of 4.1, 4.2, 4.2b, 4.3 marked `[x]` | ✅ | Verified |

---

## Pass 2 — Data-Flow Correctness

| Component | Field | Status | Notes |
|-----------|-------|--------|-------|
| `SavingThrowDetail` | `SavingThrowSpec` fields (`kind`, `single`, `multiple`, `rawLegacyValue`, `notes`) | ✅ | All accessed correctly |
| `SavingThrowDetail` | `SingleSave.saveType`, `saveVs` | ✅ | Correct interface fields |
| `SavingThrowDetail` | `SAVE_TYPE_LABELS` exhaustiveness | ✅ | All 6 `SaveType` values covered |
| `RangeDetail` | `RANGE_DISTANCE_KINDS`, `RANGE_KIND_ONLY` | ✅ | Imported and used correctly in guard |
| `DurationDetail` | `DURATION_KIND_ONLY`, `DURATION_CONDITION_KINDS` | ✅ | Imported and used correctly |
| `AreaDetail` | Dimensional fields (`radius`, `length`, etc.) | ✅ | Guard checks all `AreaSpec` dimensional properties |
| `CastingTimeDetail` | `SpellCastingTime.text` as required `string` | ✅ | Correct `\|\|` (not `??`) semantics |
| `DamageDetail` | `SpellDamageSpec.dmGuidance` | ✅ | Fixed F6 — included in `dm_adjudicated` fallback |
| `DamageDetail` | `notes` not dropped when `sourceText` present | ✅ | Fixed F6 — rendered as separate `<p>` |
| `MagicResistanceDetail` | `MagicResistanceSpec.specialRule` | ✅ | Fixed F7 — surfaced for `kind="special"` when `sourceText` absent |
| `MagicResistanceDetail` | `MR_KIND_LABELS`, `APPLIES_TO_LABELS` exhaustiveness | ✅ | All 5 kind values and 4 `AppliesTo` values covered |
| `MagicResistanceDetail` | Distinct `data-testid` for primary vs supplementary `sourceText` | ✅ | Fixed F4 — `"-primary"` and `"-supplementary"` suffixes |

---

## Pass 3 — Edge Cases & Cross-Cutting

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Null spec guard at top of each component | ✅ | All 7 have `if (!spec)` guard |
| 2 | Empty string vs null/undefined semantics | ✅ | Optional fields arrive as `undefined` from Rust; `??` correct. `CastingTime.text: string` uses `\|\|` intentionally |
| 3 | `SavingThrowKind="none"` → null return | ✅ | `if (!spec \|\| spec.kind === "none") return null` |
| 4 | All fallbacks absent → `"—"` shown | ✅ | Four-tier chain ends in `?? "—"` on all three Range/Duration/Area components |
| 5 | `kind="special"` synthesis behavior | ✅ | Fixed F5 — all three correctly return `false`/`"—"` when `text` and `rawLegacyValue` absent |
| 6 | `DamageDetail` `dm_adjudicated` with no content | ✅ | Returns `null` gracefully; consistent with `kind="none"` |
| 7 | `MagicResistanceDetail` `kind="unknown"` | ✅ | Renders "N/A" label; `appliesTo` suppressed via `!== "unknown"` guard |
| 8 | Collapsible absent when no `rawLegacyValue` | ✅ | `{spec.rawLegacyValue && <details>...}` — no empty `<details>` emitted |
| 9 | `data-testid` on all containers | ✅ | Every component has top-level testid; per-row testids on multi-entry lists |
| 10 | Semantic HTML — no invalid nesting | ✅ | No `<p>` inside `<p>`; `<details>/<summary>` nesting valid |
| 11 | `index.ts` barrel exports all 7 components | ✅ | Confirmed |
| 12 | TypeScript type safety | ✅ | No interface mismatches; imports all exist in `spell.ts` |
