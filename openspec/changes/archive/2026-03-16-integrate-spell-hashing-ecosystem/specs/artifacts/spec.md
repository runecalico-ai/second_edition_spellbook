# Capability: Artifact Spell References

> See [design.md Decision #5](../../design.md) for full context.

## Background

The `artifact` table (Migration 0009) stores metadata about imported content. It has:
- `hash TEXT NOT NULL` — the artifact's own file content hash (e.g., hash of the imported file itself)
- `spell_id INTEGER` — foreign key to `spell.id` (with `ON DELETE CASCADE`)
- `spell_content_hash TEXT` — added in Migration 0015; stores the referenced spell's canonical content hash

These are two distinct hash columns. `artifact.hash` identifies the artifact file; `artifact.spell_content_hash` identifies the spell the artifact is associated with.

## MODIFIED Requirements

### Requirement: Hash-Based Spell Reference
Artifacts that reference spells MUST use the spell's canonical content hash for lookup.

#### Scenario: Artifact Lookup by Spell Hash
- GIVEN an artifact row with `spell_content_hash` H
- WHEN resolving the artifact's associated spell
- THEN the system MUST join on `spell.content_hash = artifact.spell_content_hash`
- AND MUST NOT depend on `artifact.spell_id` for application reads (spell_id is retained for the migration period only).

#### Scenario: Missing Spell Reference
- GIVEN an artifact row with `spell_content_hash` H
- AND the spell with hash H no longer exists in the `spell` table
- WHEN the artifact is loaded
- THEN the system MUST handle the missing reference gracefully (show placeholder or log warning)
- AND MUST NOT crash.

#### Scenario: Cascading Update on Replace
- GIVEN an artifact row with `spell_content_hash` = Hash A
- WHEN a "Replace with New" import changes the referenced spell from Hash A to Hash B
- THEN `artifact.spell_content_hash` MUST be updated to Hash B via an application-level UPDATE
- NOTE: This is NOT handled by SQLite FK cascade — `spell_id` on the same row is preserved, so the FK does not fire. The application is responsible for this update.

#### Scenario: GC Safety
- GIVEN a spell deleted from the DB (hash H no longer referenced by any spell row)
- WHEN vault GC runs
- THEN GC MUST check `artifact.spell_content_hash` as well when determining whether a vault file is still referenced
- NOTE: If an artifact still references hash H, the vault GC MUST NOT delete `spells/H.json`.

### Requirement: Artifact Spell Hash Index
The database MUST include an index on `artifact.spell_content_hash` to support fast lookups during Vault GC and cascading updates.

#### Scenario: Cascading Update Performance
- GIVEN a "Replace with New" import affecting Hash A
- WHEN the cascade update searches for artifacts referencing Hash A
- THEN the lookup MUST utilize `idx_artifact_spell_content_hash` to avoid a full table scan.

### Requirement: Migration Period Dual-Column Coexistence
During the Migration 0015 transition period, `spell_id` is retained alongside `spell_content_hash`.

#### Scenario: Backfill
- GIVEN existing `artifact` rows with `spell_id` set and `spell_content_hash` NULL
- WHEN Migration 0015 runs
- THEN `spell_content_hash` MUST be backfilled from `spell.content_hash` WHERE `spell.id = artifact.spell_id`.

#### Scenario: Dual-Column Write on Insert
- GIVEN a new artifact being created that references a spell
- WHEN the insert occurs during the Migration 0015 transition period
- THEN the system MUST populate BOTH `spell_id` and `spell_content_hash` on the new `artifact` row (assuming the referenced spell has both).

#### Scenario: Future spell_id Drop
- GIVEN a future migration that drops `spell_id` from `artifact`
- WHEN that migration runs
- THEN the SQLite FK cascade (`ON DELETE CASCADE` from `spell.id`) will no longer apply
- AND the application MUST implement explicit artifact cleanup when a spell is deleted

## Non-Functional Requirements
- **Migration**: Backfill of artifact rows during Migration 0015 SHOULD complete in < 10 seconds for libraries up to 10,000 artifacts.
