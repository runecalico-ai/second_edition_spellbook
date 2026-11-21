## Context

The Import wizard has two paths. A `.json` file is sent to `preview_import_spell_json`, which classifies the payload in `parse_and_classify_payload`. Any top-level `spells` array is a canonical bundle and must include `bundle_format_version`. A `.md` file is sent to the Python sidecar, and `_spell_from_markdown` returns one spell: front matter plus the whole document as the description.

The samples `Nethril - Empire of Magic - Wizard.json` and `Nethril - Empire of Magic - Wizard.md` are the same nine Netheril spells in two SpellScribe shapes.

The JSON envelope is `{ "version", "exported_at", "spellscribe_version", "spells": [ ... ] }`. Each spell is flat: `tradition` is `"Arcane"`, `school` and `components` are arrays, `class_list` is a string, and `range`, `duration`, `casting_time`, `area_of_effect`, and `saving_throw` are strings. Extra keys include `source_document`, `source_page`, `review_notes`, `needs_review`, and boolean `reversible`. There is no `bundle_format_version`, so today's classifier rejects the file.

The Markdown file has no front matter. Each spell starts at a level-2 heading (`## Karsus's Avatar`), followed by `- Field: value` lines, prose, and a `### Review` section. The sidecar currently stores all of that as one spell named from the filename.

Canonical bundle export (`export_spell_bundle_json`) and character bundles stay as they are. Structured text fields already have parsers on `SpellParser` (range, duration, casting time, area, components, saving throw). `CanonicalSpell.school` is one schema enum value; additional schools belong in `subschools`. Combined labels such as `Invocation/Evocation` are already enum values.

## Goals / Non-Goals

**Goals:**

- Import every spell in a SpellScribe JSON list and every `##` section in a Markdown spell list.
- Map both shapes through one flat-record adapter onto `CanonicalSpell`, then use the existing hash, dedup, conflict, and partial-failure flow.
- Keep review text out of the description and keep it available after import.
- Keep canonical bundle rules for a `spells` array that is not a SpellScribe list.

**Non-Goals:**

- Changing canonical bundle or single-spell JSON export.
- Importing character bundles through this path.
- Parsing multiple spells out of PDF or DOCX.
- Importing more than the first `.json` file when several JSON files are selected.
- Splitting a combined school name on `/`.
- Extracting material-component rows from description prose.
- Changing `.txt` handling. The sidecar still accepts only `.md`, `.pdf`, and `.docx`.

## Decisions

### 1. SpellScribe JSON is a third payload class

Classification order for a JSON object:

1. `spells` is present and is not an array: reject, unchanged (`spells` must be an array).
2. `spellscribe_version` and `bundle_format_version` are both present: reject as ambiguous.
3. `spellscribe_version` is present and `spells` is absent: reject. The error names the missing `spells` array. Do not fall through to single-spell parsing.
4. `spellscribe_version` is a string and `spells` is an array: SpellScribe list. Do not require `bundle_format_version`.
5. `spells` is an array and `spellscribe_version` is absent: canonical bundle. `bundle_format_version` remains required.
6. No `spells` key and no `spellscribe_version`: single-spell `CanonicalSpell`, unchanged.

The major version is the integer before the first `.` in `spellscribe_version`. Major `1` is accepted (`1.0.3` in the sample). Any other major version rejects the file before spell mapping. The envelope `version` and `exported_at` are ignored.

Alternative considered: treat every `spells` array without `bundle_format_version` as a flat list. Rejected because `{ "spells": [...] }` with canonical objects, and the archived test lists that use `format` / `version`, would skip the bundle check and fail later as confusing spell errors.

### 2. One Rust adapter for both formats

Add a flat source-list record and one mapper in the Rust import command. SpellScribe JSON and Markdown sections both become that record, then `CanonicalSpell`.

The JSON branch runs inside `parse_and_classify_payload`, so the existing JSON preview, import, and conflict commands stay the entry points.

Markdown with at least one line matching `^## ` (a level-2 heading, not `###`) is parsed in Rust, not by `_spell_from_markdown`. The wizard sends that file through the same canonical preview and conflict UI as JSON. Markdown with no level-2 heading stays on the sidecar front-matter path.

A selection that mixes heading spell lists with front-matter notes is rejected with a message to import them separately. PDF and DOCX stay on the sidecar.

Alternative considered: split Markdown in Python and keep the legacy `SpellDetail` string fields. Rejected because `school` is a single string on that path, so extra schools and structured parsers would diverge from the JSON import.

### 3. Field mapping

| Source | Canonical |
| --- | --- |
| `name` / heading text | `name` |
| `tradition` `Arcane` or `Divine`, any case | `ARCANE` or `DIVINE`. Any other value fails that spell. If omitted, infer `ARCANE` when a school is present and `DIVINE` when a sphere is present and no school is present. |
| `class_list` or `Class` | `class_list`, split on commas. A JSON string and a JSON array are both accepted. |
| `level` | integer. `cantrip` → level 0 and cantrip. `quest` → level 8 and quest. |
| `school` | array or comma-separated string. Split commas only. Do not split on `/`. The first token that matches the school enum is `school`; later matching tokens are `subschools`. An unrecognized token is dropped and reported as a warning. An arcane spell with no recognized school fails that spell. |
| `sphere` | `sphere` for a divine spell. |
| `components` | `parse_spell_components_with_migration`: component flags from `SpellParser::parse_components`, and material rows from a material-components field or from an `M (...)` parenthetical on the components line. Description prose that names consumed items stays in the description. |
| `range`, `duration`, `casting_time`, `area_of_effect` or `area`, `damage` | `SpellParser`, the same calls the editor makes (`parse_spell_range`, `parse_spell_duration`, `parse_spell_casting_time`, `parse_spell_area`, `parse_spell_damage`). If the result fails the editor shape check, replace it the way the editor does: range, duration, casting time, and area become `Special` with the original text; damage becomes kind `none` with that text. Do not reject the spell for that fallback. Do not add a per-level increment to casting time. `6 hours per level` stays whatever `parse_spell_casting_time` returns. |
| `saving_throw` | The editor mapper `mapLegacySavingThrow`, ported into the Rust adapter. `Special` is `dm_adjudicated` with the original text. `None` in any case is kind `none`. Do not use `SpellParser::parse_saving_throw` for this path. That parser stores `Special` as a single save and defaults the result to "negates." |
| `magic_resistance` | The editor mapper `mapLegacyMagicResistance`, ported into the Rust adapter, when the source record has that string. |
| `description` | prose only. |
| `reversible` | JSON `true`, or `1` / `true` / `yes`, becomes `1`. Absent or false becomes unset. The JSON sample sets this only on `Proctiv's Breach Crystal Sphere`. Markdown sets it only from a `Reversible:` bullet, and that sample has none, so the same spell stays unset when imported from Markdown. |
| `source_document` + `source_page`, or `Source: <book>, p. <page>` | one `SourceRef` (`book`, numeric `page` when the page is an integer). The JSON sample book `Nethril - Empire of Magic` is stored as written. |
| `review_notes` or a `### Review` block | `SourceRef.note`. Also listed on the preview warnings for that spell. Omitted from `description`. `source_refs` are excluded from the content hash, so this note does not change spell identity. |
| `needs_review: true` | an additional preview warning. The flag is not a stored column. |

If the parsed book is empty or exactly `markdown.md`, use the imported file stem as the book. The sample Markdown source line is that placeholder.

Unknown per-spell keys are ignored on this adapter. The canonical `deny_unknown_fields` rule still applies to single-spell and canonical-bundle JSON.

### 4. Failure and limits

Each spell is mapped and validated on its own. A spell that fails tradition, school, or schema validation is a preview failure; the other spells in the file are still returned. Existing payload limits remain: 100 MB, JSON depth 50, and at most 10,000 spells.

Description text, including Markdown tables, is kept. A `### Review` block ends at the next `##` heading or at end of file. `### Review` is not a spell heading.

## Risks / Trade-offs

- [A future SpellScribe major version adds fields or changes types.] → Reject major versions other than 1 with an explicit error instead of mapping them best-effort.
- [A level-2 heading inside a description becomes an extra spell.] → The sample uses `##` only for spell titles and `###` for review. Document that contract. Tables and prose under a spell stay in that spell.
- [Review notes longer than the source-note limit are cut off.] → Truncate to the existing `SourceRef` note limit and add a warning.
- [Routing spell-list Markdown through the JSON preview skips the column mapper.] → These files already use labeled fields. Unstructured Markdown without `##` headings still uses the mapper.
- [Combined schools stored as one enum value differ from a review note that suggests splitting them.] → `Invocation/Evocation` is a legal school. Do not split it.
- [The Rust saving-throw parser and the editor disagree on `Special`.] → Source-list import uses the editor mapper. Canonical bundle import keeps the Rust parser.

### 5. Application version

This change raises the Spellbook release version from `0.1.0` to `0.2.0` (minor). Set all three release files with `python scripts/set_release_version.py 0.2.0`:

- `apps/desktop/package.json`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml`

`CURRENT_SCHEMA_VERSION` stays `2`. `BUNDLE_FORMAT_VERSION` stays `1`. SpellScribe `spellscribe_version` is the incoming file's version, not the app version.

## Migration Plan

No schema or data migration. The change is import-only. Rollback is reverting the classifier, the Markdown splitter, and the wizard branch. Files already imported stay in the library.

## Open Questions

None. The sample files define the accepted shapes, and canonical bundles remain the path for `spells` arrays that lack `spellscribe_version`.
