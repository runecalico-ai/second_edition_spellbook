# Async Testing with Vitest

Comprehensive guide to testing asynchronous code with Vitest.

## Promise Testing

### Basic Async/Await

```typescript
import { it, expect } from 'vitest'

it('handles async functions', async () => {
  const result = await fetchData()
  expect(result).toEqual({ status: 'success' })
})

it('tests rejected promises', async () => {
  await expect(failingOperation()).rejects.toThrow('Operation failed')
})
```

### Using Resolves and Rejects

```typescript
it('uses resolves matcher', async () => {
  await expect(fetchUser('123')).resolves.toEqual({
    id: '123',
    name: 'Alice',
  })
})

it('uses rejects matcher', async () => {
  await expect(fetchUser('invalid')).rejects.toThrow('User not found')
})

it('chains matchers', async () => {
  await expect(fetchUsers()).resolves.toHaveLength(5)
  await expect(fetchUser('1')).resolves.toHaveProperty('name')
})
```

## Timer Testing

### Fake Timers Setup

```typescript
import { vi, beforeEach, afterEach } from 'vitest'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})
```

Fake-timer cleanup and mock cleanup are separate concerns: use `vi.useRealTimers()` to disable fake timers, and use `vi.clearAllMocks()`, `vi.resetAllMocks()`, or `vi.restoreAllMocks()` only for mock and spy state.

### Testing setTimeout

```typescript
it('advances time for setTimeout', () => {
  const callback = vi.fn()
  setTimeout(callback, 1000)

  expect(callback).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1000)
  expect(callback).toHaveBeenCalledTimes(1)
})

it('runs all pending timers', () => {
  const callback = vi.fn()
  setTimeout(callback, 100)
  setTimeout(callback, 200)
  setTimeout(callback, 300)

  vi.runAllTimers()

  expect(callback).toHaveBeenCalledTimes(3)
})
```

### Testing setInterval

```typescript
it('handles intervals', () => {
  const callback = vi.fn()
  setInterval(callback, 100)

  vi.advanceTimersByTime(250)

  expect(callback).toHaveBeenCalledTimes(2)
})

it('clears interval', () => {
  const callback = vi.fn()
  const intervalId = setInterval(callback, 100)

  vi.advanceTimersByTime(150)
  clearInterval(intervalId)
  vi.advanceTimersByTime(150)

  expect(callback).toHaveBeenCalledTimes(1)
})
```

### Testing Debounce/Throttle

```typescript
function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timeoutId: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }
}

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces function calls', () => {
    const callback = vi.fn()
    const debounced = debounce(callback, 300)

    debounced('arg1')
    debounced('arg2')
    debounced('arg3')

    expect(callback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith('arg3') // Only last call
  })

  it('resets timer on subsequent calls', () => {
    const callback = vi.fn()
    const debounced = debounce(callback, 300)

    debounced('first')
    vi.advanceTimersByTime(200)

    debounced('second') // Resets timer
    vi.advanceTimersByTime(200) // Total: 400ms, but only 200ms since last call

    expect(callback).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(callback).toHaveBeenCalledWith('second')
  })
})
```

## Testing Concurrent Operations

### Promise.all

```typescript
it('tests parallel operations', async () => {
  const api = {
    fetchUser: vi.fn().mockResolvedValue({ id: '1' }),
    fetchPosts: vi.fn().mockResolvedValue([{ id: 'p1' }]),
    fetchComments: vi.fn().mockResolvedValue([{ id: 'c1' }]),
  }

  const [user, posts, comments] = await Promise.all([
    api.fetchUser('1'),
    api.fetchPosts('1'),
    api.fetchComments('1'),
  ])

  expect(user.id).toBe('1')
  expect(posts).toHaveLength(1)
  expect(comments).toHaveLength(1)
})
```

### Promise.race

```typescript
it('tests race conditions', async () => {
  vi.useFakeTimers()

  const fast = new Promise((resolve) => setTimeout(() => resolve('fast'), 10))
  const slow = new Promise((resolve) => setTimeout(() => resolve('slow'), 100))

  const racePromise = Promise.race([fast, slow])
  vi.advanceTimersByTime(10)

  const result = await racePromise
  expect(result).toBe('fast')

  vi.useRealTimers()
})
```

## Testing Retry Logic

```typescript
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation()
    } catch (error) {
      if (i === maxRetries - 1) throw error
    }
  }
  throw new Error('Max retries exceeded')
}

it('retries failed operations', async () => {
  const operation = vi.fn()
    .mockRejectedValueOnce(new Error('fail 1'))
    .mockRejectedValueOnce(new Error('fail 2'))
    .mockResolvedValueOnce('success')

  const result = await retryOperation(operation)

  expect(result).toBe('success')
  expect(operation).toHaveBeenCalledTimes(3)
})

it('throws after max retries', async () => {
  const operation = vi.fn().mockRejectedValue(new Error('always fails'))

  await expect(retryOperation(operation, 2)).rejects.toThrow('always fails')
  expect(operation).toHaveBeenCalledTimes(2)
})
```

## Testing Event Loops

### Microtasks vs Macrotasks

```typescript
it('understands microtask vs macrotask ordering', async () => {
  vi.useFakeTimers()

  const order: string[] = []

  setTimeout(() => order.push('setTimeout'), 0)
  Promise.resolve().then(() => order.push('promise'))
  queueMicrotask(() => order.push('microtask'))
  order.push('sync')

  await vi.runAllTimersAsync()

  expect(order).toEqual(['sync', 'promise', 'microtask', 'setTimeout'])

  vi.useRealTimers()
})
```

## Testing Async Generators

```typescript
async function* numberGenerator() {
  yield 1
  yield 2
  yield 3
}

it('tests async generators', async () => {
  const results: number[] = []

  for await (const num of numberGenerator()) {
    results.push(num)
  }

  expect(results).toEqual([1, 2, 3])
})
```

## Testing WebSocket/EventEmitter Async

```typescript
it('tests event emitter with promises', async () => {
  const emitter = new EventEmitter()

  const promise = new Promise<string>((resolve) => {
    emitter.once('data', resolve)
  })

  setTimeout(() => emitter.emit('data', 'test'), 10)

  const result = await promise
  expect(result).toBe('test')
})
```

## Testing Async Errors

### Error Types

```typescript
it('catches async errors', async () => {
  await expect(async () => {
    throw new Error('Async error')
  }).rejects.toThrow('Async error')
})

it('tests error with specific type', async () => {
  class CustomError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'CustomError'
    }
  }

  const operation = async () => { throw new CustomError('Custom error') }

  await expect(operation()).rejects.toThrow(CustomError)
  await expect(operation()).rejects.toThrow('Custom error')
})
```

### Error Paths That Would Otherwise Become Unhandled

```typescript
it('asserts rejected background work explicitly', async () => {
  const backgroundTask = Promise.reject(new Error('Unhandled'))

  await expect(backgroundTask).rejects.toThrow('Unhandled')
})
```

## Testing Request/Response Cycles

```typescript
async function fetchWithRetry(url: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
    } catch (error) {
      if (i === retries - 1) throw error
    }
  }
  throw new Error('Max retries exceeded')
}

it('retries failed requests', async () => {
  const mockFetch = vi.fn()
    .mockRejectedValueOnce(new Error('Network error'))
    .mockRejectedValueOnce(new Error('Network error'))
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: 'success' }) })

  vi.stubGlobal('fetch', mockFetch)

  const response = await fetchWithRetry('https://api.example.com')
  const data = await response.json()

  expect(data).toEqual({ data: 'success' })
  expect(mockFetch).toHaveBeenCalledTimes(3)

  vi.unstubAllGlobals()
})
```

## Testing Streams

```typescript
import { Readable } from 'stream'

it('tests readable streams', async () => {
  const data = ['chunk1', 'chunk2', 'chunk3']
  const stream = Readable.from(data)

  const chunks: string[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }

  expect(chunks).toEqual(data)
})
```

## Concurrent Test Execution

```typescript
describe.concurrent('independent operations', () => {
  it('test A', async ({ expect }) => {
    const result = await operationA()
    expect(result).toBeDefined()
  })

  it('test B', async ({ expect }) => {
    const result = await operationB()
    expect(result).toBeDefined()
  })
})
```

> **Warning**: When using `.concurrent`, use `expect` from the test context (`{ expect }`) parameter to ensure correct test detection for assertions and snapshots.

## Best Practices

1. **Always `await` async assertions**: Don't forget `await` or return the promise
2. **Prefer async/await over callbacks**: Clearer and easier to debug
3. **Mock timers for time-dependent code**: Use `vi.useFakeTimers()`
4. **Test both success and failure**: Use `.resolves` and `.rejects`
5. **Clean up timers**: Always call `vi.useRealTimers()` in `afterEach` when a test enables fake timers
6. **Avoid race conditions**: Ensure proper sequencing with `await`
7. **Use `vi.runAllTimersAsync()`** for complex timer + promise scenarios
8. **Keep async tests focused**: Test one async behavior at a time
9. **Use `onTestFinished`** for cleanup instead of `afterEach` when test-specific

## Common Pitfalls

### Forgetting to Await

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

### Not Cleaning Up Timers

```typescript
// ❌ WRONG: Timers leak between tests
it('test with timers', () => {
  vi.useFakeTimers()
  // test code but no cleanup
})

// ✅ CORRECT: Clean up in afterEach
afterEach(() => {
  vi.useRealTimers()
})
```

### Mixing Real and Fake Timers

```typescript
// ❌ WRONG: Real async operation with fake timers
it('bad async test', async () => {
  vi.useFakeTimers()
  const promise = realAsyncOperation() // Uses real time
  vi.advanceTimersByTime(1000) // Won't affect real promise
  await promise
})

// ✅ CORRECT: Use vi.runAllTimersAsync()
it('good async test', async () => {
  vi.useFakeTimers()
  const promise = fakedAsyncOperation()
  await vi.runAllTimersAsync()
  await promise
})
```
