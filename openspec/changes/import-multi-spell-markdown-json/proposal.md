## Why

A source file can hold a whole spell list, but the importer only accepts one spell per file. The SpellScribe JSON sample `Nethril - Empire of Magic - Wizard.json` has a top-level `spells` array and no `bundle_format_version`, so preview fails with `Bundle format requires 'bundle_format_version'`. The matching Markdown file is one document of `##` spell sections, and the Markdown parser stores the entire document as a single spell. Users need both files to become one library spell per section.

## What Changes

- Accept a SpellScribe JSON list: an object with `spellscribe_version` and a `spells` array of flat spell records, and import every record.
- Split a Markdown spell list on level-2 headings (`## Spell Name`) and import every section.
- Map each flat record onto a `CanonicalSpell` before the existing hash, dedup, and conflict flow. Parse range, duration, casting time, area, damage, and components with the same `SpellParser` calls the editor uses, including the editor's invalid-result fallback. Parse saving throw and magic resistance with the editor mappers, so `Special` is an adjudicated save.
- Keep `### Review` text and JSON `review_notes` out of the spell description. Store that text on `SourceRef.note` and show it in the spell's preview warnings.
- Leave canonical bundle import unchanged: a `spells` array that includes `bundle_format_version` remains a bundle and still requires that field.
- Leave single-spell JSON and single-spell Markdown (front matter, no level-2 headings) unchanged.
- Report per-spell failures without discarding the other spells in the same file.
- Raise the Spellbook application version from `0.1.0` to `0.2.0`. Leave `CURRENT_SCHEMA_VERSION` and `BUNDLE_FORMAT_VERSION` unchanged.

## Capabilities

### New Capabilities

### Modified Capabilities

- `importers`: JSON and Markdown import must accept a multi-spell source list and map each spell into the existing canonical import path. Canonical bundle detection stays in place for envelopes that carry `bundle_format_version`.

## Impact

- Rust JSON classification in `apps/desktop/src-tauri/src/commands/import.rs` (`parse_and_classify_payload`), plus a shared flat-record mapper used by SpellScribe JSON and Markdown spell lists.
- Import wizard preview and result counts in `apps/desktop/src/ui/ImportWizard.tsx`. A Markdown file with level-2 spell headings uses the canonical preview path. A Markdown file with no level-2 heading stays on `services/ml/spellbook_sidecar.py` (`_spell_from_markdown`).
- Importer spec `openspec/specs/importers/spec.md`.
- Fixture coverage from `Nethril - Empire of Magic - Wizard.json` and `Nethril - Empire of Magic - Wizard.md` (9 spells each).
- Application version `0.2.0` in `apps/desktop/package.json`, `apps/desktop/src-tauri/tauri.conf.json`, and `apps/desktop/src-tauri/Cargo.toml`, set together with `scripts/set_release_version.py`.
- No new dependencies. No change to canonical bundle export (`export_spell_bundle_json`) or character bundle import.
