# importers Specification

## Purpose
This specification defines the spell import system for extracting and validating spell data from multiple file formats (PDF, Markdown, DOCX). It covers parsing logic, assisted field mapping, duplicate detection and merging, import provenance tracking, and validation of high-level magic during import. This enables users to quickly populate their library from existing spell collections while maintaining data integrity.
## Requirements
### Requirement: Multi-format Parsing
The application SHALL support extracting spell data from `.pdf`, `.md`, and `.docx` files.
#### Scenario: Importing a PDF Spell List
- **WHEN** the user drags a PDF file into the Import Wizard
- **THEN** the Python sidecar must parse the text and extract fields like Name, Level, and Description

### Requirement: Assisted Mapping Wizard
The UI SHALL provide a way for users to manually map unparsed or incorrectly identified fields during a batch import process.
#### Scenario: Correcting a Field Mapping
- **WHEN** the user selects a "Casting Time" column and maps it correctly in the preview
- **THEN** the importer should apply this mapping to all spells in the current batch

### Requirement: Duplicate Merge Review
The application SHALL provide a user interface to review and resolve duplicates by merging fields or skipping records.
#### Scenario: Merging Spell Data
- **WHEN** a duplicate spell is detected during import
- **THEN** the user SHALL be presented with a diff view to choose which fields to keep from the new import vs. the existing library record

### Requirement: Deduplication
The application SHALL detect and resolve duplicate spells during import using a canonical key (Name + Class + Level + Source).
#### Scenario: Skipping Existing Spell
- **WHEN** the user attempts to import a spell that already exists in the library
- **THEN** the application should skip the duplicate or offer a merge option

### Requirement: Import Provenance Tracking
The application SHALL track the origin of imported spells by storing the source file path, file type, and a unique content hash.
#### Scenario: Storing Artifact Metadata
- **WHEN** a spell is successfully imported
- **THEN** the application SHALL record the source file's path, type, and hash, linking them to the imported spell record

### Requirement: Reparse from Artifact
The application SHALL allow users to re-run the parsing logic on a previously imported artifact to update or correct spell records.
#### Scenario: Correcting an Unparsed Field Later
- **WHEN** the user triggers a "Reparse" on a PDF artifact with a new mapping configuration
- **THEN** the application SHALL update the associated spell records based on the new parse results

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

