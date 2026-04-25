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

Task Group 1 defines the approved local-model assets, thresholds, and shared backend provisioning guard for content staged under `SpellbookVault/models/`. Public Tauri download commands land in later tasks.

*   Required Windows toolchain: `x86_64-pc-windows-msvc`, `rustc 1.95.0 (59807616e 2026-04-14)`, `cargo 1.95.0 (f2d3ce0bd 2026-03-21)`, Visual Studio Build Tools workload `Microsoft.VisualStudio.Workload.VCTools` version `18.5.11709.299`, Windows SDK `10.0.26100.0`, plus `LIBCLANG_PATH=C:\Program Files\LLVM\bin` and `CMAKE=C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe` when compiling the local-model stack in a clean shell.
*   Approved TinyLlama asset: `https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`, version `TinyLlama-1.1B-Chat-v1.0 / Q4_K_M`, verification strategy `SingleFileSHA256 9FECC3B3CD76BBA89D504F29B616EEDF7DA85B96540E490CA5824D3F7D2776A0`, download size `668788096`, installed size `668788096`, peak RAM `910843904`, destination `SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf`.
*   Approved embedding asset: `https://huggingface.co/Qdrant/all-MiniLM-L6-v2-onnx/tree/5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`, version `5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`, verification strategy `FileInventoryOnly @ 5f1b8cd78bc4fb444dd171e59b18f3a3af89a079 + UpstreamRevisionManifestSHA`, download size `91102069`, installed size `91102069`, peak RAM `121024512`, destination `SpellbookVault/models/embeddings/all-MiniLM-L6-v2/`.
*   Enforced resource thresholds: free disk `>= 838860800` and free RAM `>= 1610612736` before either provisioning target starts.
*   Provisioning flow: the approved assets are downloaded or verified via side-load into `SpellbookVault/models/`; after provisioning completes, normal local inference and embedding use stays offline.
*   Shared download guard: one global provisioning guard is already registered for both asset types. Later download commands must reuse it so overlapping requests fail with the current target-specific validation errors, including `Provisioning for LLM is already in progress.` and `Provisioning for embeddings is unavailable while LLM is in progress.`
*   Interruptibility finding: Task Group 1 accepted Outcome B for later inference cancellation; a dedicated inference worker owns the model/session and polls an `Arc<std::sync::atomic::AtomicBool>` before token sampling and optionally after decode.
*   Python sidecar scope: the Python sidecar remains responsible for document import/export only; it does not provide LLM or embedding functionality for this stack.
*   Scope note: embedding reindex concurrency and mid-download cancellation are not part of Task Group 1.

See [dev/local_llm_infrastructure_spike.md](./dev/local_llm_infrastructure_spike.md) for the raw provenance notes, Windows compile evidence, and the exact embedding bundle file inventory.

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
