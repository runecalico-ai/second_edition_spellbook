# Capability: Spell Search

## MODIFIED Requirements

### Requirement: Search Compatibility
The Search system MUST index the human-readable text derived from structured fields.

#### Scenario: Structured Field Indexing
- GIVEN the new structured fields
- WHEN building search index
- THEN the human-readable text derived from those fields MUST be indexed.
