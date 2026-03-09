# Character Management Specs

## ADDED Requirements

### Requirement: Character Spell Notes
The system MUST allow users to add notes to spells assigned to a character class.

#### Scenario: distinct notes for known and prepared lists
Given a character "Merlin" with the "Mage" class
And "Merlin" has the spell "Fireball" in the "Known" list
And "Merlin" has the spell "Fireball" in the "Prepared" list
When "Merlin" adds the note "For research" to "Fireball" in the "Known" list
And "Merlin" adds the note "For combat" to "Fireball" in the "Prepared" list
Then the system MUST persist "For research" for the Known entry
And the system MUST persist "For combat" for the Prepared entry
And the notes MUST NOT overwrite each other
