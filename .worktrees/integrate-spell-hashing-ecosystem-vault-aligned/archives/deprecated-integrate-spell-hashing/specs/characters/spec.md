# Capability: Character Spell Management

## MODIFIED Requirements

### Requirement: Immutable Spell References
Characters MUST reference spells using the Canonical Spell Hash.

#### Scenario: Versioning
- GIVEN a character with "Fireball" (Hash A)
- WHEN a new "Fireball" (Hash B) is installed
- THEN the character MUST still point to Hash A.
