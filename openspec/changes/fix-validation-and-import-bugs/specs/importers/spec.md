# importers Spec Delta

## MODIFIED Requirements

### Requirement: Duplicate Merge Review

The application SHALL provide a user interface to review and resolve duplicates by merging fields or skipping records. **Each conflict SHALL have a unique identifier even when multiple incoming files match the same existing spell.**

#### Scenario: Resolving Multiple Conflicts for Same Spell
- **WHEN** multiple incoming files match the same existing spell
- **THEN** each conflict SHALL be displayed independently with unique resolution options
- **AND** user selections for each conflict SHALL be preserved without overwriting

### Requirement: Import Filename Sanitization

The importer SHALL detect filename collisions that result from sanitization and prevent silent data loss.

#### Scenario: Colliding Filenames
- **WHEN** importing multiple files that sanitize to the same destination filename (e.g. `spell.md` and `spell?.md` -> `spell.md`)
- **THEN** the importer SHALL fail the operation with a clear validation error identifying the conflicting files
- **AND** no data SHALL be overwritten silently

### Requirement: Import Overwrite Behavior

When importing with the "Overwrite" option enabled, the importer SHALL update all spell fields, including identity fields that match the record.

#### Scenario: Overwriting Identity Fields
- **WHEN** a user imports a spell with "Overwrite" enabled
- **THEN** simple fields (school, sphere) SHALL be updated
- **AND** identity fields (`name`, `level`, `source`) SHALL be updated to match the incoming file
- **AND** the record SHALL be identified by its original ID found via match logic
