---
description: 
alwaysApply: false
---

# AI Agent Development Guide for Spellbook Backend

This document provides context for AI agents working on the Tauri/Rust backend.

> **Note:** All paths in this document are relative to the repository root (`apps/desktop`).

## Project Structure

```
src-tauri/
├── src/
│   ├── commands/      # Tauri command handlers
│   │   ├── characters.rs   # Character CRUD, spellbook management
│   │   ├── embeddings.rs   # Embedding lifecycle, semantic search, reindex
│   │   ├── export.rs       # PDF export, printing
│   │   ├── import.rs       # File import, conflict resolution
│   │   ├── llm.rs          # LLM lifecycle, download, chat, cancellation
│   │   ├── llm_rag.rs      # FTS-only RAG term extraction and prompt assembly
│   │   ├── provisioning.rs # Approved model identities, SHA checks, RAM/disk guard
    │   │   ├── search.rs       # Keyword search, facets
│   │   ├── spells.rs       # Spell CRUD, validation
│   │   ├── vault.rs        # Vault backup/restore (excludes models/)
│   │   └── mod.rs          # Re-exports all commands
│   ├── db/            # Database layer
│   │   ├── migrations.rs   # Migration loading (SQLite)
│   │   ├── pool.rs         # r2d2 connection pool, sqlite-vec init
│   │   └── mod.rs
│   ├── models/        # Shared data structures
│   │   ├── character.rs    # Character, PrintableCharacter, etc.
│   │   ├── embeddings.rs   # EmbeddingsStatus, SemanticSearchResult
│   │   ├── import.rs       # ImportSpell, ImportConflict, etc.
│   │   ├── llm.rs          # LlmStatus, LlmStatusResponse, chat events
│   │   ├── search.rs       # SearchFilters, Facets, etc.
│   │   ├── spell.rs        # SpellDetail, SpellSummary, etc.
│   │   └── mod.rs
│   ├── sidecar/       # Python sidecar communication
│   │   ├── client.rs       # Async sidecar client (import/export only)
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

> [!CAUTION]
> The sidecar handles **import/export only**. Do not add `embed` or `llm_answer` handlers. Local inference uses `llm_chat` in `commands/llm.rs`. Embeddings and semantic search use `commands/embeddings.rs`. Sidecar downtime must not block either path.

### Adding New Commands
1. Create function in appropriate `commands/*.rs` file
2. Add `#[tauri::command]` attribute
3. Export from `commands/mod.rs`
4. Register in `lib.rs` `invoke_handler` (not `main.rs`; `main.rs` only calls `lib::run()`)

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

### Spell Parsing Logic
The application includes a robust parsing engine for converting legacy AD&D 2e string formats (e.g., "10 yards + 1 ft/level") into structured data models.

- **Location**: `src/utils/parsers/`
- **Architecture**: Domain-specific parsers (Range, Area, Duration, etc.) orchestrated by a `SpellParser` facade.
- **Usage**: Use `SpellParser::new()` to access parsing methods. Avoid writing ad-hoc regexes in commands; use the centralized parsers.

### Logging
- **Runtime and commands**: Use structured logging via `tracing::{info, warn, error, debug}`.
- **Avoid**: `println!`/`eprintln!` in backend runtime and command paths.
- **Initialization**: Logging is initialized in both `src/lib.rs` and `src/main.rs` with `tracing-subscriber` + `EnvFilter::try_from_default_env()`, defaulting to `info` when `RUST_LOG` is not set.
- **Local debugging**: Set `RUST_LOG=info,spellbook_desktop=debug` (or equivalent shell syntax) to increase verbosity.
- **Scope note**: Migration/report CLI workflows may still emit stdout/stderr and append to `migration.log` for operator-facing output.

## Database

- **Engine**: SQLite with `rusqlite` and `r2d2_sqlite` pooling
- **Vector Search**: `sqlite-vec` extension for semantic search

### Migration System
The application uses a "Hash Backfill" system (`src/utils/migration_manager.rs`) to maintain data integrity across core updates.

- **Hashing**: All spells have a `content_hash` derived from their `CanonicalSpell` representation.
- **Backfill**: Run during app start via `init_db(..., true)`. Logs progress every 100 spells and a final summary (processed, updated, parse fallbacks, hash failures). On UNIQUE constraint (hash collision), logs a clear message to migration.log and stderr and aborts. CLI commands should use `false` to avoid unintended mutations.
- **Backup**: `migration_manager.rs` automatically creates a backup before starting any structural migration.
- **Sync check**: On every spell *write* (including `update_spell`, `upsert_spell`, and import), a sync check compares flat columns to `canonical_data` and logs discrepancies (no env toggle). It is not run on read (e.g. `get_spell`).

**CLI Recovery Tools**:
- `--check-integrity`: Recompute hash from `canonical_data` for each spell and compare to stored `content_hash`; report mismatches, NULL hashes, orphan `character_class_spell` rows, and duplicate hashes.
- `--recompute-hashes`: Force refresh of all structured data.
- `--detect-collisions`: List duplicate `content_hash` groups; for each group compare `canonical_data` and report "Duplicate content (same spell data)" or "True hash collision (different content, same hash)".
- `--restore-backup <path>`: Restore DB from backup file; runs `PRAGMA integrity_check` after restore and fails if result is not "ok".
- `--rollback-migration`: Revert to the latest automatic backup (uses restore-backup internally).

## Dependencies

Key crates:
- `tauri` - Application framework
- `tokio` - Async runtime (features: `process`, `io-util`)
- `rusqlite` - SQLite bindings (features: `bundled`, `load_extension`)
- `thiserror` - Error derive macros
- `serde` / `serde_json` - Serialization
- `chrono` - Date/time handling
- `regex` - Filename sanitization
- `llama-cpp-2` (llama.cpp / `llama-cpp-sys-2`) - Local TinyLlama inference (see CRT pitfall below). Optional via default-on Cargo feature `llm`.
- `fastembed` - all-MiniLM-L6-v2 embeddings via ONNX (`ort`). Optional via default-on Cargo feature `llm`.
- `sha2` / `hex` - SHA-256 verification of approved model files
- `reqwest` - resumable HTTP Range downloads for provisioning
- `sysinfo` - free RAM/disk probes used by the provisioning thresholds

`pnpm tauri:dev` and release builds use default features (`llm` on). `cargo check --no-default-features` (and `cargo clippy --no-default-features -- -D warnings`) omit chat and semantic-search commands for machines without the C++/ORT toolchain. `reqwest` / `sysinfo` / `sha2` stay compiled either way.

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

## Local LLM & Embeddings

Local chat and semantic search run in-process in Rust when the default-on Cargo feature `llm` is enabled. Model files live under `{SpellbookVault}/models/` (see `commands/provisioning.rs`). The Python sidecar is not on this path. `--no-default-features` skips `llama-cpp-2` / `fastembed` and does not register chat or semantic commands.

Managed state is registered in `lib.rs`:
- `Arc<LlmState>` (feature `llm` only)
- `Arc<EmbeddingState>` (real model state with `llm`; no-op stub without it)
- `Arc<ProvisioningState>` (feature `llm` only; one global high-bandwidth guard; overlapping LLM vs embeddings provisioning fails with the target-specific errors already returned by those commands)

### Data Model

**`LlmState`** (`commands/llm.rs`): `Mutex<Option<LlamaModel>>`, backend, `status: Mutex<LlmStatus>`, `last_error`, active generation, download state, reprovisioning epoch.

**`LlmStatus`** wire values (`models/llm.rs`, `rename_all = "camelCase"`): `notProvisioned | downloading | ready | loaded | error`.

**`LlmStatusResponse`** fields (camelCase over IPC): `status`, `modelPath`, `bytesDownloaded`, `totalBytes`, `lastError`. Use `status` — not `state`.

**`EmbeddingState`** (`commands/embeddings.rs`): `Mutex<Option<Arc<Mutex<TextEmbedding>>>>`, `status: Mutex<EmbeddingsStatus>`, `last_error`, download state, reindex flag, per-spell embed generations.

**`EmbeddingsStatus`** wire values: `notProvisioned | downloading | initializing | ready | error`.

**`EmbeddingsStatusResponse`** fields: `state`, `downloadProgress`, `errorMessage`. `downloadProgress` is a 0–1 fraction during an active download (else omitted); it is not a byte count. Use `state` — not `status`.

Approved files (do not accept arbitrary GGUF/ONNX):
- LLM: `models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf` — SHA-256 `9FECC3B3CD76BBA89D504F29B616EEDF7DA85B96540E490CA5824D3F7D2776A0`
- Embeddings: `models/embeddings/all-MiniLM-L6-v2/` — five-file inventory in `EMBEDDING_EXPECTED_FILES` plus manifest `5f1b8cd78bc4fb444dd171e59b18f3a3af89a079`

Thresholds (`BASELINE_MIN_FREE_DISK_BYTES` / `BASELINE_MIN_FREE_RAM_BYTES`): LLM download checks disk `>= 838860800` bytes (`require_download_disk_headroom`); LLM load checks RAM `>= 1610612736` bytes. Embeddings download checks both disk `>= 838860800` and RAM `>= 1610612736` (`ensure_resources_available`).

### Command Patterns

Register these in `lib.rs`. Frontend wrappers live in `src/api/llm.ts`.

| Command | Role |
| ------- | ---- |
| `llm_status` | Current `LlmStatusResponse` |
| `llm_download_model` | In-app download of the approved GGUF; emits `llm://download-progress` `{ bytesDownloaded, totalBytes }` |
| `llm_import_model_file` | Verified side-load: exact filename identity + SHA-256, then copy into `models/` |
| `llm_cancel_download` | Abort in-flight LLM download; restore the pre-download lifecycle (typically `notProvisioned` on a first download); keep partial bytes for resume |
| `llm_cancel_generation` | Stop the active stream at the next token boundary; args: `streamId` |
| `llm_chat` | Lazy-load model, FTS RAG, stream tokens. Args: `message`, `streamId`, `history` |
| `embeddings_status` | Current `EmbeddingsStatusResponse` |
| `embeddings_download_model` | In-app download of the approved ONNX bundle; emits `embeddings://download-progress` |
| `embeddings_import_model_file` | Verified side-load of the approved bundle |
| `embeddings_cancel_download` | Abort embedding download |
| `search_spells_semantic` | Ranked results with `cosineDistance`. Replaces `search_semantic` (removed) |
| `reindex_embeddings` | Args: `force: bool`. Emits `embeddings://reindex-progress` `{ current, total }`. Returns `ReindexResult` `{ total, indexed, skipped, failed }` |

Do not reintroduce `search_semantic` or `chat_answer`. Chat uses `llm_chat` only.

`chat_answer` and `search_semantic` are not registered. Do not add a compatibility wrapper. New UI and tests call `llm_chat` and `search_spells_semantic` only.

**Streaming:** Frontend generates `streamId` (see frontend AGENTS.md). Backend emits:
- `llm://token/{streamId}` payload `{ token }`
- `llm://done/{streamId}` payload `{ fullResponse, cancelled, searchTerms, groundedSpells, timedOut }`

`stream_id` must be non-empty. One inference at a time; a second `llm_chat` is rejected. Timeout is 120s.

**Hooks already wired:** `create_spell` / `update_spell` / import completion embed in the background when the embedding model is `ready`. Failures log and must not fail the spell write. Startup runs embedding init plus `reindex_embeddings(force=false)` backfill.

**Vault:** `backup_vault` archives the DB, `spells/`, and `vault-settings.json` only. It never adds `models/`. `restore_vault` must leave existing model files untouched.

### Side-load rules

1. User picks a local file/bundle through `llm_import_model_file` / `embeddings_import_model_file`.
2. Validate exact approved identity (filename/layout) and SHA-256 / file inventory.
3. On success, copy into `{SpellbookVault}/models/` and set LLM `ready` or embeddings `initializing`/`ready`.
4. On rejection, leave status unchanged and return a validation error. Do not copy a mismatched file into the vault.

## Common Pitfalls

1. **Type inference in closures**: Always use `Ok::<T, AppError>(value)` inside `spawn_blocking`
2. **Migration paths**: Relative to the source file, currently `../../../../../db/migrations/`
3. **Unused imports**: Run `cargo fix --lib` to auto-clean
4. **CRT linkage on Windows**: `src-tauri/.cargo/config.toml` forces `STATIC_VCRUNTIME=false` (dynamic CRT, force-overridden). Every vendored native dependency (`rusqlite`'s bundled sqlite3, `sqlite-vec`, `llama-cpp-sys-2`, `ort`/onnxruntime via `fastembed`) links the dynamic CRT via `cc-rs`; tauri-build otherwise statically links the exe's CRT, and mixing the two crosses an allocator boundary and corrupts the heap (surfaces on debug builds as `_CrtIsValidHeapPointer` / `is_block_type_valid` assertion crashes at startup). Do not remove this setting or add a new vendored C/C++ dependency without checking it links the same (dynamic) CRT. Release builds now depend on the end-user machine having the standard MSVC runtime present rather than embedding it; `src-tauri/installer/vcredist-check.nsh` (wired via `bundle.windows.nsis.installerHooks`) warns the user at install time if it's missing, with a link to Microsoft's official redistributable — it only checks and warns, it does not bundle or silently install anything.

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
