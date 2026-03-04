# Locator Strategy & `data-testid` Conventions

Shared reference for both **frontend component authors** and **E2E test writers**.

## Locator Priority Hierarchy

When locating elements in Playwright tests, follow this priority order:

| Priority | Method | Use Case | Example |
|----------|--------|----------|---------|
| **1** | `getByTestId()` | Interactive elements, dynamic content | `page.getByTestId('save-button')` |
| **2** | `getByRole()` | Semantic HTML elements | `page.getByRole('button', { name: 'Save' })` |
| **3** | `getByLabel()` | Form fields with labels | `page.getByLabel('Tags')` |
| **4** | `getByPlaceholder()` | Inputs with placeholders | `page.getByPlaceholder('Components (V,S,M)')` |
| **5** | `getByText()` | Unique static text | `page.getByText('Fireball')` |
| **6** | `locator()` with CSS | Last resort only | `page.locator('.modal')` |

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

---

## `data-testid` Naming Conventions

Use descriptive, kebab-case names that clearly indicate what the element is:

- **Buttons**: `{action}-button` (e.g., `save-button`, `delete-button`)
- **Inputs**: `{field}-input` (e.g., `class-level-input`, `character-name-input`)
- **Containers**: `{content}-row`, `{content}-section` (e.g., `class-row`, `abilities-section`)
- **Modals/Dialogs**: `{name}-modal`, `{name}-dialog` (e.g., `confirm-modal`, `spell-picker`)

---

## When to Add `data-testid` (MANDATORY)

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

---

## Verifying Elements in Tests

When writing tests for new UI elements, verify they can be located:

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
