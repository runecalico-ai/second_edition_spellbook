# Chunk 3: Library Presentation, Hash UX, and Empty States — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the spell hash display as a card with 16-char truncation, theme-aware classes, and an accessible copy action; replace the single "No spells found" placeholder with three distinct empty states (empty library, empty search, empty character spellbook); and remove all hardcoded dark-only classes from touched surfaces.

**Architecture:** A new shared `EmptyState` component provides the common heading + description + CTA skeleton used by all three empty states. The hash display in `SpellEditor` is retouched in-place (no new file). Library and SpellbookBuilder consume `EmptyState` directly. A `hasActiveFilters` derived boolean in `Library` selects between the library-empty and search-empty variants. The toast system (already rendering inside `<output aria-live="polite">`) serves as both the visual confirmation and the polite live-region announcement for hash copy.

**Tech Stack:** React 18 + TypeScript, Tailwind CSS (`dark:` class prefix, `darkMode: 'class'`), Vitest + React Testing Library for unit tests, Playwright for E2E (E2E added in Chunk 6). IPC via `@tauri-apps/api/core` `invoke`. Zustand notification store (`useNotifications`) already exists.

---

## Spec Cross-Reference Note

> `tasks.md` line 128 reads "Copy is defined in design.md Decision 16." That is a numbering error — the correct section is **design.md Decision 15 (Empty State Skeleton)**. All copy in this plan is taken from Decision 15.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| **Create** | `apps/desktop/src/ui/components/EmptyState.tsx` | Shared heading + description + CTA skeleton |
| **Modify** | `apps/desktop/src/ui/SpellEditor.tsx` | Hash card restyle: 16-char, no `title`, `aria-label`, theme-aware |
| **Modify** | `apps/desktop/src/ui/Library.tsx` | `hasActiveFilters` + empty-library / empty-search states |
| **Modify** | `apps/desktop/src/ui/SpellbookBuilder.tsx` | Empty character spellbook state |
| **Modify** | `apps/desktop/src/ui/Library.test.tsx` | Add unit tests for both Library empty states |
| **Modify** | `apps/desktop/src/ui/SpellEditor.test.tsx` | Add unit tests for hash display changes |
| **Create** | `apps/desktop/src/ui/SpellbookBuilder.test.tsx` | Unit tests for empty character spellbook state |

> **No barrel file:** `apps/desktop/src/ui/components/` has no `index.ts`. Import `EmptyState` via the direct file path. Do not create a barrel.

---

## Pre-flight: Understand the test runner

Before writing tests, confirm how unit tests are run:

Read `apps/desktop/package.json` and look for the `scripts` section. All unit test run commands in this plan use:

```bash
cd apps/desktop && pnpm test:unit --run
```

This workspace exposes unit tests through `test:unit`, not `test`.

---

## Task 1: EmptyState shared component

**Files:**
- Create: `apps/desktop/src/ui/components/EmptyState.tsx`

**Heading level:** `EmptyState` accepts a `headingLevel` prop so each consuming page can match its heading hierarchy. Before rendering, verify the heading level of each consuming page (`Library.tsx`, `SpellbookBuilder.tsx`) and choose the correct level. Both pages currently use an `<h1>` page heading, so the empty state heading should be `<h2>`. If either page is refactored and the `<h1>` is removed, adjust accordingly.

- [x] **Step 1.1: Write the component**

```tsx
// apps/desktop/src/ui/components/EmptyState.tsx
import type { ReactNode } from "react";

interface EmptyStateProps {
  heading: string;
  description: string;
  headingLevel?: "h1" | "h2" | "h3" | "h4" | "h5" | "h6"; // default "h2"; use "h3" if the page already uses h2 for sections
  children?: ReactNode; // CTA buttons / links
  testId?: string; // defaults to "empty-state"
  announce?: boolean;
}

export function EmptyState({
  heading,
  description,
  headingLevel: Heading = "h2",
  children,
  testId = "empty-state",
  announce = true,
}: EmptyStateProps) {
  return (
    <div
      role={announce ? "status" : undefined}
      className="flex flex-col items-center justify-center py-16 text-center gap-4"
      data-testid={testId}
    >
      <Heading className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        {heading}
      </Heading>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-sm">
        {description}
      </p>
      {children && (
        <div className="flex gap-3 flex-wrap justify-center">{children}</div>
      )}
    </div>
  );
}
```

- [x] **Step 1.2: Commit**

```bash
git add apps/desktop/src/ui/components/EmptyState.tsx
git commit -m "feat: add EmptyState shared component for empty-library, empty-search, and empty-spellbook states"
```

---

## Task 2: Hash display restyle in SpellEditor

**Files:**
- Modify: `apps/desktop/src/ui/SpellEditor.tsx` (find the hash block by searching for `spell-detail-hash-display`)
- Modify: `apps/desktop/src/ui/SpellEditor.test.tsx`

**Live-region note:** The copy button calls `pushNotification("success", "Hash copied to clipboard.")`. The `NotificationViewport` renders inside `<output aria-live="polite">` (established in Chunk 1). This satisfies the polite live-region announcement requirement from `tasks.md` Chunk 3 line 121. No additional live-region mechanism is needed for hash copy.

**Loading boundary note:** The hash display is only rendered when `!isNew && form.contentHash`. This is a data-presence gate, not a loading state. If the spell loads fast (imperceptible), the hash renders immediately on load. If the load is perceptible (e.g., a slow IPC call), the existing `isNew` / `form.contentHash` gate already prevents a partially-rendered hash card from flickering — no loading spinner should be added here. This satisfies the spec's two-part loading boundary requirement: (1) no flickering indicator, and (2) if load is perceptible, the content is withheld until the data is ready (the existing conditional already achieves this).

The existing hash block has two `// TODO(chunk-3)` comments on the buttons — these will be removed as part of this task.

### Step 2.1: Write failing tests

- [x] **Step 2.1: Add hash display describe block to SpellEditor.test.tsx**

The existing test file uses a `renderEditSpell(spellData)` helper (or similar) and `baseLoadedSpell(overrides)` factory for test data. Find the existing factory/helper and confirm its shape. Then:

1. Add `contentHash` to `baseLoadedSpell`'s override mechanism. If `baseLoadedSpell` is a function that accepts partial overrides, call it as `baseLoadedSpell({ contentHash: HASH_FIXTURE })`. If it is a plain object, add the field manually for the test fixture. The `contentHash` field holds a hex string — use a 64-character hex string as the fixture value.

2. Add a `describe("hash display")` block. Use a `beforeEach` inside the describe to render the editor with the hash fixture — **each `it` block depends on the `beforeEach` render**. Do NOT share DOM state across `it` blocks without a fresh `beforeEach` render; Vitest cleans up the DOM between tests.

```tsx
const HASH_FIXTURE = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

describe("hash display", () => {
  beforeEach(async () => {
    // Use the same invoke mock pattern as the outer beforeEach, but override
    // the load_spell (or equivalent) response to include contentHash.
    // Model this on the existing renderEditSpell setup in the file.
    // Example — adjust to match the actual helper signature:
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "load_spell" || cmd === "get_spell") {
        return baseLoadedSpell({ contentHash: HASH_FIXTURE });
      }
      // ... delegate other commands to the outer mock or return defaults
      return undefined;
    });
    await renderEditSpell(/* existing spell id fixture */);
  });

  it("shows 16 characters in the collapsed state", () => {
    const codeEl = screen.getByTestId("spell-detail-hash-display");
    expect(codeEl.textContent).toBe(`${HASH_FIXTURE.slice(0, 16)}...`);
  });

  it("does NOT have a title attribute on the hash code element", () => {
    const codeEl = screen.getByTestId("spell-detail-hash-display");
    expect(codeEl).not.toHaveAttribute("title");
  });

  it("shows the full hash after clicking Expand", () => {
    const expandBtn = screen.getByTestId("spell-detail-hash-expand");
    fireEvent.click(expandBtn);
    const codeEl = screen.getByTestId("spell-detail-hash-display");
    expect(codeEl.textContent).toBe(HASH_FIXTURE);
  });

  it("copy button triggers a success toast inside the notification live region without opening a modal dialog", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const copyBtn = screen.getByTestId("spell-detail-hash-copy");
    fireEvent.click(copyBtn);

    // Confirm clipboard was called with the full hash
    expect(writeText).toHaveBeenCalledWith(HASH_FIXTURE);
    // Confirm non-modal feedback is shown through the toast/live-region path
    expect(screen.queryByRole("dialog")).toBeNull();
    const viewport = screen.getByTestId("notification-viewport");
    expect(await within(viewport).findByText("Hash copied to clipboard.")).toBeInTheDocument();
    expect(viewport.closest("output[aria-live='polite']")).not.toBeNull();
  });

  it("copy button triggers an error toast inside the notification live region when clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard failed"));
    Object.assign(navigator, { clipboard: { writeText } });

    fireEvent.click(screen.getByTestId("spell-detail-hash-copy"));

    expect(writeText).toHaveBeenCalledWith(HASH_FIXTURE);
    expect(screen.queryByRole("dialog")).toBeNull();
    const viewport = screen.getByTestId("notification-viewport");
    expect(await within(viewport).findByText("Failed to copy hash.")).toBeInTheDocument();
    expect(viewport.closest("output[aria-live='polite']")).not.toBeNull();
  });
});
```

- [x] **Step 2.2: Run tests - expect failures**

```bash
cd apps/desktop && pnpm test:unit --run -- SpellEditor
```

Expected: The hash describe tests fail — current code shows 8 chars and still has `title`.

### Step 2.2: Implement hash display changes in SpellEditor.tsx

- [x] **Step 2.3: Implement hash display changes**

Find the hash block by searching for `spell-detail-hash-display` in `SpellEditor.tsx`. Replace the entire block with:

```tsx
{!isNew && form.contentHash && (
  <div
    className="p-3 rounded-lg border bg-neutral-100 border-neutral-300 dark:bg-neutral-800 dark:border-neutral-700"
    data-testid="spell-detail-hash-card"
  >
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
        Content hash:
      </span>
      <code
        className="px-2 py-0.5 rounded border bg-white border-neutral-300 text-neutral-700 font-mono text-xs dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-300"
        data-testid="spell-detail-hash-display"
      >
        {hashExpanded ? form.contentHash : `${form.contentHash.slice(0, 16)}...`}
      </code>
      <button
        type="button"
        aria-label="Copy content hash"
        data-testid="spell-detail-hash-copy"
        disabled={savePending}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(form.contentHash ?? "");
            // pushNotification routes through NotificationViewport (<output aria-live="polite">),
            // satisfying both the visual toast and the polite live-region announcement requirements.
            pushNotification("success", "Hash copied to clipboard.");
          } catch {
            pushNotification("error", "Failed to copy hash.");
          }
        }}
        className="px-2 py-1 text-xs rounded border bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        Copy
      </button>
      <button
        type="button"
        aria-label={hashExpanded ? "Collapse content hash" : "Expand content hash"}
        data-testid="spell-detail-hash-expand"
        disabled={savePending}
        onClick={() => setHashExpanded((e) => !e)}
        className="px-2 py-1 text-xs rounded border bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-900 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {hashExpanded ? "Collapse" : "Expand"}
      </button>
    </div>
  </div>
)}
```

Key changes from the old block:
- Outer card wrapper: `p-3 rounded-lg border bg-neutral-100 border-neutral-300 dark:bg-neutral-800 dark:border-neutral-700`
- `<code>` truncation: `.slice(0, 16)` (was 8)
- `<code>` loses `title={form.contentHash}` entirely
- Copy button gains `aria-label="Copy content hash"` ("Copy" alone is ambiguous for AT users)
- Expand/Collapse button gains dynamic `aria-label` ("Expand content hash" / "Collapse content hash")
- All buttons use theme-aware light+dark classes
- Both `// TODO(chunk-3)` comments are removed

- [x] **Step 2.4: Run tests - expect pass**

```bash
cd apps/desktop && pnpm test:unit --run -- SpellEditor
```

Expected: All hash describe tests pass. All pre-existing tests pass.

- [x] **Step 2.5: Commit**

```bash
git add apps/desktop/src/ui/SpellEditor.tsx apps/desktop/src/ui/SpellEditor.test.tsx
git commit -m "feat(chunk-3): restyle hash display as card, 16-char truncation, accessible labels, theme-aware classes"
```

---

## Task 3: Library empty-library and empty-search states

**Files:**
- Modify: `apps/desktop/src/ui/Library.tsx`
- Modify: `apps/desktop/src/ui/Library.test.tsx`

**Concept:** The Library needs to distinguish:
- **Empty library** — no active query/filters → the database is presumed empty
- **Empty search** — at least one filter or query is active but returns no results

**Loading boundary:** Do not treat `spells.length === 0` alone as proof that the library is empty. `Library` performs async searches on mount, so the plan must gate empty-state rendering on both:
- no matching spells after the current search has settled
- whether any filters/search state are active

Add an explicit settled-results boolean for the current in-flight search (for example `resultsSettledForCurrentSearch`) and reset it whenever a new search begins. Use it to suppress both empty states until the active search for the current query/filter/mode combination has completed. This keeps the route stable and avoids false empty-library or empty-search flashes while a newer async search is still running.

**`hasActiveFilters` derivation:** Include `selectedSavedSearchId !== null` and `mode !== "keyword"` because `handleResetFilters` resets both. Also update `handleResetFilters` to call `setSelectedSavedSearchId(null)` - currently it does not, which means a saved-search selection is not cleared on reset.

**Note on `<Link>` vs `<button>`:** The "Create Spell" and "Import Spells" CTAs are rendered as `<Link>` (`react-router-dom`), which renders as `<a>` elements. These use `Enter` to activate (not `Space`). The testid names use `-button` suffix following the project's testid table convention (same table uses `empty-library-create-button`) — this is an intentional naming convention, not a semantic claim. The visible text "Create Spell" and "Import Spells" is self-describing; no `aria-label` is needed.

### Step 3.1: Write failing tests

- [x] **Step 3.1: Add empty state tests to Library.test.tsx**

Follow the existing file structure:
- Mock pattern: `vi.mocked(invoke).mockImplementation(async (cmd) => { ... })`
- Render helper: **use `renderLibraryWithViewport()`** (already defined at the top of the file)
- Use `waitFor` for async assertions, consistent with the rest of the file
- **Do NOT add `userEvent` import** — `Library.test.tsx` uses only `fireEvent` throughout; all button/input interactions in these new tests must also use `fireEvent`

Add the following `describe("Library empty states")` block as a **sibling top-level describe** alongside the existing `describe("Library notifications (Task 5)")`. Do NOT nest it inside that describe - nesting empty-state tests inside a "notifications" block would produce misleading test output.

```tsx
describe("Library empty states", () => {
  beforeEach(() => {
    useNotifications.setState({ notifications: [] });
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_facets": return emptyFacets;
        case "list_characters": return [];
        case "list_saved_searches": return [];
        case "search_keyword":
        case "search_semantic": return [];
        default: return undefined;
      }
    });
  });

  afterEach(() => {
    cleanup();
    useNotifications.setState({ notifications: [] });
    vi.restoreAllMocks();
  });

  describe("empty library (no active filters)", () => {
    it("renders the empty-library heading when no filters are active", async () => {
      renderLibraryWithViewport();
      expect(await screen.findByText("No Spells Yet")).toBeInTheDocument();
      expect(
        screen.getByText(/Your spell library is empty/i),
      ).toBeInTheDocument();
      expect(screen.getByTestId("empty-library-create-button")).toBeInTheDocument();
      expect(screen.getByTestId("empty-library-import-button")).toBeInTheDocument();
    });

    it("does NOT show the empty-search state when no filters are active", async () => {
      renderLibraryWithViewport();
      await screen.findByText("No Spells Yet");
      expect(screen.queryByText("No Results")).not.toBeInTheDocument();
    });
  });

  describe("empty search (active filters, no results)", () => {
    it("renders the empty-search state after a query is typed and search is triggered", async () => {
      renderLibraryWithViewport();
      // Wait for initial empty-library render
      await screen.findByText("No Spells Yet");

      // Type a query
      const searchInput = screen.getByTestId("library-search-input");
      fireEvent.change(searchInput, { target: { value: "fireball" } });
      // Trigger search explicitly (the component searches on button click or Enter)
      fireEvent.click(screen.getByTestId("library-search-button"));

      // Now with an active query, the empty-search state should appear
      expect(await screen.findByText("No Results")).toBeInTheDocument();
      expect(
        screen.getByText(/No spells match your current search/i),
      ).toBeInTheDocument();
      expect(screen.getByTestId("empty-search-reset-button")).toBeInTheDocument();
      expect(screen.queryByText("No Spells Yet")).not.toBeInTheDocument();
    });

    it("clicking the empty-search Reset Filters button clears the search query", async () => {
      renderLibraryWithViewport();
      await screen.findByText("No Spells Yet");

      fireEvent.change(screen.getByTestId("library-search-input"), {
        target: { value: "fireball" },
      });
      fireEvent.click(screen.getByTestId("library-search-button"));
      await screen.findByText("No Results");

      fireEvent.click(screen.getByTestId("empty-search-reset-button"));

      // After reset, query clears → back to empty-library state
      expect(await screen.findByText("No Spells Yet")).toBeInTheDocument();
      expect(
        (screen.getByTestId("library-search-input") as HTMLInputElement).value,
      ).toBe("");
    });

    it("treats semantic mode as an active search state even with an empty query", async () => {
      renderLibraryWithViewport();
      await screen.findByText("No Spells Yet");

      fireEvent.change(screen.getByTestId("library-mode-select"), {
        target: { value: "semantic" },
      });
      fireEvent.click(screen.getByTestId("library-search-button"));

      expect(await screen.findByText("No Results")).toBeInTheDocument();
      expect(screen.queryByText("No Spells Yet")).not.toBeInTheDocument();
    });

    it("treats a selected saved search as an active filter state and reset clears the selection", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        switch (cmd) {
          case "list_facets":
            return emptyFacets;
          case "list_characters":
            return [];
          case "list_saved_searches":
            return [
              {
                id: 42,
                name: "Quest Arcana",
                filterJson: JSON.stringify({
                  query: "quest magic",
                  mode: "keyword",
                  filters: { isQuestSpell: true },
                }),
                createdAt: "2026-03-21T00:00:00Z",
              },
            ];
          case "search_keyword":
          case "search_semantic":
            return [];
          default:
            return undefined;
        }
      });

      renderLibraryWithViewport();
      const savedSearchSelect = await screen.findByTestId("saved-searches-select");
      fireEvent.change(savedSearchSelect, { target: { value: "42" } });

      expect(await screen.findByText("No Results")).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("empty-search-reset-button"));

      expect(await screen.findByText("No Spells Yet")).toBeInTheDocument();
      expect((screen.getByTestId("saved-searches-select") as HTMLSelectElement).value).toBe("");
      expect((screen.getByTestId("library-search-input") as HTMLInputElement).value).toBe("");
    });
  });
});
```

> **Search trigger note:** The test fires the search button explicitly (`library-search-button`) after setting the input value. Do NOT rely on auto-search by input change alone — verify how Library.tsx triggers search (button click, `Enter`, or reactive `useEffect`) and fire accordingly. Using the search button is the safest, most deterministic approach.

- [x] **Step 3.2: Run tests — expect failures**

```bash
cd apps/desktop && pnpm test:unit --run -- Library
```

Expected: The new empty-state tests fail because `EmptyState` is not yet used in Library.

### Step 3.2: Implement changes in Library.tsx

- [x] **Step 3.3: Add EmptyState import and hasActiveFilters to Library.tsx**

Add the import at the top:

```tsx
import { EmptyState } from "./components/EmptyState";
```

Add the `hasActiveFilters` derived boolean just before the `return` statement (after the last `useCallback`/`useEffect`), then add a settled-results boolean for the current search lifecycle:

```tsx
const hasActiveFilters = Boolean(
  query.trim() ||
    mode !== "keyword" ||
    schoolFilters.length > 0 ||
    levelMin ||
    levelMax ||
    sourceFilter ||
    classListFilter ||
    componentFilter ||
    tagFilter ||
    isQuestFilter ||
    isCantripFilter ||
    selectedSavedSearchId !== null,
);

const shouldShowEmptyStates = resultsSettledForCurrentSearch;
```

**State variable reference:** `query`, `mode`, `schoolFilters`, `levelMin`, `levelMax`, `sourceFilter`, `classListFilter`, `componentFilter`, `tagFilter`, `isQuestFilter`, `isCantripFilter`, `selectedSavedSearchId` are all declared at the top of `Library`. Their initial values are: `""`, `"keyword"`, `[]`, `""`, `""`, `""`, `""`, `""`, `""`, `false`, `false`, `null` — all coerce to `false` in Boolean context, so `hasActiveFilters` will be `false` on first render (empty library state). ✓

- [x] **Step 3.4: Update `handleResetFilters` to clear the saved search selection**

Implementation note: `hasActiveFilters` may still be `false` on first render, but `shouldShowEmptyStates` must remain `false` whenever the active search is still in flight. Reset it to `false` before each new search and only flip it to `true` when that specific search resolves. The empty-library state should never appear while newer results are pending.

Find `handleResetFilters` in Library.tsx. Add `setSelectedSavedSearchId(null);` to the function body:

```tsx
const handleResetFilters = () => {
  setQuery("");
  setMode("keyword");
  setSchoolFilters([]);
  setLevelMin("");
  setLevelMax("");
  setSourceFilter("");
  setClassListFilter("");
  setComponentFilter("");
  setTagFilter("");
  setIsQuestFilter(false);
  setIsCantripFilter(false);
  setSelectedSavedSearchId(null); // NEW: also clear saved search selection
};
```

- [x] **Step 3.5: Render the two empty states only after search results have settled**

Find the empty-state render site in `Library.tsx` and gate it with the settled-results boolean from Step 3.3.

Use the following shape:

```tsx
{shouldShowEmptyStates && spells.length === 0 && !hasActiveFilters && (
  <tr>
    <td colSpan={5}>
      <EmptyState
        heading="No Spells Yet"
        description="Your spell library is empty. Create your first spell or import spells from a file."
      >
        <Link
          to="/edit/new"
          data-testid="empty-library-create-button"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 text-sm"
        >
          Create Spell
        </Link>
        <Link
          to="/import"
          data-testid="empty-library-import-button"
          className="px-4 py-2 bg-neutral-200 text-neutral-900 rounded-md hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 text-sm"
        >
          Import Spells
        </Link>
      </EmptyState>
    </td>
  </tr>
)}
{shouldShowEmptyStates && spells.length === 0 && hasActiveFilters && (
  <tr>
    <td colSpan={5}>
      <EmptyState
        heading="No Results"
        description="No spells match your current search or filters."
      >
        <button
          type="button"
          data-testid="empty-search-reset-button"
          onClick={handleResetFilters}
          className="px-4 py-2 bg-neutral-200 text-neutral-900 rounded-md hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 text-sm"
        >
          Reset Filters
        </button>
      </EmptyState>
    </td>
  </tr>
)}
```

> **Note:** The existing `library-reset-button` in the filter bar (`data-testid="library-reset-button"`) is kept unchanged. The new `empty-search-reset-button` is a second, separate CTA that both call the same `handleResetFilters` function. They coexist.

> **`headingLevel` note:** `EmptyState` defaults to `"h2"`. Both Library and SpellbookBuilder have an `<h1>` page heading, so `"h2"` is the correct level — do not pass `headingLevel` explicitly. An `<h2>` inside `<td>` is valid HTML5 (table cells permit flow content including headings).

> **Loading boundary:** Do NOT render either empty state until the current active search settles. Once the active search resolves, render the appropriate empty state immediately with no transient spinner. This keeps the route stable without introducing stale empty-library or empty-search flashes between searches.

> **`colSpan` verification:** Confirm the `<table>` has exactly 5 `<th>` columns at implementation time before using `colSpan={5}`. The current table has columns: Name, School, Level, Classes, Comp = 5. ✓

- [x] **Step 3.6: Run tests — expect pass**

```bash
cd apps/desktop && pnpm test:unit --run -- Library
```

Expected: All new tests pass. All pre-existing Library tests pass.

- [x] **Step 3.7: Commit**

```bash
git add apps/desktop/src/ui/Library.tsx apps/desktop/src/ui/Library.test.tsx
git commit -m "feat(chunk-3): add empty-library and empty-search states; fix handleResetFilters to clear saved search"
```

---

## Task 4: SpellbookBuilder empty character spellbook state

**Files:**
- Modify: `apps/desktop/src/ui/SpellbookBuilder.tsx`
- Create: `apps/desktop/src/ui/SpellbookBuilder.test.tsx`

**Picker accessibility note:** The spell picker in `SpellbookBuilder` is implemented as an ad-hoc overlay around a `<dialog open>` element - it is NOT `Modal.tsx` and does NOT use `showModal()`. The current implementation already includes keyboard focus wrapping and trigger tracking, and Chunk 3 must preserve that behavior for the new empty-state CTA. Chunk 5 may still harden modal parity across the app, but this new CTA must not regress open/close focus behavior in Chunk 3.

**`colSpan` verification:** The SpellbookBuilder table has 7 columns: Prep, Known, Name, Level, School, Notes, Actions. `colSpan={7}` is correct at the time of writing. Verify at implementation time.

### Step 4.1: Write failing tests

- [x] **Step 4.1: Create SpellbookBuilder.test.tsx**

```tsx
// apps/desktop/src/ui/SpellbookBuilder.test.tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import SpellbookBuilder from "./SpellbookBuilder";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

function renderSpellbookBuilder(characterId: number) {
  const router = createMemoryRouter(
    [{ path: "/spellbook/:id", element: <SpellbookBuilder /> }],
    { initialEntries: [`/spellbook/${characterId}`] },
  );
  return render(<RouterProvider router={router} />);
}

describe("empty character spellbook state", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_characters":
          return [{ id: 1, name: "Raistlin", type: "PC" }];
        case "get_character_spellbook":
          return [];
        case "list_facets":
          return { schools: [], levels: [] };
        case "search_keyword":
          return []; // picker may trigger this on open
        default:
          return undefined;
      }
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the empty spellbook heading when the character has no spells", async () => {
    renderSpellbookBuilder(1);
    expect(await screen.findByText("No Spells Added")).toBeInTheDocument();
    expect(
      screen.getByText("This character's spellbook is empty."),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("empty-character-add-spell-button"),
    ).toBeInTheDocument();
  });

  it("clicking Add Spell from Library opens the spell picker and moves focus into it", async () => {
    renderSpellbookBuilder(1);
    const addBtn = await screen.findByRole("button", { name: "Add Spell from Library" });
    expect(screen.queryByRole("dialog", { name: "Add spells" })).toBeNull();

    fireEvent.click(addBtn);

    const dialog = await screen.findByRole("dialog", { name: "Add spells" });
    const searchInput = within(dialog).getByTestId("spellbook-picker-search-input");
    expect(document.activeElement).toBe(searchInput);

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Add spells" })).toBeNull();
      expect(document.activeElement).toBe(addBtn);
    });
  });

  it("wraps focus within the picker on Tab and Shift+Tab", async () => {
    renderSpellbookBuilder(1);
    const addBtn = await screen.findByRole("button", { name: "Add Spell from Library" });

    fireEvent.click(addBtn);

    const dialog = await screen.findByRole("dialog", { name: "Add spells" });
    const searchInput = within(dialog).getByTestId("spellbook-picker-search-input");
    const closeButton = within(dialog).getByRole("button", { name: "Close" });

    closeButton.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(searchInput);

    searchInput.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(closeButton);
  });

  it("backdrop click closes the picker and restores focus to the CTA", async () => {
    renderSpellbookBuilder(1);
    const addBtn = await screen.findByRole("button", { name: "Add Spell from Library" });

    fireEvent.click(addBtn);
    await screen.findByRole("dialog", { name: "Add spells" });

    fireEvent.click(screen.getByTestId("spellbook-picker-backdrop"));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Add spells" })).toBeNull();
      expect(document.activeElement).toBe(addBtn);
    });
  });
});
```

- [x] **Step 4.2: Run test — expect failure**

```bash
cd apps/desktop && pnpm test:unit --run -- SpellbookBuilder
```

Expected: Tests fail — component doesn't have the new empty state.

Implementation note: the workspace already contained partial Task 4 changes when execution started, so the initial targeted run did not serve as a clean red phase. The step was still executed before final verification.

### Step 4.2: Implement changes in SpellbookBuilder.tsx

- [x] **Step 4.3: Add EmptyState import to SpellbookBuilder.tsx**

```tsx
import { EmptyState } from "./components/EmptyState";
```

- [x] **Step 4.4: Replace the existing empty spellbook table row**

Find the current block (search for "No spells added yet"):

```tsx
{spellbookLoaded && spellbook.length === 0 && (
  <tr>
    <td colSpan={7} className="p-8 text-center text-neutral-500">
      No spells added yet. Use Add Spells to build the spellbook.
    </td>
  </tr>
)}
```

Replace it with:

```tsx
{spellbookLoaded && spellbook.length === 0 && (
  <tr>
    <td colSpan={7}>
      <EmptyState
        heading="No Spells Added"
        description="This character's spellbook is empty."
      >
        <button
          type="button"
          data-testid="empty-character-add-spell-button"
          onClick={openPicker}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 text-sm"
        >
          Add Spell from Library
        </button>
      </EmptyState>
    </td>
  </tr>
)}
```

The new CTA should call the same `openPicker` helper as the existing "Add Spells" header button (`data-testid="btn-open-picker"`), so the trigger-tracking and focus-return path is shared.

- [x] **Step 4.5: Run tests — expect pass**

```bash
cd apps/desktop && pnpm test:unit --run -- SpellbookBuilder
```

Expected: Both tests pass.

Verification note: final targeted verification was run with `cd apps/desktop && pnpm test:unit --run -- EmptyState SpellbookBuilder` because this workspace exposes unit tests via the `test:unit` script rather than `test`.

- [x] **Step 4.6: Commit**

```bash
git add apps/desktop/src/ui/SpellbookBuilder.tsx apps/desktop/src/ui/SpellbookBuilder.test.tsx
git commit -m "feat(chunk-3): add empty character spellbook state with Add Spell from Library CTA"
```

---

## Task 5: Theme coverage audit and cleanup

**Files:**
- `apps/desktop/index.html` — verify (likely no change needed)
- `apps/desktop/src/ui/SpellEditor.tsx` - audit the revised hash card surface in both themes
- `apps/desktop/src/ui/Library.tsx` - audit the full changed view after the empty-state work, not just the new CTA row
- `apps/desktop/src/ui/SpellbookBuilder.tsx` - audit the full changed view after the empty-state work, including the picker dialog opened by the new CTA

Use the **Light Theme Palette** from `openspec/changes/add-spell-ui-design-and-accessibility/design.md` as reference:

| Role | Light | Dark |
|------|-------|------|
| bg-surface | `bg-white` | `dark:bg-neutral-800` |
| bg-elevated | `bg-neutral-100` | `dark:bg-neutral-700` |
| border | `border-neutral-300` | `dark:border-neutral-700` |
| text-primary | `text-neutral-900` | `dark:text-neutral-100` |
| text-muted | `text-neutral-600` | `dark:text-neutral-400` |

Note: The body element uses `bg-stone-50` (stone palette) for the light background. This is a pre-existing design decision and is not changed by this chunk.

- [x] **Step 5.1: Verify index.html body classes**

Read `apps/desktop/index.html`. Confirm the `<body>` tag has both light and dark classes:

```html
<body class="min-h-screen bg-stone-50 text-stone-950 dark:bg-neutral-950 dark:text-neutral-100">
```

This already provides both light and dark coverage. **No change needed** unless it reads differently at implementation time.

- [x] **Step 5.2: Search SpellEditor.tsx for remaining TODO(chunk-3) markers**

```bash
grep -n "TODO(chunk-3)" apps/desktop/src/ui/SpellEditor.tsx
```

Expected: no matches (both were removed in Task 2). If any remain, fix them now.

- [x] **Step 5.3: Audit SpellbookBuilder.tsx for pre-existing hardcoded dark-only classes**

Search for bare dark-only utility class usages (classes like `bg-neutral-900`, `bg-neutral-800`, `text-neutral-500` used without a corresponding light-mode class):

```bash
grep -n "className=" apps/desktop/src/ui/SpellbookBuilder.tsx | grep -v "dark:"
```

For each match that uses a dark-palette color (neutral-700, neutral-800, neutral-900, neutral-950) without a light-mode variant, assess whether it should be updated. Because `Library.tsx` and `SpellbookBuilder.tsx` are both edited in this chunk, review the full changed views for legibility and theme parity, not just the exact inserted row. The picker dialog at line ~401 uses `bg-neutral-900 border-neutral-700` - these are hardcoded dark-only classes on the picker modal surface. Update them to:

```
bg-white border-neutral-300 dark:bg-neutral-900 dark:border-neutral-700
```

If these classes are on the picker `<div>` backdrop/container, also update the backdrop: `bg-black/70` is acceptable for the overlay (it is dark in both themes for legibility).

> **Scope reminder:** Do not launch a whole-app theme rewrite here, but do audit the full changed `Library` and `SpellbookBuilder` views touched by Chunk 3 so the resulting screens remain legible in both themes.

- [x] **Step 5.4: Audit the full changed Library and SpellbookBuilder views in light and dark themes**

Confirm at minimum:
- the SpellEditor hash card surface, code element, and buttons remain legible in both themes
- the new empty-state CTAs use theme-aware classes
- the picker dialog surface and controls use light+dark classes
- any additional touched controls or text in the changed views remain legible in both modes

Confirm the secondary empty-state buttons use:
```
bg-neutral-200 text-neutral-900 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600
```

The `hover:bg-neutral-300` is an intentional one-step affordance step above the rest state `bg-neutral-200`. This deviates slightly from the named palette `bg-hover = bg-neutral-200` but is an approved interactive hover state.

- [x] **Step 5.5: Commit theme audit fixes (if any)**

```bash
git add apps/desktop/src/ui/SpellbookBuilder.tsx
git commit -m "fix(chunk-3): update picker dialog to theme-aware classes"
```

If no changes were needed, skip this commit.

---

## Task 6: Full test suite verification

- [x] **Step 6.1: Run the complete unit test suite**

```bash
cd apps/desktop && pnpm test:unit --run
```

Expected: All tests pass. Zero failures.

If tests fail, diagnose before proceeding. Common causes:
- Library test: using bare `render(<Library />)` instead of `renderLibraryWithViewport()`
- Library empty states flashing before search settles: add or fix a settled-results guard for the initial async search
- `hasActiveFilters` initialized incorrectly (e.g., `mode` starts as `"keyword"` → `mode !== "keyword"` is `false` → correct)
- `search_keyword` not mocked in SpellbookBuilder tests
- `selectedSavedSearchId` initial value — confirmed `null` (coerces to `false`) ✓
- Missing saved-search reset assertion in Library tests

- [ ] **Step 6.2: Smoke-test in the running app (manual)**

```bash
# From repo root
pnpm tauri:dev
```

Manual checks:
1. Open the Library with zero spells → "No Spells Yet" state with "Create Spell" and "Import Spells" CTAs
2. Type in the search box → click Search → "No Results" state with "Reset Filters" CTA
3. Click "Reset Filters" → search clears; "No Spells Yet" returns
4. Select a saved search if one exists → empty results with "No Results" (not "No Spells Yet")
5. Open a saved spell → hash card renders as a card, shows 16 chars truncated, no native tooltip on hover
6. Click "Expand" → full hash visible; click "Collapse" → 16-char truncation returns
7. Click "Copy" → toast notification appears with "Hash copied to clipboard."; no modal; no focus jump
8. Open a character spellbook with no spells → "No Spells Added" with "Add Spell from Library" CTA
9. Click "Add Spell from Library" → picker dialog opens
10. Toggle theme (Dark ↔ Light) via `/settings` → all new surfaces remain legible in both modes

Additional manual checks for the revised plan:
11. Reload the Library on a perceptible/slow path  empty states do not flash before the first search settles
12. Click "Reset Filters" after selecting a saved search  saved-search selection clears as well as the query
13. Switch Library mode to Semantic with no results  "No Results" appears
14. Simulate clipboard failure if practical  error toast appears with "Failed to copy hash."
15. Confirm the empty-spellbook CTA opens the picker, focus moves into the dialog, and `Escape`/backdrop restore focus to the CTA
16. In both light and dark themes, verify the full changed Library and SpellbookBuilder views remain legible, not just the inserted empty-state rows
17. Confirm the hash copy success and failure toasts render inside the notification viewport/live-region container, not elsewhere in the page

- [ ] **Step 6.3: Final commit (if any manual fixes were applied)**

```bash
git add -p
git commit -m "fix(chunk-3): address manual smoke-test findings"
```

---

## data-testid Reference for Chunk 3

| Element | data-testid | Type |
|---------|-------------|------|
| Hash card outer wrapper | `spell-detail-hash-card` | Structural (non-interactive) |
| Hash display `<code>` | `spell-detail-hash-display` | Non-interactive |
| Hash copy button | `spell-detail-hash-copy` | Interactive |
| Hash expand/collapse button | `spell-detail-hash-expand` | Interactive |
| Empty library – Create Spell | `empty-library-create-button` | Interactive (`<Link>` / `<a>`) |
| Empty library – Import Spells | `empty-library-import-button` | Interactive (`<Link>` / `<a>`) |
| Empty search – Reset Filters | `empty-search-reset-button` | Interactive (`<button>`) |
| Empty character spellbook – Add Spell | `empty-character-add-spell-button` | Interactive (`<button>`) |

> **Naming note:** The `-button` suffix on `<Link>` testids is intentional and follows the project's testid convention table in `tasks.md`. It does not imply button semantics — these render as `<a>` elements.

> **Filter bar reset:** The existing filter bar "Reset Filters" button (`data-testid="library-reset-button"`) is unchanged. The new `empty-search-reset-button` coexists as a second entry point to the same `handleResetFilters` function.

---

## What Chunk 3 Does NOT Change

- Backend save contracts or hash computation (out of scope per spec)
- Tooltip infrastructure (out of scope per Decision 10)
- Picker dialog focus trap (deferred to Chunk 5 — tracked via `TODO(chunk-5)` comment)
- Structured field layout polish (Chunk 4)
- Cross-app accessibility pass (Chunk 5)
- E2E test migration or visual regression baselines (Chunk 6)
- Character, vault, or import-flow modal usage (out of scope)
