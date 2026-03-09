
# AD&D 2nd Edition – Unified TargetingSpec (Folded Range + Area + Target)

This document updates/extends the Unified TargetingSpec so that it **explicitly**
folds in:

- `RangeSpec`
- `AreaSpec`
- Target selection & eligibility constraints

It also provides a **ResolvedTargetingSpec** schema for deterministic snapshots.

---

## 1. Authoring-Time TargetingSpec (JSON Schema, draft 2020-12)

Save as: `schemas/common/targeting-spec.schema.json` (recommended)

```json
{
  "$id": "https://example.invalid/schemas/common/targeting-spec.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TargetingSpec",
  "type": "object",
  "additionalProperties": false,
  "required": ["range", "target_mode"],
  "properties": {
    "range": { "$ref": "./range-spec.schema.json" },

    "target_mode": {
      "type": "string",
      "enum": ["self", "creature", "creatures", "object", "objects", "point", "area", "special"]
    },

    "area": { "$ref": "./area-spec.schema.json" },

    "quantity": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind"],
      "properties": {
        "kind": { "type": "string", "enum": ["exact", "up_to", "per_level", "special"] },
        "value": { "type": "number", "minimum": 0 },
        "per_level": { "type": "number", "minimum": 0 },
        "cap_value": { "type": "number", "minimum": 0 },
        "notes": { "type": "string" }
      },
      "allOf": [
        {
          "if": { "properties": { "kind": { "enum": ["exact", "up_to"] } }, "required": ["kind"] },
          "then": { "required": ["value"] }
        },
        {
          "if": { "properties": { "kind": { "const": "per_level" } }, "required": ["kind"] },
          "then": { "required": ["per_level"] }
        }
      ]
    },

    "disposition": {
      "type": "string",
      "enum": ["any", "willing", "unwilling", "hostile", "ally", "enemy"]
    },

    "types": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "living",
          "undead",
          "construct",
          "outsider",
          "humanoid",
          "animal",
          "plant",
          "object",
          "structure",
          "spirit",
          "incorporeal",
          "special"
        ]
      },
      "uniqueItems": true
    },

    "requires": {
      "type": "array",
      "items": { "type": "string", "enum": ["los", "loe"] },
      "uniqueItems": true
    },

    "notes": { "type": "string" }
  },

  "allOf": [
    {
      "if": { "properties": { "target_mode": { "const": "self" } }, "required": ["target_mode"] },
      "then": {
        "properties": { "range": { "properties": { "kind": { "const": "personal" } } } }
      }
    },
    {
      "if": { "properties": { "target_mode": { "const": "area" } }, "required": ["target_mode"] },
      "then": { "required": ["area"] }
    },
    {
      "if": { "properties": { "target_mode": { "const": "point" } }, "required": ["target_mode"] },
      "then": { "required": ["area"] }
    },
    {
      "if": { "properties": { "target_mode": { "enum": ["creature", "creatures", "object", "objects"] } }, "required": ["target_mode"] },
      "then": {
        "not": {
          "anyOf": [
            { "required": ["area"] }
          ]
        }
      }
    }
  ]
}
```

---

## 2. ResolvedTargetingSpec (Snapshot Schema)

Save as: `schemas/common/resolved-targeting-spec.schema.json` (recommended)

Characteristics:
- `range` is `ResolvedRangeSpec` (fixed-only)
- `area` is `ResolvedAreaSpec` (fixed-only)
- `quantity.per_level` has been evaluated to fixed `value`
- No authoring-time formulas remain

```json
{
  "$id": "https://example.invalid/schemas/common/resolved-targeting-spec.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ResolvedTargetingSpec",
  "type": "object",
  "additionalProperties": false,
  "required": ["range", "target_mode"],
  "properties": {
    "range": { "$ref": "./resolved-range-spec.schema.json" },

    "target_mode": {
      "type": "string",
      "enum": ["self", "creature", "creatures", "object", "objects", "point", "area", "special"]
    },

    "area": { "$ref": "./resolved-area-spec.schema.json" },

    "quantity": {
      "type": "object",
      "additionalProperties": false,
      "required": ["kind"],
      "properties": {
        "kind": { "type": "string", "enum": ["exact", "up_to", "special"] },
        "value": { "type": "number", "minimum": 0 },
        "notes": { "type": "string" }
      },
      "allOf": [
        {
          "if": { "properties": { "kind": { "enum": ["exact", "up_to"] } }, "required": ["kind"] },
          "then": { "required": ["value"] }
        }
      ]
    },

    "disposition": {
      "type": "string",
      "enum": ["any", "willing", "unwilling", "hostile", "ally", "enemy"]
    },

    "types": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": [
          "living",
          "undead",
          "construct",
          "outsider",
          "humanoid",
          "animal",
          "plant",
          "object",
          "structure",
          "spirit",
          "incorporeal",
          "special"
        ]
      },
      "uniqueItems": true
    },

    "requires": {
      "type": "array",
      "items": { "type": "string", "enum": ["los", "loe"] },
      "uniqueItems": true
    },

    "notes": { "type": "string" }
  },

  "allOf": [
    {
      "if": { "properties": { "target_mode": { "const": "area" } }, "required": ["target_mode"] },
      "then": { "required": ["area"] }
    },
    {
      "if": { "properties": { "target_mode": { "const": "point" } }, "required": ["target_mode"] },
      "then": { "required": ["area"] }
    },
    {
      "if": { "properties": { "target_mode": { "enum": ["creature", "creatures", "object", "objects"] } }, "required": ["target_mode"] },
      "then": {
        "not": {
          "anyOf": [
            { "required": ["area"] }
          ]
        }
      }
    }
  ]
}
```

---

End of document.
