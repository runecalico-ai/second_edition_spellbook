---
name: vitest-v4
description: Use when writing, reviewing, or refactoring Vitest tests or test configuration, especially for mocks, timers, Browser Mode, migration, or cross-platform failures in TypeScript or JavaScript projects
---

# Vitest Unit Testing (v4+)

Expert guidance for writing fast, maintainable unit tests using Vitest 4.x with modern best practices.

Prerequisites: This skill targets Vitest 4.x and assumes Node.js 20.0.0+ and Vite 6.0.0+. Older Node or Vite versions are not supported by current Vitest docs and can cause setup, configuration, or runtime issues.

## When to Use

- Writing or reviewing Vitest test files
- Setting up `vitest.config.ts` and coverage
- Implementing mocks with `vi` utilities
- Testing async code, timers, or concurrent operations
- Component testing with Browser Mode or Testing Library
- Type testing with `expectTypeOf` / `assertType`
- Migrating from Jest to Vitest
- Optimizing test suite performance

## Core Principles

- **One test, one behavior**: Each `it()` validates a single aspect
- **Arrange-Act-Assert**: Clear three-phase structure
- **Fast by default**: Vitest runs tests in parallel; unit tests complete in milliseconds
- **Isolated**: Use `beforeEach`, `afterEach`, `vi.resetModules()` to avoid side effects
- **Type-safe**: Leverage TypeScript for reliable tests and mocks
- **Test behavior, not implementation**: Focus on inputs/outputs, not internals

## Quick Reference

| Task | Pattern |
|------|---------|
| Create mock function | `vi.fn()` |
| Mock module | `vi.mock('./module')` |
| Type-safe mock | `vi.mocked(fn)` |
| Spy on method | `vi.spyOn(obj, 'method')` |
| Fake timers | `vi.useFakeTimers()` / `vi.useRealTimers()` |
| Set system time | `vi.setSystemTime(new Date('2024-01-15'))` |
| Advance timers | `vi.advanceTimersByTime(1000)` |
| Stub global | `vi.stubGlobal('fetch', mockFetch)` |
| Clear mock history | `vi.clearAllMocks()` |
| Reset mock implementations | `vi.resetAllMocks()` |
| Restore spies | `vi.restoreAllMocks()` |
| Parametrize | `it.each([...])('name %s', (input, expected) => { })` |
| Concurrent tests | `it.concurrent('name', async ({ expect }) => { })` |
| Skip/only | `it.skip()` / `it.only()` / `describe.skipIf(condition)` |
| Snapshot | `expect(val).toMatchSnapshot()` / `toMatchInlineSnapshot()` |
| Async assert | `await expect(promise).resolves.toBe(val)` |
| Error assert | `await expect(fn()).rejects.toThrow('msg')` |
| Type narrowing assert | `expect.assert(condition)` |
| Schema validation | `expect.schemaMatching(zodSchema)` |
| Visual regression | `await expect(locator).toMatchScreenshot('name')` |

## Configuration

### Basic vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // or 'jsdom', 'happy-dom'
    coverage: {
      provider: 'v8', // AST-based remapping in v4 (more accurate)
      reporter: ['text', 'json', 'html'],
      // v4: coverage.all removed — define include explicitly for uncovered files
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.d.ts',
        '**/*.config.*',
      ],
    },
    clearMocks: true,
    restoreMocks: true,
  },
})
```

### Projects Support (Monorepo/Multi-environment)

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./tests/setup-dom.ts'],
        },
      },
    ],
  },
})
```

### TypeScript Support

```json
// tsconfig.json
{
  "compilerOptions": {
    "types": ["vitest/globals"]
  }
}
```

## Test Structure

### Basic Pattern

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { clamp } from './math'

describe('clamp', () => {
  it('returns value when within bounds', () => {
    // arrange
    const lo = 1, hi = 10, value = 5

    // act
    const result = clamp(value, lo, hi)

    // assert
    expect(result).toBe(5)
  })

  it('returns lower bound when value is below', () => {
    expect(clamp(0, 1, 10)).toBe(1)
  })

  it('returns upper bound when value is above', () => {
    expect(clamp(15, 1, 10)).toBe(10)
  })
})
```

### Test Parametrization

```typescript
import { it, expect } from 'vitest'

it.each([
  { input: 'true', expected: true },
  { input: 'FALSE', expected: false },
  { input: '1', expected: true },
  { input: '0', expected: false },
])('parseBool($input) returns $expected', ({ input, expected }) => {
  expect(parseBool(input)).toBe(expected)
})
```

### Lifecycle Hooks

```typescript
describe('UserService', () => {
  let service: UserService

  beforeEach(() => {
    service = new UserService()
  })

  afterEach(() => {
    service.cleanup()
  })

  // tests...
})
```

### Conditional Execution

```typescript
describe.skipIf(process.env.CI)('local-only tests', () => {
  it('runs only locally', () => { /* ... */ })
})

it.runIf(process.platform === 'darwin')('macOS-specific test', () => {
  // Only runs on macOS
})
```

## Assertions

### Core Matchers

```typescript
// Equality
expect(value).toBe(42)                        // Strict ===
expect(obj).toEqual({ a: 1, b: 2 })           // Deep equality
expect(obj).toStrictEqual({ a: 1 })           // Deep equality with stricter type, sparseness, and undefined-key checks

// Truthiness
expect(value).toBeTruthy()
expect(value).toBeFalsy()
expect(value).toBeDefined()
expect(value).toBeNull()

// Numbers
expect(num).toBeGreaterThan(10)
expect(num).toBeCloseTo(10.5, 1)               // Float comparison

// Strings
expect(str).toMatch(/pattern/)
expect(str).toContain('substring')

// Arrays/Objects
expect(arr).toHaveLength(3)
expect(arr).toContain(item)
expect(arr).toContainEqual({ id: 1 })           // Deep check
expect(obj).toHaveProperty('nested.key', 'val')
expect(obj).toMatchObject({ a: 1 })             // Partial match

// Functions/Mocks
expect(fn).toHaveBeenCalledWith(arg1, arg2)
expect(fn).toHaveBeenCalledTimes(3)

// Promises
await expect(promise).resolves.toBe(value)
await expect(promise).rejects.toThrow('msg')

// Types
expect(value).toBeTypeOf('string')
expect(value).toBeInstanceOf(Date)

// Negation
expect(value).not.toBe(42)
```

### Custom Matchers

```typescript
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling
    return {
      pass,
      message: () =>
        `expected ${received} ${pass ? 'not ' : ''}to be within ${floor}–${ceiling}`,
    }
  },
})

expect(50).toBeWithinRange(40, 60)
```

### Type Narrowing with `expect.assert` (v4)

```typescript
interface Cat { __type: 'Cat'; mew(): void }
interface Dog { __type: 'Dog'; bark(): void }
type Animal = Cat | Dog

const animal: Animal = { __type: 'Dog', bark: () => {} }

expect.assert(animal.__type === 'Dog')
animal.bark() // TypeScript narrows the type — no error
```

### Schema Validation with `expect.schemaMatching` (v4)

Works with any Standard Schema v1 library (Zod, Valibot, ArkType):

```typescript
import { z } from 'zod'

const user = { email: 'john@example.com', name: 'John' }

expect(user).toEqual({
  email: expect.schemaMatching(z.string().email()),
  name: expect.schemaMatching(z.string().min(1)),
})
```

## Mocking

### Function Mocks

```typescript
const callback = vi.fn()
callback('arg1')
expect(callback).toHaveBeenCalledWith('arg1')

// Return values
const mockFn = vi.fn()
  .mockReturnValueOnce('first')
  .mockReturnValue('default')

// Implementations
const multiply = vi.fn((a: number, b: number) => a * b)
```

### Module Mocking

```typescript
import { vi } from 'vitest'
import { fetchUser } from './http-client'

vi.mock('./http-client', () => ({
  fetchUser: vi.fn(),
}))

// Type-safe mock setup
vi.mocked(fetchUser).mockResolvedValue({ id: '123', name: 'Alice' })
```

### Partial Module Mocking

```typescript
vi.mock('./utils', async () => {
  const actual = await vi.importActual<typeof import('./utils')>('./utils')
  return {
    ...actual,
    fetchData: vi.fn(), // Mock only this export
  }
})
```

### Spying

```typescript
const spy = vi.spyOn(calculator, 'add')
calculator.add(2, 3)
expect(spy).toHaveBeenCalledWith(2, 3)
spy.mockRestore()
```

### Globals & Environment

```typescript
// Stub global
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  json: async () => ({ data: 'test' }),
}))

// Fake timers
vi.useFakeTimers()
vi.setSystemTime(new Date('2024-01-15'))
// ...test code...
vi.useRealTimers()
```

For advanced mocking patterns (factory mocks, class/constructor mocking, HTTP clients, sequential returns), see `references/mocking-patterns.md`.

## Async Testing

### Promises

```typescript
it('handles async functions', async () => {
  const data = await fetchData()
  expect(data).toBeDefined()
})

await expect(fetchData()).resolves.toEqual({ status: 'ok' })
await expect(failingOp()).rejects.toThrow('Not found')
```

### Timers

```typescript
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('fast-forwards time', () => {
  const callback = vi.fn()
  setTimeout(callback, 1000)

  vi.advanceTimersByTime(1000)

  expect(callback).toHaveBeenCalledTimes(1)
})
```

Fake-timer cleanup and mock cleanup are separate concerns: use `vi.useRealTimers()` to disable fake timers, and use `vi.clearAllMocks()`, `vi.resetAllMocks()`, or `vi.restoreAllMocks()` only for mock and spy state.

For debounce/throttle, event loops, streams, retry logic, see `references/async-testing.md`.

## Snapshot Testing

```typescript
// File-based snapshot
expect(data).toMatchSnapshot()

// Inline snapshot (auto-filled by Vitest)
expect(result).toMatchInlineSnapshot(`
  {
    "formatted": "Name: Alice"
  }
`)

// Custom serializer
expect.addSnapshotSerializer({
  test: (val) => val instanceof Date,
  serialize: (val: Date) => `Date<${val.toISOString()}>`,
})
```

## Type Testing

Vitest can catch type regressions using `expectTypeOf` and `assertType` in `*.test-d.ts` files:

```typescript
// types.test-d.ts
import { test, expectTypeOf, assertType } from 'vitest'
import { mount } from './mount'

test('mount accepts component props', () => {
  expectTypeOf(mount).toBeFunction()
  expectTypeOf(mount).parameter(0).toExtend<{ name: string }>()

  // @ts-expect-error name must be a string
  assertType(mount({ name: 42 }))
})
```

Run with: `vitest --typecheck`

## DOM & Component Testing

### Browser Mode (Recommended)

Browser Mode is **stable in v4**. Real browser testing with Playwright — catches CSS, accessibility, and event issues that jsdom/happy-dom miss:

```bash
# v4: install provider package (replaces @vitest/browser)
npm install -D @vitest/browser-playwright
# Framework renderers
npm install -D vitest-browser-react   # or vitest-browser-vue / vitest-browser-svelte
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [
        { browser: 'chromium' },
      ],
    },
  },
})
```

```typescript
import { render } from 'vitest-browser-react' // or vitest-browser-vue
import { page } from 'vitest/browser' // v4: import from 'vitest/browser', not '@vitest/browser/context'

it('renders button', async () => {
  await render(<Button>Click me</Button>)

  const button = page.getByRole('button', { name: /click me/i })
  await expect.element(button).toBeInTheDocument()
  await button.click()
})
```

### DOM Simulation (jsdom/happy-dom)

For simpler tests without browser overhead. Use Testing Library for queries.

For comprehensive component testing patterns (React hooks, forms, context, Vue, MSW, accessibility), see `references/component-testing.md`.

## Coverage

**v4 changes**: `coverage.all` and `coverage.extensions` removed. V8 provider uses AST-based remapping for accurate reports. You **must** define `coverage.include` to include uncovered files.

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8', // v4: AST-based, much more accurate
      reporter: ['text', 'json', 'html', 'lcov'],
      // Required in v4 to include uncovered files in report
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts', '**/*.config.*', '**/__tests__/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
})
```

```bash
vitest --coverage         # Run with coverage
vitest run --coverage     # Single run with coverage
```

## Performance

- **Parallel by default**: Tests run in parallel across files; ensure isolation
- **`it.concurrent`**: Run independent tests within a suite concurrently
- **Sharding**: Split across CI machines with `--shard=1/2 --reporter=blob`
- **`--pool=threads`**: Use worker threads instead of child processes for speed
- **`maxWorkers`**: v4 replaces `maxThreads`/`maxForks` with unified `maxWorkers`
- **Mock expensive ops**: File I/O, network, heavy computations
- **Avoid test interdependence**: Each test must work in isolation
- **`isolate: false`**: Trade correctness for speed (replaces v3 `--no-isolate`)
- **`test.dir`**: Limit test discovery directory instead of broad `exclude` patterns

## Best Practices

### Test Organization

- **Co-locate** `*.test.ts` next to source files
- **Group with `describe`**: Nested blocks for related behaviors
- **Clear names**: Describe behavior, not implementation (`'rejects invalid email'` not `'calls validator'`)
- **One assertion concept per test**: Multiple `expect()` OK if testing same behavior

### Mocking Strategy

- **Mock external dependencies**: APIs, databases, third-party services
- **Use MSW for HTTP**: Mock Service Worker for realistic request/response
- **Don't over-mock**: Test real implementations when possible
- **Reset between tests**: Use `vi.clearAllMocks()` in `beforeEach` for call history, or `mockReset: true` only when you also want to reset implementations
- **Type your mocks**: `vi.mocked()` for type safety
- **v4 note**: `vi.restoreAllMocks()` restores only `vi.spyOn` implementations. It does not clear `vi.fn()` call history, reset mock implementations, or disable fake timers.

### Component Testing Hierarchy

1. **Critical user paths**: Always test first
2. **Error handling**: Failure scenarios
3. **Edge cases**: Empty data, boundary values
4. **Accessibility**: ARIA, keyboard navigation
5. **Performance**: Large datasets

### File Naming

- Prefer `*.test.ts` / `*.test.tsx` (consistent with Vitest defaults)
- Co-locate or use `__tests__/` directory
- Type test files: `*.test-d.ts`

## Vitest 4 Migration Notes

Key breaking changes from v3 → v4:

| v3 | v4 |
|----|----|
| `coverage.all: true` | Removed — define `coverage.include` explicitly |
| `maxThreads` / `maxForks` | `maxWorkers` |
| `singleThread` / `singleFork` | `maxWorkers: 1, isolate: false` |
| `poolOptions.forks.execArgv` | `execArgv` (top-level) |
| `provider: 'playwright'` (string) | `provider: playwright()` (import function) |
| `@vitest/browser/context` | `vitest/browser` |
| `workspace` config | `projects` config |
| `test('name', fn, { retry: 2 })` | `test('name', { retry: 2 }, fn)` |
| `basic` reporter | `['default', { summary: false }]` |

Mocking behavior changes in v4:
- `vi.fn().getMockName()` returns `'vi.fn()'` (was `'spy'`)
- `vi.restoreAllMocks()` only restores `vi.spyOn` spies (no longer affects automocks)
- `vi.spyOn` now supports constructors — mock implementations must use `function` or `class` (not arrow functions)
- `mock.invocationCallOrder` starts at `1` (was `0`)

## Migration from Jest

| Jest | Vitest |
|------|--------|
| `jest.fn()` | `vi.fn()` |
| `jest.mock()` | `vi.mock()` |
| `jest.spyOn()` | `vi.spyOn()` |
| `jest.useFakeTimers()` | `vi.useFakeTimers()` |
| `jest.clearAllMocks()` | `vi.clearAllMocks()` |
| `@jest/globals` | `vitest` |
| `jest.config.js` | `vitest.config.ts` |

## Common Mistakes

See `references/common-mistakes.md` for detailed anti-patterns with fixes, including:
- Forgetting `await` on async assertions
- Timer leaks between tests
- Over-mocking internal modules
- Snapshot sprawl
- Test interdependence
- Mixing real and fake timers

## Additional References

- `references/mocking-patterns.md` — Factory mocks, class mocks, HTTP clients, env vars
- `references/async-testing.md` — Timers, debounce, streams, retry logic, event loops
- `references/component-testing.md` — React, Vue, Browser Mode, Testing Library, MSW
- `references/common-mistakes.md` — Anti-patterns and fixes
- `references/vitest-cross-platform.md` — Windows vs Linux pitfalls and best practices
