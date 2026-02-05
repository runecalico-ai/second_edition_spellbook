# AI Agent Access Guide

This repository uses a structured documentation system for AI agents. Please refer to the specialized guides below based on your current task.

## 📚 Documentation Reference

### Core Guides
| Document | Purpose |
|----------|---------|
| [OpenSpec AGENTS.md](./openspec/AGENTS.md) | Change proposals and spec-driven development |
| [DEVELOPMENT.md](./docs/DEVELOPMENT.md) | Setup, repo layout, casing standards, linting/formatting |

### Architecture & Design
| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System architecture, expanded spec types, hashing flow |
| [Canonical Serialization](./docs/architecture/canonical-serialization.md) | Hashing contract, normalization rules, field inventory |
| [SCHEMA_VERSIONING.md](./docs/SCHEMA_VERSIONING.md) | Schema versioning strategy and migration approach |

### Data & Migration
| Document | Purpose |
|----------|---------|
| [MIGRATION.md](./docs/MIGRATION.md) | Data migration patterns and examples |
| [PARSER_COVERAGE.md](./docs/PARSER_COVERAGE.md) | Parser capabilities, gaps, and pattern coverage |

### Testing & Quality
| Document | Purpose |
|----------|---------|
| [TESTING.md](./docs/TESTING.md) | Testing strategy for all components (Rust, Python, E2E) |
| [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | Common issues, CLI tools, debugging workflows |

### Workflows (Slash Commands)
| Command | Purpose |
|---------|---------|
| `/format-codebase` | Format entire codebase using Biome, Rustfmt, Ruff |
| `/lint-codebase` | Lint all components (frontend, backend, services) |
| `/test-workflow` | Run tests for Backend, Python, and E2E |
| `/openspec-proposal` | Scaffold a new OpenSpec change proposal |
| `/openspec-apply` | Implement an approved OpenSpec change |
| `/openspec-archive` | Archive a deployed OpenSpec change |
| `/compliance-check` | Verify UI component best practices |

---

## 🔒 Dependency Security (Mandatory)

> **⚠️ STOP** before adding, upgrading, or recommending any dependency.

When working with dependencies, you **MUST** read and follow the complete security policy:

📄 **[Dependency Security Policy](./docs/DEPENDENCY_SECURITY.md)**

### Quick Reference (Non-Negotiable Rules)
1. **Never guess dependency names** — verify from official docs
2. **Misspellings are treated as malicious** — stop and escalate
3. **Prefer existing dependencies** — explain why new ones are needed
4. **Lockfiles are authoritative** — never remove or regenerate opportunistically
5. **When uncertain, stop and ask** — don't proceed with unverified packages

**Failure mode**: Reject the change rather than risk supply-chain compromise.
