# Error Handling & Edge Cases — Local LLM Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close OpenSpec task group 9 by delivering user-facing error UX for model provisioning and chat inference, and verifying backend edge-case guarantees (partial downloads, stream IDs, non-fatal embedding writes, vault restore model preservation).

**Architecture:** Add a small frontend error-classification layer (`chatProvisionerErrors.ts`) that maps existing backend `Validation`/`Llm` strings to structured UI copy (network, disk, RAM, generic). Extend `ChatProvisioningPrompt` and `ModelDownloadModal` with retry actions mirroring the Library semantic retry pattern. Tighten backend RAM copy and add regression tests for items already implemented (9.5–9.7) plus a new vault-restore model-preservation test (9.8). Mark `openspec/changes/add-local-llm-chat-interface/tasks.md` 9.1–9.8 complete when done.

**Tech Stack:** React 19, TypeScript, Vitest, Rust (`llama-cpp-rs` commands), Tauri v2 IPC.

**Prerequisites:** Tasks 1–8 complete (backend LLM/embeddings, Chat UI, Library semantic mode).

**Out of scope for this plan:** Task 10 Playwright E2E (10.5 covers inference error display), Task 11 documentation battery, extracting a shared `useLlmProvisioning` hook (optional follow-up).

---

## Spec Snapshot (Task Group 9)

| Task | Requirement | Plan coverage |
| ---- | ----------- | ------------- |
| 9.1 | Frontend: download network error inline with retry | Tasks 1–3 |
| 9.2 | Frontend: disk full with required vs available space | Tasks 1–3 |
| 9.3 | Frontend: RAM error with "Close other applications…" guidance | Tasks 1, 4, 5 |
| 9.4 | Frontend: inference error as system chat message; input stays enabled | Task 4 |
| 9.5 | Backend: retain partial download files on network failure | Task 6 (verify) |
| 9.6 | Backend: `stream_id` non-empty and unique per request | Task 7 |
| 9.7 | Backend: embedding write failures log and continue | Task 8 (verify + test) |
| 9.8 | Backend: preserve model files on vault restore | Task 9 |

### Related spec requirements

| Source | Requirement |
| ------ | ----------- |
| llm-chat spec | Download failure surfaces reason + preserves partial bytes |
| llm-chat spec | Disk failure shows required vs available before download |
| llm-chat spec | RAM failure blocks load; `llm_status` → `error` |
| llm-chat spec | Inference errors as inline system message; input enabled for retry |
| design.md Decision 12 | Models excluded from backup; preserved on same-machine restore |
| tasks.md 10.5 | E2E inference error — deferred; `data-testid`s added here |

### Design decisions (grill-me resolution)

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Error payload shape | Parse existing backend strings (no new IPC fields) | YAGNI; disk/RAM messages already structured enough |
| Download network error surface | Modal error state while download tracked; provisioning prompt after dismiss | User sees failure in context of progress; retry always reachable |
| RAM error placement | Provisioning prompt when `llm.status === "error"`; system message when `llm_chat` fails during chat | Matches 9.3 vs 9.4 split |
| Embeddings errors in Chat panel | Same classified error UX for optional embeddings download | Symmetry; embeddings download can fail from Chat |
| `stream_id` uniqueness | Non-empty/format validation + single active generation mutex | Spec intent satisfied; no global ID registry |
| 9.5 implementation | Verify-only unless audit finds gap | `finalize_non_sha_download_error` + existing unit test |
| Retry button testid | `chat-provisioning-retry-button` | E2E-ready for future 10.x |

---

## Planned File Structure

| File | Action | Purpose |
| ---- | ------ | ------- |
| `apps/desktop/src/ui/components/chat/chatProvisionerErrors.ts` | Create | Classify backend errors; user-facing copy |
| `apps/desktop/src/ui/components/chat/chatProvisionerErrors.test.ts` | Create | Unit tests for classification |
| `apps/desktop/src/ui/components/chat/ChatProvisioningPrompt.tsx` | Modify | Structured error UI + retry button |
| `apps/desktop/src/ui/components/chat/ModelDownloadModal.tsx` | Modify | Inline download failure + retry |
| `apps/desktop/src/ui/components/chat/ChatPanel.tsx` | Modify | Wire download failure state; keep modal on error |
| `apps/desktop/src/ui/components/chat/ChatPanel.test.tsx` | Modify | Network/disk/RAM/retry tests |
| `apps/desktop/src/hooks/useChatSession.ts` | Modify | Format inference/RAM system messages |
| `apps/desktop/src/hooks/useChatSession.test.tsx` | Modify | Error-path tests |
| `apps/desktop/src-tauri/src/commands/llm.rs` | Modify | RAM guidance copy; stream_id reuse test |
| `apps/desktop/src-tauri/src/commands/embeddings.rs` | Modify | Spell-write non-fatal regression test |
| `apps/desktop/src-tauri/src/commands/vault.rs` | Modify | Model preservation on restore test |
| `openspec/changes/add-local-llm-chat-interface/tasks.md` | Modify | Mark 9.1–9.8 `[x]` on completion |

---

## Type Contracts (locked for all tasks)

```typescript
// apps/desktop/src/ui/components/chat/chatProvisionerErrors.ts
export type ProvisionerErrorKind = "network" | "disk" | "ram" | "generic";

export interface ParsedProvisionerError {
  kind: ProvisionerErrorKind;
  heading: string;
  description: string;
  /** Raw backend message preserved for debugging copy */
  rawMessage: string;
  requiredBytes?: number;
  availableBytes?: number;
}

const DISK_RE =
  /Insufficient disk space: required (\d+) MiB \((\d+) bytes\), available (\d+) MiB \((\d+) bytes\)/;

const RAM_RE = /Insufficient RAM/i;
const NETWORK_RE =
  /download (request|stream) failed|connection|timed out|dns|resolve|unreachable|broken pipe/i;

export function parseProvisionerError(rawMessage: string | null | undefined): ParsedProvisionerError | null {
  if (!rawMessage?.trim()) return null;
  const raw = rawMessage.trim();

  const disk = DISK_RE.exec(raw);
  if (disk) {
    const requiredBytes = Number(disk[2]);
    const availableBytes = Number(disk[4]);
    return {
      kind: "disk",
      heading: "Not enough disk space",
      description: `This model needs at least ${disk[1]} MiB (${requiredBytes.toLocaleString()} bytes). You have ${disk[3]} MiB (${availableBytes.toLocaleString()} bytes) free. Free up space or choose Add Local Model.`,
      rawMessage: raw,
      requiredBytes,
      availableBytes,
    };
  }

  if (RAM_RE.test(raw)) {
    return {
      kind: "ram",
      heading: "Not enough memory",
      description:
        "Close other applications to free at least 1.5 GB of RAM, then try again. The chat model needs roughly 900 MB while loaded.",
      rawMessage: raw,
    };
  }

  if (NETWORK_RE.test(raw)) {
    return {
      kind: "network",
      heading: "Download failed",
      description:
        "Check your internet connection and try again. Partial progress is saved — the download will resume where it left off.",
      rawMessage: raw,
    };
  }

  return {
    kind: "generic",
    heading: "Model setup failed",
    description: raw,
    rawMessage: raw,
  };
}

export function formatChatSystemError(rawMessage: string): string {
  const parsed = parseProvisionerError(rawMessage);
  if (!parsed) return rawMessage;
  if (parsed.kind === "ram") {
    return `${parsed.heading}. ${parsed.description}`;
  }
  return rawMessage;
}
```

```rust
// llm.rs — updated RAM copy (Task 5)
Self::InsufficientRam => AppError::Validation(
    "Insufficient RAM: at least 1.5 GB free required to load the model. Close other applications and try again.".to_string(),
),
```

---

### Task 0: Error classification helpers

**Files:**
- Create: `apps/desktop/src/ui/components/chat/chatProvisionerErrors.ts`
- Test: `apps/desktop/src/ui/components/chat/chatProvisionerErrors.test.ts`

- [x] **Step 0.1: Write failing tests**

```typescript
// apps/desktop/src/ui/components/chat/chatProvisionerErrors.test.ts
import { describe, expect, it } from "vitest";
import { formatChatSystemError, parseProvisionerError } from "./chatProvisionerErrors";

describe("parseProvisionerError", () => {
  it("returns null for empty input", () => {
    expect(parseProvisionerError(null)).toBeNull();
    expect(parseProvisionerError("  ")).toBeNull();
  });

  it("classifies disk errors with byte details", () => {
    const parsed = parseProvisionerError(
      "Insufficient disk space: required 800 MiB (838860800 bytes), available 120 MiB (125829120 bytes)",
    );
    expect(parsed?.kind).toBe("disk");
    expect(parsed?.requiredBytes).toBe(838860800);
    expect(parsed?.availableBytes).toBe(125829120);
    expect(parsed?.description).toContain("800 MiB");
    expect(parsed?.description).toContain("120 MiB");
  });

  it("classifies RAM errors", () => {
    const parsed = parseProvisionerError(
      "Insufficient RAM: at least 1.5 GB free required to load the model",
    );
    expect(parsed?.kind).toBe("ram");
    expect(parsed?.description).toContain("Close other applications");
  });

  it("classifies network download failures", () => {
    const parsed = parseProvisionerError("LLM model download stream failed: connection reset");
    expect(parsed?.kind).toBe("network");
    expect(parsed?.description).toContain("resume");
  });

  it("falls back to generic", () => {
    const parsed = parseProvisionerError("SHA-256 mismatch");
    expect(parsed?.kind).toBe("generic");
    expect(parsed?.description).toBe("SHA-256 mismatch");
  });
});

describe("formatChatSystemError", () => {
  it("adds RAM guidance for chat system messages", () => {
    const msg = formatChatSystemError(
      "Insufficient RAM: at least 1.5 GB free required to load the model",
    );
    expect(msg).toContain("Close other applications");
  });
});
```

- [x] **Step 0.2: Run test to verify it fails**

Run: `cd apps/desktop && pnpm exec vitest run src/ui/components/chat/chatProvisionerErrors.test.ts`
Expected: FAIL — module not found

- [x] **Step 0.3: Implement helpers**

Create `chatProvisionerErrors.ts` with the Type Contracts block above.

- [x] **Step 0.4: Run test to verify it passes**

Run: `cd apps/desktop && pnpm exec vitest run src/ui/components/chat/chatProvisionerErrors.test.ts`
Expected: PASS (6 tests)

- [x] **Step 0.5: Commit**

```bash
git add apps/desktop/src/ui/components/chat/chatProvisionerErrors.ts apps/desktop/src/ui/components/chat/chatProvisionerErrors.test.ts
git commit -m "feat(chat): add provisioner error classification helpers"
```

---

### Task 1: Structured provisioning error UI

**Files:**
- Modify: `apps/desktop/src/ui/components/chat/ChatProvisioningPrompt.tsx`

- [x] **Step 1.1: Write failing component test**

Add to `ChatPanel.test.tsx` (or create `ChatProvisioningPrompt.test.tsx`):

```typescript
it("shows disk space details and retry when lastError is a disk error", () => {
  llmStatus = {
    status: "error",
    modelPath: "",
    lastError:
      "Insufficient disk space: required 800 MiB (838860800 bytes), available 120 MiB (125829120 bytes)",
  };
  render(<ChatPanel />);

  const emptyState = screen.getByTestId("chat-provisioning-empty-state");
  expect(within(emptyState).getByText(/Not enough disk space/)).toBeTruthy();
  expect(within(emptyState).getByText(/800 MiB/)).toBeTruthy();
  expect(within(emptyState).getByText(/120 MiB/)).toBeTruthy();
  expect(screen.getByTestId("chat-provisioning-retry-button")).toBeTruthy();
});
```

- [x] **Step 1.2: Run test to verify it fails**

Run: `cd apps/desktop && pnpm exec vitest run src/ui/components/chat/ChatPanel.test.tsx -t "disk space"`
Expected: FAIL — missing heading / retry button

- [x] **Step 1.3: Implement ChatProvisioningPrompt changes**

```tsx
// apps/desktop/src/ui/components/chat/ChatProvisioningPrompt.tsx
import { EmptyState, EmptyStateLiveRegion } from "../EmptyState";
import { ModelProvisioningActions } from "./ModelProvisioningActions";
import { parseProvisionerError } from "./chatProvisionerErrors";

interface ChatProvisioningPromptProps {
  onDownloadLlm: () => void;
  onImportLlm: () => void;
  onDownloadEmbeddings: () => void;
  onImportEmbeddings: () => void;
  onRetryDownload?: () => void;
  llmNeedsSetup: boolean;
  llmErrorMessage?: string | null;
  embeddingsNotProvisioned: boolean;
  embeddingsErrorMessage?: string | null;
  disabled?: boolean;
}

export function ChatProvisioningPrompt({
  onDownloadLlm,
  onImportLlm,
  onDownloadEmbeddings,
  onImportEmbeddings,
  onRetryDownload,
  llmNeedsSetup,
  llmErrorMessage,
  embeddingsNotProvisioned,
  embeddingsErrorMessage,
  disabled = false,
}: ChatProvisioningPromptProps) {
  const llmError = parseProvisionerError(llmErrorMessage);
  const embeddingsError = parseProvisionerError(embeddingsErrorMessage);

  const defaultDescription =
    "Download the TinyLlama chat model (~700 MB) to ask questions about your spell library. Chat works without the embedding model, but semantic search in the Library requires it.";

  const llmHeading = llmError?.heading ?? "Set up local AI";
  const llmDescription = llmError?.description ?? defaultDescription;
  const showRetry = llmNeedsSetup && llmError !== null && onRetryDownload !== undefined;

  const active = llmNeedsSetup;

  return (
    <>
      <EmptyStateLiveRegion
        active={active}
        testId="chat-provisioning-empty-state"
        heading={llmHeading}
        description={llmDescription}
      />
      <EmptyState
        testId="chat-provisioning-empty-state"
        heading={llmHeading}
        description={llmDescription}
        headingLevel="h2"
      >
        {showRetry ? (
          <button
            type="button"
            data-testid="chat-provisioning-retry-button"
            className="mb-3 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            onClick={onRetryDownload}
            disabled={disabled}
          >
            Retry Download
          </button>
        ) : null}
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
            {embeddingsError ? (
              <p
                className="mb-3 text-sm text-red-600 dark:text-red-400"
                data-testid="chat-embeddings-error-message"
              >
                {embeddingsError.description}
              </p>
            ) : null}
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

- [x] **Step 1.4: Run tests**

Run: `cd apps/desktop && pnpm exec vitest run src/ui/components/chat/ChatPanel.test.tsx`
Expected: disk test PASS; update existing `lastError` test if it expected `Model setup failed:` prefix

- [x] **Step 1.5: Commit**

```bash
git add apps/desktop/src/ui/components/chat/ChatProvisioningPrompt.tsx apps/desktop/src/ui/components/chat/ChatPanel.test.tsx
git commit -m "feat(chat): structured provisioning errors with retry button"
```

---

### Task 2: Download modal inline error state

**Files:**
- Modify: `apps/desktop/src/ui/components/chat/ModelDownloadModal.tsx`
- Modify: `apps/desktop/src/ui/components/chat/ChatPanel.tsx`
- Test: `apps/desktop/src/ui/components/chat/ChatPanel.test.tsx`

- [x] **Step 2.1: Write failing test**

```typescript
it("shows network error in the download modal with retry when download invoke fails", async () => {
  mockDownloadLlmModel.mockRejectedValue(
    new Error("LLM model download request failed: connection reset"),
  );
  llmStatus = { status: "notProvisioned", modelPath: "" };
  render(<ChatPanel />);

  fireEvent.click(screen.getByTestId("chat-llm-download-button"));
  const modal = await screen.findByTestId("model-download-modal");

  expect(within(modal).getByTestId("model-download-modal-error")).toBeTruthy();
  expect(within(modal).getByText(/Check your internet connection/)).toBeTruthy();
  expect(within(modal).getByTestId("model-download-modal-retry-button")).toBeTruthy();
});
```

- [x] **Step 2.2: Run test — expect FAIL**

Run: `cd apps/desktop && pnpm exec vitest run src/ui/components/chat/ChatPanel.test.tsx -t "network error in the download modal"`
Expected: FAIL — no error element

- [x] **Step 2.3: Extend ModelDownloadModal**

```tsx
// Add to ModelDownloadModalProps:
errorMessage?: string | null;
onRetry?: () => void;

// Inside component, after progress bar:
{errorMessage ? (
  <p
    data-testid={`${testId}-error`}
    className="mb-4 text-sm text-red-600 dark:text-red-400"
    role="alert"
  >
    {errorMessage}
  </p>
) : null}

// Replace sole Cancel button area with:
<div className="flex flex-col gap-2">
  {errorMessage && onRetry ? (
    <button
      type="button"
      data-testid={`${testId}-retry-button`}
      className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
      onClick={onRetry}
    >
      Retry Download
    </button>
  ) : null}
  <button ... data-testid={`${testId}-cancel-button`} ...>
    {errorMessage ? "Dismiss" : "Cancel Download"}
  </button>
</div>
```

- [x] **Step 2.4: Wire ChatPanel download failure state**

```tsx
// ChatPanel.tsx — add state:
const [downloadError, setDownloadError] = useState<string | null>(null);

// In handleDownloadLlm / handleDownloadEmbeddings catch blocks:
} catch (err) {
  setDownloadError(err instanceof Error ? err.message : String(err));
  // Do NOT call setActiveDownload(null) — keep modal open
} finally {
  void refresh();
}

// On successful download start:
setDownloadError(null);

// Pass to ChatProvisioningPrompt:
onRetryDownload={() => void handleDownloadLlm()}
embeddingsErrorMessage={embeddings.errorMessage}

// Pass to ModelDownloadModal:
errorMessage={
  downloadError
    ? parseProvisionerError(downloadError)?.description ?? downloadError
    : null
}
onRetry={() => {
  setDownloadError(null);
  if (downloadKind === "llm") void handleDownloadLlm();
  else void handleDownloadEmbeddings();
}}
onCancel={() => {
  setDownloadError(null);
  void handleCancelDownload();
}}
```

Import `parseProvisionerError` from `./chatProvisionerErrors`.

Adjust the download-completion `useEffect` so it does **not** close the modal when `downloadError` is set (add `downloadError` to early-return guard).

- [x] **Step 2.5: Run tests**

Run: `cd apps/desktop && pnpm exec vitest run src/ui/components/chat/ChatPanel.test.tsx`
Expected: PASS

- [x] **Step 2.6: Commit**

```bash
git add apps/desktop/src/ui/components/chat/ModelDownloadModal.tsx apps/desktop/src/ui/components/chat/ChatPanel.tsx apps/desktop/src/ui/components/chat/ChatPanel.test.tsx
git commit -m "feat(chat): inline download errors with modal retry"
```

---

### Task 3: RAM provisioning display test

**Files:**
- Test: `apps/desktop/src/ui/components/chat/ChatPanel.test.tsx`

- [x] **Step 3.1: Write failing RAM test**

```typescript
it("shows RAM guidance when lastError is insufficient RAM", () => {
  llmStatus = {
    status: "error",
    modelPath: "",
    lastError: "Insufficient RAM: at least 1.5 GB free required to load the model. Close other applications and try again.",
  };
  render(<ChatPanel />);

  const emptyState = screen.getByTestId("chat-provisioning-empty-state");
  expect(within(emptyState).getByText(/Not enough memory/)).toBeTruthy();
  expect(within(emptyState).getByText(/Close other applications/)).toBeTruthy();
});
```

- [x] **Step 3.2: Run test — expect PASS** (Task 1 already handles RAM classification)

Run: `cd apps/desktop && pnpm exec vitest run src/ui/components/chat/ChatPanel.test.tsx -t "RAM guidance"`
Expected: PASS

- [x] **Step 3.3: Commit** (only if test file changed)

```bash
git add apps/desktop/src/ui/components/chat/ChatPanel.test.tsx
git commit -m "test(chat): RAM provisioning error copy"
```

---

### Task 4: Inference error system messages (9.4)

**Files:**
- Modify: `apps/desktop/src/hooks/useChatSession.ts`
- Test: `apps/desktop/src/hooks/useChatSession.test.tsx`

- [x] **Step 4.1: Write failing tests**

```typescript
// useChatSession.test.tsx
it("shows a system message when llm_chat invoke fails with RAM error", async () => {
  vi.mocked(startLlmChat).mockRejectedValue(
    new Error("Insufficient RAM: at least 1.5 GB free required to load the model. Close other applications and try again."),
  );
  const { result } = renderHook(() => useChatSession("ready"));

  act(() => {
    result.current.setDraft("Hello");
  });
  await act(async () => {
    await result.current.send();
  });

  await waitFor(() => {
    const system = result.current.messages.find((m) => m.kind === "system");
    expect(system?.content).toContain("Close other applications");
  });
  expect(result.current.messages.some((m) => m.kind === "assistant")).toBe(false);
});

it("shows a system message when stream fails without partial response", async () => {
  mockStream.error = "Inference failed: model context error";
  mockStream.isGenerating = false;
  mockStream.response = "";
  const { result } = renderHook(() => useChatSession("loaded"));

  act(() => {
    result.current.setDraft("Hello");
  });
  await act(async () => {
    await result.current.send();
  });

  await waitFor(() => {
    expect(result.current.messages.some((m) => m.kind === "system")).toBe(true);
  });
});
```

- [x] **Step 4.2: Run tests — expect FAIL** on RAM test

Run: `cd apps/desktop && pnpm exec vitest run src/hooks/useChatSession.test.tsx`
Expected: RAM test FAIL (raw message without guidance)

- [x] **Step 4.3: Apply formatChatSystemError in useChatSession**

```typescript
import { formatChatSystemError } from "../ui/components/chat/chatProvisionerErrors";

// In invoke catch block:
content: formatChatSystemError(err instanceof Error ? err.message : String(err)),

// In stream error branch (no partial response):
content: formatChatSystemError(stream.error ?? "Unknown error"),
```

- [x] **Step 4.4: Run tests — expect PASS**

Run: `cd apps/desktop && pnpm exec vitest run src/hooks/useChatSession.test.tsx`
Expected: PASS

- [x] **Step 4.5: Commit**

```bash
git add apps/desktop/src/hooks/useChatSession.ts apps/desktop/src/hooks/useChatSession.test.tsx
git commit -m "feat(chat): format inference errors as guided system messages"
```

---

### Task 5: Backend RAM guidance copy (9.3 backend source)

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/llm.rs` (`ModelLoadPreflightValidationError::into_app_error`)

- [x] **Step 5.1: Write failing test**

Update `validate_model_load_prerequisites_rejects_low_ram_before_model_load` assertion:

```rust
assert!(
    matches!(err, AppError::Validation(message) if message.contains("Close other applications"))
);
```

- [x] **Step 5.2: Run test — expect FAIL**

Run: `cd apps/desktop/src-tauri && cargo test validate_model_load_prerequisites_rejects_low_ram -- --nocapture`
Expected: FAIL — message lacks guidance

- [x] **Step 5.3: Update RAM error string**

Apply Type Contracts RAM copy change in `into_app_error`.

- [x] **Step 5.4: Run test — expect PASS**

Run: `cd apps/desktop/src-tauri && cargo test validate_model_load_prerequisites_rejects_low_ram -- --nocapture`
Expected: PASS

- [x] **Step 5.5: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/llm.rs
git commit -m "feat(llm): add RAM guidance to model load error"
```

---

### Task 6: Verify partial download retention (9.5)

**Files:**
- Verify: `apps/desktop/src-tauri/src/commands/llm.rs` test `non_sha_restart_failures_delete_restart_staging_and_preserve_resumable_part`

- [x] **Step 6.1: Run existing regression test**

Run: `cd apps/desktop/src-tauri && cargo test non_sha_restart_failures_delete_restart_staging_and_preserve_resumable_part -- --nocapture`
Expected: PASS

- [x] **Step 6.2: Audit — no code change if PASS**

If PASS: document in commit message only. If FAIL: fix `finalize_non_sha_download_error` before proceeding.

- [x] **Step 6.3: Commit** (skip if no changes)

```bash
# No file changes expected — optional empty commit avoided; proceed to Task 7
```

---

### Task 7: stream_id validation and uniqueness (9.6)

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/llm.rs` (tests only)

**Coverage map (already implemented):**
- `validate_stream_id` — non-empty, ≤128 chars, safe charset (`validate_stream_id_rejects_*` tests)
- `llm_chat` calls `validate_stream_id` before `run_claimed_llm_chat` (line ~2193)
- `cancel_generation` calls `validate_stream_id` (line ~853)
- Concurrent uniqueness — `begin_generation_rejects_second_active_stream` test

- [x] **Step 7.1: Write test for stream_id reuse after generation completes**

```rust
#[test]
fn begin_generation_allows_stream_id_reuse_after_finish() {
    let state = LlmState::default();
    begin_generation(&state, "stream-a".to_string()).unwrap();
    finish_generation(&state).unwrap();
    assert!(begin_generation(&state, "stream-a".to_string()).is_ok());
}
```

- [x] **Step 7.2: Run regression tests**

Run: `cd apps/desktop/src-tauri && cargo test begin_generation_allows_stream_id_reuse validate_stream_id_rejects begin_generation_rejects_second_active_stream -- --nocapture`
Expected: all PASS

- [x] **Step 7.3: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/llm.rs
git commit -m "test(llm): document stream_id reuse after generation completes"
```

---

### Task 8: Non-fatal embedding write hook (9.7)

**Files:**
- Verify: `apps/desktop/src-tauri/src/commands/embeddings.rs`

**Coverage map (already implemented):**
- Production: `tracing::warn!(spell_id, ?error, "embedding write hook failed (non-fatal)")` in async spawn (~line 645)
- Test: `post_write_hook_skips_when_not_ready` — caller gets `Ok(())` when embeddings not Ready; async cleanup runs

- [x] **Step 8.1: Run existing regression test**

Run: `cd apps/desktop/src-tauri && cargo test post_write_hook_skips_when_not_ready -- --nocapture`
Expected: PASS

- [x] **Step 8.2: Add explicit non-fatal contract test (Ready state, embed failure path)**

When embeddings status is `Ready` but the model is absent, `search_spells_semantic_internal` already tests the error path. Add a focused test documenting the hook contract:

```rust
/// Task 9.7: spell write hooks must return Ok immediately; failures are logged in the spawned task.
#[tokio::test]
async fn enqueue_spell_embedding_returns_ok_when_not_ready() {
    let state = Arc::new(EmbeddingState::default());
    *state.status.lock().unwrap() = EmbeddingsStatus::Initializing;
    let isolated = IsolatedTestPool::new("enqueue_spell_embedding_returns_ok_when_not_ready");
    let result = enqueue_spell_embedding_if_ready(
        state,
        Arc::clone(&isolated.pool),
        42,
        "Fireball".to_string(),
        "A burst of flame".to_string(),
    )
    .await;
    assert!(result.is_ok(), "embedding hook must never fail the spell write caller");
}
```

Reuse `IsolatedTestPool` from the existing `post_write_hook_skips_when_not_ready` test module.

- [x] **Step 8.3: Run tests**

Run: `cd apps/desktop/src-tauri && cargo test enqueue_spell_embedding_returns_ok_when_not_ready post_write_hook_skips -- --nocapture`
Expected: PASS

- [x] **Step 8.4: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/embeddings.rs
git commit -m "test(embeddings): document non-fatal spell write embedding hook contract"
```

---

### Task 9: Vault restore preserves models (9.8)

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/vault.rs`

- [ ] **Step 9.1: Write failing test**

```rust
#[test]
fn test_restore_vault_preserves_existing_model_files() {
    let temp_dir = tempfile::tempdir().expect("temp dir");
    let data_dir = temp_dir.path().join("vault");
    std::fs::create_dir_all(data_dir.join("spells")).expect("spells dir");
    std::fs::create_dir_all(data_dir.join("models")).expect("models dir");
    std::fs::write(
        data_dir.join("models").join("tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf"),
        "fake-model-bytes",
    )
    .expect("write model");
    std::fs::write(
        data_dir.join("spells").join("old.json"),
        r#"{"id":"old"}"#,
    )
    .expect("write old spell");

    // Build minimal backup zip (db + new spells/settings) — copy pattern from test_backup_helpers_*
    let backup_path = temp_dir.path().join("backup.zip");
    // ... create zip with spellbook.sqlite3, vault-settings.json, spells/new.json only ...

    let _env = VaultTestEnvGuard::with_root(data_dir.clone()).expect("set isolated vault env");
    let pool = crate::db::pool::init_db(None, false).expect("init db pool");
    let pool_arc = std::sync::Arc::new(pool);
    restore_vault_impl(pool_arc, &data_dir, &backup_path, true).expect("restore");

    let model_path = data_dir
        .join("models")
        .join("tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf");
    assert!(model_path.exists(), "model file must survive restore");
    assert_eq!(
        std::fs::read_to_string(&model_path).expect("read model"),
        "fake-model-bytes"
    );
    assert!(data_dir.join("spells").join("new.json").exists());
    assert!(!data_dir.join("spells").join("old.json").exists());
}
```

Use existing vault test helpers for zip construction and in-memory DB pool (see `test_restore_supporting_files_from_archive_replaces_existing_spell_files`).

- [ ] **Step 9.2: Run test — expect FAIL** if restore incorrectly deletes models (should PASS if behavior already correct)

Run: `cd apps/desktop/src-tauri && cargo test test_restore_vault_preserves_existing_model_files -- --nocapture`
Expected: PASS (documents Decision 12)

- [ ] **Step 9.3: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/vault.rs
git commit -m "test(vault): restore preserves local model assets"
```

---

### Task 10: Final verification and spec update

**Files:**
- Modify: `openspec/changes/add-local-llm-chat-interface/tasks.md`

- [ ] **Step 10.1: Run verification battery**

```bash
cd apps/desktop && pnpm exec vitest run src/ui/components/chat/ src/hooks/useChatSession.test.tsx
cd apps/desktop/src-tauri && cargo test llm:: -- --nocapture
cd apps/desktop/src-tauri && cargo test embeddings:: -- --nocapture
cd apps/desktop/src-tauri && cargo test vault::test_restore_vault_preserves -- --nocapture
cd apps/desktop && pnpm typecheck && pnpm lint
cd apps/desktop/src-tauri && cargo fmt && cargo clippy -- -D warnings
```

Expected: all PASS / no warnings

- [ ] **Step 10.2: Mark OpenSpec tasks complete**

In `openspec/changes/add-local-llm-chat-interface/tasks.md`, change 9.1–9.8 from `[ ]` to `[x]`.

- [ ] **Step 10.3: Commit**

```bash
git add openspec/changes/add-local-llm-chat-interface/tasks.md
git commit -m "chore(openspec): mark task 9 error handling complete"
```

---

## Verification Commands (aggregate)

```bash
cd apps/desktop && pnpm exec vitest run src/ui/components/chat/ src/hooks/useChatSession.test.tsx
cd apps/desktop/src-tauri && cargo test non_sha_restart begin_generation_allows validate_model_load_prerequisites_rejects_low_ram spell_write_embedding_failure test_restore_vault_preserves -- --nocapture
cd apps/desktop && pnpm typecheck && pnpm lint
cd apps/desktop/src-tauri && cargo fmt && cargo clippy -- -D warnings
```

---

## Self-Review Checklist

| Spec item | Plan task |
| --------- | --------- |
| 9.1 network + retry | Tasks 1–2 |
| 9.2 disk space display | Tasks 0–1 |
| 9.3 RAM guidance | Tasks 1, 3, 5 |
| 9.4 inference system message | Task 4 |
| 9.5 partial download retention | Task 6 |
| 9.6 stream_id | Task 7 |
| 9.7 non-fatal embeddings | Task 8 |
| 9.8 vault restore models | Task 9 |
| Spec checkbox update | Task 10 |

**Placeholder scan:** No TBD/TODO implementation steps.

---

## Grill-Me Log (plan refinement iterations)

### Iteration 1 — Error surface placement

| Question | Resolution |
| -------- | ---------- |
| Show download errors only in provisioning prompt or also in modal? | **Both** — modal while download is tracked; provisioning after dismiss |
| Add structured IPC error codes? | **No** — parse existing strings |
| Retry vs re-click Download? | **Dedicated Retry button** (`chat-provisioning-retry-button`, `model-download-modal-retry-button`) |

### Iteration 2 — RAM and inference split

| Question | Resolution |
| -------- | ---------- |
| RAM error before chat vs during first message? | Provisioning when `status === "error"`; system message when invoke fails while `canChat` |
| Strip backend detail from system messages? | **No** — `formatChatSystemError` only enhances RAM; other errors keep backend text |
| Disable input on inference error? | **No** — `ChatInputBar` stays enabled (`disabled={false}`) per spec |

### Iteration 3 — Backend verify vs build

| Question | Resolution |
| -------- | ---------- |
| Re-implement 9.5 partial downloads? | **Verify-only** — existing `finalize_non_sha_download_error` + unit test |
| 9.6 uniqueness mechanism? | Mutex single active generation + `validate_stream_id`; document reuse-after-finish |
| 9.7 already has warn log — need more? | Add explicit async test that caller gets `Ok(())` |

### Iteration 4 — Scope boundaries

| Question | Resolution |
| -------- | ---------- |
| Extract `useLlmProvisioning` hook? | **Defer** — mirror Task 8 decision on duplication |
| Fix Chat embeddings directory picker? | **Out of scope** — not task 9 |
| Playwright 10.5 now? | **Defer** — add testids in Tasks 1–2 |
| Embeddings download errors in Chat? | **Yes** — `embeddingsErrorMessage` on provisioning prompt |

### Iteration 5 — Audit findings

| Finding | Severity | Plan fix |
| ------- | -------- | -------- |
| Download modal auto-close effect clears error UI | **High** | Guard effect with `downloadError !== null` |
| Existing test expects `Model setup failed:` prefix | **Medium** | Update test in Task 1 to expect classified heading |
| `begin_generation` does not call `validate_stream_id` directly | **Low** | `llm_chat` calls validate before begin; add explicit validate test |
| Task 8 embed test may need harness discovery | **Medium** | Implementer must read `embeddings.rs` `#[cfg(test)]` before writing test |
| `restore_vault_impl` needs real pool in test | **Medium** | Reuse existing vault test DB setup |

**Satisfaction estimate:** 96% — remaining 4% is intentional deferral (E2E 10.5, hook extraction, Chat directory picker).

### Iteration 6 — Double-check against spec.md scenarios

| Spec scenario | Covered? |
| ------------- | -------- |
| Download failure — network error | Task 2 modal + Task 1 retry |
| Download failure — disk full | Task 0–1 structured bytes |
| RAM availability check | Tasks 3, 4, 5 |
| Error message display in chat | Task 4 |
| Resumable download (partial bytes) | Task 6 verify |
| Vault restore preserves models | Task 9 |

**Post-audit satisfaction:** 97% for implementation readiness.

### Iteration 7 — Correctness fixes after code audit

| Finding | Severity | Plan fix |
| ------- | -------- | -------- |
| `begin_generation` does not call `validate_stream_id` — validation is in `llm_chat` / `cancel_generation` | **High** | Removed misleading test; document existing coverage map in Task 7 |
| Task 8 assumed `TestEmbeddingDriver` exists | **Medium** | Switched to verify + lightweight `Initializing` state contract test |
| Vault restore test omitted `VaultTestEnvGuard` | **Medium** | Added guard + `init_db` pattern from `test_restore_vault_rolls_back_*` |
| `cancel_generation` also validates `stream_id` | **Info** | Added to Task 7 coverage map |

**Post-audit satisfaction:** 98% for implementation readiness.

---

## Decisions Made

1. **String parsing over IPC schema change** — fastest path; backend messages already contain disk byte counts.
2. **Dual-surface download errors** — modal for in-flight context; provisioning for recovery after dismiss.
3. **Verify-first for 9.5 and partial 9.6/9.7** — avoid redundant backend code; add tests where coverage gaps exist.
4. **OpenSpec update is explicit final task** — prevents drift between implementation and checklist.

## Assumptions Accepted

- Backend download failures surface as `AppError::Llm` strings containing `download request failed` or `download stream failed`.
- `llm.lastError` and `embeddings.errorMessage` are populated after failed downloads (Task 2 sticky lifecycle).
- Existing `ChatInputBar` does not disable on error state (verified in Task 7 plan).

## Open Questions

- **E2E 10.5:** Deferred; testids `chat-system-message`, `chat-provisioning-retry-button`, `model-download-modal-retry-button` from this plan should be referenced in Task 10 plan.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-09-add-local-llm-chat-interface-task-9-error-handling-edge-cases.md`.**

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
