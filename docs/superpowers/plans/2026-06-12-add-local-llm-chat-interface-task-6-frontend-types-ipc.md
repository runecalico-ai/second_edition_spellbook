# Frontend — TypeScript Types & IPC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement TypeScript types, Tauri IPC API wrappers, and the custom React hook `useLlmStream` for local LLM chat and embedding commands, matching the backend implementation and specifications.

**Architecture:** Create `src/types/llm.ts` to host all local LLM/embedding types and interfaces. Create `src/api/llm.ts` to host all typed Tauri IPC wrappers invoking the backend commands. Create `src/hooks/useLlmStream.ts` to subscribe to LLM token and completion event streams with proper setup, unlisten cleanup, timeout, and cancellation handling. Add unit tests for the hook in `src/hooks/useLlmStream.test.tsx` using Vitest and `@testing-library/react`. Finally, update `openspec/changes/add-local-llm-chat-interface/tasks.md` upon completion.

**Tech Stack:** TypeScript, React, Tauri v2 APIs, Vitest, `@testing-library/react`.

---

## Spec Snapshot (Task Group 6)

| Task | Requirement |
| ---- | ----------- |
| 6.1  | Define `LlmStatusResponse`, `EmbeddingsStatusResponse`, `ChatMessage`, `DownloadProgressEvent`, `TokenEvent`, and `DoneEvent` in `src/types/llm.ts` |
| 6.2  | Add `ReindexResult` and `SemanticSearchResult` interfaces to `src/types/llm.ts` |
| 6.3  | Create typed IPC wrappers for `llm_status`, `llm_download_model`, `llm_import_model_file`, `llm_cancel_download`, `llm_cancel_generation`, and `llm_chat` |
| 6.4  | Add typed wrappers for `embeddings_status`, `embeddings_download_model`, `embeddings_import_model_file`, `embeddings_cancel_download`, `search_spells_semantic`, and `reindex_embeddings` |
| 6.5  | Implement the streaming hook `useLlmStream(streamId)`: subscribe to `llm://token/<id>` and `llm://done/<id>` and expose generation cancellation |

---

## Planned File Structure

| File | Action | Purpose |
| ---- | ------ | ------- |
| [llm.ts](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src/types/llm.ts) | [NEW] | Contains LLM and Embedding-related types/interfaces aligned with Rust structs. |
| [llm.ts](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src/api/llm.ts) | [NEW] | Contains typed IPC wrappers using `@tauri-apps/api/core` `invoke`. |
| [useLlmStream.ts](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src/hooks/useLlmStream.ts) | [NEW] | React hook subscribing to Tauri streaming events for LLM tokens and completions. |
| [useLlmStream.test.tsx](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src/hooks/useLlmStream.test.tsx) | [NEW] | Unit tests verifying `useLlmStream` event listening, cleanup, and state transitions. |
| [tasks.md](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/add-local-llm-chat-interface/tasks.md) | Modify | Update task checklist for Frontend Types & IPC. |

---

### Task 1: TypeScript Types (`src/types/llm.ts`)

**Files:**
- Create: `apps/desktop/src/types/llm.ts`

- [x] **Step 1.1: Write the type definitions file**
Create the new file `apps/desktop/src/types/llm.ts` with all types matching the Rust model serialization:
```typescript
export type LlmStatus = "notProvisioned" | "downloading" | "ready" | "loaded" | "error";

export interface LlmStatusResponse {
  status: LlmStatus;
  modelPath: string;
  bytesDownloaded?: number | null;
  totalBytes?: number | null;
  lastError?: string | null;
}

export interface DownloadProgressEvent {
  bytesDownloaded: number;
  totalBytes: number;
}

export interface TokenEvent {
  token: string;
}

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface RagSpellContext {
  id: number;
  name: string;
  school?: string | null;
  level: number;
  descriptionSnippet: string;
}

export interface LlmChatGrounding {
  searchTerms: string[];
  groundedSpells: RagSpellContext[];
}

export interface DoneEvent {
  fullResponse: string;
  cancelled: boolean;
  searchTerms: string[];
  groundedSpells: RagSpellContext[];
  timedOut: boolean;
}

export type EmbeddingsStatus = "notProvisioned" | "downloading" | "initializing" | "ready" | "error";

export interface EmbeddingsStatusResponse {
  state: EmbeddingsStatus;
  downloadProgress?: number | null;
  errorMessage?: string | null;
}

export interface EmbeddingsDownloadProgressEvent {
  bytesDownloaded: number;
  totalBytes: number;
}

export interface ReindexProgressEvent {
  current: number;
  total: number;
}

export interface SpellSummary {
  id: number;
  name: string;
  school?: string;
  sphere?: string;
  level: number;
  classList?: string;
  components?: string;
  duration?: string;
  source?: string;
  isQuestSpell: number;
  isCantrip: number;
  tags?: string;
}

export interface SemanticSearchResult extends SpellSummary {
  cosineDistance: number;
}

export interface ReindexResult {
  total: number;
  indexed: number;
  skipped: number;
  failed: number;
}
```

- [x] **Step 1.2: Verify file compiles and has no type errors**
Run type-checking on the project:
Run: `pnpm typecheck` (from directory `apps/desktop`)
Expected: PASS with no compilation errors.

- [x] **Step 1.3: Run Biome formatter/linter**
Run formatting and linting:
Run: `pnpm format && pnpm lint` (from directory `apps/desktop`)
Expected: No format/lint violations in the new file.

---

### Task 2: Typed IPC Wrappers (`src/api/llm.ts`)

**Files:**
- Create: `apps/desktop/src/api/llm.ts`

- [x] **Step 2.1: Implement typed Tauri commands**
Create `apps/desktop/src/api/llm.ts` using Tauri's `invoke` API:
```typescript
import { invoke } from "@tauri-apps/api/core";
import type {
  ChatMessage,
  EmbeddingsStatusResponse,
  LlmStatusResponse,
  ReindexResult,
  SemanticSearchResult,
} from "../types/llm";

// ── LLM Commands ────────────────────────────────────────────────────────────

export async function getLlmStatus(): Promise<LlmStatusResponse> {
  return invoke<LlmStatusResponse>("llm_status");
}

export async function downloadLlmModel(): Promise<void> {
  return invoke<void>("llm_download_model");
}

export async function importLlmModelFile(filePath: string): Promise<void> {
  return invoke<void>("llm_import_model_file", { filePath });
}

export async function cancelLlmDownload(): Promise<void> {
  return invoke<void>("llm_cancel_download");
}

export async function cancelLlmGeneration(streamId: string): Promise<void> {
  return invoke<void>("llm_cancel_generation", { streamId });
}

export async function startLlmChat(
  message: string,
  streamId: string,
  history: ChatMessage[],
): Promise<void> {
  return invoke<void>("llm_chat", { message, streamId, history });
}

// ── Embedding Commands ───────────────────────────────────────────────────────

export async function getEmbeddingsStatus(): Promise<EmbeddingsStatusResponse> {
  return invoke<EmbeddingsStatusResponse>("embeddings_status");
}

export async function downloadEmbeddingsModel(): Promise<void> {
  return invoke<void>("embeddings_download_model");
}

export async function importEmbeddingsModelFile(filePath: string): Promise<void> {
  return invoke<void>("embeddings_import_model_file", { filePath });
}

export async function cancelEmbeddingsDownload(): Promise<void> {
  return invoke<void>("embeddings_cancel_download");
}

export async function searchSpellsSemantic(
  query: string,
  limit?: number,
): Promise<SemanticSearchResult[]> {
  return invoke<SemanticSearchResult[]>("search_spells_semantic", { query, limit });
}

export async function reindexEmbeddings(force: boolean): Promise<ReindexResult> {
  return invoke<ReindexResult>("reindex_embeddings", { force });
}
```

- [x] **Step 2.2: Verify compile-time type safety**
Run typecheck to ensure all imports and invoke definitions resolve:
Run: `pnpm typecheck` (from directory `apps/desktop`)
Expected: PASS

- [x] **Step 2.3: Run formatting and lint checks**
Run: `pnpm format && pnpm lint` (from directory `apps/desktop`)
Expected: No violations.

---

### Task 3: React Streaming Hook (`src/hooks/useLlmStream.ts`)

**Files:**
- Create: `apps/desktop/src/hooks/useLlmStream.ts`

- [x] **Step 3.1: Implement the `useLlmStream` hook**
Create `apps/desktop/src/hooks/useLlmStream.ts` using `@tauri-apps/api/event`:
```typescript
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import { cancelLlmGeneration } from "../api/llm";
import type { DoneEvent, LlmChatGrounding, TokenEvent } from "../types/llm";

export interface LlmStreamState {
  response: string;
  isGenerating: boolean;
  error: string | null;
  grounding: LlmChatGrounding | null;
  cancelled: boolean;
  timedOut: boolean;
  cancel: () => Promise<void>;
}

export function useLlmStream(streamId: string | null): LlmStreamState {
  const [response, setResponse] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grounding, setGrounding] = useState<LlmChatGrounding | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  const streamIdRef = useRef<string | null>(null);
  streamIdRef.current = streamId;

  const cancel = async () => {
    if (!streamIdRef.current) return;
    try {
      await cancelLlmGeneration(streamIdRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    if (!streamId) {
      setResponse("");
      setIsGenerating(false);
      setError(null);
      setGrounding(null);
      setCancelled(false);
      setTimedOut(false);
      return;
    }

    setResponse("");
    setIsGenerating(true);
    setError(null);
    setGrounding(null);
    setCancelled(false);
    setTimedOut(false);

    let active = true;
    const unlisteners: Array<() => void> = [];

    async function setupListeners() {
      try {
        const tokenUn = await listen<TokenEvent>(`llm://token/${streamId}`, (event) => {
          if (!active) return;
          setResponse((prev) => prev + event.payload.token);
        });

        if (!active) {
          tokenUn();
          return;
        }
        unlisteners.push(tokenUn);

        const doneUn = await listen<DoneEvent>(`llm://done/${streamId}`, (event) => {
          if (!active) return;
          setIsGenerating(false);
          setResponse((prev) =>
            event.payload.fullResponse.length > 0 ? event.payload.fullResponse : prev,
          );
          setGrounding({
            searchTerms: event.payload.searchTerms,
            groundedSpells: event.payload.groundedSpells,
          });

          if (event.payload.cancelled) {
            setCancelled(true);
            setError("Generation cancelled.");
          } else if (event.payload.timedOut) {
            setTimedOut(true);
            setError("Response timed out.");
          }
        });

        if (!active) {
          doneUn();
          return;
        }
        unlisteners.push(doneUn);
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
          setIsGenerating(false);
        }
      }
    }

    setupListeners();

    return () => {
      active = false;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [streamId]);

  return {
    response,
    isGenerating,
    error,
    grounding,
    cancelled,
    timedOut,
    cancel,
  };
}
```

- [x] **Step 3.2: Verify compilation and code quality**
Run: `pnpm typecheck && pnpm format && pnpm lint` (from directory `apps/desktop`)
Expected: PASS with no errors.

---

### Task 4: Unit Testing (`src/hooks/useLlmStream.test.tsx`)

**Files:**
- Create: `apps/desktop/src/hooks/useLlmStream.test.tsx`

- [x] **Step 4.1: Implement unit tests for the streaming hook**
Create `apps/desktop/src/hooks/useLlmStream.test.tsx` mocking Tauri's event listener and core commands to verify states:
```tsx
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelLlmGeneration } from "../api/llm";
import { useLlmStream } from "./useLlmStream";

// Mock Tauri modules
const mockListen = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (eventName: string, handler: (e: any) => void) => mockListen(eventName, handler),
}));

vi.mock("../api/llm", () => ({
  cancelLlmGeneration: vi.fn(),
}));

describe("useLlmStream", () => {
  let tokenHandler: (e: { payload: { token: string } }) => void;
  let doneHandler: (e: { payload: any }) => void;
  const mockTokenUnlisten = vi.fn();
  const mockDoneUnlisten = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockImplementation(async (eventName: string, handler: any) => {
      if (eventName.includes("llm://token/")) {
        tokenHandler = handler;
        return mockTokenUnlisten;
      }
      if (eventName.includes("llm://done/")) {
        doneHandler = handler;
        return mockDoneUnlisten;
      }
      return () => {};
    });
  });

  afterEach(() => {
    mockTokenUnlisten.mockClear();
    mockDoneUnlisten.mockClear();
  });

  it("returns initial idle state when streamId is null", () => {
    const { result } = renderHook(() => useLlmStream(null));

    expect(result.current.response).toBe("");
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.grounding).toBeNull();
    expect(result.current.cancelled).toBe(false);
    expect(result.current.timedOut).toBe(false);
    expect(mockListen).not.toHaveBeenCalled();
  });

  it("subscribes to token and done events on streamId change", async () => {
    const { result } = renderHook(({ id }) => useLlmStream(id), {
      initialProps: { id: "test-stream" },
    });

    // Wait for setup useEffect microtask
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isGenerating).toBe(true);
    expect(mockListen).toHaveBeenCalledWith("llm://token/test-stream", expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith("llm://done/test-stream", expect.any(Function));
  });

  it("accumulates tokens as they arrive", async () => {
    const { result } = renderHook(() => useLlmStream("test-stream"));
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      tokenHandler({ payload: { token: "Hello " } });
    });
    expect(result.current.response).toBe("Hello ");

    act(() => {
      tokenHandler({ payload: { token: "World!" } });
    });
    expect(result.current.response).toBe("Hello World!");
  });

  it("finalizes state and records grounding upon a done event", async () => {
    const { result } = renderHook(() => useLlmStream("test-stream"));
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      tokenHandler({ payload: { token: "Fireball." } });
    });

    act(() => {
      doneHandler({
        payload: {
          fullResponse: "Final Fireball.",
          cancelled: false,
          searchTerms: ["fireball"],
          groundedSpells: [
            {
              id: 101,
              name: "Fireball",
              school: "Evocation",
              level: 3,
              descriptionSnippet: "A ball of fire explodes.",
            },
          ],
          timedOut: false,
        },
      });
    });

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.response).toBe("Final Fireball.");
    expect(result.current.grounding).toEqual({
      searchTerms: ["fireball"],
      groundedSpells: [
        {
          id: 101,
          name: "Fireball",
          school: "Evocation",
          level: 3,
          descriptionSnippet: "A ball of fire explodes.",
        },
      ],
    });
    expect(result.current.cancelled).toBe(false);
    expect(result.current.timedOut).toBe(false);
  });

  it("handles cancelled done event correctly", async () => {
    const { result } = renderHook(() => useLlmStream("test-stream"));
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      doneHandler({
        payload: {
          fullResponse: "Partial response",
          cancelled: true,
          searchTerms: [],
          groundedSpells: [],
          timedOut: false,
        },
      });
    });

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.cancelled).toBe(true);
    expect(result.current.error).toBe("Generation cancelled.");
  });

  it("handles timedOut done event correctly", async () => {
    const { result } = renderHook(() => useLlmStream("test-stream"));
    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      doneHandler({
        payload: {
          fullResponse: "Partial response before timeout",
          cancelled: false,
          searchTerms: [],
          groundedSpells: [],
          timedOut: true,
        },
      });
    });

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.timedOut).toBe(true);
    expect(result.current.error).toBe("Response timed out.");
  });

  it("calls cancelLlmGeneration and unsubscribes on cleanup", async () => {
    const { unmount, result } = renderHook(() => useLlmStream("test-stream"));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.cancel();
    });

    expect(cancelLlmGeneration).toHaveBeenCalledWith("test-stream");

    unmount();
    expect(mockTokenUnlisten).toHaveBeenCalledTimes(1);
    expect(mockDoneUnlisten).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 4.2: Run unit test battery**
Run: `pnpm test:unit` (from directory `apps/desktop`)
Expected: All tests pass, including the new `useLlmStream` unit tests.

---

### Task 5: Spec Update & Finalization

**Files:**
- Modify: [tasks.md](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/openspec/changes/add-local-llm-chat-interface/tasks.md)

- [x] **Step 5.1: Mark Task Group 6 as complete in tasks.md**
Modify `openspec/changes/add-local-llm-chat-interface/tasks.md` to change Group 6 checklist items from `[ ]` to `[x]`:
```diff
- - [ ] 6.1 Define `LlmStatusResponse`, `EmbeddingsStatusResponse`, `ChatMessage`, `DownloadProgressEvent`, `TokenEvent`, and `DoneEvent` in `src/types/llm.ts`
- - [ ] 6.2 Add `ReindexResult` and `SemanticSearchResult` interfaces to `src/types/llm.ts`
- - [ ] 6.3 Create typed IPC wrappers for `llm_status`, `llm_download_model`, `llm_import_model_file`, `llm_cancel_download`, `llm_cancel_generation`, and `llm_chat`
- - [ ] 6.4 Add typed wrappers for `embeddings_status`, `embeddings_download_model`, `embeddings_import_model_file`, `embeddings_cancel_download`, `search_spells_semantic`, and `reindex_embeddings`
- - [ ] 6.5 Implement the streaming hook `useLlmStream(streamId)`: subscribe to `llm://token/<id>` and `llm://done/<id>` and expose generation cancellation
+ - [x] 6.1 Define `LlmStatusResponse`, `EmbeddingsStatusResponse`, `ChatMessage`, `DownloadProgressEvent`, `TokenEvent`, and `DoneEvent` in `src/types/llm.ts`
+ - [x] 6.2 Add `ReindexResult` and `SemanticSearchResult` interfaces to `src/types/llm.ts`
+ - [x] 6.3 Create typed IPC wrappers for `llm_status`, `llm_download_model`, `llm_import_model_file`, `llm_cancel_download`, `llm_cancel_generation`, and `llm_chat`
+ - [x] 6.4 Add typed wrappers for `embeddings_status`, `embeddings_download_model`, `embeddings_import_model_file`, `embeddings_cancel_download`, `search_spells_semantic`, and `reindex_embeddings`
+ - [x] 6.5 Implement the streaming hook `useLlmStream(streamId)`: subscribe to `llm://token/<id>` and `llm://done/<id>` and expose generation cancellation
```

- [x] **Step 5.2: Commit the changes**
Run:
```powershell
git add docs/superpowers/plans/2026-06-12-add-local-llm-chat-interface-task-6-frontend-types-ipc.md
git add apps/desktop/src/types/llm.ts apps/desktop/src/api/llm.ts apps/desktop/src/hooks/useLlmStream.ts apps/desktop/src/hooks/useLlmStream.test.tsx
git add openspec/changes/add-local-llm-chat-interface/tasks.md
git commit -m "feat(frontend): implement Task 6 TypeScript types, IPC wrappers, streaming hook, and tests"
```

---

## Grill-Me Review Log

### Round 1 — Pre-Implementation Check

| Question | Resolution |
| -------- | ---------- |
| SpellSummary Refactoring & Location | **Option A chosen**: Define and export `SpellSummary` in `src/types/llm.ts` to keep Task 6 focused, and perform refactoring of other components in Task 7/8. |
| useLlmStream Lifecycle Reset | Reset states immediately when streamId changes or goes `null`. This prevents rendering of stale response or grounding from prior generation when launching a new query. |
| Tauri Event Naming Alignment | Emitted event names and payload structures were verified against the backend Rust implementation to ensure perfect structural matching in types and event listeners. |

**Satisfaction estimate: 96%** — Plan reviewed and approved; ready to execute.
