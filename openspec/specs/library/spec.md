# library Specification

## Purpose
This specification defines the core spell library management system, including CRUD operations for spell records, field-level change tracking, validation rules for AD&D 2e magic systems (Arcane/Divine), and support for high-level magic (Epic spells up to 12th level, Quest spells, and Cantrips). It establishes the data model and business rules for the central spell repository that all other features depend on.
## Requirements
### Requirement: Spell CRUD
The user SHALL be able to create, read, update, and delete spell records containing the following mandatory and optional fields:
- **Mandatory**: Name, Level, Description, Source, Created At.
- **System Specific**: School (Arcane), Sphere (Divine), Classes.
- **Effect Details**: Range, Casting Time, Duration, Area of Effect, Saving Throw, Reversible (Flag).
- **Components**: Components (V/S/M), Material Components (Text).
- **Metadata**: Tags, Edition, Author, License/Permissions, Quest Spell (Flag), Cantrip (Flag).

#### Scenario: Adding a New Spell
- **WHEN** the user fills out the "Create Spell" form with details for "Acid Arrow" (Level 2, Alteration)
- **AND** they click "Save"
- **THEN** the spell record SHALL be persisted with all provided fields appearing in the library list

#### Scenario: Adding an Epic Spell
- **WHEN** the user creates an Arcane spell (has `school`) with level 10, 11, or 12
- **THEN** the record SHALL be persisted and display with an "Epic" badge in the library

#### Scenario: Adding a Quest Spell
- **WHEN** the user creates a Divine spell (has `sphere`) with Level 8 and toggles "Quest Spell"
- **THEN** the record SHALL be persisted and display with a "Quest" badge in the library

#### Scenario: Adding a Cantrip
- **WHEN** the user creates a Level 0 spell and toggles "Cantrip"
- **THEN** the record SHALL be persisted and display with a "Cantrip" badge (versus a plain "0" or no badge for non-cantrip level 0 spells)

### Requirement: Field-Level Change Log
The application SHALL maintain a history of changes to spell records, tracking which field was changed, the old value, the new value, and the timestamp.
#### Scenario: Viewing Spell History
- **WHEN** a user updates the "Casting Time" of a spell
- **THEN** a new entry SHALL be added to the change log for that spell recording the modification details

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

### Requirement: High-Level Magic Validation
The application SHALL enforce validation rules for high-level and quest magic to ensure consistency with AD&D 2e conventions.
- Arcane spells (with `school`) are permitted up to Level 12.
- Divine spells (with `sphere`) are capped at Level 7, unless explicitly flagged as a Quest Spell.
- Quest Spells MUST be Level 8 and MUST be Divine (have `sphere`).
- Cantrips MUST be Level 0.
- A spell SHALL NOT have both a `school` and a `sphere`.

#### Scenario: Preventing Invalid Cantrip Level
- **WHEN** the user attempts to toggle "Cantrip" on a spell with Level > 0
- **THEN** the application SHALL prevent the toggle or display a validation error upon saving

#### Scenario: Preventing Invalid Epic Divine Spell
- **WHEN** the user attempts to save a Divine spell with Level 10
- **THEN** the application SHALL display a validation error and prevent saving

#### Scenario: Preventing Invalid Arcane Quest Spell
- **WHEN** the user attempts to toggle "Quest Spell" on an Arcane spell
- **THEN** the application SHALL prevent the toggle or display a validation error upon saving

### Requirement: Editor Conditional Field Visibility
The spell editor SHALL dynamically adjust field visibility and interactivity based on selected magic type and level to prevent invalid configurations.
- If `school` is provided, `sphere` SHALL be disabled/hidden and `is_quest_spell` SHALL be disabled.
- If `sphere` is provided, `school` SHALL be disabled/hidden.
- The `is_cantrip` toggle SHALL only be enabled when Level is 0.

#### Scenario: Switching to Arcane Magic
- **WHEN** the user selects a "School" for a new spell
- **THEN** the "Sphere" field and "Quest Spell" toggle SHALL become disabled to prevent multi-type association

### Requirement: High-Level Magic Indicator
The spell editor SHALL display a visual indicator or warning when configuring Epic (10+) or Quest spells to highlight their non-standard nature.

#### Scenario: Editing an Epic Spell
- **WHEN** the user sets a spell level to 10
- **THEN** the editor SHALL display an "Epic Magic" indicator

