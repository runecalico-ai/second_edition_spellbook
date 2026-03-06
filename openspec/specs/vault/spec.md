# vault Specification

## Purpose
This specification defines the data storage and backup system, including the centralized SpellbookVault directory structure, native SQLite backup API usage for data integrity, and full vault archiving (export/import) for portability. It ensures user data remains accessible, portable, and protected through robust backup mechanisms that complement the local-first architecture.

> See [design.md Decisions #2, #6](../../design.md) for full context.

## Requirements

### Requirement: Centralized Vault Directory
The application SHALL store all user data, including database files and any attached artifacts, within a single, user-controlled "SpellbookVault" directory.

#### Scenario: Verifying Vault Contents
- **WHEN** the user opens the "SpellbookVault" directory
- **THEN** it SHALL contain the `spellbook.db` file and an `attachments/` sub-folder for all imported artifacts

### Requirement: Canonical Filename Storage
The Vault MUST support storing spell definitions using their canonical content hash. A vault spell file is retained if and only if its hash is referenced by at least one `spell` row or at least one `artifact.spell_content_hash`.

#### Scenario: Collision Prevention
- GIVEN two spells named "Fireball"
- WHEN saved
- THEN filenames MUST include the Content Hash at the specific path: `{vault_root}/spells/{content_hash}.json`.

#### Scenario: Integrity Verification
- GIVEN a spell file `spells/{hash}.json`
- WHEN read from vault
- THEN content hash MUST be recomputed by applying canonical serialization (normalize → validate → strip metadata → apply JCS → SHA-256) to the file content
- AND recomputed hash MUST match filename hash.

#### Scenario: Vault File Content
- GIVEN a spell stored in vault as `spells/{hash}.json`
- WHEN the file is read
- THEN file content MUST be the full CanonicalSpell JSON (including metadata)
- AND integrity check MUST recompute hash via canonical serialization (normalize → validate → strip metadata → JCS → SHA-256)
- AND raw file byte hash is NOT used for integrity verification.

#### Scenario: GC with Deferred Cleanup
- GIVEN a spell deleted from DB
- WHEN vault GC runs
- THEN file `spells/{hash}.json` MUST be removed if no `spell` row AND no `artifact.spell_content_hash` references that hash.

#### Scenario: GC with Immediate Cleanup (alternative)
- GIVEN a spell explicitly deleted by user
- WHEN deletion completes
- THEN file `spells/{hash}.json` MAY be removed immediately.

#### Scenario: GC Triggers
- THE system MUST support a manual "Optimize Vault" trigger in the UI.
- AND the system SHOULD run vault GC automatically following every successful import of 1 or more spells (as part of post-import cleanup).

Both GC approaches are valid; implementation may choose either or both.

#### Scenario: GC Blocked During Import
- GIVEN an import operation is in progress
- WHEN vault GC is triggered (manually or scheduled)
- THEN GC MUST NOT execute until the import completes
- AND implementation MUST use either a mutex/lock or UI-level mutual exclusion (e.g., disable GC button during import).

### Requirement: Vault Integrity Recovery
The Vault MUST detect and recover from missing files. The vault integrity check MUST run before every GC operation. Additional timing (e.g. on application startup when the vault is opened, on-demand from Settings) is configurable via a user-facing option. The application MUST provide a configuration option to enable/disable automatic integrity checks at vault open.

#### Scenario: Configure Integrity Check on Vault Open
- GIVEN application settings are available
- WHEN the user toggles `vault.integrityCheckOnOpen`
- THEN `true` MUST run integrity check automatically when the vault is opened
- AND `false` MUST skip automatic integrity check on open (while still running integrity checks before GC).

#### Scenario: Missing Vault File
- GIVEN spell row exists with content_hash H
- AND vault file `spells/H.json` is missing
- WHEN vault integrity check runs
- THEN file MUST be re-exported from DB canonical_data if available
- AND log if unrecoverable.

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

## Non-Functional Requirements
- **Windows path length**: Full path to vault file MUST be < 260 characters. Implementer MUST log a warning if the vault root selection would lead to a path > 240 characters for a typical hash-named file.
- **Write latency**: Single spell write to vault SHOULD complete in < 100ms.
- **GC throughput**: Garbage collection for 10,000 vault files SHOULD complete in < 30 seconds.

