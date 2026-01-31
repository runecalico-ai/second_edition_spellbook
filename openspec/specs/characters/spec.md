# characters Specification

## Purpose
This specification defines character profile management for PCs and NPCs, including identity tracking (name, race, alignment), ability scores (including optional Comeliness), multi-class configurations with independent levels, and per-class spell management with separate "Known" and "Prepared" lists. It ensures characters can accurately represent AD&D 2e multi-class spellcasters with character-specific spell selections.
## Requirements
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

### Requirement: Character Spell Notes
The system MUST allow users to add notes to spells assigned to a character class.

#### Scenario: Per-Spell Notes
- **WHEN** the user adds the note "Use against Trolls" to "Fireball" in the Prepared list
- **THEN** the note SHALL be persisted and displayed with the spell in that class's Prepared list

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

#### Scenario: distinct notes for known and prepared lists
Given a character "Merlin" with the "Mage" class
And "Merlin" has the spell "Fireball" in the "Known" list
And "Merlin" has the spell "Fireball" in the "Prepared" list
When "Merlin" adds the note "For research" to "Fireball" in the "Known" list
And "Merlin" adds the note "For combat" to "Fireball" in the "Prepared" list
Then the system MUST persist "For research" for the Known entry
And the system MUST persist "For combat" for the Prepared entry
And the notes MUST NOT overwrite each other

### Requirement: Character Import and Export
The application SHALL support importing and exporting character profiles as JSON or Markdown bundles, including identity, abilities, classes, and per-class spell lists. Spells SHALL be deduplicated by canonical key (name + level + source).

#### Scenario: Exporting Character as JSON
- **WHEN** the user exports a character with 2 classes and 50 spells
- **THEN** a JSON bundle SHALL be created with format "adnd2e-character" and format_version "1.0.0", containing all character data and spell references

#### Scenario: Importing Character from JSON
- **WHEN** the user imports a valid JSON character bundle
- **THEN** the character, abilities, classes, and spell links SHALL be created, and spells SHALL be deduplicated against the existing library

#### Scenario: Exporting Character as Markdown
- **WHEN** the user exports a character with 2 classes and 50 spells as a Markdown bundle
- **THEN** a folder SHALL be created containing character.yml (identity + abilities + classes) and spells/*.md files for referenced spells

#### Scenario: Importing Character from Markdown
- **WHEN** the user imports a valid Markdown character bundle (character.yml + spells/*.md)
- **THEN** the character, abilities, classes, and spell links SHALL be created, and spells SHALL be deduplicated against the existing library

#### Scenario: Round-Trip Import/Export
- **WHEN** the user exports a character with 2 classes and 100+ spells, then re-imports the bundle
- **THEN** all data SHALL match the original without loss

#### Scenario: Collision Handling
- **WHEN** the user imports a character bundle with a name matching an existing character
- **THEN** the application SHALL prompt the user to update the existing character or create a new one

#### Scenario: Missing Spell Data on Import
- **WHEN** a character bundle references a spell not in the library
- **THEN** the spell SHALL be created in the library using the provided data

### Requirement: Character Printing
The application SHALL support printing character sheets (identity + abilities + per-class spell lists) and per-class spellbook packs (compact or full stat blocks) in html and Markdown formats.

#### Scenario: Printing Character Sheet
- **WHEN** the user prints a character sheet for a multi-class character
- **THEN** a Markdown/html document SHALL be generated with identity, abilities, classes, and per-class Known/Prepared spell tables

#### Scenario: Printing Spellbook Pack
- **WHEN** the user prints a spellbook pack for the "Mage" class with "Full" layout
- **THEN** a Markdown/html document SHALL be generated with full spell stat blocks for all Known and Prepared spells in that class

#### Scenario: Print Options
- **WHEN** the user selects "Include COM" and "Include Notes" options
- **THEN** the printed output SHALL include the COM ability and per-spell notes

### Requirement: Character Search and Filtering
The application SHALL provide search and filtering for characters by name, type (PC/NPC), race, class, level range, and ability thresholds.

#### Scenario: Filtering by Type
- **WHEN** the user filters the character list by type "PC"
- **THEN** only PC characters SHALL be displayed

#### Scenario: Filtering by Class
- **WHEN** the user filters by class "Mage"
- **THEN** all characters with at least one "Mage" class SHALL be displayed

#### Scenario: Filtering by Level Range
- **WHEN** the user filters by level range 5-10 for class "Mage"
- **THEN** only characters with a "Mage" class at level 5-10 SHALL be displayed

#### Scenario: Filtering by Ability Threshold
- **WHEN** the user filters by minimum INT=16
- **THEN** only characters with INT >= 16 SHALL be displayed

#### Scenario: Search Performance
- **WHEN** the user performs a search with multiple filters on a database with 100+ characters
- **THEN** results SHALL be returned in under 150ms (P95)

