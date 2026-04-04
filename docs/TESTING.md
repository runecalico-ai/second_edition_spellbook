# Testing Guide

This document provides comprehensive guidelines for testing the Second Edition Spellbook application across all components: Backend (Rust/Tauri), Frontend (React/TypeScript), and Services (Python/ML).

---

## Quick Reference

| Component | Location | Command | Framework |
|-----------|----------|---------|-----------|
| Backend | `apps/desktop/src-tauri` | `cargo test` | Rust built-in |
| Frontend (Lint) | `apps/desktop` | `pnpm lint` | Biome |
| Frontend (Types) | `apps/desktop` | `pnpm tsc --noEmit` | TypeScript (tsc) |
| Frontend (Unit) | `apps/desktop` | `pnpm test:unit` | Vitest |
| Frontend (Stories) | `apps/desktop` | `pnpm test:storybook` | Storybook + Vitest |
| Python | `services/ml` | `pytest` | pytest |
| E2E | `apps/desktop` | `pnpm e2e` | Playwright |

---

## Backend Testing (Rust)

### Running Tests

```bash
cd apps/desktop/src-tauri

# Run all tests
cargo test

# Run library tests only (excludes integration tests)
cargo test --lib

# Run tests for a specific module
cargo test canonical_spell
cargo test parsers::duration
cargo test migration_manager

# Show captured test output during tests
cargo test -- --nocapture

# Run tests matching a pattern
cargo test test_parse_duration

# Run a single specific test
cargo test test_issue_2_duration_parsing_value_zero -- --exact
```

To increase backend runtime log verbosity during tests, set `RUST_LOG` before running commands:

```powershell
# PowerShell
$env:RUST_LOG="info,spellbook_desktop=debug"
cargo test -- --nocapture
```

```bash
# bash/zsh
RUST_LOG=info,spellbook_desktop=debug cargo test -- --nocapture
```

`-- --nocapture` shows test output; backend runtime and command diagnostics should use `tracing::{info, warn, error, debug}` rather than `println!`/`eprintln!`.

### Parser Testing

Parsers are the core of the spell data migration. Each parser has its own test suite.

```bash
# Test individual parsers
cargo test --lib parsers::range
cargo test --lib parsers::area
cargo test --lib parsers::duration
cargo test --lib parsers::mechanics
cargo test --lib parsers::components
```

#### Parser Test Structure

Each parser test file follows this pattern:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_basic_case() {
        let parser = DurationParser::new();
        let result = parser.parse("10 rounds");

        assert_eq!(result.kind, DurationKind::Time);
        assert_eq!(result.unit, Some(DurationUnit::Round));
        assert_eq!(result.duration.unwrap().value, Some(10.0));
    }

    #[test]
    fn test_parse_edge_case() {
        let parser = DurationParser::new();
        let result = parser.parse("Special");

        assert_eq!(result.kind, DurationKind::Special);
    }
}
```

#### Naming Conventions

| Pattern | Usage |
|---------|-------|
| `test_parse_<feature>` | Standard parser tests |
| `test_issue_<N>_<description>` | Bug fix verification |
| `test_regression_<description>` | Regression prevention |
| `test_<module>_<feature>` | Module-specific tests |

### Model Testing

Model tests verify serialization, normalization, and schema compliance.

```bash
# Test model modules
cargo test --lib models::canonical_spell
cargo test --lib models::duration_spec
cargo test --lib models::area_spec
```

#### Key Test Categories

1. **Serialization/Deserialization**: Verify JSON round-trip
2. **Normalization**: Verify `normalize()` methods
3. **Hashing**: Verify content hash stability
4. **Default Values**: Verify schema defaults are applied

### Migration Testing

Migration tests verify database operations and data integrity.

```bash
# Run migration tests
cargo test --lib migration_manager

# Critical regression test
cargo test test_migration_column_mapping_regression
```

> **⚠️ Important**: Always run `test_migration_column_mapping_regression` after modifying any SQL queries in `migration_manager.rs`. Column index mismatches cause data corruption.

---

## Migration Validation Testing

This section provides comprehensive guidelines for testing database migrations locally before deploying.

### Setting Up Local Migration Tests

#### 1. Create Test Database

Use an in-memory SQLite database for fast, isolated tests:

```rust
use rusqlite::Connection;
use tempfile::tempdir;

#[test]
fn test_migration_with_sample_data() -> Result<(), Box<dyn std::error::Error>> {
    // Create in-memory database
    let db = Connection::open_in_memory()?;

    // Set up schema (mirrors production)
    db.execute_batch(r#"
        CREATE TABLE spell (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            level INTEGER NOT NULL,
            school TEXT,
            description TEXT NOT NULL,
            range TEXT,
            duration TEXT,
            content_hash TEXT,
            canonical_data TEXT,
            schema_version INTEGER
            -- ... other columns
        );
    "#)?;

    // Insert test data
    db.execute(
        "INSERT INTO spell (name, level, description, range, duration) VALUES (?1, ?2, ?3, ?4, ?5)",
        params!["Test Spell", 3, "Description", "30 feet", "1 round/level"],
    )?;

    // Run migration
    let temp = tempdir()?;
    run_hash_backfill(&db, temp.path())?;

    // Verify results
    let (hash, json): (Option<String>, Option<String>) = db.query_row(
        "SELECT content_hash, canonical_data FROM spell WHERE name = 'Test Spell'",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;

    assert!(hash.is_some(), "Hash should be populated");
    assert!(json.is_some(), "Canonical data should be populated");

    Ok(())
}
```

#### 2. Sample Data Patterns

Create test spells that exercise all parser paths:

```rust
/// Test data covering all parser categories
const SAMPLE_SPELLS: &[(&str, i32, &str, &str, &str)] = &[
    // Range patterns
    ("Touch Spell", 1, "Touch", "Instantaneous", "Test touch range"),
    ("Distance Spell", 2, "100 feet", "1 round", "Test distance"),
    ("Scaling Range", 3, "10 + 5/level yards", "1 hour", "Test per-level"),

    // Duration patterns
    ("Instant Effect", 1, "Self", "Instantaneous", "Test instant"),
    ("Concentration Spell", 2, "30 feet", "Concentration", "Test conc"),
    ("Permanent Spell", 5, "Touch", "Permanent", "Test permanent"),
    ("Scaling Duration", 3, "60 feet", "1 round/level", "Test scaling"),

    // Area patterns (via area column)
    ("Radius Spell", 3, "100 yards", "1 round", "20-foot radius"),
    ("Cone Spell", 4, "0", "Instantaneous", "30-foot cone"),

    // Edge cases
    ("Special Duration", 7, "Unlimited", "Special", "Edge case"),
    ("Complex Range", 5, "30 feet (line of sight)", "Until dispelled", "LOS test"),
];

#[test]
fn test_migration_sample_data_coverage() -> Result<(), Box<dyn std::error::Error>> {
    let db = setup_test_db()?;

    for (name, level, range, duration, desc) in SAMPLE_SPELLS {
        db.execute(
            "INSERT INTO spell (name, level, range, duration, description) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![name, level, range, duration, desc],
        )?;
    }

    let temp = tempdir()?;
    run_hash_backfill(&db, temp.path())?;

    // Verify all spells were migrated
    let (migrated, total): (i64, i64) = db.query_row(
        "SELECT COUNT(*) FILTER (WHERE content_hash IS NOT NULL), COUNT(*) FROM spell",
        [],
        |r| Ok((r.get(0)?, r.get(1)?)),
    )?;

    assert_eq!(migrated, total, "All spells should have hashes");
    Ok(())
}
```

### Testing Migration Workflows

#### Test 1: Fresh Migration (Backfill)

```rust
#[test]
fn test_fresh_migration_backfill() {
    // Setup: Database with NULL hashes
    // Action: run_hash_backfill()
    // Verify: All spells have hashes, no errors in log
}
```

#### Test 2: Incremental Update

```rust
#[test]
fn test_incremental_migration() {
    // Setup: Run initial backfill
    // Action: Add new spell, run backfill again
    // Verify: Only new spell processed, existing hashes unchanged
}
```

#### Test 3: Recompute All Hashes

```rust
#[test]
fn test_recompute_hashes() {
    // Setup: Database with existing hashes
    // Action: recompute_all_hashes()
    // Verify: Hashes match (or updated if schema changed)
}
```

#### Test 4: Column Mapping Regression

This is the **most critical** migration test:

```rust
#[test]
fn test_migration_column_mapping_regression() {
    // Setup: Insert spell with DISTINCT values for each field
    // Action: Run backfill
    // Verify: Each field in canonical_data matches input
    //         e.g., level=5 doesn't accidentally get school value
}
```

### Verifying Migration Output

#### Check Log for Errors

After running migration, check `migration.log`:

```powershell
# Look for parsing failures
Select-String -Path "$env:APPDATA\SpellbookVault\migration.log" -Pattern "Failed"

# Look for hash computation errors
Select-String -Path "$env:APPDATA\SpellbookVault\migration.log" -Pattern "Hash failure"

# Count successful updates
Select-String -Path "$env:APPDATA\SpellbookVault\migration.log" -Pattern "Updated hash" | Measure-Object
```

#### Validate JSON Structure

```rust
#[test]
fn test_canonical_json_structure() {
    // Run migration on test spell
    let json: String = db.query_row(
        "SELECT canonical_data FROM spell WHERE id = 1",
        [],
        |r| r.get(0),
    )?;

    // Verify JSON can be deserialized
    let spell: CanonicalSpell = serde_json::from_str(&json)?;

    // Verify key fields
    assert!(spell.name.is_some());
    assert!(spell.level.is_some());
    assert!(spell.id.is_some()); // Hash stored in id field
}
```

#### Validate Hash Consistency

```rust
#[test]
fn test_hash_consistency_after_recompute() {
    // Setup: Run initial migration
    let original_hash: String = get_hash_for_spell(1)?;

    // Action: Recompute hashes
    recompute_all_hashes(&db, &data_dir)?;

    // Verify: Hash should be identical (deterministic)
    let new_hash: String = get_hash_for_spell(1)?;
    assert_eq!(original_hash, new_hash, "Hashes should be deterministic");
}
```

### Running Migration Tests with Real Data

For testing against production-like data:

```powershell
# 1. Create a backup of your production database
.\spellbook-desktop.exe --list-backups

# 2. Copy backup to a test location
Copy-Item "$env:APPDATA\SpellbookVault\spells_backup_*.db" "$env:TEMP\test_migration.db"

# 3. Run integration tests against the copy
# (Modify test to use external file path)

# 4. Compare results
.\spellbook-desktop.exe --check-integrity
```

### Migration Test Checklist

Before deploying migration changes:

- [ ] `test_migration_column_mapping_regression` passes
- [ ] `test_metadata_persistence_and_id_storage_regression` passes
- [ ] All parser unit tests pass
- [ ] Migration log shows no unexpected "Failed to parse" entries
- [ ] Hash consistency verified (same input → same hash)
- [ ] Backup/restore workflow tested
- [ ] Rollback procedure verified

---

## Static Analysis & Type Checking

Before running tests, it is recommended to run static analysis to catch syntax and type errors.

### JS/TS Type Checking (tsc)
Run the TypeScript compiler in "non-emitting" mode to check for type errors across the entire frontend project.
```bash
cd apps/desktop
pnpm tsc --noEmit
```

### JS/TS Linting (Biome)
Run Biome to check for syntax errors, code smells, and formatting issues.
```bash
cd apps/desktop
pnpm lint
```

---

## Frontend Testing (React/TypeScript)

### Running Tests

> **Config location**: Named Vitest projects (`unit`, `storybook`) are defined in `apps/desktop/vitest.config.ts`.

```bash
cd apps/desktop

# Run unit tests
pnpm test:unit

# Run Storybook interaction tests
pnpm test:storybook

# Run in watch mode (development)
pnpm vitest --project=unit --watch

# Run with coverage
pnpm vitest run --project=unit --coverage

# Run tests matching a pattern
pnpm vitest run --project=unit -t "SpellCard"
```

### Test Structure

Frontend tests live alongside their components:

```
src/
├── components/
│   ├── SpellCard.tsx
│   └── SpellCard.test.tsx    # Component test
├── hooks/
│   ├── useSpells.ts
│   └── useSpells.test.ts     # Hook test
└── utils/
    ├── formatters.ts
    └── formatters.test.ts    # Utility test
```

### Component Testing Pattern

```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SpellCard } from './SpellCard';

describe('SpellCard', () => {
  it('renders spell name correctly', () => {
    render(<SpellCard name="Fireball" level={3} />);
    expect(screen.getByText('Fireball')).toBeInTheDocument();
  });

  it('displays level badge', () => {
    render(<SpellCard name="Fireball" level={3} />);
    expect(screen.getByText('Level 3')).toBeInTheDocument();
  });
});
```

### Storybook Component Testing

Storybook provides visual component testing and documentation for all structured spell editor components. Stories complement unit tests by providing:

- **Visual regression testing**: See components in different states
- **Accessibility checks**: Interactive a11y review via `@storybook/addon-a11y` in the Storybook UI (automated `pnpm test:storybook` focuses on render/console health; see [Spell Editor Components Guide](dev/spell_editor_components.md#automated-testing-with-vitest))
- **Interactive documentation**: Living examples of component usage
- **Isolated development**: Test components without full app context

**Running Storybook:**

```bash
cd apps/desktop
pnpm storybook
```

Stories are located in `apps/desktop/src/ui/components/structured/*.stories.tsx` (plus other Storybook groups under `apps/desktop/src/ui/**`). Story counts change as files grow — use `pnpm test:storybook` for the current total.

**Accessibility Testing:**

The `@storybook/addon-a11y` addon checks stories from the Storybook UI for accessibility violations:
- ARIA labels and roles
- Keyboard navigation
- Color contrast
- Semantic HTML

View results in the Storybook UI under the "Accessibility" tab for each story.

**Building Static Storybook:**

```bash
pnpm build-storybook
```

Creates a static build in `storybook-static/` for deployment or sharing.

For detailed Storybook documentation, see [Spell Editor Components Guide](dev/spell_editor_components.md#storybook-stories). Canon-first Details block stories live under **SpellEditor/CanonFirstDetails** (e.g. Default Collapsed, One Field Expanded, Collapsed With Special Indicator); they use the same `detail-*-input` and `detail-*-expand` test IDs as the app.

### Hook Testing Pattern

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useSpells } from './useSpells';

describe('useSpells', () => {
  it('fetches spells on mount', async () => {
    const { result } = renderHook(() => useSpells());

    await waitFor(() => {
      expect(result.current.spells.length).toBeGreaterThan(0);
    });
  });
});
```

### Modal Component Testing

The `ModalShell` component in `src/ui/components/Modal.tsx` is tested in `Modal.test.tsx` using `@testing-library/react` (not `renderToStaticMarkup`). Key behaviors tested:

- `showModal()` / `close()` calls are mocked via `HTMLDialogElement.prototype` in `beforeEach`
- Focus trap (capture-phase Tab listener) is tested by firing `keydown` events on `document`
- Focus return to trigger element is verified after `close()`
- `onCancel` handler (Escape key) is verified via `fireEvent` cancel event

Native `<dialog>` elements require jsdom >= 20 for `HTMLDialogElement` support.

### Spell Editor Unit Tests

Three dedicated unit suites cover the spell editor validation and save workflow. All three use the `jsdom` environment declared with `// @vitest-environment jsdom` at the top of each file.

**`src/ui/spellEditorValidation.test.ts`** — pure Node-safe tests for the validation helper. No DOM or React rendering. Covers:
- All blocking rule combinations (name, description, level, school, sphere, tradition conflict, epic/quest, epic arcane-class, etc.)
- Exact user-facing copy for every non-generic error message
- Exact copy for one scalar field from each in-scope surface (`ScalarInput`, `StructuredFieldInput`, `AreaForm`)

**`src/ui/SpellEditor.test.tsx`** — jsdom component tests for the editor. Uses `createMemoryRouter` + `RouterProvider`, stubs `invoke`, mocks Tauri, resets notification state between tests. Covers:
- Pristine fields: no errors before blur or failed submit
- Clicking Save with invalid form shows inline errors and the hint *Fix the errors above to save*
- Fixing a field immediately clears its error
- Tradition change revalidates school/sphere on change (not only on blur/submit)
- `aria-invalid` and `aria-describedby` wiring for all validated surfaces
- First failed submit focuses the first invalid field
- `spell-name-error` testid is rendered in place of the old name error identifier
- Save-progress threshold: label stays `Save Spell` before 300 ms; changes to `Saving…` at threshold
- Re-entry guard: second save click ignored while first is in flight
- Success: `pushNotification("success", "Spell saved.")` called before navigation
- Light and dark theme styles applied correctly to invalid borders, save hint, and disabled button
- Expanded structured detail panels render the field label, expand/collapse control, and structured group in coherent DOM order
- Expanded panel surface wraps `StructuredFieldInput` / `ComponentCheckboxes` groups without double-border or spacing regression
- Preview outputs remain inside the expanded panel and below the primary control surface
- Special-hint text appears below the structured group when the expanded kind is `special` or `dm_adjudicated` for detail rows that emit `detail-*-special-hint` (not the Components / Material Component rows in the current `SpellEditor.tsx`)

**`src/ui/Library.test.tsx`** — jsdom component tests for Library notification replacements. Mounts `NotificationViewport` alongside `Library` so live-region assertions target the real notification surface. Covers:
- add-to-character success → toast, not `alert()` (Library row flow; Spellbook Builder still uses `alert()` for some errors)
- add-to-character failure → toast, not `alert()` (same scope as above)
- save-search failure → toast, not `alert()`
- delete-saved-search failure → toast, not `alert()`
- Toast delivered through `notification-viewport` live region
- Toast does not steal focus from the triggering control

### Structured Editor Component Render Tests (Chunk 4)

Two dedicated DOM-render test files lock the visual group contract for the structured field components. Both use `// @vitest-environment jsdom` at the top of the file.

**`src/ui/components/structured/StructuredFieldInput.test.tsx`** — Verifies grouped DOM structure across the structured field variants. Key assertions:

- `data-testid="structured-field-input"` root exists and carries the expected surface class tokens (`rounded-xl`, `border-neutral-300`, `dark:bg-neutral-800`).
- `data-testid="structured-field-primary-row"` exists inside the root and carries `flex`, `flex-wrap`, `min-w-0` — confirming 900 px wrap compatibility.
- `data-testid="structured-field-supporting-row"` exists inside the root for notes with subordinate surface classes.
- `data-testid="structured-field-preview-row"` exists inside the root with preview surface classes.
- For **range distance** mode: kind select, scalar, unit select all live inside the primary row; notes in the supporting row; preview in the preview row.
- For **range special** mode: kind select and raw-legacy input both live in the primary row.
- Preview elements render as `<output>` tags, carry `aria-label="Computed {field} text"`, and have no `aria-live` attribute.
- Primary row has `flex-wrap` and `min-w-0` for every field type — the targeted 900 px assertion.
- For **casting-time** mode: the test currently checks the primary row and preview row contract, along with the casting-time controls inside the primary row.

**`src/ui/components/structured/ComponentCheckboxes.test.tsx`** — Verifies the `ComponentCheckboxes` grouped structure. Key assertions:

- `data-testid="component-checkboxes"` root exists.
- `data-testid="component-checkbox-strip"` is a descendant of the root and contains all checkbox inputs.
- `data-testid="component-text-preview"` is a descendant of the root and renders as an `<output>` element.
- With Material enabled and material rows present, `data-testid="material-subform"` appears as a descendant of the root.
- Material rows (`data-testid="material-component-row"`) render inside the subform.
- Preview does not disappear when Material is enabled.
- `vsm` and `all` variants both preserve the root / strip / preview grouping.
- Material subform container uses theme-aware surface classes (`bg-white dark:bg-neutral-800`) instead of dark-only classes.

**Running the structured editor component tests:**

```powershell
pnpm --dir apps/desktop test:unit -- src/ui/components/structured/StructuredFieldInput.test.tsx src/ui/components/structured/ComponentCheckboxes.test.tsx
```

### 900 px Wrap Verification

The `tests/spell_editor_structured_data.spec.ts` Playwright spec includes targeted 900 px layout checks after each structured field edit. These assertions verify that the new grouping wrappers do not introduce horizontal overflow at a narrower viewport, and are the primary automated guard for Chunk 5 resize hardening:

```typescript
// Inside each structured-field scenario:
await page.setViewportSize({ width: 900, height: 768 });
const overflowingGroups = await page.locator('[data-testid="structured-field-input"]').evaluateAll(
  (nodes) => nodes.filter((n) => n.scrollWidth > n.clientWidth).length,
);
expect(overflowingGroups).toBe(0);
```

These checks are structural (no pixel comparisons) and remain green across all supported OS rendering configurations. If a new control grows unexpectedly wide, the test will catch the overflow before it becomes a Chunk 5 regression.

---

## Screenshot Testing (Structured Editor Visual Spec)

[`apps/desktop/tests/spell_editor_visual.spec.ts`](apps/desktop/tests/spell_editor_visual.spec.ts) provides `toHaveScreenshot()` coverage for the structured editor surfaces introduced in Chunk 4. Playwright groups: **`StructuredFieldInput visual stories`** (Storybook, `browserTest`) and **`Spell editor visual contract`** (Tauri CDP, `appTest`, Windows-only). This section documents the spec's structure and the important distinction between screenshot-isolation theme toggling and real-theme-flow verification.

### When to use direct `<html>` class toggling versus real theme switching

| Use case | Approach |
|----------|----------|
| Screenshot isolation (pixel-stable baselines) | Toggle `dark` class directly on `<html>` via `page.evaluate()` |
| Theme-flow integration test (settings roundtrip) | Use the real settings flow / existing helper in `theme_and_feedback.spec.ts` |

Direct class toggling gives identical rendering on every run regardless of OS theme or user preference state. This makes screenshot diffs stable and reproducible. Never use it to replace the real-theme-flow check — that check verifies the settings storage and persistence contract, not just the CSS.

### `setHtmlTheme` helper

`spell_editor_visual.spec.ts` exposes a local helper:

```typescript
import type { Page } from "@playwright/test";
import { expect as appExpect } from "./fixtures/test-fixtures";

async function setHtmlTheme(page: Page, theme: "light" | "dark"): Promise<void> {
  await page.evaluate((nextTheme) => {
    const root = document.documentElement;
    root.dataset.theme = nextTheme;
    root.classList.toggle("dark", nextTheme === "dark");
  }, theme);
  await appExpect(page.locator("html")).toHaveAttribute("data-theme", theme);
}
```

Use this helper inside visual specs only. Do not copy it into functional E2E specs; those should use the real theme helper from `theme_and_feedback.spec.ts`.

### What is screenshot-tested

All shots live in `apps/desktop/tests/spell_editor_visual.spec.ts-snapshots/`. On Windows, Playwright writes `*-win32.png` (default platform suffix). The folder is tracked in git (see root `.gitignore` exception); other `*.ts-snapshots/` trees stay ignored.

| Playwright test title | Snapshot base name (on-disk: `<base>-win32.png` on Windows) | How it runs |
|----------------------|-------------------|-------------|
| StructuredFieldInput states match light-theme screenshot | `structured-field-input-states-light` | Chromium → local Storybook |
| StructuredFieldInput states match dark-theme screenshot | `structured-field-input-states-dark` | Chromium → local Storybook |
| Empty library matches light-theme screenshot | `empty-library-light` | Tauri CDP (Windows only; suite skips elsewhere) |
| Empty library matches dark-theme screenshot | `empty-library-dark` | Tauri CDP (Windows only) |
| Spell editor structured view matches light-theme screenshot | `spell-editor-structured-light` | Tauri CDP, `__SPELLBOOK_E2E_VISUAL_CONTRACT__ = "all-structured"` |
| Spell editor structured view matches dark-theme screenshot | `spell-editor-structured-dark` | Tauri CDP, same contract flag |
| Collapsed hash display matches screenshot | `hash-display-collapsed` | Tauri CDP (light theme in spec) |
| Expanded hash display matches screenshot | `hash-display-expanded` | Tauri CDP (light theme in spec) |

CI does not run Playwright today; refresh baselines on a Windows machine after intentional UI changes. The committed files are **`-win32.png`**. Running the **Storybook** tests locally on macOS or Linux will expect **`-darwin.png` / `-linux.png`** unless you add those files or adjust `snapshotPathTemplate`—same consideration for a future non-Windows CI job.

Update committed baselines when intentional visual changes are made:

```powershell
cd apps/desktop
npx playwright test tests/spell_editor_visual.spec.ts --update-snapshots
```

### Shared test fixtures

`spell_editor_visual.spec.ts` mixes two harnesses:
- **Storybook rows** (`StructuredFieldInput visual stories`): `browserTest` / `browserExpect` from `@playwright/test`, plus `TIMEOUTS` from `./fixtures/constants` for Storybook boot and visibility waits (no Tauri lifecycle, no `SpellbookApp`).
- **Tauri rows** (`Spell editor visual contract`): `appTest` / `appExpect` from `./fixtures/test-fixtures`, `SpellbookApp` from `./page-objects/SpellbookApp`, and `TIMEOUTS` from `./fixtures/constants`.

The spec calls a `seedVisualSpell` helper that creates a canonical test spell via `SpellbookApp.createSpell()` before opening the editor. Prefer reusing this helper over duplicating spell-creation logic in new screenshot tests.

### Before running screenshot tests

Always rebuild the debug binary before running Playwright screenshot tests (Tauri-backed rows load the compiled app). From the **repository root**:

```powershell
pnpm --dir apps/desktop tauri:build --debug
cd apps/desktop
npx playwright test tests/spell_editor_visual.spec.ts
```

If you are **already** in `apps/desktop`, run `pnpm tauri:build --debug` instead of `pnpm --dir apps/desktop …`. A stale binary will produce stale screenshots and false-negative diffs.

---

## Python Testing (ML Services)

### Setup

Always use the virtual environment from the **repository root**:

```bash
# Windows
.\venv\Scripts\activate

# Or use the ml service's own venv
cd services/ml
.\venv\Scripts\activate
```

### Running Tests

```bash
# From repository root with activated venv
python -m pytest services/ml

# With verbose output
python -m pytest services/ml -v

# Run specific test file
python -m pytest services/ml/tests/test_parsers.py

# Run specific test
python -m pytest services/ml/tests/test_parsers.py::test_parse_spell -v

# With coverage
python -m pytest services/ml --cov=services/ml
```

### Test Structure

```
services/ml/
├── src/
│   ├── embeddings.py
│   └── inference.py
└── tests/
    ├── conftest.py          # Shared fixtures
    ├── test_embeddings.py
    └── test_inference.py
```

### Fixture Pattern

```python
# tests/conftest.py
import pytest

@pytest.fixture
def sample_spell():
    return {
        "name": "Fireball",
        "level": 3,
        "school": "Evocation",
        "description": "A ball of fire..."
    }

# tests/test_embeddings.py
def test_embed_spell(sample_spell):
    embedding = embed_spell(sample_spell)
    assert len(embedding) == 768  # Expected dimension
```

---

## End-to-End Testing (Playwright)

### Setup

```bash
cd apps/desktop

# Install Playwright browsers (first time)
npx playwright install

# Run E2E tests
pnpm e2e

# Run in headed mode (see the browser)
pnpm e2e -- --headed

# Run specific test file
pnpm e2e -- tests/search.spec.ts
```

**Test ID convention:** All `data-testid` values in the application use **kebab-case** (e.g. `detail-range-input`, `detail-range-expand`, `save-button`, `spell-name-input`). Use kebab-case when adding new test IDs so E2E and Storybook locators stay consistent. See `apps/desktop/src/AGENTS.md` (Naming Conventions for `data-testid`) and [Spell Editor Components Guide](dev/spell_editor_components.md#e2e-and-test-ids) for the full list.

**Spell Editor and Chunk 6 E2E specs:** `spell_editor_structured_data.spec.ts` covers structured field editing (after expanding a detail field), validation, and hash display. `spell_editor_canon_first.spec.ts` covers canon-first behaviour: default view (single-line inputs + expand controls), edit-in-canon and save, expand-edit-collapse serialization, view-only collapse (canon line unchanged), new spell with expand/parse, and unsaved-changes warning on Cancel. `spell_editor_save_workflow.spec.ts` covers the full save/validation/modal-boundary workflow: inline validation errors, first-failed-submit focus, blur/change validation, tradition-conditional field rendering, save-progress labeling (`Save Spell` vs `Saving…`), success toast routing (`Spell saved.`), and modal-versus-toast boundaries. `theme_and_feedback.spec.ts` covers theme persistence, the hidden theme announcement live region (`theme-announcement-live-region`), and the hash-copy notification/live-region path. `accessibility_and_resize.spec.ts` covers keyboard navigation on Settings, ARIA validation wiring on the spell editor, preserved native `showModal()` modality, and related resize checks. `spell_editor_visual.spec.ts` holds `toHaveScreenshot()` baselines for structured surfaces, full editor light/dark, empty library, and hash collapsed/expanded states (snapshots under `tests/spell_editor_visual.spec.ts-snapshots/`). All of these use the shared fixtures (`test-fixtures`, `SpellbookApp`, `TIMEOUTS`) and kebab-case `data-testid` locators. Canon-first Details are also covered by Storybook under "SpellEditor/CanonFirstDetails" ([SpellEditorCanonFirst.stories.tsx](../apps/desktop/src/ui/components/structured/SpellEditorCanonFirst.stories.tsx)).

The current Playwright files to check first for this chunk are:

- `tests/spell_editor_save_workflow.spec.ts`
- `tests/theme_and_feedback.spec.ts`
- `tests/accessibility_and_resize.spec.ts`
- `tests/spell_editor_structured_data.spec.ts`
- `tests/spell_editor_visual.spec.ts`

**Build before Playwright:** Always run `pnpm --dir apps/desktop tauri:build --debug` before executing any Playwright suite. The Playwright fixture starts the Tauri debug binary; stale or absent binaries will silently fail or produce outdated behaviour. This requirement applies in CI and on a clean local workspace.

### Test Structure

```typescript
// tests/search.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Spell Search', () => {
  test('finds spell by name', async ({ page }) => {
    await page.goto('/');

    await page.fill('[data-testid="search-input"]', 'Fireball');
    await page.click('[data-testid="search-button"]');

    await expect(page.locator('[data-testid="spell-result"]')).toContainText('Fireball');
  });
});
```

### Page Object Pattern

For complex E2E tests, use page objects:

```typescript
// tests/pages/SpellListPage.ts
export class SpellListPage {
  constructor(private page: Page) {}

  async search(query: string) {
    await this.page.fill('[data-testid="search-input"]', query);
    await this.page.click('[data-testid="search-button"]');
  }

  async getResultCount(): Promise<number> {
    const results = await this.page.locator('[data-testid="spell-result"]').all();
    return results.length;
  }
}

// tests/search.spec.ts
test('search returns results', async ({ page }) => {
  const spellList = new SpellListPage(page);
  await page.goto('/');

  await spellList.search('Fire');
  const count = await spellList.getResultCount();

  expect(count).toBeGreaterThan(0);
});
```

---

## Testing Best Practices

### 1. Test Naming

Use descriptive names that explain what is being tested:

```rust
// ✅ Good
fn test_parse_duration_returns_special_for_unknown_patterns() { }
fn test_issue_42_divine_focus_with_space_not_parsed() { }

// ❌ Bad
fn test_duration() { }
fn test_fix() { }
```

### 2. AAA Pattern

Structure tests using **Arrange-Act-Assert**:

```rust
#[test]
fn test_parse_range_with_per_level() {
    // Arrange
    let parser = RangeParser::new();
    let input = "10 + 5/level yards";

    // Act
    let result = parser.parse(input);

    // Assert
    assert_eq!(result.distance.as_ref().unwrap().per_level, Some(5.0));
}
```

### 3. Edge Cases

Always test:

- Empty/null inputs
- Boundary values
- Malformed data
- Unicode and special characters
- Very long strings

```rust
#[test]
fn test_parse_duration_empty_string() {
    let parser = DurationParser::new();
    let result = parser.parse("");
    assert_eq!(result.kind, DurationKind::Special);
}
```

### 4. Regression Tests

When fixing bugs, create a regression test first:

```rust
/// Regression test for Issue #42
/// Previously, "Divine Focus" with a space was not recognized
#[test]
fn test_regression_divine_focus_space_parsing() {
    let parser = ComponentsParser::new();
    let result = parser.parse_components("V, S, Divine Focus");
    assert!(result.divine_focus, "Divine Focus with space should be recognized");
}
```

### 5. Snapshot Testing

For complex output verification, consider snapshot tests:

```rust
// Compare entire serialized output against known good values
#[test]
fn test_canonical_spell_serialization() {
    let spell = create_test_spell();
    let json = serde_json::to_string_pretty(&spell).unwrap();

    // Store in a .snap file and compare
    insta::assert_snapshot!(json);
}
```

---

## Coverage Expectations

| Component | Target Coverage | Critical Paths |
|-----------|-----------------|----------------|
| Parsers | 90%+ | All `parse()` methods |
| Models | 80%+ | Serialization, normalization |
| Migration | 100% | Column mapping, backfill |
| UI Components | 70%+ | User-facing interactions |
| ML Services | 80%+ | Embedding, inference |

### Running Coverage

```bash
# Rust coverage (requires cargo-tarpaulin)
cargo tarpaulin --lib --out Html

# TypeScript coverage
pnpm vitest run --project=unit --coverage

# Python coverage
python -m pytest services/ml --cov --cov-report=html
```

---

## Continuous Integration

Tests are automatically run on:

- Pull request creation/update
- Merge to `main` branch
- Nightly scheduled builds

### CI Configuration

See `.github/workflows/test.yml` for CI pipeline configuration.

### Pre-commit Checklist

Before committing, ensure:

1. ✅ `cargo test --lib` passes
2. ✅ `cargo clippy -- -D warnings` has no errors
3. ✅ `cargo fmt` shows no changes needed
4. ✅ `pnpm test:unit` and `pnpm test:storybook` pass (if frontend changes)
5. ✅ `python -m pytest services/ml` passes (if Python changes)

---

## Troubleshooting Tests

### PDB Linker Error (Windows)

If you see PDB-related errors during testing:

```
error: could not compile `spellbook-desktop` due to previous error
LINK : fatal error LNK1201: error writing to program database
```

**Solution**:
```bash
cargo clean -p spellbook-desktop
cargo test --lib
```

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for more details.

### Flaky Tests

If a test passes/fails intermittently:

1. Check for timing dependencies (`sleep`, `timeout`)
2. Look for shared state between tests
3. Verify database cleanup between runs
4. Check for external service dependencies

### Slow Tests

If tests are taking too long:

```bash
# Identify slow tests
cargo test -- --report-time

# Run only fast unit tests
cargo test --lib -- --skip integration
```

---

## Related Documentation

- [DEVELOPMENT.md](./DEVELOPMENT.md) - Development setup and workflows
- [PARSER_COVERAGE.md](./PARSER_COVERAGE.md) - Parser pattern documentation
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Common issues and solutions

---

## Accessibility Testing (Manual — NVDA + Chromium)

The spell editor inline validation surfaces require a manual screen-reader check that cannot be automated as part of the test suite. The procedure below must be run by a human when the validation or ARIA wiring changes.

### Setup

- **Browser:** Chromium (the same engine used by the Tauri WebView2 runtime; ensure WebView2 is also tested if platform-specific quirks are suspected)
- **Screen reader:** NVDA (Windows). Record the NVDA version during the run.
- **Build:** Generate the debug binary with `pnpm --dir apps/desktop tauri:build --debug`.
- **Launch:** Start the app with `pnpm tauri:dev`.

### Acceptance paths

Run each path with NVDA active and Chromium focused on the spell editor:

1. **Text-input blur validation** — focus the Name field, leave it empty, tab away. Confirm NVDA announces the field label *and* the error text *Name is required.* (including the trailing period, matching `spellEditorValidation.ts` and `spell-name-error` in the DOM).
2. **Select-change / dependent-field revalidation** — set Tradition to **Arcane**, then change to **Divine** (or vice versa). Confirm NVDA announces the newly visible Sphere (or School) field and its required-field error when triggered.
3. **Structured-scalar validation** — if a blur-reachable invalid state exists for a `ScalarInput` or `AreaForm` field, exercise it. If clamp-on-change semantics prevent the UI from reaching an invalid state at runtime, verify ARIA wiring through the jsdom unit tests instead and document that limitation here.
4. **First failed submit focus** — click **Save Spell** with an invalid form. Confirm focus moves to the first invalid field and NVDA announces its label together with the associated error text.
5. **Error correction** — fix the invalid field. Confirm NVDA no longer announces the stale error text because `aria-invalid` and `aria-describedby` are removed or updated.

### Evidence record

When the run is performed, append a block to this section with:

| Field | Value |
|-------|-------|
| Date | |
| Browser | Chromium (version) |
| NVDA version | |
| Path 1 — announced label | |
| Path 1 — announced error text | |
| Path 2 — announced label | |
| Path 2 — announced error text | |
| Path 3 — announced label or n/a | |
| Path 3 — announced error text or n/a | |
| Path 4 — announced label after focus | |
| Path 4 — announced error text after focus | |
| Path 5 — confirmation error cleared | |
| Notes | |

**Status (2026-03-20):** Pending human execution. The automated agent environment cannot drive NVDA or capture spoken announcements. The checklist and evidence table above must be completed manually before this gate is considered closed.

**Last Updated**: 2026-04-03
