## MODIFIED Requirements

### Requirement: Import Version Validation
Import MUST validate schema and bundle format versions before processing. A top-level `spells` array is a SpellScribe source list when `spellscribe_version` is present, and a canonical bundle when `spellscribe_version` is absent.

#### Scenario: Warn on Future Schema Version
- GIVEN the app's current schema version
- WHEN importing a spell with a schema version greater than the app's
- THEN import MUST log/show a forward-compatibility warning.

#### Scenario: Reject Future Bundle Format Version
- GIVEN the app's supported bundle_format_version
- WHEN importing a bundle with bundle_format_version greater than supported
- THEN import MUST reject the entire bundle.

#### Scenario: Accept Current or Lower Schema Version
- GIVEN the app's current schema version (from code)
- WHEN importing a spell with schema version equal to or lower than the app's
- THEN import MUST accept the spell and process normally (including migration to the current version before hashing).

#### Scenario: Reject Missing Bundle Format Version in Bundle Export
- GIVEN a canonical bundle JSON containing a `spells` array, no `spellscribe_version`, and no `bundle_format_version`
- WHEN importing
- THEN import MUST reject the bundle
- AND error message MUST indicate missing required field.

#### Scenario: Accept Missing Bundle Format Version in Single-Spell Export
- GIVEN a single-spell JSON object that omits `bundle_format_version` entirely
- WHEN importing
- THEN import MUST process the spell normally without erroring for the missing bundle field.

#### Scenario: Bundle vs Single-Spell Detection
- GIVEN an import JSON payload
- WHEN the importer inspects the top-level structure
- THEN if `spellscribe_version` is present and `spells` is an array, the payload MUST be treated as a SpellScribe source list and MUST NOT require `bundle_format_version`
- AND if a top-level `spells` array exists and `spellscribe_version` is absent, the payload MUST be treated as a canonical bundle (require `bundle_format_version`)
- AND if no top-level `spells` array exists, the payload MUST be treated as a single-spell export.

#### Scenario: Reject Ambiguous List Envelope
- GIVEN a JSON object that contains both `spellscribe_version` and `bundle_format_version` (or `bundleFormatVersion`)
- WHEN importing
- THEN import MUST reject the payload
- AND the error MUST say the envelope is ambiguous.

#### Scenario: Reject Unsupported SpellScribe Major Version
- GIVEN a SpellScribe list whose `spellscribe_version` is not a string, has an unparseable major segment, or has a major version other than 1 before the first `.`
- WHEN importing
- THEN import MUST reject the file before mapping spells
- AND the error MUST identify the unsupported SpellScribe version.

#### Scenario: Reject SpellScribe Envelope Without a Spells Array
- GIVEN a JSON object with `spellscribe_version` and no `spells` key
- WHEN importing
- THEN import MUST reject the payload
- AND the error MUST say the `spells` array is missing.

#### Scenario: Reject Malformed Bundle Shape
- GIVEN an import JSON payload with top-level `spells` key present but not an array
- WHEN importing
- THEN import MUST reject the payload as malformed bundle input
- AND error message MUST indicate `spells` must be an array when present.

#### Scenario: Tampered Import Hash
- GIVEN imported spell with `content_hash` field "X"
- WHEN recomputed hash from spell content is "Y" (X ≠ Y)
- THEN import MUST warn user of integrity mismatch
- AND the recomputed hash "Y" MUST be used for deduplication.

## ADDED Requirements

### Requirement: SpellScribe JSON List Import
The importer SHALL accept a SpellScribe JSON list and return one canonical spell per element of `spells`. The envelope fields `version` and `exported_at` MUST be ignored. A SpellScribe major version of 1 MUST be accepted.

#### Scenario: Import the Netheril wizard JSON list
- **GIVEN** a JSON object with `spellscribe_version` `1.0.3` and a `spells` array of nine flat spell records, and no `bundle_format_version`
- **WHEN** the user previews the file
- **THEN** the preview MUST contain nine spells
- **AND** the names MUST include `Karsus's Avatar` and `Valdick's Spheresail`
- **AND** the preview MUST NOT fail with a missing `bundle_format_version` error

#### Scenario: Flat spell fields map onto a canonical spell
- **GIVEN** a SpellScribe spell with `tradition` `Arcane`, `class_list` `Wizard`, `level` 12, `school` `["Invocation/Evocation", "Enchantment/Charm", "Alteration"]`, `components` `["V", "S", "M"]`, string `range`, `duration`, `casting_time`, `area_of_effect`, and `saving_throw`, and boolean `reversible` false
- **WHEN** the spell is mapped
- **THEN** `tradition` MUST be `ARCANE`
- **AND** `level` MUST remain 12
- **AND** `class_list` MUST include `Wizard`
- **AND** `school` MUST be `Invocation/Evocation`
- **AND** `subschools` MUST include `Enchantment/Charm` and `Alteration`
- **AND** components, range, duration, casting time, area, and saving throw MUST be parsed with the editor expand rules in Requirement: Source List Editor Parse Parity
- **AND** the description MUST be the spell's `description` text
- **AND** `SourceRef.book` MUST be `Nethril - Empire of Magic`
- **AND** `SourceRef.page` MUST be 10

#### Scenario: Reversible flag from JSON
- **GIVEN** the SpellScribe record `Proctiv's Breach Crystal Sphere` with `reversible` true
- **WHEN** the spell is mapped
- **THEN** `reversible` MUST be 1
- **AND** a record with `reversible` false MUST leave `reversible` unset

#### Scenario: Divine spell, inferred tradition, cantrip, and quest mapping
- **GIVEN** source-list spells covering `tradition` `Divine` with a `sphere`, omitted `tradition` with only `school` or only `sphere`, level `"cantrip"`, and divine level `"quest"` (or numeric `8`)
- **WHEN** each spell is mapped
- **THEN** `Divine` (or sphere-only omitted tradition) MUST map to `DIVINE` with `sphere` preserved, school-only omitted tradition MUST map to `ARCANE`, `"cantrip"` MUST set `level` to 0 and `is_cantrip` to 1, and `"quest"` (or divine level `8`) MUST set `level` to 8 and `is_quest_spell` to 1

#### Scenario: Extra per-spell keys are ignored
- **GIVEN** a SpellScribe spell object containing extra metadata keys outside the canonical schema
- **WHEN** the spell is mapped
- **THEN** the extra keys MUST be ignored without failing the spell, while canonical single-spell and canonical-bundle JSON continue to reject unknown fields

### Requirement: Multi-spell Markdown List Import
The importer SHALL treat a Markdown document without leading YAML front matter that contains one or more level-2 headings (`## ` at the start of a line outside fenced code blocks) as a spell list with one spell per heading. A `###` heading MUST NOT start a spell. A Markdown document with YAML front matter or no level-2 heading MUST keep the existing single-spell front-matter parse.

#### Scenario: Import the Netheril wizard Markdown list
- **GIVEN** the Markdown spell list whose level-2 headings are the nine Netheril wizard spells
- **WHEN** the user previews the file
- **THEN** the preview MUST contain nine spells
- **AND** the first spell name MUST be `Karsus's Avatar`
- **AND** the description of that spell MUST include the research paragraph
- **AND** the description MUST NOT include the `### Review` text

#### Scenario: Preamble text and Markdown tables in spell lists
- **GIVEN** a Markdown spell list with text before the first `## ` heading and a Markdown table inside a spell description (such as `Mavin's Worldweave`)
- **WHEN** the file is mapped
- **THEN** text before the first `## ` heading MUST be ignored
- **AND** the Markdown table MUST remain intact inside that spell's `description`

#### Scenario: Bullet fields map like the JSON list
- **GIVEN** a section with bullets `Tradition: Arcane`, `Class: Wizard`, `Level: 10`, `School: Invocation/Evocation, Enchantment/Charm`, `Components: V, M`, and `Source: markdown.md, p. 10`
- **WHEN** the section is mapped
- **THEN** the canonical spell MUST use the same tradition, class, level, school, subschool, and component mapping as a SpellScribe JSON spell
- **AND** the source book MUST be the imported file stem because the book text is the placeholder `markdown.md`
- **AND** the source page MUST be 10

#### Scenario: Multiple Markdown spell-list files preserve per-file source book
- **GIVEN** two Markdown spell-list files selected together whose `Source:` lines use `markdown.md`
- **WHEN** the user previews the selection
- **THEN** spells from each file MUST appear in the canonical preview with `SourceRef.book` resolved to their respective file stem

#### Scenario: Single-spell Markdown is unchanged
- **GIVEN** a Markdown file with YAML front matter (even if its description body contains `## ` subheadings) or a Markdown file with no level-2 heading
- **WHEN** the user previews the file
- **THEN** the importer MUST return one spell using the existing front-matter parser

#### Scenario: Mixed Markdown shapes in one selection
- **GIVEN** one Markdown file with level-2 spell headings and another single-spell Markdown file (YAML front matter or no level-2 heading)
- **WHEN** the user selects both
- **THEN** the wizard MUST reject the selection
- **AND** the message MUST tell the user to import spell lists separately from single-spell notes

#### Scenario: High-level magic notice on source-list preview
- **GIVEN** a SpellScribe JSON or Markdown spell-list preview containing a spell with `level >= 10` or `is_quest_spell == 1` (and warnings not suppressed)
- **WHEN** the canonical preview step renders
- **THEN** the wizard MUST display the High-Level Magic notice with the option to suppress future warnings

### Requirement: Source List Editor Parse Parity
A SpellScribe or Markdown spell-list import MUST produce the same structured fields the spell editor produces when the same legacy text is expanded.

#### Scenario: Saving throw Special matches the editor
- **GIVEN** a SpellScribe or Markdown spell whose saving throw text is `Special`
- **WHEN** the spell is mapped
- **THEN** the saving throw kind MUST be `dm_adjudicated`
- **AND** the original text MUST be kept
- **AND** the result MUST NOT be a single save whose result is "negates"

#### Scenario: Saving throw None matches the editor
- **GIVEN** a spell whose saving throw text is `None`, in any case
- **WHEN** the spell is mapped
- **THEN** the saving throw kind MUST be `none`

#### Scenario: Casting time matches the editor parser
- **GIVEN** casting time text `6 hours`, `3 days`, `1 turn`, or `6 hours per level`
- **WHEN** the spell is mapped
- **THEN** the casting time MUST equal `parse_spell_casting_time` for that same text
- **AND** `6 hours per level` MUST NOT gain a per-level increment

#### Scenario: Invalid parser output uses the editor fallback
- **GIVEN** a range, duration, casting time, or area string whose `SpellParser` result fails the editor shape check
- **WHEN** the spell is mapped
- **THEN** that field MUST become `Special` and MUST keep the original text
- **AND** a damage string whose parser result fails the editor shape check MUST become damage kind `none` with `source_text` set to the original text
- **AND** the spell MUST NOT be rejected for that fallback

#### Scenario: Magic resistance matches the editor
- **GIVEN** a spell list record with a magic-resistance string
- **WHEN** the spell is mapped
- **THEN** the magic resistance MUST equal `mapLegacyMagicResistance` for that string

#### Scenario: Components do not mine the description
- **GIVEN** a spell whose components are `V, S, M` and whose description names consumed items
- **WHEN** the spell is mapped
- **THEN** verbal, somatic, and material MUST be set from the components field
- **AND** material-component rows MUST NOT be created from the description
- **AND** a parenthetical material on the components line, such as `M (a diamond)`, MUST be extracted the same way as `parse_spell_components_with_migration`

### Requirement: Source List Review Notes
Review text from either source list MUST NOT be appended to the spell description. It MUST be stored on the spell's `SourceRef.note` (truncated to the 2,048-character schema limit with a warning when longer) and shown in the preview UI warnings. `needs_review: true` MUST add a preview warning and MUST NOT require its own stored column.

#### Scenario: JSON review notes stay out of the description
- **GIVEN** a SpellScribe spell with `review_notes` and `needs_review` false
- **WHEN** the spell is mapped
- **THEN** `description` MUST NOT contain `review_notes`
- **AND** `SourceRef.note` MUST contain `review_notes`
- **AND** the preview warnings shown for that spell MUST include `review_notes`

#### Scenario: Markdown review section stays out of the description
- **GIVEN** a spell section whose body is followed by `### Review` and a review paragraph
- **WHEN** the section is mapped
- **THEN** the description MUST end before `### Review`
- **AND** the review paragraph MUST be stored on `SourceRef.note`
- **AND** the review paragraph MUST appear in the preview warnings shown for that spell

#### Scenario: Needs review flag adds a preview warning
- **GIVEN** a SpellScribe spell with `needs_review` set to `true`
- **WHEN** the spell is previewed
- **THEN** a preview warning indicating the spell needs review MUST be included and rendered in the preview UI

#### Scenario: Long review notes are truncated with a warning
- **GIVEN** a spell whose `review_notes` or `### Review` text exceeds 2,048 characters
- **WHEN** the spell is mapped
- **THEN** `SourceRef.note` MUST be truncated to 2,048 characters so schema validation succeeds
- **AND** a truncation warning MUST be added to that spell's preview warnings

#### Scenario: Review notes without a source document still attach to a source reference
- **GIVEN** a source-list spell with review text and no `source_document` or `Source:` bullet
- **WHEN** the spell is mapped
- **THEN** a `SourceRef` MUST still be created using the imported file stem (or `"Unknown"` when no filename is available) as `book` and storing the review text in `note`

### Requirement: Source List Partial Failure
A source list MUST import each spell independently. One spell that fails mapping or validation MUST NOT discard the other spells in the same file or selection.

#### Scenario: Unrecognized school token is dropped with a warning
- **GIVEN** an arcane spell whose `school` list includes both a recognized school and an unrecognized token
- **WHEN** the spell is mapped
- **THEN** the recognized school MUST be kept, the unrecognized token MUST be dropped, and a warning naming the dropped token MUST be included in preview warnings

#### Scenario: One invalid spell in a JSON list
- **GIVEN** a SpellScribe list of three spells where the second spell has tradition `Arcane` and no recognized school
- **WHEN** the user previews the file
- **THEN** the first and third spells MUST appear in the preview
- **AND** the second spell MUST be reported as a failure
- **AND** the failure reason MUST identify the spell name and the missing school

#### Scenario: One invalid section in a Markdown spell list
- **GIVEN** a Markdown spell list of multiple `## ` spell sections where one section fails tradition, school, or schema validation
- **WHEN** the user previews the file
- **THEN** the valid sections MUST appear in the preview
- **AND** the invalid section MUST be reported as a named failure without discarding the valid sections
