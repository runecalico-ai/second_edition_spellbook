# Capability: Spellbooks

The Spellbooks capability covers the organization of spells for specific characters and the generation of printable formats.

## ADDED Requirements

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
