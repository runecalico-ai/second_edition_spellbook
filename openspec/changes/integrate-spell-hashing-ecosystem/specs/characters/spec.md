# Capability: Character Spell Management

> See [design.md Decision #5](../../design.md) for full context.

## MODIFIED Requirements

### Requirement: Immutable Spell References
Characters MUST reference spells using the Canonical Spell Hash.

#### Scenario: Versioning
- GIVEN a character with "Fireball" (Hash A)
- WHEN a new "Fireball" (Hash B) is installed
- THEN the character MUST still point to Hash A.

#### Scenario: Missing Spell Handling
- GIVEN a character with spell reference to Hash H
- AND spell H no longer exists in library
- WHEN viewing character spellbook
- THEN "Spell no longer in library" placeholder MUST appear
- AND "Remove" action MUST be available.

#### Scenario: Spell Replaced via Import
- GIVEN a character with "Fireball" (Hash A)
- AND user imports a new "Fireball" (Hash B) and selects "Replace with New"
- WHEN viewing character spellbook
- THEN character MUST still reference Hash A
- AND "Spell no longer in library" placeholder MUST appear (Hash A no longer on any spell row)
- AND "Remove" action MUST be available.

#### Scenario: Explicit Upgrade
- GIVEN a character with "Fireball" (Hash A)
- AND "Fireball" (Hash B) exists in library
- WHEN user explicitly chooses to upgrade
- THEN character reference MUST update to Hash B.

Upgrade is offered when the same display name has another spell row with a different `content_hash` (e.g. after importing an updated version of the same spell).

## Non-Functional Requirements
- **Lookup performance**: Hash lookup MUST complete in < 10ms for libraries of 10k spells.
