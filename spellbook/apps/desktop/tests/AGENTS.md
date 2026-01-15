# E2E Test Development Guide

Instructions for developing, running, and maintaining Playwright E2E tests for the Spellbook desktop application.

## Directory Structure

```
tests/
├── fixtures/           # Test infrastructure
│   ├── constants.ts    # Timeout values, configuration
│   └── tauri-fixture.ts # App launch/teardown utilities
├── page-objects/       # Page Object Model classes
│   └── SpellbookApp.ts # Common UI interactions
├── utils/              # Helper utilities
│   ├── test-data.ts    # Test file generation
│   └── dialog-handler.ts # Dialog handling
├── screenshots/        # Test screenshots output
└── *.spec.ts           # Test files
```

## Running Tests

### Windows (requires WebView2)

```powershell
cd spellbook/apps/desktop
npx playwright test
```

### Linux (currently unsupported)

> [!WARNING]
> Tauri CDP tests require WebView2, which is Windows-only. Tests will skip on Linux.

```bash
cd spellbook/apps/desktop
npx playwright test
# Tests will skip with: "Tauri CDP tests require WebView2 on Windows."
```

## Linting Tests

### Windows

```powershell
cd spellbook/apps/desktop
npx biome lint tests/fixtures tests/page-objects tests/utils
npx biome lint tests/e2e.spec.ts tests/batch_import.spec.ts tests/epic_and_quest_spells.spec.ts tests/epic_and_quest_spells_connected.spec.ts tests/milestone_2_5.spec.ts tests/milestone_3.spec.ts
```

### Linux/macOS

```bash
cd spellbook/apps/desktop
npx biome lint tests/fixtures tests/page-objects tests/utils tests/*.spec.ts
```

## Developing New Tests

### 1. Use Shared Fixtures

Always use the shared infrastructure instead of duplicating setup code:

```typescript
import { TIMEOUTS } from "./fixtures/constants";
import { type TauriAppContext, cleanupTauriApp, launchTauriApp } from "./fixtures/tauri-fixture";
import { SpellbookApp } from "./page-objects/SpellbookApp";

let appContext: TauriAppContext | null = null;

test.beforeAll(async () => {
  appContext = await launchTauriApp();
});

test.afterAll(() => {
  cleanupTauriApp(appContext);
});
```

### 2. Use Page Object Methods

Prefer `SpellbookApp` methods over raw locators:

```typescript
// Good
const app = new SpellbookApp(page);
await app.createSpell({ name: "Test Spell", level: "3", description: "Description" });
await app.navigate("Library");
await app.waitForLibrary();

// Avoid
await page.getByRole("link", { name: "Add Spell" }).click();
await page.getByPlaceholder("Spell Name").fill("Test Spell");
// ... repeated boilerplate
```

### 3. Use Standard Timeouts

Import from `fixtures/constants.ts`:

```typescript
import { TIMEOUTS } from "./fixtures/constants";

await expect(element).toBeVisible({ timeout: TIMEOUTS.medium });
```

| Constant | Value | Use Case |
|----------|-------|----------|
| `TIMEOUTS.short` | 5000ms | Quick UI updates |
| `TIMEOUTS.medium` | 15000ms | Form submissions, navigation |
| `TIMEOUTS.long` | 30000ms | App startup, complex operations |
| `TIMEOUTS.batch` | 60000ms | Batch imports, file processing |

### 4. Generate Unique Test Data

Use timestamps to avoid collisions:

```typescript
const runId = Date.now();
const spellName = `Test Spell ${runId}`;
const characterName = `Test Character ${runId}`;
```

### 5. Use Dialog Handlers

For tests that trigger dialogs:

```typescript
import { setupDialogHandler } from "./utils/dialog-handler";

const cleanup = setupDialogHandler(page, {
  acceptDelete: true,
  dismissValidation: true,
});

// ... test code ...

cleanup(); // Remove handler at end
```

### 6. Locator Strategy

Prefer user-facing locators in this order:
1. `page.getByRole()` - Most accessible
2. `page.getByLabel()` - Form fields
3. `page.getByPlaceholder()` - Inputs
4. `page.getByText()` - Static content
5. `page.locator()` with CSS - Last resort

### 7. Test Organization

Use `test.step()` for logical phases:

```typescript
test("Feature Test", async () => {
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

## Adding to SpellbookApp Page Object

When adding new common interactions, extend `page-objects/SpellbookApp.ts`:

```typescript
export class SpellbookApp {
  // Add new methods here
  async yourNewMethod(): Promise<void> {
    // implementation
  }
}
```

## File Cleanup

Use the file tracker for temporary test files:

```typescript
import { createFileTracker } from "./fixtures/tauri-fixture";

const fileTracker = createFileTracker();

test.afterAll(() => {
  fileTracker.cleanup();
});

test("test", async () => {
  const testFile = fileTracker.track(path.resolve(__dirname, "temp.md"));
  fs.writeFileSync(testFile, content);
  // File will be cleaned up automatically
});
```
