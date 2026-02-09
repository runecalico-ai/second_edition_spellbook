# Capability: Import/Export

> See [design.md Decisions #3, #4](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/design.md) for full context.

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

### Requirement: Metadata Merge on Deduplication
When a duplicate hash is imported, metadata MUST merge.

#### Scenario: Tag Merge
- GIVEN existing spell with tags ["fire", "damage"]
- WHEN importing same hash with tags ["fire", "homebrew"]
- THEN resulting tags MUST be ["fire", "damage", "homebrew"] (union, no duplicates).

#### Scenario: source_refs Merge
- GIVEN existing spell with source_refs ["https://a.com"]
- WHEN importing same hash with source_refs ["https://a.com", "https://b.com"]
- THEN resulting source_refs MUST be ["https://a.com", "https://b.com"] (deduplicated by URL).

## Non-Functional Requirements
- **Import throughput**: 1000 spells SHOULD import in < 30 seconds.
- **Tag limit**: Maximum 100 tags per spell.
- **source_refs limit**: Maximum 50 source_refs per spell.
