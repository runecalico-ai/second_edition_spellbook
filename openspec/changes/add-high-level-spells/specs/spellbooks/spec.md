## ADDED Requirements
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


