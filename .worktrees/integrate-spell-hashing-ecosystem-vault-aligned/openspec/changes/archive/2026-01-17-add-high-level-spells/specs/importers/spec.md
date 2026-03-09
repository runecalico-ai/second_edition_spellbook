## ADDED Requirements
### Requirement: High-Level Import Validation
The import wizard SHALL validate high-level and quest spells during the import process, flagging records that violate AD&D 2e magic restrictions.

#### Scenario: Importing Valid High-Level Arcane Spell
- **WHEN** the user imports a Markdown file containing a Level 11 Arcane spell
- **THEN** the importer SHALL accept the record without validation errors

#### Scenario: Importing Quest Spell by Numeric Level
- **WHEN** the user imports a Divine spell with Level "8"
- **THEN** the importer SHALL accept the record and set `is_quest_spell` to 1

#### Scenario: Importing Quest Spell by Terminology
- **WHEN** the user imports a Divine spell with Level "quest"
- **THEN** the importer SHALL accept the record, set `level` to 8, and set `is_quest_spell` to 1

#### Scenario: Validating Cantrip Import by Numeric Level
- **WHEN** the user imports a Level "0" spell flagged as Cantrip
- **THEN** the importer SHALL accept the record

#### Scenario: Validating Cantrip Import by Terminology
- **WHEN** the user imports a spell with Level "cantrip"
- **THEN** the importer SHALL accept the record, set `level` to 0, and set `is_cantrip` to 1

#### Scenario: Flagging Invalid Cantrip Import
- **WHEN** the user imports a Level 2 spell flagged as Cantrip
- **THEN** the importer SHALL flag the record as invalid

### Requirement: Non-Standard Import Warning
The application SHALL display a notice when importing epic or quest spells, informing the user of the non-standard content being added.

#### Scenario: Importing an Epic Spell Batch
- **WHEN** the user imports a file containing Level 10+ spells
- **THEN** the import dialog SHALL display a warning about "High-Level Magic"
- **AND** provide a checkbox to suppress future warnings
