# Frontend — Chat UI Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `Chat.tsx` spike with a full `ChatPanel` component tree that delivers glassmorphism chat UI, dual-model provisioning, streaming messages with RAG grounding indicators, spell links to `/edit/:id`, and complete `data-testid` coverage — consuming Task 6 types, IPC wrappers, and `useLlmStream`.

**Architecture:** Build a `components/chat/` subtree orchestrated by `ChatPanel` and a `useChatSession` hook (in-memory history, stream lifecycle, send/cancel). Reuse `EmptyState` for the LLM provisioning prompt, a shared `ModelDownloadModal` for download progress events, and `useModelStatus` / `useModelDownloadProgress` hooks for status polling and Tauri event listeners. Spell links are derived from `groundedSpells` returned on the `done` event (the FTS5 grounding set for that turn), not a library-wide regex scan.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, React Router v6, Tauri v2 (`@tauri-apps/api`, `@tauri-apps/plugin-dialog`), Vitest + `@testing-library/react`.

**Prerequisites:** Task 6 complete (`src/types/llm.ts`, `src/api/llm.ts`, `src/hooks/useLlmStream.ts`).

**Out of scope for this plan:** Task 8 (Library semantic mode), Task 10 (Playwright E2E — but all `data-testid`s must be E2E-ready), Task 11.2 (AGENTS.md update — noted in finalization step).

---

## Spec Snapshot (Task Group 7)

| Task | Requirement |
| ---- | ----------- |
| 7.1 | `ChatPanel` container — glassmorphism aesthetics, entrance animations |
| 7.2 | `ChatHeader` — integrated LLM and Embedding status badges |
| 7.3 | Provisioning UI for both models — download flow, verified side-load, download modal |
| 7.4 | `MessageList` — auto-scroll, premium bubble styling |
| 7.5 | `AssistantMessage` + `GroundedInIndicator` (search terms used) |
| 7.6 | Spell link detection → navigate to existing spell editor route `/edit/:id` |
| 7.7 | `ChatInputBar` — multi-line, Send + Cancel Generation buttons |
| 7.8 | Replace `Chat.tsx` route with new `ChatPanel` |
| 7.9 | `data-testid` on all interactive elements |

### Related spec requirements (implemented in this plan)

| Source | Requirement |
| ------ | ----------- |
| llm-chat spec | Empty state when model not provisioned; no input until ready |
| llm-chat spec | User message appears immediately; streaming assistant response |
| llm-chat spec | Errors as inline system messages; input stays enabled for retry |
| llm-chat spec | Download progress bar + byte count via `llm://download-progress` |
| llm-chat spec | Generation cancel keeps partial response visible |
| llm-chat spec | Lazy-load loading indicator on first chat when status is `ready` |
| design.md | Component tree: ChatPanel → Header, MessageList, InputBar, ModelDownloadModal |
| design.md | Spell links from FTS5 grounding set → `/edit/:id` |
| tasks.md notes | Session-only history (no persistence) |

### Deferred to Task 9 (not blocking 7.x)

| Task | Requirement |
| ---- | ----------- |
| 9.1 | Download network error inline with retry button (basic error display included in 7.3) |
| 9.2 | Disk full error with required vs available space |
| 9.3 | RAM error with "Close other applications…" guidance |
| 9.4 | Inference error as system chat message (basic version in 7.x; 9.4 formalizes) |

---

## Planned File Structure

| File | Action | Purpose |
| ---- | ------ | ------- |
| `apps/desktop/src/ui/components/chat/chatUtils.ts` | Create | `spellNameToSlug`, `formatBytes`, `createStreamId` helpers |
| `apps/desktop/src/ui/components/chat/chatUtils.test.ts` | Create | Unit tests for helpers |
| `apps/desktop/src/hooks/useModelStatus.ts` | Create | Poll `getLlmStatus` + `getEmbeddingsStatus` |
| `apps/desktop/src/hooks/useModelStatus.test.tsx` | Create | Hook unit tests |
| `apps/desktop/src/hooks/useModelDownloadProgress.ts` | Create | Listen `llm://download-progress` and `embeddings://download-progress` |
| `apps/desktop/src/hooks/useModelDownloadProgress.test.tsx` | Create | Hook unit tests |
| `apps/desktop/src/hooks/chatSessionTypes.ts` | Create | `ChatDisplayMessage` union (shared by hook + MessageList) |
| `apps/desktop/src/hooks/useChatSession.ts` | Create | Message history, send/cancel orchestration |
| `apps/desktop/src/hooks/useChatSession.test.tsx` | Create | Hook unit tests |
| `apps/desktop/src/ui/components/chat/ModelStatusBadge.tsx` | Create | Reusable status pill for LLM or embeddings |
| `apps/desktop/src/ui/components/chat/ModelProvisioningActions.tsx` | Create | Download + Add Local Model button pair |
| `apps/desktop/src/ui/components/chat/ModelDownloadModal.tsx` | Create | Progress bar modal with cancel |
| `apps/desktop/src/ui/components/chat/ChatProvisioningPrompt.tsx` | Create | LLM empty state (uses `EmptyState`) |
| `apps/desktop/src/ui/components/chat/ChatHeader.tsx` | Create | Title + dual status badges |
| `apps/desktop/src/ui/components/chat/UserMessage.tsx` | Create | User bubble |
| `apps/desktop/src/ui/components/chat/GroundedInIndicator.tsx` | Create | Search terms + spell count |
| `apps/desktop/src/ui/components/chat/SpellLink.tsx` | Create | Link to `/edit/:id` |
| `apps/desktop/src/ui/components/chat/AssistantMessage.tsx` | Create | Assistant bubble + grounding + spell links |
| `apps/desktop/src/ui/components/chat/AssistantMessage.test.tsx` | Create | Spell link rendering tests |
| `apps/desktop/src/ui/components/chat/SystemMessage.tsx` | Create | Error/info system bubble |
| `apps/desktop/src/ui/components/chat/MessageList.tsx` | Create | Scrollable list with auto-scroll |
| `apps/desktop/src/ui/components/chat/ChatInputBar.tsx` | Create | Textarea + Send/Cancel |
| `apps/desktop/src/ui/components/chat/ChatPanel.tsx` | Create | Top-level container |
| `apps/desktop/src/ui/components/chat/ChatPanel.test.tsx` | Create | Integration tests |
| `apps/desktop/src/ui/Chat.tsx` | Modify | Thin route wrapper rendering `ChatPanel` |
| `openspec/changes/add-local-llm-chat-interface/tasks.md` | Modify | Mark 7.1–7.9 complete |

---

## Type Contracts (locked for all tasks)

```typescript
// apps/desktop/src/hooks/chatSessionTypes.ts — display message union
import type { LlmChatGrounding, RagSpellContext } from "../types/llm";

export interface ChatDisplayMessageBase {
  id: string;
}

export interface UserDisplayMessage extends ChatDisplayMessageBase {
  kind: "user";
  content: string;
}

export interface AssistantDisplayMessage extends ChatDisplayMessageBase {
  kind: "assistant";
  content: string;
  grounding: LlmChatGrounding | null;
  groundedSpells: RagSpellContext[];
  isStreaming: boolean;
  cancelled: boolean;
  timedOut: boolean;
}

export interface SystemDisplayMessage extends ChatDisplayMessageBase {
  kind: "system";
  content: string;
}

export type ChatDisplayMessage =
  | UserDisplayMessage
  | AssistantDisplayMessage
  | SystemDisplayMessage;

// IPC status field names (Task 6 actual shapes — NOT design.md's `state` alias)
// LlmStatusResponse.status: LlmStatus
// EmbeddingsStatusResponse.state: EmbeddingsStatus
```

---

### Task 1: Shared Utilities (`chatUtils.ts`)

**Files:**
- Create: `apps/desktop/src/ui/components/chat/chatUtils.ts`
- Test: `apps/desktop/src/ui/components/chat/chatUtils.test.ts`

- [x] **Step 1.1: Write failing tests**

```typescript
// apps/desktop/src/ui/components/chat/chatUtils.test.ts
import { describe, expect, it } from "vitest";
import { createStreamId, formatBytes, spellNameToSlug } from "./chatUtils";

describe("spellNameToSlug", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(spellNameToSlug("Fireball")).toBe("fireball");
    expect(spellNameToSlug("Magic Missile")).toBe("magic-missile");
  });
});

describe("formatBytes", () => {
  it("formats human-readable sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(734003200)).toBe("700.0 MB");
  });
});

describe("createStreamId", () => {
  it("returns alphanumeric-hyphen-underscore id under 128 chars", () => {
    const id = createStreamId();
    expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(id.length).toBeLessThanOrEqual(128);
  });
});
```

- [x] **Step 1.2: Run tests to verify they fail**

Run: `pnpm test:unit -- src/ui/components/chat/chatUtils.test.ts` (from `apps/desktop`)
Expected: FAIL — module not found

- [x] **Step 1.3: Implement utilities**

```typescript
// apps/desktop/src/ui/components/chat/chatUtils.ts
export function spellNameToSlug(name: string): string {
  return name.replace(/\s+/g, "-").toLowerCase();
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}

export function createStreamId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function canSendChat(llmStatus: string): boolean {
  return llmStatus === "ready" || llmStatus === "loaded";
}
```

- [x] **Step 1.4: Run tests to verify they pass**

Run: `pnpm test:unit -- src/ui/components/chat/chatUtils.test.ts`
Expected: PASS

- [x] **Step 1.5: Commit**

```bash
git add apps/desktop/src/ui/components/chat/chatUtils.ts apps/desktop/src/ui/components/chat/chatUtils.test.ts
git commit -m "feat(chat): add shared chat utility helpers"
```

---

### Task 2: Model Status Hook (`useModelStatus.ts`)

**Files:**
- Create: `apps/desktop/src/hooks/useModelStatus.ts`
- Test: `apps/desktop/src/hooks/useModelStatus.test.tsx`

- [x] **Step 2.1: Write failing tests**

```tsx
// apps/desktop/src/hooks/useModelStatus.test.tsx
// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmbeddingsStatus, getLlmStatus } from "../api/llm";
import { useModelStatus } from "./useModelStatus";

vi.mock("../api/llm", () => ({
  getLlmStatus: vi.fn(),
  getEmbeddingsStatus: vi.fn(),
}));

describe("useModelStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLlmStatus).mockResolvedValue({
      status: "ready",
      modelPath: "/vault/models/tinyllama.gguf",
    });
    vi.mocked(getEmbeddingsStatus).mockResolvedValue({ state: "ready" });
  });

  it("loads both statuses on mount", async () => {
    const { result } = renderHook(() => useModelStatus());
    await waitFor(() => expect(result.current.llm.status).toBe("ready"));
    expect(result.current.embeddings.state).toBe("ready");
    expect(getLlmStatus).toHaveBeenCalled();
    expect(getEmbeddingsStatus).toHaveBeenCalled();
  });

  it("exposes refresh function", async () => {
    const { result } = renderHook(() => useModelStatus());
    await waitFor(() => expect(result.current.llm.status).toBe("ready"));
    vi.mocked(getLlmStatus).mockResolvedValueOnce({
      status: "loaded",
      modelPath: "/vault/models/tinyllama.gguf",
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.llm.status).toBe("loaded");
  });
});
```

- [x] **Step 2.2: Run tests — expect FAIL**

Run: `pnpm test:unit -- src/hooks/useModelStatus.test.tsx`

- [x] **Step 2.3: Implement hook**

```typescript
// apps/desktop/src/hooks/useModelStatus.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { getEmbeddingsStatus, getLlmStatus } from "../api/llm";
import type { EmbeddingsStatusResponse, LlmStatusResponse } from "../types/llm";

const ACTIVE_POLL_MS = 1500;

export function useModelStatus() {
  const [llm, setLlm] = useState<LlmStatusResponse>({
    status: "notProvisioned",
    modelPath: "",
  });
  const [embeddings, setEmbeddings] = useState<EmbeddingsStatusResponse>({
    state: "notProvisioned",
  });
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [llmStatus, embStatus] = await Promise.all([
        getLlmStatus(),
        getEmbeddingsStatus(),
      ]);
      if (!mountedRef.current) return;
      setLlm(llmStatus);
      setEmbeddings(embStatus);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  const isActive =
    llm.status === "downloading" ||
    embeddings.state === "downloading" ||
    embeddings.state === "initializing";

  useEffect(() => {
    if (!isActive) return;
    const id = window.setInterval(() => {
      void refresh();
    }, ACTIVE_POLL_MS);
    return () => window.clearInterval(id);
  }, [isActive, refresh]);

  return { llm, embeddings, error, refresh };
}
```

- [x] **Step 2.4: Run tests — expect PASS**

- [x] **Step 2.5: Commit**

```bash
git add apps/desktop/src/hooks/useModelStatus.ts apps/desktop/src/hooks/useModelStatus.test.tsx
git commit -m "feat(chat): add useModelStatus hook for LLM and embedding badges"
```

---

### Task 3: Download Progress Hook (`useModelDownloadProgress.ts`)

**Files:**
- Create: `apps/desktop/src/hooks/useModelDownloadProgress.ts`
- Test: `apps/desktop/src/hooks/useModelDownloadProgress.test.tsx`

- [x] **Step 3.1: Write failing tests**

```tsx
// apps/desktop/src/hooks/useModelDownloadProgress.test.tsx
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useModelDownloadProgress } from "./useModelDownloadProgress";

const mockListen = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (e: { payload: unknown }) => void) =>
    mockListen(event, handler),
}));

describe("useModelDownloadProgress", () => {
  let llmHandler: (e: { payload: { bytesDownloaded: number; totalBytes: number } }) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockImplementation(async (event: string, handler: typeof llmHandler) => {
      if (event === "llm://download-progress") llmHandler = handler;
      return () => {};
    });
  });

  it("tracks llm download progress events", async () => {
    const { result } = renderHook(() => useModelDownloadProgress("llm", true));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      llmHandler({ payload: { bytesDownloaded: 350_000_000, totalBytes: 700_000_000 } });
    });
    expect(result.current.bytesDownloaded).toBe(350_000_000);
    expect(result.current.totalBytes).toBe(700_000_000);
    expect(result.current.fraction).toBeCloseTo(0.5);
  });
});
```

- [x] **Step 3.2: Run tests — expect FAIL**

- [x] **Step 3.3: Implement hook**

```typescript
// apps/desktop/src/hooks/useModelDownloadProgress.ts
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import type {
  DownloadProgressEvent,
  EmbeddingsDownloadProgressEvent,
} from "../types/llm";

export type ModelKind = "llm" | "embeddings";

const EVENT_BY_KIND: Record<ModelKind, string> = {
  llm: "llm://download-progress",
  embeddings: "embeddings://download-progress",
};

export function useModelDownloadProgress(kind: ModelKind, active: boolean) {
  const [bytesDownloaded, setBytesDownloaded] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);

  useEffect(() => {
    if (!active) {
      setBytesDownloaded(0);
      setTotalBytes(0);
      return;
    }

    let mounted = true;
    let unlisten: (() => void) | null = null;

    async function setup() {
      unlisten = await listen<DownloadProgressEvent | EmbeddingsDownloadProgressEvent>(
        EVENT_BY_KIND[kind],
        (event) => {
          if (!mounted) return;
          setBytesDownloaded(event.payload.bytesDownloaded);
          setTotalBytes(event.payload.totalBytes);
        },
      );
    }

    void setup();

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [kind, active]);

  const fraction = totalBytes > 0 ? bytesDownloaded / totalBytes : 0;

  return { bytesDownloaded, totalBytes, fraction };
}
```

- [x] **Step 3.4: Run tests — expect PASS**

- [x] **Step 3.5: Commit**

```bash
git add apps/desktop/src/hooks/useModelDownloadProgress.ts apps/desktop/src/hooks/useModelDownloadProgress.test.tsx
git commit -m "feat(chat): add download progress event hook"
```

---

### Task 4: Model Status Badge + Provisioning Actions (7.2, 7.3 partial)

**Files:**
- Create: `apps/desktop/src/ui/components/chat/ModelStatusBadge.tsx`
- Create: `apps/desktop/src/ui/components/chat/ModelProvisioningActions.tsx`

- [x] **Step 4.1: Implement `ModelStatusBadge`**

```tsx
// apps/desktop/src/ui/components/chat/ModelStatusBadge.tsx
import clsx from "classnames";

const LABELS: Record<string, string> = {
  notProvisioned: "Not installed",
  downloading: "Downloading",
  initializing: "Initializing",
  ready: "Ready",
  loaded: "Loaded",
  error: "Error",
};

const COLORS: Record<string, string> = {
  notProvisioned: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  downloading: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  initializing: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  loaded: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  error: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

interface ModelStatusBadgeProps {
  label: string;
  status: string;
  testId: string;
}

export function ModelStatusBadge({ label, status, testId }: ModelStatusBadgeProps) {
  const text = LABELS[status] ?? status;
  return (
    <span
      data-testid={testId}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        COLORS[status] ?? COLORS.notProvisioned,
      )}
      title={`${label}: ${text}`}
    >
      <span className="font-semibold">{label}</span>
      <span aria-hidden="true">·</span>
      <span>{text}</span>
    </span>
  );
}
```

- [x] **Step 4.2: Implement `ModelProvisioningActions`**

```tsx
// apps/desktop/src/ui/components/chat/ModelProvisioningActions.tsx
interface ModelProvisioningActionsProps {
  modelLabel: string;
  onDownload: () => void;
  onImport: () => void;
  downloadTestId: string;
  importTestId: string;
  disabled?: boolean;
}

export function ModelProvisioningActions({
  modelLabel,
  onDownload,
  onImport,
  downloadTestId,
  importTestId,
  disabled = false,
}: ModelProvisioningActionsProps) {
  return (
    <div className="flex flex-wrap gap-3 justify-center">
      <button
        type="button"
        data-testid={downloadTestId}
        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
        onClick={onDownload}
        disabled={disabled}
      >
        Download {modelLabel}
      </button>
      <button
        type="button"
        data-testid={importTestId}
        className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
        onClick={onImport}
        disabled={disabled}
      >
        Add Local {modelLabel}
      </button>
    </div>
  );
}
```

- [x] **Step 4.3: Run typecheck + lint**

Run: `pnpm typecheck && pnpm lint` (from `apps/desktop`)
Expected: PASS

- [x] **Step 4.4: Commit**

```bash
git add apps/desktop/src/ui/components/chat/ModelStatusBadge.tsx apps/desktop/src/ui/components/chat/ModelProvisioningActions.tsx
git commit -m "feat(chat): add status badge and provisioning action buttons"
```

---

### Task 5: Model Download Modal (7.3)

**Files:**
- Create: `apps/desktop/src/ui/components/chat/ModelDownloadModal.tsx`

- [x] **Step 5.1: Implement modal** (mirror `PrintOptionsDialog` overlay pattern)

```tsx
// apps/desktop/src/ui/components/chat/ModelDownloadModal.tsx
import { formatBytes } from "./chatUtils";

interface ModelDownloadModalProps {
  isOpen: boolean;
  modelLabel: string;
  bytesDownloaded: number;
  totalBytes: number;
  onCancel: () => void;
  testId?: string;
}

export function ModelDownloadModal({
  isOpen,
  modelLabel,
  bytesDownloaded,
  totalBytes,
  onCancel,
  testId = "model-download-modal",
}: ModelDownloadModalProps) {
  if (!isOpen) return null;

  const percent = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close download modal backdrop"
        data-testid={`${testId}-backdrop`}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 border-none p-0 m-0 w-full h-full cursor-default"
        onClick={onCancel}
      />
      <dialog
        open
        aria-labelledby={`${testId}-title`}
        data-testid={testId}
        className="relative z-10 w-full max-w-md rounded-2xl border border-neutral-200/60 dark:border-neutral-700/60 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md p-6 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <h2 id={`${testId}-title`} className="text-lg font-semibold mb-2">
          Downloading {modelLabel}
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4" data-testid={`${testId}-bytes`}>
          {formatBytes(bytesDownloaded)} / {formatBytes(totalBytes)} ({percent}%)
        </p>
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          data-testid={`${testId}-progress-bar`}
          className="h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden mb-4"
        >
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <button
          type="button"
          data-testid={`${testId}-cancel-button`}
          className="w-full px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 text-sm"
          onClick={onCancel}
        >
          Cancel Download
        </button>
      </dialog>
    </div>
  );
}
```

- [x] **Step 5.2: Run typecheck + lint**

- [x] **Step 5.3: Commit**

```bash
git add apps/desktop/src/ui/components/chat/ModelDownloadModal.tsx
git commit -m "feat(chat): add model download progress modal"
```

---

### Task 6: Chat Provisioning Prompt (7.3)

**Files:**
- Create: `apps/desktop/src/ui/components/chat/ChatProvisioningPrompt.tsx`

- [x] **Step 6.1: Implement prompt** (LLM gate — chat input hidden until `ready` or `loaded`)

```tsx
// apps/desktop/src/ui/components/chat/ChatProvisioningPrompt.tsx
import { EmptyState, EmptyStateLiveRegion } from "../EmptyState";
import { ModelProvisioningActions } from "./ModelProvisioningActions";

interface ChatProvisioningPromptProps {
  onDownloadLlm: () => void;
  onImportLlm: () => void;
  onDownloadEmbeddings: () => void;
  onImportEmbeddings: () => void;
  llmNeedsSetup: boolean; // notProvisioned OR error
  llmErrorMessage?: string | null;
  embeddingsNotProvisioned: boolean;
  disabled?: boolean;
}

export function ChatProvisioningPrompt({
  onDownloadLlm,
  onImportLlm,
  onDownloadEmbeddings,
  onImportEmbeddings,
  llmNeedsSetup,
  llmErrorMessage,
  embeddingsNotProvisioned,
  disabled = false,
}: ChatProvisioningPromptProps) {
  const active = llmNeedsSetup;

  return (
    <>
      <EmptyStateLiveRegion
        active={active}
        testId="chat-provisioning-empty-state"
        heading="Set up local AI"
        description={
          llmErrorMessage
            ? `Model setup failed: ${llmErrorMessage}`
            : "Download the TinyLlama chat model (~700 MB) to ask questions about your spell library. Chat works without the embedding model, but semantic search in the Library requires it."
        }
      />
      <EmptyState
        testId="chat-provisioning-empty-state"
        heading="Set up local AI"
        description={
          llmErrorMessage
            ? `Model setup failed: ${llmErrorMessage}`
            : "Download the TinyLlama chat model (~700 MB) to ask questions about your spell library. Chat works without the embedding model, but semantic search in the Library requires it."
        }
        headingLevel="h2"
      >
        {llmNeedsSetup ? (
          <ModelProvisioningActions
            modelLabel="Chat Model"
            onDownload={onDownloadLlm}
            onImport={onImportLlm}
            downloadTestId="chat-llm-download-button"
            importTestId="chat-llm-import-button"
            disabled={disabled}
          />
        ) : null}
        {embeddingsNotProvisioned ? (
          <div className="mt-4 w-full border-t border-neutral-200 dark:border-neutral-700 pt-4">
            <p className="text-xs text-neutral-500 mb-3">Optional: enable Library semantic search</p>
            <ModelProvisioningActions
              modelLabel="Embedding Model"
              onDownload={onDownloadEmbeddings}
              onImport={onImportEmbeddings}
              downloadTestId="chat-embeddings-download-button"
              importTestId="chat-embeddings-import-button"
              disabled={disabled}
            />
          </div>
        ) : null}
      </EmptyState>
    </>
  );
}
```

- [x] **Step 6.2: Commit**

```bash
git add apps/desktop/src/ui/components/chat/ChatProvisioningPrompt.tsx
git commit -m "feat(chat): add provisioning empty state for LLM and embeddings"
```

---

### Task 7: Message Components (7.4, 7.5, 7.6)

**Files:**
- Create: `apps/desktop/src/ui/components/chat/SpellLink.tsx`
- Create: `apps/desktop/src/ui/components/chat/GroundedInIndicator.tsx`
- Create: `apps/desktop/src/ui/components/chat/UserMessage.tsx`
- Create: `apps/desktop/src/ui/components/chat/SystemMessage.tsx`
- Create: `apps/desktop/src/ui/components/chat/AssistantMessage.tsx`
- Test: `apps/desktop/src/ui/components/chat/AssistantMessage.test.tsx`

- [x] **Step 7.1: Implement `SpellLink`**

```tsx
// apps/desktop/src/ui/components/chat/SpellLink.tsx
import { Link } from "react-router-dom";
import { spellNameToSlug } from "./chatUtils";

interface SpellLinkProps {
  id: number;
  name: string;
}

export function SpellLink({ id, name }: SpellLinkProps) {
  return (
    <Link
      to={`/edit/${id}`}
      data-testid={`spell-link-${spellNameToSlug(name)}`}
      className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:text-blue-500"
    >
      {name}
    </Link>
  );
}
```

- [x] **Step 7.2: Implement `GroundedInIndicator`**

```tsx
// apps/desktop/src/ui/components/chat/GroundedInIndicator.tsx
import type { LlmChatGrounding } from "../../../types/llm";

interface GroundedInIndicatorProps {
  grounding: LlmChatGrounding | null;
}

export function GroundedInIndicator({ grounding }: GroundedInIndicatorProps) {
  if (!grounding || grounding.searchTerms.length === 0) return null;

  const terms = grounding.searchTerms.join(", ");
  const spellCount = grounding.groundedSpells.length;

  return (
    <p
      className="text-xs text-neutral-500 dark:text-neutral-400 mt-2"
      data-testid="grounded-in-indicator"
    >
      Grounded in: <span className="italic">{terms}</span>
      {spellCount > 0 ? ` (${spellCount} spell${spellCount === 1 ? "" : "s"})` : null}
    </p>
  );
}
```

- [x] **Step 7.3: Implement `UserMessage` and `SystemMessage`**

```tsx
// apps/desktop/src/ui/components/chat/UserMessage.tsx
interface UserMessageProps {
  content: string;
  messageId: string;
}

export function UserMessage({ content, messageId }: UserMessageProps) {
  return (
    <div className="flex justify-end" data-testid={`chat-message-${messageId}`}>
      <div
        data-testid="chat-user-bubble"
        className="max-w-[85%] rounded-2xl rounded-br-md bg-blue-600 text-white px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm"
      >
        {content}
      </div>
    </div>
  );
}
```

```tsx
// apps/desktop/src/ui/components/chat/SystemMessage.tsx
interface SystemMessageProps {
  content: string;
  messageId: string;
}

export function SystemMessage({ content, messageId }: SystemMessageProps) {
  return (
    <div className="flex justify-center" data-testid={`chat-message-${messageId}`}>
      <output
        data-testid="chat-system-message"
        className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2 max-w-[90%] text-center"
      >
        {content}
      </output>
    </div>
  );
}
```

- [x] **Step 7.4: Implement `AssistantMessage` with spell link segmentation**

```tsx
// apps/desktop/src/ui/components/chat/AssistantMessage.tsx
import type { RagSpellContext } from "../../../types/llm";
import { GroundedInIndicator } from "./GroundedInIndicator";
import { SpellLink } from "./SpellLink";

interface AssistantMessageProps {
  content: string;
  messageId: string;
  groundedSpells: RagSpellContext[];
  searchTerms: string[];
  isStreaming: boolean;
}

function segmentContentWithSpellLinks(content: string, spells: RagSpellContext[]) {
  if (spells.length === 0) return [content];

  const sorted = [...spells].sort((a, b) => b.name.length - a.name.length);
  const pattern = new RegExp(
    `(${sorted.map((s) => s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );

  return content.split(pattern).map((part, index) => {
    const match = sorted.find((s) => s.name.toLowerCase() === part.toLowerCase());
    if (match) {
      return <SpellLink key={`${match.id}-${index}`} id={match.id} name={match.name} />;
    }
    return part;
  });
}

export function AssistantMessage({
  content,
  messageId,
  groundedSpells,
  searchTerms,
  isStreaming,
}: AssistantMessageProps) {
  return (
    <div className="flex justify-start" data-testid={`chat-message-${messageId}`}>
      <div className="max-w-[85%]">
        <div
          data-testid="chat-assistant-bubble"
          className="rounded-2xl rounded-bl-md bg-white/80 dark:bg-neutral-800/80 backdrop-blur-sm border border-neutral-200/60 dark:border-neutral-700/60 px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm"
        >
          {segmentContentWithSpellLinks(content, groundedSpells)}
          {isStreaming ? (
            <span className="inline-block w-2 h-4 ml-0.5 bg-neutral-400 animate-pulse" aria-hidden="true" />
          ) : null}
        </div>
        <GroundedInIndicator
          grounding={{ searchTerms, groundedSpells }}
        />
      </div>
    </div>
  );
}
```

- [x] **Step 7.5: Write `AssistantMessage` tests**

```tsx
// apps/desktop/src/ui/components/chat/AssistantMessage.test.tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AssistantMessage } from "./AssistantMessage";

describe("AssistantMessage", () => {
  it("renders spell names as links to the editor route", () => {
    render(
      <MemoryRouter>
        <AssistantMessage
          messageId="a1"
          content="Try Fireball for area damage."
          searchTerms={["fireball"]}
          groundedSpells={[
            { id: 42, name: "Fireball", level: 3, descriptionSnippet: "Explosion." },
          ]}
          isStreaming={false}
        />
      </MemoryRouter>,
    );

    const link = screen.getByTestId("spell-link-fireball");
    expect(link.getAttribute("href")).toBe("/edit/42");
    expect(screen.getByTestId("grounded-in-indicator").textContent).toContain("fireball");
  });
});
```

- [x] **Step 7.6: Run tests**

Run: `pnpm test:unit -- src/ui/components/chat/AssistantMessage.test.tsx`
Expected: PASS

- [x] **Step 7.7: Commit**

```bash
git add apps/desktop/src/ui/components/chat/SpellLink.tsx apps/desktop/src/ui/components/chat/GroundedInIndicator.tsx apps/desktop/src/ui/components/chat/UserMessage.tsx apps/desktop/src/ui/components/chat/SystemMessage.tsx apps/desktop/src/ui/components/chat/AssistantMessage.tsx apps/desktop/src/ui/components/chat/AssistantMessage.test.tsx
git commit -m "feat(chat): add message bubbles with grounding and spell links"
```

---

### Task 8: MessageList + ChatInputBar (7.4, 7.7)

**Files:**
- Create: `apps/desktop/src/ui/components/chat/MessageList.tsx`
- Create: `apps/desktop/src/ui/components/chat/ChatInputBar.tsx`

- [x] **Step 8.1: Implement `MessageList` with auto-scroll**

```tsx
// apps/desktop/src/ui/components/chat/MessageList.tsx
import { useEffect, useRef } from "react";
import type { ChatDisplayMessage } from "../../../hooks/chatSessionTypes";
import { AssistantMessage } from "./AssistantMessage";
import { SystemMessage } from "./SystemMessage";
import { UserMessage } from "./UserMessage";

interface MessageListProps {
  messages: ChatDisplayMessage[];
  isModelLoading: boolean;
}

export function MessageList({ messages, isModelLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div
      data-testid="chat-message-list"
      className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-[200px]"
    >
      {messages.map((message) => {
        if (message.kind === "user") {
          return <UserMessage key={message.id} messageId={message.id} content={message.content} />;
        }
        if (message.kind === "system") {
          return <SystemMessage key={message.id} messageId={message.id} content={message.content} />;
        }
        return (
          <AssistantMessage
            key={message.id}
            messageId={message.id}
            content={message.content}
            searchTerms={message.grounding?.searchTerms ?? []}
            groundedSpells={message.groundedSpells}
            isStreaming={message.isStreaming}
          />
        );
      })}
      {isModelLoading ? (
        <output
          data-testid="chat-model-loading-indicator"
          className="text-sm text-neutral-500 animate-pulse"
        >
          Loading model…
        </output>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [x] **Step 8.2: Implement `ChatInputBar`**

```tsx
// apps/desktop/src/ui/components/chat/ChatInputBar.tsx
import { useCallback, type KeyboardEvent } from "react";

interface ChatInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  isGenerating: boolean;
  disabled: boolean;
}

export function ChatInputBar({
  value,
  onChange,
  onSend,
  onCancel,
  isGenerating,
  disabled,
}: ChatInputBarProps) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (!disabled && !isGenerating && value.trim()) {
          onSend();
        }
      }
    },
    [disabled, isGenerating, onSend, value],
  );

  return (
    <div
      data-testid="chat-input-bar"
      className="flex flex-col gap-2 border-t border-neutral-200/60 dark:border-neutral-700/60 pt-3"
    >
      <label htmlFor="chat-input" className="sr-only">
        Chat message
      </label>
      <textarea
        id="chat-input"
        data-testid="chat-input"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Ask about spells in your library…"
        className="w-full resize-y rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-sm px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          data-testid="btn-cancel-chat"
          className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 text-sm disabled:opacity-40"
          onClick={onCancel}
          disabled={!isGenerating}
        >
          Cancel Generation
        </button>
        <button
          type="button"
          data-testid="btn-ask-chat"
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-40"
          onClick={onSend}
          disabled={disabled || isGenerating || !value.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
```

- [x] **Step 8.3: Commit**

```bash
git add apps/desktop/src/ui/components/chat/MessageList.tsx apps/desktop/src/ui/components/chat/ChatInputBar.tsx
git commit -m "feat(chat): add message list auto-scroll and input bar"
```

---

### Task 9: Chat Session Hook (`useChatSession.ts`)

**Files:**
- Create: `apps/desktop/src/hooks/useChatSession.ts`
- Test: `apps/desktop/src/hooks/useChatSession.test.tsx`

- [x] **Step 9.1: Write failing tests**

```tsx
// apps/desktop/src/hooks/useChatSession.test.tsx
// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startLlmChat } from "../api/llm";
import { useChatSession } from "./useChatSession";

const mockStream = {
  response: "",
  isGenerating: false,
  error: null as string | null,
  grounding: null,
  cancelled: false,
  timedOut: false,
  cancel: vi.fn(),
};

vi.mock("../api/llm", () => ({ startLlmChat: vi.fn() }));
vi.mock("./useLlmStream", () => ({
  useLlmStream: vi.fn(() => mockStream),
}));

describe("useChatSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStream.response = "";
    mockStream.isGenerating = false;
    mockStream.error = null;
  });

  it("captures prior history before adding the new user turn", async () => {
    vi.mocked(startLlmChat).mockResolvedValue(undefined);
    const { result } = renderHook(() => useChatSession("loaded"));

    act(() => {
      result.current.setDraft("Second question");
    });
    await act(async () => {
      await result.current.send();
    });

    await waitFor(() => expect(startLlmChat).toHaveBeenCalled());
    const [, streamId, history] = vi.mocked(startLlmChat).mock.calls[0];
    expect(streamId).toMatch(/^chat-/);
    expect(history).toEqual([]); // first turn has empty prior history
    expect(result.current.messages.some((m) => m.kind === "user")).toBe(true);
  });
});
```

- [x] **Step 9.2: Create `chatSessionTypes.ts` and implement hook**

Create `apps/desktop/src/hooks/chatSessionTypes.ts` with the union from Type Contracts.

**Critical implementation rules:**
1. **History capture:** Call `toApiHistory()` *before* `setMessages` to get prior turns; pass that array to `startLlmChat(message, streamId, priorHistory)` — the `message` arg is the current user query.
2. **Listener race:** Do **not** call `startLlmChat` synchronously inside `send()`. Instead, store a pending request and invoke from a `useEffect` once `streamId` is set (after `useLlmStream` listeners attach):

```typescript
// apps/desktop/src/hooks/useChatSession.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { startLlmChat } from "../api/llm";
import type { ChatMessage } from "../types/llm";
import { useLlmStream } from "./useLlmStream";
import { canSendChat, createStreamId } from "../ui/components/chat/chatUtils";
import type { ChatDisplayMessage } from "./chatSessionTypes";

export type {
  UserDisplayMessage,
  AssistantDisplayMessage,
  SystemDisplayMessage,
  ChatDisplayMessage,
} from "./chatSessionTypes";

interface PendingChatRequest {
  message: string;
  history: ChatMessage[];
  assistantId: string;
}

export function useChatSession(llmStatus: string) {
  const [messages, setMessages] = useState<ChatDisplayMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streamId, setStreamId] = useState<string | null>(null);
  const [pendingChat, setPendingChat] = useState<PendingChatRequest | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const assistantIdRef = useRef<string | null>(null);

  const stream = useLlmStream(streamId);

  const toApiHistory = useCallback((): ChatMessage[] => {
    return messages
      .filter((m): m is Extract<ChatDisplayMessage, { kind: "user" | "assistant" }> =>
        m.kind === "user" || m.kind === "assistant",
      )
      .map((m) => ({ role: m.kind, content: m.content }));
  }, [messages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || stream.isGenerating || !canSendChat(llmStatus)) return;

    const priorHistory = toApiHistory();
    const userId = `user-${Date.now()}`;
    const assistantId = `assistant-${Date.now()}`;
    assistantIdRef.current = assistantId;

    setMessages((prev) => [
      ...prev,
      { id: userId, kind: "user", content: text },
      {
        id: assistantId,
        kind: "assistant",
        content: "",
        grounding: null,
        groundedSpells: [],
        isStreaming: true,
        cancelled: false,
        timedOut: false,
      },
    ]);
    setDraft("");

    if (llmStatus === "ready") {
      setIsModelLoading(true);
    }

    const nextStreamId = createStreamId();
    setPendingChat({ message: text, history: priorHistory, assistantId });
    setStreamId(nextStreamId);
  }, [draft, llmStatus, stream.isGenerating, toApiHistory]);

  // Invoke AFTER streamId is set and useLlmStream listeners are subscribed
  useEffect(() => {
    if (!streamId || !pendingChat) return;

    let active = true;

    async function invokeChat() {
      // One microtask tick so useLlmStream's listen() setup runs first
      await Promise.resolve();
      if (!active) return;

      try {
        await startLlmChat(pendingChat.message, streamId, pendingChat.history);
      } catch (err) {
        if (!active) return;
        setIsModelLoading(false);
        setStreamId(null);
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== pendingChat.assistantId)
            .concat({
              id: `system-${Date.now()}`,
              kind: "system",
              content: err instanceof Error ? err.message : String(err),
            }),
        );
      } finally {
        if (active) setPendingChat(null);
      }
    }

    void invokeChat();
    return () => {
      active = false;
    };
  }, [streamId, pendingChat]);

  useEffect(() => {
    if (!stream.isGenerating && stream.response) {
      setIsModelLoading(false);
    }
  }, [stream.isGenerating, stream.response]);

  useEffect(() => {
    const assistantId = assistantIdRef.current;
    if (!assistantId) return;

    setMessages((prev) =>
      prev.map((m) => {
        if (m.kind !== "assistant" || m.id !== assistantId) return m;
        return {
          ...m,
          content: stream.response || m.content,
          grounding: stream.grounding,
          groundedSpells: stream.grounding?.groundedSpells ?? m.groundedSpells,
          isStreaming: stream.isGenerating,
          cancelled: stream.cancelled,
          timedOut: stream.timedOut,
        };
      }),
    );

    if (!stream.isGenerating && stream.error && stream.response) {
      return; // partial cancel/timeout — keep assistant bubble
    }

    if (!stream.isGenerating && stream.error && !stream.response) {
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== assistantId),
        { id: `system-${Date.now()}`, kind: "system", content: stream.error ?? "Unknown error" },
      ]);
    }
  }, [stream.response, stream.isGenerating, stream.grounding, stream.error, stream.cancelled, stream.timedOut]);

  const cancel = useCallback(async () => {
    await stream.cancel();
  }, [stream]);

  return {
    messages,
    draft,
    setDraft,
    send,
    cancel,
    isGenerating: stream.isGenerating,
    isModelLoading,
  };
}
```

- [x] **Step 9.3: Run hook tests — expect PASS**

- [x] **Step 9.4: Commit**

```bash
git add apps/desktop/src/hooks/useChatSession.ts apps/desktop/src/hooks/chatSessionTypes.ts apps/desktop/src/hooks/useChatSession.test.tsx
git commit -m "feat(chat): add useChatSession orchestration hook"
```

---

### Task 10: ChatHeader (7.2)

**Files:**
- Create: `apps/desktop/src/ui/components/chat/ChatHeader.tsx`

- [ ] **Step 10.1: Implement header**

```tsx
// apps/desktop/src/ui/components/chat/ChatHeader.tsx
import type { EmbeddingsStatusResponse, LlmStatusResponse } from "../../../types/llm";
import { ModelStatusBadge } from "./ModelStatusBadge";

interface ChatHeaderProps {
  llm: LlmStatusResponse;
  embeddings: EmbeddingsStatusResponse;
}

export function ChatHeader({ llm, embeddings }: ChatHeaderProps) {
  return (
    <header
      data-testid="chat-header"
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-neutral-200/60 dark:border-neutral-700/60"
    >
      <h1 className="text-xl font-bold tracking-tight">Ask the Spellbook</h1>
      <div className="flex flex-wrap gap-2" data-testid="chat-status-badges">
        <ModelStatusBadge label="LLM" status={llm.status} testId="chat-llm-status-badge" />
        <ModelStatusBadge
          label="Embeddings"
          status={embeddings.state}
          testId="chat-embeddings-status-badge"
        />
      </div>
    </header>
  );
}
```

- [ ] **Step 10.2: Commit**

```bash
git add apps/desktop/src/ui/components/chat/ChatHeader.tsx
git commit -m "feat(chat): add header with LLM and embedding status badges"
```

---

### Task 11: ChatPanel Container (7.1, 7.3 wiring)

**Files:**
- Create: `apps/desktop/src/ui/components/chat/ChatPanel.tsx`
- Test: `apps/desktop/src/ui/components/chat/ChatPanel.test.tsx`

- [ ] **Step 11.1: Implement `ChatPanel`** (glass container + provisioning orchestration)

Key responsibilities:
- `useModelStatus()` for badges and gating
- `useChatSession(llm.status)` for messages
- Track `activeDownload: { kind: 'llm' | 'embeddings' } | null` state
- `useModelDownloadProgress(kind, isDownloading)` for modal
- File picker via `@tauri-apps/plugin-dialog` `open()`:

```typescript
import { open } from "@tauri-apps/plugin-dialog";

async function pickModelFile(): Promise<string | null> {
  const selected = await open({ multiple: false });
  if (selected === null) return null;
  return Array.isArray(selected) ? selected[0] : selected;
}
```

- Download handlers call `downloadLlmModel()` / `downloadEmbeddingsModel()` then set `activeDownload`
- Import handlers call `importLlmModelFile(path)` / `importEmbeddingsModelFile(path)` then `refresh()`
- Cancel download calls `cancelLlmDownload()` / `cancelEmbeddingsDownload()`
- Close modal + `refresh()` when status leaves `downloading`
- Auto-open download modal when `llm.status === 'downloading'` or `embeddings.state === 'downloading'` (covers page revisit mid-download)
- Gate provisioning prompt with `llmNeedsSetup = llm.status === 'notProvisioned' || llm.status === 'error'` (not just `notProvisioned`)
- Surface import/download IPC errors as `SystemMessage` in chat OR inline under provisioning prompt via `llm.lastError`

Glass + entrance wrapper classes (use existing `fade-in` + `zoom-in-95` utilities from `index.css`; do **not** use undefined `slide-in-from-bottom-2`):

```tsx
<div
  data-testid="chat-panel"
  className="flex flex-col h-[calc(100vh-12rem)] min-h-[480px] rounded-2xl border border-neutral-200/50 dark:border-neutral-700/50 bg-white/60 dark:bg-neutral-900/50 backdrop-blur-xl shadow-xl p-4 sm:p-6 animate-in fade-in zoom-in-95 duration-300"
>
```

Layout:
1. `ChatHeader`
2. If `llm.status === 'downloading'` or active download → `ModelDownloadModal` (hide input)
3. Else if `!canSendChat(llm.status)` → `ChatProvisioningPrompt` with `llmNeedsSetup` + `llmErrorMessage={llm.lastError}` (no `ChatInputBar`)
4. Else → `MessageList` + `ChatInputBar`

- [ ] **Step 11.2: Write `ChatPanel.test.tsx`** — mock hooks/API; verify provisioning prompt shown when `notProvisioned`, input shown when `ready`

- [ ] **Step 11.3: Run tests**

Run: `pnpm test:unit -- src/ui/components/chat/ChatPanel.test.tsx`
Expected: PASS

- [ ] **Step 11.4: Commit**

```bash
git add apps/desktop/src/ui/components/chat/ChatPanel.tsx apps/desktop/src/ui/components/chat/ChatPanel.test.tsx
git commit -m "feat(chat): add ChatPanel container with provisioning and glass UI"
```

---

### Task 12: Replace Chat Route (7.8)

**Files:**
- Modify: `apps/desktop/src/ui/Chat.tsx`

- [ ] **Step 12.1: Replace spike with thin wrapper**

```tsx
// apps/desktop/src/ui/Chat.tsx
import { ChatPanel } from "./components/chat/ChatPanel";

export default function Chat() {
  return <ChatPanel />;
}
```

- [ ] **Step 12.2: Delete dead code** — remove all inline types, `invoke`, `listen` from old `Chat.tsx`

- [ ] **Step 12.3: Run full unit suite + typecheck**

Run: `pnpm typecheck && pnpm test:unit && pnpm lint` (from `apps/desktop`)
Expected: PASS

- [ ] **Step 12.4: Manual smoke test**

Run: `pnpm tauri:dev`
Verify:
1. `/chat` renders glass panel with header badges
2. Unprovisioned state shows download/import buttons, no input
3. After provision (or mocked ready state), input appears
4. Send shows user bubble + streaming assistant bubble
5. Spell names from grounding render as links

- [ ] **Step 12.5: Commit**

```bash
git add apps/desktop/src/ui/Chat.tsx
git commit -m "feat(chat): replace Chat.tsx spike with ChatPanel"
```

---

### Task 13: data-testid Audit (7.9)

**Files:**
- All `apps/desktop/src/ui/components/chat/**`

- [ ] **Step 13.1: Verify required testids exist**

| Element | testid |
| ------- | ------ |
| Panel | `chat-panel` |
| Header | `chat-header` |
| LLM badge | `chat-llm-status-badge` |
| Embeddings badge | `chat-embeddings-status-badge` |
| Provisioning empty state | `chat-provisioning-empty-state` |
| LLM download | `chat-llm-download-button` |
| LLM import | `chat-llm-import-button` |
| Embeddings download | `chat-embeddings-download-button` |
| Embeddings import | `chat-embeddings-import-button` |
| Download modal | `model-download-modal` |
| Message list | `chat-message-list` |
| User bubble | `chat-user-bubble` |
| Assistant bubble | `chat-assistant-bubble` |
| System message | `chat-system-message` |
| Grounding | `grounded-in-indicator` |
| Spell links | `spell-link-{slug}` |
| Input | `chat-input` |
| Send | `btn-ask-chat` |
| Cancel | `btn-cancel-chat` |
| Model loading | `chat-model-loading-indicator` |

- [ ] **Step 13.2: Commit** (if any testid fixes)

```bash
git commit -m "chore(chat): complete data-testid coverage for chat UI"
```

---

### Task 14: Spec Update on Completion

**Files:**
- Modify: `openspec/changes/add-local-llm-chat-interface/tasks.md`

- [ ] **Step 14.1: Mark Task Group 7 complete**

```diff
 ## 7. Frontend — Chat UI Components

-- [ ] 7.1 Create `ChatPanel` container: Glassmorphism aesthetics, entrance animations
-- [ ] 7.2 Create `ChatHeader` with integrated LLM and Embedding status badges
-- [ ] 7.3 Create provisioning UI for both models: download flow, verified side-load flow, and download modal where needed
-- [ ] 7.4 Create `MessageList` with auto-scroll and premium bubble styling
-- [ ] 7.5 Create `AssistantMessage` with `GroundedInIndicator` (shows search terms used)
-- [ ] 7.6 Implement spell link detection and navigate links to the existing spell editor route
-- [ ] 7.7 Create `ChatInputBar` with multi-line support and Send/Cancel Generation buttons
-- [ ] 7.8 Replace existing `Chat.tsx` route with the new `ChatPanel`
-- [ ] 7.9 Add `data-testid` attributes to all interactive elements
+- [x] 7.1 Create `ChatPanel` container: Glassmorphism aesthetics, entrance animations
+- [x] 7.2 Create `ChatHeader` with integrated LLM and Embedding status badges
+- [x] 7.3 Create provisioning UI for both models: download flow, verified side-load flow, and download modal where needed
+- [x] 7.4 Create `MessageList` with auto-scroll and premium bubble styling
+- [x] 7.5 Create `AssistantMessage` with `GroundedInIndicator` (shows search terms used)
+- [x] 7.6 Implement spell link detection and navigate links to the existing spell editor route
+- [x] 7.7 Create `ChatInputBar` with multi-line support and Send/Cancel Generation buttons
+- [x] 7.8 Replace existing `Chat.tsx` route with the new `ChatPanel`
+- [x] 7.9 Add `data-testid` attributes to all interactive elements
```

- [ ] **Step 14.2: Final commit**

```bash
git add openspec/changes/add-local-llm-chat-interface/tasks.md
git add docs/superpowers/plans/2026-07-07-add-local-llm-chat-interface-task-7-frontend-chat-ui.md
git commit -m "docs: mark Task 7 chat UI complete in OpenSpec tasks"
```

---

## Self-Review Checklist

- [x] Every 7.1–7.9 task maps to Tasks 1–14
- [x] Provisioning empty state hides input until LLM `ready`/`loaded` (llm-chat spec)
- [x] Streaming uses `useLlmStream` + `startLlmChat` (Task 6)
- [x] Spell links use `groundedSpells` from done event → `/edit/:id` (design Decision 13)
- [x] Embeddings provisioning in chat is optional/informational; chat not blocked (llm-chat spec)
- [x] `LlmStatusResponse.status` used (not design.md's `state` alias)
- [x] No placeholder steps
- [x] Spec update step included (Task 14)
- [x] Type names consistent across tasks (`ChatDisplayMessage`, `createStreamId`, `canSendChat`)

---

## Grill-Me Review Log

### Round 1 — Architecture & Data Model

| # | Question | Recommended Answer | Resolution |
|---|----------|------------------|------------|
| 1 | What is the message state model? | Union type `ChatDisplayMessage` with `user` / `assistant` / `system` kinds; in-memory only | **Accepted** — added to Type Contracts |
| 2 | Should spell links scan the full library or grounding set? | Grounding set only (`groundedSpells` from `DoneEvent`) — matches design.md FTS5 results | **Accepted** — Task 7.4 segmentation uses `groundedSpells` |
| 3 | Does chat require embeddings provisioned? | No — input gated on LLM `ready`/`loaded` only; embeddings provisioning is optional CTA | **Accepted** — `canSendChat()` helper |
| 4 | Which `LlmStatusResponse` field name? | `status` (Task 6 actual type), not design.md's `state` | **Accepted** |
| 5 | Shared provisioning between Chat and Library (Task 8)? | Build reusable `ModelProvisioningActions` + `ModelDownloadModal` in `components/chat/`; Task 8 can import or extract later | **Accepted** — YAGNI: no premature `components/models/` extraction |

**Satisfaction after Round 1: 78%** — gaps: error handling depth, hook file split, ChatPanel test detail.

### Round 2 — Error Handling & UX Edge Cases

| # | Question | Recommended Answer | Resolution |
|---|----------|------------------|------------|
| 6 | Where do inference errors appear? | `system` message bubble; input stays enabled (llm-chat spec) | **Accepted** — `useChatSession` adds system message on invoke failure |
| 7 | Cancel with partial response? | Keep assistant bubble with partial text; `useLlmStream` sets `cancelled` | **Accepted** — no system message when partial content exists |
| 8 | Concurrent send while generating? | Disable Send button; backend also rejects | **Accepted** — `ChatInputBar` disabled when `isGenerating` |
| 9 | Enter key behavior? | Enter sends, Shift+Enter newline | **Accepted** — Task 8.2 |
| 10 | Download error retry (Task 9.1)? | Show error text on provisioning prompt; full retry UX deferred to Task 9 | **Accepted** — noted in Deferred table |
| 11 | First-chat model load indicator? | `chat-model-loading-indicator` when `llmStatus === 'ready'` during send | **Accepted** — `isModelLoading` in `useChatSession` |

**Satisfaction after Round 2: 88%** — gaps: `chatSessionTypes.ts` file, `useChatSession` test sketch, embeddings download modal kind switching.

### Round 3 — Testing & File Organization

| # | Question | Recommended Answer | Resolution |
|---|----------|------------------|------------|
| 12 | Unit vs E2E scope for Task 7? | Vitest for hooks + `AssistantMessage` + `ChatPanel`; Playwright in Task 10 | **Accepted** |
| 13 | Should `chatUtils` live in `hooks/` or `components/chat/`? | `components/chat/chatUtils.ts` — colocated with UI consumers | **Accepted** |
| 14 | Split `useChatSession` types? | Yes — `chatSessionTypes.ts` to keep hook readable | **Accepted** — noted in Task 9 |
| 15 | One modal or two for LLM vs embeddings download? | Single `ModelDownloadModal` parameterized by `modelLabel` + `useModelDownloadProgress(kind)` | **Accepted** |
| 16 | Poll interval for status during download? | 1500ms while `downloading` or `initializing` | **Accepted** — `useModelStatus` |
| 17 | Preserve legacy testids from spike? | Keep `chat-input`, `btn-ask-chat`, `btn-cancel-chat` for E2E continuity | **Accepted** — Task 13 table |

**Satisfaction after Round 3: 94%** — minor gap: explicit `useChatSession` test code.

### Round 4 — Final Gap Fill

| # | Question | Recommended Answer | Resolution |
|---|----------|------------------|------------|
| 18 | `useChatSession` test strategy? | Mock `startLlmChat` + `useLlmStream`; assert user message added and `startLlmChat` called with camelCase args | **Added** — Step 9.1 test code |
| 19 | Import file picker API? | `@tauri-apps/plugin-dialog` `open({ multiple: false })` — already in `package.json` | **Accepted** — Task 11.1 |
| 20 | Timeout message in bubble? | Append `[Response timed out]` in backend per spec; frontend shows `timedOut` via stream state | **Accepted** — no extra frontend append needed |

**Satisfaction after Round 4: 96%** — plan approved.

### Round 5 — Double-Check Audit (2026-07-07)

| # | Issue found | Severity | Fix applied |
|---|-------------|----------|-------------|
| 21 | `startLlmChat` called synchronously after `setStreamId` — race with `useLlmStream` listener setup | **Critical** | Deferred invoke via `pendingChat` + `useEffect` (Task 9) |
| 22 | `toApiHistory().slice(0,-1)` reads stale `messages` state | **Critical** | Capture `priorHistory` before `setMessages` (Task 9) |
| 23 | `error` LLM status hides input but provisioning prompt only checks `notProvisioned` | **High** | `llmNeedsSetup` includes `error` + show `lastError` (Tasks 6, 11) |
| 24 | `slide-in-from-bottom-2` CSS class undefined in `index.css` | **Medium** | Switched to `fade-in zoom-in-95` (Task 11) |
| 25 | `chatSessionTypes.ts` missing from file table; MessageList imported types from hook | **Medium** | Added to file table; import from `chatSessionTypes` |
| 26 | Task 9.1 / 11.2 lacked test code bodies | **Medium** | Added Step 9.1 test; 11.2 still outline-only (acceptable for integration test task) |
| 27 | Mid-download page load: modal not auto-shown | **Medium** | Auto-open modal when status is `downloading` (Task 11) |
| 28 | `React.KeyboardEvent` without React import | **Low** | Use `KeyboardEvent` type import (Task 8) |

**Satisfaction after Round 5: 97%**

---

## Decisions Made (Final)

1. **Message model:** `ChatDisplayMessage` union with session-only in-memory state.
2. **Spell links:** Segment assistant text against `groundedSpells` only; link to `/edit/:id`.
3. **Gating:** Chat input requires LLM `ready` or `loaded`; embeddings optional in chat provisioning area.
4. **Status field:** `LlmStatusResponse.status` (not `state`).
5. **Hooks:** `useModelStatus`, `useModelDownloadProgress`, `useChatSession` + existing `useLlmStream`.
6. **Modal:** Single parameterized `ModelDownloadModal` for both model kinds.
7. **Errors:** System message bubbles; partial cancel keeps assistant bubble.
8. **Keyboard:** Enter to send, Shift+Enter for newline.
9. **Testids:** Preserve legacy IDs from spike; add new IDs per table in Task 13.

## Assumptions Accepted

- Task 6 types/IPC/hook are correct and stable.
- Backend emits `llm://download-progress` and `embeddings://download-progress` with camelCase payloads.
- `@tauri-apps/plugin-dialog` `open()` is permitted without new dependency approval (already in `package.json`).
- Task 9 error UX enhancements build on basic error display from Task 7.
- Task 8 may import chat provisioning components without refactoring into a shared package first.

## Open Questions (None blocking implementation)

- Whether to extract `ModelProvisioningActions` to `components/models/` before Task 8 (recommend: extract only if Task 8 needs it).
- Whether glass animation classes need `@keyframes` additions to `index.css` (existing `animate-in` utilities likely sufficient).

---

**Plan complete and saved to `docs/superpowers/plans/2026-07-07-add-local-llm-chat-interface-task-7-frontend-chat-ui.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task with two-stage review between tasks.
2. **Inline Execution** — implement task-by-task in this session using executing-plans with checkpoints.

Which approach?
