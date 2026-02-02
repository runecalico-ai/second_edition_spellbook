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
    -   **Collapse Spaces**:
        -   **Structured Mode**: Collapses all internal whitespace AND newlines into single spaces (Game-mechanical fields).
        -   **Textual Mode**: Collapses internal horizontal whitespace but preserves newlines (Narrative fields).
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
    *   **Structured Normalization**: For game-mechanical strings (e.g., `name`, `tradition`, `school`, `sphere`, `saving_throw`, `casting_time.text`, and `damage.text`), all internal whitespace AND newlines MUST be collapsed into a single space.
    *   **Textual Normalization**: For narrative strings (e.g., `description`, `material_components`, and all `.notes` or `.condition` fields in `area`, `range`, `duration`), multiple internal spaces MUST be collapsed, but distinct paragraphs (split by one or more empty lines) MUST be preserved as a single `\n` separator. Line endings MUST be normalized to `\n` (LFs).
11. **Unit Preservation**: All game-mechanical units (e.g., `ft`, `yd`, `mi`, `inches`, `round`, `turn`) MUST be preserved exactly as presented in the record. No automatic conversion or scaling between units (e.g., converting "10 yards" to "30 feet") SHALL be performed during canonicalization. This preserves the semantic intent and mechanical distinction defined by the game system.
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
    "kind": "radius_circle",
    "notes": null,
    "radius": {
      "cap_level": null,
      "cap_value": null,
      "max_level": null,
      "min_level": null,
      "mode": "fixed",
      "per_level": null,
      "rounding": null,
      "value": 20
    },
    "scalar": null,
    "shape_unit": null,
    "unit": "ft"
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
    "condition": null,
    "duration": {
      "cap_level": null,
      "cap_value": null,
      "max_level": null,
      "min_level": null,
      "mode": "per_level",
      "per_level": 1,
      "rounding": null,
      "value": 0
    },
    "kind": "time",
    "notes": null,
    "unit": "round",
    "uses": null
  },
  "is_cantrip": 0,
  "is_quest_spell": 0,
  "level": 3,
  "name": "Fireball",
  "range": {
    "anchor": null,
    "distance": {
      "cap_level": null,
      "cap_value": null,
      "max_level": null,
      "min_level": null,
      "mode": "per_level",
      "per_level": 10,
      "rounding": null,
      "value": 10
    },
    "kind": "distance",
    "notes": null,
    "region_unit": null,
    "requires": null,
    "unit": "yd"
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
