# Component Testing with Vitest (v4+)

Comprehensive guide for testing components using Vitest with Browser Mode (stable in v4) and Testing Library.

Prerequisites: These examples target Vitest 4.x and assume Node.js 20.0.0+ and Vite 6.0.0+.

## Browser Mode vs DOM Simulation

### Browser Mode (Recommended)

**Browser Mode** provides the most accurate testing environment when used with real-browser providers such as Playwright or WebdriverIO. Preview mode is useful for quick local checks, but it simulates events and is less representative than those providers.

**Why Browser Mode?**

- **Real CSS rendering**: Catches layout and styling problems
- **Actual browser APIs**: Native implementations, not polyfills
- **Accurate event handling**: Real event propagation and timing
- **Focus management**: True browser accessibility behavior

```bash
# v4: install provider package (replaces @vitest/browser)
npm install -D @vitest/browser-playwright

# Framework-specific renderer packages
npm install -D vitest-browser-react    # React
npm install -D vitest-browser-vue      # Vue
npm install -D vitest-browser-svelte   # Svelte
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    browser: {
      enabled: true,
      provider: playwright(), // v4: function call, not string
      instances: [
        { browser: 'chromium' }, // or 'firefox', 'webkit'
      ],
    },
  },
})
```

### DOM Simulation (Alternative)

For simpler unit tests without browser overhead:

```bash
npm install -D jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

```typescript
import { defineConfig } from 'vitest/config'

// vitest.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom', // or 'happy-dom'
  },
})
```

**When to choose:**
- **Browser Mode**: CI/CD, visual tests, CSS/accessibility, accurate event handling
- **DOM Simulation**: Unit tests, faster execution, simpler setup

## React Testing with Browser Mode

```typescript
import { render } from 'vitest-browser-react'
import { expect, vi } from 'vitest'
import { page } from 'vitest/browser' // v4: import from 'vitest/browser'
import { Button } from './Button'

it('renders and handles clicks', async () => {
  const onClick = vi.fn()
  await render(<Button onClick={onClick}>Click me</Button>)

  const button = page.getByRole('button', { name: /click me/i })

  // expect.element() auto-retries DOM assertions
  await expect.element(button).toBeInTheDocument()
  await expect.element(button).toBeVisible()

  await button.click()

  expect(onClick).toHaveBeenCalledTimes(1)
})
```

## React Testing with Testing Library (jsdom)

### Setup

```typescript
// tests/setup.ts
import { expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import * as matchers from '@testing-library/jest-dom/matchers'

expect.extend(matchers)
afterEach(() => cleanup())
```

```typescript
import { defineConfig } from 'vitest/config'

// vitest.config.ts
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
})
```

### Basic Component Test

```typescript
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Button } from './Button'

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument()
  })

  it('applies variant class', () => {
    render(<Button variant="primary">Primary</Button>)
    expect(screen.getByRole('button')).toHaveClass('btn-primary')
  })

  it('respects disabled prop', () => {
    render(<Button disabled>Disabled</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

### User Interactions

**Always prefer `userEvent` over `fireEvent`** for realistic interactions:

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { it, expect, vi } from 'vitest'

it('increments counter on click', async () => {
  const user = userEvent.setup()
  render(<Counter />)

  await user.click(screen.getByRole('button', { name: /increment/i }))

  expect(screen.getByText(/count: 1/i)).toBeInTheDocument()
})

it('submits form with user input', async () => {
  const user = userEvent.setup()
  const onSubmit = vi.fn()

  render(<LoginForm onSubmit={onSubmit} />)

  await user.type(screen.getByLabelText(/email/i), 'user@example.com')
  await user.type(screen.getByLabelText(/password/i), 'password123')
  await user.click(screen.getByRole('button', { name: /submit/i }))

  expect(onSubmit).toHaveBeenCalledWith({
    email: 'user@example.com',
    password: 'password123',
  })
})
```

### Async Components with MSW

Mock Service Worker provides realistic API mocking for both Browser Mode and Node-based test environments. The example below uses `setupServer` for jsdom or happy-dom tests. For Browser Mode, use `setupWorker` in a browser-specific setup file.

```bash
npm install -D msw
```

```typescript
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { render, screen, waitFor } from '@testing-library/react'
import { beforeAll, afterEach, afterAll, it, expect } from 'vitest'

const server = setupServer(
  http.get('/api/users/:id', ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      name: 'Alice',
      email: 'alice@example.com',
    })
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

it('loads and displays user data', async () => {
  render(<UserProfile userId="123" />)

  expect(screen.getByText(/loading/i)).toBeInTheDocument()

  await waitFor(() => {
    expect(screen.getByText(/alice/i)).toBeInTheDocument()
  })
})

it('handles API errors', async () => {
  server.use(
    http.get('/api/users/:id', () => {
      return HttpResponse.json({ error: 'Not found' }, { status: 404 })
    })
  )

  render(<UserProfile userId="999" />)

  await waitFor(() => {
    expect(screen.getByText(/error/i)).toBeInTheDocument()
  })
})
```

### Testing Hooks

```typescript
import { renderHook, act } from '@testing-library/react'
import { it, expect } from 'vitest'

it('increments counter', () => {
  const { result } = renderHook(() => useCounter())

  expect(result.current.count).toBe(0)

  act(() => {
    result.current.increment()
  })

  expect(result.current.count).toBe(1)
})
```

### Testing Context Providers

```typescript
it('toggles theme', async () => {
  const user = userEvent.setup()

  render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>
  )

  const button = screen.getByRole('button', { name: /toggle theme/i })
  expect(button).toHaveTextContent('Light')

  await user.click(button)

  expect(button).toHaveTextContent('Dark')
})
```

### Custom Render with Providers

```typescript
// tests/utils.tsx
import { render, RenderOptions } from '@testing-library/react'
import { ReactElement } from 'react'
import { ThemeProvider } from './ThemeProvider'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

function customRender(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    ),
    ...options,
  })
}

export * from '@testing-library/react'
export { customRender as render }
```

## Vue Testing

### Setup

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
})
```

### Basic Vue Component Test

```typescript
import { render, screen } from '@testing-library/vue'
import { describe, it, expect } from 'vitest'
import Button from './Button.vue'
import UserCard from './UserCard.vue'

describe('Button', () => {
  it('renders with slot content', () => {
    render(Button, { slots: { default: 'Click me' } })
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument()
  })

  it('emits click event', async () => {
    const { emitted } = render(Button)
    await screen.getByRole('button').click()
    expect(emitted()).toHaveProperty('click')
  })

  it('displays props', () => {
    render(UserCard, { props: { user: { name: 'Alice', email: 'alice@example.com' } } })
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })
})
```

### Testing Composables

```typescript
import { defineComponent } from 'vue'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'

it('increments counter', async () => {
  const user = userEvent.setup()

  const CounterHarness = defineComponent({
    setup() {
      return useCounter()
    },
    template: '<button @click="increment">{{ count }}</button>',
  })

  render(CounterHarness)

  expect(screen.getByRole('button')).toHaveTextContent('0')
  await user.click(screen.getByRole('button'))
  expect(screen.getByRole('button')).toHaveTextContent('1')
})
```

## Query Priority (Testing Library)

Use queries in this order (most accessible first):

| Priority | Query | Use Case |
|----------|-------|----------|
| 1 | `getByRole` | Buttons, links, headings, etc. |
| 2 | `getByLabelText` | Form inputs |
| 3 | `getByPlaceholderText` | Inputs without labels |
| 4 | `getByText` | Non-interactive text |
| 5 | `getByDisplayValue` | Current input values |
| 6 | `getByAltText` | Images |
| 7 | `getByTitle` | Title attributes |
| 8 | `getByTestId` | **Last resort** — no accessible role |

### Query Variants

```typescript
// Throws if not found (default for assertions)
screen.getByRole('button')

// Returns null if not found (use for "not in document" assertions)
screen.queryByText(/optional/i)
expect(screen.queryByText(/optional/i)).not.toBeInTheDocument()

// Waits for element to appear (async)
await screen.findByText(/loaded/i)

// Wait for specific condition
await waitFor(() => {
  expect(screen.getByText(/success/i)).toBeInTheDocument()
})
```

## Testing Accessibility

```typescript
it('has proper ARIA attributes', () => {
  render(<Dialog open />)
  const dialog = screen.getByRole('dialog')
  expect(dialog).toHaveAttribute('aria-modal', 'true')
})

it('has accessible name', () => {
  render(<Button aria-label="Close dialog">×</Button>)
  expect(screen.getByLabelText(/close dialog/i)).toBeInTheDocument()
})

it('supports keyboard navigation', async () => {
  const user = userEvent.setup()
  render(<DropdownMenu />)

  await user.tab()
  expect(screen.getByRole('button')).toHaveFocus()

  await user.keyboard('{Enter}')
  expect(screen.getByRole('menu')).toBeVisible()
})
```

## Testing Router Components

```typescript
import { MemoryRouter } from 'react-router-dom'

it('navigates to profile page', async () => {
  const user = userEvent.setup()

  render(
    <MemoryRouter initialEntries={['/']}>
      <App />
    </MemoryRouter>
  )

  await user.click(screen.getByRole('link', { name: /profile/i }))
  expect(screen.getByRole('heading', { name: /profile/i })).toBeInTheDocument()
})
```

## Testing with React Query

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

it('fetches and displays data', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <UserList />
    </QueryClientProvider>
  )

  await waitFor(() => {
    expect(screen.getByText(/alice/i)).toBeInTheDocument()
  })
})
```

## Snapshot Testing Components

```typescript
it('matches snapshot', () => {
  const { container } = render(<Card title="Test">Content</Card>)
  expect(container.firstChild).toMatchSnapshot()
})
```

> **Tip**: Prefer explicit assertions over snapshots. Snapshots are useful for detecting unintended changes, but assertions describe expected behavior.

## Visual Regression Testing (v4)

Vitest 4 adds built-in visual regression testing in Browser Mode:

```typescript
import { expect, test } from 'vitest'
import { page } from 'vitest/browser'

test('hero section looks correct', async () => {
  // ... render component ...

  // Capture and compare screenshot against baseline
  await expect(page.getByTestId('hero')).toMatchScreenshot('hero-section')
})

test('element is in viewport', async () => {
  await expect.element(page.getByText('Welcome')).toBeInViewport()
  await expect.element(page.getByText('Footer')).toBeInViewport({ ratio: 0.5 })
})
```

## Debugging

### Browser Mode

- Set `headless: false` in config to see the browser
- Use F12 / right-click → Inspect for dev tools
- Set breakpoints in test or component code

### Testing Library

```typescript
import { screen } from '@testing-library/react'

it('debugs element queries', () => {
  render(<LoginForm />)

  // Print the DOM tree for debugging
  screen.debug()

  // Narrow to specific element
  screen.debug(screen.getByRole('form'))
})
```

### Browser Mode Debugging

```typescript
it('debugs with Browser Mode', async () => {
  await render(<LoginForm />)

  // List all buttons for debugging
  const buttons = await page.getByRole('button').all()
  for (const btn of buttons) {
    const element = await btn.element()
    console.log('Button:', element?.textContent)
  }

  // v4: locators expose .length for toHaveLength
  await expect.element(page.getByText('Item')).toHaveLength(3)

  // Use .or() for alternative queries
  const submit = page
    .getByRole('button', { name: /submit/i })
    .or(page.getByTestId('submit-button'))

  await expect.element(submit).toBeVisible()
})
```

## Best Practices

1. **Query by role**: Use accessibility-focused queries first
2. **Use `userEvent`**: More realistic than `fireEvent` (includes hover, focus)
3. **Test behavior, not implementation**: Focus on what users see and do
4. **Wait for async**: Use `waitFor`, `findBy`, or `expect.element` (Browser Mode)
5. **Custom render utilities**: Wrap providers for reuse
6. **Mock external services**: Use MSW for HTTP mocking
7. **Test accessibility**: Verify ARIA attributes, roles, keyboard nav
8. **One behavior per test**: Keep tests focused and readable
9. **Avoid `getByTestId`**: Only as last resort when no accessible query works
10. **Clean up**: Testing Library cleanup should run after each test. If your environment does not auto-register cleanup, add `afterEach(() => cleanup())` in the setup file.
