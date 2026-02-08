# Schema Versioning Strategy

This document explains the schema versioning system used by the Second Edition Spellbook to manage evolution of the canonical spell data format.

---

## Overview

The canonical spell schema uses a versioning system to ensure:
- **Backward compatibility**: Old spells are automatically migrated to current schema
- **Forward compatibility warnings**: Newer schemas are handled gracefully
- **Hash stability**: Schema version changes don't invalidate existing content hashes

## Current Schema Version

**Current Version**: `1`

Defined in [`canonical_spell.rs`](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src-tauri/src/models/canonical_spell.rs#L18):

```rust
pub const CURRENT_SCHEMA_VERSION: i64 = 1;
pub const MIN_SUPPORTED_SCHEMA_VERSION: i64 = 0;
```

Every `CanonicalSpell` includes a `schema_version` field with a default value of `1`.

---

## Migration Strategy

### Automatic Migration (Version 0 → 1)

When a spell with `schema_version: 0` is normalized, it is **automatically upgraded** to version 1:

```rust
if self.schema_version == 0 || self.schema_version < CURRENT_SCHEMA_VERSION {
    self.schema_version = CURRENT_SCHEMA_VERSION;
}
```

This ensures legacy spells created before schema versioning was implemented are seamlessly migrated.

### Validation Behavior

During spell validation, the system handles version mismatches as follows:

#### Invalid Versions (< 0)
- **Behavior**: Reject with error
- **Result**: Import and hash computation fail

#### Older Versions (< 1, >= 0)
- **Behavior**: Logs a warning, allows migration
- **Warning Message**:
  ```
  WARNING: Spell '{name}' uses an older schema version ({version}).
  Migrating to version {CURRENT_SCHEMA_VERSION} for hashing.
  ```
- **Result**: Spell is migrated and processed normally

#### Newer Versions (> 1)
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
    spell2.schema_version = 2; // Hypothetical future version

    assert_eq!(
        spell1.compute_hash().unwrap(),
        spell2.compute_hash().unwrap(),
        "Hash must be identical across schema versions"
    );
}
```

---

## Future Schema Evolution

### Adding New Schema Versions

When evolving the schema (e.g., adding new fields or changing validation rules):

1. **Increment `CURRENT_SCHEMA_VERSION`**:
   ```rust
   pub const CURRENT_SCHEMA_VERSION: i64 = 2;
   ```

2. **Add migration logic in `normalize()`**:
   ```rust
   if self.schema_version < 2 {
       // Migrate version 1 → 2
       self.migrate_to_v2();
       self.schema_version = 2;
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
| `< 0` | **Rejected** – Import and hashing fail |
| `0` | Auto-migrated to version 1 during normalization |
| `1` (current) | Processed normally, validated against current schema |
| `> 1` (future) | Warning logged, processed with forward compatibility mode |

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

**Last Updated**: 2026-02-06
