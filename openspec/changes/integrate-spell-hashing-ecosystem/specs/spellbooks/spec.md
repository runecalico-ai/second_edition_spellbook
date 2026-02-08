# Capability: Spell List Integration

## MODIFIED Requirements

**Spell List** here means the per-class spell set stored in `character_class_spell`, not a separate list entity.

### Requirement: Spell List Portability
Spell Lists MUST reference spells by their Canonical Content Hash.

#### Scenario: Portable Lists
- GIVEN a per-class spell set (e.g. known/prepared spells) containing "Fireball"
- WHEN exported and imported on another machine
- THEN the entry for "Fireball" MUST resolve using its Content Hash
- AND MUST NOT depend on the local integer ID of "Fireball" on the source machine.
