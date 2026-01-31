# Capability: Spellbook Vault

## MODIFIED Requirements

### Requirement: Canonical Filename Storage
The Vault MUST support storing spell definitions using their canonical content hash.

#### Scenario: Collision Prevention
- GIVEN two spells named "Fireball"
- WHEN saved
- THEN filenames MUST include the Content Hash.
