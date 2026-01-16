# AI Agent Development Guide for Spellbook Backend

This document provides context for AI agents working on the Tauri/Rust backend.

> **Note:** All paths in this document are relative to the repository root (`spellbook/apps/desktop`).

## Project Structure

```
src-tauri/
├── src/
│   ├── commands/      # Tauri command handlers
│   │   ├── characters.rs   # Character CRUD, spellbook management
│   │   ├── export.rs       # PDF export, printing
│   │   ├── import.rs       # File import, conflict resolution
│   │   ├── search.rs       # Keyword/semantic search, facets
│   │   ├── spells.rs       # Spell CRUD, validation
│   │   └── mod.rs          # Re-exports all commands
│   ├── db/            # Database layer
│   │   ├── migrations.rs   # Migration loading (SQLite)
│   │   ├── pool.rs         # r2d2 connection pool, sqlite-vec init
│   │   └── mod.rs
│   ├── models/        # Shared data structures
│   │   ├── character.rs    # Character, PrintableCharacter, etc.
│   │   ├── import.rs       # ImportSpell, ImportConflict, etc.
│   │   ├── search.rs       # SearchFilters, Facets, etc.
│   │   ├── spell.rs        # SpellDetail, SpellSummary, etc.
│   │   └── mod.rs
│   ├── sidecar/       # Python sidecar communication
│   │   ├── client.rs       # Async sidecar client
│   │   └── mod.rs
│   ├── error.rs       # AppError enum (thiserror)
│   ├── lib.rs         # Library entry point (app logic, command registry)
│   └── main.rs        # Binary stub (calls lib::run())
├── Cargo.toml
└── tauri.conf.json
```

## Key Patterns

### Error Handling
All commands return `Result<T, AppError>`. `AppError` is defined in `error.rs` using `thiserror` and serializes to strings for the frontend.

```rust
use crate::error::AppError;

#[tauri::command]
pub async fn my_command(...) -> Result<MyType, AppError> {
    // Use ? operator freely
}
```

### Async Commands with Database
Database operations MUST be wrapped in `tokio::task::spawn_blocking` to avoid blocking the Tauri main thread:

```rust
let pool = state.inner().clone();
let result = tokio::task::spawn_blocking(move || {
    let conn = pool.get()?;
    // ... database operations ...
    Ok::<ReturnType, AppError>(value)  // Explicit type annotation required!
})
.await
.map_err(|e| AppError::Unknown(e.to_string()))??;
```

### Sidecar Calls
The Python sidecar is called via `call_sidecar` in `sidecar/client.rs`. It's async:

```rust
use crate::sidecar::call_sidecar;
let result = call_sidecar("action_name", json!({"key": value})).await?;
```

### Adding New Commands
1. Create function in appropriate `commands/*.rs` file
2. Add `#[tauri::command]` attribute
3. Export from `commands/mod.rs`
4. Register in `main.rs` `invoke_handler`

### Models
- Use `#[derive(serde::Serialize, serde::Deserialize)]` for frontend communication.
- **CRITICAL**: Always use `#[serde(crate = "serde")]` inside the `#[derive]` block to ensure macros resolve correctly in custom modules.
- Use `#[serde(rename_all = "camelCase")]` for JS conventions.
- Add to `models/mod.rs` re-exports.

> [!CAUTION]
> Avoid `ignore_unknown_fields` as a container attribute. Serde ignores unknown fields by default. Using invalid attributes can break macro expansion with cryptic "unsatisfied trait bound" errors.

## Database

- **Engine**: SQLite with `rusqlite` and `r2d2_sqlite` pooling
- **Vector Search**: `sqlite-vec` extension for semantic search
- **Migrations**: Located at `spellbook/db/migrations/`, loaded via `include_str!`

## Dependencies

Key crates:
- `tauri` - Application framework
- `tokio` - Async runtime (features: `process`, `io-util`)
- `rusqlite` - SQLite bindings (features: `bundled`, `load_extension`)
- `thiserror` - Error derive macros
- `serde` / `serde_json` - Serialization
- `chrono` - Date/time handling
- `regex` - Filename sanitization

## Testing

Run `cargo check` before committing to verify compilation.
E2E tests are in the frontend (`tests/` directory) using Playwright.

## Common Pitfalls

1. **Type inference in closures**: Always use `Ok::<T, AppError>(value)` inside `spawn_blocking`
2. **Migration paths**: Relative to the source file, currently `../../../../../db/migrations/`
3. **Unused imports**: Run `cargo fix --lib` to auto-clean
