# Development Guide

This document provides a centralized overview of the repository layout, development workflows, and coding conventions for the Second Edition Spellbook project.

---

## Repository Layout

*   `apps/desktop`: Tauri + React desktop application (Frontend & Backend).
*   `services/ml`: Python sidecar services for document import/export workflows. Local LLM inference and embeddings for this stack live in the Rust/Tauri backend.
*   `db/migrations`: SQLite schema migration files.
*   `scripts/`: Helper scripts and build utilities.
*   `spells_md/`: Markdown spell content used for seeding.
*   `openspec/`: Detailed project specifications and change proposals.
*   `docs/`: High-level architectural and migration documentation.

---

## Development Workflows

### Desktop Application (React + Rust)
**Location**: `apps/desktop`

Requires Node 24+, `pnpm`, and a Rust toolchain.

```bash
cd apps/desktop
pnpm install
pnpm tauri:dev
```

## Local Model Provisioning

Approved TinyLlama and MiniLM assets are staged under the fixed path `SpellbookVault/models/` (`commands/provisioning.rs`). Paths are not configurable. After a successful download or verified side-load, chat and embeddings run offline.

Public commands: `llm_download_model`, `llm_import_model_file`, `embeddings_download_model`, `embeddings_import_model_file`. Status: `llm_status`, `embeddings_status`. One global `ProvisioningState` guard prevents overlapping high-bandwidth work (`Provisioning for LLM is already in progress.` / `Provisioning for embeddings is unavailable while LLM is in progress.`).

*   Required Windows toolchain: `x86_64-pc-windows-msvc`, `rustc 1.95.0 (59807616e 2026-04-14)`, `cargo 1.95.0 (f2d3ce0bd 2026-03-21)`, Visual Studio Build Tools workload `Microsoft.VisualStudio.Workload.VCTools` version `18.5.11709.299`, Windows SDK `10.0.26100.0`, plus `LIBCLANG_PATH=C:\Program Files\LLVM\bin` and `CMAKE=C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe` when compiling the local-model stack in a clean shell. Do not drop these pins; they are the Task 1.6 record.
*   Enforced resource thresholds: free disk `>= 838860800` bytes and free RAM `>= 1610612736` bytes (`BASELINE_MIN_FREE_DISK_BYTES` / `BASELINE_MIN_FREE_RAM_BYTES`).
*   Python sidecar scope: import/export only. It does not provide LLM or embedding functionality.

### Approved TinyLlama GGUF

| Field | Value |
| ----- | ----- |
| URL | `https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` |
| Version | TinyLlama-1.1B-Chat-v1.0 / Q4_K_M |
| Destination | `SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` |
| SHA-256 | `9FECC3B3CD76BBA89D504F29B616EEDF7DA85B96540E490CA5824D3F7D2776A0` |
| Strategy | `SingleFileSha256` |
| Download / installed size | `668788096` bytes |
| Peak RAM (recorded) | `910843904` bytes |

Mismatch: delete the failed copy, return an error, leave `llm_status` unchanged when side-load fails.

### Approved embedding bundle (all-MiniLM-L6-v2 ONNX)

| Field | Value |
| ----- | ----- |
| URL | `https://huggingface.co/Qdrant/all-MiniLM-L6-v2-onnx/tree/5f1b8cd78bc4fb444dd171e59b18f3a3af89a079` |
| Manifest | `5f1b8cd78bc4fb444dd171e59b18f3a3af89a079` |
| Destination | `SpellbookVault/models/embeddings/all-MiniLM-L6-v2/` |
| Strategy | `FileInventoryOnly` + `UpstreamRevisionManifestSHA` |
| Download / installed size | `91102069` bytes |
| Peak RAM (recorded) | `121024512` bytes |

Per-file inventory (`EMBEDDING_EXPECTED_FILES`):

| Relative path | Size (bytes) | SHA-256 |
| ------------- | ------------ | ------- |
| `embeddings/all-MiniLM-L6-v2/model.onnx` | `90387630` | `bbd7b466f6d58e646fdc2bd5fd67b2f5e93c0b687011bd4548c420f7bd46f0c5` |
| `embeddings/all-MiniLM-L6-v2/tokenizer.json` | `711661` | `da0e79933b9ed51798a3ae27893d3c5fa4a201126cef75586296df9b4d2c62a0` |
| `embeddings/all-MiniLM-L6-v2/config.json` | `650` | `1b4d8e2a3988377ed8b519a31d8d31025a25f1c5f8606998e8014111438efcd7` |
| `embeddings/all-MiniLM-L6-v2/special_tokens_map.json` | `695` | `5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a` |
| `embeddings/all-MiniLM-L6-v2/tokenizer_config.json` | `1433` | `bd2e06a5b20fd1b13ca988bedc8763d332d242381b4fbc98f8fead4524158f79` |

### Verified side-load rules

1. Only the exact approved GGUF or the exact five-file MiniLM layout is accepted. Arbitrary "compatible" models are rejected.
2. Commands: `llm_import_model_file` (`filePath`) and `embeddings_import_model_file` (`filePath`).
3. Validate identity (destination filename / relative paths) and SHA-256 (or the five-file inventory) before copying into `SpellbookVault/models/`.
4. Success: LLM status becomes `ready`; embeddings status becomes `initializing` or `ready`.
5. Failure: status unchanged; no vault write of the rejected payload.
6. Chat UI labels this "Add Local Model" (`chat-llm-import-button` / `chat-embeddings-import-button`). Library semantic empty-state uses `library-embeddings-import-button`.
7. In-app download remains the other provisioning path (`llm_download_model` / `embeddings_download_model`) with HTTP Range resume and the same hashes.

Generation cancellation is implemented (OpenSpec Outcome B): the inference worker polls an `AtomicBool` at token boundaries via `llm_cancel_generation`.

See [dev/local_llm_infrastructure_spike.md](./dev/local_llm_infrastructure_spike.md) for provenance notes and Windows compile evidence.

### Vault backup and restore (models excluded)

`backup_vault` archives only:

1. `spellbook.sqlite3`
2. `vault-settings.json` (if present)
3. the `spells/` directory

The `models/` directory is **not** added to the archive (exclusion by omission, not a separate deny-list). `restore_vault` restores DB + `spells/` + settings and does **not** delete or overwrite `{SpellbookVault}/models/`.

Consequences:
- Same machine: provisioned TinyLlama/MiniLM files survive restore.
- New machine or empty vault: the user must download or side-load again.
- A backup is not a portable copy of the LLM. Do not tell users that restoring a `.zip` brings chat models with it.

### Python Sidecar Services
**Location**: `services/ml`

The Python sidecar remains available for document import/export workflows. The approved local LLM and embedding runtime for this stack is provisioned and executed by the Rust/Tauri backend instead.

Always use the virtual environment located in the **repository root**.

```bash
# Setup (from root)
python -m venv .venv

# Install dependencies (Windows)
.\.venv\Scripts\pip install -r services/ml/requirements.txt -r services/ml/requirements-dev.txt

# Run lint/tests
.\.venv\Scripts\python -m pytest services/ml
```

---

## Coding Conventions & Casing Standards

To maintain consistency across the stack, we use distinct casing standards for different layers of the application.

### 1. Naming Conventions
*   **Rust**: Use `snake_case` for backend commands, functions, and internal logic.
*   **Frontend**: Use `camelCase` for React components, props, and local variables.
*   **Python**: Use `snake_case` for all Python scripts and models.

### 2. IPC Serialization (Tauri)
**All data serialized between the Frontend and Backend via Tauri IPC MUST use `camelCase`.**
*   Backend structs should use `#[serde(rename_all = "camelCase")]`.
*   Sidecar-compatible models should use `#[serde(alias = "snake_case_name")]` to support legacy sidecar output.

### 3. Canonical Hashing & Schema
**All data intended for Canonical Hashing (stored in `canonical_data`) MUST use `snake_case`.**
*   This ensures alignment with the canonical schema (`src-tauri/schemas/spell.schema.json`) and external resource standards.
*   Do not use `camelCase` for fields that contribute to the `content_hash`.

### 4. Backend Logging (Rust/Tauri)
*   Use structured logging via `tracing::{info, warn, error, debug}` in backend runtime and command paths.
*   Prefer `tracing` macros over `println!`/`eprintln!` for runtime diagnostics.
*   Logging is initialized in `apps/desktop/src-tauri/src/lib.rs` and `apps/desktop/src-tauri/src/main.rs` using `tracing-subscriber` with `EnvFilter::try_from_default_env()` and a default `info` filter.
*   Set `RUST_LOG` locally to increase verbosity when needed:
    *   PowerShell: `$env:RUST_LOG="info,spellbook_desktop=debug"`
    *   bash/zsh: `RUST_LOG=info,spellbook_desktop=debug`
*   Scope note: migration/report CLI workflows may still write to `migration.log` and/or stdout/stderr.

---

## Testing

### Running Tests

**Backend (Rust)**:
```bash
cd apps/desktop/src-tauri
cargo test                           # Run all tests
cargo test --lib                     # Run library tests only
cargo test canonical_spell           # Run specific module tests
cargo test -- --nocapture            # Show captured test output (including tracing when enabled)
```

**Parser Tests**:
```bash
# Test individual parsers
cargo test --lib parsers::range
cargo test --lib parsers::area
cargo test --lib parsers::duration
cargo test --lib parsers::mechanics
cargo test --lib parsers::components
```

**Frontend (React/TypeScript)**:
Named Vitest projects (`unit`, `storybook`) are defined in `apps/desktop/vitest.config.ts`.

```bash
cd apps/desktop
pnpm test:unit                       # Run unit tests
pnpm test:storybook                  # Run Storybook interaction tests
pnpm storybook                       # Start Storybook for component development/testing
```

**Python (ML Services)**:
```bash
# From repository root
.\.venv\Scripts\python -m pytest services/ml
```

> [!TIP]
> If you encounter PDB linker errors during testing on Windows, run `cargo clean -p spellbook-desktop` and try again. See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for details.

---

## Formatting and Linting

We enforce strict formatting and type safety across all languages. Run these before committing:

| Language | Tool | Command (from `apps/desktop`) |
| :--- | :--- | :--- |
| **JS/TS (Check)** | Biome + Knip | `pnpm lint` |
| **JS/TS (Biome only)** | Biome | `pnpm run lint:biome` |
| **JS/TS (Knip only)** | Knip | `pnpm run knip` |
| **JS/TS (Types)** | `tsc` | `pnpm tsc --noEmit` |
| **JS/TS (Format)**| Biome | `pnpm format` |
| **Rust** | Rustfmt | `cargo fmt` (in `src-tauri`) |
| **Python** | Ruff | `ruff format .` (in `services/ml`) |


`pnpm lint` runs Biome first and then Knip. Knip is configured so CI fails only for unused dependencies/devDependencies; unused exports and files are reported for optional cleanup.

---

## Specifications (OpenSpec)
For detailed planning and architectural shifts, refer to the [OpenSpec Project Guide](../openspec/project.md). All significant changes must follow the OpenSpec proposal workflow.
