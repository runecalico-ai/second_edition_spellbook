## Why

The current generic casting of legacy strings into `raw_legacy_value` across various computed spell fields (`casting_time`, `DurationSpec`, `AreaSpec`, `SavingThrowSpec`, `RangeSpec`, `MagicResistanceSpec`, `ExperienceComponentSpec`) is inconsistent, typically only saving the string when a parse failure occurs, or in the case of `MagicResistanceSpec`, missing a text-preservation property entirely. By updating the schema to *always* store the `raw_legacy_value` (and adding `source_text` where `raw_legacy_value` would be inappropriate for hashing reasons), we ensure a 100% auditable ground truth for migration from 2nd edition sources, even on a "successful" parse. Furthermore, exposing a literal `text` field across `AreaSpec` and `DurationSpec` aligns them with `RangeSpec` and `casting_time`, enabling UIs to display the canonical text directly without needing to re-synthesize strings from algebraic parts. Removing `dm_guidance` from `SavingThrowSpec` streamlines the data structure since generic `notes` are sufficient for that purpose.

In addition to text preservation, the schema contains a 2nd Edition mechanical inaccuracy that must be addressed:
1. **Casting Time Units**: The schema includes 5th Edition combat economy terms (action, bonus action, reaction), which are fundamentally incompatible with 2e's segment/round initiative system.

**Validated as Correct (no changes required):**
- **Saving Throws**: The `save_type` and `save_vs` properties on `SingleSave` were reviewed and confirmed to be correctly modeled. `save_type` identifies which *row* of the 2e saving throw matrix to use (the saving throw *category*: `"paralyzation_poison_death"`, `"rod_staff_wand"`, `"petrification_polymorph"`, `"breath_weapon"`, `"spell"`, `"special"`). `save_vs` identifies *what specific effect* the target is saving against (e.g., `"spell"`, `"poison"`, `"death_magic"`, `"polymorph"`, `"petrification"`, `"breath"`, `"weapon"`, `"other"`). No enum changes are needed — only documentation clarification of these distinct roles (see Design Decision 4).

## What Changes

- **DurationSpec**:
  - [NEW] Add a `text` (string) property.
  - [MODIFY] Update the description of `raw_legacy_value` to indicate it is *always* stored, not just on parse failures.
- **AreaSpec**:
  - [NEW] Add a `text` (string) property.
  - [MODIFY] Update the description of `raw_legacy_value` to indicate it is *always* stored.
- **RangeSpec**:
  - [MODIFY] Update the description of `raw_legacy_value` to indicate it is *always* stored.
- **MagicResistanceSpec**:
  - [NEW] Add `source_text` property (non-hashed metadata) to preserve the original legacy text. `raw_legacy_value` is not used here because magic resistance text is a narrative descriptor, not canonical content that should differentiate spell hashes.
- **ExperienceComponentSpec**:
  - [NO CHANGE] `source_text` is retained as-is. It is already classified as metadata excluded from the canonical hash (per §2.3), and renaming it to `raw_legacy_value` would promote it to hashed content — an undesirable semantic shift.
- **SavingThrowSpec**:
  - [NEW] Add `raw_legacy_value` property to ensure original text preservation.
  - [DELETE] Remove `dm_guidance` property (use `notes` instead).
  - [CLARIFY] Document the distinct semantic roles of `save_type` (saving throw matrix row/category) and `save_vs` (specific effect being saved against) on `SingleSave`. No enum changes to either property.
- **SpellDamageSpec**:
  - [MODIFY] Rename `raw_legacy_value` to `source_text` (non-hashed metadata). Damage legacy text is a narrative descriptor that should not differentiate spell hashes, consistent with the approach for `MagicResistanceSpec` and `ExperienceComponentSpec`.
- **CastingTime**:
  - [NO CHANGE] The `text` property already exists on `casting_time` from prior schema work. No new property is added.
  - [MODIFY] Update the description of `raw_legacy_value` to indicate it is *always* stored.
  - [MODIFY] **BREAKING**: Update `unit` enum by removing 5e terms: `"action"`, `"bonus_action"`, and `"reaction"`.
- **Schema Version**:
  - [MODIFY] **BREAKING**: Bump `CURRENT_SCHEMA_VERSION` from `1` to `2`. The combination of universal `raw_legacy_value` persistence (which adds a new hashed field to every spell), enum removals, and field deletions constitutes a breaking schema change that invalidates existing content hashes.
  - [NEW] Add `migrate_to_v2()` migration step in the `normalize()` pipeline to handle version 1 → 2 upgrades: re-map `dm_guidance` → `notes` on `SavingThrowSpec`, and map any 5e `casting_time.unit` values to `"special"`.

## Capabilities

### New Capabilities
- `migrate_all_spells_to_v2` (Tauri command): Bulk migration command that re-normalizes and re-hashes all spells in the database from schema version 1 to version 2 in a single SQLite transaction. Returns a `MigrationResult` with counts and per-spell failure details. Emits `migration-progress` events for frontend progress display. See the Bulk Migration Command Contract in the backend spec. *Note: The frontend UI for launching or monitoring this command (beyond progress event handling) is out of scope for this change.*

### Unchanged Capabilities
- `resolved-area-spec`, `resolved-duration-spec`, `resolved-range-spec`: These resolved specs are **explicitly excluded** from this change. They represent fully-evaluated algebraic snapshots at a specific caster level (fixed scalars only — no formulas, no per-level scaling). Neither `text` (a synthesized display string) nor `raw_legacy_value` (an authored legacy string) is appropriate for deterministic computational output. See Design Decision 7 for full rationale.

### Modified Capabilities
- `spell-detail`: The rule for Saving Throw Display must be updated to remove the reference to `dm_guidance`.
- `spell-editor-complex-forms`: DamageForm, AreaForm, SavingThrowInput, and MagicResistanceInput must be updated to bind to new `text` fields and stop looking for `dm_guidance`. *(Split from `spell-editor` for independent review.)*
- `spell-editor-structured-fields`: StructuredFieldInput (Range, Duration, Casting Time) must emit schema-native shapes with correct defaults, text preview computation, and UI mapping. *(Split from `spell-editor` for independent review.)*
- `spell-editor-data-loading`: Hybrid canonical_data loading, legacy string parsing, casing standards for IPC/storage, warning banner UX, and parser fallback handling. *(Split from `spell-editor` for independent review.)*
- `importers`: The parser/importer layer must be updated to unconditionally save `raw_legacy_value` (or `source_text` for `SpellDamageSpec`, `MagicResistanceSpec`, and `ExperienceComponentSpec`) on all computed field parsers. It must also map 2e saving throw categories correctly.
- `backend`: The canonical rust type definitions must be updated to reflect the new text and legacy properties, the deleted `dm_guidance`, the restricted `casting_time` units, and the schema version 2 migration.

## Impact

- `apps/desktop/src-tauri/schemas/spell.schema.json`: Schema definitions.
- `apps/desktop/src-tauri/src/models/spell.rs` (and related): Rust type mappings and parsing logic.
- `apps/desktop/src-tauri/src/models/canonical_spell.rs`: `CURRENT_SCHEMA_VERSION` bump to `2`, `migrate_to_v2()` implementation, and updated `normalize()` pipeline.
- `apps/desktop/src/components/spell-editor/*`: React components handling data entry and display for Areas, Durations, and Saving Throws. *(Covered by three focused delta specs: `spell-editor-complex-forms`, `spell-editor-structured-fields`, `spell-editor-data-loading`.)*
- `docs/architecture/canonical-serialization.md`: Update §2.2.1 `raw_legacy_value` field inventory (add `SavingThrowSpec`, remove `SpellDamageSpec`), update the §3 Text Field Normalization Mode Mapping table with explicit modes (`AreaSpec.text` → Structured + unit alias; `DurationSpec.text` → Structured + unit alias; `SavingThrowSpec.raw_legacy_value` → None/as-is; `MagicResistanceSpec.source_text` → Textual; `SpellDamageSpec.source_text` → Textual), and update §2.3 metadata table to include `SpellDamageSpec.source_text` and `MagicResistanceSpec.source_text`. Resolved specs (`resolved-area-spec`, `resolved-duration-spec`, `resolved-range-spec`) are explicitly unchanged — they do not gain `text`, `raw_legacy_value`, or `source_text`.
- `docs/SCHEMA_VERSIONING.md`: Document the version 1 → 2 migration.
- **E2E tests** (`apps/desktop/tests/`): Spell-editor and spell-detail flows may be affected by v2 canonical_data shape, content hash changes, and removal of `dm_guidance` from SavingThrowSpec. Affected specs: `spell_editor_structured_data.spec.ts` (hash display, tradition validation, create/save), `spell_editor_canon_first.spec.ts` (canon-first editor flows). Any E2E that creates or edits spells should be run as regression; update assertions if tests rely on hash values, `dm_guidance`, or `raw_legacy_value`/`source_text` in spell payloads.
