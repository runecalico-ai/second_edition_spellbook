# search Specification

## Purpose
TBD - created by archiving change backfill-core-specs. Update Purpose after archive.
## Requirements
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
- **WHEN** the user sets the level slider range to "0-12"
- **THEN** spells with levels within that range (including 10, 11, 12) SHALL be displayed

#### Scenario: Filtering by Quest Spells
- **WHEN** the user toggles the "Quest Spells" filter
- **THEN** only spells flagged as Quest Spells SHALL be displayed in the results

#### Scenario: Filtering by Cantrip Spells
- **WHEN** the user toggles the "Cantrip Spells" filter
- **THEN** only spells flagged as Cantrips SHALL be displayed in the results

### Requirement: Saved Searches
The application SHALL allow users to persist complex search and filter configurations with a custom name.
#### Scenario: Saving a Frequent Search
- **WHEN** the user saves a search for "Defensive Spells" (Abjuration + Level 1-5)
- **THEN** the search SHALL appear in their saved searches list for quick access

