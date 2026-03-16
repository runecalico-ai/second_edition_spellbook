# Capability: Import/Export

> See [design.md Decisions #3, #4](../../design.md) for full context.

## SourceRef Schema

A `SourceRef` has the following structure (aligned with `spell.schema.json` and backend `SourceRef` type; `page` is `Option<serde_json::Value>` in Rust to allow integer or string):
```
SourceRef: {
	book: String (required),
	system: String (optional),
	page: Integer|String|null (optional),
	note: String|null (optional),
	url: String (optional; if present must be http:, https:, or mailto:)
}
```
When two SourceRefs are merged, deduplication uses this key policy:
- If both refs have non-empty `url`, deduplicate by `url`.
- Otherwise deduplicate by `(system, book, page, note)`.
When duplicate refs are merged, the existing ref's fields are preserved.

## MODIFIED Requirements

### Requirement: Interchange ID
Exported spells MUST use their Content Hash as the ID. Export MUST always use the current app schema version (`CURRENT_SCHEMA_VERSION`); downgrading exports for older recipients is out of scope.

#### Scenario: Export Transformation
- GIVEN a spell with Hash "abc"
- WHEN exported
- THEN `id` field MUST be "abc".

#### Scenario: Bundle Format Version
- GIVEN a bundle export
- WHEN exported
- THEN `schema_version` field MUST be present (required)
- AND `bundle_format_version` field MUST be present (required).

#### Scenario: Export Rejected for NULL Hash
- GIVEN a spell with `content_hash` IS NULL (un-migrated)
- WHEN export is attempted
- THEN the system MUST reject the export for that spell
- AND prompt the user to run migration first.

### Requirement: Hash-Based Deduplication
Import MUST identify existing content by `content_hash` before checking for name collisions.

Import MUST apply metadata normalization and cardinality truncation (`tags`, `source_refs`) before schema validation and hash/deduplication decisions.

#### Scenario: Hash Match Skips Insert
- GIVEN a spell with Hash "abc" already exists in the library
- WHEN importing a spell with Hash "abc"
- THEN the system MUST NOT insert a new row
- AND the system MUST merge metadata (see Requirement: Metadata Merge on Deduplication).

### Requirement: Conflict Resolution
Import MUST handle name collisions gracefully when hashes differ.

#### Scenario: Same Name, Different Hash
- GIVEN existing spell "Fireball" (Hash A)
- WHEN importing "Fireball" (Hash B)
- THEN conflict dialog MUST appear
- AND options: Keep Existing, Replace, Keep Both, Apply to All.

#### Scenario: Keep Both Collision Avoidance
- GIVEN existing spells "Fireball" and "Fireball (1)"
- WHEN importing new "Fireball" with different hash and user selects "Keep Both"
- THEN new spell MUST be named "Fireball (2)" (increment until unique).

#### Scenario: Replace with New Updates Existing Row
- GIVEN existing spell "Fireball" (Hash A, integer id 42)
- WHEN importing "Fireball" (Hash B) and user selects "Replace with New"
- THEN spell row id 42 MUST be updated with Hash B content
- AND content_hash MUST change from A to B
- AND characters matching Hash A MUST be cascaded to Hash B automatically (no broken references).
- AND the replace + cascade operation MUST execute atomically in one DB transaction.

#### Scenario: Replace Rolls Back on Cascade Failure
- GIVEN existing spell "Fireball" (Hash A, integer id 42)
- AND replacing to Hash B requires cascading updates in `character_class_spell` or `artifact`
- WHEN any required cascade update fails
- THEN the Replace operation MUST fail and roll back entirely
- AND spell row id 42 MUST remain unchanged (including Hash A)
- AND no partial cascade updates MUST be committed.

### Requirement: Partial Import Failure Handling
Import MUST handle mixed batches where some spells are valid and others fail validation.

#### Scenario: Mixed Valid and Invalid Spells in Batch
- GIVEN a bundle containing 5 spells: 3 valid and 2 with schema errors
- WHEN importing the bundle
- THEN the 3 valid spells MUST be committed to DB
- AND the 2 invalid spells MUST be skipped
- AND import summary MUST show: 3 imported, 2 validation failures
- AND each failure MUST include spell name and error reason.

### Requirement: Metadata Merge on Deduplication
When a duplicate hash is imported, metadata MUST merge (This rule applies ONLY to "Skip" Deduplication flow, not to "Replace" flow, which relies on strict overwrites). Import results MUST distinguish: total duplicates skipped, of which N had metadata merged (tags or source_refs changed) and M had no changes.

#### Scenario: Tag Merge
- GIVEN existing spell with tags ["fire", "damage"]
- WHEN importing same hash with tags ["fire", "homebrew"]
- THEN resulting tags MUST be ["fire", "damage", "homebrew"] (union, no duplicates).
- NOTE: If merged tag count exceeds 100, keep the first 100 alphabetically sorted.

#### Scenario: source_refs Merge
- GIVEN existing spell with source_refs [{"book": "PHB", "url": "https://a.com"}]
- WHEN importing same hash with source_refs [{"book": "PHB", "url": "https://a.com"}, {"book": "Tome of Magic", "url": "https://b.com"}]
- THEN resulting source_refs MUST contain both unique refs.
- NOTE: If merged count exceeds 50, keep existing refs first, then append new refs up to the limit.

### Requirement: Import Version Validation
Import MUST validate schema and bundle format versions before processing.

#### Scenario: Warn on Future Schema Version
- GIVEN the app's current schema version (from code)
- WHEN importing a spell with a schema version greater than the app's
- THEN import MUST log/show a forward-compatibility warning
- AND import SHOULD continue processing using best-effort handling.

#### Scenario: Reject Future Bundle Format Version
- GIVEN the app's supported bundle_format_version (from code)
- WHEN importing a bundle with bundle_format_version greater than supported
- THEN import MUST reject the entire bundle
- AND error message MUST indicate unsupported bundle format version.

#### Scenario: Accept Current or Lower Schema Version
- GIVEN the app's current schema version (from code)
- WHEN importing a spell with schema version equal to or lower than the app's
- THEN import MUST accept the spell and process normally (including migration to the current version before hashing).

#### Scenario: Reject Missing Bundle Format Version in Bundle Export
- GIVEN a bundle JSON containing a `spells` array that omits `bundle_format_version` entirely
- WHEN importing
- THEN import MUST reject the bundle
- AND error message MUST indicate missing required field.

#### Scenario: Accept Missing Bundle Format Version in Single-Spell Export
- GIVEN a single-spell JSON object that omits `bundle_format_version` entirely
- WHEN importing
- THEN import MUST process the spell normally without erroring for the missing bundle field.

#### Scenario: Bundle vs Single-Spell Detection
- GIVEN an import JSON payload
- WHEN the importer inspects the top-level structure
- THEN if a top-level `spells` key exists and is an array, the payload MUST be treated as a bundle (require `bundle_format_version`)
- AND if no top-level `spells` array exists, the payload MUST be treated as a single-spell export.

#### Scenario: Reject Malformed Bundle Shape
- GIVEN an import JSON payload with top-level `spells` key present but not an array
- WHEN importing
- THEN import MUST reject the payload as malformed bundle input
- AND error message MUST indicate `spells` must be an array when present.

#### Scenario: Tampered Import Hash
- GIVEN imported spell with `content_hash` field "X"
- WHEN recomputed hash from spell content is "Y" (X ≠ Y)
- THEN import MUST warn user of integrity mismatch (non-blocking inline warning in the import summary; the spell is counted as "imported with warning", not rejected)
- AND the recomputed hash "Y" MUST be used for deduplication (not the imported value "X").

#### Scenario: Replace Hash Collision
- GIVEN existing spell "Fireball" (Hash A, integer id 42) AND existing spell "Super Fireball" (Hash B)
- WHEN importing a new "Fireball" (Hash B) and user selects "Replace with New"
- THEN import MUST fail the Replace operation with a clear error (e.g., "This version already exists in your library as Super Fireball")
- AND the spell row id 42 MUST NOT be modified
- AND Hash A MUST remain in the DB.

### Requirement: URL Security and Validation
All `SourceRef` URLs MUST be validated upon import.

#### Scenario: Protocol Allowlist
- GIVEN a SourceRef with URL "javascript:alert(1)"
- WHEN importing
- THEN the system MUST apply configured URL policy (`import.sourceRefUrlPolicy`)
- AND the default policy (`drop-ref`) MUST reject that SourceRef but continue importing the spell with a warning
- AND if policy is `reject-spell`, the system MUST reject the spell
- AND error message MUST indicate unsupported protocol.
- ALLOWED: `http:`, `https:`, `mailto:`.
- REJECTED: `javascript:`, `data:`, `ipfs:`, and all other protocols.

#### Scenario: Intra-Bundle Deduplication Order
- GIVEN a bundle containing two spells with identical computed hash
- WHEN importing
- THEN spells MUST be processed in document order
- AND the first spell MUST be inserted (or deduplicated against the DB)
- AND the second spell MUST be treated as a duplicate of the first (skip insertion, merge metadata).

#### Scenario: XSS Prevention
- GIVEN a SourceRef with URL containing HTML tags
- WHEN importing
- THEN the system MUST sanitize the string before storage or display.

## Non-Functional Requirements
- **Import throughput**: 1000 spells SHOULD import in < 30 seconds.
- **Tag limit**: Maximum 100 tags per spell. If a single imported spell payload exceeds this limit, the system MUST automatically truncate the array to the first 100 unique tags (alphabetically sorted) before insertion or validation.
- **source_refs limit**: Maximum 50 source_refs per spell. If a single imported spell payload exceeds this limit, the system MUST automatically truncate the array to the first 50 unique refs using the SourceRef dedup key policy (URL when present on both refs, otherwise `(system, book, page, note)`) before insertion or validation.
