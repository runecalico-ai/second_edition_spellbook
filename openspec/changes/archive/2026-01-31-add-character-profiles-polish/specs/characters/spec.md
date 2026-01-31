## ADDED Requirements

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
