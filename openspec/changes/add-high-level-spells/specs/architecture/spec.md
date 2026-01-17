## MODIFIED Requirements
### Requirement: SQLite Data Storage
All spell, character, and application data SHALL be stored in a local SQLite database that is user-accessible and portable. The `spell` table SHALL include `is_quest_spell` and `is_cantrip` columns (INTEGER) to support extended magic types.

#### Scenario: Database Accessibility
- **WHEN** the user locates the `SpellbookVault` directory
- **THEN** they should find a standard SQLite database file that can be backed up or inspected with external tools
