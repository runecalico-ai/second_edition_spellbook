# Frontend — Library Semantic Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing Library semantic mode to real embedding lifecycle state — gate search on `embeddings_status`, show a provisioning empty state with install actions when unprovisioned, surface initializing/error states distinctly, and keep `cosineDistance` in the API type but hidden in the UI.

**Architecture:** Extract a focused `LibrarySemanticProvisioning` results-panel empty state and a `useEmbeddingsProvisioning` hook that mirrors the proven Chat download/import/modal flow. `Library.tsx` consumes `useModelStatus` for polling, derives a `SemanticAvailability` enum from `embeddings.state`, and short-circuits `runSearch` unless state is `ready`. Keyword mode behavior stays unchanged.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Tauri v2 (`@tauri-apps/api`, `@tauri-apps/plugin-dialog`), Vitest + `@testing-library/react`.

**Prerequisites:** Tasks 3 (backend embeddings), 6 (types/IPC), and 7 (Chat provisioning components/hooks) complete.

**Out of scope for this plan:** Task 10 Playwright E2E (10.7–10.8), Task 11.2 full AGENTS.md update (noted in finalization), Settings reindex UI, hybrid FTS+vector search, displaying cosine scores.

---

## Spec Snapshot (Task Group 8)

| Task | Requirement |
| ---- | ----------- |
| 8.1 | Gate semantic search on `embeddings_status` before invoking `search_spells_semantic` |
| 8.2 | Show semantic-mode empty state with download/side-load install actions when `notProvisioned` |
| 8.3 | Keep ranking scores hidden in Library UI; preserve `cosineDistance` on `SemanticSearchResult` |
| 8.4 | Handle `initializing` and `error` without presenting semantic mode as a broken search result |

### Related spec requirements (implemented in this plan)

| Source | Requirement |
| ------ | ----------- |
| search spec | Semantic mode before provisioning → empty state + install action; NOT broken search |
| search spec | `search_spells_semantic` returns `cosineDistance`; ordered ascending |
| design.md Decision 14 | Scores hidden in Library v1; backend returns score for tests/future UI |
| design.md | Semantic flow: `embeddings_status()` then `search_spells_semantic()` when ready |
| tasks.md 10.7 | E2E deferred — but all `data-testid`s added here must be E2E-ready |

### Design decisions (grill-me resolution)

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| When to show provisioning empty state | Immediately when `mode === "semantic"` and `embeddings.state` is `notProvisioned` or `error` | Matches search spec scenario "user switches Library to semantic mode" |
| Facet filters in semantic mode | Disable filter controls (`disabled` + `aria-disabled`); keyword-only | Backend ignores filters for `search_spells_semantic`; avoids misleading UX |
| `hasActiveFilters` / empty-search logic | Remove `mode !== "keyword"`; track `semanticSearchAttempted` separately | Prevents "No Results" when user only toggles semantic mode |
| Embeddings side-load picker | `open({ directory: true, multiple: false })` | Backend `embeddings_import_model_file` expects a bundle **directory** (`install_imported_embedding_bundle` copies recursively) |
| Semantic result limit | Pass `limit: 100` to match keyword search cap | Keyword FTS uses limit 100; semantic default is 10 |
| Status polling | Reuse `useModelStatus()` (polls LLM + embeddings) | Already exists; 1 extra `llm_status` invoke is negligible |
| Search while `initializing` | Do not invoke IPC; show in-table loading empty state | Spec: don't present as broken results; backend would block/wait anyway |
| Search error vs unavailable | `semanticSearchError` state for invoke failures when `ready` | Distinguishes "model down" from "query returned nothing" |
| Score stripping | `searchSpellsSemantic` → `.map(({ cosineDistance: _d, ...spell }) => spell)` | Keeps `SemanticSearchResult` typed at API boundary; table uses `SpellSummary` |

---

## Planned File Structure

| File | Action | Purpose |
| ---- | ------ | ------- |
| `apps/desktop/src/ui/library/librarySemantic.ts` | Create | `SemanticAvailability` type + `deriveSemanticAvailability()` |
| `apps/desktop/src/ui/library/librarySemantic.test.ts` | Create | Pure function unit tests |
| `apps/desktop/src/hooks/useEmbeddingsProvisioning.ts` | Create | Download/import/modal handlers for embeddings only |
| `apps/desktop/src/hooks/useEmbeddingsProvisioning.test.tsx` | Create | Hook tests (mock IPC + dialog) |
| `apps/desktop/src/ui/library/LibrarySemanticProvisioning.tsx` | Create | Provisioning + initializing + error empty states for results panel |
| `apps/desktop/src/ui/library/LibrarySemanticProvisioning.test.tsx` | Create | Component tests |
| `apps/desktop/src/ui/Library.tsx` | Modify | Gate search, disable filters, render semantic states, use typed API |
| `apps/desktop/src/ui/Library.test.tsx` | Modify | New semantic gating + provisioning tests; fix mode-only empty-search test |
| `openspec/changes/add-local-llm-chat-interface/tasks.md` | Modify | Mark 8.1–8.4 `[x]` on completion |

**Reuse (no changes required):** `useModelStatus`, `useModelDownloadProgress`, `ModelProvisioningActions`, `ModelDownloadModal`, `EmptyState`, `EmptyStateLiveRegion`, `api/llm.ts`, `types/llm.ts`.

---

## Type Contracts (locked for all tasks)

```typescript
// apps/desktop/src/ui/library/librarySemantic.ts
import type { EmbeddingsStatus } from "../../types/llm";

export type SemanticAvailability =
  | "keyword" // not in semantic mode
  | "notProvisioned"
  | "downloading"
  | "initializing"
  | "error"
  | "ready";

export function deriveSemanticAvailability(
  mode: "keyword" | "semantic",
  embeddingsState: EmbeddingsStatus,
): SemanticAvailability {
  if (mode === "keyword") return "keyword";
  switch (embeddingsState) {
    case "notProvisioned":
      return "notProvisioned";
    case "downloading":
      return "downloading";
    case "initializing":
      return "initializing";
    case "error":
      return "error";
    case "ready":
      return "ready";
  }
}

export function canRunSemanticSearch(availability: SemanticAvailability): boolean {
  return availability === "ready";
}

export const SEMANTIC_SEARCH_LIMIT = 100;
```

```typescript
// Library.tsx — strip scores at API boundary (task 8.3)
import { searchSpellsSemantic } from "../api/llm";
import type { SpellSummary } from "../types/llm";

const raw = await searchSpellsSemantic(nextQuery, SEMANTIC_SEARCH_LIMIT);
const results: SpellSummary[] = raw.map(({ cosineDistance: _distance, ...spell }) => spell);
```

---

### Task 1: Semantic availability helpers (`librarySemantic.ts`)

**Files:**
- Create: `apps/desktop/src/ui/library/librarySemantic.ts`
- Test: `apps/desktop/src/ui/library/librarySemantic.test.ts`

- [ ] **Step 1.1: Write failing tests**

```typescript
// apps/desktop/src/ui/library/librarySemantic.test.ts
import { describe, expect, it } from "vitest";
import {
  canRunSemanticSearch,
  deriveSemanticAvailability,
  SEMANTIC_SEARCH_LIMIT,
} from "./librarySemantic";

describe("deriveSemanticAvailability", () => {
  it("returns keyword when mode is keyword regardless of embeddings state", () => {
    expect(deriveSemanticAvailability("keyword", "notProvisioned")).toBe("keyword");
    expect(deriveSemanticAvailability("keyword", "ready")).toBe("keyword");
  });

  it("maps embeddings states in semantic mode", () => {
    expect(deriveSemanticAvailability("semantic", "notProvisioned")).toBe("notProvisioned");
    expect(deriveSemanticAvailability("semantic", "downloading")).toBe("downloading");
    expect(deriveSemanticAvailability("semantic", "initializing")).toBe("initializing");
    expect(deriveSemanticAvailability("semantic", "error")).toBe("error");
    expect(deriveSemanticAvailability("semantic", "ready")).toBe("ready");
  });
});

describe("canRunSemanticSearch", () => {
  it("is true only when availability is ready", () => {
    expect(canRunSemanticSearch("ready")).toBe(true);
    expect(canRunSemanticSearch("initializing")).toBe(false);
    expect(canRunSemanticSearch("notProvisioned")).toBe(false);
  });
});

describe("SEMANTIC_SEARCH_LIMIT", () => {
  it("matches keyword search cap", () => {
    expect(SEMANTIC_SEARCH_LIMIT).toBe(100);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `cd apps/desktop && pnpm exec vitest run src/ui/library/librarySemantic.test.ts`
Expected: FAIL — module not found

- [ ] **Step 1.3: Implement helpers**

Create `apps/desktop/src/ui/library/librarySemantic.ts` with the Type Contracts block above.

- [ ] **Step 1.4: Run test to verify it passes**

Run: `cd apps/desktop && pnpm exec vitest run src/ui/library/librarySemantic.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 1.5: Commit**

```bash
git add apps/desktop/src/ui/library/librarySemantic.ts apps/desktop/src/ui/library/librarySemantic.test.ts
git commit -m "feat(library): add semantic availability helpers"
```

---

### Task 2: Embeddings provisioning hook (`useEmbeddingsProvisioning.ts`)

**Files:**
- Create: `apps/desktop/src/hooks/useEmbeddingsProvisioning.ts`
- Test: `apps/desktop/src/hooks/useEmbeddingsProvisioning.test.tsx`

- [ ] **Step 2.1: Write failing tests**

```typescript
// apps/desktop/src/hooks/useEmbeddingsProvisioning.test.tsx
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEmbeddingsProvisioning } from "./useEmbeddingsProvisioning";

const downloadEmbeddingsModel = vi.fn();
const importEmbeddingsModelFile = vi.fn();
const cancelEmbeddingsDownload = vi.fn();
const open = vi.fn();

vi.mock("../api/llm", () => ({
  downloadEmbeddingsModel: (...args: unknown[]) => downloadEmbeddingsModel(...args),
  importEmbeddingsModelFile: (...args: unknown[]) => importEmbeddingsModelFile(...args),
  cancelEmbeddingsDownload: (...args: unknown[]) => cancelEmbeddingsDownload(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => open(...args),
}));

describe("useEmbeddingsProvisioning", () => {
  const refresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    downloadEmbeddingsModel.mockResolvedValue(undefined);
    importEmbeddingsModelFile.mockResolvedValue(undefined);
    cancelEmbeddingsDownload.mockResolvedValue(undefined);
    refresh.mockResolvedValue(undefined);
  });

  it("starts download and calls refresh", async () => {
    const { result } = renderHook(() =>
      useEmbeddingsProvisioning({ embeddingsState: "notProvisioned", refresh }),
    );

    await act(async () => {
      await result.current.download();
    });

    expect(downloadEmbeddingsModel).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalled();
    expect(result.current.isDownloadModalOpen).toBe(true);
  });

  it("imports from a directory path when user picks a folder", async () => {
    open.mockResolvedValue("/vault/all-MiniLM-L6-v2");
    const { result } = renderHook(() =>
      useEmbeddingsProvisioning({ embeddingsState: "notProvisioned", refresh }),
    );

    await act(async () => {
      await result.current.importBundle();
    });

    expect(open).toHaveBeenCalledWith({ directory: true, multiple: false });
    expect(importEmbeddingsModelFile).toHaveBeenCalledWith("/vault/all-MiniLM-L6-v2");
    expect(refresh).toHaveBeenCalled();
  });

  it("cancels download and closes modal", async () => {
    const { result } = renderHook(() =>
      useEmbeddingsProvisioning({ embeddingsState: "downloading", refresh }),
    );

    await act(async () => {
      await result.current.cancelDownload();
    });

    expect(cancelEmbeddingsDownload).toHaveBeenCalledTimes(1);
    expect(result.current.isDownloadModalOpen).toBe(false);
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `cd apps/desktop && pnpm exec vitest run src/hooks/useEmbeddingsProvisioning.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 2.3: Implement hook**

```typescript
// apps/desktop/src/hooks/useEmbeddingsProvisioning.ts
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelEmbeddingsDownload,
  downloadEmbeddingsModel,
  importEmbeddingsModelFile,
} from "../api/llm";
import { useModelDownloadProgress } from "./useModelDownloadProgress";
import type { EmbeddingsStatus } from "../types/llm";

interface UseEmbeddingsProvisioningOptions {
  embeddingsState: EmbeddingsStatus;
  refresh: () => Promise<void>;
}

export function useEmbeddingsProvisioning({
  embeddingsState,
  refresh,
}: UseEmbeddingsProvisioningOptions) {
  const [activeDownload, setActiveDownload] = useState(false);
  const sawDownloadingRef = useRef(false);

  useEffect(() => {
    if (activeDownload) return;
    if (embeddingsState === "downloading") {
      setActiveDownload(true);
    }
  }, [embeddingsState, activeDownload]);

  useEffect(() => {
    if (!activeDownload) {
      sawDownloadingRef.current = false;
      return;
    }

    if (embeddingsState === "downloading") {
      sawDownloadingRef.current = true;
      return;
    }

    const successTerminal = embeddingsState === "ready";
    const failedAfterObserved =
      sawDownloadingRef.current && embeddingsState === "error";

    if (sawDownloadingRef.current || successTerminal || failedAfterObserved) {
      setActiveDownload(false);
      void refresh();
    }
  }, [activeDownload, embeddingsState, refresh]);

  const download = useCallback(async () => {
    setActiveDownload(true);
    try {
      await downloadEmbeddingsModel();
    } catch {
      setActiveDownload(false);
    } finally {
      await refresh();
    }
  }, [refresh]);

  const importBundle = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected === null) return;
    const path = Array.isArray(selected) ? selected[0] : selected;
    try {
      await importEmbeddingsModelFile(path);
    } finally {
      await refresh();
    }
  }, [refresh]);

  const cancelDownload = useCallback(async () => {
    try {
      await cancelEmbeddingsDownload();
    } finally {
      setActiveDownload(false);
      await refresh();
    }
  }, [refresh]);

  const isDownloadModalOpen = embeddingsState === "downloading" || activeDownload;
  const progress = useModelDownloadProgress("embeddings", isDownloadModalOpen);

  return {
    download,
    importBundle,
    cancelDownload,
    isDownloadModalOpen,
    progress,
  };
}
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `cd apps/desktop && pnpm exec vitest run src/hooks/useEmbeddingsProvisioning.test.tsx`
Expected: PASS

- [ ] **Step 2.5: Commit**

```bash
git add apps/desktop/src/hooks/useEmbeddingsProvisioning.ts apps/desktop/src/hooks/useEmbeddingsProvisioning.test.tsx
git commit -m "feat(library): add embeddings provisioning hook"
```

---

### Task 3: Library semantic provisioning UI (`LibrarySemanticProvisioning.tsx`)

**Files:**
- Create: `apps/desktop/src/ui/library/LibrarySemanticProvisioning.tsx`
- Test: `apps/desktop/src/ui/library/LibrarySemanticProvisioning.test.tsx`

- [ ] **Step 3.1: Write failing tests**

```typescript
// apps/desktop/src/ui/library/LibrarySemanticProvisioning.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LibrarySemanticProvisioning } from "./LibrarySemanticProvisioning";

describe("LibrarySemanticProvisioning", () => {
  it("renders provisioning actions when notProvisioned", () => {
    render(
      <LibrarySemanticProvisioning
        availability="notProvisioned"
        errorMessage={null}
        onDownload={vi.fn()}
        onImport={vi.fn()}
        onSwitchToKeyword={vi.fn()}
      />,
    );

    expect(screen.getByTestId("library-semantic-provisioning-state")).toBeTruthy();
    expect(screen.getByTestId("library-embeddings-download-button")).toBeTruthy();
    expect(screen.getByTestId("library-embeddings-import-button")).toBeTruthy();
  });

  it("renders initializing copy without search-reset wording", () => {
    render(
      <LibrarySemanticProvisioning
        availability="initializing"
        errorMessage={null}
        onDownload={vi.fn()}
        onImport={vi.fn()}
        onSwitchToKeyword={vi.fn()}
      />,
    );

    expect(screen.getByTestId("library-semantic-initializing-state")).toBeTruthy();
    expect(screen.queryByTestId("empty-search-reset-button")).toBeNull();
  });

  it("renders error state with message and provisioning actions", () => {
    render(
      <LibrarySemanticProvisioning
        availability="error"
        errorMessage="ONNX runtime failed"
        onDownload={vi.fn()}
        onImport={vi.fn()}
        onSwitchToKeyword={vi.fn()}
      />,
    );

    expect(screen.getByText(/ONNX runtime failed/)).toBeTruthy();
    expect(screen.getByTestId("library-semantic-switch-keyword-button")).toBeTruthy();
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `cd apps/desktop && pnpm exec vitest run src/ui/library/LibrarySemanticProvisioning.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3.3: Implement component**

```tsx
// apps/desktop/src/ui/library/LibrarySemanticProvisioning.tsx
import { EmptyState, EmptyStateLiveRegion } from "../components/EmptyState";
import { ModelProvisioningActions } from "../components/chat/ModelProvisioningActions";
import type { SemanticAvailability } from "./librarySemantic";

interface LibrarySemanticProvisioningProps {
  availability: Exclude<SemanticAvailability, "keyword" | "ready">;
  errorMessage?: string | null;
  onDownload: () => void;
  onImport: () => void;
  onSwitchToKeyword: () => void;
  disabled?: boolean;
}

const COPY = {
  notProvisioned: {
    heading: "Semantic search needs the embedding model",
    description:
      "Download the all-MiniLM-L6-v2 embedding bundle (~90 MB) or add a verified local copy to search by meaning instead of keywords.",
  },
  downloading: {
    heading: "Downloading embedding model",
    description: "The download modal shows progress. Semantic search will be available when the model is ready.",
  },
  initializing: {
    heading: "Initializing embedding model",
    description: "The model is loading in the background. Try your search again in a few seconds.",
  },
  error: {
    heading: "Embedding model unavailable",
    description: "Semantic search is paused until the embedding model is installed or recovers.",
  },
} as const;

export function LibrarySemanticProvisioning({
  availability,
  errorMessage,
  onDownload,
  onImport,
  onSwitchToKeyword,
  disabled = false,
}: LibrarySemanticProvisioningProps) {
  const copy = COPY[availability];
  const description =
    availability === "error" && errorMessage
      ? `${copy.description} ${errorMessage}`
      : copy.description;

  const testId =
    availability === "initializing"
      ? "library-semantic-initializing-state"
      : availability === "downloading"
        ? "library-semantic-downloading-state"
        : availability === "error"
          ? "library-semantic-error-state"
          : "library-semantic-provisioning-state";

  const showActions = availability === "notProvisioned" || availability === "error";

  return (
    <>
      <EmptyStateLiveRegion
        active
        testId={testId}
        heading={copy.heading}
        description={description}
      />
      <EmptyState heading={copy.heading} description={description} testId={testId} headingLevel="h3">
        {availability === "initializing" || availability === "downloading" ? (
          <p
            className="text-sm text-neutral-500 dark:text-neutral-400"
            data-testid="library-semantic-loading-hint"
            role="status"
            aria-live="polite"
          >
            {availability === "initializing" ? "Loading model…" : "Download in progress…"}
          </p>
        ) : null}
        {showActions ? (
          <ModelProvisioningActions
            modelLabel="Embedding Model"
            onDownload={onDownload}
            onImport={onImport}
            downloadTestId="library-embeddings-download-button"
            importTestId="library-embeddings-import-button"
            disabled={disabled}
          />
        ) : null}
        <button
          type="button"
          data-testid="library-semantic-switch-keyword-button"
          className="mt-3 text-sm text-blue-700 underline hover:text-blue-600 dark:text-blue-400"
          onClick={onSwitchToKeyword}
        >
          Switch to keyword search
        </button>
      </EmptyState>
    </>
  );
}
```

- [ ] **Step 3.4: Run test to verify it passes**

Run: `cd apps/desktop && pnpm exec vitest run src/ui/library/LibrarySemanticProvisioning.test.tsx`
Expected: PASS

- [ ] **Step 3.5: Commit**

```bash
git add apps/desktop/src/ui/library/LibrarySemanticProvisioning.tsx apps/desktop/src/ui/library/LibrarySemanticProvisioning.test.tsx
git commit -m "feat(library): add semantic provisioning empty states"
```

---

### Task 4: Wire `Library.tsx` — gating, filters, results panel

**Files:**
- Modify: `apps/desktop/src/ui/Library.tsx`
- Test: `apps/desktop/src/ui/Library.test.tsx`

- [ ] **Step 4.0: Add model-status defaults to all Library test invoke mocks**

Refactor `Library.test.tsx` so each `invoke` mock calls `defaultModelStatusMocks(cmd)` before falling through. Run the full file once to confirm no regressions:

Run: `cd apps/desktop && pnpm exec vitest run src/ui/Library.test.tsx`
Expected: PASS (baseline before feature tests)

- [ ] **Step 4.1: Write failing tests for embeddings gating**

Add to `apps/desktop/src/ui/Library.test.tsx`:

```typescript
// Inside describe("Library search"), add mocks for embeddings_status:

it("shows semantic provisioning empty state when mode is semantic and embeddings are notProvisioned", async () => {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    const defaults = defaultModelStatusMocks(cmd);
    if (defaults !== undefined) {
      if (cmd === "embeddings_status") return { state: "notProvisioned" };
      return defaults;
    }
    switch (cmd) {
      case "list_facets":
        return { schools: [], sources: [], levels: [], classList: [], components: [], tags: [] };
      case "list_characters":
        return [];
      case "list_saved_searches":
        return [];
      case "search_keyword":
        return [];
      default:
        throw new Error(`unexpected invoke ${cmd}`);
    }
  });

  render(<Library />);

  fireEvent.change(screen.getByTestId("library-mode-select"), {
    target: { value: "semantic" },
  });

  expect(await screen.findByTestId("library-semantic-provisioning-state")).toBeTruthy();
  expect(invoke).not.toHaveBeenCalledWith("search_spells_semantic", expect.anything());
});

it("does not call search_spells_semantic while embeddings are initializing", async () => {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    const defaults = defaultModelStatusMocks(cmd);
    if (defaults !== undefined) {
      if (cmd === "embeddings_status") return { state: "initializing" };
      return defaults;
    }
    switch (cmd) {
      case "list_facets":
        return { schools: [], sources: [], levels: [], classList: [], components: [], tags: [] };
      case "list_characters":
        return [];
      case "list_saved_searches":
        return [];
      case "search_keyword":
        return [];
      case "search_spells_semantic":
        throw new Error("should not be called");
      default:
        throw new Error(`unexpected invoke ${cmd}`);
    }
  });

  render(<Library />);
  fireEvent.change(screen.getByTestId("library-mode-select"), { target: { value: "semantic" } });
  fireEvent.change(screen.getByTestId("search-input"), { target: { value: "fire damage" } });
  fireEvent.click(screen.getByTestId("library-search-button"));

  expect(await screen.findByTestId("library-semantic-initializing-state")).toBeTruthy();
  expect(invoke).not.toHaveBeenCalledWith("search_spells_semantic", expect.anything());
});

it("strips cosineDistance from semantic results before rendering rows", async () => {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    const defaults = defaultModelStatusMocks(cmd);
    if (defaults !== undefined && cmd !== "search_spells_semantic") return defaults;
    switch (cmd) {
      case "list_facets":
        return { schools: [], sources: [], levels: [], classList: [], components: [], tags: [] };
      case "list_characters":
        return [];
      case "list_saved_searches":
        return [];
      case "search_keyword":
        return [];
      case "search_spells_semantic":
        return [
          {
            id: 1,
            name: "Fireball",
            level: 3,
            isQuestSpell: 0,
            isCantrip: 0,
            cosineDistance: 0.12,
          },
        ];
      default:
        throw new Error(`unexpected invoke ${cmd}`);
    }
  });

  render(<Library />);
  fireEvent.change(screen.getByTestId("library-mode-select"), { target: { value: "semantic" } });
  fireEvent.change(screen.getByTestId("search-input"), { target: { value: "fire" } });
  fireEvent.click(screen.getByTestId("library-search-button"));

  expect(await screen.findByTestId("spell-row-fireball")).toBeTruthy();
  expect(screen.queryByText("0.12")).toBeNull();
});
```

Also update the existing test `"renders the empty-search state for semantic mode after the semantic search settles"` — route `embeddings_status` / `llm_status` through `defaultModelStatusMocks(cmd)` (defaults to `ready`) so the search reaches `search_spells_semantic`, and update the invoke assertion to expect the limit:

```typescript
expect(invoke).toHaveBeenCalledWith("search_spells_semantic", {
  query: "find hidden lore",
  limit: 100,
});
```

Add one regression test:

```typescript
it("does not show empty-library state when semantic mode is blocked by missing embeddings", async () => {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    const defaults = defaultModelStatusMocks(cmd);
    if (defaults !== undefined) {
      if (cmd === "embeddings_status") return { state: "notProvisioned" };
      return defaults;
    }
    switch (cmd) {
      case "list_facets":
        return emptyFacets;
      case "list_characters":
        return [];
      case "list_saved_searches":
        return [];
      case "search_keyword":
        return [];
      default:
        return undefined;
    }
  });

  renderLibraryWithViewport();
  await screen.findByText("No Spells Yet");

  fireEvent.change(screen.getByTestId("library-mode-select"), {
    target: { value: "semantic" },
  });

  expect(await screen.findByTestId("library-semantic-provisioning-state")).toBeTruthy();
  expect(screen.queryByTestId("empty-library-state")).toBeNull();
  expect(screen.queryByTestId("empty-search-state")).toBeNull();
});
```

- [ ] **Step 4.2: Run tests to verify new cases fail**

Run: `cd apps/desktop && pnpm exec vitest run src/ui/Library.test.tsx -t "semantic"`
Expected: FAIL on new tests

- [ ] **Step 4.3: Implement Library wiring**

Key changes in `apps/desktop/src/ui/Library.tsx`:

1. **Imports** — add:
   - `useModelStatus` from `../hooks/useModelStatus`
   - `useEmbeddingsProvisioning` from `../hooks/useEmbeddingsProvisioning`
   - `searchSpellsSemantic` from `../api/llm`
   - `ModelDownloadModal` from `./components/chat/ModelDownloadModal`
   - `LibrarySemanticProvisioning` from `./library/LibrarySemanticProvisioning`
   - `canRunSemanticSearch`, `deriveSemanticAvailability`, `SEMANTIC_SEARCH_LIMIT` from `./library/librarySemantic`
   - `SpellSummary` from `../types/llm` (replace local duplicate type or alias)

2. **Hooks at top of component:**
```tsx
const { embeddings, refresh: refreshModelStatus } = useModelStatus();
const semanticAvailability = deriveSemanticAvailability(mode, embeddings.state);
const embeddingsSetup = useEmbeddingsProvisioning({
  embeddingsState: embeddings.state,
  refresh: refreshModelStatus,
});
const [semanticSearchAttempted, setSemanticSearchAttempted] = useState(false);
const [semanticSearchError, setSemanticSearchError] = useState<string | null>(null);
```

3. **Replace `runSearch` semantic branch:**
```tsx
if (nextMode === "semantic") {
  const availability = deriveSemanticAvailability("semantic", embeddings.state);
  if (!canRunSemanticSearch(availability)) {
    setSpells([]);
    setSemanticSearchError(null);
    return;
  }
  setSemanticSearchAttempted(true);
  setSemanticSearchError(null);
  const raw = await searchSpellsSemantic(nextQuery, SEMANTIC_SEARCH_LIMIT);
  results = raw.map(({ cosineDistance: _distance, ...spell }) => spell);
}
```

4. **Add `semanticSearchError` catch branch** — set message instead of silent empty:
```tsx
} catch (e) {
  // ...
  if (nextMode === "semantic") {
    setSemanticSearchError(e instanceof Error ? e.message : String(e));
  }
  setSpells([]);
}
```

5. **Fix `hasActiveFilters`** — remove `mode !== "keyword"`; use:
```tsx
const hasKeywordFilters = Boolean(
  schoolFilters.length > 0 ||
    levelMin ||
    levelMax ||
    sourceFilter ||
    classListFilter ||
    componentFilter ||
    tagFilter ||
    isQuestFilter ||
    isCantripFilter,
);
const hasActiveSearchContext = Boolean(
  query.trim() ||
    (mode === "keyword" && hasKeywordFilters) ||
    selectedSavedSearchId !== null ||
    semanticSearchAttempted,
);

const showSemanticPanel =
  mode === "semantic" &&
  semanticAvailability !== "ready" &&
  semanticAvailability !== "keyword";

const showSemanticSearchError =
  mode === "semantic" && semanticAvailability === "ready" && semanticSearchError !== null;

const showEmptyLibrary =
  resultsSettledForCurrentSearch &&
  spells.length === 0 &&
  !hasActiveSearchContext &&
  !showSemanticPanel &&
  !showSemanticSearchError;

const showEmptySearch =
  resultsSettledForCurrentSearch &&
  spells.length === 0 &&
  hasActiveSearchContext &&
  semanticAvailability === "ready" &&
  !semanticSearchError &&
  !showSemanticPanel;
```

6. **Fix `activeEmptyStateAnnouncement`** — do not announce generic empty states when semantic UI is active:
```tsx
const activeEmptyStateAnnouncement =
  showSemanticPanel || showSemanticSearchError
    ? null
    : showEmptyLibrary
      ? EMPTY_LIBRARY_STATE
      : showEmptySearch
        ? EMPTY_SEARCH_STATE
        : null;
```

7. **TypeScript narrowing for provisioning panel** — `semanticAvailability` is wider than the component prop; narrow when rendering:
```tsx
type SemanticBlockingAvailability = Exclude<SemanticAvailability, "keyword" | "ready">;

function asSemanticBlockingAvailability(
  availability: SemanticAvailability,
): SemanticBlockingAvailability | null {
  if (availability === "keyword" || availability === "ready") return null;
  return availability;
}

// In JSX:
const blockingAvailability = asSemanticBlockingAvailability(semanticAvailability);
{showSemanticPanel && blockingAvailability ? (
  <LibrarySemanticProvisioning availability={blockingAvailability} ... />
) : null}
```

8. **Disable facet controls when `mode === "semantic"`** — add `disabled={mode === "semantic"}` and `aria-disabled={mode === "semantic"}` to filter inputs; add helper text under mode select:
```tsx
{mode === "semantic" ? (
  <p className="text-xs text-neutral-500" data-testid="library-semantic-filters-hint">
    Facet filters apply to keyword search only.
  </p>
) : null}
```

8. **Results table body** — render spell rows only when semantic is not blocking:

```tsx
{!showSemanticPanel && !showSemanticSearchError
  ? spells.map((s) => (/* existing row */))
  : null}
```

Insert semantic status rows before empty-library / empty-search rows:

```tsx
{showSemanticPanel && blockingAvailability ? (
  <tr>
    <td colSpan={5}>
      <LibrarySemanticProvisioning
        availability={blockingAvailability}
        errorMessage={embeddings.errorMessage}
        onDownload={() => void embeddingsSetup.download()}
        onImport={() => void embeddingsSetup.importBundle()}
        onSwitchToKeyword={() => {
          setMode("keyword");
          setSemanticSearchAttempted(false);
          setSemanticSearchError(null);
        }}
        disabled={embeddings.state === "downloading"}
      />
    </td>
  </tr>
) : null}
{showSemanticSearchError ? (
  <tr>
    <td colSpan={5}>
      <EmptyState
        testId="library-semantic-search-error-state"
        heading="Semantic search failed"
        description={semanticSearchError ?? "Unknown error"}
      >
        <button type="button" data-testid="library-semantic-retry-button" onClick={() => void search()}>
          Retry search
        </button>
      </EmptyState>
    </td>
  </tr>
) : null}
```

9. **Download modal** — sibling to results (like ChatPanel):
```tsx
{embeddingsSetup.isDownloadModalOpen ? (
  <ModelDownloadModal
    isOpen
    modelLabel="Embedding Model"
    bytesDownloaded={embeddingsSetup.progress.bytesDownloaded}
    totalBytes={embeddingsSetup.progress.totalBytes}
    onCancel={() => void embeddingsSetup.cancelDownload()}
    testId="library-embeddings-download-modal"
  />
) : null}
```

10. **Mode change handler** — reset semantic error state and clear stale rows:
```tsx
onChange={(e) => {
  const next = e.target.value as "keyword" | "semantic";
  setMode(next);
  setSemanticSearchError(null);
  if (next === "keyword") {
    setSemanticSearchAttempted(false);
  } else {
    setSpells([]);
    setResultsSettledForCurrentSearch(true);
  }
}}
```

11. **`handleResetFilters`** — also `setSemanticSearchAttempted(false)` and `setSemanticSearchError(null)`.

12. **Update `runSearch` dependency array** to include `embeddings.state`.

- [ ] **Step 4.4: Run Library tests**

Run: `cd apps/desktop && pnpm exec vitest run src/ui/Library.test.tsx`
Expected: PASS

- [ ] **Step 4.5: Run lint**

Run: `cd apps/desktop && pnpm lint`
Expected: no errors in touched files

- [ ] **Step 4.6: Commit**

```bash
git add apps/desktop/src/ui/Library.tsx apps/desktop/src/ui/Library.test.tsx
git commit -m "feat(library): gate semantic search on embedding model status"
```

---

### Task 5: Spec & task checklist update

**Files:**
- Modify: `openspec/changes/add-local-llm-chat-interface/tasks.md`

- [ ] **Step 5.1: Verify task 8 acceptance criteria manually**

Manual smoke checklist:
1. Fresh vault, open Library → switch to Semantic → provisioning empty state appears (no "No Results")
2. Click Download → `library-embeddings-download-modal` shows progress
3. After model ready, semantic search returns spells; no cosine score in table
4. Force `error` state (or mock) → error empty state with reinstall actions, not "No Results"
5. During `initializing`, search button does not surface "No Results"

- [ ] **Step 5.2: Mark tasks complete in OpenSpec checklist**

In `openspec/changes/add-local-llm-chat-interface/tasks.md`, change:

```markdown
## 8. Frontend — Library Semantic Mode

- [x] 8.1 Update the existing Library semantic mode to use `embeddings_status` before running semantic search
- [x] 8.2 Show the semantic-mode empty state with install actions when the embedding model is not provisioned
- [x] 8.3 Keep semantic ranking scores hidden in the Library UI while preserving them in the API result type
- [x] 8.4 Handle `initializing` and `error` states without presenting semantic mode as a broken search result
```

- [ ] **Step 5.3: Commit**

```bash
git add openspec/changes/add-local-llm-chat-interface/tasks.md
git commit -m "docs(openspec): mark task 8 library semantic mode complete"
```

---

## Verification Commands (full task group)

```bash
cd apps/desktop
pnpm exec vitest run src/ui/library/librarySemantic.test.ts src/hooks/useEmbeddingsProvisioning.test.tsx src/ui/library/LibrarySemanticProvisioning.test.tsx src/ui/Library.test.tsx
pnpm lint
```

---

## Self-Review Checklist (pre-implementation)

| Spec requirement | Plan task |
| ---------------- | --------- |
| 8.1 `embeddings_status` before semantic search | Task 4 `canRunSemanticSearch` gate |
| 8.2 provisioning empty state + install actions | Task 3 + Task 4 `showSemanticPanel` |
| 8.3 hidden scores, typed API | Task 4 score strip + `searchSpellsSemantic` |
| 8.4 initializing/error UX | Task 3 distinct states; no `showEmptySearch` when blocked |
| search spec: switch to semantic when notProvisioned | Task 4 mode-select triggers panel without search |
| design.md semantic flow diagram | Task 4 status → search sequence |
| tasks.md spec update on completion | Task 5 |

**Placeholder scan:** No TBD/TODO steps. All code blocks are complete.

---

## Grill-Me Log (plan refinement iterations)

### Iteration 1 — Blocking decisions

| Question | Resolution |
| -------- | ---------- |
| Provisioning on mode switch or only after Search? | **Mode switch** — spec scenario is explicit |
| Show "No Results" when only toggling semantic? | **No** — fixed `hasActiveFilters` / `semanticSearchAttempted` |
| Disable filters in semantic mode? | **Yes** — backend ignores them |
| Directory or file picker for embeddings import? | **Directory** — matches Rust bundle install |

### Iteration 2 — Edge cases

| Question | Resolution |
| -------- | ---------- |
| Re-run search when model becomes ready? | **Out of scope** — user clicks Search again; initializing copy says so |
| `downloading` vs modal — duplicate UI? | Show downloading state in table **and** modal (modal has progress; table has short hint) |
| Chat uses file picker for embeddings — fix here? | **Library uses directory picker**; Chat fix deferred (not task 8) |
| Saved search restores semantic mode while notProvisioned? | Loading saved search sets mode semantic → provisioning panel shows (correct) |

### Iteration 3 — Test & E2E readiness

| Question | Resolution |
| -------- | ---------- |
| New `data-testid`s for E2E 10.7 | `library-semantic-provisioning-state`, `library-embeddings-download-button`, `library-embeddings-import-button`, `library-semantic-initializing-state`, `library-semantic-error-state`, `library-embeddings-download-modal` |
| Existing semantic empty-search test | Update to mock `embeddings_status: ready` |
| POM `setLibraryFilters` mode param | Defer to task 10 — note in E2E section |

### Iteration 4 — Stale results & test harness

| Question | Resolution |
| -------- | ---------- |
| Keyword results visible under provisioning panel? | **Hide spell rows** when `showSemanticPanel` or `showSemanticSearchError`; only the semantic status row renders |
| `useModelStatus` breaks existing Library tests? | **Step 4.0:** add shared test mock defaults for `embeddings_status` (`ready`) and `llm_status` (`notProvisioned`) to every `invoke` mock in `Library.test.tsx` |
| Clear `semanticSearchAttempted` on reset? | `handleResetFilters` sets `semanticSearchAttempted` to `false` |

**Satisfaction estimate:** 97% — remaining 3% is intentional deferral (Chat directory picker parity, E2E 10.7–10.8, AGENTS.md 11.2).

### Iteration 5 — Double-check audit (2026-07-08)

| Finding | Severity | Plan fix |
| ------- | -------- | -------- |
| `showEmptyLibrary` could render alongside semantic provisioning on an empty vault | **High** | Exclude `showSemanticPanel` / `showSemanticSearchError` from `showEmptyLibrary` and `showEmptySearch` |
| Top-level `EmptyStateLiveRegion` could announce "No Spells Yet" under semantic panel | **Medium** | Set `activeEmptyStateAnnouncement` to `null` when semantic UI is active |
| `LibrarySemanticProvisioning` prop type mismatch (`keyword`/`ready` not excluded at call site) | **Medium** | Add `asSemanticBlockingAvailability()` narrow helper |
| New integration tests omitted `llm_status` mock | **High** | Route all new mocks through `defaultModelStatusMocks()` |
| `useEmbeddingsProvisioning` duplicates `ChatPanel` download logic | **Low** | Accept for Task 8; optional Chat refactor later |
| Task 8.1 strict reading: refresh status immediately before search | **Low** | Optional `await refreshModelStatus()` at top of semantic branch if staleness is a concern |
| Hook test imports unused `waitFor` | **Low** | Remove unused import when implementing |
| Semantic default backend limit is 10; plan uses 100 | **Info** | Confirmed intentional parity with `SEARCH_RESULT_LIMIT = 100` |

**Post-audit satisfaction:** 98% for implementation readiness.

---

## Shared test mock helper (Task 4 prerequisite)

Add near the top of `Library.test.tsx` (after existing imports):

```typescript
function defaultModelStatusMocks(cmd: string): unknown | undefined {
  switch (cmd) {
    case "embeddings_status":
      return { state: "ready" };
    case "llm_status":
      return { status: "notProvisioned", modelPath: "" };
    default:
      return undefined;
  }
}
```

Every existing `invoke` mock implementation should delegate unknown commands through `defaultModelStatusMocks(cmd)` first so adding `useModelStatus` does not break unrelated tests.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-08-add-local-llm-chat-interface-task-8-frontend-library-semantic-mode.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
