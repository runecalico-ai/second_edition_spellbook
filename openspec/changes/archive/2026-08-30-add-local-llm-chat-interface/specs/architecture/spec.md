# architecture Specification (delta)

## MODIFIED Requirements

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
