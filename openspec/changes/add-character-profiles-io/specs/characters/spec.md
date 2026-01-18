## ADDED Requirements

### Requirement: Character Import and Export
The application SHALL support importing and exporting character profiles as JSON or Markdown bundles, including identity, abilities, classes, and per-class spell lists. Spells SHALL be deduplicated by canonical key (name + level + source).

#### Scenario: Exporting Character as JSON
- **WHEN** the user exports a character with 2 classes and 50 spells
- **THEN** a JSON bundle SHALL be created with format "adnd2e-character" and format_version "1.0.0", containing all character data and spell references

#### Scenario: Importing Character from JSON
- **WHEN** the user imports a valid JSON character bundle
- **THEN** the character, abilities, classes, and spell links SHALL be created, and spells SHALL be deduplicated against the existing library

#### Scenario: Exporting Character as Markdown
- **WHEN** the user exports a character with 2 classes and 50 spells as a Markdown bundle
- **THEN** a folder SHALL be created containing character.yml (identity + abilities + classes) and spells/*.md files for referenced spells

#### Scenario: Importing Character from Markdown
- **WHEN** the user imports a valid Markdown character bundle (character.yml + spells/*.md)
- **THEN** the character, abilities, classes, and spell links SHALL be created, and spells SHALL be deduplicated against the existing library

#### Scenario: Round-Trip Import/Export
- **WHEN** the user exports a character with 2 classes and 100+ spells, then re-imports the bundle
- **THEN** all data SHALL match the original without loss

#### Scenario: Collision Handling
- **WHEN** the user imports a character bundle with a name matching an existing character
- **THEN** the application SHALL prompt the user to update the existing character or create a new one

#### Scenario: Missing Spell Data on Import
- **WHEN** a character bundle references a spell not in the library
- **THEN** the spell SHALL be created in the library using the provided data
