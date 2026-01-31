# Capability: Spell Search

## MODIFIED Requirements

### Requirement: Search Compatibility
The Search system MUST index the `text` property of new structured fields.

#### Scenario: Structured Field Indexing
- GIVEN the new structured fields
- WHEN building search index
- THEN `text` property MUST be indexed.
