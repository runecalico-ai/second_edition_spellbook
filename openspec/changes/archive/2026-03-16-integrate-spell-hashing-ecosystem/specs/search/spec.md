# Capability: Spell Search

> See [design.md Decision #1](../../design.md) for full context.

## MODIFIED Requirements

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
