# Capability: Spellbook Vault

## MODIFIED Requirements

### Requirement: Canonical Filename Storage
The Vault MUST support storing spell definitions using their canonical content hash to prevent filename collisions and ensure integrity.

#### Scenario: Collision Prevention
- GIVEN two spells named "Fireball" (one from Core Rules, one from a Supplement)
- WHEN saved to the Vault
- THEN they MUST be stored with distinct filenames incorporating their Content Hash (e.g. `Fireball_{hash}.json` or simply `{hash}.json`)
- TO prevent the second import from overwriting the first.

#### Scenario: Integrity Check
- GIVEN a spell file stored in the Vault
- WHEN loaded by the application
- THEN the system MUST verify that the hash of the file content matches the filename's expected hash
- AND warn the user or re-index if a mismatch is detected (indicating manual editing).
