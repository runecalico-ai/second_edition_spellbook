
# AD&D 2nd Edition – Normalized DurationSpec Enum & Parameter Schema

This document defines a **canonical, normalized DurationSpec** suitable for use in
spell schemas, validators, and resolved spellset snapshots. It mirrors `AreaSpec`
and `RangeSpec` in structure and scalar behavior.

---

## 1. Core Enums

### 1.1 DurationUnit (time-based)

```json
["segment", "round", "turn", "minute", "hour", "day", "week", "month", "year"]
```

### 1.2 DurationKind

```json
[
  "instant",
  "time",
  "concentration",
  "conditional",
  "permanent",
  "until_dispelled",
  "until_triggered",
  "usage_limited",
  "planar",
  "special"
]
```

---

## 2. Scalar Model

Same scalar model as AreaSpec and RangeSpec:

- fixed
- per_level
- optional caps
- rounding rules

---

## 3. JSON Schema (draft 2020-12)

```json
{
  "$id": "https://example.invalid/schemas/common/duration-spec.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "DurationSpec",
  "type": "object",
  "additionalProperties": false,
  "required": ["kind"],
  "properties": {
    "kind": {
      "type": "string",
      "enum": [
        "instant",
        "time",
        "concentration",
        "conditional",
        "permanent",
        "until_dispelled",
        "until_triggered",
        "usage_limited",
        "planar",
        "special"
      ]
    },

    "unit": {
      "type": "string",
      "enum": ["segment", "round", "turn", "minute", "hour", "day", "week", "month", "year"]
    },

    "duration": { "$ref": "#/$defs/scalar" },

    "condition": {
      "type": "string",
      "description": "Narrative or rules condition that ends the duration."
    },

    "uses": { "$ref": "#/$defs/scalar" },

    "notes": { "type": "string" }
  },

  "allOf": [
    {
      "if": { "properties": { "kind": { "const": "time" } }, "required": ["kind"] },
      "then": { "required": ["unit", "duration"] }
    },
    {
      "if": { "properties": { "kind": { "enum": ["instant", "permanent"] } }, "required": ["kind"] },
      "then": {
        "not": {
          "anyOf": [
            { "required": ["unit"] },
            { "required": ["duration"] }
          ]
        }
      }
    },
    {
      "if": { "properties": { "kind": { "enum": ["conditional", "until_triggered", "planar"] } }, "required": ["kind"] },
      "then": { "required": ["condition"] }
    },
    {
      "if": { "properties": { "kind": { "const": "usage_limited" } }, "required": ["kind"] },
      "then": { "required": ["uses"] }
    }
  ],

  "$defs": {
    "scalar": {
      "type": "object",
      "additionalProperties": false,
      "required": ["mode"],
      "properties": {
        "mode": { "type": "string", "enum": ["fixed", "per_level"] },
        "value": { "type": "number", "minimum": 0 },
        "per_level": { "type": "number", "minimum": 0 },
        "cap_value": { "type": "number", "minimum": 0 },
        "rounding": { "type": "string", "enum": ["none", "floor", "ceil", "nearest"] }
      },
      "allOf": [
        {
          "if": { "properties": { "mode": { "const": "fixed" } } },
          "then": { "required": ["value"] }
        },
        {
          "if": { "properties": { "mode": { "const": "per_level" } } },
          "then": { "required": ["per_level"] }
        }
      ]
    }
  }
}
```

---

## 4. Canonical Notes

- All spells **must have a DurationSpec**, even Instant or Permanent.
- Resolved spell snapshots should evaluate per-level formulas into fixed values.
- Non-temporal durations are preserved via `kind` + `condition`.

---

End of document.
