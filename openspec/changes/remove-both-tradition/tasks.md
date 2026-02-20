## 1. JSON Schema

- [ ] 1.1 Remove `"BOTH"` from the `tradition` enum in `spell.schema.json` — valid values become `["ARCANE", "DIVINE"]`
- [ ] 1.2 Remove the `allOf` conditional block that required `school` AND `sphere` when `tradition = "BOTH"` from `spell.schema.json` (the third entry in the root-level `allOf` array, lines ~395–406). **Note:** `"on_both"` appearing in `ExperienceComponentSpec.payment_timing` is a separate, unrelated enum value and MUST NOT be removed.

## 2. Rust Backend — Tradition Inference

- [ ] 2.1 In `canonical_spell.rs` `TryFrom<SpellDetail>`: change the `(Some(_), Some(_))` match arm from inferring `"BOTH"` to returning `Err` with a message identifying the spell name and stating school and sphere are mutually exclusive
- [ ] 2.2 Update unit test `test_try_from_detail` "3. Both Inference" block to assert `result.is_err()` instead of asserting `tradition == "BOTH"`

## 3. Frontend — SpellEditor.tsx

- [ ] 3.1 Remove `"BOTH"` from the `Tradition` type: change to `type Tradition = "ARCANE" | "DIVINE"`
- [ ] 3.2 Add `traditionLoadError` state: `const [traditionLoadError, setTraditionLoadError] = useState(false)`
- [ ] 3.3 Update the load-spell `setTradition` logic: when `hasSchool && hasSphere`, set `traditionLoadError = true` and default tradition to `"ARCANE"` instead of setting `"BOTH"`; clear `traditionLoadError` for all valid cases
- [ ] 3.3a Add `setTraditionLoadError(false)` to `resetStructuredLoadState` so the error flag is cleared when switching spells or creating a new one (prevents the error from bleeding across different spell loads)
- [ ] 3.3b In the tradition dropdown `onChange` handler, call `setTraditionLoadError(false)` whenever the user explicitly selects a new tradition value. Once cleared, normal tradition validation takes over: if school is missing for ARCANE the existing school-required error fires; if sphere is missing for DIVINE the existing sphere-required error fires. Additionally, the user must clear the field that does not belong to the chosen tradition (sphere for ARCANE, school for DIVINE) — the schema-level `allOf` constraint (`sphere: { const: null }` for ARCANE; `school: { const: null }` for DIVINE) will reject the record at save time if the opposing field is still set. Save remains blocked until both conditions are met: required field is present and opposing field is cleared.
- [ ] 3.4 Remove the `<option value="BOTH">Both</option>` element from the tradition dropdown
- [ ] 3.5 Remove `isBothMissingSchool` and `isBothMissingSphere` computed variables
- [ ] 3.6 Remove `isBothMissingSchool && "School is required for Both tradition"` and `isBothMissingSphere && "Sphere is required for Both tradition"` entries from the `validationErrors` array
- [ ] 3.7 Remove the `{isBothMissingSchool && <p>…</p>}` inline error JSX block from the School field
- [ ] 3.8 Remove the `{isBothMissingSphere && <p>…</p>}` inline error JSX block from the Sphere field
- [ ] 3.9 Remove the `getIsBothTradition()` function and `isBothTradition` variable; update all four usages of `getIsBothTradition()`:
  - Line ~1791: `className` guard on school input — remove `!getIsBothTradition()` and `isBothMissingSchool` from the ternary
  - Line ~1795: JSX render condition `{form.level >= 10 && !form.school && !getIsBothTradition() && (` — remove `!getIsBothTradition()` clause (simplifies to `form.level >= 10 && !form.school`)
  - Line ~1821: `className` guard on sphere input — remove `!getIsBothTradition()` and `isBothMissingSphere` from the ternary
  - Line ~1825: JSX render condition `{form.isQuestSpell === 1 && !form.sphere && !getIsBothTradition() && (` — remove `!getIsBothTradition()` clause (simplifies to `form.isQuestSpell === 1 && !form.sphere`)
- [ ] 3.10 Add a data-integrity warning banner below the tradition dropdown: when `traditionLoadError` is true, render an inline error (e.g. `data-testid="error-tradition-conflict"`) stating "This spell has both a School and a Sphere set — school and sphere are mutually exclusive. Remove one before saving." This banner is dismissed when the user changes the tradition dropdown (see 3.3b); after dismissal, the relevant ARCANE or DIVINE validation error takes over if the conflict field is not yet cleared.
- [ ] 3.11 Add `traditionLoadError && "School and Sphere cannot both be set"` to the `validationErrors` array so it blocks save

## 4. Documentation

- [ ] 4.1 In `docs/architecture/canonical-serialization.md` §2.9: remove the `BOTH` row from the tradition validation table
- [ ] 4.2 In `docs/architecture/canonical-serialization.md` §2.9.1: remove the bullet "For `tradition = "BOTH"`: both `school` and `sphere` are included."
- [ ] 4.3 In `docs/architecture/canonical-serialization.md` §7 Field Inventory: update the `tradition` row note from "ARCANE, DIVINE, or BOTH" to "ARCANE or DIVINE"
- [ ] 4.4 In `docs/dev/spell_editor_components.md`: remove the code example block containing `if (tradition === "BOTH" && (!school || !sphere))` and replace with a note that co-presence of school and sphere is rejected as invalid data

## 5. Sample Spell Data

- [ ] 5.1 Create `spells_md/detect_magic_arcane.md` — copy from `detect_magic.md`, set `tradition: ARCANE`, remove `sphere` field; update `class_list` to Arcane casters only (e.g. Wizard, Bard). Note: no enforcement of this constraint exists yet — class lists are plain string arrays; a future class schema feature will implement spell-list access control.
- [ ] 5.2 Create `spells_md/detect_magic_divine.md` — copy from `detect_magic.md`, set `tradition: DIVINE`, remove `school` field, update `class_list` to Divine casters only (e.g. Priest, Druid). Note: no enforcement of this constraint exists yet — a future class schema feature will implement spell-list access control.
- [ ] 5.3 Create `spells_md/cure_light_wounds_arcane.md` — copy from `cure_light_wounds.md`, set `tradition: ARCANE`, school: Necromancy, remove `sphere` field; update `class_list` to Arcane casters only (e.g. Wizard). **Add a `# SYNTHETIC SAMPLE` comment at the top of the file** — Cure Light Wounds is Divine-only in AD&D 2e; this file exists purely as a structural example of an ARCANE record and does not represent a real spell entry.
- [ ] 5.4 Create `spells_md/cure_light_wounds_divine.md` — copy from `cure_light_wounds.md`, set `tradition: DIVINE`, remove `school` field, update `class_list` to Divine casters only (e.g. Priest, Druid). Note: no enforcement of this constraint exists yet — class lists are plain string arrays; a future class schema feature will implement spell-list access control.
- [ ] 5.5 Remove the original `spells_md/detect_magic.md` and `spells_md/cure_light_wounds.md` that carry both `school` and `sphere`. If archived rather than deleted, add a prominent `# SYNTHETIC SAMPLE — INVALID DATA: both school and sphere set` comment at the top of each file to prevent them from being treated as valid records.
- [ ] 5.6 Clarify seeding role in this change: there are currently no auto-imported spells; `spells_md/` files are reference/seed source content and are only imported through explicit user/admin import workflows.

## 6. Verification

- [ ] 6.1 Run `cargo test` in `apps/desktop/src-tauri` — all Rust unit tests pass including the updated tradition inference test
- [ ] 6.2 Run `cargo test` and confirm schema validation rejects a spell with both `school` and `sphere` set (the `validate()` call in `compute_hash` now fails on this input)
- [ ] 6.3 Confirm the TypeScript build has no type errors (`pnpm tsc --noEmit` or equivalent) — `"BOTH"` no longer appears as a valid `Tradition` value
- [ ] 6.4 Manually verify the tradition dropdown in the SpellEditor shows only "Arcane" and "Divine"
- [ ] 6.5 Manually verify that loading a new spell and saving with no school (ARCANE) shows the existing inline school error; no BOTH-related errors appear
- [ ] 6.6 Manually verify: load a conflicted record (both school and sphere set) — the data-integrity banner (`data-testid="error-tradition-conflict"`) appears and save is blocked. Then change the tradition dropdown to `ARCANE` — the banner disappears. Confirm save is still blocked (schema validation will reject a record with both school and sphere set regardless of tradition). Clear the sphere field — confirm save now succeeds (school is set, sphere is cleared, tradition is ARCANE).
