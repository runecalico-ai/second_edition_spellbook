# Schema Versioning Strategy

This document explains the schema versioning system used by the Second Edition Spellbook to manage evolution of the canonical spell data format.

---

## Overview

The canonical spell schema uses a versioning system to ensure:
- **Backward compatibility**: Old spells are automatically migrated to current schema
- **Forward compatibility warnings**: Newer schemas are handled gracefully
- **Hash stability**: Schema version changes don't invalidate existing content hashes

## Current Schema Version

**Current Version**: `2`

Defined in [`canonical_spell.rs`](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/models/canonical_spell.rs#L18):

```rust
pub const CURRENT_SCHEMA_VERSION: i64 = 2;
pub const MIN_SUPPORTED_SCHEMA_VERSION: i64 = 1; // v1 spells are valid for migration via migrate_to_v2(); do not reject them
```

Every `CanonicalSpell` includes a `schema_version` field with a default value of `2`.

---

## Migration Strategy

### Migration: Version 0 → 2 (via `normalize`)

The `migrate_to_v2()` guard is `schema_version < 2`, which covers **both** v0 and v1 spells. In the standard pipeline (`normalize()` → `validate()`, used by `compute_hash()` and save paths), `normalize()` calls `migrate_to_v2()` first, upgrading v0 → v2 before validation ever runs. The spell is therefore valid by the time `validate()` sees it.

However, calling `validate()` in isolation (without prior normalization) **will reject** `schema_version = 0` because it is below `MIN_SUPPORTED_SCHEMA_VERSION = 1`. This distinction matters only for code paths that call `validate()` directly.

### Migration: Version 1 → 2

When a spell with `schema_version < 2` is normalized, `migrate_to_v2()` is invoked (guarded by `schema_version < 2`):

```rust
if self.schema_version < 2 {
    let result = self.migrate_to_v2();
    // result.notes_truncated check happens on single-spell path
}
```

This covers both `schema_version = 0` and `schema_version = 1` spells, migrating them directly to version 2. In the standard pipeline, `normalize()` runs this migration **before** `validate()`, so v0 spells are upgraded to v2 before validation occurs.

The migration performs the following steps in order:

1. **`SavingThrowSpec.dm_guidance` → `notes`**: `dm_guidance` content is appended to `notes` (newline-separated if `notes` is non-empty), then `dm_guidance` is cleared.

2. **CastingTime 5e unit remapping**: If `casting_time.unit` is `"action"`, `"bonus_action"`, or `"reaction"`, it is remapped to `"special"` and `casting_time.text` is copied into `raw_legacy_value` (only if `raw_legacy_value` is not already populated). If `casting_time.text` is also empty/null, the value is synthesized from `base_value + unit` (e.g., `"1 action"`).

3. **`SpellDamageSpec` field rename (deserialization-time)**: When old JSON with `SpellDamageSpec.raw_legacy_value` is deserialized, serde's `alias` attribute (`#[serde(alias = "raw_legacy_value")]` on `source_text`) transparently maps the field to `source_text`. No executable code runs in `migrate_to_v2()` for this step — it is handled automatically at deserialization time.

4. **Version stamp**: `schema_version` is set to `2`.

**Rust function**: `migrate_to_v2()` in `canonical_spell.rs`

**Bulk command**: `migrate_all_spells_to_v2` Tauri command

**Return type**: `MigrateV2Result { notes_truncated: bool, truncated_spell_id: Option<i64> }`
- On single-spell normalization: the caller returns `Err` and does **not** persist if `notes_truncated = true`
- In bulk migration: truncated spells are recorded in `failed` without aborting the batch

After migration, the spell is fully re-normalized and re-hashed. This is a one-time migration cost affecting all stored spells — all content hashes change after migration.

> [!NOTE]
> In the standard pipeline (`compute_hash`, save paths), `normalize()` runs `migrate_to_v2()` **before** `validate()`. Because the migration guard is `schema_version < 2`, both v0 and v1 spells are upgraded to v2 before validation. A standalone `validate()` call (without prior normalization) will reject `schema_version = 0` as below `MIN_SUPPORTED_SCHEMA_VERSION = 1`.

### Validation Behavior

During spell validation, the system handles version mismatches as follows:

#### Invalid Versions (< 1 — below minimum supported)
- **Behavior**: Rejected by standalone `validate()` calls (without prior normalization)
- **Standard pipeline**: In `compute_hash()` and save paths, `normalize()` upgrades v0 → v2 via `migrate_to_v2()` before `validate()` runs, so v0 spells migrate successfully
- **Direct `validate()` only**: Rejects with error (`schema_version < MIN_SUPPORTED_SCHEMA_VERSION`)

#### Older Versions (< 2, >= 1)
- **Behavior**: Silently migrated to version 2 via `migrate_to_v2()` during `normalize()`
- **Result**: Spell is migrated and processed normally (no warning logged)

#### Newer Versions (> 2)
- **Behavior**: Logs a warning, continues processing
- **Warning Message**:
  ```
  WARNING: Spell '{name}' uses a newer schema version ({version}).
  This application supports up to version {CURRENT_SCHEMA_VERSION}.
  Forward compatibility is not guaranteed.
  ```
- **Result**: Spell is processed, but behavior may be unexpected

> [!NOTE]
> The system uses **warnings instead of hard errors** to maximize compatibility and allow gradual migration across multiple application versions.

---

## Breaking Changes: v1 → v2

Version 2 introduces multiple breaking modifications. Every previously-hashed spell will produce a different SHA-256 hash after re-normalization.

- **Universal `raw_legacy_value` persistence**: `raw_legacy_value` is now populated unconditionally on every parse for all hashed computed fields (`AreaSpec`, `DurationSpec`, `RangeSpec`, `SavingThrowSpec`, `casting_time`). Per §2.2.1 of [`canonical-serialization.md`](./architecture/canonical-serialization.md), `raw_legacy_value` is included in the canonical hash, so every spell that previously lacked this field will produce a different hash after re-normalization.

- **5e casting time units removed**: `"action"`, `"bonus_action"`, and `"reaction"` have been removed from the `casting_time.unit` enum. Existing spells with these values are remapped to `"special"` during `migrate_to_v2()`, with the original text preserved in `raw_legacy_value`.

- **`SavingThrowSpec.dm_guidance` removed**: The field has been removed from the JSON schema and is **no longer serialized** (excluded from all output and the canonical hash). In the Rust type it is retained as a deserialization-only shim (`legacy_dm_guidance` with `#[serde(skip_serializing, rename = "dm_guidance")]`) so that pre-v2 JSON round-trips without data loss. Content is migrated to `notes` during `migrate_to_v2()`.

- **`SpellDamageSpec.raw_legacy_value` renamed to `source_text`**: Now a non-hashed metadata field (excluded from canonical hash), consistent with `ExperienceComponentSpec.source_text` and `MagicResistanceSpec.source_text`.

---

## Hash Stability Guarantee

### Why It Matters

Content hashes are used to:
- Detect duplicate spells
- Track changes over time
- Ensure data integrity

**Critical requirement**: Hashes must remain stable even when schema version changes.

### Implementation

The `schema_version` field is **excluded from canonical JSON** before hashing (see `prune_metadata_recursive` in `canonical_spell.rs`, which also removes other root metadata, all-depth metadata such as `source_text`, and empty objects/strings; empty arrays are only pruned at root for optional keys `class_list`, `tags`, `subschools`, `descriptors`—required or nested empty arrays are retained).

**Result**: Two identical spells with different schema versions produce the **same content hash**.

### Test Coverage

Hash stability is verified by comprehensive tests:

```rust
#[test]
fn test_hash_stability_across_schema_versions() {
    spell1.schema_version = 1;
    spell2.schema_version = 0; // Historical/migration version

    assert_eq!(
        spell1.compute_hash().unwrap(),
        spell2.compute_hash().unwrap(),
        "Hash must be identical across supported schema versions (0 and 1)"
    );
}
```

---

## Future Schema Evolution

### Adding New Schema Versions

When evolving the schema (e.g., adding new fields or changing validation rules):

1. **Increment `CURRENT_SCHEMA_VERSION`**:
   ```rust
   pub const CURRENT_SCHEMA_VERSION: i64 = 3; // example: next version
   ```

2. **Add migration logic in `normalize()`**:
   ```rust
   if self.schema_version < 3 {
       // Migrate version 2 → 3
       // migrate_to_v3() sets self.schema_version = 3 as its last step
       self.migrate_to_v3();
   }
   ```

3. **Update validation to handle new version**

4. **Add tests for new version behavior**

### Migration Best Practices

> [!IMPORTANT]
> When adding new schema versions, follow these guidelines:

- **Preserve backward compatibility**: Old spells should always be migratable
- **Log warnings, not errors**: Allow older applications to handle newer schemas gracefully
- **Exclude metadata from hashing**: Never include `schema_version` in content hash
- **Test hash stability**: Verify hashes remain constant across version upgrades
- **Document breaking changes**: Clearly document what changed between versions

### Non-Breaking Changes

For minor schema changes that don't require a version bump:
- Adding optional fields (with proper defaults)
- Relaxing validation constraints
- Improving parser patterns
- Documentation updates

These changes can be made without incrementing the schema version.

---

## Application Behavior by Version

| Schema Version | Application Behavior |
|----------------|---------------------|
| `< 1` (e.g. `0`) | Migrated to version 2 via `migrate_to_v2()` in the standard pipeline (`normalize` → `validate`). Rejected only by standalone `validate()` calls without prior normalization |
| `1` | Migrated to version 2 via `migrate_to_v2()` during normalization |
| `2` (current) | Processed normally, validated against current schema |
| `> 2` (future) | Warning logged, processed with forward compatibility mode |

---

## Database Storage

The `schema_version` is stored in the database alongside canonical spell data:

```sql
UPDATE spell
SET canonical_data = ?,
    content_hash = ?,
    schema_version = ?
WHERE id = ?
```

This allows the application to:
- Track which spells need migration
- Handle mixed-version databases gracefully
- Support gradual rollout of schema changes

---

## Related Documentation

- [MIGRATION.md](./MIGRATION.md) - Data migration guide for users
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Troubleshooting migration issues
- [canonical-serialization.md](./architecture/canonical-serialization.md) - Normalization and hashing rules

---

**Last Updated**: 2026-03-01
