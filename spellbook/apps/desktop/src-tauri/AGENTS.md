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

### Tauri IPC Casing
Tauri automatically converts command parameters from Rust's `snake_case` to JavaScript's `camelCase`.

**Rust (Backend):**
```rust
#[tauri::command]
pub async fn my_command(my_parameter_name: String) { ... }
```

**JavaScript (Frontend):**
```javascript
await invoke("my_command", { myParameterName: "value" });
```

### Models
- Use `#[derive(serde::Serialize, serde::Deserialize)]` for frontend communication.
- **CRITICAL**: Always use `#[serde(crate = "serde")]` inside the `#[derive]` block to ensure macros resolve correctly.
- **BEST PRACTICE**: Use `#[serde(rename_all = "camelCase")]` on all structs to ensure return objects use JS-friendly keys.
- Add to `models/mod.rs` re-exports.

> [!TIP]
> **Type Safety Integration**: When modifying backend models, ensure you update the frontend to keep matching TypeScript interfaces in sync. This maintains end-to-end type safety. See `src/AGENTS.md` for more details.

> [!CAUTION]
> Avoid `ignore_unknown_fields` as a container attribute. Serde ignores unknown fields by default. Using invalid attributes can break macro expansion with cryptic "unsatisfied trait bound" errors.

### Data Integrity & Validation
We use the `TryFrom` pattern to enforce strict data integrity during model conversion.

```rust
impl TryFrom<SpellDetail> for CanonicalSpell {
    type Error = String;
    fn try_from(detail: SpellDetail) -> Result<Self, Self::Error> {
        // Perform strict validation here
        if condition { return Err("Validation failed".into()); }
        Ok(Self { ... })
    }
}
```

**CRITICAL**: Always use `CanonicalSpell::try_from` when ingesting data from the database or external sources to ensure it meets the latest schema requirements.

## Database

- **Engine**: SQLite with `rusqlite` and `r2d2_sqlite` pooling
- **Vector Search**: `sqlite-vec` extension for semantic search

### Migration System
The application uses a "Hash Backfill" system (`src/utils/migration_manager.rs`) to maintain data integrity across core updates.

- **Hashing**: All spells have a `content_hash` derived from their `CanonicalSpell` representation.
- **Backfill**: Run during app start via `init_db(..., true)`. CLI commands should use `false` to avoid unintended mutations.
- **Backup**: `migration_manager.rs` automatically performs a `VACUUM INTO` backup before starting any structural migration.

**CLI Recovery Tools**:
- `--check-integrity`: Verify hashes and find collisions.
- `--recompute-hashes`: Force refresh of all structured data.
- `--rollback-migration`: Revert to the latest automatic backup.

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

## Frontend Modal System

The application uses a custom React-based modal system (instead of native `alert` and `confirm`) to display validation errors, backend errors, and confirmation dialogs.

- **Validation Errors**: When a command like `create_spell` fails validation, the frontend captures the error and displays it in a stylized modal.
- **Confirmations**: Dangerous operations (like `delete_spell` or `restore_vault`) trigger a "Confirm" modal.
- **Implementation**: Managed via a Zustand store in `src/store/useModal.ts` and rendered in `src/ui/components/Modal.tsx`.

> [!TIP]
> When designing new commands that require user confirmation, ensure the frontend is updated to use the `useModal` store's `confirm()` helper before invoking the backend command.

## Character Management

The character system supports multi-class characters with per-class spell lists. All character commands are in `commands/characters.rs`.

### Data Model

- **`character` table**: Core identity (name, race, alignment, COM toggle)
- **`character_ability` table**: 1:1 relationship for ability scores (STR, DEX, CON, INT, WIS, CHA, COM)
- **`character_class` table**: 1:N relationship for multi-class support
- **`character_class_spell` table**: Links spells to *classes* (not characters) with `list_type` ('KNOWN' or 'PREPARED')

### Command Patterns

#### Character CRUD
```rust
#[tauri::command]
pub async fn update_character_details(
    state: State<'_, Arc<Pool>>,
    id: i64,
    name: String,
    character_type: String,
    race: Option<String>,
    alignment: Option<String>,
    com_enabled: i32,
    notes: Option<String>,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute(
            "UPDATE \"character\" SET name=?, type=?, race=?, alignment=?, com_enabled=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
            params![name, character_type, race, alignment, com_enabled, notes, id],
        )?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;
    Ok(())
}
```

#### Per-Class Spell Management with Integrity Constraints

**Critical**: The system enforces two integrity rules:

1. **Prepared spells must be Known**: When adding a spell to the PREPARED list, validate it exists in KNOWN
2. **Removing from Known removes from Prepared**: Cascade deletion to maintain consistency

```rust
#[tauri::command]
pub async fn add_character_spell(
    state: State<'_, Arc<Pool>>,
    character_class_id: i64,
    spell_id: i64,
    list_type: String,
    notes: Option<String>,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;

        // Integrity constraint: Validate Prepared spells must be Known
        if list_type == "PREPARED" {
            let known_exists: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM character_class_spell WHERE character_class_id = ? AND spell_id = ? AND list_type = 'KNOWN')",
                params![character_class_id, spell_id],
                |row| row.get(0),
            )?;

            if !known_exists {
                return Err(AppError::Unknown("Cannot prepare a spell that is not in the Known list.".to_string()));
            }
        }

        conn.execute(
            "INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(character_class_id, spell_id, list_type) DO UPDATE SET notes=excluded.notes",
            params![character_class_id, spell_id, list_type, notes],
        )?;
        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;
    Ok(())
}

#[tauri::command]
pub async fn remove_character_spell(
    state: State<'_, Arc<Pool>>,
    character_class_id: i64,
    spell_id: i64,
    list_type: String,
) -> Result<(), AppError> {
    let pool = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        conn.execute(
            "DELETE FROM character_class_spell WHERE character_class_id = ? AND spell_id = ? AND list_type = ?",
            params![character_class_id, spell_id, list_type],
        )?;

        // Integrity constraint: Removing from Known removes from Prepared
        if list_type == "KNOWN" {
            conn.execute(
                "DELETE FROM character_class_spell WHERE character_class_id = ? AND spell_id = ? AND list_type = 'PREPARED'",
                params![character_class_id, spell_id],
            )?;
        }

        Ok::<(), AppError>(())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))??;
    Ok(())
}
```

> [!IMPORTANT]
> The legacy `spellbook` table is deprecated. All new spell associations should use `character_class_spell` with a `character_class_id` foreign key.

## Common Pitfalls

1. **Type inference in closures**: Always use `Ok::<T, AppError>(value)` inside `spawn_blocking`
2. **Migration paths**: Relative to the source file, currently `../../../../../db/migrations/`
3. **Unused imports**: Run `cargo fix --lib` to auto-clean

### Linting Best Practices (Clippy)

#### Redundant Closures
Avoiding redundant closures when mapping errors.

**❌ Avoid:**
```rust
.map_err(|e| AppError::Io(e))?
```

**✅ Good:**
```rust
.map_err(AppError::Io)?
```
