# importers Specification

## Purpose
TBD - created by archiving change backfill-core-specs. Update Purpose after archive.
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

