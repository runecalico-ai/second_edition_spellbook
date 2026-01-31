# Add Canonical Spell Hashing Core

## Problem
Spells rely on non-deterministic local DB IDs, causing duplications and versioning issues. We need a fundamental way to identify spells by content using SHA-256.

## Solution
Implement the core backend logic for the Canonical Hashing contract.
1.  **Schema**: define strictly typed structure.
2.  **Contract**: serialization & sorting logic.
3.  **Backend**: `CanonicalSpell` Rust model + `compute_hash()`.
4.  **DB**: Add `content_hash` column to `spells`.

## Scope
-   **Resources**: `spell.schema.json`, `canonical-serialization.md` (Included).
-   **Code**: Rust models, Serialization logic, Database Migration.
-   **Excludes**: UI changes, Search updates, Import/Export logic (handled in subsequent changes).
