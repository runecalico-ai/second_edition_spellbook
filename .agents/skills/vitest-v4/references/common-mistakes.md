# Common Vitest Mistakes and Anti-Patterns (v4+)

Anti-patterns with explanations and fixes. Use this to catch issues during code review or when debugging flaky tests.

## 1. Forgetting to Await Async Assertions

The #1 cause of confusing async assertion failures.

```typescript
// ❌ WRONG: Promise not awaited
it('bad test', () => {
  expect(asyncOperation()).resolves.toBe('result')
})

// ✅ CORRECT: Await the expectation
it('good test', async () => {
  await expect(asyncOperation()).resolves.toBe('result')
})
```

**Why it matters**: In Vitest 4, unawaited `.resolves` and `.rejects` assertions fail the test, but the failure is less direct and easier to misread than an awaited assertion.

## 2. Timer Leaks Between Tests

```typescript
// ❌ WRONG: No cleanup — fake timers leak into subsequent tests
it('uses fake timers', () => {
  vi.useFakeTimers()
  setTimeout(callback, 1000)
  vi.advanceTimersByTime(1000)
})

// ✅ CORRECT: Always clean up timers
describe('timer tests', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('uses fake timers safely', () => {
    setTimeout(callback, 1000)
    vi.advanceTimersByTime(1000)
  })
})
```

## 3. Mixing Real Async with Fake Timers

```typescript
// ❌ WRONG: Real async operation ignores fake timers
it('broken async test', async () => {
  vi.useFakeTimers()
  const promise = fetch('/api/data')   // Real network call
  vi.advanceTimersByTime(5000)          // Won't speed up fetch
  await promise                        // Hangs or times out
})

// ✅ CORRECT: Mock the async operation OR use vi.runAllTimersAsync()
it('correct async test', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

  const promise = fetch('/api/data')
  await vi.runAllTimersAsync()
  await promise

  vi.unstubAllGlobals()
  vi.useRealTimers()
})
```

## 4. Over-Mocking

```typescript
// ❌ WRONG: Mocking internal implementation details
vi.mock('./validators', () => ({
  isValid: vi.fn().mockReturnValue(true),
}))

it('creates user', async () => {
  // Test passes even if validators are broken
  const user = await createUser({ email: 'test@example.com' })
  expect(user).toBeDefined()
})

// ✅ CORRECT: Only mock external boundaries
// Don't mock your own validation logic — test it with real implementations
it('rejects invalid email', async () => {
  await expect(
    createUser({ email: 'not-an-email' })
  ).rejects.toThrow('Invalid email')
})
```

**Rule**: Mock at the boundary — APIs, databases, file systems, third-party services. Don't mock the code you own.

## 5. Test Interdependence

```typescript
// ❌ WRONG: Tests depend on execution order
let sharedUser: User

it('creates user', async () => {
  sharedUser = await createUser({ name: 'Alice' })
  expect(sharedUser.id).toBeDefined()
})

it('updates user', async () => {
  // Fails if first test doesn't run or fails
  await updateUser(sharedUser.id, { name: 'Bob' })
})

// ✅ CORRECT: Each test is independent
it('creates user', async () => {
  const user = await createUser({ name: 'Alice' })
  expect(user.id).toBeDefined()
})

it('updates user', async () => {
  const user = await createUser({ name: 'Alice' })
  const updated = await updateUser(user.id, { name: 'Bob' })
  expect(updated.name).toBe('Bob')
})
```

## 6. Snapshot Sprawl

```typescript
// ❌ WRONG: Snapshots for everything — reviewers rubber-stamp updates
it('renders correctly', () => {
  const { container } = render(<ComplexPage />)
  expect(container).toMatchSnapshot()  // 500+ line snapshot
})

// ✅ CORRECT: Targeted assertions + small snapshots for critical structures
it('renders user name', () => {
  render(<UserCard name="Alice" />)
  expect(screen.getByText('Alice')).toBeInTheDocument()
})

it('matches card structure', () => {
  const { container } = render(<UserCard name="Alice" />)
  expect(container.firstChild).toMatchInlineSnapshot(`
    <div class="card">
      <span class="name">Alice</span>
    </div>
  `)
})
```

**Guideline**: Use inline snapshots for small, stable structures. Use explicit assertions for behavior.

## 7. Not Resetting Mocks

```typescript
// ❌ WRONG: Mock state leaks between tests
const mockFn = vi.fn().mockReturnValue('first test value')

it('test 1', () => {
  mockFn()
  expect(mockFn).toHaveBeenCalledTimes(1)
})

it('test 2', () => {
  mockFn()
  expect(mockFn).toHaveBeenCalledTimes(1) // FAILS: called 2 times total
})

// ✅ CORRECT: Reset mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
})

// OR, if you also want to reset mock implementations, configure globally:
// test: { mockReset: true }
```

## 8. Testing Implementation Details

```typescript
// ❌ WRONG: Testing internal state and method calls
it('calls internal validate method', () => {
  const spy = vi.spyOn(form, '_validate')
  form.submit()
  expect(spy).toHaveBeenCalled()  // Brittle: refactoring breaks test
})

// ✅ CORRECT: Test the observable behavior
it('shows error on invalid submission', async () => {
  const user = userEvent.setup()
  render(<Form />)

  await user.click(screen.getByRole('button', { name: /submit/i }))

  expect(screen.getByText(/email is required/i)).toBeInTheDocument()
})
```

## 9. Using `getByTestId` as Default Query

```typescript
// ❌ WRONG: Test IDs everywhere — doesn't verify accessibility
render(<button data-testid="submit-btn">Submit</button>)
screen.getByTestId('submit-btn')

// ✅ CORRECT: Use accessible queries
screen.getByRole('button', { name: /submit/i })
```

**Query priority**: `getByRole` > `getByLabelText` > `getByText` > `getByTestId`

## 10. Ignoring Type Safety in Mocks

```typescript
// ❌ WRONG: Untyped mock — no compile-time safety
const mockFn = vi.fn() as any
mockFn.mockReturnValue({ wrong: 'shape' })

// ✅ CORRECT: Type-safe mocking
import { fetchUser } from './api'

vi.mock('./api', () => ({
  fetchUser: vi.fn(),
}))

vi.mocked(fetchUser).mockResolvedValue({
  id: '1',
  name: 'Alice',
  email: 'alice@example.com',
})
```

## 11. Not Using `expect.assertions()` for Error Paths

```typescript
// ❌ WRONG: If async operation doesn't throw, test passes silently
it('handles errors', async () => {
  try {
    await riskyOperation()
  } catch (error) {
    expect(error.message).toBe('Expected error')
  }
})

// ✅ CORRECT: Use rejects matcher
it('handles errors', async () => {
  await expect(riskyOperation()).rejects.toThrow('Expected error')
})

// ✅ ALSO CORRECT: Use expect.assertions for try/catch patterns
it('handles errors', async () => {
  expect.assertions(1)
  try {
    await riskyOperation()
  } catch (error) {
    expect((error as Error).message).toBe('Expected error')
  }
})
```

## 12. Slow Tests from Real I/O

```typescript
// ❌ WRONG: Real file system in unit tests
it('reads config', async () => {
  const config = await readFile('./config.json', 'utf-8')
  expect(JSON.parse(config)).toHaveProperty('version')
})

// ✅ CORRECT: Mock I/O in unit tests
vi.mock('fs/promises')

it('reads config', async () => {
  vi.mocked(readFile).mockResolvedValue('{"version": "1.0.0"}')
  const config = await loadConfig('./config.json')
  expect(config.version).toBe('1.0.0')
})
```

## 13. Missing `vi.resetModules()` for Module State

```typescript
// ❌ WRONG: Module cache persists between tests
it('test with env A', async () => {
  process.env.MODE = 'production'
  const { config } = await import('./config') // Cached!
  expect(config.debug).toBe(false)
})

it('test with env B', async () => {
  process.env.MODE = 'development'
  const { config } = await import('./config') // Still cached from test 1
  expect(config.debug).toBe(true)             // FAILS
})

// ✅ CORRECT: Reset module registry between tests
beforeEach(() => {
  vi.resetModules()
})

it('test with env A', async () => {
  process.env.MODE = 'production'
  const { config } = await import('./config')
  expect(config.debug).toBe(false)
})

it('test with env B', async () => {
  process.env.MODE = 'development'
  const { config } = await import('./config') // Fresh import
  expect(config.debug).toBe(true)
})
```

## 14. Concurrent Tests with Shared State

```typescript
// ❌ WRONG: Concurrent tests sharing mutable state
describe.concurrent('user operations', () => {
  const users: User[] = []

  it('adds user', async () => {
    users.push({ id: '1', name: 'Alice' })
    expect(users).toHaveLength(1) // Race condition!
  })

  it('adds another user', async () => {
    users.push({ id: '2', name: 'Bob' })
    expect(users).toHaveLength(1) // Race condition!
  })
})

// ✅ CORRECT: Each concurrent test has its own state
describe.concurrent('user operations', () => {
  it('adds user', async ({ expect }) => {
    const users: User[] = []
    users.push({ id: '1', name: 'Alice' })
    expect(users).toHaveLength(1)
  })

  it('adds another user', async ({ expect }) => {
    const users: User[] = []
    users.push({ id: '2', name: 'Bob' })
    expect(users).toHaveLength(1)
  })
})
```

> **Important**: When using `.concurrent`, use `expect` from the test context parameter to ensure correct test detection.

## 15. Forgetting to Unstub Globals

```typescript
// ❌ WRONG: Global stub leaks to other test files
it('stubs fetch', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  // ... test code ... but never unstubs
})

// ✅ CORRECT: Always clean up stubs
afterEach(() => {
  vi.unstubAllGlobals()
})
```

## 16. Wrong Test Options Argument Position (v4)

```typescript
// ❌ WRONG in v4: options as 3rd argument no longer supported
test('example', () => { /* ... */ }, { retry: 2 })

// ✅ CORRECT in v4: options as 2nd argument
test('example', { retry: 2 }, () => { /* ... */ })

// Timeout as last argument still works:
test('example', () => { /* ... */ }, 1000) // ✅
```

## 17. Arrow Functions in Constructor Mocks (v4)

```typescript
// ❌ WRONG: Arrow function as constructor mock
vi.spyOn(cart, 'Apples')
  .mockImplementation(() => ({ getApples: () => 0 }))
// Error: <anonymous> is not a constructor

// ✅ CORRECT: Use class or function keyword
vi.spyOn(cart, 'Apples')
  .mockImplementation(class MockApples {
    getApples() { return 0 }
  })
```

## Quick Checklist

Before committing tests, verify:

- [ ] All async assertions are `await`ed
- [ ] Fake timers are cleaned up in `afterEach`
- [ ] Mock cleanup matches intent (`vi.clearAllMocks()` for call history, `mockReset: true` only when resetting implementations too)
- [ ] No test depends on another test's execution
- [ ] External boundaries are mocked, internal code is real
- [ ] Accessible queries used (not `getByTestId` as default)
- [ ] `vi.mocked()` used for type-safe mocks
- [ ] Global stubs cleaned up with `vi.unstubAllGlobals()`
- [ ] Snapshots are small and intentional
- [ ] `.concurrent` tests use `{ expect }` from test context
