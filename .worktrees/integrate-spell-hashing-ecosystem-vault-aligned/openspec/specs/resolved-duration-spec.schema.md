
# AD&D 2nd Edition – ResolvedDurationSpec (Normalized, Snapshot-Ready)

This document defines **ResolvedDurationSpec**, a snapshot-ready variant of `DurationSpec`
intended for **ResolvedSpell / ResolvedSpellsetSnapshot** outputs.

Key property: **no formulas**. Anything that was expressed as *per level* (or otherwise variable)
must be **evaluated** at snapshot time and stored as a **fixed value**.

This mirrors the “resolved” philosophy you described for deterministic hashing across runtimes.

---

## 1. Core Enums

### 1.1 DurationUnit

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

## 2. Resolved Scalar

Resolved scalars are **fixed-only**.

```json
{ "value": 10 }
```

- `value` is a non-negative number (or integer, if you choose stricter typing per-field).
- No `mode`, no `per_level`, no caps, no rounding—those belong only in authoring-time specs.

---

## 3. JSON Schema (draft 2020-12)

Save as: `schemas/common/resolved-duration-spec.schema.json` (recommended)

```json
{
  "$id": "https://example.invalid/schemas/common/resolved-duration-spec.schema.json",
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "ResolvedDurationSpec",
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

    "duration": { "$ref": "#/$defs/resolvedScalar" },

    "condition": {
      "type": "string",
      "description": "Narrative or rules condition that ends the duration (resolved text, not a formula)."
    },

    "uses": { "$ref": "#/$defs/resolvedScalar" },

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
            { "required": ["duration"] },
            { "required": ["uses"] }
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
    },
    {
      "if": { "properties": { "kind": { "enum": ["until_dispelled"] } }, "required": ["kind"] },
      "then": {
        "not": {
          "anyOf": [
            { "required": ["unit"] },
            { "required": ["duration"] }
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

### Instantaneous

```json
{ "kind": "instant" }
```

### Fixed time

```json
{
  "kind": "time",
  "unit": "round",
  "duration": { "value": 10 }
}
```

### Concentration + condition detail

```json
{
  "kind": "concentration",
  "condition": "ends when caster stops concentrating"
}
```

### Usage-limited

```json
{
  "kind": "usage_limited",
  "uses": { "value": 3 },
  "notes": "discharged after 3 successful strikes"
}
```

---

End of document.
