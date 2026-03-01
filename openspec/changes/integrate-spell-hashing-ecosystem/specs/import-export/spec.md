# Capability: Import/Export

> See [design.md Decisions #3, #4](../../design.md) for full context.

## MODIFIED Requirements

### Requirement: Interchange ID
Exported spells MUST use their Content Hash as the ID.

#### Scenario: Export Transformation
- GIVEN a spell with Hash "abc"
- WHEN exported
- THEN `id` field MUST be "abc".

#### Scenario: Bundle Format Version
- GIVEN a bundle export
- WHEN exported
- THEN `schema_version` field MUST be present (required)
- AND `bundle_format_version` field MUST be present (required).

### Requirement: Conflict Resolution
Import MUST handle name collisions gracefully.

#### Scenario: Same Name, Different Hash
- GIVEN existing spell "Fireball" (Hash A)
- WHEN importing "Fireball" (Hash B)
- THEN conflict dialog MUST appear
- AND options: Keep Existing, Replace, Keep Both, Apply to All.

#### Scenario: Keep Both Collision Avoidance
- GIVEN existing spells "Fireball" and "Fireball (1)"
- WHEN importing new "Fireball" with different hash and user selects "Keep Both"
- THEN new spell MUST be named "Fireball (2)" (increment until unique).

#### Scenario: Replace with New Updates Existing Row
- GIVEN existing spell "Fireball" (Hash A, integer id 42)
- WHEN importing "Fireball" (Hash B) and user selects "Replace with New"
- THEN spell row id 42 MUST be updated with Hash B content
- AND content_hash MUST change from A to B
- AND characters referencing Hash A MUST show "Spell no longer in library".

### Requirement: Partial Import Failure Handling
Import MUST handle mixed batches where some spells are valid and others fail validation.

#### Scenario: Mixed Valid and Invalid Spells in Batch
- GIVEN a bundle containing 5 spells: 3 valid and 2 with schema errors
- WHEN importing the bundle
- THEN the 3 valid spells MUST be committed to DB
- AND the 2 invalid spells MUST be skipped
- AND import summary MUST show: 3 imported, 2 validation failures
- AND each failure MUST include spell name and error reason.

### Requirement: Metadata Merge on Deduplication
When a duplicate hash is imported, metadata MUST merge.

#### Scenario: Tag Merge
- GIVEN existing spell with tags ["fire", "damage"]
- WHEN importing same hash with tags ["fire", "homebrew"]
- THEN resulting tags MUST be ["fire", "damage", "homebrew"] (union, no duplicates).
- NOTE: If merged tag count exceeds 100, keep the first 100 alphabetically sorted.

#### Scenario: source_refs Merge
- GIVEN existing spell with source_refs ["https://a.com"]
- WHEN importing same hash with source_refs ["https://a.com", "https://b.com"]
- THEN resulting source_refs MUST be ["https://a.com", "https://b.com"] (deduplicated by URL).
- NOTE: If merged count exceeds 50, keep existing refs first, then append new refs up to the limit.

### Requirement: Import Version Validation
Import MUST validate schema and bundle format versions before processing.

#### Scenario: Reject Future Schema Version
- GIVEN the app's current schema version (from code)
- WHEN importing a spell with a schema version greater than the app's
- THEN import MUST reject the spell
- AND error message MUST indicate unsupported schema version.

#### Scenario: Reject Future Bundle Format Version
- GIVEN the app's supported bundle_format_version (from code)
- WHEN importing a bundle with bundle_format_version greater than supported
- THEN import MUST reject the entire bundle
- AND error message MUST indicate unsupported bundle format version.

#### Scenario: Accept Current or Lower Schema Version
- GIVEN the app's current schema version (from code)
- WHEN importing a spell with schema version equal to or lower than the app's
- THEN import MUST accept the spell and process normally.

#### Scenario: Reject Missing Bundle Format Version
- GIVEN a bundle JSON that omits `bundle_format_version` entirely
- WHEN importing
- THEN import MUST reject the bundle
- AND error message MUST indicate missing required field.

#### Scenario: Tampered Import Hash
- GIVEN imported spell with `content_hash` field "X"
- WHEN recomputed hash from spell content is "Y" (X ≠ Y)
- THEN import MUST warn user of integrity mismatch
- AND the recomputed hash "Y" MUST be used for deduplication (not the imported value).

## Non-Functional Requirements
- **Import throughput**: 1000 spells SHOULD import in < 30 seconds.
- **Tag limit**: Maximum 100 tags per spell.
- **source_refs limit**: Maximum 50 source_refs per spell.
