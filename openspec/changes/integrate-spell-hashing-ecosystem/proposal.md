# Integrate Spell Hashing into Ecosystem

## Problem
With the core hashing (Spec #1) and data stored (Spec #2), we need to integrate this new system into the rest of the application ecosystem.
1.  **Search**: Existing search relies on partial string matches of legacy data.
2.  **Import/Export**: We need to support sharing spells safely without ID conflicts.
3.  **Data Integrity**: References in characters and lists must use stable hashes, not IDs.
4.  **Security**: Importing external data carries risks (malicious payloads, massive files).

## Solution
Update all major application subsystems to use canonical hashes:
1.  **Search**: Implement Full-Text Search (FTS) indexing on structured data.
2.  **Vault**: Store spells in a content-addressable vault (filename = hash).
3.  **Conflict Resolution**: Provide UI for users to resolve import conflicts (Keep/Replace/Both).
4.  **Security**: rigorous validation and sanitization of all imported content.
5.  **Integration**: Update Character and Spell List modules to reference spells by hash.

## Scope
### In Scope
-   Search implementation (FTS5 virtual table, indexing triggers)
-   Import/Export logic with hash-based deduplication
-   Import Conflict Resolution UI (diff view, resolution options)
-   Vault implementation (hash-based file storage)
-   Spell List verification and migration
-   Character spellbook integration
-   Security review (import validation, sanitization, size limits)
-   Integration documentation

### Out of Scope
-   Schema definition (Spec #1)
-   Migration of legacy data (Spec #2)
-   Spell Editor UI (Spec #3)

## Dependencies
-   **Spec #1: `add-spell-canonical-hashing-foundation`**
    - Requires hash logic for all integrations.
-   **Spec #2: `add-spell-data-migration-infrastructure`**
    - Requires data to be migrated before indexing/integration can fully work.
