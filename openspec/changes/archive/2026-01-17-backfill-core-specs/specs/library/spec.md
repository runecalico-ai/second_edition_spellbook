# Capability: Library

The Library capability provides the core data management for spells, characters, and their associated spellbooks, including CRUD operations and relationship management.

## ADDED Requirements

### Requirement: Spell CRUD
The user SHALL be able to create, read, update, and delete spell records containing the following mandatory and optional fields:
- **Mandatory**: Name, Level, Description, Source, Created At.
- **System Specific**: School (Arcane), Sphere (Divine), Classes.
- **Effect Details**: Range, Casting Time, Duration, Area of Effect, Saving Throw, Reversible (Flag).
- **Components**: Components (V/S/M), Material Components (Text).
- **Metadata**: Tags, Edition, Author, License/Permissions, Quest Spell (Flag).

#### Scenario: Adding a New Spell
- **WHEN** the user fills out the "Create Spell" form with details for "Acid Arrow" (Level 2, Alteration)
- **AND** they click "Save"
- **THEN** the spell record SHALL be persisted with all provided fields appearing in the library list

### Requirement: Field-Level Change Log
The application SHALL maintain a history of changes to spell records, tracking which field was changed, the old value, the new value, and the timestamp.
#### Scenario: Viewing Spell History
- **WHEN** a user updates the "Casting Time" of a spell
- **THEN** a new entry SHALL be added to the change log for that spell recording the modification details

### Requirement: Character Management
The application SHALL support managing multiple PC and NPC profiles.
#### Scenario: Creating a Character
- **WHEN** the user creates a new character named "Elminster"
- **THEN** the character must be stored in the database and be selectable for spellbook association

### Requirement: Spellbook Linkage
Each character SHALL have a personal spellbook where spells from the library can be added, removed, and marked as "known" or "prepared".
#### Scenario: Adding a Spell to a Character
- **WHEN** the user adds "Fireball" to Elminster's spellbook
- **THEN** "Fireball" SHALL be linked to Elminster's record and appear in his known spells

#### Scenario: Removing a Spell from a Character
- **WHEN** the user removes "Magic Missile" from Elminster's spellbook
- **THEN** the link between the spell and the character SHALL be removed

#### Scenario: Preparing a Spell
- **WHEN** the user toggles the "Prepared" status for "Fireball" in Elminster's spellbook
- **THEN** the change SHALL be persisted and reflected in the character's prepared spells list

### Requirement: Character Spellbook Notes
The user SHALL be able to attach personal notes to each spell within a character's spellbook.
#### Scenario: Adding Notes to a Prepared Spell
- **WHEN** the user adds the note "Use against Trolls" to Elminster's "Fireball" spell
- **THEN** the note SHALL be persisted and displayed as part of Elminster's spellbook view
