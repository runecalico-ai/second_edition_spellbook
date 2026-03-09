# Parser Specification: Legacy Data Migration

## Overview
This document defines the parsing logic needed to migrate existing spell data from string-based fields to the structured format required by `spell.schema.json`.

---

## Components Parser

### Input Format
Legacy: `Option<String>` (e.g., `"V, S, M"`, `"V, S"`, `"V"`)

### Output Format
Structured: `{verbal: bool, somatic: bool, material: bool}`

### Parsing Rules
1. Split string by comma and/or whitespace
2. Trim each component
3. Match case-insensitive:
   - `"V"` or `"Verbal"` → `verbal: true`
   - `"S"` or `"Somatic"` → `somatic: true`
   - `"M"` or `"Material"` → `material: true`
4. Default: All false if string is empty or null

### Examples
```rust
"V, S, M"      → {verbal: true, somatic: true, material: true}
"V, S"         → {verbal: true, somatic: true, material: false}
"V"            → {verbal: true, somatic: false, material: false}
"Verbal, Material" → {verbal: true, somatic: false, material: true}
null           → {verbal: false, somatic: false, material: false}
""             → {verbal: false, somatic: false, material: false}
```

### Edge Cases
- `"V,S,M"` (no spaces) → Parse correctly
- `"v, s, m"` (lowercase) → Parse correctly (case-insensitive)
- `"VSM"` (no delimiters) → Parse as individual chars (V, S, M all true)
- `"Unknown"` → Log warning, default to all false

---

## Range/Duration/Area/CastingTime Parser

### Input Format
Legacy: `Option<String>` (e.g., `"10 yards"`, `"Touch"`, `"1 round/level"`)

### Output Format
Structured object with:
- `text: String` (display text, preserved from original or computed)
- `unit: String` (enum value from schema)
- `base_value: number` (fixed amount)
- `per_level: number` (scaling amount)
- `level_divisor: number` (default 1)

### Parsing Strategy
Use regex patterns to extract components:

#### Pattern 1: Fixed Value Only
```regex
^(\d+(?:\.\d+)?)\s*(\w+)$
```
Examples:
- `"10 yards"` → `{text: "10 yards", base_value: 10, per_level: 0, unit: "Yards"}`
- `"3"` → `{text: "3", base_value: 3, per_level: 0, unit: "Segment"}` (assume default unit based on field type)

#### Pattern 2: Variable Scaling
```regex
^(\d+(?:\.\d+)?)\s*\+\s*(\d+(?:\.\d+)?)\s*/\s*level\s*(\w+)?$
```
Examples:
- `"10 + 5/level yards"` → `{text: "10 + 5/level yards", base_value: 10, per_level: 5, unit: "Yards"}`
- `"1d6 + 1d6/level"` → (see Damage parser)

#### Pattern 3: Per N Levels
```regex
^(\d+(?:\.\d+)?)\s*/\s*(\d+)\s*levels?\s*(\w+)?$
```
Examples:
- `"1 round / 2 levels"` → `{base_value: 0, per_level: 1, level_divisor: 2, unit: "Round"}`

#### Pattern 4: Special Keywords
Examples:
- `"Touch"` → `{text: "Touch", base_value: 0, per_level: 0, unit: "Touch"}`
- `"Unlimited"` → `{text: "Unlimited", base_value: 0, per_level: 0, unit: "Unlimited"}`
- `"Instantaneous"` → `{text: "Instantaneous", base_value: 0, per_level: 0, unit: "Instantaneous"}`
- `"Permanent"` → `{text: "Permanent", base_value: 0, per_level: 0, unit: "Permanent"}`

### Unit Mapping
Map extracted unit strings to schema enums:

**Range Units:**
- `yard, yards, yd` → `"Yards"`
- `foot, feet, ft` → `"Feet"`
- `mile, miles, mi` → `"Miles"`
- `touch` → `"Touch"`
- `sight` → `"Sight"`
- `unlimited, infinite` → `"Unlimited"`
- `special` → `"Special"`

**Duration Units:**
- `round, rounds, rd` → `"Round"`
- `turn, turns` → `"Turn"`
- `hour, hours, hr` → `"Hour"`
- `day, days` → `"Day"`
- `week, weeks` → `"Week"`
- `month, months` → `"Month"`
- `year, years` → `"Year"`
- `permanent` → `"Permanent"`
- `instantaneous, instant` → `"Instantaneous"`
- `special` → `"Special"`

**Casting Time Units:**
- `segment, segments, seg` → `"Segment"`
- `round, rounds, rd` → `"Round"`
- `turn, turns` → `"Turn"`
- `hour, hours, hr` → `"Hour"`
- `instantaneous, instant` → `"Instantaneous"`
- `special` → `"Special"`

**Area Units:**
- `sq ft, square feet` → `"Square Feet"`
- `cu ft, cubic feet` → `"Cubic Feet"`
- `sq yd, square yards` → `"Square Yards"`
- `cu yd, cubic yards` → `"Cubic Yards"`
- `ft radius, foot radius` → `"Foot Radius"`
- `yd radius, yard radius` → `"Yard Radius"`
- `mi radius, mile radius` → `"Mile Radius"`
- `ft cube, foot cube` → `"Foot Cube"`
- `yd cube, yard cube` → `"Yard Cube"`
- `creature, creatures` → `"Creature(s)"`
- `path` → `"Path"`
- `special` → `"Special"`
- `none` → `"None"`

### Fallback
If no pattern matches:
```rust
{
    text: original_string,
    unit: "Special",  // or field-appropriate default
    base_value: 0,
    per_level: 0,
    level_divisor: 1
}
```

---

## Damage Parser

### Input Format
Legacy: `Option<String>` (e.g., `"1d6/level"`, `"1d6/level (max 10d6)"`, `"2d4+1"`)

### Output Format
```json
{
  "text": "display string",
  "base_dice": "XdY",
  "per_level_dice": "XdY",
  "level_divisor": 1,
  "cap_level": null
}
```

### Dice Notation Grammar
```
dice_expr := [count]?d[sides][modifier]?
count     := \d+
sides     := \d+
modifier  := [+\-]\d+
```

Examples:
- `1d6` → 1 die with 6 sides
- `d8` → 1 die with 8 sides (implicit count=1)
- `2d4+1` → 2 dice with 4 sides, +1 modifier
- `3d6-2` → 3 dice with 6 sides, -2 modifier

### Parsing Patterns

#### Pattern 1: Fixed Damage Only
```regex
^(\d+d\d+(?:[+\-]\d+)?)$
```
Examples:
- `"1d6"` → `{text: "1d6", base_dice: "1d6", per_level_dice: "0"}`
- `"2d4+1"` → `{text: "2d4+1", base_dice: "2d4+1", per_level_dice: "0"}`

#### Pattern 2: Scaling Damage
```regex
^(?:(\d+d\d+)\s*\+\s*)?(\d+d\d+)\s*/\s*level$
```
Examples:
- `"1d6/level"` → `{text: "1d6/level", base_dice: "0", per_level_dice: "1d6"}`
- `"1d8 + 1d6/level"` → `{text: "1d8 + 1d6/level", base_dice: "1d8", per_level_dice: "1d6"}`

#### Pattern 3: Capped Scaling
```regex
^(\d+d\d+)\s*/\s*level\s*\(max\s*(\d+)d\d+\)$
```
Examples:
- `"1d6/level (max 10d6)"` → `{base_dice: "0", per_level_dice: "1d6", cap_level: 10}`

#### Pattern 4: Per N Levels
```regex
^(\d+d\d+)\s*per\s*(\d+)\s*levels?$
```
Examples:
- `"1d6 per 2 levels"` → `{per_level_dice: "1d6", level_divisor: 2}`

### Validation
After parsing, validate dice notation:
- Die sides must be standard: 2, 3, 4, 6, 8, 10, 12, 20, 100
- Count must be positive (≥ 1)
- Modifier must be integer

Invalid examples:
- `"1d7"` → Invalid (7 is not standard die)
- `"0d6"` → Invalid (count must be ≥ 1)
- `"-2d6"` → Invalid (negative count)

### Fallback
If parsing fails or validation fails:
```rust
{
    text: original_string,
    base_dice: "0",
    per_level_dice: "0",
    level_divisor: 1,
    cap_level: null
}
```
Log warning: `"Unable to parse damage: {original_string}"`

---

## Error Handling

### Logging
All parsing failures MUST be logged with:
- Spell name/ID
- Field name
- Original value
- Reason for failure

Example log:
```
WARN: Failed to parse range for spell "Fireball" (id=123): "Special (see description)" - no pattern matched, using fallback
```

### Migration Report
Generate summary after migration:
```
Spell Field Migration Report
=============================
Total spells processed: 1,542

Range field:
  - Successfully parsed: 1,450 (94.0%)
  - Fallback used: 92 (6.0%)

Duration field:
  - Successfully parsed: 1,500 (97.3%)
  - Fallback used: 42 (2.7%)

Components field:
  - Successfully parsed: 1,542 (100%)
  - Fallback used: 0 (0%)

Damage field:
  - Successfully parsed: 856 (55.5%)
  - Fallback used: 40 (2.6%)
  - Not applicable (no damage): 646 (41.9%)

See migration.log for details.
```

---

## Implementation Checklist

- [ ] Implement `parse_components(string) -> Components` in Rust
- [ ] Implement `parse_metric_field(string, field_type) -> StructuredField` (for range/duration/area/casting_time)
- [ ] Implement `parse_damage(string) -> Damage`
- [ ] Implement `validate_dice_notation(string) -> Result<(), Error>`
- [ ] Add unit tests for all parsers with edge cases
- [ ] Add logging for all parsing failures
- [ ] Implement migration report generator
- [ ] Test on sample dataset (100+ spells) before full migration
