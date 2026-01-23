---
description: How to rebuild the application and run Playwright E2E tests
---

# Rebuild and Test Workflow

Use this workflow when modifying the Spellbook application and running Playwright E2E tests.

## 1. Determine What Changed

First, identify what parts of the application were modified:
- **Backend (Rust)**: Changes to `spellbook/apps/desktop/src-tauri/src/` or `Cargo.toml`
- **Frontend (TypeScript/React)**: Changes to `spellbook/apps/desktop/src/`
- **Both**: Changes affecting both frontend and backend

## 2. Rebuild the Application

> [!IMPORTANT]
> **DO NOT skip rebuilding** before running tests. Playwright tests launch the compiled application, not the source code.

### If Backend (Rust) Changed

Build the debug binary with the frontend:

// turbo
```powershell
cd spellbook/apps/desktop
pnpm tauri:build --debug
```

This:
- Compiles the Rust backend
- Bundles the frontend assets
- Creates the debug `.exe` in `src-tauri/target/debug/`

**Typical runtime**: 30-90 seconds (full rebuild), 5-15 seconds (incremental)

### If Only Frontend Changed

Build just the frontend bundle:

// turbo
```powershell
cd spellbook/apps/desktop
pnpm build
```

This creates the production bundle in `dist/` that the debug binary loads.

**Typical runtime**: 5-20 seconds

### If Unsure or Both Changed

Perform a full rebuild to be safe:

// turbo
```powershell
cd spellbook/apps/desktop
pnpm tauri:build --debug
```

## 3. Run Playwright Tests

### Run All Tests

// turbo
```powershell
cd spellbook/apps/desktop
npx playwright test
```

### Run Specific Test File

// turbo
```powershell
cd spellbook/apps/desktop
npx playwright test vault.spec.ts
```

### Run in UI Mode (Interactive)

```powershell
cd spellbook/apps/desktop
npx playwright test --ui
```

Use UI mode to:
- Step through tests interactively
- Inspect the DOM at each step
- See live traces

## 4. Debug Test Failures

If tests fail, follow this systematic approach:

### Step 1: View the HTML Report

// turbo
```powershell
cd spellbook/apps/desktop
npx playwright show-report
```

The report shows:
- Which tests failed and why
- Screenshots at the point of failure
- Full execution traces

### Step 2: Inspect the Trace

In the HTML report:
1. Click on the failed test
2. Click on the "Trace" tab
3. Review:
   - DOM snapshots at each step
   - Network requests
   - Console logs
   - The exact line that failed

### Step 3: Check for Common Issues

- **Element not found**: UI element may be missing its `data-testid` or semantic attributes
- **Timeout errors**: Operation took longer than expected (check `TIMEOUTS` constants)
- **Blank screen**: App may not have fully loaded (check app startup logs)
- **Port collision**: Another instance may be running (see troubleshooting below)

### Step 4: Add Debug Screenshots

If the trace doesn't reveal the issue, add a debug screenshot before the failing assertion:

```typescript
// Add this line before the assertion that's failing
await page.screenshot({ path: 'debug-screenshot.png' });
```

Re-run the test and check `spellbook/apps/desktop/debug-screenshot.png`.

## 5. Troubleshooting

### Port Collisions

If you see "Address already in use" errors:

```powershell
# Kill orphaned processes
Get-Process | Where-Object {$_.ProcessName -match "spellbook"} | Stop-Process
```

### WebView2 Issues

Tests require WebView2 (Windows only). If tests skip:
- Ensure you're on Windows
- Check that WebView2 is installed: `Get-AppxPackage -Name Microsoft.WebView2`

### Database Locked

If you see "database is locked" errors:
- Ensure no other instances of the app are running
- Check `spellbook/apps/desktop/tests/tmp/data-w*/` for stale lock files
- The test infrastructure uses isolated data directories to prevent this

### Build Errors

If the build fails:

```powershell
# Clean build artifacts and retry
cd spellbook/apps/desktop
cargo clean
pnpm clean
pnpm install
pnpm tauri:build --debug
```

## Common Patterns

### After Backend Changes
```powershell
cd spellbook/apps/desktop
pnpm tauri:build --debug
npx playwright test
```

### After Frontend Changes
```powershell
cd spellbook/apps/desktop
pnpm build
npx playwright test specific.spec.ts
```

### Full Development Cycle
```powershell
cd spellbook/apps/desktop
pnpm tauri:build --debug  # Rebuild
npx playwright test        # Run tests
npx playwright show-report # View results
```
