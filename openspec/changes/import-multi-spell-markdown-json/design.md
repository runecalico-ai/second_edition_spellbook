## Context

The Import wizard has two paths. A `.json` file is sent to `preview_import_spell_json`, which classifies the payload in `parse_and_classify_payload`. Any top-level `spells` array is a canonical bundle and must include `bundle_format_version`. A `.md` file is sent to the Python sidecar, and `_spell_from_markdown` returns one spell: front matter plus the whole document as the description.

The samples `Nethril - Empire of Magic - Wizard.json` and `Nethril - Empire of Magic - Wizard.md` in `.spellscribe-examples/` are the same nine Netheril spells in two SpellScribe shapes. Tracked copies under `apps/desktop/src-tauri/tests/fixtures/source-lists/` keep automated tests independent of gitignored local examples.

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
- Writing `artifact` provenance rows on the canonical JSON or Markdown spell-list path. Source provenance for source lists lives on `CanonicalSpell.source_refs`, matching existing canonical JSON imports.

## Decisions

### 1. SpellScribe JSON is a third payload class

Classification order for a JSON object:

1. `spells` is present and is not an array: reject, unchanged (`spells` must be an array).
2. `spellscribe_version` and `bundle_format_version` (or camelCase alias `bundleFormatVersion`) are both present: reject as ambiguous.
3. `spellscribe_version` is present and `spells` is absent: reject. The error names the missing `spells` array. Do not fall through to single-spell parsing.
4. `spellscribe_version` is present and is not a string, or its major segment before the first `.` is not a valid integer equal to `1`: reject before spell mapping with an unsupported SpellScribe version error.
5. `spellscribe_version` is a string with major `1` (`1.0.3` in the sample) and `spells` is an array: SpellScribe list. Do not require `bundle_format_version`.
6. `spells` is an array and `spellscribe_version` is absent: canonical bundle. `bundle_format_version` remains required.
7. No `spells` key and no `spellscribe_version`: single-spell `CanonicalSpell`, unchanged.

The envelope `version` and `exported_at` are ignored.

Alternative considered: treat every `spells` array without `bundle_format_version` as a flat list. Rejected because `{ "spells": [...] }` with canonical objects, and the archived test lists that use `format` / `version`, would skip the bundle check and fail later as confusing spell errors.

### 2. One Rust adapter and shared canonical IPC pipeline for both formats

Add a flat source-list record and one mapper in the Rust import command. SpellScribe JSON and Markdown sections both become that record, then `CanonicalSpell` stamped with `schema_version = CURRENT_SCHEMA_VERSION` (`2`).

Refactor `parse_and_classify_payload` (and the Markdown splitter) to return per-spell outcomes—`(CanonicalSpell, Vec<String> adapter_warnings)` items alongside `Vec<ImportSpellJsonFailure>`—rather than `Result<Vec<CanonicalSpell>, AppError>`. That keeps envelope-level errors fatal while allowing individual spell mapping/validation failures and adapter warnings (`review_notes`, `needs_review: true`, dropped school tokens, note truncation) to survive per spell into `PreviewImportSpellJsonResult` and `ImportSpellJsonResult`. Also populate the flat SQLite `components` and `material_components` columns in `canonical_spell_to_flat_row` (instead of `None`) from `CanonicalSpell.components` and `CanonicalSpell.material_components` so imported source-list spells appear in Library component facets/filters and pass `sync_check_spell`.

Change `payload` to `Option<String>` and add `markdown_files: Option<Vec<ImportMarkdownFile>>` (`{ name: String, content: String }`, `#[serde(crate = "serde", rename_all = "camelCase")]`, invoked from TypeScript as `markdownFiles`) on `preview_import_spell_json`, `import_spell_json`, and `resolve_import_spell_json`, requiring exactly one of `payload` or non-empty `markdown_files` so existing `{ payload }` JSON callers remain backward-compatible:
- When `markdown_files` is supplied, validate the combined 100 MB byte guardrail and 10,000-spell cap without running JSON depth validation, split each file independently so its stem resolves `SourceRef.book` when the source book is empty or `markdown.md`, and merge preview items and failures in file order.
- A Markdown file that begins with a closed YAML front-matter block (`---\n...\n---`) is never treated as a level-2 spell list, even if its description body contains `## ` subheadings. A Markdown file without leading YAML front matter that contains at least one `^## ` heading outside fenced code blocks is parsed in Rust as a spell list; any preamble before the first `^## ` heading (such as a `# Title` header) is ignored.
- `.txt` files are not inspected as Markdown spell lists and stay on the sidecar path so unsupported-extension handling is unchanged.
- A `.md` selection that mixes level-2 spell lists with front-matter/single-spell Markdown is rejected in the wizard with a message to import them separately. PDF and DOCX stay on the sidecar.

On the wizard's canonical preview step (`step === "json-preview"`), render format-neutral copy when previewing Markdown spell lists instead of hardcoded `"JSON"` labels, render per-spell `spells[i].warnings` and named `failures` (and propagate per-spell warnings to `ImportSpellJsonResult.warnings`), and check `level >= 10 || is_quest_spell == 1` to display the existing `High-Level Magic Detected` notice and suppression checkbox.

Alternative considered: split Markdown in Python and keep the legacy `SpellDetail` string fields. Rejected because `school` is a single string on that path, so extra schools and structured parsers would diverge from the JSON import.

### 3. Field mapping

| Source | Canonical |
| --- | --- |
| `name` / heading text | `name` |
| `tradition` `Arcane` or `Divine`, any case | `ARCANE` or `DIVINE`. Any other value fails that spell. If omitted, infer `ARCANE` when a school is present and `DIVINE` when a sphere is present and no school is present (failing if neither is present). |
| `class_list` or `Class` / `Classes` | `class_list`, split on commas. A JSON string and a JSON array are both accepted. |
| `level` | integer. `cantrip` (any case) → level 0 and `is_cantrip = 1`. `quest` (any case) → level 8 and `is_quest_spell = 1`. Divine numeric level `8` also sets `is_quest_spell = 1`. |
| `school` | array or comma-separated string. Split commas only. Do not split on `/`. The first token that matches the school enum (case-insensitively normalized to schema casing) is `school`; later matching tokens are `subschools`. An unrecognized token is dropped and reported as a warning. An arcane spell with no recognized school fails that spell. |
| `sphere` | `sphere` for a divine spell (required when `tradition` is `DIVINE`). |
| `components` + `material_components` | Same underlying `SpellParser` logic as `parse_spell_components_with_migration`: join array or string components, parse `V`/`S`/`M` flags with `SpellParser::parse_components`, and extract material rows from an explicit `material_components` / `Material Components` field or an `M (...)` parenthetical on the components line. Description prose that names consumed items stays in the description. |
| `range`, `duration`, `casting_time`, `area_of_effect` or `area` (`Area of Effect` / `Area`), `damage` | `SpellParser` (`parse_range`, `parse_duration`, `parse_casting_time`, `parse_area`, `parse_damage`), followed by a Rust port of the editor shape validators (`parserValidation.ts`). If the result fails the shape check, replace it the way the editor does: range, duration, casting time, and area become `Special` with `raw_legacy_value` (and `text`) set to the original text; damage becomes kind `none` with `source_text` set to that text. Do not reject the spell for that fallback. Do not add a per-level increment to casting time. `6 hours per level` stays whatever `parse_casting_time` returns. |
| `saving_throw` | Rust port of the editor mapper `mapLegacySavingThrow`. `Special` is `dm_adjudicated` with `notes` and `raw_legacy_value` set to the original text. `None` in any case is kind `none` with `raw_legacy_value: None` (matching `mechanics.rs` and `mapLegacySavingThrow`, so `normalize()` prunes default `none`). Do not use `SpellParser::parse_saving_throw` directly for `"Special"`, which defaults to a single negates save. |
| `magic_resistance` | Rust port of the editor mapper `mapLegacyMagicResistance` when the source record has a non-empty string. |
| `description` | prose only (preserving Markdown tables and paragraphs; normalized to LF). |
| `reversible` | JSON `true`, or `1` / `true` / `yes` (any case), becomes `1`. Absent or false becomes unset. The JSON sample sets this only on `Proctiv's Breach Crystal Sphere`. Markdown sets it only from a `Reversible:` bullet, and that sample has none, so the same spell stays unset when imported from Markdown. |
| `source_document` + `source_page`, or `Source: <book>, p. <page>` | one `SourceRef` (`book`, numeric `page` when the page parses as an integer, matching right-most `, p. <page>` so book titles with commas survive). The JSON sample book `Nethril - Empire of Magic` is stored as written. |
| `review_notes` or a `### Review` block | `SourceRef.note` (truncated to `SOURCE_REF_NOTE_MAX_CHARS` = 2,048 characters with a preview warning if exceeded). Also listed on the preview warnings for that spell. Omitted from `description`. `source_refs` are excluded from the content hash, so this note does not change spell identity. |
| `needs_review: true` | an additional preview warning. The flag is not a stored column. |

If the parsed book is empty or case-insensitively `markdown.md`, use the imported file stem as the book (or `"Unknown"` when a `SourceRef` is needed for `review_notes` and neither a book nor a filename was provided). The sample Markdown source line uses the `markdown.md` placeholder.

Unknown per-spell keys are ignored on this adapter. The canonical `deny_unknown_fields` rule still applies to single-spell and canonical-bundle JSON.

### 4. Failure and limits

Each spell is mapped and validated on its own. A spell that fails tradition, school, level/epic validation, or schema validation is recorded as an `ImportSpellJsonFailure` naming the spell (or section index when unnamed); the other spells in the file or multi-file Markdown batch are still returned. Existing payload limits remain: 100 MB payload size, JSON depth 50 (for JSON inputs), and at most 10,000 spells across the import request.

Description text, including Markdown tables, is kept. Bullet labels under a `##` heading are matched case-insensitively before prose begins. A `### Review` block ends at the next `## ` heading or at end of file. `### Review` is not a spell heading.

### 5. Application version

This change raises the Spellbook release version from `0.1.0` to `0.2.0` (minor). Set all three release files with `python scripts/set_release_version.py 0.2.0` and refresh `apps/desktop/src-tauri/Cargo.lock` with `cargo check`:

- `apps/desktop/package.json`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/desktop/src-tauri/Cargo.lock`

`CURRENT_SCHEMA_VERSION` stays `2`. `BUNDLE_FORMAT_VERSION` stays `1`. SpellScribe `spellscribe_version` is the incoming file's version, not the app version.

## Risks / Trade-offs

- [A future SpellScribe major version adds fields or changes types.] → Reject major versions other than 1 with an explicit error instead of mapping them best-effort.
- [A level-2 heading inside a description becomes an extra spell.] → The sample uses `##` only for spell titles and `###` for review. Document that contract. Tables and prose under a spell stay in that spell.
- [Review notes longer than the source-note limit are cut off.] → Truncate to the existing `SourceRef` note limit and add a warning.
- [Routing spell-list Markdown through the JSON preview skips the column mapper.] → These files already use labeled fields. Unstructured Markdown without `##` headings still uses the mapper.
- [Combined schools stored as one enum value differ from a review note that suggests splitting them.] → `Invocation/Evocation` is a legal school. Do not split it.
- [The Rust saving-throw parser and the editor disagree on `Special`.] → Source-list import uses the editor mapper. Canonical bundle import keeps the Rust parser.

## Migration Plan

No schema or data migration. The change is import-only. Rollback is reverting the classifier, the Markdown splitter, and the wizard branch. Files already imported stay in the library.

## Open Questions

None. The sample files define the accepted shapes, and canonical bundles remain the path for `spells` arrays that lack `spellscribe_version`.
