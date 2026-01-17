# spellbooks Specification

## Purpose
TBD - created by archiving change backfill-core-specs. Update Purpose after archive.
## Requirements
### Requirement: Printable Export
The application SHALL generate printable PDF exports for single spells or entire character spellbooks.
#### Scenario: Printing a Spellbook
- **WHEN** the user select "Export to PDF" for a character with prepared spells
- **THEN** a PDF must be generated containing the full stat blocks of those spells in a printer-friendly layout

### Requirement: Layout Presets
The exporter SHALL support different layout presets, such as "Compact", "Stat-Block", and "List".
#### Scenario: Switching to Compact Layout
- **WHEN** the user selects the "Compact" layout preset during export
- **THEN** the resulting PDF should show more spells per page with reduced detail

### Requirement: Spellbook Picker Filters
The interface for adding spells to a character's spellbook SHALL include integrated filters for school and level range to help manage large libraries.
#### Scenario: Finding Spells for a Specialist
- **WHEN** the user is adding spells to an Illusionist's spellbook
- **AND** they filter the picker by the "Illusion" school
- **THEN** only Illusion spells SHALL be shown in the selection list

### Requirement: High-Level Terminology
The application SHALL use appropriate terminology for high-level and quest magic in all displays and exports.
- Levels 10, 11, and 12 SHALL be referred to as "10th Circle", "11th Circle", and "12th Circle" for Arcane spells to ensure the numeric level remains clear.
- Quest spells SHALL display as "Quest" instead of a numeric level.
- Spells flagged as `is_cantrip` SHALL be referred to as "Cantrips".

#### Scenario: Displaying Quest Spell Terminology
- **WHEN** viewing a Divine spell flagged as `is_quest_spell`
- **THEN** the level display SHALL show "Quest"

#### Scenario: Displaying Epic Circle Terminology
- **WHEN** viewing a Level 10 Arcane spell
- **THEN** the level display SHALL show "10th Circle"

#### Scenario: Displaying Cantrip Terminology
- **WHEN** viewing a Level 0 spell flagged as `is_cantrip`
- **THEN** the level display SHALL show "Cantrip"

#### Scenario: Displaying Level 0 (Non-Cantrip) Terminology
- **WHEN** viewing a Level 0 spell NOT flagged as `is_cantrip`
- **THEN** the level display SHALL show "Level 0"

