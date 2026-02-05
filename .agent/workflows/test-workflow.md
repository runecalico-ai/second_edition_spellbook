---
description: How to run tests for Backend (Rust), Python Services, and Frontend E2E (Playwright)
---

# Rebuild and Test Workflow

Use this workflow to run tests for any part of the Spellbook application.

## 1. Determine What Changed

Identify what parts of the application were modified:
- **Backend (Rust)**: Changes to `apps/desktop/src-tauri/src/` or `Cargo.toml`
- **Frontend (TypeScript/React)**: Changes to `apps/desktop/src/`
- **Services (Python)**: Changes to `services/ml/`
- **Full Stack**: Changes affecting multiple layers

## 2. Run Backend Tests (Rust)

Unit and integration tests for the Tauri backend.

// turbo
```powershell
cd apps/desktop/src-tauri
cargo test
```

## 3. Run Service Tests (Python)

Tests for the Python sidecar ML services.

// turbo
```powershell
cd services/ml
# Ensure virtual environment is activated
# .\.venv\Scripts\Activate.ps1
python -m pytest
```

## 4. Run E2E Tests (Playwright)

End-to-end tests for the entire desktop application.

### Prerequisites: Rebuild the App

> [!IMPORTANT]
> **ALWAYS rebuild** before running E2E tests if you changed any code.

**If Backend Changed**:
// turbo
```powershell
cd apps/desktop
pnpm tauri:build --debug
```

**If Only Frontend Changed**:
// turbo
```powershell
cd apps/desktop
pnpm build
```

### Run Playwright Tests

**Run All E2E Tests**:
// turbo
```powershell
cd apps/desktop
npx playwright test
```

**Run Specific Test File**:
// turbo
```powershell
cd apps/desktop
npx playwright test vault.spec.ts
```

**Run in UI Mode (Interactive)**:
```powershell
cd apps/desktop
npx playwright test --ui
```

## 5. Debug Test Failures (E2E)

If E2E tests fail:

### Step 1: View the HTML Report
// turbo
```powershell
cd apps/desktop
npx playwright show-report
```

### Step 2: Inspect the Trace
1. Click the failed test in the report
2. Open the **Trace** tab
3. Check DOM snapshots, network requests, and console logs

### Step 3: Common Issues
- **Element not found**: Check `data-testid` attributes
- **Port collision**: Kill orphaned processes
- **Blank screen**: Ensure app was rebuilt

## 6. Troubleshooting

### Port Collisions
```powershell
Get-Process | Where-Object {$_.ProcessName -match "spellbook"} | Stop-Process
```

### Database Locked
Check `apps/desktop/tests/tmp/` for stale data directories and clean them up.

### Build Errors
```powershell
cd apps/desktop
cargo clean
pnpm clean
pnpm install
pnpm tauri:build --debug
```
