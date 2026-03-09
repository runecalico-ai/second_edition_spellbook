# search Specification

## Purpose
This specification defines the spell search and filtering system, enabling users to quickly find spells through full-text keyword search, faceted filtering by structured fields (school, level, class, source, quest/cantrip flags), and saved search configurations. It leverages the hybrid search infrastructure (FTS5 + vector search) established in the architecture spec to provide fast, flexible spell discovery.

> See [design.md Decision #1](../../design.md) for full context.

## Requirements

### Requirement: Keyword Search
The application SHALL provide a full-text search across spell names, descriptions, and other text fields.

#### Scenario: Searching for Fire Spells
- **WHEN** the user types "burn" in the search box
- **THEN** spells containing "burn" in their description or name must be returned

### Requirement: Search Compatibility
The Search system MUST index the human-readable text derived from structured fields.

#### Scenario: Structured Field Indexing
- GIVEN the new structured fields (range, duration, area, saving throw, damage, MR, XP, etc.)
- WHEN building search index
- THEN the human-readable text and legacy/source strings from those fields MUST be indexed.

#### Scenario: FTS MATCH Query
- GIVEN a search term "fire"
- WHEN search is executed
- THEN FTS MATCH query MUST be used (not LIKE)
- AND results MUST be ranked by relevance.

#### Scenario: Boolean Operators (Advanced Search)
- GIVEN search term "fire AND NOT ice" (contains uppercase boolean keywords)
- WHEN search is executed
- THEN advanced mode MUST activate (keywords detected)
- AND only spells matching "fire" without "ice" MUST be returned.

#### Scenario: Basic Search (No Boolean)
- GIVEN search term "fire and ice" (lowercase, no boolean keywords)
- WHEN search is executed
- THEN basic mode MUST be used (phrase search)
- AND spells containing the phrase "fire and ice" MUST be returned.

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

### Requirement: FTS Security
Search queries MUST be safe from injection and malformed FTS syntax.

#### Scenario: Basic Search Escaping
- GIVEN a search term with FTS5 special characters or lowercase logical words (e.g., `(fire) and ice*`)
- WHEN search is executed
- THEN the system MUST escape ALL special characters (`"`, `*`, `(`, `)`, `^`, `:`, `-`, `+`)
- AND the query MUST be treated as a literal phrase.

#### Scenario: Advanced Search Detection
- GIVEN a search term containing uppercase boolean keywords (`AND`, `OR`, `NOT`) as whitespace-delimited tokens
- WHEN search is executed
- THEN the system MUST activate advanced mode
- AND the keywords MUST be passed through as FTS5 operators
- AND all other special characters MUST be escaped to prevent syntax errors.

**FTS5 special characters to escape (basic mode):** `"`, `*`, `(`, `)`, `^`, `:`, `-`, `+`, and boolean keywords treated as literals.
**FTS5 special characters to escape (advanced mode):** `"`, `*`, `(`, `)`, `^`, `:`, `-`, `+` only; boolean keywords (`AND`, `OR`, `NOT`) passed through as operators. `NEAR` is always escaped and never exposed to users.
**Heuristic:** Detect if the trimmed query contains `AND`, `OR`, or `NOT` (case-sensitive) bounded by whitespace or start/end of string (e.g., regex `(^|\s)(AND|OR|NOT)(\s|$)`).

## Non-Functional Requirements
- **Search latency**: Results MUST return in < 500ms for libraries of 10k spells.

