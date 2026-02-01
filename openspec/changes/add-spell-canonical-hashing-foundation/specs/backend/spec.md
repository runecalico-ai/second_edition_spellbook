# Capability: Spell Core

## ADDED Requirements

### Requirement: Canonical Schema Compliance
All spells processed by the backend MUST support mapping to the Strict Spell Schema.

#### Scenario: Schema Mapping
- GIVEN a `SpellDetail` model
- WHEN converted to `CanonicalSpell`
- THEN it MUST conform to `spell.schema.json` structure.

### Requirement: Deterministic Identity
A spell's identity MUST be defined by the SHA-256 hash of its canonical JSON representation.

#### Scenario: Hashing Consistency
- GIVEN two spell objects with identical semantic content
- BUT different key ordering
- WHEN hashed
- THEN they MUST produce the exact same SHA-256 hash.

#### Scenario: Array Normalization
- GIVEN unordered metadata (e.g. `tags = ["Fire", "Fire", "Damage"]`)
- WHEN hashed
- THEN they MUST be deduplicated and sorted (Result: `["Damage", "Fire"]`)
- AND produce a predictable hash.

#### Scenario: Unicode NFC Normalization
- GIVEN strings with equivalent Unicode representations (e.g. "Fiancé" in NFC vs NFD)
- WHEN hashed
- THEN they MUST be normalized to NFC
- AND produce the exact same hash.

#### Scenario: Floating Point Precision
- GIVEN `number` fields with infinitesimal noise (e.g. `1.0000001` vs `1.0000004`)
- WHEN hashed
- THEN they MUST be rounded/truncated to 6 decimal places
- AND produce the exact same hash.

#### Scenario: Enum Normalization
- GIVEN enum fields with loose casing (e.g. `tradition = "arcane"`)
- WHEN hashed
- THEN they MUST be normalized to the exact schema casing (Result: `"ARCANE"`)
- AND produce a predictable hash.

#### Scenario: Empty Collection Stability
- GIVEN a spell with an empty array (e.g. `tags = []`)
- WHEN hashed
- THEN the canonical JSON MUST include the literal `[]`
- AND produce a predictable hash.

#### Scenario: Semantic Whitespace Collapse
- GIVEN short text fields with redundant internal whitespace (e.g. `range.text = "10  yards"`)
- WHEN hashed
- THEN multiple internal spaces MUST be collapsed to a single space (Result: `"10 yards"`)
- AND produce the exact same hash.

### Requirement: Tradition-Specific Integrity
The backend MUST enforce strict logical dependencies between traditions and metadata fields.

#### Scenario: "BOTH" Tradition Validation
- GIVEN a spell with `tradition = "BOTH"`
- WHEN validated
- THEN both `school` AND `sphere` MUST be non-null and valid.

### Requirement: Metadata Isolation
Internal record metadata MUST NOT influence the content-addressed identity.

#### Scenario: Metadata Exclusion
- GIVEN a spell record
- WHEN `schema_version` or `source_refs` are updated
- THEN the `id` (content hash) MUST NOT change.
