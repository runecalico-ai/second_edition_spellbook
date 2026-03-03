# Capability: Character and Spell List References

> See [design.md Decision #5](../../design.md) for full context.
>
> **Merged Spec Note:** This specification covers both character spellbooks and per-class spell lists (known/prepared spells). Both are stored in the `character_class_spell` table. The former `spellbooks/spec.md` has been merged here.

## MODIFIED Requirements

> **Alignment note:** The main `characters/spec.md` and this change both require spell deduplication by `content_hash` for character import/export.

### Requirement: Immutable Spell References
Characters and Spell Lists MUST reference spells using the Canonical Spell Hash (`spell_content_hash`).

#### Scenario: Versioning
- GIVEN a character or list with "Fireball" (Hash A)
- WHEN a new "Fireball" (Hash B) is imported and saved as a new distinct spell (e.g., via 'Keep Both')
- THEN the character or list MUST still point to Hash A.

#### Scenario: Missing Spell Handling
- GIVEN a character or list with a spell reference to Hash H
- AND spell H no longer exists in library
- WHEN viewing character spellbook or spell list
- THEN "Spell no longer in library" placeholder MUST appear
- AND "Remove" action MUST be available.

#### Scenario: Spell Replaced via Import
- GIVEN a character or list with "Fireball" (Hash A)
- AND user imports a new "Fireball" (Hash B) and selects "Replace with New"
- WHEN the import replaces the spell
- THEN the system MUST perform a cascading update
- AND the character or list MUST now reference Hash B seamlessly without requiring manual intervention.

#### Scenario: Explicit Upgrade
- GIVEN a character or list with "Fireball" (Hash A)
- AND "Fireball" (Hash B) exists in library
- WHEN user explicitly chooses to upgrade
- THEN character reference MUST update to Hash B.

Upgrade is offered when the same display name has another spell row with a different `content_hash` (e.g. after importing an updated version of the same spell).

#### Scenario: Spell List Portability
- GIVEN a per-class spell set (e.g. known/prepared spells) containing "Fireball"
- WHEN exported and imported on another machine
- THEN the entry for "Fireball" MUST resolve using its Content Hash
- AND MUST NOT depend on the local integer ID of "Fireball" on the source machine.

#### Scenario: Migration from ID to Hash
- GIVEN existing rows in `character_class_spell` with `spell_id` only
- WHEN migration runs
- THEN `spell_content_hash` MUST be backfilled from `spell.content_hash`
- AND join to `spell` on hash MUST succeed.

### Requirement: Migration Period Dual-Column Writes
During the Migration 0015 transition period, both IDs and Hashes are used.

#### Scenario: Dual-Column Write on Insert
- GIVEN a new spell being added to a character or spell list
- WHEN the insert occurs during the Migration 0015 transition period
- THEN the system MUST populate BOTH `spell_id` and `spell_content_hash` on the new `character_class_spell` row (assuming the referenced spell has both).

## Non-Functional Requirements
- **Lookup performance**: Hash lookup MUST complete in < 10ms for libraries of 10k spells.
- **Migration**: Backfill of 10k list entries SHOULD complete in < 60 seconds.
