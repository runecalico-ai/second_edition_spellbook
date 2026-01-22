# vault Specification

## Purpose
This specification defines the data storage and backup system, including the centralized SpellbookVault directory structure, native SQLite backup API usage for data integrity, and full vault archiving (export/import) for portability. It ensures user data remains accessible, portable, and protected through robust backup mechanisms that complement the local-first architecture.
## Requirements
### Requirement: Centralized Vault Directory
The application SHALL store all user data, including database files and any attached artifacts, within a single, user-controlled "SpellbookVault" directory.
#### Scenario: Verifying Vault Contents
- **WHEN** the user opens the "SpellbookVault" directory
- **THEN** it SHALL contain the `spellbook.db` file and an `attachments/` sub-folder for all imported artifacts

### Requirement: Native SQLite Backup API
The application SHALL use the native SQLite online backup API for all database backup and restore operations to ensure data integrity and avoid file locking issues.
#### Scenario: Performing a Database-Only Backup
- **WHEN** the user triggers a "Backup Database" operation
- **THEN** the application SHALL use the SQLite backup API to create a consistent copy of the `spellbook.db` file

### Requirement: Vault Archiving (Export/Import)
The application SHALL provide a way to export the entire Vault directory (database and attachments) into a single compressed archive (ZIP) and conversely import such an archive to restore the full collection.
#### Scenario: Exporting the Full Vault
- **WHEN** the user selects "Export Vault"
- **THEN** the application SHALL create a ZIP file containing the entire `SpellbookVault` directory structure
- **AND** the resulting file SHALL be portable to other machines running the application

