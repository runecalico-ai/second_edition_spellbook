
# AD&D 2nd Edition – ResolvedRangeSpec (Normalized, Snapshot-Ready)

This document defines **ResolvedRangeSpec**, a snapshot-ready variant of `RangeSpec`
intended for **ResolvedSpell / ResolvedSpellsetSnapshot** outputs.

Key property: **no formulas**. Anything expressed as *per level* (or otherwise variable)
must be **evaluated** at snapshot time and stored as a **fixed value**.

---

## 1. Core Enums

### 1.1 DistanceUnit

```json
["ft", "yd", "mi"]
```

### 1.2 RangeKind

```json
[
  "personal",
  "touch",
  "distance",
  "distance_los",
  "distance_loe",
  "los",
  "loe",
  "sight",
  "hearing",
  "voice",
  "senses",
  "same_room",
  "same_structure",
  "same_dungeon_level",
  "wilderness",
  "same_plane",
  "interplanar",
  "anywhere_on_plane",
  "domain",
  "unlimited",
  "special"
]
```

---

## 2. Resolved Scalar

Resolved scalars are **fixed-only**.

```json
{ "value": 60 }
```

---

## 3. JSON Schema (draft 2020-12)

Save as: `schemas/common/resolved-range-spec.schema.json` (recommended)

```json
{
  "$id": "https://example.invalid/schemas/common/resolved-range-spec.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ResolvedRangeSpec",
  "type": "object",
  "additionalProperties": false,
  "required": ["kind"],
  "properties": {
    "kind": {
      "type": "string",
      "enum": [
        "personal",
        "touch",
        "distance",
        "distance_los",
        "distance_loe",
        "los",
        "loe",
        "sight",
        "hearing",
        "voice",
        "senses",
        "same_room",
        "same_structure",
        "same_dungeon_level",
        "wilderness",
        "same_plane",
        "interplanar",
        "anywhere_on_plane",
        "domain",
        "unlimited",
        "special"
      ]
    },

    "unit": {
      "type": "string",
      "enum": ["ft", "yd", "mi"],
      "description": "Linear unit for numeric ranges."
    },

    "distance": { "$ref": "#/$defs/resolvedScalar" },

    "requires": {
      "type": "array",
      "items": { "type": "string", "enum": ["los", "loe"] },
      "uniqueItems": true,
      "description": "Hard constraints applied to the resolved range."
    },

    "region_unit": {
      "type": "string",
      "enum": ["structure", "region", "domain", "demiplane", "plane"],
      "description": "Optional qualifier when kind implies a regional scope."
    },

    "notes": { "type": "string" }
  },

  "allOf": [
    {
      "if": { "properties": { "kind": { "enum": ["distance", "distance_los", "distance_loe"] } }, "required": ["kind"] },
      "then": { "required": ["distance", "unit"] }
    },
    {
      "if": { "properties": { "kind": { "enum": ["personal", "touch", "los", "loe", "unlimited"] } }, "required": ["kind"] },
      "then": {
        "not": {
          "anyOf": [
            { "required": ["distance"] },
            { "required": ["unit"] }
          ]
        }
      }
    }
  ],

  "$defs": {
    "resolvedScalar": {
      "type": "object",
      "additionalProperties": false,
      "required": ["value"],
      "properties": {
        "value": { "type": "number", "minimum": 0 }
      }
    }
  }
}
```

---

## 4. Examples

### Distance (resolved)

```json
{
  "kind": "distance",
  "unit": "yd",
  "distance": { "value": 60 }
}
```

### Distance + LOS (resolved)

```json
{
  "kind": "distance_los",
  "unit": "ft",
  "distance": { "value": 90 },
  "requires": ["los"]
}
```

### Touch

```json
{ "kind": "touch" }
```

---

End of document.
