# Capability: Spellbook Hashing

## ADDED Requirements

### Requirement: Canonical Schema Compliance
All spells exported or imported via the interchange format MUST conform to the Strict Spell Schema.

#### Scenario: Schema Validation
- GIVEN a JSON spell object representing "Fireball"
- WHEN validated against `spell.schema.json`
- THEN it MUST pass all type, enum, and structure checks
- AND strict rules (e.g. Arcane tradition requires School, Divine requires Sphere) MUST be enforced.

### Requirement: Deterministic Identity (Content Addressing)
A spell's identity MUST be defined by the SHA-256 hash of its canonical JSON representation.

#### Scenario: Hashing Consistency
- GIVEN two spell objects with identical semantic content (Name, Level, School, Description, etc.)
- BUT different key ordering (e.g. `{"level": 3, "name": "Fireball"}` vs `{"name": "Fireball", "level": 3}`)
- WHEN processed by the Canonical Serializer
- THEN they MUST produce the exact same JSON string
- AND they MUST produce the exact same SHA-256 hash.

#### Scenario: Array Normalization
- GIVEN two spell objects where `tags` are `["Fire", "Evocation"]` and `["Evocation", "Fire"]`
- WHEN processed by the Canonical Serializer
- THEN they MUST be sorted alphabetically
- AND produce the same hash.

### Requirement: Identity Visibility
The application MUST expose the unique identity of the spell to the user.

#### Scenario: Display Hash
- GIVEN a viewing of a spell
- THEN the full SHA-256 Content Hash MUST be visible (or accessible via tooltip/copy)
- TO allow verification of identity against external sources.

### Requirement: Interchange ID Transformation
The "id" field in the Interchange Format MUST represent the Global Content Hash, not the Local Database ID.

#### Scenario: Export Transformation
- GIVEN a spell with Local ID 123 and Content Hash "abc..."
- WHEN generated for export
- THEN the JSON output MUST set `"id": "abc..."`
- AND MUST NOT contain the value 123 in the `id` field.

#### Scenario: Array Filtering
- GIVEN the new array-based fields (`tags`, `subschools`)
- WHEN filtering spells
- THEN the system MUST support exact matching against individual elements of these arrays.

#### Scenario: Import ID Handling
- GIVEN an incoming spell with `"id": "abc..."`
- WHEN imported
- THEN the system MUST NOT attempt to coerce "abc..." into an integer Primary Key
- AND MUST assign a new Local Integer ID if the spell is persisted.

### Requirement: Spell List Portability
Spell Lists (as defined in `spec-4_1-spell-list_spec.md`) MUST reference spells by their Canonical Content Hash.

#### Scenario: Portable Lists
- GIVEN a Spell List "Standard Wizard Spells" containing "Fireball"
- WHEN exported and imported on another machine
- THEN the entry for "Fireball" MUST resolve using its Content Hash
- AND MUST NOT depend on the local integer ID of "Fireball" on the source machine.
