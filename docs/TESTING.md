# Testing Guide

This document provides comprehensive guidelines for testing the Second Edition Spellbook application across all components: Backend (Rust/Tauri), Frontend (React/TypeScript), and Services (Python/ML).

---

## Quick Reference

| Component | Location | Command | Framework |
|-----------|----------|---------|-----------|
| Backend | `apps/desktop/src-tauri` | `cargo test` | Rust built-in |
| Frontend | `apps/desktop` | `pnpm test` | Vitest |
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

## Frontend Testing (React/TypeScript)

### Running Tests

```bash
cd apps/desktop

# Run all tests
pnpm test

# Run in watch mode (development)
pnpm test:watch

# Run with coverage
pnpm test:coverage

# Run tests matching a pattern
pnpm test -- --grep "SpellCard"
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
- **Accessibility checks**: Automatic a11y validation via `@storybook/addon-a11y`
- **Interactive documentation**: Living examples of component usage
- **Isolated development**: Test components without full app context

**Running Storybook:**

```bash
cd apps/desktop
pnpm storybook
```

Stories are located in `src/ui/components/structured/*.stories.tsx`:

- **StructuredFieldInput**: 18 stories (range, duration, casting_time variations)
- **AreaForm**: 18 stories (all area kinds)
- **DamageForm**: 7 stories (none, modeled, dm_adjudicated)
- **SavingThrowInput**: 6 stories (none, single, multiple, dm_adjudicated)
- **MagicResistanceInput**: 7 stories (all MR kinds)
- **ComponentCheckboxes**: 8 stories (V/S/M combinations with materials)

**Accessibility Testing:**

The `@storybook/addon-a11y` addon automatically checks all stories for accessibility violations:
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

For detailed Storybook documentation, see [Spell Editor Components Guide](../dev/spell_editor_components.md#storybook-stories). Canon-first Details block stories live under **SpellEditor/CanonFirstDetails** (e.g. Default Collapsed, One Field Expanded, Collapsed With Special Indicator); they use the same `detail-*-input` and `detail-*-expand` test IDs as the app.

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

**Spell Editor E2E specs:** `spell_editor_structured_data.spec.ts` covers structured field editing (after expanding a detail field), validation, and hash display. `spell_editor_canon_first.spec.ts` covers canon-first behaviour: default view (single-line inputs + expand controls), edit-in-canon and save, expand–edit–collapse serialization, view-only collapse (canon line unchanged), new spell with expand/parse, and unsaved-changes warning on Cancel. Both use the same fixtures (`test-fixtures`, `SpellbookApp`, `TIMEOUTS`) and target canon inputs/expand controls via `data-testid` (e.g. `detail-range-input`, `detail-range-expand`). Canon-first Details are also covered by Storybook under "SpellEditor/CanonFirstDetails" ([SpellEditorCanonFirst.stories.tsx](apps/desktop/src/ui/components/structured/SpellEditorCanonFirst.stories.tsx)).

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
pnpm test:coverage

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
4. ✅ `pnpm test` passes (if frontend changes)
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

**Last Updated**: 2026-02-05
