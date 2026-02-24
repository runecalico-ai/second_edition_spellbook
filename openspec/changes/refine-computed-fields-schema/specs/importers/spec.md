## ADDED Requirements

### Requirement: Full preservation of Computed Field Legacy Text
The parsing layer MUST unconditionally save the original textual representation of computed fields to ensure an auditable ground truth for 2nd edition sources.

#### Scenario: Computed Field Parsing Success
- **WHEN** the importer successfully parses a computed field (Area, Duration, Range, Saving Throw, Casting Time) into a structured schema
- **THEN** it MUST unconditionally populate the `raw_legacy_value` property with the original source text used for the parse.

#### Scenario: Non-Hashed Legacy Text Preservation
- **WHEN** the importer processes a Magic Resistance, Experience Component, or Damage field
- **THEN** it MUST unconditionally populate the `source_text` property (not `raw_legacy_value`) with the original source text
- **AND** `source_text` is metadata excluded from the canonical hash per §2.3.

### Requirement: 2nd Edition Saving Throw Mapping
The parsing layer MUST correctly map legacy saving throw text to the two distinct `SingleSave` properties: `save_type` (the saving throw matrix *category/row*: `"paralyzation_poison_death"`, `"rod_staff_wand"`, `"petrification_polymorph"`, `"breath_weapon"`, `"spell"`, `"special"`) and `save_vs` (the *specific effect*: `"spell"`, `"poison"`, `"death_magic"`, `"polymorph"`, `"petrification"`, `"breath"`, `"weapon"`, `"other"`).

#### Scenario: Legacy Save Mapping
- **WHEN** a saving throw string contains 2nd edition specific saves like "Paralyzation, Poison, or Death Magic" or "Rod, Staff, or Wand"
- **THEN** the importer MUST map these to the `save_type` enum values `"paralyzation_poison_death"` and `"rod_staff_wand"` respectively (the saving throw matrix category)
- **AND** MUST independently determine the appropriate `save_vs` value based on context (e.g., a poison effect uses `save_vs: "poison"` with `save_type: "paralyzation_poison_death"`).
