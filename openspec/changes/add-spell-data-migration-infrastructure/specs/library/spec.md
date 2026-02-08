# library Specification

## MODIFIED Requirements

### Requirement: Spell CRUD
The spell record SHALL include a `canonical_data` field that acts as the single source for structured attributes. During the migration phase, CRUD operations SHOULD maintain parity between the `canonical_data` JSON and legacy columns (Name, Level, School/Sphere, Range, etc.) where possible.

#### ADDED Scenario: Creating Spell with Canonical Data
- **WHEN** a new spell is created via the API
- **THEN** the system SHALL populate the `canonical_data` JSON object
- **AND** populate legacy flat columns to maintain backward compatibility for existing tools

## ADDED Requirements

### Requirement: Intelligent Legacy Parsing
The system SHALL provide a parsing engine to convert legacy string-based fields into structured JSON representations.

#### Scenario: Parsing Range String
- **WHEN** a legacy spell has range "10 yards + 5/level"
- **THEN** the parsing engine SHALL convert this to a structured **range** object: `{"base": 10, "unit": "yards", "scaling": {"value": 5, "per": "level"}}`

#### Scenario: Handling Failed Parses
- **WHEN** a legacy string cannot be automatically parsed with high confidence
- **THEN** the system SHALL store the original string in a `raw_legacy_value` field within the JSON
- **AND** SHALL log parse failures (e.g. in migration.log) for admin review; the system need not persist a separate "flagged" state

### Requirement: Expand-and-Contract Synchronization
During the data migration lifecycle, the system MUST ensure data integrity between the "Legacy" (columns) and "Structured" (JSON) representations of spell data.

#### Scenario: Data Consistency Enforcement
- **WHEN** a record is updated
- **THEN** the system SHALL perform a "sync check" on every spell update (no optional toggle) to ensure that the value in the flat columns (e.g., `range`) matches the corresponding value extracted from the `canonical_data` JSON
- **AND** SHALL log any discrepancies found during runtime (e.g. to stderr)

Implementation: the sync check runs after every spell write—`update_spell` (via `apply_spell_update_with_conn`), `upsert_spell` (after UPDATE or INSERT), and both import paths (after each spell UPDATE or INSERT).
