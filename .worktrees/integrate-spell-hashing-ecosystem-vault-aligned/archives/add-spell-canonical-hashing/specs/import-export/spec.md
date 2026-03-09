# Capability: Spell Import/Export

## MODIFIED Requirements

### Requirement: Import Deduplication
The system MUST use content hashes to detect duplicate spells during import.

#### Scenario: Exact Duplicate
- GIVEN an existing spell in the library with Hash X
- WHEN importing a spell bundle containing a spell with Hash X
- THEN the system MUST recognize it as an exact match
- AND MUST NOT create a new database version (unless explicitly overriding metadata like "book").

### Requirement: Interchange ID Transformation
The "id" field in the Interchange Format MUST represent the Global Content Hash, not the Local Database ID.

#### Scenario: Export Transformation
- GIVEN a spell with Local ID 123 and Content Hash "abc..."
- WHEN generated for export
- THEN the JSON output MUST set `"id": "abc..."`
- AND MUST NOT contain the value 123 in the `id` field.

#### Scenario: Import ID Handling
- GIVEN an incoming spell with `"id": "abc..."`
- WHEN imported
- THEN the system MUST NOT attempt to coerce "abc..." into an integer Primary Key
- AND MUST assign a new Local Integer ID if the spell is persisted.
