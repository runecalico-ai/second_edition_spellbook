# library Spec Delta

## MODIFIED Requirements

### Requirement: High-Level Magic Validation

The application SHALL enforce validation rules for high-level and quest magic to ensure consistency with AD&D 2e conventions.
- Arcane spells (with `school`) are permitted up to Level 12.
- Divine spells (with `sphere`) are capped at Level 7, unless explicitly flagged as a Quest Spell.
- Quest Spells MUST be Level 8 and MUST be Divine (have `sphere`).
- **Quest Spells MUST have a `class_list` containing at least one divine caster class (Priest, Cleric, Druid, Paladin, or Ranger).**
- **Epic Spells (level 10-12) MUST have a `class_list` containing at least one arcane caster class (Wizard or Mage).**
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

#### Scenario: Rejecting Epic Spell Without class_list
- **WHEN** the user attempts to save an Epic spell (level 10-12) with no `class_list`
- **THEN** the application SHALL display a validation error: "Epic spells (level 10-12) require class_list with arcane casters (Wizard/Mage)" and prevent saving

#### Scenario: Rejecting Epic Spell With Divine-Only class_list
- **WHEN** the user attempts to save an Epic spell (level 10-12) with `class_list` containing only divine casters (e.g., "Priest, Cleric")
- **THEN** the application SHALL display a validation error: "Epic spells (level 10-12) require class_list with arcane casters (Wizard/Mage)" and prevent saving

#### Scenario: Rejecting Quest Spell Without class_list
- **WHEN** the user attempts to save a Quest spell with no `class_list`
- **THEN** the application SHALL display a validation error: "Quest spells require class_list with divine casters (Priest/Cleric/Druid/Paladin/Ranger)" and prevent saving

#### Scenario: Rejecting Quest Spell With Arcane-Only class_list
- **WHEN** the user attempts to save a Quest spell with `class_list` containing only arcane casters (e.g., "Wizard, Mage")
- **THEN** the application SHALL display a validation error: "Quest spells require class_list with divine casters (Priest/Cleric/Druid/Paladin/Ranger)" and prevent saving

#### Scenario: Editing an Epic Spell
- **WHEN** the user sets a spell level to 10-12
- **THEN** the editor SHALL display an "Epic Magic" indicator