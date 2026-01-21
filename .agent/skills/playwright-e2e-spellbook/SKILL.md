---
name: playwright-e2e-spellbook
description: Playwright E2E testing for the Spellbook Tauri desktop application with shared fixtures, page objects, and test utilities. Use when writing or modifying E2E tests for the Spellbook app, debugging test failures, or setting up new test infrastructure. Includes automatic app lifecycle management, file tracking, and common test patterns.
---

# Playwright E2E Testing for Spellbook

Specialized guidance for writing E2E tests for the Spellbook Tauri desktop application using Playwright with custom fixtures and utilities.

## Migrating Existing Tests

**Updating old tests to use modern infrastructure?** See [references/MIGRATION.md](references/MIGRATION.md) for:
- Step-by-step migration checklist
- Quick wins (low effort, high value changes)
- Complete before/after examples
- PR review checklist
- Common migration pitfalls

## Quick Start Template

```typescript
import { expect, test } from "./fixtures/test-fixtures";
import { TIMEOUTS } from "./fixtures/constants";
import { createTmpFilePath, generateRunId, getTestDirname } from "./fixtures/test-utils";
import { SpellbookApp } from "./page-objects/SpellbookApp";

const __dirname = getTestDirname(import.meta.url);

test.describe("My Feature", () => {
  test("my test case", async ({ appContext, fileTracker }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    // Your test code here
  });
});
```

## Core Infrastructure

### Playwright Fixtures (Automatic Lifecycle)

Import custom fixtures instead of base Playwright test:

```typescript
import { expect, test } from "./fixtures/test-fixtures";
```

**Available fixtures:**
- `appContext`: Tauri app with browser, page, and process handles (auto cleanup)
- `fileTracker`: File tracker for temporary files (auto cleanup)

**Benefits:**
- No manual `beforeAll`/`afterAll` hooks
- Automatic cleanup even on test failure
- Type-safe fixture access

### Test Utilities

```typescript
import { createTmpFilePath, generateRunId, getTestDirname } from "./fixtures/test-utils";

// Get __dirname
const __dirname = getTestDirname(import.meta.url);

// Generate unique IDs
const runId = generateRunId();
const name = `Test Item ${runId}`;

// Create temp files with auto-tracking
const filePath = createTmpFilePath(__dirname, "backup.zip", fileTracker);
```

### Standard Timeouts

```typescript
import { TIMEOUTS } from "./fixtures/constants";

await expect(element).toBeVisible({ timeout: TIMEOUTS.medium });
```

| Constant | Value | Use Case |
|----------|-------|----------|
| `TIMEOUTS.short` | 5000ms | Quick UI updates |
| `TIMEOUTS.medium` | 15000ms | Form submissions, navigation |
| `TIMEOUTS.long` | 30000ms | App startup, complex operations |
| `TIMEOUTS.batch` | 120000ms | Batch imports, file processing |

## SpellbookApp Page Object

Always use the page object for common interactions:

```typescript
const app = new SpellbookApp(page);

// Navigation
await app.navigate("Library" | "Characters" | "Import" | "Add Spell");

// Spell management
await app.createSpell({ name, level, description, ... });
await app.openSpell(name);
await app.importFile(path, allowOverwrite?);

// Character management
await app.createCharacter(name);
await app.selectCharacter(name);
await app.openCharacterEditor(name);
await app.addClass(className);
await app.addSpellToClass(className, spellName, "KNOWN" | "PREPARED");
```

## Dialog Handling

### Custom Modals (React-based)

```typescript
import { handleCustomModal } from "./utils/dialog-handler";

await page.getByRole("button", { name: "Save" }).click();
await handleCustomModal(page, "OK");

await page.getByRole("button", { name: "Delete" }).click();
await handleCustomModal(page, "Confirm");
```

### Native Browser Dialogs

```typescript
import { setupDialogHandler } from "./utils/dialog-handler";

const cleanup = setupDialogHandler(page, {
  acceptDelete: true,
  dismissValidation: true,
  debug: true,
});

// Trigger action that shows dialog
await page.getByRole("button", { name: "Reset" }).click();

cleanup(); // CRITICAL: Stop listening after action
```

## Test Organization

Use `test.step()` for logical phases:

```typescript
test("Feature Test", async ({ appContext }) => {
  await test.step("Setup: Create test data", async () => {
    // setup
  });

  await test.step("Action: Perform operation", async () => {
    // main test action
  });

  await test.step("Verify: Check results", async () => {
    // assertions
  });
});
```

## Locator Strategy

Prefer user-facing locators in this order:

1. `page.getByRole()` - Most accessible
2. `page.getByLabel()` - Form fields
3. `page.getByPlaceholder()` - Inputs
4. `page.getByText()` - Static content
5. `page.locator()` with CSS - Last resort

## Common Patterns

### Creating Unique Test Data

```typescript
const runId = generateRunId();
const spellName = `Test Spell ${runId}`;
const tmpFile = createTmpFilePath(__dirname, "data.json", fileTracker);
```

### Working with Temporary Files

```typescript
test("backup flow", async ({ fileTracker }) => {
  const backupPath = createTmpFilePath(__dirname, "backup.zip", fileTracker);

  // Use the file
  fs.writeFileSync(backupPath, data);

  // Cleanup is automatic!
});
```

### Settlement Waits

After navigation or complex UI switches:

```typescript
await app.navigate("Library");
await page.waitForTimeout(500); // Standard settlement wait
```

## Running Tests

```powershell
# Run all tests
npx playwright test

# Run specific test file
npx playwright test vault.spec.ts

# Run with UI mode
npx playwright test --ui

# Show HTML report
npx playwright show-report
```

## Troubleshooting

### Port Collisions

Tests use isolated ports per worker. If "Address already in use" errors occur:

1. Ensure no other app instances are running
2. Check for orphaned processes: `Get-Process | Where-Object {$_.ProcessName -match "spellbook"} | Stop-Process`

### WebView2 State Pollution

Tests use isolated data directories. If state leaks between runs:

- Check `tests/tmp/data-w*` directories
- Cleanup happens automatically but may fail if processes don't terminate cleanly

### Blank Screen on Launch

Debug builds expect Vite dev server at `http://127.0.0.1:5173`. The test infrastructure handles this automatically.

## Advanced: Manual Lifecycle

For test suites sharing app state across multiple tests:

```typescript
import { type TauriAppContext, cleanupTauriApp, createFileTracker, launchTauriApp } from "./fixtures/tauri-fixture";

let appContext: TauriAppContext | null = null;
const fileTracker = createFileTracker();

test.beforeAll(async () => {
  appContext = await launchTauriApp();
});

test.afterAll(async () => {
  if (appContext) {
    await cleanupTauriApp(appContext);
  }
  fileTracker.cleanup();
});

test("my test", async () => {
  if (!appContext) throw new Error("App context not initialized");
  const { page } = appContext;
  // test code
});
```

**Use manual lifecycle when:**
- Sharing app state across multiple tests
- Running large test suites (minimize app launches)
- Need fine-grained control over lifecycle

## Key Constraints

- **Windows only**: Tests require WebView2 (Windows-only)
- **Workers**: Configured for `workers: 1` to avoid port collisions
- **Timeout**: Default test timeout is 120000ms (2 minutes)
- **Data isolation**: Each test run uses unique data directory
