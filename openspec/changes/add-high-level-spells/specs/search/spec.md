## MODIFIED Requirements
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
