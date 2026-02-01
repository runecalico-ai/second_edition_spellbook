# Canonical JSON Serializer + Hashing Contract

## Purpose
To ensure consistent content-addressable identification of spells across the application, particularly for imports, exports, and synchronization. By adhering to this contract, identical spell definitions from different sources will yield the same hash.

## Normalization Pipeline
To ensure bit-for-bit identity, the following steps MUST be performed in order:

1.  **Materialize**: Convert the source record to conform to the **latest supported `spell.schema.json` version**. Any fields defined in the schema with a `default` value that are missing from the source MUST be populated with that default.
2.  **Filter**: Remove all fields listed in the "Excluded from Hash" set (Rule 2).
3.  **Sanitize**:
    -   **NFC Normalize** all strings.
    -   **Trim** all strings (leading/trailing).
    -   **Collapse Spaces** in "Short Text" fields.
    -   **Normalize Enums** to match schema casing.
    -   **Limit Precision** for all `number` fields to 6 decimal places.
4.  **Collection Logic**: Deduplicate and sort all unordered arrays (`tags`, etc.).
5.  **Prune**: Remove all fields with `null` values (unless they are required by the schema).
6.  **Serialize**: Generate the byte stream following **RFC 8785 (JCS)**.

## Canonicalization Rules

1.  **Schema Compliance**: The JSON object MUST conform to `spell.schema.json`.
2.  **Field Subset**: The canonical JSON MUST include ONLY the content fields defined below.
    *   **Excluded from Hash (Metadata)**:
        -   `id` (the hash itself)
        -   `artifacts` (provenance metadata)
        -   `created_at`, `updated_at` (temporal metadata)
        -   `source_refs` (bibliographic provenance - order may vary without affecting spell content)
        -   `edition`, `author`, `version`, `license` (publishing metadata)
        -   `schema_version` (internal validation metadata)
    *   **Included in Hash (Content)**:
        -   All game-mechanical fields: `name`, `tradition`, `school`, `sphere`, `level`, `range`, `components`, `material_components`, `casting_time`, `duration`, `area`, `damage`, `saving_throw`, `reversible`, `description`
        -   Taxonomic fields: `class_list`, `tags`, `subschools`, `descriptors`
        -   Special flags: `is_quest_spell`, `is_cantrip`
3.  **Physical Serialization (JCS)**: Follow **RFC 8785**. This handles key sorting, whitespace removal, escaping, and number formatting deterministically.
4.  **Array Normalization & Deduplication**: Unordered sets MUST be deduplicated and then sorted lexicographically.
    *   **Applied Fields**: `class_list`, `tags`, `subschools`, `descriptors`.
5.  **Empty Collections**: Collections that default to `[]` in the schema MUST be included as literal `[]`. They MUST NOT be omitted or set to `null`.
6.  **Null Values**: Fields with `null` values MUST be OMITTED from the serialization **UNLESS they are required by the schema**. If a field is required but `null`, it must be present as `"key": null` (though schema typically prohibits this for mechanical content).
7.  **Enum Normalization**: All enum values MUST match the exact casing and spelling defined in `spell.schema.json`.
8.  **String Normalization**:
    *   **Unicode**: MUST be normalized to **NFC (Normalization Form C)**.
    *   **Whitespace Trimming**: Leading and trailing whitespace MUST be trimmed.
    *   **Internal Whitespace (Short Text)**: For mechanical text fields (e.g. `range.text`, `duration.text`), multiple internal spaces MUST be collapsed into a single space.
    *   **Internal Whitespace (Descriptions)**: Longer text fields MUST preserve structure, using `\n` for line endings.
9.  **Decimal Precision**: Limit all `number` fields to a maximum of 6 decimal places. NaN/Infinity are prohibited.
10. **Materialize Defaults**: Any mechanical field missing in the source but having a `default` in the current schema MUST be included using that default value.

## Hashing Algorithm

*   **Algorithm**: SHA-256.
*   **Input**: The canonical JSON string bytes.
*   **Output**: Hexadecimal string (64 characters, lowercase).

## Schema Compatibility Contract

1.  **Current Version**: Records matching `CURRENT_SCHEMA_VERSION` are processed normally.
2.  **Older Versions**: MUST be migrated (materialized) to the current schema before hashing.
3.  **Newer Versions (Compatible)**: If `schema_version` > `CURRENT_SCHEMA_VERSION` but the object validates against the current schema, the record MAY be processed but a warning SHOULD be logged.
4.  **Newer Versions (Incompatible)**: If validation fails, the record MUST be rejected.

## Example (Gold Standard)

**Canonical JSON (Actual stream has NO whitespace):**
```json
{
  "area": {
    "base_value": 0,
    "level_divisor": 1,
    "per_level": 0,
    "text": "Special",
    "unit": "Special"
  },
  "casting_time": {
    "base_value": 1,
    "level_divisor": 1,
    "per_level": 0,
    "text": "1",
    "unit": "Segment"
  },
  "class_list": [],
  "components": {
    "material": false,
    "somatic": true,
    "verbal": true
  },
  "damage": {
    "base_dice": "1d6",
    "level_divisor": 1,
    "per_level_dice": "1d6",
    "text": "1d6/level"
  },
  "description": "Explosion.\nLine two.",
  "duration": {
    "base_value": 0,
    "level_divisor": 1,
    "per_level": 1,
    "text": "1 round/level",
    "unit": "Round"
  },
  "is_cantrip": 0,
  "is_quest_spell": 0,
  "level": 3,
  "name": "Fireball",
  "range": {
    "base_value": 10,
    "level_divisor": 1,
    "per_level": 10,
    "text": "10 yards + 10 yards/level",
    "unit": "Yards"
  },
  "school": "Evocation",
  "tags": [
    "Damage",
    "Fire"
  ],
  "tradition": "ARCANE"
}
```

## Implementation Guidelines (Rust)

1.  **JCS**: Use the `serde_jcs` crate.
2.  **Steps**: Convert `SpellDetail` to `serde_json::Value`, apply transformation pipeline (round numbers, NFC normalize strings, collapse spaces, sort/dedup arrays, materialize defaults), then use `serde_jcs::to_string`.
