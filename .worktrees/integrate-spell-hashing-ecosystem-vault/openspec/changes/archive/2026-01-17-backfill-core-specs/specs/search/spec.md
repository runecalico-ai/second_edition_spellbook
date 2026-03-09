# Capability: Search

The Search capability provides fast, relevant access to spell data using both keyword matching and structured facet filtering.

## ADDED Requirements

### Requirement: Keyword Search
The application SHALL provide a full-text search across spell names, descriptions, and other text fields.
#### Scenario: Searching for Fire Spells
- **WHEN** the user types "burn" in the search box
- **THEN** spells containing "burn" in their description or name must be returned

### Requirement: Faceted Filtering
The search interface SHALL support filtering by school, level, class, source, and other structured fields using multi-select controls and range sliders.
#### Scenario: Filtering by Multiple Schools
- **WHEN** the user selects "Abjuration" and "Alteration" from the school facet
- **THEN** only spells belonging to either of these schools SHALL be displayed

#### Scenario: Filtering by Level Range
- **WHEN** the user sets the level slider range to "1-3"
- **THEN** only spells with levels 1, 2, or 3 SHALL be displayed

### Requirement: Saved Searches
The application SHALL allow users to persist complex search and filter configurations with a custom name.
#### Scenario: Saving a Frequent Search
- **WHEN** the user saves a search for "Defensive Spells" (Abjuration + Level 1-5)
- **THEN** the search SHALL appear in their saved searches list for quick access
