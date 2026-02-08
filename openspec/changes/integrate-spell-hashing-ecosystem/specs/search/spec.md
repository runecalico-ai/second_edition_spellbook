# Capability: Spell Search

> See [design.md Decision #1](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/design.md) for full context.

## MODIFIED Requirements

### Requirement: Search Compatibility
The Search system MUST index the human-readable text derived from structured fields.

#### Scenario: Structured Field Indexing
- GIVEN the new structured fields (range, duration, area, etc.)
- WHEN building search index
- THEN the human-readable text derived from those fields MUST be indexed.

#### Scenario: FTS MATCH Query
- GIVEN a search term "fire"
- WHEN search is executed
- THEN FTS MATCH query MUST be used (not LIKE)
- AND results MUST be ranked by relevance.

#### Scenario: Boolean Operators
- GIVEN search term "fire AND NOT ice"
- WHEN search is executed
- THEN only spells matching "fire" without "ice" MUST be returned.

### Requirement: FTS Security
Search queries MUST be safe from injection.

#### Scenario: Special Character Escaping
- GIVEN search term containing FTS5 special character `"`
- WHEN search is executed
- THEN character MUST be escaped before binding to MATCH parameter.

**FTS5 special characters to escape:** `"`, `*`, `(`, `)`, `^`, `:`, `-`, `+`, and keywords `AND`, `OR`, `NOT`, `NEAR`.

## Non-Functional Requirements
- **Search latency**: Results MUST return in < 500ms for libraries of 10k spells.
