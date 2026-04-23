# llm-chat Specification

## Purpose
This specification defines the local LLM chat capability: model lifecycle (download, load, status), the RAG retrieval pipeline that grounds responses in the spell database, the streaming Tauri command API, and the React Chat UI. All inference runs in Rust via `llama-cpp-rs`; no Python sidecar is involved.

## ADDED Requirements

### Requirement: Model Download
The application SHALL download the TinyLlama 1.1B Q4_K_M GGUF model file on demand and store it at `SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`. The download MUST be triggered explicitly by the user, never automatically at startup.

#### Scenario: First-time download trigger
- **WHEN** the user opens the Chat panel for the first time (model not present)
- **THEN** the application SHALL display a download prompt explaining the model size (~700 MB) and an explicit "Download" button
- **AND** SHALL NOT begin any download until the user confirms

#### Scenario: Download progress reporting
- **WHEN** the user initiates a model download
- **THEN** the backend SHALL emit `llm://download-progress` events with `{ bytes_downloaded: u64, total_bytes: u64 }` payloads
- **AND** the frontend SHALL display a progress bar and human-readable byte count

#### Scenario: Resumable download
- **WHEN** a download is interrupted (network loss, app close) and the user retries
- **THEN** the backend SHALL use HTTP Range requests to resume from the last byte received
- **AND** SHALL NOT re-download already-received bytes

#### Scenario: Download failure — network error
- **WHEN** a network error occurs during download
- **THEN** the application SHALL surface a user-facing error message including the failure reason
- **AND** SHALL preserve any partially downloaded bytes for resume

#### Scenario: Download failure — disk full
- **WHEN** available disk space is insufficient for the model file
- **THEN** the application SHALL return an error before starting the download
- **AND** SHALL display the required and available disk space to the user

#### Scenario: Download integrity check
- **WHEN** the model file download completes
- **THEN** the backend SHALL verify the file's SHA-256 hash against the expected value
- **AND** SHALL delete the file and return an error if the hash does not match

### Requirement: Model Status
The application SHALL expose the current state of the LLM model through the `llm_status` command.

#### Scenario: Reporting model states
- **WHEN** `llm_status` is invoked
- **THEN** it SHALL return one of: `not_downloaded`, `downloading`, `ready` (downloaded, not loaded), `loaded`, or `error`

#### Scenario: State transitions
- **WHEN** the model progresses through its lifecycle
- **THEN** the following state transitions SHALL be valid: `not_downloaded` → `downloading` → `ready` → `loaded`; `downloading` → `not_downloaded` (on cancellation); `ready` → `error` (on RAM check failure during load); `loaded` → `error` (on inference initialization failure)
- **AND** transitioning from `error` back to `ready` SHALL require the user to retry (no automatic recovery)

### Requirement: Model Loading
The application SHALL load the model lazily on the first chat request and keep it resident in memory for the duration of the application session.

#### Scenario: RAM availability check
- **WHEN** the user sends a chat message and the model begins loading (transitioning from `ready` to `loaded`)
- **THEN** the backend SHALL check available system RAM before attempting to load
- **AND** if available RAM is less than 1.5 GB free, SHALL transition state to `error` and return an error: "Insufficient RAM: at least 1.5 GB free required to load the model"
- **AND** `llm_status` SHALL subsequently return `error` state reflecting this failure

#### Scenario: Lazy load on first chat
- **WHEN** the user sends their first chat message and the model is in `ready` state
- **THEN** the backend SHALL load the model (2–5 s) before processing the query
- **AND** the frontend SHALL show a loading indicator during this period

#### Scenario: Subsequent requests use loaded model
- **WHEN** the user sends a chat message and the model is already in `loaded` state
- **THEN** the backend SHALL proceed directly to inference without reloading
- **AND** response generation SHALL begin within 500 ms of the command being received

#### Scenario: Concurrent request rejection
- **WHEN** the user sends a new chat message while a previous inference is still running
- **THEN** the application SHALL reject the new request with a user-facing error message: "A response is already being generated. Please wait for it to complete or cancel it first."
- **AND** SHALL NOT run two inference sessions concurrently

### Requirement: RAG Retrieval Pipeline
Before generating each LLM response, the backend SHALL extract search terms from the user query and retrieve relevant spells from the database to ground the response.

#### Scenario: Term extraction from query
- **WHEN** the user submits a query containing recognizable spell-related nouns or descriptors
- **THEN** the backend SHALL extract 1–3 representative search terms using a heuristic (strip stop words, retain nouns/adjectives)

#### Scenario: Spell retrieval via FTS5
- **WHEN** search terms are extracted from the user query
- **THEN** the backend SHALL run an FTS5 search returning the top 5 spells ranked by relevance
- **AND** SHALL include each spell's name, school, level, and a truncated description (≤ 200 characters) in the prompt context

#### Scenario: Zero results from FTS5
- **WHEN** the FTS5 search returns no results for the extracted terms
- **THEN** the backend SHALL proceed with LLM generation without any RAG context
- **AND** the system prompt SHALL note "No matching spells found in the library"

#### Scenario: RAG context injection
- **WHEN** spell results are retrieved
- **THEN** the backend SHALL inject them into the ChatML system prompt in the format:
  ```
  Relevant spells from the library:
  - <Name> (Level <N> <School>): <description snippet>
  ```
- **AND** the user query and conversation history SHALL follow the system prompt

### Requirement: ChatML Prompt Format
The LLM SHALL be prompted using the ChatML format that TinyLlama 1.1B was trained on.

#### Scenario: Correct ChatML structure
- **WHEN** a prompt is assembled for inference
- **THEN** it SHALL use the following structure:
  ```
  <|im_start|>system
  You are a helpful AD&D 2nd Edition spell expert. Answer questions about spells accurately using the provided library context. Be concise.

  <RAG context here>
  <|im_end|>
  <|im_start|>user
  <user message>
  <|im_end|>
  <|im_start|>assistant
  ```
- **AND** prior conversation turns SHALL be included as interleaved `<|im_start|>user` / `<|im_start|>assistant` blocks before the current user message

#### Scenario: History truncation
- **WHEN** conversation history exceeds the model's context window (2048 tokens for TinyLlama)
- **THEN** the backend SHALL truncate the oldest non-system turns to fit within the context window
- **AND** SHALL always preserve the system prompt and most recent user message

### Requirement: Streaming Response
The LLM response SHALL be streamed token-by-token to the frontend via Tauri events.

#### Scenario: Token streaming
- **WHEN** the LLM begins generating a response
- **THEN** the backend SHALL emit one `llm://token/<stream_id>` event per generated token with payload `{ token: String }`
- **AND** the frontend SHALL append each token to the in-progress assistant message in real time

#### Scenario: Stream completion
- **WHEN** the LLM has finished generating the response (EOS token or max tokens reached)
- **THEN** the backend SHALL emit a final `llm://done/<stream_id>` event with payload `{ full_response: String }`

#### Scenario: Stream cancellation
- **WHEN** the user cancels an in-progress generation
- **THEN** the backend SHALL stop the inference loop on the next token boundary
- **AND** the partial response SHALL remain visible in the chat

#### Scenario: Inference timeout
- **WHEN** a generation exceeds 120 seconds without completing
- **THEN** the backend SHALL abort the inference and emit `llm://done/<stream_id>` with the partial response
- **AND** SHALL append a note to the message: "[Response timed out]"

### Requirement: Chat UI
The application SHALL provide a Chat panel accessible from the main navigation.

#### Scenario: Empty state (model not downloaded)
- **WHEN** the user opens the Chat panel and the model has not been downloaded
- **THEN** the panel SHALL display an explanation of the feature, the model size, and a "Download Model" button
- **AND** SHALL NOT show a message input field until the model is ready

#### Scenario: Message submission
- **WHEN** the user types a query and presses Enter or clicks Send
- **THEN** the user message SHALL appear immediately in the message list
- **AND** a streaming assistant response SHALL begin

#### Scenario: Spell link rendering
- **WHEN** an assistant response contains spell names that match spells in the library
- **THEN** those names SHALL be rendered as clickable links
- **AND** clicking a spell link SHALL navigate to the spell's detail view

#### Scenario: Error message display
- **WHEN** an LLM command returns an error (download failure, RAM error, inference error)
- **THEN** the error SHALL be displayed inline in the chat as a system message
- **AND** the input field SHALL remain enabled for retry

#### Scenario: Session-only history
- **WHEN** the application is restarted
- **THEN** the chat history SHALL be empty (no persistence across sessions)

## Non-Functional Requirements
- **Streaming latency**: First token SHALL appear within 3 s of submitting a query on hardware with ≥ 4 GB RAM.
- **RAM ceiling**: Model load MUST be blocked if available RAM < 1.5 GB free.
- **Model file integrity**: SHA-256 of the downloaded GGUF file MUST be verified before use.
- **Disk requirement**: The application MUST check for at least 800 MB of free disk space before beginning the download.
