# Design: Spell Canonical Hashing

## Architectural Overview

To solve the issue of spell duplication and versioning, we are decoupling the "Database ID" (local SQLite Row ID) from the "Spell Identity" (globally unique Content Hash).

We introduce a `CanonicalSpell` intermediate representation.

## Components

### 1. The Schema (`resources/spell.schema.json`)
We have defined a Draft 2020-12 JSON Schema that enforces:
-   **Strict Typing**: No ambiguous strings where enums work (School, Sphere, Units).
-   **Calculable Properties**: `duration`, `range`, `area`, `damage`, `casting_time` are objects with `base`, `per_level`, `divisor` fields.
-   **Tradition Logic**: Conditional validators (`allOf`) enforce that Arcane spells have Schools and Divine spells have Spheres.

### 2. The Contract (`resources/canonical-serialization.md`)
We define a normalization pipeline before hashing:
1.  **Snapshot**: Map the internal `SpellDetail` model to a strictly Schema-compliant `CanonicalSpell` struct. This acts as the frozen representation (filtering excluded fields like `id`).
2.  **Canonicalize**:
    *   Sort all object keys recursively (A-Z).
    *   Sort specific set-arrays (`tags`, `class_list`, `descriptors`, `subschools`, `spheres`).
3.  **Serialize**: Convert to UTF-8 string with NO whitespace.
4.  **Hash**: Compute SHA-256 digest of the serialized string.

### 3. Database Changes
We will add a `content_hash` (TEXT, Indexed) column to the `spells` table.
-   **Unique Constraint**: Optional. We might allow multiple rows with same hash if they belong to different "Bindings" (e.g. specifically different user-overridden tags), but ideally, strict content hashing implies one row per hash.
-   **Decision**: For now, we allow duplicates but index the hash to find them easily.

### 4. Rust Implementation
We will use `serde` with a custom `CanonicalSerializer` or a pre-processing step that converts `SpellDetail` -> `serde_json::Value` -> sort keys -> stringify.

## Alternatives Considered
-   **UUIDs**: Random UUIDs don't solve deduplication (importing Fireball twice generates two UUIDs).
-   **Name+Level Key**: Insufficient (multiple "Armor" spells, homonyms).
-   **Git-like Merkle Tree**: Overkill for single entities, but strict hashing is the first step towards it.
