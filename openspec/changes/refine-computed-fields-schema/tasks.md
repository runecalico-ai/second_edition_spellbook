## Dependencies

> Section 1 (Schema & Backend) and Section 2 (Python Importer) can proceed in parallel. Section 3 (Frontend Types & Editor) depends on Section 1 (schema and Rust types must exist first). Section 4 (Detail Views) depends on Section 3 (shared type definitions). Section 5 (Docs & Tests) depends on all preceding sections.

```
Section 1 ──┐
            ├──→ Section 3 ──→ Section 4 ──→ Section 5
Section 2 ──┘
```

---

## 1. Schema & Backend

- [ ] 1.1 Update `spell.schema.json` with the following precise changes:
  - [ ] **Add** optional `text: string` to `AreaSpec` and `DurationSpec`
  - [ ] **Add** optional `raw_legacy_value: string` to `SavingThrowSpec`
  - [ ] **Add** optional `source_text: string` to `MagicResistanceSpec`
  - [ ] **Remove** `dm_guidance` from `SavingThrowSpec`
  - [ ] **Remove** `raw_legacy_value` from `SpellDamageSpec`; **add** optional `source_text: string` in its place
  - [ ] **Remove** `"action"`, `"bonus_action"`, and `"reaction"` from the `SpellCastingTime.unit` enum
  - [ ] **Do NOT modify** the resolved specs (`ResolvedAreaSpec`, `ResolvedDurationSpec`, `ResolvedRangeSpec`) — they must not gain `text`, `raw_legacy_value`, or `source_text` properties (Decision 7)
- [ ] 1.2 Update Rust data models in `src/models/spell.rs`:
  - [ ] Declare `AreaSpec.text`, `DurationSpec.text`, `SavingThrowSpec.raw_legacy_value`, and `MagicResistanceSpec.source_text` as `Option<String>` with `#[serde(skip_serializing_if = "Option::is_none")]` (existing `#[serde(rename_all = "camelCase")]` on structs handles IPC casing automatically for all new fields)
  - [ ] Rename `SpellDamageSpec.raw_legacy_value` → `source_text`; add `#[serde(alias = "raw_legacy_value")]` on `source_text` for backward deserialization compatibility
  - [ ] Remove `dm_guidance` from `SavingThrowSpec` struct; add a deserialization-only shadow field with `#[serde(default, skip_serializing)]` so pre-migration JSON with `dm_guidance` round-trips without data loss
  - [ ] Confirm `prune_metadata_recursive()` prunes `"source_text"` keys on `SpellDamageSpec` and `MagicResistanceSpec` — the existing key-name exclusion for `"source_text"` (which already handles `ExperienceComponentSpec`) should cover both new fields automatically; if pruning is per-type rather than per-key, add the new types explicitly
- [ ] 1.2b Implement `.text` synthesis in `normalize()` for `AreaSpec` and `DurationSpec` in `src/models/canonical_spell.rs`:
  - [ ] Build a canonical display string from the structured algebraic fields (e.g., `kind`, `radius`/`distance`, `unit`) — this is a new Rust function, not just a field declaration
  - [ ] Apply **Structured + unit alias normalization** (word boundaries) matching the existing `RangeSpec.text` normalization (e.g., "yards" → "yd", "feet" → "ft"; "backyard" unchanged)
  - [ ] For `kind="special"`: derive `.text` from `raw_legacy_value` instead of structured fields (no structured fields exist to synthesize from)
  - [ ] `raw_legacy_value` is NEVER the `.text` input when structured fields are present, even if both are populated (Design Decision 2)
- [ ] 1.2c Implement **Textual normalization** for `source_text` on `SpellDamageSpec` and `MagicResistanceSpec` in `normalize()`:
  - [ ] Apply NFC, trim horizontal whitespace, preserve distinct lines — matching the existing `ExperienceComponentSpec.source_text` normalization behavior
  - [ ] `raw_legacy_value` fields (on all specs) must NOT be normalized (stored as-is; "raw" prefix signals no normalization)
- [ ] 1.3 Bump `CURRENT_SCHEMA_VERSION` to 2 and add `migrate_to_v2()` to `src/models/canonical_spell.rs`:
  - [ ] Must run as the **first step** in `normalize()`, before §2.5 default materialization, guarded by `if spell.schema_version < 2`
  - [ ] Migration steps (in order): (1) append `SavingThrowSpec.dm_guidance` into `notes` (newline-separated if `notes` non-empty), then clear `dm_guidance`; (2) remap 5e `casting_time.unit` (`"action"`, `"bonus_action"`, `"reaction"`) to `"special"`, copying `casting_time.text` into `raw_legacy_value` **only if `raw_legacy_value` is not already populated** — if `raw_legacy_value` IS already populated, preserve it as-is (no overwrite); if `casting_time.text` is also empty/null (treat empty string `""` the same as null — both fall through to synthesis), synthesize from `base_value + unit` (e.g., `"1 action"`; `base_value = 0` yields `"0 <unit>"`); (3) move `SpellDamageSpec.raw_legacy_value` to `source_text`, then clear `raw_legacy_value`; (4) stamp `schema_version = 2`
  - [ ] Return type: `MigrateV2Result { notes_truncated: bool, truncated_spell_id: Option<i64> }`. If the `dm_guidance` concatenation would exceed `notes maxLength: 2048`, truncate and set `notes_truncated = true`. **Dual caller behavior:** On single-spell normalization, the caller MUST return an `Err` and MUST NOT persist the spell when `notes_truncated` is true. In bulk migration (`migrate_all_spells_to_v2`), truncated spells must be recorded in `failed` without aborting the batch.
  - [ ] `schema_version 0 → 2` scenario: a spell with `schema_version = 0` satisfies `< 2` and migrates directly to `2`; the §2.5 materialization step sees `schema_version = 2` afterward and leaves it unchanged
  - [ ] `MIN_SUPPORTED_SCHEMA_VERSION`: leave unchanged at `1` — v1 spells are valid for migration via `migrate_to_v2()` and do not need to be rejected. Document this decision explicitly in the constant's comment.
- [ ] 1.4 Update Rust in-app parsers to unconditionally preserve legacy text (files: `src/utils/spell_parser.rs`, `src/utils/parsers/area.rs`, `src/utils/parsers/range.rs`, `src/utils/parsers/duration.rs`, `src/utils/parsers/mechanics.rs`). _Note: Python importer changes are in Section 2; this task covers only the Rust in-app parser layer._
  - [ ] All parsers (area, duration, range, casting_time, saving_throw in `mechanics.rs`) must populate `raw_legacy_value` on every call, regardless of parse success or failure
  - [ ] For `SavingThrowSpec`: populate `raw_legacy_value` unconditionally (this field did not previously exist in the parser output)
  - [ ] For `kind="special"` parse fallbacks on `AreaSpec` and `DurationSpec`: the parser MUST also set `.text` to the same value as `raw_legacy_value` (since no structured fields exist to synthesize from)
  - [ ] For successfully-parsed Area and Duration specs: synthesize a best-effort `.text` from the structured fields (e.g., `"20 ft radius"` from `kind="radius_circle"`, `radius=20`, `unit="ft"`). This is a best-effort initial value; `normalize()` overwrites `.text` authoritatively on save
  - [ ] For empty/null input (e.g., a spell with no saving throw): `raw_legacy_value` MUST be `None` (not `Some("")`); populating `raw_legacy_value` is not required when there is no source text to preserve
  - [ ] Verify the `save_type`/`save_vs` mapping table in `mechanics.rs` matches the importers spec (6-row, first-match-wins table in §"Legacy Save Mapping"); update comments or implementation if any row diverges. No enum value changes are required per Design Decision 4.
  - [ ] Verify `is_standard_complex` heuristic in `mechanics.rs` correctly identifies standard complex category names (e.g., "Rod, Staff, or Wand") as single saves, not multiple — the heuristic must fire before the split logic
- [ ] 1.5 Write Rust unit tests covering:
  - **Migration tests:**
  - [ ] `migrate_to_v2()` happy path for each of the three migration steps
  - [ ] `notes` truncation error path (concatenated `dm_guidance + notes` exceeds 2048 chars → `notes_truncated = true`)
  - [ ] `casting_time.text` empty/null edge case (synthesize from `base_value + unit`; `base_value = 0` yields `"0 <unit>"`; `casting_time.text = ""` treated the same as null)
  - [ ] `casting_time` no-overwrite guard: if `raw_legacy_value` is already populated, the migration must preserve it as-is when remapping 5e units
  - [ ] `schema_version 0 → 2` ordering: verify migration runs and final version is `2`, not `1`
  - [ ] `schema_version >= 2` passthrough: `migrate_to_v2()` is not called, spell is unchanged
  - **Parser tests:**
  - [ ] Unconditional `raw_legacy_value` population on parse success and on `kind="special"` fallback
  - [ ] Empty/null input: verify `raw_legacy_value` is `None` (not `Some("")`) when no source text exists
  - [ ] Multiple saves: verify `raw_legacy_value` captures the full unsplit source string (including all delimiters and whitespace) for `SavingThrowSpec` with multiple save components
  - [ ] `is_standard_complex` heuristic: verify "Rod, Staff, or Wand" is classified as a single save, not split as multiple
  - **Normalization & hashing tests:**
  - [ ] `.text` synthesis: verify `AreaSpec.text` and `DurationSpec.text` are correctly built from structured fields after `normalize()`, and that `kind="special"` derives `.text` from `raw_legacy_value`
  - [ ] Correct hashing after re-normalization: verify `raw_legacy_value` IS part of the canonical hash; verify `source_text` IS excluded (pruned by `prune_metadata_recursive`)
- [ ] 1.6 Implement the `migrate_all_spells_to_v2` Tauri bulk migration command in `src/models/canonical_spell.rs`:
  - [ ] Return type: `MigrationResult { total: u32, migrated: u32, skipped: u32, failed: Vec<MigrationFailure> }` where `MigrationFailure { spell_id: i64, spell_name: Option<String>, error: String }`
  - [ ] Emit `migration-progress` Tauri events with `{ current: u32, total: u32 }` payload after each (or each batch of) spells processed
  - [ ] Spells already at `schema_version >= 2` are counted in `skipped` (idempotent); all successful writes are batched in a single `BEGIN`/`COMMIT`; spell-level failures are collected in `failed` without aborting the batch; database-level failures roll back the entire transaction

## 2. Python Importer

- [ ] 2.1 Update `services/ml/spellbook_sidecar.py`:
  - [ ] For CastingTime: if the source text contains a 5e unit (`"action"`, `"bonus_action"`, `"reaction"`), **first** store the original string in `casting_time.raw_legacy_value`, **then** remap `unit` to `"special"`; do not write the 5e unit value to the output dict. Order matters — `raw_legacy_value` must capture the original before any remapping.
  - [ ] Unconditionally populate `raw_legacy_value` for all other hashed computed fields (Range, Duration, Area, SavingThrow) on every parse call, regardless of parse success
  - [ ] For empty/null input (e.g., a spell with no saving throw): set `raw_legacy_value` to `None` (not `""`); populating `raw_legacy_value` is not required when there is no source text to preserve
  - [ ] Populate `source_text` for non-hashed metadata fields (Damage, MagicResistance); do NOT set `raw_legacy_value` on these fields
  - [ ] Rename any existing `SpellDamageSpec.raw_legacy_value` writes to `source_text`
  - [ ] For successfully parsed Area and Duration specs, synthesize a best-effort `.text` display string from the structured fields (e.g., `"20 ft radius"` from `kind="radius_circle", radius=20, unit="ft"`); for `kind="special"` fallbacks, set `.text` equal to the `raw_legacy_value` string. The backend `normalize()` pass overwrites `.text` authoritatively on save.
  - [ ] Stamp `schema_version = 2` on all newly produced spells so they bypass `migrate_to_v2()` on ingest
  - [ ] Do NOT emit `dm_guidance` on `SavingThrowSpec`
- [ ] 2.2 Update Python importer tests (if existing test suite covers `spellbook_sidecar.py`):
  - [ ] Test unconditional `raw_legacy_value` population for all hashed computed fields
  - [ ] Test `source_text` population for Damage and MagicResistance
  - [ ] Test 5e CastingTime remap: verify `raw_legacy_value` captured before `unit` remapped to `"special"`
  - [ ] Test empty/null input → `raw_legacy_value` is `None`
  - [ ] Test `schema_version = 2` stamp on output

## 3. Frontend Types & Editor Components

- [ ] 3.1 Update TypeScript types in `src/types/spell.ts`:
  - [ ] Add `text?: string` to `DurationSpec` and `AreaSpec` interfaces
  - [ ] Add `rawLegacyValue?: string` to `SavingThrowSpec` interface
  - [ ] Add `sourceText?: string` to `MagicResistanceSpec` interface
  - [ ] Rename `rawLegacyValue` → `sourceText` on `SpellDamageSpec`
  - [ ] Remove `dm_guidance` from `SavingThrowSpec` (removal is SavingThrowSpec-only; `dm_guidance` is retained on `SpellDamageSpec` per Decision 3)
  - [ ] Remove `"action"`, `"bonus_action"`, and `"reaction"` from the `CastingTimeUnit` type, `CASTING_TIME_UNIT_LABELS` map, and `defaultCastingTime()` factory
- [ ] 3.2 Update `DamageForm.tsx`:
  - [ ] Display `sourceText` (formerly `rawLegacyValue` on `SpellDamageSpec`) as a read-only labelled annotation ("Original source text") for all `kind` values, when populated
  - [ ] `dm_guidance` is **retained** on `SpellDamageSpec` (removal applies only to `SavingThrowSpec` per Decision 3): show `dm_guidance` text area when `kind = "dm_adjudicated"` (required by schema `allOf` conditional) and an optional `notes` text area; show `notes` text area when `kind = "modeled"` (schema `allOf` requires either `parts` or `notes`); no `dm_guidance` or `notes` when `kind = "none"`
  - [ ] Verify DamagePart creation defaults: new parts MUST initialize with `application: { scope: "per_target" }`, `save: { kind: "none" }`, and ID pattern `part_${Date.now()}_${Math.random().toString(36).substring(2, 9)}` matching schema pattern `^[a-z][a-z0-9_]{0,31}$`
- [ ] 3.3 Update `SavingThrowInput.tsx`:
  - [ ] Remove all bindings to `dm_guidance` (field deleted from `SavingThrowSpec` in v2)
  - [ ] Display `rawLegacyValue` as a read-only labelled annotation when populated, for all `kind` values
  - [ ] Ensure the `notes` text area is rendered for **all kinds** (none, single, multiple, dm_adjudicated) — it is a top-level field on `SavingThrowSpec`, not scoped to any single kind, and is the sole narrative field after `dm_guidance` removal. For `dm_adjudicated` specifically: no SingleSave sub-form is shown; `notes` is the sole editable narrative field surfaced as a text area
- [ ] 3.4 Update `MagicResistanceInput.tsx`:
  - [ ] Display `sourceText` as a read-only labelled annotation when populated (non-hashed metadata excluded from canonical hash; not editable by the user)
  - [ ] Ensure `appliesTo` selector is hidden or disabled when MR `kind === "unknown"` (not applicable per schema logic)
  - [ ] When MR `kind === "partial"`: render `scope` enum selector (`damage_only`, `non_damage_only`, `primary_effect_only`, `secondary_effects_only`, `by_part_id`) and conditional `part_ids` picker (disabled with informational message when spell's `damage.kind` is not `"modeled"`, e.g., "No modeled damage parts available — set Damage to Modeled first")
  - [ ] When MR `kind === "special"`: render `appliesTo` selector and `special_rule` text input (optional per schema)
  - [ ] Show `notes` text area for all kinds (optional per schema, applies across all MR kinds)
- [ ] 3.5 Update `AreaForm.tsx`:
  - [ ] When `kind` is NOT `"special"`: bind `.text` as the computed canonical text preview (read-only, auto-recomputed)
  - [ ] When `kind` IS `"special"`: expose `rawLegacyValue` as the user-editable field; derive `.text` from `rawLegacyValue` when non-empty, or emit `text: undefined` (not `""` — `AreaSpec.text` is optional in the schema, so `None`/`undefined` is correct for the no-input state) when empty/absent
- [ ] 3.6 Update `StructuredFieldInput.tsx` (and Range/Duration/CastingTime sub-components):
  - [ ] Ensure real-time `.text` derivation is written to the emitted value for **all three field types** (Range, Duration, Casting Time) on every change
  - [ ] Implement kind-transition field-clearing rules per the structured-fields spec Kind Transition Behaviour tables (see `spell-editor-structured-fields/spec.md`). Key rules: **Range** — `distance`/`distance_los`/`distance_loe` initializes `distance: {mode: "fixed", value: 0}` and `unit: "ft"` if absent; kind-only kinds clear `distance`+`unit`+`rawLegacyValue`; `special` preserves `rawLegacyValue`. **Duration** — `time` initializes `unit: "round"` and `duration: {mode: "fixed", value: 1}` if absent; `conditional`/`until_triggered`/`planar` initializes `condition: ""` if absent; `usage_limited` initializes `uses: {mode: "fixed", value: 1}` if absent; `special` preserves `rawLegacyValue`. **CastingTime** — `rawLegacyValue` cleared when switching away from `special`/`"special"` unit ("data supersession" contract)
  - [ ] `rawLegacyValue` show/hide — trigger 1 (kind/unit): visible when `kind === "special"` (Range/Duration) or `unit === "special"` (Casting Time); cleared (and hidden) when user switches away from `special`
  - [ ] `rawLegacyValue` show/hide — trigger 2 (pre-existing data): also visible when a pre-existing `rawLegacyValue` is loaded from legacy data, regardless of current unit (e.g., a Casting Time with `unit: "segment"` but a populated `rawLegacyValue` from import). On user switch away from `special`, `rawLegacyValue` is cleared per data supersession contract
  - [ ] `casting_time.text` is schema-required: always emit a non-empty `.text` for Casting Time; `DurationSpec.text` and `RangeSpec.text` are optional but must still be computed and emitted
- [ ] 3.7a Update `SpellEditor.tsx` — canonical_data loading and normalization:
  - [ ] Implement v1-shaped `canonical_data` compatibility: remap `dm_guidance → notes` (appending with `"\n"` separator if `notes` non-empty), remap `SpellDamageSpec.raw_legacy_value → sourceText`, prefer `sourceText` when both `sourceText` and `rawLegacyValue` are present on `SpellDamageSpec` (post-migration v2 value takes precedence over pre-migration v1 value)
  - [ ] When loading from `canonical_data`, check for missing fields using loose equality (`canonicalData[field] == null`), which covers both `undefined` (key absent) and `null` (key present but null) in a single expression — do NOT use strict `=== undefined` or the `in` operator
  - [ ] When loading from `canonical_data`, convert all keys from `snake_case` to `camelCase` before populating editor state (e.g. `raw_legacy_value` → `rawLegacyValue`, `save_type` → `saveType`); do not access `canonical_data` fields by their `snake_case` key names directly in React component state
- [ ] 3.7b Update `SpellEditor.tsx` — parser dispatch and validation:
  - [ ] Dispatch multiple field parser commands in parallel (`Promise.all`); do not dispatch sequentially
  - [ ] While parser invocations are in flight, render the form in a **loading/disabled state** until all pending parser calls resolve
  - [ ] Add Zod schema validation (or equivalent type guard) for all Tauri parser command responses; treat validation failures as parser failures → fallback to `kind: "special"` and include in warning banner. Validate against the same TypeScript interfaces used for spell types (e.g. `src/types/spell.ts` or shared parser response types).
  - [ ] `savingThrow` and `magicResistance` do NOT use Tauri parser commands — use **client-side fallback mapping** from legacy text to structured state. Saving throw: resolve common 2e strings per the save_type/save_vs matrix (e.g., "Save vs. Spell" → `save_type: "spell"`, `save_vs: "spell"`). Magic resistance: "Yes" → `kind: "normal"`, "No" → `kind: "ignores_mr"`, "20%" / descriptive strings → `kind: "special"` with original string in `sourceText`
  - [ ] `SpellDamageSpec` has no `kind: "special"` fallback — on parser failure, initialize to `kind: "none"` with original string in `sourceText`; this does NOT trigger the warning banner (unlike all other field types)
- [ ] 3.7c Update `SpellEditor.tsx` — save path:
  - [ ] Save path must always produce v2-shaped `canonical_data` (no `dm_guidance` on SavingThrowSpec, `sourceText` on SpellDamageSpec)
- [ ] 3.7d Update `WarningBanner.tsx` — banner UX and nav guard:
  - [ ] Non-dismissible by the user directly (no dismiss button)
  - [ ] Per-field dismissal on edit: fields are removed from the banner individually when the user edits them to a non-special value
  - [ ] Per-field dismissal on successful save: after a successful save, fields still at `kind: "special"` are also dismissed from the banner — the fallback value is now durably stored and no unsaved changes remain for that field. The banner is fully dismissed only when no fields remain listed.
  - [ ] After a failed save, the banner persists unchanged for all listed fields
  - [ ] Nav guard: prompts confirmation only when banner is active AND form has unsaved changes; integrates with any existing unsaved-changes guard rather than adding a separate interceptor

## 4. Frontend Detail Views

- [ ] 4.1 Update spell detail views in `src/ui/spell-detail/` for Saving Throw:
  - [ ] Remove `dmGuidance` references
  - [ ] For `single`/`multiple` kinds: display `rawLegacyValue` as a secondary "Original source" annotation (collapsible to reduce clutter)
  - [ ] For `dm_adjudicated` kind: display `rawLegacyValue` as the primary descriptive content
  - [ ] Always display `notes` when present
- [ ] 4.2 Update spell detail views for Range, Duration, and Area:
  - [ ] Primary display: computed `.text` value from `canonical_data`
  - [ ] First fallback: `rawLegacyValue` (original authored string) when `.text` is absent
  - [ ] Second fallback: synthesize a display string from the structured algebraic fields when both `.text` and `rawLegacyValue` are absent AND structured fields are non-empty (i.e., structured fields are present and not null/undefined — not merely zero-valued); do NOT attempt to synthesize from empty/absent structured fields
- [ ] 4.2b Update spell detail views for Casting Time (flat object, separate from spec-based fields):
  - [ ] Primary display: computed `.text` value from `canonical_data`
  - [ ] First fallback: `rawLegacyValue` when `.text` is absent
  - [ ] Second fallback: synthesize from `(baseValue, unit)` — the only two structured fields on the `CastingTime` flat object
- [ ] 4.3 Update spell detail views for Damage and Magic Resistance:
  - [ ] Damage: display the structured formula from algebraic fields when present; fall back to `sourceText` when algebraic fields are absent or empty
  - [ ] Magic Resistance: display `kind` and `appliesTo`; display `sourceText` when present (primary content for `kind = "special"`)

## 5. Documentation & E2E Tests

- [ ] 5.1 Update `docs/architecture/canonical-serialization.md`:
  - [ ] §2.2.1 hashed field inventory: add `SavingThrowSpec.raw_legacy_value`; remove `SpellDamageSpec.raw_legacy_value` (renamed to `source_text` and moved to §2.3)
  - [ ] §3 Text Field Normalization Mode Mapping table: add `AreaSpec.text` → Structured + unit alias; `DurationSpec.text` → Structured + unit alias; document all `raw_legacy_value` fields (SpellCastingTime, RangeSpec, AreaSpec, DurationSpec, SavingThrowSpec) as stored as-is in a single row or footnote; add `MagicResistanceSpec.source_text` → Textual; add `SpellDamageSpec.source_text` → Textual
  - [ ] §2.3 metadata exclusions table: add `SpellDamageSpec.source_text` and `MagicResistanceSpec.source_text` alongside `ExperienceComponentSpec.source_text`; remove `SavingThrowSpec.dm_guidance` normalization row
- [ ] 5.2 Update `docs/SCHEMA_VERSIONING.md` with a v1→v2 section documenting: (1) bump `CURRENT_SCHEMA_VERSION` to `2`; (2) breaking changes (universal `raw_legacy_value` persistence, 5e casting time unit removal, `dm_guidance` removal from SavingThrowSpec, SpellDamageSpec `raw_legacy_value` → `source_text`); (3) reference `migrate_to_v2()` in the normalize pipeline and the `migrate_all_spells_to_v2` bulk command; (4) note that all content hashes change after migration (one-time re-hash)
- [ ] 5.3 Update Playwright E2E tests:
  - [ ] `spell_editor_structured_data.spec.ts` and related specs: account for payload shape changes (new `text`, `rawLegacyValue`, `sourceText` fields; removed `dmGuidance` on SavingThrowSpec)
  - [ ] Verify 5e unit options (`"action"`, `"bonus_action"`, `"reaction"`) are absent from Casting Time dropdowns
  - [ ] Add/update scenarios for: warning banner visibility on parser fallback, banner persistence after failed save, banner dismissal per-field after successful save, nav guard prompt when banner is active with unsaved changes
  - [ ] Verify `rawLegacyValue` secondary annotation renders in the Saving Throw detail view
  - [ ] Verify `sourceText` renders as the original source annotation in Damage and Magic Resistance detail views
  - [ ] Add kind-transition E2E scenarios per the structured-fields spec: Range distance→personal (clears `distance`+`unit`), Duration time→instant (clears `unit`+`duration`, emits `text: "Instant"`), Duration instant→time (initializes defaults), Duration any→special (preserves `rawLegacyValue`), CastingTime segment→special (shows `rawLegacyValue`), CastingTime special→segment (clears `rawLegacyValue`, recomputes `.text`), usage-limited round-trip (reinitializes `uses` after kind cycle)
  - [ ] Verify `kind="special"` → `.text` derivation: when `rawLegacyValue` is entered for a `kind="special"` field, `.text` must reflect the same value; when `rawLegacyValue` is empty, `.text` must be `undefined` (not `""`)
  - [ ] Verify form loading/disabled state: form inputs must be disabled while parser invocations are in flight and enabled after all resolve
  - [ ] Add E2E scenario for loading v1-shaped `canonical_data`: verify `dm_guidance` is remapped to `notes`, `SpellDamageSpec.raw_legacy_value` is treated as `sourceText`, and both `sourceText`+`rawLegacyValue` coexistence prefers `sourceText`
  - [ ] Regenerate any test fixture `canonical_data` blobs whose `content_hash` values are invalidated by the v1→v2 migration
- [ ] 5.4 Update Storybook stories for all modified editor components (`DamageForm`, `SavingThrowInput`, `MagicResistanceInput`, `AreaForm`, `StructuredFieldInput`): add/update stories to reflect new `source_text`, `raw_legacy_value`, and `text` props; remove stories that reference `dm_guidance` on `SavingThrowSpec`
- [ ] 5.5 Update Vitest unit tests in `apps/desktop/src/types/spell.test.ts`:
  - [ ] `savingThrowToText`: the `dm_adjudicated` test uses `dmGuidance` (old field) — update to use `rawLegacyValue` (or `notes`, whichever the function now reads for that kind after `dm_guidance` removal) and add a test case for `rawLegacyValue` as the fallback annotation
  - [ ] `damageToText`: the `dm_adjudicated` test uses `rawLegacyValue` on `SpellDamageSpec` — update to use `sourceText` (renamed field) and add a test case for `sourceText` as the read-only annotation for all kinds
  - [ ] Add tests for `castingTimeToText()` and `durationToText()` covering: input with a removed 5e unit (`"action"`, `"bonus_action"`, `"reaction"`) is not accepted (TypeScript compile-time), `unit="special"` with `rawLegacyValue` displays the legacy string, standard units produce the expected output string. Note: `durationToText` produces bare unit strings (e.g., `"3 round"`, not `"3 rounds"`) — tests must assert this exact format

---

## Acceptance Criteria

The following invariants MUST hold after all tasks are complete:

- [ ] All existing spells can be migrated from schema v1 to v2 without data loss (except truncated `dm_guidance` → `notes` which is surfaced as an error)
- [ ] No 5e casting time units (`"action"`, `"bonus_action"`, `"reaction"`) remain in the schema enum, TypeScript types, or UI dropdowns
- [ ] `dm_guidance` is fully removed from `SavingThrowSpec` in schema, Rust types, TypeScript types, and all UI bindings (retained only on `SpellDamageSpec`)
- [ ] Every hashed computed field (`AreaSpec`, `DurationSpec`, `RangeSpec`, `SavingThrowSpec`, `casting_time`) unconditionally populates `raw_legacy_value` on every parse
- [ ] Every non-hashed metadata field (`SpellDamageSpec`, `MagicResistanceSpec`, `ExperienceComponentSpec`) uses `source_text` (not `raw_legacy_value`)
- [ ] `AreaSpec.text` and `DurationSpec.text` are synthesized by `normalize()` from structured fields (or from `raw_legacy_value` for `kind="special"`)
- [ ] Content hashes are consistent after migration — `raw_legacy_value` IS hashed, `source_text` IS pruned
- [ ] Frontend can load both v1-shaped and v2-shaped `canonical_data` without errors
- [ ] Resolved specs (`ResolvedAreaSpec`, `ResolvedDurationSpec`, `ResolvedRangeSpec`) remain unchanged
