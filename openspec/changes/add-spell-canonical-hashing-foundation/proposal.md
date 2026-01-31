# Add Canonical Hashing Foundation

## Problem
Spells in the application currently rely on non-deterministic local database IDs and loose string-based fields. This causes:
1.  **Duplication**: Importing the same spell twice creates copies.
2.  **Versioning Issues**: Hard to track if a spell has changed.
3.  **Fragility**: String parsing is error-prone.

We need a fundamental way to uniquely identify spells by their content using cryptographic hashing (SHA-256) and enforced structure.

## Solution
Implement the foundational logic for Canonical Spell Hashing:
1.  **Strict Schema**: Define `spell.schema.json` to structurally valid spell data.
2.  **Canonicalization**: Implement deterministic JSON serialization (RFC 8785 rules).
3.  **Hashing**: Compute SHA-256 hash of the canonical JSON.
4.  **Validation**: Enforce schema compliance before hashing.
5.  **Versioning**: Track schema versions to support future evolution.

## Scope
### In Scope
-   JSON Schema definition (`spell.schema.json`)
-   Canonical Serialization Contract (`canonical-serialization.md`)
-   Backend implementation of `CanonicalSpell` struct
-   Hash computation logic (SHA-256)
-   Schema validation logic (using `jsonschema` crate)
-   Schema versioning infrastructure (database column, metadata)
-   Documentation for hashing and validation APIs

### Out of Scope
-   Data migration of existing spells (handled in Spec #2)
-   UI components or editor changes (handled in Spec #3)
-   Import/Export logic (handled in Spec #5)
-   Search integration (handled in Spec #5)

## Dependencies
-   **None** (This is the foundational spec)
