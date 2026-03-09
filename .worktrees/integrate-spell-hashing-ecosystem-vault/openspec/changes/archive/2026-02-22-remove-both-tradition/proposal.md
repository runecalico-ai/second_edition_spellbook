## Why

The `BOTH` tradition contradicts the domain model: `openspec/project.md` and `openspec/specs/library/spec.md` both declare that school and sphere are mutually exclusive — a spell cannot have both. What appears to be a "both" spell (e.g., *Detect Magic*) is in fact two separate spell records — one Arcane entry and one Divine entry — each with its own content-addressed hash, separate class lists, and distinct book entries. The `BOTH` value was introduced as a convenience shorthand but creates logical inconsistency and dead-end validation paths.

## What Changes

- **BREAKING** — Remove `"BOTH"` from the `tradition` enum in `spell.schema.json`; valid values become `["ARCANE", "DIVINE"]`
- **BREAKING** — Remove the `allOf` conditional block in `spell.schema.json` that required `school` AND `sphere` when `tradition = "BOTH"`
- **BREAKING** — `TryFrom<SpellDetail>` in `canonical_spell.rs`: the `(Some(school), Some(sphere))` match arm currently infers `BOTH`; this becomes a validation error (having both school and sphere is now rejected at ingest)
- Remove `"BOTH"` from the frontend `Tradition` type, tradition dropdown, and all BOTH-specific validation guards in `SpellEditor.tsx`
- Load-spell logic that set `tradition = "BOTH"` when both school and sphere were present is updated to default tradition to `ARCANE` and set a `traditionLoadError` flag, surfacing a data-integrity warning that blocks save until the conflict is resolved (see design.md Decision 2 and 5)
- Update unit test `test_try_from_detail` "Both Inference" case to assert `Err` instead of `BOTH`
- Update documentation: `docs/architecture/canonical-serialization.md` (tradition table, prohibited fields section, field inventory) and `docs/dev/spell_editor_components.md` (example validation snippet)
- Update three OpenSpec specs that reference `BOTH`: `specs/backend`, `specs/spell-editor`, `specs/frontend-standards`
- Split the two sample `spells_md/` files that currently carry both school and sphere into separate Arcane and Divine records:
  - `detect_magic.md` → `detect_magic_arcane.md` (school: Divination) + `detect_magic_divine.md` (sphere: Divination)
  - `cure_light_wounds.md` → `cure_light_wounds_arcane.md` (school: Necromancy) + `cure_light_wounds_divine.md` (sphere: Healing)

## Capabilities

### New Capabilities
<!-- None — this is a removal/cleanup change -->

### Modified Capabilities

- `backend`: Tradition validation scenario for `BOTH` becomes a rejection scenario; the `(school, sphere)` inference arm becomes an error path
- `spell-editor`: Tradition dropdown loses the `Both` option; BOTH-specific validation guards (`isBothMissingSchool`, `isBothMissingSphere`) and their inline error messages are removed; load-spell inference no longer produces `BOTH`
- `frontend-standards`: Tradition validation rule updated to cover only `ARCANE` and `DIVINE`

## Impact

- **`apps/desktop/src-tauri/schemas/spell.schema.json`** — tradition enum + `allOf` block for BOTH removed
- **`apps/desktop/src-tauri/src/models/canonical_spell.rs`** — inference arm change + unit test inversion
- **`apps/desktop/src/ui/SpellEditor.tsx`** — `Tradition` type, dropdown option, load logic, validation guards (×4), validation error messages (×2), className guards (×2), inline error JSX blocks (×2)
- **`docs/architecture/canonical-serialization.md`** — §2.9 tradition table, §2.9.1 prohibited fields, §7 field inventory
- **`docs/dev/spell_editor_components.md`** — example validation code snippet
- **`openspec/specs/backend/spec.md`** — remove BOTH tradition validation scenario
- **`openspec/specs/spell-editor/spec.md`** — remove BOTH tradition validation scenario
- **`openspec/specs/frontend-standards/spec.md`** — update tradition validation rule
- **`spells_md/`** — four files replacing two (detect_magic and cure_light_wounds each split into Arcane + Divine)
- **Seeding/import behavior** — there are currently no auto-imported spells; `spells_md/` content is imported only through explicit user/admin import workflows
- No SQL migration required — `tradition` is not a DB column; it is inferred at runtime from the presence of `school` or `sphere`
- No new dependencies
