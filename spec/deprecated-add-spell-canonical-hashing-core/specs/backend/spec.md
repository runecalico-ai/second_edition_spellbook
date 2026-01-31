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
- GIVEN differing order of `tags`
- WHEN hashed
- THEN they MUST produce the exact same hash.
