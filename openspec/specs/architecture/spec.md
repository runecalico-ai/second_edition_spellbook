# architecture Specification

## Purpose
TBD - created by archiving change backfill-core-specs. Update Purpose after archive.
## Requirements
### Requirement: Local-First Desktop App
The application SHALL run as a standalone desktop executable on Windows, macOS, and Linux without requiring a network connection for core functionality.
#### Scenario: Offline Startup
- **WHEN** the application is launched without an internet connection
- **THEN** it should start up successfully and allow access to all local library data

### Requirement: SQLite Data Storage
All spell, character, and application data SHALL be stored in a local SQLite database that is user-accessible and portable.
#### Scenario: Database Accessibility
- **WHEN** the user locates the `SpellbookVault` directory
- **THEN** they should find a standard SQLite database file that can be backed up or inspected with external tools

### Requirement: Hybrid Search Indexing
The application SHALL use FTS5 for keyword search and `sqlite-vec` for vector-based semantic search.
#### Scenario: Index Initialization
- **WHEN** the database is initialized
- **THEN** the `spell_fts` virtual table and `spell_vec` vector table must be correctly created and configured

### Requirement: Python Sidecar for ML
Heavy computational tasks such as embeddings generation and LLM inference SHALL be delegated to a Python sidecar process.
#### Scenario: Sidecar Lifecycle
- **WHEN** a task requiring ML (like embedding a new spell) is triggered
- **THEN** the Tauri backend should spawn or communicate with the Python sidecar and return results to the UI

### Requirement: Automated E2E Testing
The application SHALL have automated E2E UI tests covering core user flows to ensure stability and regression prevention across supported operating systems.
#### Scenario: Running Core Verification
- **WHEN** the E2E test suite is executed
- **THEN** it SHALL verify key flows such as spell creation, import, and search to ensure they function as expected from a user perspective

