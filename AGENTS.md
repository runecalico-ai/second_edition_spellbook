# Spellbook AI Agent Access Guide

This is a local desktop application to manage spells and character spellbooks for **AD&D 2nd Edition**.

**Tooling & Commands**
- **Frontend / Scripts:** `pnpm`
- **Backend:** `cargo`
- **Sidecar:** `venv` / `pip`
- **Run Locally:** `pnpm tauri:dev`
- **Build Release:** `pnpm tauri:build --debug`

---

## 🔒 Dependency Security (Mandatory)

> **⚠️ STOP** before adding, upgrading, or recommending any dependency.

**Failure mode preference:** Reject the change rather than risk introducing an unverified package.

When working with dependencies, you **MUST** read and follow the complete security policy:
📄 **[Dependency Security Policy](./docs/DEPENDENCY_SECURITY.md)**

---

## 📚 Specialized Agent Instructions (Progressive Disclosure)

This repository uses a structured documentation system. Refer to the specialized guides below based on the layer of the stack you are modifying.

| Domain | Guide Location | Purpose |
|--------|----------------|---------|
| **Frontend UI** | [`apps/desktop/src/AGENTS.md`](./apps/desktop/src/AGENTS.md) | React conventions, `data-testid` strategies, IPC camelCase rules |
| **Backend (Tauri)** | [`apps/desktop/src-tauri/AGENTS.md`](./apps/desktop/src-tauri/AGENTS.md) | Rust commands, SQLite/`r2d2`, canonical hashing, `spawn_blocking` |
| **Python Sidecar** | [`services/ml/AGENTS.md`](./services/ml/AGENTS.md) | Ruff linting, import rules, type hinter standards |
| **E2E Tests** | [`apps/desktop/tests/AGENTS.md`](./apps/desktop/tests/AGENTS.md) | Playwright locators, timeouts, modal/dialog handling strategies |

## 📐 Architecture & Reference

| Document | Purpose |
|----------|---------|
| [DEVELOPMENT.md](./docs/DEVELOPMENT.md) | Setup, repo layout, casing standards, linting/formatting |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System architecture, expanded spec types, hashing flow |
| [Canonical Serialization](./docs/architecture/canonical-serialization.md) | Hashing contract, normalization rules, field inventory |
| [SCHEMA_VERSIONING.md](./docs/SCHEMA_VERSIONING.md) | Schema versioning strategy and migration approach |
| [PARSER_COVERAGE.md](./docs/PARSER_COVERAGE.md) | Parser capabilities, gaps, and pattern coverage |
| [TESTING.md](./docs/TESTING.md) | Testing strategy for all components (Rust, Python, E2E) |
| [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | Common issues, CLI tools, debugging workflows |
| [OpenSpec Project Guide](./openspec/project.md) | Change proposals and spec-driven development |


