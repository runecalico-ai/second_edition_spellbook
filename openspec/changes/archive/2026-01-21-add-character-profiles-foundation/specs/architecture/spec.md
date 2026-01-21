## MODIFIED Requirements

### Requirement: SQLite Data Storage
All spell, character, and application data SHALL be stored in a local SQLite database that is user-accessible and portable. The `spell` table SHALL include `is_quest_spell` and `is_cantrip` columns (INTEGER) to support extended magic types. The database SHALL include character profile tables: `character` (extended with race, alignment, com_enabled), `character_ability`, `character_class`, and `character_class_spell`.

#### Scenario: Database Accessibility
- **WHEN** the user locates the `SpellbookVault` directory
- **THEN** they should find a standard SQLite database file that can be backed up or inspected with external tools

#### Scenario: Character Profile Tables
- **WHEN** the database is initialized or migrated
- **THEN** the `character`, `character_ability`, `character_class`, and `character_class_spell` tables SHALL be created with appropriate foreign keys and indexes
