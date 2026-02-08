# Add Canonical JSON Serialization and Hashing for Spells

## Problem
Currently, spells in the Spellbook application rely on database auto-incrementing IDs (`i64`) as their primary identifier. This creates several issues:

1.  **Import Duplication**: Importing the same spell from different sources (e.g., a "Core Rules" JSON and a "Player Options" JSON) results in duplicates because the system cannot deterministically identify that "Fireball" is the same spell across files.
2.  **Versioning Difficulty**: Without a content-based identity, checking if a spell has changed (to verify version integrity) requires field-by-field diffing logic that is brittle.
3.  **Sync Challenges**: Sharing spellbooks or character data across instances (or syncing with future cloud features) is difficult without a globally unique identifier that doesn't conflict with local DB sequences.

## Solution
We propose implementing a **Canonical JSON Serialization + Hashing Contract**.

This involves:
1.  Defining a strict **JSON Schema** for Spells (`spell.schema.json`) that dictates the exact field names, types, and constraints (e.g., recursive key sorting, array sorting).
2.  Establishing a **Canonical Serialization Strategy** (`canonical-serialization.md`) that defines how to turn a Spell object into a normalized bytestring (UTF-8, no whitespace, sorted keys, specific field inclusions/exclusions).
3.  Generating a **Content-Addressed ID** (SHA-256 hash) from this canonical serialization.

By identifying spells by their content hash (`id`), we enable:
-   **Deduplication**: Import logic can simply compute the hash of an incoming spell. If it matches an existing hash, it is the same spell.
-   **Integrity**: The ID *is* the version. If the user edits the description, the ID changes, allowing preservation of the original (if desired) or explicit branching.
-   **Interoperability**: Spells exported from one machine can be imported by another with guaranteed identity matching.

## Scope
*   **Define Schema**: Create `spell.schema.json` (Done).
*   **Define Contract**: Create `canonical-serialization.md` (Done).
*   **Backend Implementation** (`src-tauri`):
    *   Implement serialization logic in Rust matching the contract.
    *   Add `hash` field to the Spell model (and DB schema if not present, though `spell.schema.json` suggests `id` IS the hash now, replacing or augmenting the integer ID?).
    *   *Correction*: The application likely still needs a numeric PK for SQLite efficiency/relationships, but the *public/interchange* ID should be the hash. Or we might replace the PK entirely. The `spell.schema.json` defines `id` as the hash.
    *   We will initially implement this as an *additional* integrity check or import deduplication key, potentially migrating proper IDs later.
*   **Frontend**: exposure of hashing logic (optional, mostly backend concern).

## Risks
*   **Migration**: Existing spells in user databases have integer IDs. We will need a migration strategy to compute and populate hashes for existing rows.
*   **Performance**: Hashing on every save might have trivial overhead, but imports of thousands of spells will need efficient batching.
