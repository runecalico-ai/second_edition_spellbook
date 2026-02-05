# Capability: Spell Core

## ADDED Requirements

### Requirement: Canonical Schema Compliance
All spells processed by the backend MUST support mapping to the Strict Spell Schema.

#### Scenario: Schema Mapping
- GIVEN a `SpellDetail` model
- WHEN converted to `CanonicalSpell`
- THEN it MUST conform to `spell.schema.json` structure.

#### Scenario: Complex Area Parsing
- GIVEN a spell with area text "20 ft. radius"
- WHEN converted to `CanonicalSpell`
- THEN it MUST be structured as an `AreaSpec` object with `kind="radius_circle"`
- AND `radius` MUST be `{"mode": "fixed", "value": 20}`.

#### Scenario: Complex Range Parsing
- GIVEN a spell with range text "100 ft + 10 ft/level"
- WHEN converted to `CanonicalSpell`
- THEN it MUST be structured as a `RangeSpec` object with `kind="distance"`
- AND `distance` scalar MUST be `{"mode": "per_level", "value": 100, "per_level": 10}`
- AND `unit` MUST be `"ft"` (normalized).

> [!NOTE]
> **Mixed-Unit Fallback**: To preserve "Unit-Based Identity" without lossy or "absurd" numerical conversions (e.g., "1 yd + 1 ft/level"), variable ranges with distinct units MUST NOT be modeled as `kind="distance"`. Instead, they MUST fallback to `kind="special"` with normalized `text` preservation.

#### Scenario: Complex Duration Parsing
- GIVEN a spell with duration text "1 round / level"
- WHEN converted to `CanonicalSpell`
- THEN it MUST be structured as a `DurationSpec` object with `kind="time"`
- AND `duration` scalar MUST be `{"mode": "per_level", "value": 0, "per_level": 1}`
- AND `unit` MUST be `"round"` (normalized).

### Requirement: Advanced Attribute Modeling
The backend MUST support high-fidelity modeling of advanced spell attributes including experience costs, multi-part damage, magic resistance, and complex saving throws.

#### Scenario: Multi-Part Damage Modeling
- GIVEN a spell that deals both Fire and Cold damage
- WHEN converted to `CanonicalSpell`
- THEN the `damage` field MUST be an object of `kind="modeled"`
- AND `parts` MUST contain separate entries for each damage type with their respective scaling and saves.

#### Scenario: Experience Cost Modeling
- GIVEN a spell with an experience cost (e.g., *Restoration*)
- WHEN converted to `CanonicalSpell`
- THEN the `components` structure MUST contain the `experience` boolean flag set to true
- AND the `experience_cost` field MUST follow the `ExperienceComponentSpec`
- AND correctly identify the `payer`, `amount_xp` (if fixed), or `formula`.

#### Scenario: Magic Resistance Normalization
- GIVEN a spell with Magic Resistance interaction
- WHEN converted to `CanonicalSpell`
- THEN the `magic_resistance` field MUST be structured according to `MagicResistanceSpec`
- AND identify if the spell `ignores_mr`, is `partial`, or follows `normal` rules.

#### Scenario: Complex Saving Throw Sequencing
- GIVEN a spell requiring multiple saves (e.g. *Prismatic Spray* sub-effects)
- WHEN converted to `CanonicalSpell`
- THEN the `saving_throw` field MUST follow `SavingThrowSpec`
- AND correctly sequence `multiple` saves if required
- AND the order of the `multiple` saves MUST be preserved (NOT sorted).

#### Scenario: Valued Material Component Modeling
- GIVEN a spell with a valued material (e.g. "diamond dust worth 100 gp")
- WHEN converted to `CanonicalSpell`
- THEN the `material_components` MUST follow `MaterialComponentSpec`
- AND correctly identify the `gp_value` and whether it `is_consumed`.

### Requirement: Deterministic Identity
A spell's identity MUST be defined by the SHA-256 hash of its canonical JSON representation.

#### Scenario: Hashing Consistency
- GIVEN two spell objects with identical semantic content
- BUT different key ordering
- WHEN hashed
- THEN they MUST produce the exact same SHA-256 hash.
-
- #### Scenario: Unit-Based Identity
- - GIVEN two spells with equivalent physical distances (e.g., "10 yd" vs "30 ft")
- - WHEN converted to `CanonicalSpell` and hashed
- - THEN they MUST produce **different** SHA-256 hashes (preserving unit distinction).

#### Scenario: Array Normalization
- GIVEN unordered metadata (e.g. `tags = ["Fire", "Fire", "Damage"]`)
- WHEN hashed
- THEN they MUST be deduplicated and sorted (Result: `["Damage", "Fire"]`)
- AND produce a predictable hash.

#### Scenario: Unicode NFC Normalization
- GIVEN strings with equivalent Unicode representations (e.g. "Fiancé" in NFC vs NFD)
- WHEN hashed
- THEN they MUST be normalized to NFC
- AND produce the exact same hash.

#### Scenario: Floating Point Precision
- GIVEN `number` fields with infinitesimal noise (e.g. `1.0000001` vs `1.0000004`)
- WHEN hashed
- THEN they MUST be rounded/truncated to 6 decimal places
- AND produce the exact same hash.

#### Scenario: Enum Normalization
- GIVEN enum fields with loose casing (e.g. `tradition = "arcane"`)
- WHEN hashed
- THEN they MUST be normalized to the exact schema casing (Result: `"ARCANE"`)
- AND produce a predictable hash.

#### Scenario: Empty Collection Stability
- GIVEN a spell with an empty array (e.g. `tags = []`)
- WHEN hashed
- THEN the canonical JSON MUST include the literal `[]`
- AND produce a predictable hash.

#### Scenario: Semantic Whitespace Collapse
- GIVEN short text fields with redundant internal whitespace (e.g. `range.text = "10  yards"`)
- WHEN hashed
- THEN multiple internal spaces MUST be collapsed to a single space (Result: `"10 yards"`)
- AND produce the exact same hash.
-
- #### Scenario: Narrative Paragraph Preservation
- - GIVEN a description with multiple paragraphs separated by a blank line
- - WHEN hashed
- - THEN the canonical JSON MUST preserve the line break (normalized to `\n`)
- - BUT MUST NOT collapse the entire description into a single line.

### Requirement: Tradition-Specific Integrity
The backend MUST enforce strict logical dependencies between traditions and metadata fields.

#### Scenario: "BOTH" Tradition Validation
- GIVEN a spell with `tradition = "BOTH"`
- WHEN validated
- THEN both `school` AND `sphere` MUST be non-null and valid.

### Requirement: Metadata Isolation
Internal record metadata MUST NOT influence the content-addressed identity.

#### Scenario: Metadata Exclusion
- GIVEN a spell record
- WHEN `schema_version` or `source_refs` are updated
- THEN the `id` (content hash) MUST NOT change.
