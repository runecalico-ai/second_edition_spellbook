# characters Specification

## Purpose
This specification defines character profile management for PCs and NPCs, including identity tracking (name, race, alignment), ability scores (including optional Comeliness), multi-class configurations with independent levels, and per-class spell management with separate "Known" and "Prepared" lists. It ensures characters can accurately represent AD&D 2e multi-class spellcasters with character-specific spell selections.

> See [design.md Decision #5](../../design.md) for full context.
>
> **Merged Spec Note:** This specification covers both character profile management and per-class spell lists (known/prepared spells). Both are stored in the `character_class_spell` table. The former `spellbooks/spec.md` has been merged here.
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

### Requirement: Immutable Spell References
Characters and Spell Lists MUST reference spells using the Canonical Spell Hash (`spell_content_hash`).

#### Scenario: Versioning
- GIVEN a character or list with "Fireball" (Hash A)
- WHEN a new "Fireball" (Hash B) is imported and saved as a new distinct spell (e.g., via 'Keep Both')
- THEN the character or list MUST still point to Hash A.

#### Scenario: Missing Spell Handling
- GIVEN a character or list with a spell reference to Hash H
- AND spell H no longer exists in library
- WHEN viewing character spellbook or spell list
- THEN "Spell no longer in library" placeholder MUST appear
- AND "Remove" action MUST be available.

#### Scenario: Spell Replaced via Import
- GIVEN a character or list with "Fireball" (Hash A)
- AND user imports a new "Fireball" (Hash B) and selects "Replace with New"
- WHEN the import replaces the spell
- THEN the system MUST perform a cascading update
- AND the character or list MUST now reference Hash B seamlessly without requiring manual intervention.

#### Scenario: Explicit Upgrade
- GIVEN a character or list with "Fireball" (Hash A)
- AND "Fireball" (Hash B) exists in library
- WHEN user explicitly chooses to upgrade
- THEN character reference MUST update to Hash B.

Upgrade is offered when the same display name has another spell row with a different `content_hash` (e.g. after importing an updated version of the same spell).

#### Scenario: Spell List Portability
- GIVEN a per-class spell set (e.g. known/prepared spells) containing "Fireball"
- WHEN exported and imported on another machine
- THEN the entry for "Fireball" MUST resolve using its Content Hash
- AND MUST NOT depend on the local integer ID of "Fireball" on the source machine.

#### Scenario: Migration from ID to Hash
- GIVEN existing rows in `character_class_spell` with `spell_id` only
- WHEN migration runs
- THEN `spell_content_hash` MUST be backfilled from `spell.content_hash`
- AND join to `spell` on hash MUST succeed.

### Requirement: Migration Period Dual-Column Writes
During the Migration 0015 transition period, both IDs and Hashes are used.

#### Scenario: Dual-Column Write on Insert
- GIVEN a new spell being added to a character or spell list
- WHEN the insert occurs during the Migration 0015 transition period
- THEN the system MUST populate BOTH `spell_id` and `spell_content_hash` on the new `character_class_spell` row (assuming the referenced spell has both).

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
The application SHALL support importing and exporting character profiles as JSON or Markdown bundles, including identity, abilities, classes, and per-class spell lists. Spells SHALL be deduplicated by `content_hash`.

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

### Requirement: Printable Export
The application SHALL generate printable PDF exports for single spells or entire character spellbooks.

#### Scenario: Printing a Spellbook
- **WHEN** the user select "Export to PDF" for a character with prepared spells
- **THEN** a PDF must be generated containing the full stat blocks of those spells in a printer-friendly layout

### Requirement: Layout Presets
The exporter SHALL support different layout presets, such as "Compact", "Stat-Block", and "List".

#### Scenario: Switching to Compact Layout
- **WHEN** the user selects the "Compact" layout preset during export
- **THEN** the resulting PDF should show more spells per page with reduced detail

### Requirement: High-Level Terminology
The application SHALL use appropriate terminology for high-level and quest magic in all displays and exports.
- Levels 10, 11, and 12 SHALL be referred to as "10th Circle", "11th Circle", and "12th Circle" for Arcane spells to ensure the numeric level remains clear.
- Quest spells SHALL display as "Quest" instead of a numeric level.
- Spells flagged as `is_cantrip` SHALL be referred to as "Cantrips".

#### Scenario: Displaying Quest Spell Terminology
- **WHEN** viewing a Divine spell flagged as `is_quest_spell`
- **THEN** the level display SHALL show "Quest"

#### Scenario: Displaying Epic Circle Terminology
- **WHEN** viewing a Level 10 Arcane spell
- **THEN** the level display SHALL show "10th Circle"

#### Scenario: Displaying Cantrip Terminology
- **WHEN** viewing a Level 0 spell flagged as `is_cantrip`
- **THEN** the level display SHALL show "Cantrip"

#### Scenario: Displaying Level 0 (Non-Cantrip) Terminology
- **WHEN** viewing a Level 0 spell NOT flagged as `is_cantrip`
- **THEN** the level display SHALL show "Level 0"

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

## Non-Functional Requirements
- **Lookup performance**: Hash lookup MUST complete in < 10ms for libraries of 10k spells.
- **Migration**: Backfill of 10k list entries SHOULD complete in < 60 seconds.

