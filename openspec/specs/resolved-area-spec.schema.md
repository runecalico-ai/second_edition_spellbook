
# AD&D 2nd Edition – ResolvedAreaSpec (Normalized, Snapshot-Ready)

This document defines **ResolvedAreaSpec**, a snapshot-ready variant of `AreaSpec`
intended for **ResolvedSpell / ResolvedSpellsetSnapshot** outputs.

Key property: **no formulas**. Anything expressed as *per level* (or otherwise variable)
must be **evaluated** at snapshot time and stored as **fixed values**.

---

## 1. Core Enums

### 1.1 AreaKind

```json
[
  "point",
  "radius_circle",
  "radius_sphere",
  "cone",
  "line",
  "rect",
  "rect_prism",
  "cylinder",
  "wall",
  "cube",
  "surface",
  "volume",
  "tiles",
  "creatures",
  "objects",
  "region",
  "scope",
  "special"
]
```

### 1.2 Units

Linear:
```json
["ft", "yd", "mi"]
```

Surface:
```json
["ft2", "yd2", "square"]
```

Volume:
```json
["ft3", "yd3"]
```

Tiles:
```json
["hex", "room", "floor", "square"]
```

---

## 2. Resolved Scalar

Resolved scalars are **fixed-only**.

```json
{ "value": 20 }
```

---

## 3. JSON Schema (draft 2020-12)

Save as: `schemas/common/resolved-area-spec.schema.json` (recommended)

```json
{
  "$id": "https://example.invalid/schemas/common/resolved-area-spec.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ResolvedAreaSpec",
  "type": "object",
  "additionalProperties": false,
  "required": ["kind"],
  "properties": {
    "kind": {
      "type": "string",
      "enum": [
        "point",
        "radius_circle",
        "radius_sphere",
        "cone",
        "line",
        "rect",
        "rect_prism",
        "cylinder",
        "wall",
        "cube",
        "surface",
        "volume",
        "tiles",
        "creatures",
        "objects",
        "region",
        "scope",
        "special"
      ]
    },

    "unit": {
      "type": "string",
      "enum": ["ft","yd","mi","ft2","yd2","square","ft3","yd3","hex","room","floor"]
    },

    "shape_unit": {
      "type": "string",
      "enum": ["ft", "yd", "mi"],
      "description": "Unit for geometric dimensions (radius/length/width/height/thickness/edge)."
    },

    "radius": { "$ref": "#/$defs/resolvedScalar" },
    "diameter": { "$ref": "#/$defs/resolvedScalar" },
    "length": { "$ref": "#/$defs/resolvedScalar" },
    "width": { "$ref": "#/$defs/resolvedScalar" },
    "height": { "$ref": "#/$defs/resolvedScalar" },
    "thickness": { "$ref": "#/$defs/resolvedScalar" },
    "edge": { "$ref": "#/$defs/resolvedScalar" },

    "angle_deg": { "type": "number", "minimum": 0, "maximum": 360 },

    "surface_area": { "$ref": "#/$defs/resolvedScalar" },
    "volume": { "$ref": "#/$defs/resolvedScalar" },

    "tile_unit": { "type": "string", "enum": ["hex","room","floor","square"] },
    "tile_count": { "$ref": "#/$defs/resolvedScalar" },

    "count": { "$ref": "#/$defs/resolvedScalar" },
    "count_subject": { "type": "string", "enum": ["creature","undead","ally","enemy","object","structure"] },

    "region_unit": {
      "type": "string",
      "enum": [
        "object","structure","building","bridge","ship","fortress",
        "clearing","grove","field","waterbody","cavesystem","valley",
        "region","domain","demiplane","plane"
      ]
    },

    "scope_unit": {
      "type": "string",
      "enum": [
        "los","loe","within_range","within_spell_range","within_sight","within_hearing",
        "aura","sanctified_ground","desecrated_ground","portfolio_defined"
      ]
    },

    "moves_with": { "type": "string", "enum": ["caster","target","object","fixed"] },

    "notes": { "type": "string" }
  },

  "allOf": [
    {
      "if": { "properties": { "kind": { "const": "radius_circle" } }, "required": ["kind"] },
      "then": { "required": ["radius", "shape_unit"] }
    },
    {
      "if": { "properties": { "kind": { "const": "radius_sphere" } }, "required": ["kind"] },
      "then": { "required": ["radius", "shape_unit"] }
    },
    {
      "if": { "properties": { "kind": { "const": "line" } }, "required": ["kind"] },
      "then": { "required": ["length", "width", "shape_unit"] }
    },
    {
      "if": { "properties": { "kind": { "const": "rect" } }, "required": ["kind"] },
      "then": { "required": ["length", "width", "shape_unit"] }
    },
    {
      "if": { "properties": { "kind": { "const": "rect_prism" } }, "required": ["kind"] },
      "then": { "required": ["length", "width", "height", "shape_unit"] }
    },
    {
      "if": { "properties": { "kind": { "const": "cylinder" } }, "required": ["kind"] },
      "then": { "required": ["radius", "height", "shape_unit"] }
    },
    {
      "if": { "properties": { "kind": { "const": "wall" } }, "required": ["kind"] },
      "then": { "required": ["length", "height", "thickness", "shape_unit"] }
    },
    {
      "if": { "properties": { "kind": { "const": "cube" } }, "required": ["kind"] },
      "then": { "required": ["edge", "shape_unit"] }
    },
    {
      "if": { "properties": { "kind": { "const": "surface" } }, "required": ["kind"] },
      "then": { "required": ["surface_area", "unit"] }
    },
    {
      "if": { "properties": { "kind": { "const": "volume" } }, "required": ["kind"] },
      "then": { "required": ["volume", "unit"] }
    },
    {
      "if": { "properties": { "kind": { "const": "tiles" } }, "required": ["kind"] },
      "then": { "required": ["tile_unit", "tile_count"] }
    },
    {
      "if": { "properties": { "kind": { "const": "creatures" } }, "required": ["kind"] },
      "then": { "required": ["count", "count_subject"] }
    },
    {
      "if": { "properties": { "kind": { "const": "objects" } }, "required": ["kind"] },
      "then": { "required": ["count", "count_subject"] }
    },
    {
      "if": { "properties": { "kind": { "const": "region" } }, "required": ["kind"] },
      "then": { "required": ["region_unit"] }
    },
    {
      "if": { "properties": { "kind": { "const": "scope" } }, "required": ["kind"] },
      "then": { "required": ["scope_unit"] }
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

End of document.
