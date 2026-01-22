# importers Spec Delta

## MODIFIED Requirements

### Requirement: High-Level Import Validation

The import wizard SHALL validate high-level and quest spells during the import process, flagging records that violate AD&D 2e magic restrictions.

#### Scenario: Importing Valid High-Level Arcane Spell
- **WHEN** the user imports a Markdown file containing a Level 11 Arcane spell with `class_list` containing "Wizard"
- **THEN** the importer SHALL accept the record without validation errors

#### Scenario: Importing Quest Spell by Numeric Level
- **WHEN** the user imports a Divine spell with Level "8" and `class_list` containing "Priest"
- **THEN** the importer SHALL accept the record and set `is_quest_spell` to 1

#### Scenario: Importing Quest Spell by Terminology
- **WHEN** the user imports a Divine spell with Level "quest" and `class_list` containing "Cleric"
- **THEN** the importer SHALL accept the record, set `level` to 8, and set `is_quest_spell` to 1

#### Scenario: Validating Cantrip Import by Numeric Level
- **WHEN** the user imports a Level "0" spell
- **THEN** the importer SHALL accept the record and automatically set `is_cantrip` to 1

#### Scenario: Validating Cantrip Import by Terminology
- **WHEN** the user imports a spell with Level "cantrip"
- **THEN** the importer SHALL accept the record, set `level` to 0, and set `is_cantrip` to 1

#### Scenario: Flagging Invalid Cantrip Import
- **WHEN** the user imports a Level 2 spell flagged as Cantrip
- **THEN** the importer SHALL flag the record as invalid

#### Scenario: Rejecting Epic Spell Without class_list
- **WHEN** the user imports an Epic spell (level 10-12) with no `class_list`
- **THEN** the importer SHALL flag the record with a validation error: "Epic spells (level 10-12) require class_list with arcane casters (Wizard/Mage)"

#### Scenario: Rejecting Quest Spell Without class_list
- **WHEN** the user imports a Quest spell with no `class_list`
- **THEN** the importer SHALL flag the record with a validation error: "Quest spells require class_list with divine casters (Priest/Cleric/Druid/Paladin/Ranger)"

### Requirement: Duplicate Merge Review

The application SHALL provide a user interface to review and resolve duplicates by merging fields or skipping records. **Each conflict SHALL have a unique identifier even when multiple incoming files match the same existing spell.**

#### Scenario: Merging Spell Data
- **WHEN** a duplicate spell is detected during import
- **THEN** the user SHALL be presented with a diff view to choose which fields to keep from the new import vs. the existing library record

#### Scenario: Resolving Multiple Conflicts for Same Spell
- **WHEN** multiple incoming files match the same existing spell
- **THEN** each conflict SHALL be displayed independently with unique resolution options
- **AND** user selections for each conflict SHALL be preserved without overwriting
