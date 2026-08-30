# architecture Specification

## Purpose
This specification defines the foundational technical architecture of the Spellbook application, a local-first desktop application for managing AD&D 2nd Edition spell libraries and character profiles. It establishes the core technology stack (Tauri + SQLite + Python sidecar), with embeddings and LLM inference in Rust. It also covers data storage patterns, hybrid search infrastructure (FTS5 + vector search), and quality assurance practices (E2E testing) that all other specifications build upon.
## Requirements
### Requirement: Local-First Desktop App
The application SHALL run as a standalone desktop executable on Windows, macOS, and Linux without requiring a network connection for core functionality.
#### Scenario: Offline Startup
- **WHEN** the application is launched without an internet connection
- **THEN** it should start up successfully and allow access to all local library data

### Requirement: SQLite Data Storage
All spell, character, and application data SHALL be stored in a local SQLite database that is user-accessible and portable. The `spell` table SHALL include `is_quest_spell` and `is_cantrip` columns (INTEGER) to support extended magic types. The database SHALL include character profile tables: `character` (extended with race, alignment, com_enabled), `character_ability`, `character_class`, and `character_class_spell`.

#### Scenario: Database Accessibility
- **WHEN** the user locates the `SpellbookVault` directory
- **THEN** they should find a standard SQLite database file that can be backed up or inspected with external tools

#### Scenario: Character Profile Tables
- **WHEN** the database is initialized or migrated
- **THEN** the `character`, `character_ability`, `character_class`, and `character_class_spell` tables SHALL be created with appropriate foreign keys and indexes

### Requirement: Hybrid Search Indexing
The application SHALL use FTS5 for keyword search and `sqlite-vec` for vector-based semantic search.
#### Scenario: Index Initialization
- **WHEN** the database is initialized
- **THEN** the `spell_fts` virtual table and `spell_vec` vector table must be correctly created and configured

### Requirement: Python Sidecar for ML
The Python sidecar SHALL handle document import and export only (Markdown, PDF, DOCX parsing, and HTML and Markdown rendering). Embedding generation and LLM inference SHALL run in Rust.

#### Scenario: Sidecar Lifecycle
- **WHEN** a document import or export operation is triggered (Markdown, PDF, DOCX, HTML)
- **THEN** the Tauri backend SHALL spawn or communicate with the Python sidecar and return results to the UI

#### Scenario: Embedding Generation Bypass
- **WHEN** a spell is created, updated, or imported
- **THEN** the Tauri backend SHALL generate the embedding in Rust via `fastembed-rs`
- **AND** SHALL NOT communicate with or depend on the Python sidecar for that work
- **AND** the sidecar being unavailable SHALL NOT prevent embedding generation

#### Scenario: LLM Chat Inference Bypass
- **WHEN** the user sends a message in the Chat panel
- **THEN** the Tauri backend SHALL run inference in Rust via `llama-cpp-rs`
- **AND** SHALL NOT communicate with or depend on the Python sidecar for that work
- **AND** the sidecar being unavailable SHALL NOT affect the chat feature

#### Scenario: Embedding model startup initialization
- **WHEN** the application starts
- **THEN** the Tauri backend SHALL initialize the `fastembed-rs` embedding model asynchronously in a background task
- **AND** spell write commands that arrive before initialization completes SHALL proceed without blocking
- **AND** any missing vectors created during that startup window SHALL be repaired by startup backfill or explicit reindexing
- **AND** the Python sidecar SHALL NOT be involved in this initialization

### Requirement: Automated E2E Testing
The application SHALL have automated E2E UI tests covering core user flows to ensure stability and regression prevention across supported operating systems.
#### Scenario: Running Core Verification
- **WHEN** the E2E test suite is executed
- **THEN** it SHALL verify key flows such as spell creation, import, and search to ensure they function as expected from a user perspective

