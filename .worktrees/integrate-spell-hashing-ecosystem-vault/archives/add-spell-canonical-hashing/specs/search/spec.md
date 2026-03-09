# Capability: Spell Search

## MODIFIED Requirements

### Requirement: Search Compatibility
The Search and Filter system MUST be updated to support the new structured data fields.

#### Scenario: Structured Field Indexing
- GIVEN the new structured fields for Duration, Range, Area, Casting Time, and Damage
- WHEN the search index is built
- THEN the `text` property of each field MUST be included in the FTS index
- TO ensure users can still search for terms like "1 round/level" found in those descriptions.

#### Scenario: Array Filtering
- GIVEN the new array-based fields (`tags`, `subschools`)
- WHEN filtering spells
- THEN the system MUST support exact matching against individual elements of these arrays.
