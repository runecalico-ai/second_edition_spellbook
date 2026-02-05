# Capability: Import/Export

## MODIFIED Requirements

### Requirement: Interchange ID
Exported spells MUST use their Content Hash as the ID.

#### Scenario: Export Transformation
- GIVEN a spell with Hash "abc"
- WHEN exported
- THEN `id` field MUST be "abc".
