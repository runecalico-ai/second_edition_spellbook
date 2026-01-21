## MODIFIED Requirements

### Requirement: Character Management
The application SHALL support managing multiple PC and NPC profiles with rich profile data including identity (name, type, race, alignment, notes), abilities (STR, DEX, CON, INT, WIS, CHA, optional COM), and multi-class configurations. Character profiles are managed through the `characters` capability.

#### Scenario: Creating a Character
- **WHEN** the user creates a new character named "Elminster"
- **THEN** the character must be stored in the database and be selectable for spellbook association

#### Scenario: Creating a Character with Full Profile
- **WHEN** the user creates a character with identity, abilities, and multiple classes
- **THEN** all profile data SHALL be persisted and retrievable (see `characters` spec for detailed requirements)

### Requirement: Spellbook Linkage
Each character class SHALL have a personal spellbook where spells from the library can be added, removed, and marked as "known" or "prepared". Multi-class characters maintain separate spell lists per class.

#### Scenario: Adding a Spell to a Character Class
- **WHEN** the user adds "Fireball" to Elminster's "Mage" class Known list
- **THEN** "Fireball" SHALL be linked to that class with list_type "KNOWN"

#### Scenario: Removing a Spell from a Character Class
- **WHEN** the user removes "Magic Missile" from Elminster's "Mage" class Prepared list
- **THEN** the link between the spell and the character class SHALL be removed

#### Scenario: Preparing a Spell
- **WHEN** the user adds "Fireball" to the Prepared list for Elminster's "Mage" class
- **THEN** the change SHALL be persisted and reflected in the character's prepared spells list for that class

### Requirement: Character Spellbook Notes
The user SHALL be able to attach personal notes to each spell within a character's per-class spellbook.

#### Scenario: Adding Notes to a Prepared Spell
- **WHEN** the user adds the note "Use against Trolls" to Elminster's "Fireball" spell in the "Mage" class Prepared list
- **THEN** the note SHALL be persisted and displayed as part of that class's spellbook view
