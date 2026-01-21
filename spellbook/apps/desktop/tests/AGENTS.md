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
### 0. Data and Port Isolation
The `launchTauriApp()` helper in `tauri-fixture.ts` handles isolation automatically:
- **Port Isolation**: Each worker uses a unique Vite and CDP port (calculated as `BASE_PORT + workerIndex`).
- **Concurrency Limit**: The suite is recommended to run with `workers: 1` on Windows to ensure maximum reliability and avoid port-binding race conditions.
- **Port Isolation**: Each worker uses a unique Vite and CDP port (calculated as `BASE_PORT + workerIndex`). Standardizing on `127.0.0.1` for loopback addresses avoids IPv6 resolution issues.
- **Data Isolation**: Each test run creates a unique `SPELLBOOK_DATA_DIR` to avoid database locks and state pollution.
- **Network Ports**: Each worker uses unique ports for Vite and CDP (starting from 5173 and 9333 + workerIndex) to avoid collisions during parallel execution.
- **sqlite-vec**: The fixture automatically ensures `vec0.dll` (or equivalent) is present in the test environment and copied to the isolated data directory.

```typescript
// Handled automatically by launchTauriApp()
```

### 1. Use Shared Fixtures
Always use the shared infrastructure with explicit typing:

```typescript
import { TIMEOUTS } from "./fixtures/constants";
import { type TauriAppContext, cleanupTauriApp, launchTauriApp } from "./fixtures/tauri-fixture";
import { SpellbookApp } from "./page-objects/SpellbookApp";

// Use explicit typing instead of 'any'
let appContext: TauriAppContext | null = null;

test.beforeAll(async () => {
  appContext = await launchTauriApp();
});

test.afterAll(() => {
  cleanupTauriApp(appContext);
});
```

### 2. Use SpellbookApp Page Object
The `SpellbookApp` class in `tests/page-objects/SpellbookApp.ts` is the central hub for common UI interactions. **Always** prefer its methods over raw Playwright locators.

#### Initialization
```typescript
import { SpellbookApp } from "./page-objects/SpellbookApp";

const app = new SpellbookApp(page);
```

#### Core Navigation
- `await app.navigate("Library" | "Characters" | "Import" | "Add Spell")`: Safe navigation that waits for React state to settle.

#### Library & Spell Management
- `await app.createSpell({ name, level, ... })`: Full workflow to add a spell and return to Library.
- `await app.openSpell(name)`: Search for and open the editor for a specific spell.
- `await app.importFile(path, allowOverwrite?)`: Complete multi-step Import Wizard handling.
- `app.getSpellRow(name)`: Returns a locator for a specific spell's row in the library table.

#### Character Management
- `await app.createCharacter(name)`: Rapidly create a character via the sidebar.
- `await app.selectCharacter(name)`: Click a character in the sidebar.
- `await app.openCharacterEditor(name)`: Navigate to and wait for a character's full editor to load.
- `await app.addClass(className)`: Add a class (handles the "Other" custom prompt automatically).
- `await app.addSpellToClass(className, spellName, "KNOWN" | "PREPARED")`: Complex interaction with the Spell Picker modal.

#### Using Shared Selectors
If a method doesn't exist, use the exported `SELECTORS` for consistency:
```typescript
import { SELECTORS } from "./page-objects/SpellbookApp";

await page.locator(SELECTORS.spellName).fill("New Name");
```

#### Example: Full Character Setup
```typescript
const app = new SpellbookApp(page);
await app.createCharacter("Elminster");
await app.openCharacterEditor("Elminster");
await app.addClass("Mage");
await app.addSpellToClass("Mage", "Fireball", "KNOWN");
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

### 5. Dialog and Modal Handlers
The application uses two types of dialogs. You must use the correct handler depending on the interaction.

#### 5.1 Native Browser Dialogs
These are triggered by `window.alert`, `window.confirm`, or `window.prompt`. Use `setupDialogHandler` or its simplified variants.

```typescript
import { setupDialogHandler, setupAcceptAllDialogs } from "./utils/dialog-handler";

// Complex handler with options
const cleanup = setupDialogHandler(page, {
  acceptDelete: true,      // Automatically type "OK" for delete
  dismissValidation: true, // Dismiss error popups
  debug: true,             // Log dialog text to console
});

// Implementation of test triggering dialogs...
await page.getByRole("button", { name: "Reset Database" }).click();

cleanup(); // CRITICAL: Stop listening after the action
```

- `setupAcceptAllDialogs(page)`: Always clicks "OK".
- `setupDismissAllDialogs(page)`: Always clicks "Cancel" or "Esc".

#### 5.2 Custom glassmorphism Modals
These are React-based components (using `Modal.tsx`) and **cannot** be intercepted by `setupDialogHandler`. Use the `handleCustomModal` async helper.

```typescript
import { handleCustomModal } from "../utils/dialog-handler";

// Example: Handling a validation error after saving
await page.locator("#btn-save-spell").click();
await handleCustomModal(page, "OK");

// Example: Confirming a complex action
await page.getByRole("button", { name: "Restore Vault" }).click();
await handleCustomModal(page, "Confirm");
```

- `handleCustomModal(page, action)`: Waits for the modal to appear, clicks the button matching the label (default "OK"), and waits for the exit animation to finish.

> [!IMPORTANT]
> If a test hangs, check if a modal is visible in the trace. Native handlers are non-blocking event listeners, while `handleCustomModal` is an `await`-ed interaction.

### 6. Locator Strategy

Prefer user-facing locators in this order:
1. `page.getByRole()` - Most accessible
2. `page.getByLabel()` - Form fields (e.g., `Tags`, `Description`)
3. `page.getByPlaceholder()` - Inputs (e.g., `Components (V,S,M)`)
4. `page.getByText()` - Static content
5. `page.locator()` with CSS - Last resort

### 6.1 Settlement Waits
After navigation or complex UI switches (like opening the Spell Editor), use a short settlement wait (e.g., 500ms) to ensure React state has settled before interaction:

```typescript
await app.navigate("Library");
await page.waitForTimeout(500); // Standard settlement wait
```

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

### 8. Troubleshooting & Resource Cleanup
The test infrastructure uses `taskkill /T /F` on Windows to ensure that Vite and all its descendants (like `esbuild` and `node` runtimes) are properly terminated. If you see orphaned processes, ensure you are calling `cleanupTauriApp(appContext)` in your `afterAll` hook.

If `sqlite-vec` extension errors occur:
- The setup will attempt to download `vec0` automatically to `tests/tmp/bin`.
- Ensure your machine has internet access or pre-place the binary in that folder.
- The app will fallback to blob-backed tables if the extension cannot be loaded.

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
## Common Gotchas & Troubleshooting

### Blank Screen on Launch
If you launch the `.exe` directly from the `src-tauri/target/debug` folder, you will likely see a blank screen.
- **Reason**: Debug builds expect a running Vite dev server at `http://127.0.0.1:5173`.
- **Solution**: Always use `npm run tauri dev` (or `pnpm tauri:dev`) for development.
- **Production**: For a standalone binary, use `npm run tauri build` (or `pnpm tauri:build`).
- **Debug**: To generate the debug binary, use `npm run tauri build --debug` (or `pnpm tauri:build --debug`) to generate a debug binary in `src-tauri/target/debug`.

### Port Collisions
If tests fail with "Address already in use":
1. Ensure no other instances of the app or Vite are running.
2. The `tauri-fixture.ts` attempts to kill processes on Ports 5173 and 9000-9100.
3. If ghost processes persist, run `Get-Process | Where-Object {$_.ProcessName -match "desktop"} | Stop-Process` in PowerShell.

### WebView2 State Pollution
Tests now use isolated `WEBVIEW2_USER_DATA_FOLDER` paths. If you see state leaking between runs:
- Check `tests/tmp/data-w*` and clear them manually if the automatic cleanup fails.
- Ensure `launchTauriApp()` is being called with its default parameters.
