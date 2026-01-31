# Architecture Overview

## Canonical Spell Hashing
Canonical spell hashing provides deterministic spell identity across imports, exports, and synchronization.

### Hash Computation Flow
```
SpellDetail
   ↓ (from_spell_detail)
CanonicalSpell
   ↓ (validate_schema)
Schema-compliant JSON
   ↓ (canonicalize: sorted keys, normalized arrays, nulls omitted)
Canonical JSON
   ↓ (SHA-256)
content_hash
```

### Canonicalization Rules (Summary)
- Keys are sorted lexicographically at every depth.
- Arrays representing sets (`class_list`, `tags`, `subschools`, `descriptors`) are sorted.
- Null values are omitted.
- Metadata fields are excluded from hashing (`id`, `artifacts`, timestamps, `source_refs`, `edition`, `author`, `license`).

### Schema Versioning
`schema_version` is stored alongside canonical data to detect compatibility issues.

- Incoming data with a newer schema version is rejected and logged.
- Future schema migrations should document breaking changes and provide conversion utilities.

### Collision Resistance
SHA-256 provides collision resistance (~2^128 work factor). Collision detection will be enforced once content hashes are stored with a unique constraint in the spell storage layer.
