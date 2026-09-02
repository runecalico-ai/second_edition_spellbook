# search Specification

## Purpose
This specification defines the spell search and filtering system, enabling users to quickly find spells through full-text keyword search, semantic (vector) search over spell names and descriptions, faceted filtering by structured fields (school, level, class, source, quest/cantrip flags), and saved search configurations. It leverages the hybrid search infrastructure (FTS5 + vector search) established in the architecture spec to provide fast, flexible spell discovery.

> See [design.md Decision #1](../../design.md) for full context.

## Requirements

### Requirement: Keyword Search
The application SHALL provide a full-text search across spell names, descriptions, and other text fields.

#### Scenario: Searching for Fire Spells
- **WHEN** the user types "burn" in the search box
- **THEN** spells containing "burn" in their description or name must be returned

### Requirement: Search Compatibility
The Search system MUST index the human-readable text derived from structured fields.

#### Scenario: Structured Field Indexing
- GIVEN the new structured fields (range, duration, area, saving throw, damage, MR, XP, etc.)
- WHEN building search index
- THEN the human-readable text and legacy/source strings from those fields MUST be indexed.

#### Scenario: FTS MATCH Query
- GIVEN a search term "fire"
- WHEN search is executed
- THEN FTS MATCH query MUST be used (not LIKE)
- AND results MUST be ranked by relevance.

#### Scenario: Boolean Operators (Advanced Search)
- GIVEN search term "fire AND NOT ice" (contains uppercase boolean keywords)
- WHEN search is executed
- THEN advanced mode MUST activate (keywords detected)
- AND only spells matching "fire" without "ice" MUST be returned.

#### Scenario: Basic Search (No Boolean)
- GIVEN search term "fire and ice" (lowercase, no boolean keywords)
- WHEN search is executed
- THEN basic mode MUST be used (phrase search)
- AND spells containing the phrase "fire and ice" MUST be returned.

### Requirement: Faceted Filtering
The search interface SHALL support filtering by school, level, class, source, and other structured fields using multi-select controls and range sliders.

#### Scenario: Filtering by Multiple Schools
- **WHEN** the user selects "Abjuration" and "Alteration" from the school facet
- **THEN** only spells belonging to either of these schools SHALL be displayed

#### Scenario: Filtering by Level Range
- **WHEN** the user sets the level slider range to "0-12"
- **THEN** spells with levels within that range (including 10, 11, 12) SHALL be displayed

#### Scenario: Filtering by Quest Spells
- **WHEN** the user toggles the "Quest Spells" filter
- **THEN** only spells flagged as Quest Spells SHALL be displayed in the results

#### Scenario: Filtering by Cantrip Spells
- **WHEN** the user toggles the "Cantrip Spells" filter
- **THEN** only spells flagged as Cantrips SHALL be displayed in the results

### Requirement: Saved Searches
The application SHALL allow users to persist complex search and filter configurations with a custom name.
#### Scenario: Saving a Frequent Search
- **WHEN** the user saves a search for "Defensive Spells" (Abjuration + Level 1-5)
- **THEN** the search SHALL appear in their saved searches list for quick access

### Requirement: FTS Security
Search queries MUST be safe from injection and malformed FTS syntax.

#### Scenario: Basic Search Escaping
- GIVEN a search term with FTS5 special characters or lowercase logical words (e.g., `(fire) and ice*`)
- WHEN search is executed
- THEN the system MUST escape ALL special characters (`"`, `*`, `(`, `)`, `^`, `:`, `-`, `+`)
- AND the query MUST be treated as a literal phrase.

#### Scenario: Advanced Search Detection
- GIVEN a search term containing uppercase boolean keywords (`AND`, `OR`, `NOT`) as whitespace-delimited tokens
- WHEN search is executed
- THEN the system MUST activate advanced mode
- AND the keywords MUST be passed through as FTS5 operators
- AND all other special characters MUST be escaped to prevent syntax errors.

**FTS5 special characters to escape (basic mode):** `"`, `*`, `(`, `)`, `^`, `:`, `-`, `+`, and boolean keywords treated as literals.
**FTS5 special characters to escape (advanced mode):** `"`, `*`, `(`, `)`, `^`, `:`, `-`, `+` only; boolean keywords (`AND`, `OR`, `NOT`) passed through as operators. `NEAR` is always escaped and never exposed to users.
**Heuristic:** Detect if the trimmed query contains `AND`, `OR`, or `NOT` (case-sensitive) bounded by whitespace or start/end of string (e.g., regex `(^|\s)(AND|OR|NOT)(\s|$)`).

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
- **THEN** the spell write SHALL succeed and return without waiting for embedding upsert
- **AND** the backend SHALL enqueue or attempt embedding generation for that spell while model readiness is available
- **AND** the backend SHALL upsert a 384-dim vector for that spell into `sqlite-vec` when generation succeeds

#### Scenario: Create while model is initializing or unavailable
- **WHEN** a new spell is created and the embedding model is still initializing, not yet provisioned, or in a failed state
- **THEN** the spell write SHALL still succeed
- **AND** the backend SHALL log or record the missing-vector gap for later repair
- **AND** the caller SHALL NOT receive an embedding failure error

#### Scenario: Embed on spell update
- **WHEN** an existing spell's name or description is updated
- **AND** the embedding model is ready
- **THEN** the spell update SHALL succeed without waiting for embedding upsert
- **AND** the backend SHALL enqueue or attempt regeneration and upsert of the spell's vector in `sqlite-vec`

#### Scenario: Update while model is initializing or unavailable
- **WHEN** an existing spell is updated while the embedding model is still initializing, not yet provisioned, or in a failed state
- **THEN** the spell update SHALL still succeed
- **AND** the backend SHALL log or record the missing-vector gap for later repair

#### Scenario: Batch embed on import
- **WHEN** an import operation completes and N spells were inserted
- **AND** the embedding model is ready
- **THEN** the import write path SHALL complete without waiting for embedding batch completion
- **AND** the backend SHALL enqueue or attempt embedding for all N spells in batches of 128
- **AND** each chunk SHALL use one `fastembed` call and one sqlite-vec transaction

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
- **AND** progress `total` SHALL be the number of spells this run will attempt to embed (candidates), not the full library size when `force=false`
- **AND** the frontend MAY use this to display a progress indicator in Settings

#### Scenario: Backfill result
- **WHEN** `reindex_embeddings` completes
- **THEN** it SHALL return `{ total, indexed, skipped, failed }` counts
- **AND** result `total` SHALL be the full library size (not the candidate count used in progress events)

#### Scenario: Startup partial backfill
- **WHEN** the application starts and the embedding model has successfully initialized
- **THEN** the backend SHALL invoke `reindex_embeddings(force=false)` as a background task
- **AND** any spells missing vectors SHALL be silently re-indexed without user interaction
- **AND** this operation SHALL NOT block application startup or any user-facing commands

## Non-Functional Requirements
- **Search latency**: Results MUST return in < 500ms for libraries of 10k spells.
- **Semantic search latency**: `search_spells_semantic` SHALL return results in < 200 ms for libraries of 10k spells (query embedding + sqlite-vec scan).
- **Embedding throughput**: Batch embedding of 1,000 spells SHALL complete in < 30 s on a modern CPU (defined as a desktop CPU released after 2018 with ≥ 4 cores).
- **Vector dimensions**: All stored vectors SHALL be exactly 384 dimensions (all-MiniLM-L6-v2 output); any mismatch SHALL be rejected.

Hardware targets for provisioned desktop machines. Automated tests cover sqlite-vec ranking and 128-row embed chunk paths; they do not assert these wall-clock values in CI. See `docs/DEVELOPMENT.md` (Local ML hardware targets).


