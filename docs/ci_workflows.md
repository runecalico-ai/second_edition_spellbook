# Continuous Integration (CI) Workflows

This document provides a detailed overview of the CI workflows for the Spellbook project. This is intended for both developers and AI agents to understand the automated validation process.

> [!IMPORTANT]
> **AI Maintenance Note**: If you modify any files in `.github/workflows/`, you **MUST** review and update this document to reflect those changes.

## Overview

The primary CI workflow is defined in [.github/workflows/ci.yml](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/.github/workflows/ci.yml). It runs on every pull request and onทุก push to the `main` branch.

## Jobs Breakdown

### `checks` Job
This is a single job that runs on `ubuntu-latest` and performs all validation steps across JS, Python, and Rust.

#### 1. JavaScript / Frontend (apps/desktop)
- **Environment**: Node 24, pnpm 10
- **Commands**:
  - `pnpm install --frozen-lockfile`
  - `pnpm lint`
  - `pnpm format:check`

#### 2. Python / ML Sidecar (services/ml)
- **Environment**: Python 3.14
- **Setup**: Creates a virtualenv and installs dependencies from `requirements.txt` and `requirements-dev.txt`.
- **Commands**:
  - `python -m ruff check .` (Linting)
  - `python -m ruff format --check .` (Formatting)
  - `python -m pytest` (Unit Tests)

#### 3. Rust / Tauri (apps/desktop/src-tauri)
- **Environment**: Stable Rust toolchain (with `rustfmt` and `clippy`)
- **System Dependencies**: `libglib2.0-dev`, `libgtk-3-dev`, `libsoup-3.0-dev`, `libwebkit2gtk-4.1-dev`
- **Commands**:
  - `cargo fmt -- --check`
  - `cargo clippy -- -D warnings`

## Caching

To optimize build times, the following are cached:
- **pnpm**: via `actions/setup-node`
- **pip**: via `actions/setup-python`
- **Cargo**: via `actions/cache` (includes `~/.cargo/registry`, `~/.cargo/git`, and the Tauri target directory)

## Manual Replication

To run these checks locally, follow the instructions in the respective READMEs or use these combined commands:

**JS**:
```bash
cd spellbook/apps/desktop
pnpm lint && pnpm format:check
```

**Python**:
```bash
cd spellbook/services/ml
# assuming venv is active
ruff check . && ruff format --check . && pytest
```

**Rust**:
```bash
cd spellbook/apps/desktop/src-tauri
cargo fmt -- --check
cargo clippy -- -D warnings
```
