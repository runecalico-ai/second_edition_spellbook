## Context

The codebase currently supports three `tradition` values: `ARCANE`, `DIVINE`, and `BOTH`. The `BOTH` value was introduced to model spells that appear on both Wizard and Priest spell lists (e.g., *Detect Magic*, *Cure Light Wounds*). However, the project domain model (`openspec/project.md`, `openspec/specs/library/spec.md`) already declares that `school` and `sphere` are mutually exclusive. In AD&D 2e, spells that appear on multiple lists are distinct book entries with different class requirements — they are two separate spells that happen to share a name.

The `BOTH` tradition currently touches four layers: the JSON schema (enum + `allOf` validation), the Rust backend (tradition inference + canonical normalization), the TypeScript frontend (type, UI dropdown, validation logic), and documentation. There are no DB schema changes required since `tradition` is not stored as a column — it is inferred at read time from the presence of `school` or `sphere`.

Two sample spell files in `spells_md/` currently have both `school` and `sphere` set, making them the only real-world instances of the `BOTH` state.

## Goals / Non-Goals

**Goals:**
- Enforce strict mutual exclusivity: a spell record has either a `school` (ARCANE) or a `sphere` (DIVINE), never both
- Make `(school, sphere)` co-presence a hard validation error at ingest/canonicalization
- Remove all tradition `BOTH` code paths from schema, Rust, TypeScript, and docs
- Split the two affected sample spell files into correct ARCANE and DIVINE records
- Update three OpenSpec specs that reference `BOTH`

**Non-Goals:**
- DB migration — no column stores `tradition`; inference changes are sufficient
- Changing how `class_list` works — a class can still access both Arcane and Divine spells independently
- Any changes to spell search/filter behavior — filtering by school vs. sphere already operates independently
- Introducing a new multi-tradition join table or relationship model

## Decisions

### Decision 1: `(Some(school), Some(sphere))` ingest path → hard error, not silent coercion

**Options considered:**
- A) Return `Err` — reject the record and surface the error to the caller
- B) Silently coerce — pick one tradition (e.g., prefer ARCANE) and drop the other field
- C) Log a warning and coerce

**Chosen: A — hard error.**

Rationale: Silent coercion hides data problems and could silently corrupt imported spells. Since this situation only arises from incorrect data (the two sample spell files, or a malformed import), surfacing an actionable error is preferable. Import pipelines already handle `Err` from `TryFrom`; the error message will tell the user which spell has the conflict and how to resolve it.

---

### Decision 2: Load-spell inference in `SpellEditor.tsx` when existing DB record has both school and sphere

**Context:** If a pre-existing DB record somehow has both `school` and `sphere` populated (from before this change), the frontend load path currently sets `tradition = "BOTH"`.

**Options considered:**
- A) Display a visible data-integrity warning in the editor and block save until resolved
- B) Silently default to `ARCANE` (preserve school, ignore sphere)
- C) Silently default to `DIVINE` (preserve sphere, ignore school)

**Chosen: A — surface a warning, block save.**

Rationale: Defaulting silently would cause data loss (whichever tradition is dropped). Surfacing a clear warning ("This spell has both a School and a Sphere set — this is invalid. Please remove one before saving.") is the safest behavior and consistent with the "block save + inline error" pattern already used for tradition validation. See Decision 5 for how the warning state is tracked (a `traditionLoadError: boolean` flag rather than a sentinel `Tradition` value).

**Tradition dropdown change while load error is active:** If a user loads a conflicted record (both school and sphere set) and then selects a new tradition from the dropdown, `traditionLoadError` is cleared — the user has taken an explicit action to resolve the tradition. Normal tradition validation then takes over: if school is not set for ARCANE the school-required error fires; if sphere is not set for DIVINE the sphere-required error fires. The user must also clear the field that does not belong to the chosen tradition — the JSON schema `allOf` constraint (`sphere: { const: null }` for ARCANE; `school: { const: null }` for DIVINE) will reject the record at save time if the opposing field is still populated. Save is unblocked only when both conditions are satisfied: the required field is present and the opposing field is cleared.

---

### Decision 3: `spells_md/` sample files — split into separate files

**Options considered:**
- A) Split into two files per spell (ARCANE + DIVINE), each with only one of school/sphere
- B) Remove the multi-tradition sample spells entirely and add clean single-tradition examples
- C) Convert one of the two to a single-tradition record in-place

**Chosen: A — split.**

Rationale: These files exist to demonstrate real AD&D 2e spells. *Detect Magic* genuinely appears as separate Arcane and Divine entries in the books. Splitting preserves both real-world entries and provides concrete examples of the correct data model. Option B loses valid reference data; Option C loses one of the two valid entries.

The four resulting files:
- `detect_magic_arcane.md` — school: Divination, no sphere (game-accurate)
- `detect_magic_divine.md` — sphere: Divination, no school (game-accurate)
- `cure_light_wounds_arcane.md` — school: Necromancy, no sphere (**SYNTHETIC** — Cure Light Wounds is Divine-only in AD&D 2e; this file exists solely as a structural sample and MUST be clearly marked with a `# SYNTHETIC SAMPLE` frontmatter comment)
- `cure_light_wounds_divine.md` — sphere: Healing, no school (game-accurate)

Note: these files exist only as sample/reference data in `spells_md/`. There are currently no auto-imported spells; `spells_md/` content is only imported through explicit user/admin import workflows. Splitting them is a documentation/sample correctness fix. The original `detect_magic.md` and `cure_light_wounds.md` files that carried both fields should be removed or replaced; if kept for historical reference they MUST be marked `# SYNTHETIC SAMPLE — INVALID: both school and sphere set`.

---

### Decision 4: Rust normalization — no BOTH clearing path needed

**Current code** in `normalize()`:
```rust
if self.tradition == "ARCANE" { self.sphere = None; }
if self.tradition == "DIVINE" { self.school = None; }
```
There is no `BOTH` branch here, and none is needed post-change. The `TryFrom` rejection ensures no `BOTH` record reaches `normalize()`. The two `if` guards remain as-is — they are defensive cleanup for any stale data that bypasses `TryFrom`.

---

### Decision 5: `Tradition` type in TypeScript — drop to `"ARCANE" | "DIVINE"` only; no `"INVALID"` sentinel in the type

The `"INVALID"` sentinel value used for the load-error case (Decision 2) is not added to the `Tradition` type. Instead, a separate `traditionLoadError: boolean` state flag drives the warning display. This keeps the type clean and avoids `INVALID` leaking into the select value.

## Risks / Trade-offs

- **Pre-existing BOTH records in a user's live DB** — If a user has spells with both `school` and `sphere` in their vault DB, attempting to canonicalize or re-hash those spells will return `Err` from `TryFrom`. The frontend load path will show the data-integrity warning (Decision 2). This is the correct behavior but may surprise users with legacy data. _Mitigation: The error message clearly identifies which field to remove._

- **Import pipeline rejection** — Any Markdown or JSON import of a spell with both school and sphere will now fail validation rather than importing as `BOTH`. _Mitigation: The import error message names the spell and the conflict. Users must split the import source into two records._

- **E2E test coverage for UI validation** — The removal of the BOTH option from the tradition dropdown must be covered by Playwright E2E tests. _Mitigation: Two new E2E tests will be added to verify the tradition dropdown and the ARCANE/DIVINE validation requirements._

## Migration Plan

No database migration is required.

**Deploy steps:**
1. Update `spell.schema.json` (enum + `allOf` removal)
2. Update `canonical_spell.rs` (`TryFrom` arm + unit test)
3. Update `SpellEditor.tsx` (type, dropdown, load logic, validation)
4. Update documentation (`canonical-serialization.md`, `spell_editor_components.md`)
5. Split affected `spells_md/` files
6. Run the OpenSpec sync workflow (`/openspec-sync-specs`) to propagate the delta specs in `specs/backend`, `specs/spell-editor`, and `specs/frontend-standards` into the main OpenSpec specs, then archive this change via `/openspec-archive`

**Rollback:** Changes are additive removals with no DB schema impact. Reverting is a standard git revert. No data migration forward or backward.

## Open Questions

None — the investigation was thorough and all decision points were resolved before design.
