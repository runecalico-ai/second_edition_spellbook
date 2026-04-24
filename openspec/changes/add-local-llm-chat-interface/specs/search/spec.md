# search Specification (delta)

## ADDED Requirements

### Requirement: Embedding Model Provisioning and Status
The application SHALL provision the approved `fastembed-rs` embedding model once and store its assets under `SpellbookVault/models/`. The user SHALL be able to provision that model by explicit in-app download or verified side-load of the exact approved bundle.

#### Scenario: Reporting embedding model states
- **WHEN** `embeddings_status` is invoked
- **THEN** it SHALL return one of: `notProvisioned`, `downloading`, `initializing`, `ready`, or `error`

#### Scenario: Side-load success
- **WHEN** the user chooses "Add Local Model" from semantic mode and selects the exact approved embedding model bundle
- **THEN** the backend SHALL verify the expected bundle identity and SHA-256 hash
- **AND** SHALL copy the bundle into `SpellbookVault/models/`
- **AND** SHALL transition the embedding model status to `initializing` or `ready`

#### Scenario: Side-load rejection
- **WHEN** the user selects a local embedding model bundle that does not match the approved identity or SHA-256 hash
- **THEN** the backend SHALL reject the bundle
- **AND** SHALL keep the embedding model status unchanged
- **AND** SHALL return a validation error

### Requirement: Semantic Search Availability UX
The existing Library semantic mode SHALL become a real feature in v1.

#### Scenario: Semantic mode before provisioning
- **WHEN** the user switches the Library to semantic mode and `embeddings_status` is `notProvisioned`
- **THEN** the Library SHALL show a semantic-mode empty state
- **AND** that empty state SHALL include an install action for download or side-load
- **AND** the UI SHALL NOT present the feature as a broken search result

### Requirement: Semantic Spell Search
The application SHALL provide vector similarity search over spell names and descriptions with embeddings from `fastembed-rs` (all-MiniLM-L6-v2, 384 dimensions) stored in `sqlite-vec`.

#### Scenario: Semantic query returns relevant spells
- **WHEN** the user submits a natural-language query such as "spells that protect from physical attacks"
- **THEN** the `search_spells_semantic` command SHALL embed the query and return up to N spells ranked by cosine similarity
- **AND** results SHALL include spells semantically related to the query even if no query keyword appears in the spell text

#### Scenario: Result structure
- **WHEN** `search_spells_semantic` returns results
- **THEN** each result SHALL include the normal spell summary fields plus a `cosineDistance` score
- **AND** results SHALL be ordered by ascending cosine distance (most similar first)

#### Scenario: Empty result set
- **WHEN** no spells have been indexed (vector table is empty)
- **THEN** `search_spells_semantic` SHALL return an empty array
- **AND** SHALL NOT return an error

#### Scenario: Query while model still loading
- **WHEN** `search_spells_semantic` is invoked and the embedding model is still initializing at startup
- **THEN** the command SHALL wait for initialization to complete before proceeding
- **AND** SHALL NOT return stale or zero-vector results

#### Scenario: Query when model failed to load
- **WHEN** the embedding model failed to initialize at startup (e.g., ONNX runtime error, model download failure)
- **THEN** `search_spells_semantic` SHALL return an error that states the embedding model is unavailable
- **AND** SHALL NOT block indefinitely

### Requirement: Spell Embedding Indexing
The application SHALL maintain a vector index of all spells in `sqlite-vec`. It SHALL generate each vector from the spell name and description text.

#### Scenario: Embed on spell create
- **WHEN** a new spell is created via any command (`create_spell`, import, etc.)
- **AND** the embedding model is ready
- **THEN** the backend SHALL generate and upsert a 384-dim vector for that spell into `sqlite-vec` before returning

#### Scenario: Create while model is initializing or unavailable
- **WHEN** a new spell is created and the embedding model is still initializing, not yet provisioned, or in a failed state
- **THEN** the spell write SHALL still succeed
- **AND** the backend SHALL log or record the missing-vector gap for later repair
- **AND** the caller SHALL NOT receive an embedding failure error

#### Scenario: Embed on spell update
- **WHEN** an existing spell's name or description is updated
- **AND** the embedding model is ready
- **THEN** the backend SHALL regenerate and upsert the spell's vector in `sqlite-vec`

#### Scenario: Update while model is initializing or unavailable
- **WHEN** an existing spell is updated while the embedding model is still initializing, not yet provisioned, or in a failed state
- **THEN** the spell update SHALL still succeed
- **AND** the backend SHALL log or record the missing-vector gap for later repair

#### Scenario: Batch embed on import
- **WHEN** an import operation completes and N spells were inserted
- **AND** the embedding model is ready
- **THEN** the backend SHALL embed all N spells in a single `fastembed-rs` batch call
- **AND** SHALL upsert all resulting vectors into `sqlite-vec` in a single transaction

#### Scenario: Import while model is initializing or unavailable
- **WHEN** an import operation completes while the embedding model is still initializing, not yet provisioned, or in a failed state
- **THEN** the import SHALL still succeed
- **AND** the backend SHALL record missing-vector gaps for later repair

#### Scenario: Embedding model ready at startup
- **WHEN** the application starts
- **THEN** the `fastembed-rs` embedding model SHALL be loaded in a background task
- **AND** spell write operations that arrive before loading completes SHALL proceed without blocking

#### Scenario: Embedding model initialization failure
- **WHEN** the `fastembed-rs` model fails to initialize at startup
- **THEN** the backend SHALL log the error and transition `EmbeddingState` to a failed state
- **AND** spell write operations SHALL proceed without generating embeddings (non-fatal)
- **AND** `search_spells_semantic` SHALL return an error for the duration of the session

### Requirement: Embedding Backfill
The application SHALL provide a `reindex_embeddings` command to generate missing vectors for spells that predate the feature or lost their vectors.

#### Scenario: Partial backfill (default)
- **WHEN** `reindex_embeddings` is invoked with `force=false`
- **THEN** only spells with no existing `sqlite-vec` entry SHALL be embedded
- **AND** spells that already have vectors SHALL be counted as `skipped`

#### Scenario: Full reindex
- **WHEN** `reindex_embeddings` is invoked with `force=true`
- **THEN** ALL spells SHALL be re-embedded regardless of existing vectors
- **AND** existing vectors SHALL be overwritten

#### Scenario: Backfill progress reporting
- **WHEN** `reindex_embeddings` is running
- **THEN** the backend SHALL emit `embeddings://reindex-progress` events with `{ current: u32, total: u32 }` payloads
- **AND** the frontend MAY use this to display a progress indicator in Settings

#### Scenario: Backfill result
- **WHEN** `reindex_embeddings` completes
- **THEN** it SHALL return `{ total, indexed, skipped, failed }` counts

#### Scenario: Startup partial backfill
- **WHEN** the application starts and the embedding model has successfully initialized
- **THEN** the backend SHALL invoke `reindex_embeddings(force=false)` as a background task
- **AND** any spells missing vectors SHALL be silently re-indexed without user interaction
- **AND** this operation SHALL NOT block application startup or any user-facing commands

## Non-Functional Requirements
- **Semantic search latency**: `search_spells_semantic` SHALL return results in < 200 ms for libraries of 10k spells (query embedding + sqlite-vec scan).
- **Embedding throughput**: Batch embedding of 1,000 spells SHALL complete in < 30 s on a modern CPU (defined as a desktop CPU released after 2018 with ≥ 4 cores).
- **Vector dimensions**: All stored vectors SHALL be exactly 384 dimensions (all-MiniLM-L6-v2 output); any mismatch SHALL be rejected.
