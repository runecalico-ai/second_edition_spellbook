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
    -   **Normalize Enums**: Convert all enum values (units, schools, etc.) to match the EXACT casing and spelling defined in the schema.
    -   **Limit Precision** for all `number` fields to 6 decimal places.
4.  **Collection Logic**: Deduplicate and sort all unordered arrays (`tags`, etc.).
5.  **Tradition-Consistent Fields**: Clear tradition-inconsistent fields so they are never included in the hash: for `tradition = "ARCANE"`, clear `sphere`; for `tradition = "DIVINE"`, clear `school`; for `tradition = "BOTH"`, keep both. This ensures the content hash is stable regardless of whether the source had the other tradition's field set.
6.  **Prune (Lean Hashing)**: Omit all fields with `null` values, empty collections (`[]`), or **empty objects (`{}`)** that are optional in the schema. This ensures hash stability as the schema adds new optional properties over time.
7.  **Serialize**: Generate the byte stream following **RFC 8785 (JCS)**.

## Canonicalization Rules

1.  **Schema Compliance**: The JSON object MUST conform to `spell.schema.json`.
2.  **Field Subset**: The canonical JSON MUST include ONLY the content fields defined below.
    *   **Excluded from Hash (Metadata)**:
        -   `id` (the hash itself)
        -   `artifacts` (provenance metadata)
        -   `created_at`, `updated_at` (temporal metadata)
        -   `source_refs`, `source_text` (provenance/original text - order/formatting may vary)
        -   `edition`, `author`, `version`, `license` (publishing metadata)
        -   `schema_version` (internal validation metadata)
    *   **Included in Hash (Content)**:
        -   **Required Fields**: `name`, `tradition`, `level`, `description`
        -   **Conditional Required**: `school` (Arcane/Both), `sphere` (Divine/Both)
        -   **Optional Mechanical Specs**: `range`, `components`, `material_components`, `casting_time`, `duration`, `area`, `damage`, `saving_throw`, `magic_resistance`, `experience_cost`, `reversible`, `is_quest_spell`, `is_cantrip`
        -   **Taxonomic fields**: `class_list`, `tags`, `subschools`, `descriptors`
3.  **Physical Serialization (JCS)**: Follow **RFC 8785**. This handles key sorting, whitespace removal, escaping, and number formatting deterministically.
4.  **Array Normalization & Deduplication**: Unordered sets MUST be deduplicated and then sorted lexicographically. For `subschools` and `descriptors`, elements are normalized for casing (e.g. schema-case/title-style) before sort/dedup for hash stability.
    *   **Applied Fields**: `class_list`, `tags`, `subschools`, `descriptors`.
5.  **Sequenced Arrays**: Arrays representing ordered execution blocks MUST preserve their original order. They MUST NOT be sorted.
    *   **Applied Fields**: `saving_throw.multiple`, `damage.parts` (when `combine_mode = "sequence"`).
    *   **Conditional Sorting for Damage Parts**: The `damage.parts` array sorting behavior depends on `damage.combine_mode`:
        -   **`sum`, `max`, `choose_one`**: Parts are sorted lexicographically by `id` to ensure order-independent hashing.
        -   **`sequence`**: Parts preserve their original array order, as sequence implies ordered execution.
6.  **Lean Hashing (Omission)**: To ensure future-proof stability, all `null` values, empty strings, empty collections (`[]`), and empty objects (`{}`) MUST be OMITTED from the canonical representation if they match the schema's default/optional behavior.
    *   **Exclusion of Required Fields**: Fields marked as `required` in `spell.schema.json` MUST ALWAYS be included in the hash, even if they equal a default value (e.g., `components.verbal: false`). Pruning ONLY applies to optional fields or fields where the schema provides a default but doesn't require presence.
    *   **Empty objects**: Keys whose value is an empty object (`{}`) are omitted; pruning runs after recursing into children so nested empty objects are removed first.

7.  **Enum & Unit Normalization (Unified Strategy)**: All enum values MUST match the exact casing and spelling defined in `spell.schema.json`.
    *   **Robust Matching**: To accommodate varied source data, the system uses a case-insensitive matching strategy with support for legacy variants (e.g., `Title Case`, `SCREAMING_SNAKE_CASE`).
    *   **Canonical Remapping**: Regardless of the input format, matched values are replaced with the EXACT string defined in the schema (standardized to `lowercase_singular_snake_case`).
    *   **Applied Fields & Categories**:
        | Category | Key Fields |
        |----------|------------|
        | **Foundational** | `tradition`, `school`, `sphere` |
        | **Specification Types** | `RangeSpec.kind`, `DurationSpec.kind`, `AreaSpec.kind`, `SavingThrowSpec.kind`, `MagicResistanceKind`, `ExperienceKind` |
        | **Units** | `*.unit`, `*.shape_unit`, `*.tile_unit`, `*.unit_kind` |
        | **Mechanic Modes** | `ScalarMode`, `RoundingMode`, `DamageCombineMode`, `DamageKind`, `MrInteraction` |
        | **Behaviors** | `PaymentTiming`, `PaymentSemantics`, `Recoverability`, `MrAppliesTo`, `MrPartialScope`, `AreaSpec.moves_with` |
        | **Subjects** | `AreaSpec.count_subject`, `AreaSpec.region_unit`, `AreaSpec.scope_unit` |
    *   **Fallback**: Unrecognized values are preserved but undergo `snake_case` transformation for technical keys or `Title Case` for taxonomic fields (like `school`).

8.  **String Normalization**:
    *   **Unicode**: MUST be normalized to **NFC (Normalization Form C)**.
    *   **Whitespace Trimming**: Leading and trailing whitespace MUST be trimmed.
    *   **Normalization Modes** (per-field mapping):
        | Field | Mode | Description |
        |-------|------|-------------|
        | `name`, `tradition`, `school`, `sphere` | `Structured` | Collapse all whitespace |
        | `description` | `Textual` | Preserve paragraph breaks |
        | `RangeSpec.text` | LowercaseStructured + unit alias normalization (word boundaries) | Collapse whitespace, lowercase, then unit aliases with word boundaries (e.g. "10 yards" → "10 yd"; "backyard" unchanged) |
        | `DurationSpec.condition`, `TieredXp.when`, `SpellCastingTime.text` | `Structured` | Collapse all whitespace |
        | `FormulaVar.name` | LowercaseStructured + spaces to underscores (schema pattern `^[a-z][a-z0-9_]{0,31}$`) | Variable names for hash/validation |
        | `*.notes`, `*.dm_guidance`, `*.description`, `*.special_rule`, `*.label`, `*.unit_label`, `*.source_text` | `Textual` | Preserve paragraph breaks |
        | `SingleSave.id`, `DamagePart.id`, `MrPartialSpec.part_ids` | `LowercaseStructured` | Lowercase + collapse |
        | `ExperienceFormula.expr` | `Exact` | Trim only, preserve formulas |
        | `MaterialComponentSpec.name`, `MaterialComponentSpec.unit` | `Structured` | Collapse all whitespace |
9.  **Unit Preservation**: While automatic scaling between units (e.g., "10 yards" to "30 feet") is prohibited to preserve semantic intent, the **formatting** (casing/pluralization) of the unit label MUST be standardized to match the schema.
10. **Decimal Precision**: Limit all `number` fields to a maximum of 6 decimal places. NaN/Infinity are prohibited.
11. **Materialize Defaults**: Any mechanical field missing in the source but having a mandatory default in the current schema MUST be populated before pruning.

## Hashing Algorithm

*   **Algorithm**: SHA-256.
*   **Input**: The canonical JSON string bytes.
*   **Output**: Hexadecimal string (64 characters, lowercase).

## Example (Gold Standard)

**Canonical JCS Object (Pretty-printed for readability):**
```json
{
  "area": {
    "kind": "radius_circle",
    "radius": {
      "mode": "fixed",
      "value": 20
    },
    "shape_unit": "ft",
    "unit": "ft"
  },
  "casting_time": {
    "text": "1",
    "unit": "segment"
  },
  "components": {
    "divine_focus": false,
    "experience": false,
    "focus": false,
    "material": false,
    "somatic": true,
    "verbal": true
  },
  "damage": {
    "combine_mode": "sum",
    "kind": "modeled",
    "parts": [
      {
        "application": {
          "scope": "per_target",
          "tick_driver": "fixed",
          "ticks": 1
        },
        "base": {
          "flat_modifier": 0,
          "terms": [
            {
              "count": 1,
              "per_die_modifier": 0,
              "sides": 6
            }
          ]
        },
        "damage_type": "fire",
        "id": "main",
        "mr_interaction": "normal",
        "save": {
          "kind": "half"
        }
      }
    ]
  },
  "description": "Explosion.\nLine two.",
  "duration": {
    "unit": "round"
  },
  "level": 3,
  "name": "Fireball",
  "range": {
    "distance": {
      "mode": "per_level",
      "per_level": 10,
      "value": 10
    },
    "kind": "distance",
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

1.  **JCS**: Use the `serde_json_canonicalizer` crate.
2.  **Steps**: Convert `SpellDetail` to `serde_json::Value`, apply transformation pipeline (round numbers, NFC normalize strings, collapse spaces, sort/dedup arrays, materialize defaults), then use `serde_json_canonicalizer::to_string`.
