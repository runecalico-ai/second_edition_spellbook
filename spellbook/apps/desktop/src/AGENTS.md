# UI Component Development Guidelines for E2E Testing

This document provides guidelines for frontend developers to make UI components easily testable with Playwright E2E tests.

## Core Principle: Make Elements Discoverable

The easier it is to find and interact with UI elements in tests, the more reliable and maintainable your tests will be.

## Best Practices

### 1. Tauri IPC & Casing
Tauri bridges the gap between Rust and JavaScript by automatically converting parameter names.

- **Command Arguments**: When using `invoke`, you **must** use `camelCase` for the argument keys, even if the Rust function uses `snake_case`.
- **Return Values**: Backend models should be configured with `#[serde(rename_all = "camelCase")]`. Always expect and use `camelCase` properties in the frontend.

**✅ Good:**
```typescript
await invoke("create_character", {
  name: "Raistlin",
  characterType: "PC", // camelCase
});
```

**❌ Avoid:**
```typescript
await invoke("create_character", {
  name: "Raistlin",
  character_type: "PC", // snake_case will fail to match backend parameters
});
```

> [!TIP]
> **Type Safety Best Practice**: Always define TypeScript interfaces that match your Rust structs. If you use `#[serde(rename_all = "camelCase")]` on the backend, your interfaces should use the same `camelCase` properties to ensure end-to-end type safety and catch errors during development.
>
> ```typescript
> // Match this to your Rust 'Character' struct
> interface Character {
>   id: number;
>   characterType: string;
>   notes?: string;
> }
> ```

### 2. Use `data-testid` Attributes

Add `data-testid` attributes to interactive elements and important containers. This is the **most reliable** way to locate elements in tests.

**✅ Good:**
```tsx
<button data-testid="save-button" onClick={handleSave}>
  Save
</button>

<input
  type="number"
  data-testid="class-level-input"
  value={level}
  onChange={handleChange}
/>

<div data-testid="class-row">
  <h4>{className}</h4>
</div>
```

**❌ Avoid:**
```tsx
<button className="btn-primary" onClick={handleSave}>
  Save
</button>

<input type="number" value={level} onChange={handleChange} />

<div className="flex items-center">
  <h4>{className}</h4>
</div>
```

### 2. Use Semantic HTML and ARIA Labels

Proper semantic HTML and ARIA labels make elements accessible to both users and tests.

**✅ Good:**
```tsx
<label htmlFor="character-name">Name</label>
<input id="character-name" aria-label="Character Name" />

<button aria-label="Delete character">
  <TrashIcon />
</button>
```

**❌ Avoid:**
```tsx
<div>Name</div>
<input />

<div onClick={handleDelete}>
  <TrashIcon />
</div>
```

### 3. Naming Conventions for `data-testid`

Use descriptive, kebab-case names that clearly indicate what the element is:

- **Buttons**: `{action}-button` (e.g., `save-button`, `delete-button`)
- **Inputs**: `{field}-input` (e.g., `class-level-input`, `character-name-input`)
- **Containers**: `{content}-row`, `{content}-section` (e.g., `class-row`, `abilities-section`)
- **Modals/Dialogs**: `{name}-modal`, `{name}-dialog` (e.g., `confirm-modal`, `spell-picker`)

### 4. When to Add `data-testid` (MANDATORY)

> [!CRITICAL]
> **ALL interactive elements MUST have `data-testid` attributes.** This is non-negotiable for automated testing.

**ALWAYS add `data-testid` for:**

- ✅ **ALL buttons** (save, delete, cancel, submit, etc.)
- ✅ **ALL form inputs** (text, number, checkbox, select, etc.)
- ✅ **ALL links** that trigger navigation or actions
- ✅ **Dynamic content containers** (rows, cards, panels with changing data)
- ✅ **Interactive list items** (selectable, clickable, draggable)
- ✅ **Modals and dialogs** (the container and action buttons)

**Only skip `data-testid` when:**

- ❌ The element is purely decorative (no interaction, no assertions needed)
- ❌ The element is a one-time static heading with unique text
- ❌ Using semantic `role` + text is more stable (e.g., `<button>Save</button>` with unique text)

### 5. Input Validation and Testing

When implementing input validation (e.g., preventing negative numbers), ensure the validation works with **both** user interactions:

1. **Direct input** (typing/pasting values)
2. **UI controls** (buttons, arrow keys)

**Example:**
```tsx
<input
  type="number"
  data-testid="class-level-input"
  value={level}
  onChange={(e) => {
    const val = Number.parseInt(e.target.value, 10);
    // Validate and clamp the value
    updateLevel(Number.isNaN(val) ? 0 : Math.max(0, val));
  }}
/>
```

This allows tests to verify validation by simply filling the input:
```typescript
await levelInput.fill("-1");
await expect(levelInput).toHaveValue("0"); // Clamped to 0
```

### 6. Locator Priority Hierarchy

When writing Playwright tests, use locators in this priority order:

| Priority | Method | Example | When to Use |
|----------|--------|---------|-------------|
| **1** | `getByTestId()` | `page.getByTestId('save-button')` | Interactive elements, dynamic content |
| **2** | `getByRole()` | `page.getByRole('button', { name: 'Save' })` | Semantic HTML with clear roles |
| **3** | `getByLabel()` | `page.getByLabel('Character Name')` | Form inputs with labels |
| **4** | `getByPlaceholder()` | `page.getByPlaceholder('Search...')` | Inputs with placeholders |
| **5** | `getByText()` | `page.getByText('Fireball')` | Unique static text |
| **6** | `locator()` CSS | `page.locator('.modal')` | Last resort only |

**❌ Avoid brittle CSS selectors:**
```typescript
page.locator('div').filter({ has: page.locator('input') }).first()
page.locator('.flex.items-center.gap-4 > div:nth-child(2)')
```

**✅ Use robust, semantic locators:**
```typescript
page.getByTestId('class-row')
page.getByLabel('Character Name')
page.getByRole('button', { name: 'Save' })
```

## Common Patterns

### Interactive Lists/Rows

```tsx
{items.map((item) => (
  <div key={item.id} data-testid="class-row">
    <h4>{item.name}</h4>
    <input
      type="number"
      data-testid="class-level-input"
      value={item.level}
    />
    <button data-testid="remove-class-button">Remove</button>
  </div>
))}
```

**Test usage:**
```typescript
const classRow = page.getByTestId('class-row').filter({ hasText: 'Druid' });
const levelInput = classRow.getByTestId('class-level-input');
```

### Modals/Dialogs

```tsx
<dialog data-testid="confirm-modal" open={isOpen}>
  <h2>{title}</h2>
  <p>{message}</p>
  <button data-testid="confirm-button" onClick={onConfirm}>
    Confirm
  </button>
  <button data-testid="cancel-button" onClick={onCancel}>
    Cancel
  </button>
</dialog>
```

### Forms

```tsx
<form data-testid="character-form">
  <label htmlFor="char-name">Name</label>
  <input
    id="char-name"
    data-testid="character-name-input"
    value={name}
  />

  <button type="submit" data-testid="save-character-button">
    Save
  </button>
</form>
```

## Testing Checklist

Before committing UI changes, verify:

- [ ] **`data-testid` attributes**: ALL interactive elements have `data-testid` attributes
- [ ] **Input validation**: Works with direct input (typing), not just UI controls (buttons)
- [ ] **Dynamic containers**: Have stable, descriptive `data-testid` identifiers
- [ ] **ARIA labels**: Present for icon-only buttons and screenreader accessibility
- [ ] **Form labels**: All inputs have associated `<label>` elements
- [ ] **Verify in browser**: Open the component and check for `data-testid` in DevTools

### Pre-Test Verification (For AI Agents)

If you're writing tests for new UI elements, verify they can be located:

```typescript
// Check element exists
const count = await page.getByTestId('new-element-id').count();
console.log(`Found ${count} elements (should be 1)`);

// List all available testids
const testIds = await page.locator('[data-testid]').evaluateAll(
  nodes => nodes.map(n => n.getAttribute('data-testid'))
);
console.log('Available testids:', testIds);
```

## Resources

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [ARIA Labels Guide](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-label)
- [Semantic HTML](https://developer.mozilla.org/en-US/docs/Glossary/Semantics#semantics_in_html)

## Questions?

See `spellbook/apps/desktop/tests/AGENTS.md` for E2E testing guidelines and patterns.
