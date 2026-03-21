# architecture Specification (delta)

## MODIFIED Requirements

### Requirement: Python Sidecar for ML
The Python sidecar is responsible for document import/export operations (Markdown, PDF, DOCX parsing; HTML and Markdown rendering). It is NOT responsible for embedding generation or LLM inference; both SHALL run natively in Rust.

#### Scenario: Sidecar Lifecycle
- **WHEN** a document import or export operation is triggered (Markdown, PDF, DOCX, HTML)
- **THEN** the Tauri backend SHALL spawn or communicate with the Python sidecar and return results to the UI

#### Scenario: Embedding Generation Bypass
- **WHEN** a spell is created, updated, or imported
- **THEN** the Tauri backend SHALL generate the embedding entirely within Rust (via `fastembed-rs`)
- **AND** SHALL NOT communicate with or depend on the Python sidecar for this operation
- **AND** the sidecar being unavailable SHALL NOT prevent embedding generation

#### Scenario: LLM Chat Inference Bypass
- **WHEN** the user sends a message in the Chat panel
- **THEN** the Tauri backend SHALL handle inference entirely within Rust (via `llama-cpp-rs`)
- **AND** SHALL NOT communicate with or depend on the Python sidecar for this operation
- **AND** the sidecar being unavailable SHALL NOT affect the chat feature

#### Scenario: Embedding model startup initialization
- **WHEN** the application starts
- **THEN** the Tauri backend SHALL initialize the `fastembed-rs` embedding model asynchronously in a background task
- **AND** spell write commands that arrive before initialization completes SHALL queue and proceed once the model is ready
- **AND** the Python sidecar SHALL NOT be involved in this initialization
