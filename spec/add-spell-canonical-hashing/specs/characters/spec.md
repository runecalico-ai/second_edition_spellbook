# Capability: Character Spell Management

## MODIFIED Requirements

### Requirement: Immutable Spell References
Characters MUST reference spells in their spellbook/memorized list using the Canonical Spell Hash, ensuring the character sheet remains accurate to the specific version of the spell added.

#### Scenario: Spell Versioning on Character Sheet
- GIVEN a character with "Fireball" (Hash A) in their spellbook
- AND the user imports a new version of "Fireball" (Hash B) which has different damage
- WHEN the character sheet is viewed
- THEN it MUST still link to and display the stats for "Fireball" (Hash A)
- UNLESS the user explicitly chooses to update the reference to Hash B.

#### Scenario: Export Portability
- GIVEN a character export containing a reference to a spell
- WHEN the character is imported on another device
- THEN the system MUST attempt to resolve the spell by Hash
- AND if the spell is missing locally, it SHOULD define the spell structure embedded within the character data (as a fallback) using the canonical schema.
