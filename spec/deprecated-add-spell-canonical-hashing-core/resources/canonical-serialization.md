# Canonical JSON Serializer + Hashing Contract

## Purpose
To ensure consistent content-addressable identification of spells across the application, particularly for imports, exports, and synchronization. By adhering to this contract, identical spell definitions from different sources will yield the same hash.

## Canonicalization Rules

1.  **Schema Compliance**: The JSON object MUST conform to `spell.schema.json`.
2.  **Field Subset**: The canonical JSON MUST include ONLY the content fields defined below.
    *   **Excluded from Hash (Metadata)**:
        -   `id` (the hash itself)
        -   `artifacts` (provenance metadata)
        -   `created_at`, `updated_at` (temporal metadata)
        -   `source_refs` (bibliographic provenance - order may vary without affecting spell content)
        -   `edition`, `author`, `version`, `license` (publishing metadata)
    *   **Included in Hash (Content)**:
        -   All game-mechanical fields: `name`, `tradition`, `school`, `sphere`, `level`, `range`, `components`, `material_components`, `casting_time`, `duration`, `area`, `damage`, `saving_throw`, `reversible`, `description`
        -   Taxonomic fields: `class_list`, `tags`, `subschools`, `descriptors`
        -   Special flags: `is_quest_spell`, `is_cantrip`
3.  **Key Sorting**: Object keys MUST be sorted lexicographically (A-Z) recursively (at every depth).
4.  **Array Sorting**: Arrays that represent unordered sets MUST be sorted lexicographically by value.
    *   **Sorted Fields**: `class_list`, `tags`, `subschools`, `descriptors` (if `tradition=DIVINE` or `BOTH`, `spheres` would also be sorted, but schema has singular `sphere`).
5.  **Whitespace**: The serialization MUST NOT contain any whitespace (no spaces after colons or commas, no newlines).
6.  **Null Values**: Fields with `null` values MUST be OMITTED from the serialization.
7.  **Default Values**: Fields with default values (e.g., `reversible: 0`, `is_cantrip: 0`) MUST be INCLUDED in the canonical representation if explicitly set, even if they match the default.
8.  **Encoding**: UTF-8.

> **Rationale for excluding `source_refs`**: Two spells with identical mechanical content but different citation ordering (e.g., imported from different sources in different order) should produce the same hash. Source references are provenance metadata, not spell content. Users can update citations without creating a new spell version.

## Hashing Algorithm

*   **Algorithm**: SHA-256.
*   **Input**: The canonical JSON string bytes.
*   **Output**: Hexadecimal string (lowercase).

## Example

**Rust Struct:**
```rust
SpellDetail {
    name: "Fireball".to_string(),
    level: 3,
    description: "Boom".to_string(),
    school: Some("Evocation".to_string()),
    tradition: "ARCANE".to_string(),
    source_refs: vec![...],  // Excluded from hash
    edition: Some("2e".to_string()),  // Excluded from hash
    ...
}
```

**Canonical JSON (Formatted for reading - actual has no whitespace):**
```json
{
  "description": "Boom",
  "is_cantrip": 0,
  "is_quest_spell": 0,
  "level": 3,
  "name": "Fireball",
  "school": "Evocation",
  "tradition": "ARCANE"
}
```
*Note: Metadata fields (`source_refs`, `edition`, `author`, `version`, `license`) are excluded from the canonical representation. `Option` fields that are `None` are also omitted.*

## Implementation Guidelines (Rust)

1.  **JCS**: Use the `serde_json_canonicalizer` crate.
2.  **Steps**: Convert `SpellDetail` to `serde_json::Value`, apply transformation pipeline (round numbers, NFC normalize strings, collapse spaces, sort/dedup arrays, materialize defaults), then use `serde_json_canonicalizer::to_string`.

### Verification
When importing a spell:
1.  Parse source into `SpellDetail` (ignoring ID).
2.  Generate Canonical JSON.
3.  Compute Hash.
4.  Check if Hash exists in DB (content-addressable lookup).
