# Capability: Spell List Integration

## MODIFIED Requirements

### Requirement: Spell List Portability
Spell Lists (as defined in `spec-4_1-spell-list_spec.md`) MUST reference spells by their Canonical Content Hash.

#### Scenario: Portable Lists
- GIVEN a Spell List "Standard Wizard Spells" containing "Fireball"
- WHEN exported and imported on another machine
- THEN the entry for "Fireball" MUST resolve using its Content Hash
- AND MUST NOT depend on the local integer ID of "Fireball" on the source machine.
