# Artifact Hash Read Paths Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Complete task 6.2 — expose `spell_content_hash` from artifact rows, update `reparse_artifact` to use hash-first spell lookup, and add a grace placeholder in the SpellEditor for unverified (null-hash) artifacts.

**Architecture:** Three coordinated changes: (1) the backend `SpellArtifact` model gains a `spell_content_hash` field populated by `get_spell_from_conn`; (2) `reparse_artifact` in `import.rs` gets an extracted `resolve_artifact_spell_id` helper that resolves a spell ID by hash-first, spell_id fallback, with graceful "no longer in library" errors; (3) the frontend `SpellArtifact` TS type gains `spellContentHash` and the SpellEditor shows a warning badge for legacy/unverified artifacts whose hash is null.

**Tech Stack:** Rust (Tauri backend, rusqlite), TypeScript/React (SpellEditor.tsx), pnpm.

---

## File Map

| File | Change |
|------|--------|
| `apps/desktop/src-tauri/src/models/spell.rs` | Add `spell_content_hash: Option<String>` to `SpellArtifact` struct |
| `apps/desktop/src-tauri/src/commands/spells.rs` | Update three `SpellArtifact { ... }` construction sites in `get_spell_from_conn`; add two new tests |
| `apps/desktop/src-tauri/src/commands/import.rs` | Extract `resolve_artifact_spell_id(conn, artifact_id)`; update `reparse_artifact` to use it; add four unit tests |
| `apps/desktop/src/types/spell.ts` | Add `spellContentHash?: string \| null` to `SpellArtifact` interface |
| `apps/desktop/src/ui/components/ArtifactRow.tsx` | New component: renders one artifact row with "not hash-verified" badge for null `spellContentHash` |
| `apps/desktop/src/ui/components/ArtifactRow.test.tsx` | New test: 3 cases for badge visibility using `renderToStaticMarkup` |
| `apps/desktop/src/ui/SpellEditor.tsx` | Replace inline artifact row JSX with `<ArtifactRow artifact={art} />`; add import |

---

## Chunk 1: Backend model & GET path

---

### Task 1: Add `spell_content_hash` field to `SpellArtifact` model

**Files:**
- Modify: `apps/desktop/src-tauri/src/models/spell.rs:120-131`

- [x] **Step 1: Write a failing test that accesses the new field**

In `apps/desktop/src-tauri/src/commands/spells.rs`, at the bottom of the `#[cfg(test)]` mod (after the existing artifact tests, around line 1235), add:

```rust
#[test]
fn test_get_spell_from_conn_artifact_exposes_spell_content_hash() {
    let conn = setup_get_spell_artifact_test_db();
    conn.execute(
        "INSERT INTO spell (id, name, level, description, content_hash) VALUES (1, 'Test', 1, 'Desc', 'spell-hash-1')",
        [],
    )
    .expect("insert spell");
    conn.execute(
        "INSERT INTO artifact (spell_id, type, path, hash, imported_at, spell_content_hash) VALUES (NULL, 'source', 'a.md', 'ah', '2026-01-01T00:00:00Z', 'spell-hash-1')",
        [],
    )
    .expect("insert artifact with spell_content_hash set");

    let detail = get_spell_from_conn(&conn, 1).expect("get spell").expect("some");
    let artifact = &detail.artifacts.expect("loaded")[0];
    assert_eq!(
        artifact.spell_content_hash,
        Some("spell-hash-1".to_string()),
        "artifact should expose spell_content_hash when column is populated"
    );
}

#[test]
fn test_get_spell_from_conn_artifact_null_spell_content_hash_for_legacy() {
    let conn = setup_get_spell_artifact_test_db();
    conn.execute(
        "INSERT INTO spell (id, name, level, description, content_hash) VALUES (1, 'Test', 1, 'Desc', 'spell-hash-1')",
        [],
    )
    .expect("insert spell");
    conn.execute(
        "INSERT INTO artifact (spell_id, type, path, hash, imported_at, spell_content_hash) VALUES (1, 'source', 'legacy.md', 'ah', '2026-01-01T00:00:00Z', NULL)",
        [],
    )
    .expect("insert legacy artifact with null spell_content_hash");

    let detail = get_spell_from_conn(&conn, 1).expect("get spell").expect("some");
    let artifact = &detail.artifacts.expect("loaded")[0];
    assert_eq!(
        artifact.spell_content_hash, None,
        "legacy artifact (NULL spell_content_hash) should return None"
    );
}
```

- [x] **Step 2: Run the tests to confirm they fail to compile**

```powershell
cd apps/desktop/src-tauri
cargo test test_get_spell_from_conn_artifact_exposes_spell_content_hash 2>&1 | head -20
```
Expected: compile error — `no field 'spell_content_hash' on type 'SpellArtifact'`

- [x] **Step 3: Add `spell_content_hash` field to `SpellArtifact`**

In `apps/desktop/src-tauri/src/models/spell.rs`, update the struct:

```rust
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(crate = "serde")]
#[serde(rename_all = "camelCase")]
pub struct SpellArtifact {
    pub id: i64,
    pub spell_id: i64,
    pub r#type: String,
    pub path: String,
    pub hash: String,
    pub imported_at: String,
    pub spell_content_hash: Option<String>,
}
```

- [x] **Step 4: Update the three construction sites in `get_spell_from_conn` (spells.rs)**

**Site A** — `(Some(sid), Some(h))` branch, `artifact_has_hash_column = true` (around line 169):

Update the SELECT to include `spell_content_hash` and map column 6:

```rust
let mut stmt = conn.prepare(
    "SELECT id, spell_id, type, path, hash, imported_at, spell_content_hash FROM artifact
     WHERE (spell_content_hash IS NOT NULL AND spell_content_hash = ?)
        OR (spell_content_hash IS NULL AND spell_id = ?)",
)?;
let rows = stmt.query_map(rusqlite::params![h, sid], |row| {
    let spell_id: i64 = row.get::<_, Option<i64>>(1)?.unwrap_or(sid);
    Ok(SpellArtifact {
        id: row.get(0)?,
        spell_id,
        r#type: row.get(2)?,
        path: row.get(3)?,
        hash: row.get(4)?,
        imported_at: row.get(5)?,
        spell_content_hash: row.get(6)?,
    })
})?;
```

**Site B** — `(Some(sid), Some(h))` branch, `artifact_has_hash_column = false` (around line 185):

```rust
let mut stmt = conn.prepare(
    "SELECT id, spell_id, type, path, hash, imported_at FROM artifact WHERE spell_id = ?",
)?;
let rows = stmt.query_map([sid], |row| {
    Ok(SpellArtifact {
        id: row.get(0)?,
        spell_id: row.get::<_, Option<i64>>(1)?.unwrap_or(sid),
        r#type: row.get(2)?,
        path: row.get(3)?,
        hash: row.get(4)?,
        imported_at: row.get(5)?,
        spell_content_hash: None,
    })
})?;
```

**Site C** — `(Some(sid), None)` branch (around line 202):

```rust
let mut stmt = conn.prepare(
    "SELECT id, spell_id, type, path, hash, imported_at FROM artifact WHERE spell_id = ?",
)?;
let rows = stmt.query_map([sid], |row| {
    Ok(SpellArtifact {
        id: row.get(0)?,
        spell_id: row.get(1)?,
        r#type: row.get(2)?,
        path: row.get(3)?,
        hash: row.get(4)?,
        imported_at: row.get(5)?,
        spell_content_hash: None,
    })
})?;
```

- [x] **Step 5: Run all artifact tests to verify they pass**

```powershell
cd apps/desktop/src-tauri
cargo test spells::tests 2>&1 | tail -20
```
Expected: all pass, including the two new tests. Existing tests that assert on `artifact.path` still pass.

- [x] **Step 6: Commit**

```powershell
git add apps/desktop/src-tauri/src/models/spell.rs apps/desktop/src-tauri/src/commands/spells.rs
git commit -m "feat: expose spell_content_hash on SpellArtifact model and backend SELECT"
```

---

## Chunk 2: Backend — hash-first lookup in `reparse_artifact`

---

### Task 2: Extract `resolve_artifact_spell_id` helper and write tests

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/import.rs`

The helper:
- Takes a `Connection` and `artifact_id: i64`
- Returns `(spell_id: i64, artifact_path: String)` or `AppError::NotFound`
- Uses `spell_content_hash` → `SELECT id FROM spell WHERE content_hash = ?` when the column exists
- Falls back to `spell_id` column when hash lookup fails or column absent
- Returns a descriptive "no longer in library" error if neither resolves

- [x] **Step 1: Write the four failing unit tests**

Append to the `#[cfg(test)]` mod in `apps/desktop/src-tauri/src/commands/import.rs` (search for the existing test block; add after the last test):

```rust
// -----------------------------------------------------------------------
// resolve_artifact_spell_id tests
// -----------------------------------------------------------------------

fn setup_resolve_artifact_db() -> Connection {
    let conn = Connection::open_in_memory().expect("open in-memory db");
    conn.execute_batch(
        "CREATE TABLE spell (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            level INTEGER NOT NULL DEFAULT 1,
            description TEXT NOT NULL DEFAULT '',
            content_hash TEXT
        );
        CREATE TABLE artifact (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            spell_id INTEGER,
            spell_content_hash TEXT,
            path TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'source',
            hash TEXT NOT NULL DEFAULT 'h',
            imported_at TEXT NOT NULL DEFAULT '2026-01-01T00:00:00Z'
        );",
    )
    .expect("create test schema");
    conn
}

#[test]
fn test_resolve_artifact_spell_id_by_hash() {
    let conn = setup_resolve_artifact_db();
    conn.execute(
        "INSERT INTO spell (id, content_hash) VALUES (42, 'hash-xyz')",
        [],
    )
    .expect("insert spell");
    conn.execute(
        "INSERT INTO artifact (id, spell_id, spell_content_hash, path) VALUES (1, NULL, 'hash-xyz', 'a.md')",
        [],
    )
    .expect("insert artifact with hash only");

    let (spell_id, path) = resolve_artifact_spell_id(&conn, 1).expect("resolve ok");
    assert_eq!(spell_id, 42, "should resolve spell_id from hash");
    assert_eq!(path, "a.md");
}

#[test]
fn test_resolve_artifact_spell_id_hash_fallback_to_spell_id() {
    // Hash set but no matching spell row → fall back to spell_id column
    let conn = setup_resolve_artifact_db();
    conn.execute(
        "INSERT INTO spell (id, content_hash) VALUES (7, 'different-hash')",
        [],
    )
    .expect("insert spell");
    conn.execute(
        "INSERT INTO artifact (id, spell_id, spell_content_hash, path) VALUES (1, 7, 'stale-hash', 'b.md')",
        [],
    )
    .expect("insert artifact with stale hash but valid spell_id");

    let (spell_id, path) = resolve_artifact_spell_id(&conn, 1).expect("resolve ok");
    assert_eq!(spell_id, 7, "should fall back to spell_id when hash not found");
    assert_eq!(path, "b.md");
}

#[test]
fn test_resolve_artifact_spell_id_not_found_returns_error() {
    // Neither hash nor spell_id resolves to an existing spell
    let conn = setup_resolve_artifact_db();
    conn.execute(
        "INSERT INTO artifact (id, spell_id, spell_content_hash, path) VALUES (1, NULL, 'orphan-hash', 'c.md')",
        [],
    )
    .expect("insert orphaned artifact");

    let result = resolve_artifact_spell_id(&conn, 1);
    assert!(
        matches!(result, Err(AppError::NotFound(_))),
        "should return NotFound when spell is gone"
    );
}

#[test]
fn test_resolve_artifact_spell_id_legacy_no_hash_column() {
    // Old schema without spell_content_hash column — uses spell_id directly
    let conn = Connection::open_in_memory().expect("open in-memory db");
    conn.execute_batch(
        "CREATE TABLE spell (
            id INTEGER PRIMARY KEY,
            content_hash TEXT
        );
        CREATE TABLE artifact (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            spell_id INTEGER,
            path TEXT NOT NULL
        );",
    )
    .expect("create legacy schema");
    conn.execute("INSERT INTO spell (id, content_hash) VALUES (5, 'h')", [])
        .expect("insert spell");
    conn.execute(
        "INSERT INTO artifact (id, spell_id, path) VALUES (1, 5, 'legacy.md')",
        [],
    )
    .expect("insert legacy artifact");

    let (spell_id, path) = resolve_artifact_spell_id(&conn, 1).expect("resolve ok");
    assert_eq!(spell_id, 5);
    assert_eq!(path, "legacy.md");
}
```

- [x] **Step 2: Run tests to confirm they fail (function not yet defined)**

```powershell
cd apps/desktop/src-tauri
cargo test test_resolve_artifact_spell_id 2>&1 | head -20
```
Expected: compile error — `cannot find function 'resolve_artifact_spell_id'`

- [x] **Step 3: Implement `resolve_artifact_spell_id` in `import.rs`**

Add the following function **before** the `#[tauri::command] pub async fn reparse_artifact` definition (around line 2443). It is `pub(crate)` only for test access but is only used locally:

```rust
/// Resolves the spell ID and artifact path for a given artifact row.
///
/// Uses `artifact.spell_content_hash` as the primary identifier (hash-first) and falls back
/// to `artifact.spell_id` during the migration period before `spell_id` is officially dropped.
///
/// Returns `AppError::NotFound` when neither column resolves to a live spell.
fn resolve_artifact_spell_id(
    conn: &rusqlite::Connection,
    artifact_id: i64,
) -> Result<(i64, String), AppError> {
    let has_hash_col = table_has_column(conn, "artifact", "spell_content_hash");

    let (db_spell_id, db_spell_hash, path): (Option<i64>, Option<String>, String) =
        if has_hash_col {
            conn.query_row(
                "SELECT spell_id, spell_content_hash, path FROM artifact WHERE id = ?",
                [artifact_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .map_err(AppError::Database)?
        } else {
            conn.query_row(
                "SELECT spell_id, path FROM artifact WHERE id = ?",
                [artifact_id],
                |row| Ok((row.get::<_, Option<i64>>(0)?, None::<String>, row.get(1)?)),
            )
            .map_err(AppError::Database)?
        };

    // Hash-first: look up spell.id by content_hash; fall back to spell_id (migration period).
    // When spell_id is dropped: remove the `.or(db_spell_id)` fallback arm.
    let spell_id = if let Some(hash) = db_spell_hash {
        let found: Option<i64> = conn
            .query_row(
                "SELECT id FROM spell WHERE content_hash = ?",
                [hash.as_str()],
                |row| row.get(0),
            )
            .optional()?;
        found.or(db_spell_id).ok_or_else(|| {
            AppError::NotFound(
                "The spell referenced by this artifact is no longer in the library".into(),
            )
        })?
    } else {
        db_spell_id.ok_or_else(|| {
            AppError::NotFound(
                "The spell referenced by this artifact is no longer in the library".into(),
            )
        })?
    };

    Ok((spell_id, path))
}
```

- [x] **Step 4: Run the four new tests**

```powershell
cd apps/desktop/src-tauri
cargo test test_resolve_artifact_spell_id 2>&1 | tail -20
```
Expected: 4 PASS

- [x] **Step 5: Commit**

```powershell
git add apps/desktop/src-tauri/src/commands/import.rs
git commit -m "feat: add resolve_artifact_spell_id helper with hash-first spell lookup"
```

---

### Task 3: Wire `resolve_artifact_spell_id` into `reparse_artifact`

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/import.rs` (reparse_artifact, around line 2443)

**Pre-condition (TDD):** The four tests from Task 2 (`test_resolve_artifact_spell_id_*`) are the failing-test gate for this wiring task. They directly exercise the helper that replaces the inline query. No additional tests are needed before making the Task 3 changes — the Task 2 tests serve as the pre-existing failing specifications.

- [x] **Step 1: Replace the first spawn_blocking block in `reparse_artifact`**

Find the existing block:

```rust
    let (spell_id, artifact_path) = {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || {
            let conn = pool.get()?;
            let row: (i64, String) = conn
                .query_row(
                    "SELECT spell_id, path FROM artifact WHERE id = ?",
                    [artifact_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .map_err(AppError::Database)?;
            Ok::<_, AppError>(row)
        })
        .await
        .map_err(|e| AppError::Unknown(e.to_string()))??
    };
```

Replace it with:

```rust
    let (spell_id, artifact_path) = {
        let pool = pool.clone();
        tokio::task::spawn_blocking(move || {
            let conn = pool.get()?;
            resolve_artifact_spell_id(&conn, artifact_id)
        })
        .await
        .map_err(|e| AppError::Unknown(e.to_string()))??
    };
```

- [x] **Step 2: Update the `_original_spell` error message to match the new wording**

Find:
```rust
        .ok_or_else(|| AppError::NotFound("Original spell not found".to_string()))?
```
Replace with:
```rust
        .ok_or_else(|| AppError::NotFound("The spell referenced by this artifact is no longer in the library".to_string()))?
```

This keeps error messages consistent from the helper and the spell validation step.

- [x] **Step 3: Run all existing import tests to confirm no regressions**

```powershell
cd apps/desktop/src-tauri
cargo test import:: 2>&1 | tail -30
```
Expected: all pass. No warnings about unused fields.

- [x] **Step 4: Commit**

```powershell
git add apps/desktop/src-tauri/src/commands/import.rs
git commit -m "feat: reparse_artifact uses hash-first spell resolution via resolve_artifact_spell_id"
```

---

## Chunk 3: Frontend — type and UI placeholder

---

### Task 4: Add `spellContentHash` to TypeScript `SpellArtifact`

**Files:**
- Modify: `apps/desktop/src/types/spell.ts:62-69`

- [x] **Step 1: Add the field**

In `apps/desktop/src/types/spell.ts`, update the `SpellArtifact` interface:

```typescript
export interface SpellArtifact {
  id: number;
  spellId: number;
  type: string;
  path: string;
  hash: string;
  importedAt: string;
  spellContentHash?: string | null;
}
```

- [x] **Step 2: Verify TypeScript compiles cleanly**

```powershell
cd apps/desktop
pnpm tsc --noEmit 2>&1 | tail -20
```
Expected: no errors (the new field is optional, so no call sites break).

- [x] **Step 3: Commit**

```powershell
git add apps/desktop/src/types/spell.ts
git commit -m "feat: add spellContentHash to SpellArtifact TypeScript type"
```

---

### Task 5: SpellEditor grace placeholder for unverified artifacts

**Files:**
- Create: `apps/desktop/src/ui/components/ArtifactRow.tsx`
- Create: `apps/desktop/src/ui/components/ArtifactRow.test.tsx`
- Modify: `apps/desktop/src/ui/SpellEditor.tsx` (around line 2636)

The scenario: an artifact loaded with `spellContentHash == null` means it was imported before migration 0015 ran. It's a legacy artifact — hash identity is unconfirmed. Show the user a warning so they know the artifact isn't hash-linked.

To keep the badge testable without SpellEditor's full routing/IPC/modal infrastructure, extract the artifact row rendering into a standalone `ArtifactRow` component. SpellEditor then uses `ArtifactRow`. Tests for the badge render against the real component.

- [x] **Step 1: Write the failing test**

Create `apps/desktop/src/ui/components/ArtifactRow.test.tsx`:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ArtifactRow from "./ArtifactRow";
import type { SpellArtifact } from "../../types/spell";

const BASE: SpellArtifact = {
  id: 1,
  spellId: 1,
  type: "source",
  path: "a.md",
  hash: "abc123",
  importedAt: "2026-01-01T00:00:00Z",
};

describe("ArtifactRow", () => {
  it("shows not-hash-verified badge when spellContentHash is null", () => {
    const html = renderToStaticMarkup(
      <ArtifactRow artifact={{ ...BASE, spellContentHash: null }} />,
    );
    expect(html).toContain('data-testid="artifact-not-hash-verified"');
  });

  it("hides not-hash-verified badge when spellContentHash is set", () => {
    const html = renderToStaticMarkup(
      <ArtifactRow artifact={{ ...BASE, spellContentHash: "deadbeef" }} />,
    );
    expect(html).not.toContain('data-testid="artifact-not-hash-verified"');
  });

  it("shows not-hash-verified badge when spellContentHash is undefined (no hash column in backend)", () => {
    const html = renderToStaticMarkup(<ArtifactRow artifact={BASE} />);
    expect(html).toContain('data-testid="artifact-not-hash-verified"');
  });
});
```

- [x] **Step 2: Run the test to confirm it fails (module not found)**

```powershell
cd apps/desktop
pnpm vitest run src/ui/components/ArtifactRow.test.tsx 2>&1 | tail -20
```
Expected: error — `Cannot find module './ArtifactRow'` (component not yet created)

- [x] **Step 3: Create `ArtifactRow.tsx`**

Create `apps/desktop/src/ui/components/ArtifactRow.tsx`:

```tsx
import type { SpellArtifact } from "../../types/spell";

interface ArtifactRowProps {
  artifact: SpellArtifact;
}

export default function ArtifactRow({ artifact: art }: ArtifactRowProps) {
  return (
    <div className="text-xs space-y-1 text-neutral-500">
      <div className="flex justify-between">
        <span className="font-semibold text-neutral-400">
          Type: {art.type.toUpperCase()}
        </span>
        <span>Imported: {new Date(art.importedAt).toLocaleString()}</span>
      </div>
      <div className="truncate">Path: {art.path}</div>
      <div className="font-mono text-[10px] opacity-70">SHA256: {art.hash}</div>
      {art.spellContentHash == null && (
        <div
          className="text-yellow-500/70 text-[10px]"
          data-testid="artifact-not-hash-verified"
          title="This artifact was imported before hash-based identity was established. Re-import or re-parse to link it."
        >
          ⚠ Not hash-verified (legacy import)
        </div>
      )}
    </div>
  );
}
```

- [x] **Step 4: Run the tests to confirm they pass**

```powershell
cd apps/desktop
pnpm vitest run src/ui/components/ArtifactRow.test.tsx 2>&1 | tail -20
```
Expected: 3 PASS

- [x] **Step 5: Replace inline artifact row JSX in SpellEditor with `<ArtifactRow />`**

In `apps/desktop/src/ui/SpellEditor.tsx`, add the import at the top with other component imports:

```tsx
import ArtifactRow from "./components/ArtifactRow";
```

Find the existing artifact row content (around line 2636):

```tsx
            {form.artifacts?.map((art) => (
              <div key={art.id} className="text-xs space-y-1 text-neutral-500">
                <div className="flex justify-between">
                  <span className="font-semibold text-neutral-400">
                    Type: {art.type.toUpperCase()}
                  </span>
                  <span>Imported: {new Date(art.importedAt).toLocaleString()}</span>
                </div>
                <div className="truncate">Path: {art.path}</div>
                <div className="font-mono text-[10px] opacity-70">SHA256: {art.hash}</div>
              </div>
            ))}
```

Replace with:

```tsx
            {form.artifacts?.map((art) => (
              <ArtifactRow key={art.id} artifact={art} />
            ))}
```

- [x] **Step 6: Run frontend type-check and all vitest tests**

```powershell
cd apps/desktop
pnpm tsc --noEmit 2>&1 | tail -10
pnpm vitest run --reporter=verbose 2>&1 | tail -30
```
Expected: no TS errors; all vitest tests pass.

- [x] **Step 7: Commit**

```powershell
git add apps/desktop/src/ui/components/ArtifactRow.tsx apps/desktop/src/ui/components/ArtifactRow.test.tsx apps/desktop/src/ui/SpellEditor.tsx
git commit -m "feat: extract ArtifactRow component with not-hash-verified badge for legacy imports"
```

---

## Final Verification

- [x] **Run full backend test suite**

```powershell
cd apps/desktop/src-tauri
cargo test 2>&1 | tail -40
```
Expected: all pass (or pre-existing vault_env_lock PoisonError noise, documented in task 6 review).

- [x] **Run frontend build**

```powershell
cd apps/desktop
pnpm tsc --noEmit
```
Expected: clean.

- [x] **Mark tasks.md items complete**

In `openspec/changes/integrate-spell-hashing-ecosystem/tasks.md`, mark both 6.2 sub-items `[x]`:
```markdown
- [x] 6.2 Follow-up tracking
    - [x] Update frontend/backend read paths to load artifacts by `spell_content_hash` instead of `spell_id` before `spell_id` is officially dropped.
    - [x] Implement grace placeholder for artifact UI when referenced `spell_content_hash` does not exist in the library.
```

- [x] **Final commit**

```powershell
git add openspec/changes/integrate-spell-hashing-ecosystem/tasks.md
git commit -m "docs: mark task 6.2 artifact hash read paths complete"
```
