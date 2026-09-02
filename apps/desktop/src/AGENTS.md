---
description: 
alwaysApply: false
---

---
description: 
alwaysApply: false
---

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

See **[Locator Strategy & `data-testid` Conventions](../../../docs/LOCATOR_STRATEGY.md)** for the full priority hierarchy, naming conventions, mandatory rules, and verification snippets.

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

See **[Locator Strategy & `data-testid` Conventions](../../../docs/LOCATOR_STRATEGY.md)** for the full locator priority table.

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

### Local LLM Chat & Semantic Search

Chat and Library semantic mode talk to Rust through typed wrappers in `src/api/llm.ts`. Types live in `src/types/llm.ts`. Do not `invoke` these commands with ad-hoc argument shapes.

**Provisioning UI (Chat):** `ChatPanel` (`data-testid="chat-panel"`) shows `ChatProvisioningPrompt` (`chat-provisioning-empty-state`) when `canSendChat(llm.status)` is false (`status` is not `ready` or `loaded`). Required actions:

| Action | Test id |
| ------ | ------- |
| Download TinyLlama | `chat-llm-download-button` |
| Side-load TinyLlama | `chat-llm-import-button` |
| Download embeddings (optional for chat) | `chat-embeddings-download-button` |
| Side-load embeddings | `chat-embeddings-import-button` |
| Retry after classified error | `chat-provisioning-retry-button` |

Download progress uses `ModelDownloadModal` (`model-download-modal`) subscribed to `llm://download-progress` / `embeddings://download-progress` with camelCase `{ bytesDownloaded, totalBytes }`. Chat can be used without the embedding model (FTS-only RAG). Embeddings are required only for Library semantic mode.

**Streaming hook:** Use `useLlmStream(streamId)` from `src/hooks/useLlmStream.ts`. Public state: `{ response, isGenerating, error, grounding, cancelled, timedOut, cancel }`.

Rules:
1. The frontend generates `streamId` via `createStreamId()` in `chatUtils.ts` (`chat-${Date.now()}-...`). Never let the backend mint it.
2. Set `streamId` in React state **before** calling `startLlmChat`, so `useLlmStream` subscribes to `llm://token/<id>` and `llm://done/<id>` first. `useChatSession` already does this with a pending-request effect — copy that order; do not invoke then subscribe.
3. Listen through `src/api/llmEvents.ts`, not a raw `@tauri-apps/api/event` import. Production and the Playwright harness share that adapter.
4. Cancel with `cancel()` on the hook (calls `llm_cancel_generation`). Keep the partial assistant bubble visible.
5. Chat history is session-only (in-memory). Do not persist transcripts.

**Library semantic empty-state:** When Library mode is `semantic`, call `embeddings_status` and `deriveSemanticAvailability(mode, embeddingsState)` from `ui/library/librarySemantic.ts`. Render `LibrarySemanticProvisioning` instead of a result list unless availability is `ready`. `cosineDistance` stays in `SemanticSearchResult` but must not be shown in the Library UI.

| Availability | Test id | User meaning |
| ------------ | ------- | ------------ |
| `notProvisioned` | `library-semantic-provisioning-state` | Empty state with `library-embeddings-download-button` and `library-embeddings-import-button` |
| `downloading` | `library-semantic-downloading-state` | In progress; modal `library-embeddings-download-modal` |
| `initializing` | `library-semantic-initializing-state` | Model present, not ready to search |
| `error` | `library-semantic-error-state` | Failure with retry; not a broken hit list |
| `ready` | (normal Library results) | `canRunSemanticSearch` is true |

Keyword mode always returns `"keyword"` from `deriveSemanticAvailability` and must not show the semantic empty state.

**IPC wrappers to reuse** (`src/api/llm.ts`): `getLlmStatus`, `downloadLlmModel`, `importLlmModelFile`, `cancelLlmDownload`, `cancelLlmGeneration`, `startLlmChat`, `getEmbeddingsStatus`, `downloadEmbeddingsModel`, `importEmbeddingsModelFile`, `cancelEmbeddingsDownload`, `searchSpellsSemantic`, `reindexEmbeddings`.

**Settings reindex:** `SettingsPage` renders `EmbeddingsReindexSection` (`settings-embeddings-section`). Buttons call `reindexEmbeddings(false)` (`settings-reindex-missing-button`) and `reindexEmbeddings(true)` (`settings-reindex-all-button`). Subscribe to `embeddings://reindex-progress` with `useReindexProgress` (camelCase `{ current, total }`). Disable both buttons unless `embeddings_status.state === "ready"`. Do not display `cosineDistance`. Chat and Library remain the provisioning surfaces; Settings does not add download/import actions.

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
- See `apps/desktop/tests/AGENTS.md` for E2E testing guidelines and patterns.

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [ARIA Labels Guide](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-label)
- [Semantic HTML](https://developer.mozilla.org/en-US/docs/Glossary/Semantics#semantics_in_html)

### 7. Linting & Compliance

Follow these guidelines to keep the codebase clean and accessible.

#### 7.1 Global Types & Window
**NEVER** use `(window as any)` to access global properties. Instead, extend the `Window` interface in `src/globals.d.ts`.

**❌ Avoid:**
```typescript
if ((window as any).__IS_PLAYWRIGHT__) { ... }
```

**✅ Good:**
```typescript
// src/globals.d.ts
export {};
declare global {
  interface Window {
    __IS_PLAYWRIGHT__?: boolean;
  }
}

// In code
if (window.__IS_PLAYWRIGHT__) { ... }
```

#### 7.2 Accessibility (A11y)
- **SVGs**: Icons must have `role="img"` and a descriptive `aria-label`.
- **Buttons**: All buttons must have an explicit `type` attribute (usually `type="button"` to prevent form submission).

**✅ Good:**
```tsx
<button type="button" aria-label="Save">
  <svg role="img" aria-label="Save Icon" ... />
</button>
```

#### 7.3 React Best Practices
- **Self-Closing Tags**: Use `<div />` instead of `<div></div>` for elements without children.
- **Keys**: Avoid using array indices as keys. Use unique IDs or stable composite keys (e.g., `${className}-${level}`).

#### 7.4 Common Linting Rules
- **Node.js Imports**: Always use the `node:` protocol for builtin modules.
  - ✅ `import * as fs from 'node:fs';`
  - ❌ `import * as fs from 'fs';`
- **No `any`**: Avoid using `any` type. Use `unknown` with narrowing or definite types.

## 8. Testing Patterns

### 8.1 Snapshot Testing (JSON/Data)
For complex data exports (like Character JSON), prefer **Snapshot Testing** over manual assertion of every field. This ensures backward compatibility and detects structural regressions.

**✅ Good:**
```typescript
const content = await app.exportCharacter("Raistlin", "json");
const json = JSON.parse(content);

// Sanitize non-deterministic fields
const safeJson = {
  ...json,
  id: "REDACTED",
  createdAt: "REDACTED"
};

// Assert against stored snapshot
expect(JSON.stringify(safeJson, null, 2)).toMatchSnapshot("character-export.json");
```

### 8.2 Master Workflows
Use "Master Workflow" tests (`tests/character_master_workflow.spec.ts`) as comprehensive smoke tests that cover the full user journey (Create -> Edit -> Search -> Export -> Delete). These tests verify the integration of multiple features.

### 8.3 Waiting for Async Operations
Avoid fixed sleeps. Use explicit waits for UI state changes:

**✅ Good:**
```typescript
await app.getClassLevelInput("Mage").blur();
// Wait for specific side-effect if not immediate
await page.waitForResponse(resp => resp.url().includes("update_character_class_level"));
// OR wait for UI update
await expect(page.getByText("Level 5")).toBeVisible();
```

For chat streaming, wait on visible bubbles or harness observations, never `sleep`. Subscribe (`streamId` set) before `startLlmChat`. Token and done events are `llm://token/<streamId>` and `llm://done/<streamId>`.
