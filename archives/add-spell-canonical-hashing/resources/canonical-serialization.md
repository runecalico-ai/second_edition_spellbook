# Canonical JSON Serializer + Hashing Contract

## Purpose
To ensure consistent content-addressable identification of spells across the application, particularly for imports, exports, and synchronization. By adhering to this contract, identical spell definitions from different sources will yield the same hash.

## Canonicalization Rules

1.  **Schema Compliance**: The JSON object MUST conform to `spell.schema.json`.
2.  **Field Subset**: The canonical JSON MUST include ONLY the fields defined in `spell.schema.json`.
    *   **Excluded**: `id` (the hash itself), `artifacts` (provenance), `created_at`, `updated_at`.
3.  **Key Sorting**: Object keys MUST be sorted lexicographically (A-Z) recursively (at every depth).
4.  **Array Sorting**: Arrays that represent unordered sets MUST be sorted lexicographically by value.
    *   **Sorted Fields**: `class_list`, `tags`, `subschools`, `descriptors`, `spheres`.
    *   **Unsorted Fields**: `source_refs` (order may imply primary source vs. detail).
5.  **Whitespace**: The serialization MUST NOT contain any whitespace (no spaces after colons or commas, no newlines).
6.  **Null Values**: Fields with `null` values or missing optional objects MUST be OMITTED from the serialization strings.
7.  **Encoding**: UTF-8.

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
  "school": "Evocation"
}
```
*Note: `reversible` defaulted to 0 in schema but if it's Option and None, we skip it? stricter is better. Let's say we use `serde` defaults: `Option` fields are omitted if None.*

## Implementation Guidelines (Rust)

1.  **JCS**: Use the `serde_json_canonicalizer` crate.
2.  **Steps**: Convert `SpellDetail` to `serde_json::Value`, apply transformation pipeline (round numbers, NFC normalize strings, collapse spaces, sort/dedup arrays, materialize defaults), then use `serde_json_canonicalizer::to_string`.

### Verification
When importing a spell:
1.  Parse source into `SpellDetail` (ignoring ID).
2.  Generate Canonical JSON.
3.  Compute Hash.
4.  Check if Hash exists in DB (content-addressable lookup).
