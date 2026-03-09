
# AD&D 2nd Edition – Unified TargetingSpec (Authoring-Time)

This document defines a **Unified TargetingSpec** that composes:

- `RangeSpec` (how far you can target)
- `AreaSpec` (what region is affected)
- Target constraints (who/what can be targeted)

It is designed to be a single, lintable field on `Spell` objects, replacing ad-hoc
“Range/Area/Target” strings, while remaining faithful to TSR-era phrasing.

The normalized goal is: **mechanical enforcement + deterministic hashing**.

---

## 1. Conceptual Model

A spell’s targeting is:

1. **Range**: where the effect can be aimed/placed (or personal/touch/etc.)
2. **Targeting mode**: how you select the subject(s) (creature/object/point/area)
3. **Area**: the region affected (may be “none” for single-target spells)
4. **Eligibility constraints**: limitations like living-only, undead-only, willing-only, etc.
5. **Line constraints**: LOS/LOE requirements (if not already encoded in RangeSpec)

---

## 2. Core Enums

### 2.1 TargetMode

```json
["self", "creature", "creatures", "object", "objects", "point", "area", "special"]
```

### 2.2 TargetDisposition (optional)

```json
["any", "willing", "unwilling", "hostile", "ally", "enemy"]
```

### 2.3 TargetType (coarse, extensible)

```json
[
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
```

### 2.4 TargetQuantityKind

```json
["exact", "up_to", "per_level", "special"]
```

---

## 3. JSON Schema (draft 2020-12)

Save as: `schemas/common/targeting-spec.schema.json` (recommended)

Notes:
- This schema assumes `RangeSpec` and `AreaSpec` are in `schemas/common/`.
- If you keep AreaSpec embedded elsewhere, adjust the `$ref` paths.

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

    "area": {
      "description": "Optional for single-target spells; required when target_mode=area or when spell affects an area.",
      "$ref": "./area-spec.schema.json"
    },

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
      "uniqueItems": true,
      "description": "Additional targeting constraints if not captured by range.kind (e.g., spells that require both)."
    },

    "notes": { "type": "string" }
  },

  "allOf": [
    {
      "if": { "properties": { "target_mode": { "const": "self" } }, "required": ["target_mode"] },
      "then": {
        "properties": {
          "range": { "properties": { "kind": { "const": "personal" } } }
        }
      }
    },
    {
      "if": { "properties": { "target_mode": { "const": "area" } }, "required": ["target_mode"] },
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

## 4. ResolvedTargetingSpec (Snapshot Guidance)

For deterministic snapshots, define a resolved variant where:
- `range` uses `ResolvedRangeSpec`
- `area` uses `ResolvedAreaSpec` (fixed-only)
- `quantity.kind="per_level"` has been evaluated to fixed counts
- Only resolved/fixed numbers remain

You can implement this as a separate schema:
`schemas/common/resolved-targeting-spec.schema.json`

---

## 5. Example Targeting Specs

### Fireball-like (point + area)

```json
{
  "range": { "kind": "distance", "unit": "yd", "distance": { "mode": "fixed", "value": 100 } },
  "target_mode": "point",
  "area": { "kind": "radius_sphere", "shape_unit": "ft", "radius": { "mode": "fixed", "value": 20 } }
}
```

### Cure Wounds (touch creature)

```json
{
  "range": { "kind": "touch" },
  "target_mode": "creature",
  "types": ["living"],
  "disposition": "willing"
}
```

---

End of document.
