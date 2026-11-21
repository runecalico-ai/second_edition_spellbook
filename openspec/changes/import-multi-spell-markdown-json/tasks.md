## 1. Fixtures

- [ ] 1.1 Copy `Nethril - Empire of Magic - Wizard.json` and `Nethril - Empire of Magic - Wizard.md` into `apps/desktop/src-tauri/tests/fixtures/source-lists/` so tests do not depend on the repo-root samples.
- [ ] 1.2 Add a three-spell SpellScribe fixture whose second spell is arcane and has no recognized school, for the partial-failure case.

## 2. JSON classification

- [ ] 2.1 Add failing Rust tests in `apps/desktop/src-tauri/src/commands/import.rs`: SpellScribe `1.0.3` with a `spells` array and no `bundle_format_version` classifies as a source list; a `spells` array with neither `spellscribe_version` nor `bundle_format_version` still errors with the missing bundle field; both version keys reject as ambiguous; `spellscribe_version` major other than 1 rejects before mapping; `spellscribe_version` with no `spells` key rejects with a missing-array error; a non-array `spells` value still rejects.
- [ ] 2.2 Implement the classification order from the design in `parse_and_classify_payload` so those tests pass and existing canonical-bundle tests stay green.

## 3. Shared field mapper

- [ ] 3.1 Add failing mapper tests for the Karsus record: tradition `ARCANE`, level 12, school `Invocation/Evocation`, subschools `Enchantment/Charm` and `Alteration`, class `Wizard`, components parsed from `V`/`S`/`M`, range, duration, casting time, and area equal to `SpellParser` for those strings, saving throw `Special` stored as `dm_adjudicated` with the original text, `reversible` false left unset, description equal to the description field, `SourceRef.book` `Nethril - Empire of Magic` with page 10, and `review_notes` stored on `SourceRef.note` and on the preview warning rather than in the description. Assert `Proctiv's Breach Crystal Sphere` maps `reversible: true` to 1, and that `needs_review: true` adds a preview warning. Assert saving throw `None` is kind `none`, and that `6 hours`, `3 days`, `1 turn`, and `6 hours per level` equal `parse_spell_casting_time` with no added per-level increment.
- [ ] 3.2 Add a failing test that an unrecognized school token is dropped with a warning, and that an arcane spell with no recognized school is a named failure while sibling spells still preview.
- [ ] 3.3 Port `mapLegacySavingThrow` and `mapLegacyMagicResistance` into the Rust adapter. Parse components with `parse_spell_components_with_migration`. After `SpellParser` returns range, duration, casting time, area, or damage, apply the editor shape fallback: invalid range, duration, casting time, and area become `Special` with the original text; invalid damage becomes kind `none` with `source_text` set to that text.
- [ ] 3.4 Implement the flat-record adapter in Rust and call it for SpellScribe spells inside the JSON preview path. Use the editor parsers and mappers from 3.3. Enforce the 10,000-spell cap.

## 4. Markdown spell lists

- [ ] 4.1 Add failing tests that the Netheril Markdown fixture yields nine spells, the first name is `Karsus's Avatar`, its description includes the research paragraph and excludes the `### Review` paragraph, `School: Invocation/Evocation, Enchantment/Charm, Alteration` maps to school `Invocation/Evocation` with those two subschools, and `Source: markdown.md, p. 10` becomes a `SourceRef` whose book is the file stem `Nethril - Empire of Magic - Wizard` and whose page is 10. `Proctiv's Breach Crystal Sphere` stays with `reversible` unset.
- [ ] 4.2 Add a failing test that a front-matter Markdown file with no level-2 heading is not parsed as a spell list.
- [ ] 4.3 Implement the level-2 heading splitter and feed each section through the same adapter as JSON. Treat `### Review` as note text, not as a spell.

## 5. Import wizard

- [ ] 5.1 Route a Markdown selection where every file has a level-2 heading through the canonical preview, import, and conflict commands used for JSON. Leave Markdown with no level-2 heading on the sidecar path.
- [ ] 5.2 Reject a selection that mixes level-2 spell lists with front-matter Markdown, and show a message to import them separately.
- [ ] 5.3 Confirm a SpellScribe JSON file still uses the existing JSON preview and that only the first JSON file in a multi-file JSON selection is read.

## 6. Application version

- [ ] 6.1 Run `python scripts/set_release_version.py 0.2.0` so `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json`, and `apps/desktop/src-tauri/Cargo.toml` all read `0.2.0`.
- [ ] 6.2 Confirm `CURRENT_SCHEMA_VERSION` is still `2` and `BUNDLE_FORMAT_VERSION` is still `1`.

## 7. Verification

- [ ] 7.1 Run the Rust import tests and confirm the Netheril JSON and Markdown fixtures preview as nine spells, including `Karsus's Avatar` and `Valdick's Spheresail`.
- [ ] 7.2 Run the Python sidecar tests and confirm single-spell front-matter Markdown is unchanged.
- [ ] 7.3 Run the import wizard unit or Playwright coverage for the mixed-Markdown rejection and for a SpellScribe preview count of nine.
