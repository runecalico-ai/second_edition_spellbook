# Two-Pass In-Depth Review: refine-computed-fields-schema

This document records a two-pass review of the change spec for **inconsistencies**, **unclear points**, **missing information**, and **suggestions for improvement**. Artifacts reviewed: `proposal.md`, `design.md`, `tasks.md`, `.openspec.yaml`, and all delta specs under `specs/` (backend, importers, spell-detail, spell-editor-data-loading, spell-editor-complex-forms, spell-editor-structured-fields). Reference docs: `docs/architecture/canonical-serialization.md`, `docs/SCHEMA_VERSIONING.md`.

---

## Pass 1: Consistency and Cross-References

### 1.1 Cross-document alignment

- **Schema version and migration**: Proposal, design (Decision 5), tasks (1.3, 1.6), and backend spec agree on: `CURRENT_SCHEMA_VERSION = 2`, `migrate_to_v2()` runs first in `normalize()`, before §2.5 default materialization; `MIN_SUPPORTED_SCHEMA_VERSION` remains `1`; bulk command `migrate_all_spells_to_v2` and return type `MigrationResult` / `MigrateV2Result`.
- **dm_guidance**: Removal only from `SavingThrowSpec`; `SpellDamageSpec.dm_guidance` is retained. This is consistent across proposal, design (Decision 3), tasks (3.2, 3.3, 5.5), spell-detail, spell-editor-complex-forms, and data-loading.
- **raw_legacy_value vs source_text**: Hashed specs (Area, Duration, Range, SavingThrow, casting_time) use `raw_legacy_value`; non-hashed (SpellDamageSpec, MagicResistanceSpec, ExperienceComponentSpec) use `source_text`. Consistently stated in proposal, design, backend, importers, and tasks.
- **Casting time 5e remap**: Order is consistent: store original in `raw_legacy_value` first (or synthesize if `casting_time.text` empty/null), then set `unit` to `"special"`. No overwrite if `raw_legacy_value` already set. Design, tasks (1.3, 2.1), and backend spec align.
- **notes truncation**: `dm_guidance` appended after existing `notes`; if combined length > 2048, truncate and set `notes_truncated = true`; single-spell path must not persist and must return error; bulk path records spell in `failed`. Design, tasks 1.3, and backend spec align.
- **Resolved specs**: No `text`, `raw_legacy_value`, or `source_text` on resolved specs. Stated in proposal (Capabilities), design (Decision 7), tasks (1.1, 1.5, acceptance criteria), and backend spec.

### 1.2 Section references

- **§2.2.1, §2.3, §2.5**: All references point to existing sections in `docs/architecture/canonical-serialization.md` (§2.2.1 Fallback storage, §2.3 Metadata Exclusion, §2.5 Default Materialization). Correct.
- **Normalization table**: The “normalization table” that tasks 5.1 and the proposal ask to update is the **§3 “Text Field Normalization Mode Mapping”** table in `canonical-serialization.md` (lines 152–197). The spec does not name §3 explicitly; implementers could search for “normalization table” and find it, but the reference could be clearer (see Pass 2).

### 1.3 Minor consistency notes

- **Backend “Unparseable Area Fallback”**: The phrase “(previously stored in notes; now in raw_legacy_value only)” is historical context. It could be misread as referring to SavingThrowSpec’s `notes`. Consider rephrasing to “(legacy behavior may have used AreaSpec.notes for unparseable text; v2 uses `raw_legacy_value` only)” or dropping the parenthetical if not needed for implementation.
- **ExperienceComponentSpec**: Proposal [NO CHANGE], design, importers (“no code change required”), and backend (“no change from v1”) are consistent.

---

## Pass 2: Unclear Points, Missing Information, Suggestions

### 2.1 Unclear or ambiguous wording

1. **“Normalization table” location**  
   Tasks 5.1 say “Normalization table: add … remove …”. The table is in **§3 String Normalization Modes → Text Field Normalization Mode Mapping**. **Suggestion:** In tasks 5.1 and in the proposal’s Impact bullet for `canonical-serialization.md`, explicitly reference “§3 Text Field Normalization Mode Mapping table” so the edit location is unambiguous.

2. **raw_legacy_value “stored as-is” in the doc**  
   Design Decision 6 says to document all `raw_legacy_value` fields “as stored as-is in a single row or footnote”. The current §3 table does not list `raw_legacy_value` at all (so “no normalization” is implicit). **Suggestion:** Add a single footnote under the §3 table, e.g. “`raw_legacy_value` on SpellCastingTime, RangeSpec, AreaSpec, DurationSpec, and SavingThrowSpec is not normalized (stored as-is).” so the contract is explicit and searchable.

3. **Unit alias list**  
   Design and backend refer to “word-boundary-aware replacements (e.g., yards → yd, feet → ft)”. The full list lives in `canonical-serialization.md` §2.10 and §3 (RangeSpec.text). **Suggestion:** In design or backend spec, add “per the unit alias list in `docs/architecture/canonical-serialization.md` §2.10 / §3” so implementers know where to look.

4. **Zod / type guard for parser responses**  
   Tasks 3.7b say “Add Zod schema validation (or equivalent type guard) for all Tauri parser command responses”. **Suggestion:** Add one line: “e.g. validate against the same TypeScript interfaces used for spell types” or “see `src/types/spell.ts` (or shared parser response types)” so the validation target is clear.

5. **E2E fixture regeneration**  
   Tasks 5.3: “Regenerate any test fixture `canonical_data` blobs whose `content_hash` values are invalidated by the v1→v2 migration.” **Suggestion:** Specify how to regenerate, e.g. “Run normalize/migrate on the fixture payloads and store the resulting `content_hash`” to avoid ad-hoc edits.

### 2.2 Missing or underspecified details

6. **is_standard_complex heuristic**  
   Importers spec and tasks 1.4/1.5 refer to “standard complex category names” and “Rod, Staff, or Wand” and point to `mechanics.rs`. The exact list of phrases that must be treated as a single save is not in the spec. **Suggestion:** Add a short requirement: “The parser MUST treat the following (or equivalent) as a single save and MUST NOT split on ‘or’: ‘Rod, Staff, or Wand’. Other standard complex names MAY be defined in code; the spec contract is that such names are not split.” This keeps behavior testable without locking the full list in the spec.

7. **truncated_spell_id usage in bulk**  
   `MigrateV2Result` has `truncated_spell_id: Option<i64>`. Backend spec says it is “typically None” in single-spell context. **Suggestion:** In the backend spec, add one sentence: “In bulk migration, when `notes_truncated` is true, the caller MAY set `truncated_spell_id` to the current spell’s id so that the corresponding `MigrationFailure` can include it.” (Optional; current text is already implementable.)

8. **durationToText format**  
   Tasks 5.5 state “durationToText produces bare unit strings (e.g., ‘3 round’, not ‘3 rounds’)”. That is a clear contract; no change needed. If there is a shared helper or spec for “duration display string format”, a cross-reference would strengthen traceability.

9. **Frontend v1 remap: empty notes**  
   Data-loading says “append dm_guidance after notes with \n” and “If notes is already non-empty”. When loading v1 data, if `notes` is missing/empty and `dm_guidance` is present, the result should be `dm_guidance` only (no leading `"\n"`). This matches backend (“just dm_guidance_content if notes is empty”). **Suggestion:** In data-loading “v1-Shaped canonical_data Compatibility”, add: “When remapping dm_guidance → notes: if notes is empty or absent, use dm_guidance as the new notes; otherwise append ‘\n’ + dm_guidance to notes.” so frontend and backend stay aligned.

### 2.3 Edge cases and ordering

10. **schema_version 0 and §2.5**  
    Design and backend correctly state that `migrate_to_v2()` runs before §2.5, so a spell with `schema_version = 0` is migrated to 2 and §2.5 never sees 0. The existing §2.5 row “schema_version | 1 | If 0” still applies to any code path where migration did not run. **Suggestion:** In SCHEMA_VERSIONING.md’s v2 section, add a note: “When migrate_to_v2() is in the pipeline, spells with version 0 are migrated to 2 before default materialization, so §2.5’s ‘If 0 → 1’ applies only to pipelines that do not run migrate_to_v2().” This avoids confusion when reading the default table.

11. **Concentration kind-only and data loss**  
    Design “Trade-off: Duration concentration kind-only” and spell-editor-structured-fields schema note already state that opening a spell with concentration + unit/duration can clear those sub-fields. No inconsistency; the trade-off is documented.

### 2.4 Suggestions for improvement (non-blocking)

12. **Design “Open Questions”**  
    Currently “None at this time.” Consider leaving the section in place with that line so future readers know it was considered and can add new questions there.

13. **Single source of truth for migration steps**  
    Migration steps appear in proposal, design (Decision 5, Migration Plan), tasks (1.3), and backend spec. They are aligned but duplicated. **Suggestion:** In design or backend, add “Migration steps are authoritatively defined in [backend spec §Migration Version 1 Spell Migration]” and keep the others as summaries, to reduce drift risk.

14. **Spell-detail fallback order**  
    Spell-detail spec and tasks 4.2/4.2b define: primary `.text`, first fallback `rawLegacyValue`, second fallback synthesize from structured fields. Tasks 4.2 add “do NOT attempt to synthesize from empty/absent structured fields”. That is clear; no change needed.

15. **Acceptance criteria vs tasks**  
    The acceptance criteria at the end of tasks.md are a good checklist. Consider adding one explicit item: “Documentation (§3 and §2.2.1/§2.3) in canonical-serialization.md and SCHEMA_VERSIONING.md v2 section updated as per tasks 5.1 and 5.2.” so doc updates are not missed.

---

## Summary

| Category              | Count | Severity |
|-----------------------|-------|----------|
| Inconsistencies       | 0     | —        |
| Unclear points        | 5     | Low      |
| Missing information   | 4     | Low      |
| Improvement suggestions | 6  | Optional |

**Verdict:** The spec is consistent across artifacts, and section references are correct. The main improvements are: (1) explicitly pointing to §3 for the normalization table and adding a footnote for `raw_legacy_value` “as-is”, (2) clarifying a few implementation details (Zod target, fixture regeneration, v1 notes+dm_guidance when notes empty, optional truncated_spell_id in bulk), and (3) optionally tightening the “standard complex” single-save requirement and adding a short doc note on schema_version 0 vs §2.5. None of these are blocking for implementation; they improve clarity and maintainability.
