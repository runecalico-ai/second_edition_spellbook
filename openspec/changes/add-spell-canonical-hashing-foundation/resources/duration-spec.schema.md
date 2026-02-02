
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
  "description": "Authoring-time duration specification for AD&D 2E spells. Allows per-level formulas and conditional durations.",
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
      "enum": [
        "segment",
        "round",
        "turn",
        "minute",
        "hour",
        "day",
        "week",
        "month",
        "year"
      ],
      "description": "Time unit used when kind = time."
    },

    "duration": {
      "$ref": "#/$defs/scalar",
      "description": "Primary duration scalar (fixed or per-level)."
    },

    "condition": {
      "type": "string",
      "description": "Narrative or rules-based condition that ends the duration."
    },

    "uses": {
      "$ref": "#/$defs/scalar",
      "description": "Number of uses, strikes, discharges, or activations before expiration."
    },

    "notes": {
      "type": "string",
      "description": "Freeform clarification; must not contain mechanical formulas."
    }
  },

  "allOf": [
    {
      "if": {
        "properties": { "kind": { "const": "time" } },
        "required": ["kind"]
      },
      "then": {
        "required": ["unit", "duration"]
      }
    },
    {
      "if": {
        "properties": {
          "kind": {
            "enum": ["instant", "permanent"]
          }
        },
        "required": ["kind"]
      },
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
      "if": {
        "properties": {
          "kind": {
            "enum": ["conditional", "until_triggered", "planar"]
          }
        },
        "required": ["kind"]
      },
      "then": {
        "required": ["condition"]
      }
    },
    {
      "if": {
        "properties": { "kind": { "const": "usage_limited" } },
        "required": ["kind"]
      },
      "then": {
        "required": ["uses"]
      }
    },
    {
      "if": {
        "properties": { "kind": { "const": "until_dispelled" } },
        "required": ["kind"]
      },
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
    "scalar": {
      "type": "object",
      "additionalProperties": false,
      "required": ["mode"],
      "properties": {
        "mode": {
          "type": "string",
          "enum": ["fixed", "per_level"]
        },

        "value": {
          "type": "number",
          "minimum": 0,
          "description": "Fixed duration value."
        },

        "per_level": {
          "type": "number",
          "minimum": 0,
          "description": "Amount added per caster level."
        },

        "min_level": {
          "type": "integer",
          "minimum": 1,
          "description": "Optional minimum level for scaling."
        },

        "max_level": {
          "type": "integer",
          "minimum": 1,
          "description": "Optional maximum level for scaling."
        },

        "cap_value": {
          "type": "number",
          "minimum": 0,
          "description": "Maximum duration after scaling."
        },

        "rounding": {
          "type": "string",
          "enum": ["none", "floor", "ceil", "nearest"],
          "description": "Optional rounding rule after scaling."
        }
      },
      "allOf": [
        {
          "if": {
            "properties": { "mode": { "const": "fixed" } },
            "required": ["mode"]
          },
          "then": {
            "required": ["value"]
          }
        },
        {
          "if": {
            "properties": { "mode": { "const": "per_level" } },
            "required": ["mode"]
          },
          "then": {
            "required": ["per_level"]
          }
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
