# Canonical Spell Hashing API Guide

## Overview
Canonical spell hashing creates a deterministic, content-addressed identifier for spells using a strict schema and SHA-256. The backend exposes the `CanonicalSpell` model and helper functions to:

1. Convert `SpellDetail` into structured canonical data.
2. Validate that data against the JSON schema.
3. Produce a canonical JSON representation.
4. Compute a SHA-256 hash from the canonical JSON.

## Creating a CanonicalSpell
Use `CanonicalSpell::from_spell_detail` to map existing spell records into the canonical structure.

```rust
use crate::models::{CanonicalSpell, SpellDetail};

fn to_canonical(spell: &SpellDetail) -> Result<CanonicalSpell, AppError> {
    CanonicalSpell::from_spell_detail(spell)
}
```

This conversion:
- Derives `tradition` based on `school`/`sphere` presence.
- Normalizes `class_list` and `tags` into arrays.
- Fills structured fields (range, casting time, duration, area) using default units and zeroed numeric values.
- Sets `schema_version` from the schema metadata.

## Validating Against the Schema
Validation must occur before hashing.

```rust
let canonical = CanonicalSpell::from_spell_detail(spell)?;
canonical.validate_schema()?;
```

Validation errors return `AppError::Validation` with paths to offending fields.

## Computing the Hash
Use `compute_hash` to validate and hash in one step:

```rust
let hash = canonical.compute_hash()?;
```

This method:
1. Validates schema compliance.
2. Canonicalizes JSON (sorted keys, normalized arrays, no whitespace, nulls omitted).
3. Hashes the canonical JSON bytes using SHA-256.

## Metadata vs. Content Fields
Canonical hashing excludes metadata fields that should not affect spell identity. The following are excluded from the hash:

- `id`
- `artifacts`
- `created_at`, `updated_at`
- `source_refs`
- `edition`, `author`, `license`

All gameplay-relevant content fields (name, tradition, school, sphere, level, range, components, etc.) are included in the hash.

## Dependency Provenance
Schema validation uses the `jsonschema` crate from crates.io.

- Canonical name: `jsonschema`
- Registry: https://crates.io/crates/jsonschema
- Upstream repository: https://github.com/Stranger6667/jsonschema
- Documentation: https://docs.rs/jsonschema/0.40.2

The crate is required to compile and validate the canonical spell JSON against `spell.schema.json` before hashing.
