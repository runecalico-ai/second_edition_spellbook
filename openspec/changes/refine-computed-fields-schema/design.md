## Context
The canonical `spell.schema.json` dictates the data shape for all AD&D 2nd Edition spells. Over time, several generic computed fields (`AreaSpec`, `DurationSpec`, `SavingThrowSpec`, `RangeSpec`, `MagicResistanceSpec`, `ExperienceComponentSpec`) have been modeled inconsistently. Some capture the original legacy text in `raw_legacy_value` only upon a parse failure, while others lack the property entirely. Additionally, anachronistic 5th Edition mechanics (like bonus actions) and incorrect saving throw categories have crept into various enums.

## Goals / Non-Goals

**Goals:**
- Unify all complex computed properties to definitively store their original source string — in `raw_legacy_value` for hashed content fields, or `source_text` for non-hashed metadata fields — regardless of parse success.
- Introduce `text` attributes for UI-facing dimensions (Area, Duration) to match Range and Casting Time.
- Enforce strict AD&D 2nd Edition mechanical enums for combat economy (casting_time).
- Clarify the distinct semantic roles of `save_type` and `save_vs` on `SingleSave` in documentation.

**Non-Goals:**
- Adding `text`, `raw_legacy_value`, or `source_text` to resolved specs (`ResolvedAreaSpec`, `ResolvedDurationSpec`, `ResolvedRangeSpec`). Considered and rejected — see Decision 7.
- Normalizing existing `raw_legacy_value` fields. Considered and rejected to avoid additional hash invalidation beyond the v1→v2 migration — see Decision 6.
- Completely rewriting the Python extraction logic (this change only adds unconditional `raw_legacy_value`/`source_text` population to the existing pipeline).

## Decisions

**Decision 1: Universal Legacy Text Persistence**
- *Rationale:* The goal of the Second Edition Spellbook is to act as an offline, canonical reference. Every structured field parsing layer MUST unconditionally save the original textual representation. The specific parsers/properties are: `AreaSpec`, `DurationSpec`, `RangeSpec`, `SavingThrowSpec`, and `casting_time` (Casting Time flat object) — these use `raw_legacy_value` (hashed content). `SpellDamageSpec`, `MagicResistanceSpec`, and `ExperienceComponentSpec` use `source_text` (non-hashed metadata) because their original text is a narrative descriptor that should not differentiate spell hashes. If the algebraic parser misinterprets a complex string, the original text must still be available for UIs to display or for future data-migration scripts to re-parse.
- *Alternatives Considered:* (a) Re-synthesizing text from the algebraic properties. This was rejected because 2nd Edition spell descriptions are too esoteric (e.g., "10 ft. radius + 1 ft. per level above 10th") to reliably compute backwards from a rigid schema. (b) Using `raw_legacy_value` uniformly on all specs, including `SpellDamageSpec`, `ExperienceComponentSpec`, and `MagicResistanceSpec`. This was rejected because it would promote narrative metadata to hashed content, changing hash semantics for `ExperienceComponentSpec` (where `source_text` is explicitly excluded per §2.3) and adding unnecessary hash instability to `SpellDamageSpec` and `MagicResistanceSpec`.

**Decision 2: UI `text` Properties for Area and Duration**
- *Rationale:* Frontends should not be responsible for rebuilding legible strings from complex algebraic nodes. By moving `text` alongside the algebraic parts, React components can bind directly to the canonical string. When a user edits an algebraic field, the frontend MUST recompute `.text` in real-time from the current structured values (see `spell-editor-structured-fields` spec — Text Preview Computation). The backend recomputes `.text` authoritatively during canonical serialization on save, ensuring consistency.
- **`.text` derivation rule (authoritative):** The structured algebraic fields are always the primary source for `.text`. The `.text` value is synthesized by applying Structured + unit alias normalization to a canonical string assembled from the structured fields (e.g., `kind`, `distance`, `unit`, `duration`). The sole exception is `kind="special"`, where no structured fields exist to synthesize from — in that case `.text` MUST be derived from `raw_legacy_value` (the user-authored or importer-supplied string). `raw_legacy_value` is never the input for `.text` when structured fields are present, even if both values are populated. This distinction resolves the apparent tension in backend scenarios that reference `raw_legacy_value` as a `.text` source: those scenarios apply only to `kind="special"` spells or importers producing a best-effort initial `.text` before the backend's authoritative `normalize()` pass runs.

**Decision 3: Deprecation of `dm_guidance` in SavingThrowSpec**
- *Rationale:* `SavingThrowSpec` already contains a general-purpose `notes` field (`String`, `maxLength: 2048`) that serves the exact same narrative function for edge cases.

**Decision 4: Clarification of `save_type` vs `save_vs` Semantics (No Enum Changes)**
- *Rationale:* `SingleSave` has two distinct properties that are easily confused. `save_type` identifies which *row* of the AD&D 2e saving throw matrix applies — the saving throw *category* (e.g., `"paralyzation_poison_death"`, `"rod_staff_wand"`, `"petrification_polymorph"`, `"breath_weapon"`, `"spell"`, `"special"`). `save_vs` identifies the *specific effect* the target is saving against (e.g., `"spell"`, `"poison"`, `"death_magic"`, `"weapon"`, `"other"`). These roles are already correctly modeled in the existing schema enums; values like `"rod_staff_wand"` belong exclusively in `save_type` (not `save_vs`), and `"weapon"` in `save_vs` is valid for 2e effects that call for a save vs. physical attacks. No enum changes are required — only documentation clarification.
- *Alternatives Considered:* Adding `"paralyzation"` and `"rod_staff_wand"` to `save_vs` and removing `"weapon"`. Rejected because those values describe matrix categories (already in `save_type`), and `"weapon"` is a legitimate 2e effect descriptor.

**Decision 5: Schema Version Bump to 2**
- *Rationale:* This change introduces multiple breaking modifications: universal `raw_legacy_value` persistence adds a new hashed field to every existing spell (per §2.2.1 of the canonical serialization contract, `raw_legacy_value` is included in the canonical hash), enum values are removed from `casting_time.unit`, and `dm_guidance` is deleted from `SavingThrowSpec`. Together, these changes mean every previously-hashed spell will produce a different SHA-256 hash after re-serialization. Per the schema versioning strategy, this requires incrementing `CURRENT_SCHEMA_VERSION` from `1` to `2`.
- *Implementation:* A `migrate_to_v2()` function is added to the `normalize()` pipeline. When a spell with `schema_version < 2` is encountered, the migration performs:
  1. **SavingThrowSpec `dm_guidance` → `notes`**: If `dm_guidance` is populated, append its content to `notes` (separated by a newline if `notes` already has content), then clear `dm_guidance`.
  2. **CastingTime 5e unit mapping**: If `casting_time.unit` is `"action"`, `"bonus_action"`, or `"reaction"`, remap to `"special"` and copy the existing `casting_time.text` value (already present on the v1 flat object) into `raw_legacy_value` if not already populated. If `casting_time.text` is also empty/null, synthesize from `base_value` + `unit` (e.g. `"1 action"`) before storing in `raw_legacy_value`. *Edge case:* If `base_value` is `0` and `unit` is a 5e term (e.g., `"action"`), the synthesized string is `"0 action"`. This is an unusual but valid last-resort fallback — it is stored as-is so that at least some auditable originating text is preserved rather than `None`. If `base_value` is also absent/null, the synthesized string degenerates to `"0 action"` for the default; the empty-string case (`base_value` is `0` and `casting_time.text` is `""`) is treated the same as null and falls through to synthesis.
  3. **SpellDamageSpec `raw_legacy_value` → `source_text`**: If `raw_legacy_value` is populated on `SpellDamageSpec`, move the value to `source_text`, then clear `raw_legacy_value`.
  4. **Version stamp**: Set `schema_version = 2`.
- *Hash re-computation:* After `migrate_to_v2()` runs, the spell MUST be fully re-normalized and re-hashed. The new hash replaces the old `content_hash` in the SQLite database. This is a one-time migration cost.
- *Alternatives Considered:* Treating this as a non-breaking change (optional fields only). Rejected because `raw_legacy_value` is included in the canonical hash, meaning existing spells without the field hash differently than spells with it populated — the migration is unavoidable for hash consistency.

**Decision 6: Normalization Modes for New Fields**
- *Rationale:* The canonical serialization contract (§3) defines normalization modes for all text fields to ensure hash stability. New fields introduced by this change must specify their normalization mode explicitly to avoid ambiguity during implementation.
- *New field normalization modes:*
  - `AreaSpec.text` → **Structured + unit alias normalization** (word boundaries). Matches `RangeSpec.text`: collapse whitespace (preserve case), then normalize unit aliases with word boundaries (e.g., "10 yards" → "10 yd"; "backyard" unchanged). Area text describes spatial dimensions using the same unit vocabulary as range.
  - `DurationSpec.text` → **Structured + unit alias normalization** (word boundaries). Same treatment as `RangeSpec.text` and `AreaSpec.text`. Duration text may reference distance units in rare compound specifications, and uniform unit alias normalization prevents hash drift. *Practical note:* Typical duration unit tokens (`round`, `turn`, `day`, `week`, `month`, `year`, `hour`, `minute`) do not appear in the distance-unit alias table (which maps `yards → yd`, `feet → ft`, etc.) and will pass through the alias step unchanged. Application of the alias table to duration text is therefore a conservative no-op for standard durations. The one known compound case is a duration phrased as a distance (e.g., `"until moved 10 yards"`) — the alias table correctly normalizes these. No concrete example of a standard 2e spell using this form exists in the current dataset; the decision is precautionary to maintain normalization parity with `AreaSpec.text`.
  - `SavingThrowSpec.raw_legacy_value` → **No explicit normalization** (stored as-is). This is consistent with the existing `raw_legacy_value` fields on `SpellCastingTime`, `RangeSpec`, `AreaSpec`, and `DurationSpec`, none of which apply a normalization mode in their `normalize()` implementations. The "raw" prefix signals the value is preserved exactly as received from the parser.
  - `MagicResistanceSpec.source_text` → **Textual**. As metadata excluded from the canonical hash (§2.3), `source_text` uses the same normalization as `ExperienceComponentSpec.source_text`: NFC, trim horizontal whitespace, preserve distinct lines.
  - `SpellDamageSpec.source_text` → **Textual**. Same rationale as `MagicResistanceSpec.source_text` above.
- *Implementation note:* All existing `raw_legacy_value` fields (`SpellCastingTime`, `RangeSpec`, `AreaSpec`, `DurationSpec`) are intentionally NOT normalized in their spec's `normalize()` method. This is by design — the "raw" prefix indicates the value is stored as received from the parser. In contrast, `source_text` fields (metadata excluded from hash) use Textual normalization for consistent storage formatting. For the canonical-serialization normalization table, all `raw_legacy_value` fields (SpellCastingTime, RangeSpec, AreaSpec, DurationSpec, SavingThrowSpec) SHOULD be documented together—e.g. in a single footnote or one row per spec—as stored as-is (no normalization applied), so the contract is symmetric and searchable.
- *Alternatives Considered:* Applying `Textual` normalization to all `raw_legacy_value` fields for hash stability. Rejected to avoid changing existing normalization behavior for hashed content, which could invalidate previously computed hashes beyond what the v1→v2 migration already addresses.

**Decision 7: Resolved Specs Do Not Include `text` or `raw_legacy_value`**
- *Rationale:* The resolved specs (`ResolvedAreaSpec`, `ResolvedDurationSpec`, `ResolvedRangeSpec`) represent fully-evaluated algebraic snapshots at a specific caster level. They contain only fixed scalar values — no formulas, no per-level scaling, and no text synthesis. Since these specs represent deterministic computational output (not authored content), neither `text` (a synthesized display string) nor `raw_legacy_value` (an authored legacy string) is appropriate.
- *Scope:* `resolved-area-spec.schema.md`, `resolved-duration-spec.schema.md`, and `resolved-range-spec.schema.md` remain unchanged by this proposal. They do not gain `text`, `raw_legacy_value`, or `source_text` properties.

## Risks / Trade-offs

**Risk: Legacy UI States**
- *Rationale:* React components binding to `AreaSpec` and `DurationSpec` might display stale text if a user alters the algebraic portion (e.g., radius: 10 to 20) but the `text` field still says "10 ft. radius".
- *Mitigation:* The React UI MUST recompute `.text` in real-time whenever the underlying dimension components are modified by the user (per Decision 2). The backend authoritatively recomputes `.text` on save.

**Risk: Mass Hash Invalidation**
- *Risk:* Every spell in the SQLite database will have its `content_hash` invalidated after migration to schema version 2, since new `raw_legacy_value` fields are included in the canonical hash. This is a one-time cost but affects all stored spells.
- *Mitigation:* The `migrate_to_v2()` step in `normalize()` automatically triggers re-hashing. On first application launch after the update, any spell opened or re-serialized via the existing normalization pipeline will be lazily migrated. A bulk migration command (Tauri or CLI) SHOULD also be provided to re-hash all spells in a single pass for users who prefer upfront consistency.

**Risk: Migration Failure Mid-Batch**
- *Risk:* During bulk migration, a corrupt or malformed spell record could cause `migrate_to_v2()` or `normalize()` to fail, potentially leaving the database in a partially-migrated state.
- *Mitigation:* The bulk migration command (`migrate_all_spells_to_v2`) runs inside a single SQLite transaction. Individual spell-level failures (parse errors, normalization errors) are collected but do NOT abort the batch — the migration continues and reports failures in the return value. Database-level failures (disk full, locked) cause the entire transaction to roll back, leaving the database unchanged. See the Bulk Migration Command Contract in the backend spec for full details.

**Trade-off: Duration concentration kind-only in editor**
- The spell editor treats `DurationSpec.kind = "concentration"` as kind-only (no `unit`/`duration` sub-fields). Opening a spell that has concentration plus unit/duration sub-fields (valid per schema) will clear those sub-fields on next save. This is an accepted trade-off; 2e concentration spells do not use time-bounded duration sub-fields in practice.

## Migration Plan

1. Update the `spell.schema.json` with the new properties and enum constraints.
2. Update the canonical Rust type bindings (e.g., `Option<String>` for `raw_legacy_value`, remove `dm_guidance` from `SavingThrowSpec`, add `source_text` to `MagicResistanceSpec`, rename `raw_legacy_value` to `source_text` on `SpellDamageSpec`).
3. Bump `CURRENT_SCHEMA_VERSION` to `2` in `canonical_spell.rs`.
4. Implement `migrate_to_v2()` in the `normalize()` pipeline:
   - Move `SavingThrowSpec.dm_guidance` content into `notes` (a single `String` per schema; concatenate with `"\n"` separator if `notes` is already non-empty).
   - Remap 5e `casting_time.unit` values (`"action"`, `"bonus_action"`, `"reaction"`) to `"special"`, preserving the existing `casting_time.text` property value (already present on the v1 flat object) in `raw_legacy_value` if not already populated. If `casting_time.text` is also empty/null, synthesize from `base_value` + `unit` (e.g. `"1 action"`). Treat `casting_time.text = ""` the same as null (fall through to synthesis). If `base_value` is `0`, the synthesized fallback is `"0 <unit>"` — this is acceptable as a last-resort auditable string.
   - Rename `SpellDamageSpec.raw_legacy_value` to `source_text` (move value, clear old field).
   - Stamp `schema_version = 2`.
5. After migration, trigger full re-normalization and re-hash of the spell. The new `content_hash` replaces the old value in the database.
6. Update `docs/architecture/canonical-serialization.md`:
   - §2.2.1: Add `SavingThrowSpec` to the `raw_legacy_value` field inventory. Remove `SpellDamageSpec` from the inventory (now uses `source_text`).
   - Normalization table: Add entries with explicit modes per Decision 6:
     - `AreaSpec.text` → Structured + unit alias normalization (matching `RangeSpec.text`)
     - `DurationSpec.text` → Structured + unit alias normalization (matching `RangeSpec.text`)
     - Document all `raw_legacy_value` fields (SpellCastingTime, RangeSpec, AreaSpec, DurationSpec, SavingThrowSpec) as stored as-is (no normalization)—e.g. one footnote or one row per spec—so the contract is symmetric (see Decision 6).
     - `MagicResistanceSpec.source_text` → Textual (matching `ExperienceComponentSpec.source_text`)
     - `SpellDamageSpec.source_text` → Textual (matching `ExperienceComponentSpec.source_text`)
   - §2.3 metadata table: Add `SpellDamageSpec.source_text` and `MagicResistanceSpec.source_text` alongside existing `ExperienceComponentSpec.source_text`.
   - Remove the normalization table row for `SavingThrowSpec.dm_guidance` (field removed in v2).
7. Update `docs/SCHEMA_VERSIONING.md` to document the version 1 → 2 migration steps and rationale. The new v2 section SHOULD include: (1) bump `CURRENT_SCHEMA_VERSION` to `2` (`MIN_SUPPORTED_SCHEMA_VERSION` remains unchanged at `1` — v1 spells are valid migration targets for `migrate_to_v2()` and must not be rejected); (2) list breaking changes (universal `raw_legacy_value` persistence, 5e casting time unit removal, `dm_guidance` removal from SavingThrowSpec, SpellDamageSpec `raw_legacy_value` → `source_text`); (3) reference `migrate_to_v2()` in the normalize pipeline and the bulk command `migrate_all_spells_to_v2`; (4) note that content hashes change after migration (one-time re-hash).
8. Modify the Python importer logic to unconditionally populate `raw_legacy_value` during parsing.
9. Update the React `SpellEditor` components per the three focused delta specs (`spell-editor-complex-forms`, `spell-editor-structured-fields`, `spell-editor-data-loading`) to replace `dm_guidance` with `notes`, bind to the new `text` and `raw_legacy_value` fields, and implement hybrid data loading with parser fallback UX.
10. Provide a bulk re-hash command (Tauri command or CLI) to migrate all spells in a single pass on first launch.

## Spec ↔ File Cross-Reference

| Delta Spec | Primary Files |
|---|---|
| `backend` | `src-tauri/schemas/spell.schema.json`, `src-tauri/src/models/spell.rs`, `src-tauri/src/models/canonical_spell.rs` |
| `spell-detail` | `src/ui/spell-detail/` (React detail view components) |
| `spell-editor-complex-forms` | `src/components/spell-editor/DamageForm.tsx`, `src/components/spell-editor/AreaForm.tsx`, `src/components/spell-editor/SavingThrowInput.tsx`, `src/components/spell-editor/MagicResistanceInput.tsx` |
| `spell-editor-structured-fields` | `src/components/spell-editor/StructuredFieldInput.tsx` (and sub-components) |
| `spell-editor-data-loading` | `src/components/spell-editor/SpellEditor.tsx` (loading logic), `src/components/spell-editor/WarningBanner.tsx` |
| `importers` | `services/ml/` (Python importer pipeline), `src-tauri/src/utils/spell_parser.rs` |

*All paths relative to `apps/desktop/`.*

## Text Preservation Field Taxonomy

| Field | Specs Using It | In Hash? | Normalization | Editable in UI? | Set By |
|---|---|---|---|---|---|
| `raw_legacy_value` | `RangeSpec`, `DurationSpec`, `AreaSpec`, `SavingThrowSpec`, `casting_time` | Yes | None (stored as-is) | Only when `kind="special"` | Importer, backend migration |
| `source_text` | `SpellDamageSpec`, `MagicResistanceSpec`, `ExperienceComponentSpec` | No (§2.3 metadata) | Textual (NFC, trim) | No (read-only metadata) | Importer, backend migration |
| `.text` | `RangeSpec`, `DurationSpec`, `AreaSpec`, `casting_time` | Yes | Structured + unit alias | Read-only preview (auto-recomputed) | Frontend (preview), backend (authoritative on save), importer (best-effort) |

## Open Questions
- None at this time. *(Normalization modes, `raw_legacy_value` patterns, and resolved spec scope clarified in Decisions 6 and 7.)*
