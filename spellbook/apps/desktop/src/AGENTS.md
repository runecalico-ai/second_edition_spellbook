# UI Component Development Guidelines for E2E Testing

This document provides guidelines for frontend developers to make UI components easily testable with Playwright E2E tests.

## Core Principle: Make Elements Discoverable

The easier it is to find and interact with UI elements in tests, the more reliable and maintainable your tests will be.

## Best Practices

### 1. Use `data-testid` Attributes

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

### 4. When to Add `data-testid`

Add `data-testid` when:

- ✅ The element is **interactive** (buttons, inputs, links)
- ✅ The element contains **dynamic content** that tests need to verify
- ✅ The element is **difficult to locate** using semantic selectors (role, label, text)
- ✅ Multiple similar elements exist and you need to target a specific one

Don't add `data-testid` when:

- ❌ The element is purely decorative
- ❌ The element can be easily found using semantic selectors
- ❌ It's a one-off element with unique, stable text content

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

### 6. Avoid Brittle Selectors

**❌ Brittle (avoid):**
```typescript
page.locator('div').filter({ has: page.locator('input') }).first()
page.locator('.flex.items-center.gap-4 > div:nth-child(2)')
```

**✅ Robust (prefer):**
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

- [ ] Interactive elements have `data-testid` or semantic attributes
- [ ] Input validation works with direct input (not just UI buttons)
- [ ] Dynamic content containers have stable identifiers
- [ ] ARIA labels are present for icon-only buttons
- [ ] Form inputs have associated labels

## Resources

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [ARIA Labels Guide](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-label)
- [Semantic HTML](https://developer.mozilla.org/en-US/docs/Glossary/Semantics#semantics_in_html)

## Questions?

See `spellbook/apps/desktop/tests/AGENTS.md` for E2E testing guidelines and patterns.
