## ADDED Requirements

### Requirement: Character Profile Data
The application SHALL support rich character profiles for PCs and NPCs, including identity (name, type, race, alignment, notes), abilities (STR, DEX, CON, INT, WIS, CHA, and optional COM), and multi-class configurations with independent levels.

#### Scenario: Creating a Character with Abilities
- **WHEN** the user creates a new character "Elira" with type "PC", race "Elf", and abilities STR=10, DEX=18, CON=12, INT=16, WIS=12, CHA=14, COM=17
- **THEN** the character SHALL be persisted with all identity and ability data retrievable

#### Scenario: Enabling Comeliness Tracking
- **WHEN** the user toggles "Track Comeliness" for a character
- **THEN** the COM ability field SHALL become visible and editable, and the `com_enabled` flag SHALL be set to 1

#### Scenario: Very High Ability Scores
- **WHEN** the user sets an ability score to 1000 or higher
- **THEN** the application SHALL accept and persist the value without enforcing a maximum limit

### Requirement: Multi-Class Support
Characters SHALL support multiple classes, each with an independent level (no maximum enforced). Each class SHALL be identified by a class name from the core list (Mage, Cleric, Druid, Paladin, Ranger, Bard, Fighter, Thief, Illusionist) or "Other" with a free-text label.

#### Scenario: Adding Multiple Classes
- **WHEN** the user adds "Mage" (level 5) and "Cleric" (level 3) to a character
- **THEN** both classes SHALL be persisted with independent levels and retrievable

#### Scenario: Using "Other" Class
- **WHEN** the user adds a class with class_name "Other" and class_label "Psionicist"
- **THEN** the class SHALL be persisted with the custom label and displayed as "Psionicist"

#### Scenario: Updating Class Level
- **WHEN** the user updates the "Mage" class level from 5 to 6
- **THEN** the level SHALL be updated without affecting other classes

#### Scenario: Removing a Class
- **WHEN** the user removes the "Cleric" class from a multi-class character
- **THEN** the class and all associated per-class spell lists SHALL be deleted

### Requirement: Per-Class Spell Management
Each class instance on a specific character SHALL maintain separate "Known" and "Prepared" spell lists that are unique to that character. Spell lists SHALL NOT be shared across different characters with the same class. Spells SHALL reference existing `spell` records, and each spell link MAY include per-spell notes. Any spell in the "Prepared" list MUST also exist in the "Known" list for that class.

#### Scenario: Adding Spell to Known List
- **WHEN** the user adds "Magic Missile" to the Known list for the "Mage" class
- **THEN** the spell SHALL be linked to that class with list_type "KNOWN"

#### Scenario: Adding Spell to Prepared List
- **WHEN** the user adds "Magic Missile" to the Prepared list for the "Mage" class
- **AND** "Magic Missile" is already in the Known list for the "Mage" class
- **THEN** the spell SHALL be linked to that class with list_type "PREPARED"

#### Scenario: Validating Prepared Spell is Known
- **WHEN** the user attempts to add "Fireball" to the Prepared list for the "Mage" class
- **AND** "Fireball" is NOT in the Known list for the "Mage" class
- **THEN** the application SHALL display a validation error and prevent adding the spell

#### Scenario: Removing Known Spell Removes Prepared
- **WHEN** the user removes "Magic Missile" from the "Mage" Known list
- **AND** "Magic Missile" is also in the "Mage" Prepared list
- **THEN** the spell SHALL be automatically removed from the Prepared list as well

#### Scenario: Per-Spell Notes
- **WHEN** the user adds the note "Use against Trolls" to "Fireball" in the Prepared list
- **THEN** the note SHALL be persisted and displayed with the spell in that class's Prepared list

#### Scenario: Same Spell in Multiple Classes
- **WHEN** a multi-class character has "Cure Light Wounds" in both the "Cleric" and "Druid" Known lists
- **THEN** each class SHALL maintain an independent link to the spell with separate notes

#### Scenario: Character-Specific Spell Lists
- **WHEN** two different characters both have a "Mage" class
- **AND** the user adds "Fireball" to Character A's "Mage" Known list
- **THEN** "Fireball" SHALL appear only in Character A's spell list and NOT in Character B's spell list

#### Scenario: Removing Spell from List
- **WHEN** the user removes "Magic Missile" from the Known list
- **THEN** the link SHALL be deleted, but the spell SHALL remain in the global library

#### Scenario: Non-Spellcasting Class
- **WHEN** the user adds a "Fighter" class to a character
- **THEN** the class SHALL be created without requiring any spell list entries

#### Scenario: Filtering Spells for Addition
- **WHEN** the user opens the dialog to add a spell to a class
- **THEN** the application SHALL provide search filters for:
    - **Spell Name**: partial text match
    - **Level**: exact level number
    - **Cantrip**: boolean toggle
    - **Quest**: boolean toggle
    - **School**: for Arcane spells (e.g., "Necromancy")
    - **Sphere**: for Divine spells (e.g., "Healing")
    - **Tags**: filter by associated tags

#### Scenario: Filter State Reset on Dialog Open
- **WHEN** the user opens the spell picker dialog
- **THEN** all filter options SHALL be reset to their default values:
    - **Spell Name**: empty string
    - **Level Min/Max**: undefined (no level filter)
    - **Cantrip**: unchecked (false)
    - **Quest**: unchecked (false)
    - **School**: "All Schools" (empty string)
    - **Sphere**: "All Spheres" (empty string)
    - **Tags**: empty string
- **AND** this reset SHALL occur regardless of what filter values were set in previous dialog sessions

### Requirement: Character Data Validation
The application SHALL validate character data to ensure integrity: ability scores and levels MUST be non-negative integers, class names MUST match the core list or "Other", and COM SHALL only be displayed/editable when `com_enabled` is true.

#### Scenario: Preventing Negative Ability Score
- **WHEN** the user attempts to set an ability score to -5
- **THEN** the application SHALL display a validation error and prevent saving

#### Scenario: Preventing Negative Level
- **WHEN** the user attempts to set a class level to -1
- **THEN** the application SHALL display a validation error and prevent saving

#### Scenario: Enforcing Unique Classes
- **WHEN** the user attempts to add a class that already exists on the character (same class_name and class_label)
- **THEN** the application SHALL display a validation error and prevent adding the duplicate class

### Requirement: Character Deletion
Deleting a character SHALL remove the character record and all associated data, including abilities, classes, and per-class spell lists.

#### Scenario: Deleting a Character
- **WHEN** the user deletes character "Elira"
- **THEN** the character record, ability scores, classes, and all associated spell lists SHALL be permanently removed from the database
