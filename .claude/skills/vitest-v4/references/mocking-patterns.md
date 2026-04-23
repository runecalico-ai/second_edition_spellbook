# Vitest Mocking Patterns (v4+)

Advanced mocking strategies and patterns for Vitest.

## Factory Mocks

Create reusable mock factories for common test scenarios:

```typescript
// tests/factories/mockUser.ts
import { vi } from 'vitest'

export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: '123',
    name: 'Test User',
    email: 'test@example.com',
    createdAt: new Date('2024-01-01'),
    ...overrides,
  }
}

export function createMockUserService() {
  return {
    getUser: vi.fn<(id: string) => Promise<User>>(),
    createUser: vi.fn<(data: CreateUserInput) => Promise<User>>(),
    updateUser: vi.fn<(id: string, data: Partial<User>) => Promise<User>>(),
    deleteUser: vi.fn<(id: string) => Promise<void>>(),
  }
}
```

### Using Factory Mocks

```typescript
import { createMockUser, createMockUserService } from '../factories/mockUser'

describe('UserController', () => {
  const mockService = createMockUserService()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns user by ID', async () => {
    const user = createMockUser({ name: 'Alice' })
    mockService.getUser.mockResolvedValue(user)

    const result = await controller.getUser('123')

    expect(result.name).toBe('Alice')
    expect(mockService.getUser).toHaveBeenCalledWith('123')
  })
})
```

## Module Mock Patterns

### Auto-mocking with Type Safety

```typescript
import { vi } from 'vitest'
import type * as ApiModule from './api'

vi.mock('./api', () => ({
  fetchUser: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
}))

// Type-safe access
const api = await import('./api')
const mockFetchUser = vi.mocked(api.fetchUser)

mockFetchUser.mockResolvedValue({ id: '1', name: 'Alice' })
```

### Partial Module Mocking

```typescript
vi.mock('./utils', async () => {
  const actual = await vi.importActual<typeof import('./utils')>('./utils')
  return {
    ...actual,
    fetchData: vi.fn(), // Only mock this export
  }
})
```

### Dynamic Module Mocking

```typescript
vi.mock('./logger', async () => {
  if (process.env.VERBOSE) {
    return await vi.importActual<typeof import('./logger')>('./logger')
  }
  return {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  }
})
```

### Mocking Named and Default Exports

```typescript
// Module: auth.ts
// export default class AuthService {}
// export const authHelper = () => {}

vi.mock('./auth', () => ({
  default: vi.fn(() => ({
    login: vi.fn(),
    logout: vi.fn(),
  })),
  authHelper: vi.fn(),
}))
```

## Class Mocking

### Mock Class Instance

```typescript
import { vi } from 'vitest'
import { Database } from './database'

vi.mock('./database', () => {
  const Database = vi.fn(class {
    connect = vi.fn()
    query = vi.fn()
    disconnect = vi.fn()
  })
  return { Database }
})

// In tests
const mockDb = new Database()
vi.mocked(mockDb.query).mockResolvedValue([{ id: 1 }])
```

### Spy on Class Methods

```typescript
const calc = new Calculator()
const addSpy = vi.spyOn(calc, 'add')

calc.add(2, 3)

expect(addSpy).toHaveBeenCalledWith(2, 3)
expect(addSpy).toHaveReturnedWith(5)

addSpy.mockRestore() // Restore original implementation
```

### Spying on Constructors (v4)

Vitest 4 supports spying on constructors. Mock implementations must use `function` or `class` (not arrow functions):

```typescript
const cart = {
  Apples: class Apples {
    getApples() { return 42 }
  }
}

const Spy = vi.spyOn(cart, 'Apples')
  // ✅ class keyword
  .mockImplementation(class MockApples {
    getApples() { return 0 }
  })
  // ✅ OR function keyword
  // .mockImplementation(function () {
  //   this.getApples = () => 0
  // })

// ❌ Arrow functions will throw: "<anonymous> is not a constructor"
// .mockImplementation(() => ({ getApples: () => 0 }))

const instance = new Spy()
expect(instance.getApples()).toBe(0)
```

## HTTP Client Mocking

### Fetch Mock Pattern

```typescript
import { vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('fetches user data', async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ id: '1', name: 'Alice' }),
  } as Response)

  const user = await fetchUser('1')

  expect(mockFetch).toHaveBeenCalledWith('/api/users/1')
  expect(user.name).toBe('Alice')
})

it('handles HTTP errors', async () => {
  mockFetch.mockResolvedValue({
    ok: false,
    status: 404,
    statusText: 'Not Found',
  } as Response)

  await expect(fetchUser('999')).rejects.toThrow('Not Found')
})

it('handles network errors', async () => {
  mockFetch.mockRejectedValue(new Error('Network error'))

  await expect(fetchUser('1')).rejects.toThrow('Network error')
})
```

### Axios Mock Pattern

```typescript
import { vi } from 'vitest'
import axios from 'axios'

vi.mock('axios')

it('mocks axios get', async () => {
  vi.mocked(axios.get).mockResolvedValue({
    data: { id: '1', name: 'Alice' },
    status: 200,
  })

  const result = await getUserData('1')

  expect(axios.get).toHaveBeenCalledWith('/users/1')
  expect(result.name).toBe('Alice')
})
```

### Conditional Mocking (URL-based)

```typescript
const mockFetch = vi.fn((url: string) => {
  if (url.includes('/users')) {
    return Promise.resolve({ ok: true, json: async () => ({ users: [] }) })
  }
  if (url.includes('/posts')) {
    return Promise.resolve({ ok: true, json: async () => ({ posts: [] }) })
  }
  return Promise.reject(new Error(`Unknown endpoint: ${url}`))
})

vi.stubGlobal('fetch', mockFetch)
```

## Environment Variable Mocking

```typescript
describe('config with env vars', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('uses production config', async () => {
    process.env.NODE_ENV = 'production'
    process.env.API_URL = 'https://api.prod.com'

    const { config } = await import('./config')

    expect(config.apiUrl).toBe('https://api.prod.com')
  })
})
```

## File System Mocking

```typescript
import { vi } from 'vitest'
import fs from 'fs/promises'

vi.mock('fs/promises')

it('reads file content', async () => {
  vi.mocked(fs.readFile).mockResolvedValue('file content')

  const content = await loadConfig('./config.json')

  expect(fs.readFile).toHaveBeenCalledWith('./config.json', 'utf-8')
  expect(content).toBe('file content')
})

it('handles missing file', async () => {
  vi.mocked(fs.readFile).mockRejectedValue(
    Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  )

  await expect(loadConfig('./missing.json')).rejects.toThrow('ENOENT')
})
```

## Date and Time Mocking

```typescript
describe('time-dependent tests', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sets specific date', () => {
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'))

    const timestamp = getCurrentTimestamp()

    expect(timestamp).toBe(new Date('2024-01-15T10:00:00Z').getTime())
  })

  it('advances time', () => {
    const start = Date.now()
    vi.advanceTimersByTime(1000)
    expect(Date.now()).toBe(start + 1000)
  })
})
```

## Sequential Return Values

```typescript
const mockApi = vi.fn()
  .mockResolvedValueOnce({ page: 1, data: ['item1'] })
  .mockResolvedValueOnce({ page: 2, data: ['item2'] })
  .mockResolvedValueOnce({ page: 3, data: [] })

// First call returns page 1, second page 2, third page 3
```

## Stateful Mocks

```typescript
let callCount = 0
const mockWithState = vi.fn(() => {
  callCount++
  return callCount > 3 ? 'throttled' : 'ok'
})

expect(mockWithState()).toBe('ok')    // call 1
expect(mockWithState()).toBe('ok')    // call 2
expect(mockWithState()).toBe('ok')    // call 3
expect(mockWithState()).toBe('throttled')  // call 4
```

## Event Emitter Testing

```typescript
import { vi, it, expect } from 'vitest'
import { EventEmitter } from 'events'

it('tests event emitter', () => {
  const emitter = new EventEmitter()
  const handler = vi.fn()

  emitter.on('data', handler)

  emitter.emit('data', { id: 1 })
  emitter.emit('data', { id: 2 })

  expect(handler).toHaveBeenCalledTimes(2)
  expect(handler).toHaveBeenNthCalledWith(1, { id: 1 })
  expect(handler).toHaveBeenNthCalledWith(2, { id: 2 })
})
```

## Mock Cleanup Reference

| Method | Effect |
|--------|--------|
| `vi.clearAllMocks()` | Clear call history, keep implementation |
| `vi.resetAllMocks()` | Clear call history + reset implementations |
| `vi.restoreAllMocks()` | v4: only restores `vi.spyOn` spies (no longer affects automocks) |
| `vi.unstubAllGlobals()` | Remove all `vi.stubGlobal()` stubs |
| `vi.unstubAllEnvs()` | Restore environment variables |
| `spy.mockRestore()` | Restore a single spy (still resets state in v4) |

> **v4 note**: `vi.fn().getMockName()` returns `'vi.fn()'` (was `'spy'` in v3). `mock.invocationCallOrder` starts at `1` (was `0`).

## Best Practices

1. **Use `vi.clearAllMocks()` in `beforeEach`** for call history, or set `mockReset: true` only when you also want to reset mock implementations
2. **Type your mocks**: Use `vi.mocked()` for full type safety
3. **Mock at module level**: Use `vi.mock()` for consistent mocking across tests
4. **Prefer spies for partial mocking**: `vi.spyOn()` keeps other methods real
5. **Restore mocks after tests**: Prevent leaks between test suites
6. **Mock external dependencies only**: Test real implementations when possible
7. **Use factory functions**: Create reusable mock factories for complex objects
8. **Be explicit about behavior**: Define clear return values and implementations
9. **Test error paths**: Mock failures to verify error handling
10. **Avoid over-mocking**: Mock only what's necessary for isolation
