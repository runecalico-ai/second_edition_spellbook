# Vitest Cross-Platform Guidance

Use this guide when you write or review Vitest tests that must pass on both Windows and Linux.

Cross-platform failures usually come from case-sensitive imports, hardcoded path separators, incomplete mocks, or assumptions about the test environment. A test that passes on Windows can still fail on Linux if imports, mocks, or filesystem assumptions are not exact.

## Main Rules

1. Match file and directory casing exactly in every import.
2. Make module mocks complete for every export the test or its helpers use.
3. Build paths with platform-safe utilities instead of string concatenation.
4. Reset mocks and module state between tests when shared state can leak.
5. Treat hoisted mocks carefully and avoid depending on values initialized later.
6. Run the same Vitest mode locally that CI uses.

## 1. Match Import Casing Exactly

Windows file systems often tolerate casing mistakes in import paths. Linux file systems do not.

If a file on disk is named `UserCard.tsx`, import it with the same casing in every path segment.

Good:

```ts
import { UserCard } from './UserCard'
```

Bad:

```ts
import { UserCard } from './usercard'
```

If import casing is wrong, a test can pass on Windows and fail in CI on Linux.

## 2. Keep `vi.mock()` Factories Complete

When you mock a module, Vitest replaces the whole module. If the test, a setup file, or a shared helper imports another symbol from that module, your mock must provide it.

Good:

```ts
vi.mock('./feature-flags', () => ({
  isEnabled: vi.fn(() => true),
  getVariant: vi.fn(() => 'control'),
}))
```

Bad:

```ts
vi.mock('./feature-flags', () => ({
  isEnabled: vi.fn(() => true),
}))
```

If a suite fails during import or setup, check whether a mock omitted an export that another helper depends on.

## 3. Prefer `.ts` for Non-JSX Files

Use `.tsx` only for files that contain JSX.

If a file exports constants, helpers, or plain TypeScript only, name it `.ts`.

This keeps file intent clear and avoids toolchain or lint confusion around component-only rules.

## 4. Use Path Utilities for File Paths

Do not hardcode path separators in tests.

Good:

```ts
import path from 'node:path'

const filePath = path.join(process.cwd(), 'tests', 'fixtures', 'sample.json')
```

Bad:

```ts
const filePath = process.cwd() + '/tests/fixtures/sample.json'
```

`path.join()` and `path.resolve()` work on both Windows and Linux.

## 5. Keep Mocks Isolated

Shared mock state can leak between tests.

Use cleanup hooks when the mocked module or helper is reused:

```ts
import { afterEach, vi } from 'vitest'

afterEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})
```

If test behavior depends on import-time initialization or cached local state, also consider `vi.resetModules()`.

## 6. Be Careful with Hoisted Mocks

`vi.mock()` is hoisted. Do not depend on variables that are initialized later unless you intentionally use a hoisted pattern.

Safer pattern:

```ts
const { mockGetValue } = vi.hoisted(() => ({
  mockGetValue: vi.fn(() => 'value'),
}))

vi.mock('./settings', () => ({
  getValue: mockGetValue,
}))
```

## 7. Verify in the Same Environment Used by CI

If CI runs Node mode, jsdom, Browser Mode, or a named Vitest project, run that same configuration locally before you push. Cross-platform confidence comes from matching the real execution mode, not from running a different local shortcut.

Examples:

```bash
npx vitest run
npx vitest run --project browser
npx vitest run path/to/file.test.ts
```

Or use the repository's equivalent package-manager script if one exists.

## 8. Recommended Review Checklist

Before you commit a new or changed Vitest test, check these items:

- All imports match on-disk casing exactly.
- Every mocked module exports all symbols used by the test, setup files, and shared helpers.
- Non-JSX helpers use `.ts`, not `.tsx`.
- File paths use `path.join()` or `path.resolve()`.
- Mocks are cleared, restored, or reset when state can leak.
- The relevant Vitest suite passes in the same environment or project used by CI.

## 9. Fast Failure Triage

If a test passes on Windows and fails on Linux, check these first:

- import path casing
- missing exports in module mocks
- hardcoded path separators
- environment-specific setup differences
- leaked mock or module state