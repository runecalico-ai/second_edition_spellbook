# Capability: Spellbook Vault

> See [design.md Decisions #2, #6](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/integrate-spell-hashing-ecosystem/design.md) for full context.

## MODIFIED Requirements

### Requirement: Canonical Filename Storage
The Vault MUST support storing spell definitions using their canonical content hash.

#### Scenario: Collision Prevention
- GIVEN two spells named "Fireball"
- WHEN saved
- THEN filenames MUST include the Content Hash (e.g., `spells/{hash}.json`).

#### Scenario: Integrity Verification
- GIVEN a spell file `spells/{hash}.json`
- WHEN read from vault
- THEN computed hash of file content MUST match filename hash.

#### Scenario: GC with Deferred Cleanup
- GIVEN a spell deleted from DB
- WHEN vault GC runs
- THEN file `spells/{hash}.json` MUST be removed if no spell row references that hash.

#### Scenario: GC with Immediate Cleanup (alternative)
- GIVEN a spell explicitly deleted by user
- WHEN deletion completes
- THEN file `spells/{hash}.json` MAY be removed immediately.

Both GC approaches are valid; implementation may use either or both.

### Requirement: Vault Integrity Recovery
The Vault MUST detect and recover from missing files.

#### Scenario: Missing Vault File
- GIVEN spell row exists with content_hash H
- AND vault file `spells/H.json` is missing
- WHEN vault integrity check runs
- THEN file MUST be re-exported from DB canonical_data if available
- AND log if unrecoverable.

## Non-Functional Requirements
- **Windows path length**: Full path to vault file MUST be < 260 characters. Log warning if exceeded.
- **Write latency**: Single spell write to vault SHOULD complete in < 100ms.
