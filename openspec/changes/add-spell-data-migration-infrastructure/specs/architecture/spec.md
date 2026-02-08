# architecture Specification

## MODIFIED Requirements

### Requirement: SQLite Data Storage
The application SHALL store all application data in a local SQLite database. The `spell` table SHALL include a `canonical_data` column (JSON) to store structured, validated spell data produced by the migration or editor systems. This column SHALL coexist with legacy string-based columns to facilitate non-destructive "Expand and Contract" migration.

#### ADDED Scenario: Canonical Data Storage
- **WHEN** a spell is migrated or updated with the new hashing system
- **THEN** its structured representation SHALL be stored in the `canonical_data` JSON column
- **AND** the legacy columns SHALL remain intact during the "Expand" phase

## ADDED Requirements

### Requirement: Migration CLI Tools
The system SHALL provide administrative CLI tools to manage the lifecycle of spell data hashes and migration states.

#### Scenario: Recomputing Hashes
- **WHEN** the user runs `spellbook-desktop --recompute-hashes`
- **THEN** the system SHALL re-calculate hashes for all spells in the `library` and update the `content_hash` column

#### Scenario: Integrity Check
- **WHEN** the user runs `spellbook-desktop --check-integrity`
- **THEN** the system SHALL verify that the `content_hash` matches the current `canonical_data` for every spell
- **AND** report any discrepancies or corruption
