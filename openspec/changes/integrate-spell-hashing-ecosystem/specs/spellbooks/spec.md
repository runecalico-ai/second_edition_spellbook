# Capability: Spell List Integration

> See [design.md Decision #5](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/design.md) for full context.

**Spell List** here means the per-class spell set stored in `character_class_spell`, not a separate list entity.

## MODIFIED Requirements

### Requirement: Spell List Portability
Spell Lists MUST reference spells by their Canonical Content Hash.

#### Scenario: Portable Lists
- GIVEN a per-class spell set (e.g. known/prepared spells) containing "Fireball"
- WHEN exported and imported on another machine
- THEN the entry for "Fireball" MUST resolve using its Content Hash
- AND MUST NOT depend on the local integer ID of "Fireball" on the source machine.

#### Scenario: Missing Spell in List
- GIVEN a spell list entry with spell_content_hash H
- AND spell H no longer exists in library
- WHEN viewing spell list
- THEN "Spell no longer in library" placeholder MUST appear
- AND "Remove" action MUST be available.

#### Scenario: Migration from ID to Hash
- GIVEN existing rows in `character_class_spell` with `spell_id` only
- WHEN migration runs
- THEN `spell_content_hash` MUST be backfilled from `spell.content_hash`
- AND join to `spell` on hash MUST succeed.

## Non-Functional Requirements
- **Migration**: Backfill of 10k list entries SHOULD complete in < 60 seconds.
