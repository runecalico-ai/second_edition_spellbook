# Canonical Spell Serialization Contract

To ensure that spells with identical content produce the same SHA-256 hash, we strictly follow a canonicalization process before hashing.

## 1. JSON Canonicalization Scheme (JCS)
We use [RFC 8785 (JSON Canonicalization Scheme)](https://tools.ietf.org/html/rfc8785) as the baseline.
- **Object Keys**: Sorted lexicographical order (code unit order).
- **Whitespace**: No whitespace between keys, colons, values, or separators.
- **Strings**: UTF-8, strictly escaped according to JCS.
- **Implementation**: `serde_json_canonicalizer` is used for RFC 8785 compliance.

## 2. Application-Level Normalization
Before JCS processing, the `CanonicalSpell` object undergoes the following normalization:

### 2.1 Arrays as Sets
Fields representing unordered sets must have their elements sorted lexicographically:
- `class_list`: Sorted (A-Z).
- `tags`: Sorted (A-Z).
- `subschools`: Sorted (A-Z).
- `descriptors`: Sorted (A-Z).

### 2.2 Nulls vs Omitted
- **Omitted (skip_serializing_if)**: Optional fields (both complex objects like `range` and nullable strings like `school`, `sphere`, `saving_throw`, `reversible`) are **omitted** from the JSON if they are `None`. This ensures compliance with the strict schema constraints and deterministic hashing.
- **Metadata Exclusion**: `source_refs`, `edition`, `author`, `version`, `license`, and `schema_version` are strictly excluded from the canonical JSON.

### 2.3 Integers for Booleans
To maintain compatibility with the canonical resource specification, boolean flags are normalized to integers:
- `is_cantrip`: `0` (false) or `1` (true).
- `is_quest_spell`: `0` (false) or `1` (true).

## 3. Hashing Process
1. Validate `CanonicalSpell` against `spell.schema.json`.
2. Normalize (sort arrays, convert booleans to integers).
3. Serialize to UTF-8 bytes using JCS (omitting metadata).
4. Compute SHA-256 hash of the bytes.
5. Encode hash as a lowercase hex string (64 characters).
