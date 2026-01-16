# AD&D 2nd Edition Spellbook Desktop

A local-only, modern desktop application for managing AD&D 2nd Edition spellbooks, built with Tauri, React, and Rust.

## Documentation

- [Project Quickstart & Details](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/spellbook/README.md) - Main project layout and setup instructions.
- [CI Workflows](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/docs/ci_workflows.md) - Documentation for automated testing and validation.
- [AI Agent Mandatory Rules](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/AGENTS.md) - Critical rules for AI agents operating in this repository.

## Project Structure

- `spellbook/apps/desktop/`: The main Tauri + React frontend.
- `spellbook/services/ml/`: Python sidecar for ML features (embeddings, text parsing).
- `spellbook/db/migrations/`: SQLite database schema and migrations.
- `docs/`: Technical documentation and design specifications.
