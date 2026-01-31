# Integrate Spell Hashing

## Problem
Now that the backend creates hashes and the UI creates structured data, the rest of the ecosystem (Search, Import, Vault, Characters, Lists) needs to actually *use* the content hash for identity and portability.

## Solution
Update all peripheral systems to respect the Canonical Content Hash.

## Scope
-   **Search**: Index structured text fields.
-   **Import/Export**: Use Hash as ID.
-   **Vault**: Use Hash in filenames.
-   **Spell Lists / Characters**: Reference spells by Hash.

## Dependencies
This change depends on both the backend logic and valid UI data:
-   `add-spell-canonical-hashing-core` (MUST be applied first).
-   `update-spell-editor-structured-data` (MUST be applied second).
