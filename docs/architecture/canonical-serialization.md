# Canonical Spell Serialization Contract

To ensure that spells with identical content produce the same SHA-256 hash, we strictly follow a canonicalization process before hashing.

## 1. JSON Canonicalization Scheme (JCS)
We use [RFC 8785 (JSON Canonicalization Scheme)](https://tools.ietf.org/html/rfc8785) as the baseline.
- **Object Keys**: Sorted lexicographical order (code unit order).
- **Whitespace**: No whitespace between keys, colons, values, or separators.
- **Strings**: UTF-8, strictly escaped according to JCS.
- **Implementation**: `serde_json_canonicalizer` is used for RFC 8785 compliance.

## 2. Application-Level Normalization
Before JCS processing, the `CanonicalSpell` object undergoes the following normalization:

### 2.1 Arrays as Sets (Sorted and Deduplicated)
Fields representing unordered sets have their elements sorted lexicographically and deduplicated:
- `class_list`: Sorted (A-Z), deduplicated.
- `tags`: Sorted (A-Z), deduplicated.
- `subschools`: Normalized for casing (e.g. schema-case/title-style) then sorted and deduplicated for hash stability.
- `descriptors`: Normalized for casing (e.g. schema-case/title-style) then sorted and deduplicated for hash stability.

**Important Exceptions (Order Preserved):**
- `material_components`: Order is preserved **as listed in the source text**. Two spells with components in different orders produce different hashes. This is intentional for simplicity. Duplicate components are kept as separate entries.
- `damage.parts` with `combine_mode: "sequence"`: Order is preserved (sequential application order).
- `saving_throw.multiple`: Order is preserved (sequential saves).

### 2.2 Nulls vs Omitted
- **Omitted (skip_serializing_if)**: Optional fields (like `range`, `school`, `sphere`, etc.) are **omitted** from the JSON if they are `None`. This is the preferred standard over literal `null` values for better forward compatibility.

### 2.3 Metadata Exclusion

The following fields are **excluded from the canonical hash** but preserved for storage and export:

| Field | Scope | Notes |
|-------|-------|-------|
| `id` | Root only | The spell's unique identifier |
| `source_refs` | All depths | Source book references |
| `version` | Root only | Content version (e.g., "1.0.0") |
| `edition` | Root only | Game edition |
| `author` | Root only | Content author |
| `license` | Root only | License information |
| `schema_version` | Root only | Schema version number |
| `created_at` | Root only | Temporal metadata |
| `updated_at` | Root only | Temporal metadata |
| `artifacts` | All depths | Attached artifacts |
| `source_text` | All depths | Original source text |

> **Note:** Nested `id` fields (e.g., in `DamagePart`, `SingleSave`) are **preserved** because they are mechanical identifiers.

### 2.4 Integers for Booleans
To maintain compatibility with the canonical resource specification, boolean flags are normalized to integers:
- `is_cantrip`: `0` (false) or `1` (true).
- `is_quest_spell`: `0` (false) or `1` (true).
- `reversible`: `0` (false) or `1` (true).

### 2.5 Default Materialization
To ensure spells hash consistently regardless of whether defaults were explicitly set, the following defaults are **materialized** during normalization:

| Field | Default Value | Notes |
|-------|---------------|-------|
| `reversible` | `0` | Boolean as integer |
| `material_components` | *(see Lean Hashing)* | Empty arrays omitted |
| `components.*` | `false` | All component flags |
| `casting_time.unit` | `"segment"` | If unit unspecified |
| `schema_version` | `1` | If `0` |
| `scalar.value` | `0` | When `mode="per_level"` and omitted |
| `MaterialComponentSpec.quantity` | `1.0` | If omitted |
| `MaterialComponentSpec.is_consumed` | `false` | If omitted |

> **Precedence**: Defaults are materialized **first**, then Lean Hashing (§2.8) removes fields that equal their default values or are empty collections.
> **ExperienceComponentSpec**: The spec is pruned when it is mechanically default (e.g. `kind: none`). `source_text` is metadata (excluded from hash) and is **not** used for default detection, so a spell with only `source_text` set still hashes the same as one with no experience cost.

### 2.6 Hashing Casing Standard
**All fields in the `CanonicalSpell` object MUST use `snake_case`.** This is a deliberate choice to ensure interoperability with the official JSON Schema and to distinguish between high-integrity content (snake_case) and transient IPC data (camelCase).

### 2.7 Floating Point Precision
All floating point values are clamped to 6 decimal places to ensure consistent hashing across platforms:
```rust
fn clamp_precision(val: f64) -> f64 {
    (val * 1_000_000.0).round() / 1_000_000.0
}
```

### 2.7.1 DiceTerm and integer bounds
For canonical form, `DiceTerm` values in damage (and scaling) are normalized: `count` is clamped to ≥ 0 and `sides` to ≥ 1, matching schema constraints. Negative or zero sides from source data are clamped rather than rejected at deserialization.

### 2.8 Lean Hashing (Optional Fields & Empty Collections)
To ensure hash stability as the schema evolves, optional fields that are empty or equal to their default values are **omitted** from the canonical JSON:
- Empty arrays (`[]`) are removed
- Empty strings (`""`) are removed
- Empty objects (`{}`) are removed
- Null values are removed
- **Optional fields** equal to their materialized defaults (from §2.5) are removed (e.g., `reversible: 0` is omitted).

> [!IMPORTANT]
> **Required Fields are NEVER pruned.** Fields marked as `required` in `spell.schema.json` must always be present in the hash, even if they equal a default value (e.g., `components.verbal: false`). This ensures that the resulting JSON always remains valid against the schema.
> **Key Root Required Fields:** `name`, `tradition`, `level`, `description`. Optional but often present: `is_cantrip`, `is_quest_spell` (omitted when 0 per Lean Hashing).

**Execution Order**: Default materialization (§2.5) runs **before** Lean Hashing, so an optional field explicitly set to its default value will be omitted.

### 2.9 Tradition Validation
The `tradition` field enforces strict logical dependencies:

| Tradition | Required Fields |
|-----------|----------------|
| `ARCANE` | `school` must be non-null |
| `DIVINE` | `sphere` must be non-null |
| `BOTH` | Both `school` AND `sphere` must be non-null |

Validation fails if these requirements are not met.

### 2.9.1 Prohibited Fields for Hashing

During normalization, tradition-inconsistent fields are **cleared** before serialization so they never appear in the canonical JSON used for the hash:

- For `tradition = "ARCANE"`: `sphere` must be omitted (cleared if present).
- For `tradition = "DIVINE"`: `school` must be omitted (cleared if present).
- For `tradition = "BOTH"`: both `school` and `sphere` are included.

This ensures the content hash is identical whether or not the source had the other tradition's field set.

### 2.10 Unit-Based Identity & Alias Normalization
Units are **never converted** during canonicalization (e.g., "10 yd" and "30 ft" are distinct). However, unit **aliases** in structured text fields (like `RangeSpec.text`) are normalized to canonical forms for hash stability. Replacement is **word-boundary aware** (e.g. "10 yards" → "10 yd", "backyard" unchanged):
- `yards`, `yard`, `yd.` -> `yd`
- `feet`, `foot`, `ft.` -> `ft`
- `miles`, `mile`, `mi.` -> `mi`
- `inches`, `inch`, `in.` -> `inch`

### 2.11 Mixed-Unit Range Fallback
Variable ranges with distinct units (e.g., "1 yd + 1 ft/level") cannot be modeled as `kind="distance"` without lossy conversion. Instead, they fallback to:
```json
{
  "kind": "special",
  "text": "1 yd + 1 ft/level"
}
```

## 3. String Normalization Modes

Different fields use different normalization modes based on their semantic purpose:

| Mode | Behavior | Used For |
|------|----------|----------|
| `Structured` | NFC, trim, collapse all whitespace to single spaces | `name`, `tradition`, field names |
| `LowercaseStructured` | Structured + lowercase | IDs, keys for comparison |
| `Textual` | NFC, trim horizontal whitespace, preserve distinct lines | `description`, `notes`, free text |
| `Exact` | NFC and trim only, no whitespace collapsing | Mathematical formulas |

### Text Field Normalization Mode Mapping

The following table shows which normalization mode applies to specific text fields:

| Field | Normalization Mode | Rationale |
|-------|-------------------|----------|
| `name` | `Structured` | Spell name should collapse whitespace |
| `description` | `Textual` | Preserve paragraph breaks |
| **RangeSpec** |  |  |
| `RangeSpec.text` | LowercaseStructured + unit alias normalization (word boundaries) | Collapse whitespace, lowercase, then unit aliases with word boundaries |
| `RangeSpec.notes` | `Textual` | Allow multi-line clarifications |
| **AreaSpec** |  |  |
| `AreaSpec.notes` | `Textual` | Allow multi-line clarifications |
| **DurationSpec** |  |  |
| `DurationSpec.condition` | `Structured` | Condition text should collapse whitespace |
| `DurationSpec.notes` | `Textual` | Allow multi-line clarifications |
| **MaterialComponentSpec** |  |  |
| `MaterialComponentSpec.name` | `Structured` | Component name should collapse whitespace |
| `MaterialComponentSpec.unit` | `Structured` | Unit names should collapse whitespace |
| `MaterialComponentSpec.description` | `Textual` | Allow multi-line component details |
| **SavingThrowSpec** |  |  |
| `SavingThrowSpec.notes` | `Textual` | Allow multi-line clarifications |
| `SavingThrowSpec.dm_guidance` | `Textual` | Allow multi-line DM guidance |
| `SingleSave.id` | `LowercaseStructured` | IDs for lookup/comparison |
| `SaveOutcomeEffect.notes` | `Textual` | Allow multi-line clarifications |
| **SpellCastingTime** |  |  |
| `SpellCastingTime.text` | `Structured` | Collapse whitespace in time text |
| **MagicResistanceSpec** |  |  |
| `MagicResistanceSpec.notes` | `Textual` | Allow multi-line clarifications |
| `MagicResistanceSpec.special_rule` | `Textual` | Allow multi-line special rules |
| `MrPartialSpec.part_ids` | `LowercaseStructured` | IDs for comparison |
| **ExperienceComponentSpec** |  |  |
| `ExperienceComponentSpec.notes` | `Textual` | Allow multi-line clarifications |
| `ExperienceComponentSpec.dm_guidance` | `Textual` | Allow multi-line DM guidance |
| `ExperienceComponentSpec.source_text` | `Textual` | Preserve source formatting |
| `ExperienceFormula.expr` | `Exact` | Preserve mathematical formulas exactly |
| `FormulaVar.name` | LowercaseStructured + spaces to underscores (schema pattern `^[a-z][a-z0-9_]{0,31}$`) | Variable names for hash/validation |
| `FormulaVar.label` | `Textual` | Allow multi-line variable labels |
| `PerUnitXp.unit_label` | `Textual` | Allow multi-line unit labels |
| `TieredXp.when` | `Structured` | Condition text should collapse whitespace |
| `TieredXp.notes` | `Textual` | Allow multi-line clarifications |
| **SpellDamageSpec** |  |  |
| `SpellDamageSpec.notes` | `Textual` | Allow multi-line clarifications |
| `SpellDamageSpec.dm_guidance` | `Textual` | Allow multi-line DM guidance |
| `DamagePart.id` | `LowercaseStructured` | IDs for lookup/comparison |
| `DamagePart.label` | `Textual` | Allow multi-line labels |
| `DamagePart.notes` | `Textual` | Allow multi-line clarifications |
| `ScalingRule.notes` | `Textual` | Allow multi-line clarifications |

### Unicode Normalization (NFC)
All strings undergo Unicode NFC normalization to ensure canonical representation of combining characters.

### Line Ending Normalization
All line endings (`\r\n` and `\r`) are normalized to `\n`.

## 4. Hashing Process
1. Clone and normalize the `CanonicalSpell` object.
2. Validate against `spell.schema.json`.
3. Serialize to `serde_json::Value`.
4. Recursively prune metadata fields.
5. Apply JCS serialization to UTF-8 bytes.
6. Compute SHA-256 hash of the bytes.
7. Encode hash as a lowercase hex string (64 characters).

### 4.1 Validation runs on full JSON
`validate()` is run on the full spell JSON (including metadata). Therefore, invalid metadata (e.g. `id` or `version` format) can cause `compute_hash()` to fail even though those fields are excluded from the hash.

```rust
pub fn compute_hash(&self) -> Result<String, String> {
    let mut normalized_clone = self.clone();
    normalized_clone.normalize();
    normalized_clone.validate()?;

    // Internal path: no second normalize; uses pre-normalized serialization.
    let canonical_json = normalized_clone.to_canonical_json_pre_normalized()?;
    let mut hasher = Sha256::new();
    hasher.update(canonical_json.as_bytes());
    let result = hasher.finalize();
    Ok(hex::encode(result))
}
```

## 5. Enum Case Normalization
Enum values are normalized to their canonical schema-defined form. The system uses a **unified case-insensitive matching strategy** to ensure that variations in input casing (e.g., `"BONUS ACTION"`) are mapped to the canonical `snake_case` or `Title Case` required by the schema.

### 5.0 Unified Normalization Strategy
All enums at all depths of the `CanonicalSpell` object undergo normalization in the `normalize()` phase:
1. **Case-Insensitive Match**: The input string is compared against the valid enum variants defined in `spell.schema.json`.
2. **Canonical Remapping**: If a match is found, the value is replaced with the exact string required by the schema.
3. **Fallback**: If no match is found, the value is preserved but undergoes `Title Case` transformation (for schools/subschools) or `snake_case` transformation (for technical keys).

### 5.1 Duration Units
| Input Examples | Canonical Output |
|----------------|------------------|
| `"segment"`, `"segments"` | `"segment"` |
| `"round"`, `"rounds"` | `"round"` |
| `"turn"`, `"turns"` | `"turn"` |
| `"minute"`, `"minutes"`, `"min"` | `"minute"` |
| `"hour"`, `"hours"`, `"hr"` | `"hour"` |
| `"day"`, `"days"` | `"day"` |
| `"week"`, `"weeks"` | `"week"` |
| `"month"`, `"months"` | `"month"` |
| `"year"`, `"years"` | `"year"` |

### 5.2 Range and Area Units
| Input Examples | Canonical Output |
|----------------|------------------|
| `"in"`, `"inch"`, `"inches"`, `"\""` | `"inch"` |
| `" ft"`, `"foot"`, `"feet"`, `"'"` | `"ft"` |
| `"yd"`, `"yard"`, `"yards"` | `"yd"` |
| `"mi"`, `"mile"`, `"miles"` | `"mi"` |

### 5.3 Other Enums
| Input Examples | Canonical Output | Applies To |
|----------------|------------------|------------|
| `"bonus action"`, `"bonus actions"` | `"bonus_action"` | Casting time unit, etc. |
| `"instant"`, `"instantaneous"` | `"instantaneous"` | Casting time **unit** (`SpellCastingTime.unit`) |
| `"instant"`, `"instantaneous"` | `"instant"` | Duration **kind** (`DurationSpec.kind`); schema uses `"instant"` |
| `"conjuration/summoning"` | `"Conjuration/Summoning"` | School/subschool |
| `"mind-affecting"` | `"Mind-Affecting"` | Descriptors |

For unrecognized values, simple title case is applied. Note: duration kind and casting time unit use different canonical forms—`DurationSpec.kind` is `"instant"`; casting time unit is `"instantaneous"`.

## 6. Canonical Serialization Examples

The following examples show how structured specs are serialized in canonical JSON format.

### SpellScalar Structure

The `SpellScalar` type is used throughout for numerical values that may scale with caster level:

```json
{
  "mode": "fixed",
  "value": 10
}
```

```json
{
  "mode": "per_level",
  "per_level": 1.0,
  "value": 0,
  "cap_value": 10,
  "min_level": 1,
  "rounding": "floor"
}
```

### RangeSpec Example

**Kind: Distance**
```json
{
  "kind": "distance",
  "distance": {
    "mode": "fixed",
    "value": 10
  },
  "unit": "yd",
  "text": "10 yards"
}
```

**Kind: Touch**
```json
{
  "kind": "touch",
  "text": "touch"
}
```

### AreaSpec Example

**Kind: RadiusCircle**
```json
{
  "kind": "radius_circle",
  "radius": {
    "mode": "fixed",
    "value": 20
  },
  "shape_unit": "ft"
}
```

**Kind: Cone**
```json
{
  "kind": "cone",
  "length": {
    "mode": "fixed",
    "value": 30
  },
  "shape_unit": "ft"
}
```

### DurationSpec Example

**Kind: Time (Per Level)**
```json
{
  "kind": "time",
  "unit": "round",
  "duration": {
    "mode": "per_level",
    "per_level": 1.0
  }
}
```

**Kind: Permanent**
```json
{
  "kind": "permanent"
}
```

### SpellDamageSpec Example

```json
{
  "kind": "modeled",
  "combine_mode": "sum",
  "parts": [
    {
      "id": "fire_burst",
      "damage_type": "fire",
      "base": {
        "terms": [{"count": 1, "sides": 6, "per_die_modifier": 0}],
        "flat_modifier": 0
      },
      "application": {
        "scope": "per_target",
        "ticks": 1,
        "tick_driver": "fixed"
      },
      "save": {
        "kind": "half"
      },
      "mr_interaction": "normal"
    }
  ]
}
```

### MaterialComponentSpec Example

```json
[
  {
    "name": "powdered diamond",
    "quantity": 1.0,
    "gp_value": 100.0,
    "is_consumed": true
  },
  {
    "name": "holy symbol",
    "quantity": 1.0,
    "is_consumed": false
  }
]
```

> **Note:** Material components are NOT sorted—their order is preserved as listed.

### Complete Spell Hashing Example

**Before Hashing** (with metadata):
```json
{
  "id": "abc123...",
  "name": "Magic Missile",
  "level": 1,
  "tradition": "ARCANE",
  "school": "Evocation",
  "range": {
    "kind": "distance",
    "distance": {"mode": "fixed", "value": 60},
    "unit": "ft"
  },
  "source_refs": [{"book": "PHB", "page": 172}],
  "version": "1.0.0",
  "schema_version": 1,
  "created_at": "2026-01-01T00:00:00Z"
}
```

**After Metadata Pruning** (for hashing):
```json
{
  "level": 1,
  "name": "Magic Missile",
  "range": {
    "distance": {"mode": "fixed", "value": 60},
    "kind": "distance",
    "unit": "ft"
  },
  "school": "Evocation",
  "tradition": "ARCANE"
}
```

**After JCS Serialization** (compact, sorted):
```
{"level":1,"name":"Magic Missile","range":{"distance":{"mode":"fixed","value":60},"kind":"distance","unit":"ft"},"school":"Evocation","tradition":"ARCANE"}
```

**Content Hash** (SHA-256):
```
a1b2c3d4e5f6...
```

> [!NOTE]
> Notice that:
> - Metadata fields (`id`, `source_refs`, `version`, `schema_version`, `created_at`) are removed
> - Object keys are sorted lexicographically (including nested objects)
> - All whitespace is removed
> - Field names use `snake_case` (not `camelCase`)

## 7. CanonicalSpell Field Inventory

### Core Fields (Always Hashed)
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `name` | string | Yes | Spell name |
| `tradition` | string | Yes | ARCANE, DIVINE, or BOTH |
| `level` | integer | Yes | Spell level |
| `description` | string | Yes | Full description text |
| `is_cantrip` | integer | Yes | 0 or 1 |
| `is_quest_spell` | integer | Yes | 0 or 1 |

### Classification Fields (Hashed if Present)
| Field | Type | Notes |
|-------|------|-------|
| `school` | string | Arcane school |
| `sphere` | string | Divine sphere |
| `subschools` | string[] | Casing normalized, then sorted, deduplicated |
| `descriptors` | string[] | Casing normalized, then sorted, deduplicated |
| `class_list` | string[] | Sorted, deduplicated |
| `tags` | string[] | Sorted, deduplicated |

### Mechanical Fields (Hashed if Present)
| Field | Type | Notes |
|-------|------|-------|
| `range` | RangeSpec | See RangeSpec schema |
| `area` | AreaSpec | See AreaSpec schema |
| `duration` | DurationSpec | See DurationSpec schema |
| `casting_time` | SpellCastingTime | Time to cast |
| `components` | SpellComponents | V, S, M, F, DF, XP flags |
| `material_components` | MaterialComponentSpec[] | Order preserved |
| `damage` | SpellDamageSpec | See SpellDamageSpec schema |
| `saving_throw` | SavingThrowSpec | See SavingThrowSpec schema |
| `magic_resistance` | MagicResistanceSpec | MR interaction |
| `experience_cost` | ExperienceComponentSpec | XP cost details |
| `reversible` | integer | 0 or 1 |

### Metadata Fields (Excluded from Hash)
| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Unique identifier |
| `source_refs` | SourceRef[] | Book/page references |
| `edition` | string | Game edition |
| `author` | string | Content author |
| `version` | string | Content version |
| `license` | string | License type |
| `schema_version` | integer | Schema version |
| `created_at` | string | ISO 8601 timestamp |
| `updated_at` | string | ISO 8601 timestamp |
| `artifacts` | object | Attached files/data |

## 8. Implementation Reference

The canonical serialization is implemented in (paths from repository root):
- `apps/desktop/src-tauri/src/models/canonical_spell.rs` - Core CanonicalSpell type and hashing
- `apps/desktop/src-tauri/src/models/*.rs` - Spec types (range, area, duration, damage, etc.)
- `apps/desktop/src-tauri/schemas/spell.schema.json` - JSON Schema for validation

Key functions:
- `CanonicalSpell::normalize()` - Applies all normalization rules (order documented at top of `normalize()`)
- `CanonicalSpell::to_canonical_json()` - Public API: clones, normalizes, then produces canonical JSON (does **not** run schema validation)
- `CanonicalSpell::to_canonical_json_pre_normalized()` - Internal: produces canonical JSON from an already-normalized instance (used by `compute_hash()` to avoid double normalization)
- `CanonicalSpell::compute_hash()` - Validates against schema, then produces canonical JSON and returns SHA-256 hex string
- `prune_metadata_recursive()` - Removes metadata fields and empty objects from JSON value (after recursing into children)

> **Validation and canonical output:** `to_canonical_json()` does **not** run schema validation. For schema-compliant canonical output, callers must either call `validate()` before `to_canonical_json()`, or use `compute_hash()`, which validates first and then produces the canonical JSON internally. Using `to_canonical_json()` alone can yield JSON that does not conform to `spell.schema.json`.

---

*Last Updated: 2026-02-07*
