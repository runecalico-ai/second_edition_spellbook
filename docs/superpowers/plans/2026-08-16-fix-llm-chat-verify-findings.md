# Fix Local LLM Chat Verify Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Close the OpenSpec verify findings for `add-local-llm-chat-interface`: align `design.md` with the shipped IPC contract, keep live agent docs from resurrecting `chat_answer`, make the four NFRs explicit as hardware targets with path tests, and show embedding reindex progress on Settings.

**Architecture:** Documentation follows the Rust/TypeScript that already shipped. Do not rename IPC parameters back to the old sketch. NFR numbers stay as hardware targets, not GitHub Actions wall-clock SLAs; tests prove the streaming, skip-reload, ranking, and 128-row chunk paths. Settings reuses `reindexEmbeddings` and `embeddings://reindex-progress` through a small section component plus a listen hook modeled on `useModelDownloadProgress`.

**Tech Stack:** OpenSpec `design.md`, Markdown agent/dev docs, Rust `cargo test` (feature `llm`), React 18 + Vitest jsdom, existing Tauri event adapter `listenLlmEvent`, Playwright harness in `tests/local_llm_chat.spec.ts`.

## Global Constraints

- IPC serialized data MUST be `camelCase`. Rust commands stay `snake_case`. Frontend `invoke` keys are camelCase (`message`, `streamId`, `filePath`, `force`).
- Do not add, upgrade, or recommend dependencies.
- Do not reintroduce `chat_answer` or `search_semantic`.
- Do not rewrite historical files under `docs/superpowers/plans/` (they record what was true at apply time).
- Do not change OpenSpec delta spec requirement text except the NFR note in Task 3 (hardware targets, not CI gates).
- Model path remains the fixed `SpellbookVault/models/` location.
- Windows-first. Playwright E2E is Windows WebView2 only; Vitest is the default gate for Settings UI.
- Feature `llm` stays default-on. New Rust tests that call `run_claimed_llm_chat` or embeddings internals belong in the default-feature crate tests.

## Locked decisions

| Finding | Choice | Why |
| ------- | ------ | --- |
| WARNING: `design.md` API | Update the sketch to match code (`message`, `filePath` / Rust `file_path`, richer `DoneEvent`). Do not rename the implementation. | Archive readers must copy the live contract from `src/api/llm.ts` and `commands/llm.rs`. |
| SUGGESTION 1: `chat_answer` docs | Audit **live** agent/dev docs only. `src-tauri/AGENTS.md` already says do not reintroduce the command. Add an explicit "removed commands" sentence if missing. Leave historical apply plans alone. | The verify report cited a compatibility paragraph that is gone from live `AGENTS.md` but still exists in `docs/superpowers/plans/2026-08-14-…`. |
| SUGGESTION 2: NFR timings | Document the four numbers as hardware targets. Add path tests (token-before-done, second chat while `Loaded`, named 128-chunk constant). Do **not** assert 3s / 200ms / 30s / 500ms in CI. | Wall-clock SLAs flake on Actions and need provisioned models. |
| SUGGESTION 3: Settings reindex | Add an Embeddings section on `SettingsPage` with missing/all buttons, inline progress, and result/error copy. No confirm modal. | Spec `MAY`; the user asked to implement it. Progress events already exist. |
| Confirm on full reindex | No modal. Button label is `Re-index all spells`. | Settings has no modal harness today; `useModal` would complicate unit tests for little gain. |

## Planned file structure

| File | Action | Finding |
| ---- | ------ | ------- |
| `openspec/changes/add-local-llm-chat-interface/design.md` | Modify API Design + Chat/RAG flow + TypeScript types | WARNING |
| `apps/desktop/src-tauri/AGENTS.md` | Modify: one "removed commands" sentence if grep still needs it | SUGGESTION 1 |
| `apps/desktop/src/AGENTS.md` | Modify: Settings reindex conventions after Task 5 | SUGGESTION 3 |
| `docs/DEVELOPMENT.md` | Modify: hardware NFR subsection under local LLM | SUGGESTION 2 |
| `openspec/changes/add-local-llm-chat-interface/specs/llm-chat/spec.md` | Modify: NFR footnote that timings are hardware targets | SUGGESTION 2 |
| `openspec/changes/add-local-llm-chat-interface/specs/search/spec.md` | Modify: same NFR footnote | SUGGESTION 2 |
| `apps/desktop/src-tauri/src/commands/llm.rs` | Modify: add token-before-done + second-chat Loaded tests | SUGGESTION 2 |
| `apps/desktop/src-tauri/src/commands/embeddings.rs` | Modify: `EMBEDDING_INDEX_CHUNK_SIZE` constant + test | SUGGESTION 2 |
| `apps/desktop/src/hooks/useReindexProgress.ts` | Create | SUGGESTION 3 |
| `apps/desktop/src/hooks/useReindexProgress.test.tsx` | Create | SUGGESTION 3 |
| `apps/desktop/src/ui/settings/EmbeddingsReindexSection.tsx` | Create | SUGGESTION 3 |
| `apps/desktop/src/ui/settings/EmbeddingsReindexSection.test.tsx` | Create | SUGGESTION 3 |
| `apps/desktop/src/ui/SettingsPage.tsx` | Modify: render the new section | SUGGESTION 3 |
| `apps/desktop/src/ui/SettingsPage.test.tsx` | Modify: section is present | SUGGESTION 3 |
| `apps/desktop/tests/local_llm_chat.spec.ts` | Modify: Settings reindex progress via harness | SUGGESTION 3 |

**Source of truth (read, do not "correct" to the old sketch):**

- `apps/desktop/src/api/llm.ts` (`message`, `filePath`, `force`)
- `apps/desktop/src/types/llm.ts` (`DoneEvent`)
- `apps/desktop/src-tauri/src/commands/llm.rs` (`llm_chat`, `llm_import_model_file`)
- `apps/desktop/src-tauri/src/commands/embeddings.rs` (`embeddings_import_model_file`, `reindex_embeddings`)
- `apps/desktop/src-tauri/src/models/llm.rs` (`DoneEvent`)

---

### Task 1: Align design.md with shipped IPC

**Files:**
- Modify: `openspec/changes/add-local-llm-chat-interface/design.md`

**Interfaces:**
- Consumes: live command signatures in `llm.rs` / `embeddings.rs` / `src/api/llm.ts`
- Produces: design.md API sketch that an archive reader can copy without hitting Tauri arg mismatches

- [x] **Step 1: Replace the Chat/RAG flow call**

In the Chat / RAG flow diagram, change:

```
[Frontend] llm_chat(query, stream_id)
```

to:

```
[Frontend] llm_chat(message, stream_id, history)
```

- [x] **Step 2: Replace the two import command signatures and `llm_chat`**

In **API Design → Tauri Commands**, apply these replacements (keep surrounding commands unchanged):

```rust
#[tauri::command]
pub async fn llm_import_model_file(
      state: State<'_, LlmState>,
      file_path: String,
) -> Result<(), AppError>

#[tauri::command]
pub async fn llm_chat(
    app: AppHandle,
    state: State<'_, LlmState>,
    db: State<'_, Arc<Pool>>,
    message: String,
    stream_id: String,
    history: Vec<ChatMessage>,
) -> Result<(), AppError>

#[tauri::command]
pub async fn embeddings_import_model_file(
      state: State<'_, EmbeddingState>,
      file_path: String,
) -> Result<(), AppError>

#[tauri::command]
pub async fn reindex_embeddings(
    app: AppHandle,
    state: State<'_, EmbeddingState>,
    db: State<'_, Arc<Pool>>,
    provisioning: State<'_, ProvisioningState>,
    force: bool,                // false = only missing, true = all spells
) -> Result<ReindexResult, AppError>
```

Add a one-line note under the command list:

```markdown
Frontend `invoke` keys are camelCase: `filePath`, `message`, `streamId`, `force`.
```

- [x] **Step 3: Replace the TypeScript sketch so `DoneEvent` matches `src/types/llm.ts`**

After `ChatMessage`, insert event types and keep `SemanticSearchResult` / `ReindexResult`. The TypeScript block must include:

```typescript
interface TokenEvent {
  token: string;
}

interface DoneEvent {
  fullResponse: string;
  cancelled: boolean;
  searchTerms: string[];
  groundedSpells: RagSpellContext[];
  timedOut: boolean;
}

interface RagSpellContext {
  id: number;
  name: string;
  school?: string | null;
  level: number;
  descriptionSnippet: string;
}
```

`EmbeddingsStatusResponse.downloadProgress` stays `0.0–1.0` (fraction), matching `models/embeddings.rs`.

- [x] **Step 4: Grep the change design for leftover sketch names**

Run from repo root:

```bash
rg -n "source_path|llm_chat\(query|query, stream_id" openspec/changes/add-local-llm-chat-interface/design.md
```

Expected: no matches in the API Design or Chat/RAG flow. `query` may still appear on `search_spells_semantic(query, limit)` — that command really takes `query`. Do not rename it.

- [x] **Step 5: Commit**

```bash
git add openspec/changes/add-local-llm-chat-interface/design.md
git commit -m "docs: align LLM chat design IPC with shipped message and filePath args"
```

---

### Task 2: Live-doc audit for `chat_answer`

**Files:**
- Modify: `apps/desktop/src-tauri/AGENTS.md` (only if Step 1 finds a live contradiction)
- Test: grep of live docs (not `docs/superpowers/plans/`)

**Interfaces:**
- Consumes: current `AGENTS.md` Local LLM section (already has "Do not reintroduce `search_semantic` or `chat_answer`")
- Produces: live docs that cannot be read as "keep a `chat_answer` wrapper"

- [x] **Step 1: Search live docs only**

```bash
rg -n "chat_answer|llm_chat_answer_compat|compat wrapper" apps/desktop/src-tauri/AGENTS.md apps/desktop/src/AGENTS.md docs/DEVELOPMENT.md docs/ARCHITECTURE.md docs/TESTING.md services/ml/AGENTS.md services/ml/README.md
```

Expected today: `apps/desktop/src-tauri/AGENTS.md` contains exactly one hit — "Do not reintroduce `search_semantic` or `chat_answer`." Historical hits under `docs/superpowers/plans/` are out of scope.

- [x] **Step 2: If the compatibility paragraph is absent, add an explicit removed-commands sentence**

Immediately after the existing "Do not reintroduce" line in `apps/desktop/src-tauri/AGENTS.md` (Command Patterns, around line 375), add:

```markdown
`chat_answer` and `search_semantic` are not registered. Do not add a compatibility wrapper. New UI and tests call `llm_chat` and `search_spells_semantic` only.
```

If Step 1 already shows that exact meaning in live docs, keep the extra sentence anyway — it is the verify fix, not a rewrite of the tree diagram.

- [x] **Step 3: Confirm search.rs is not described as owning chat**

The project tree line for `search.rs` must remain:

```
│   │   ├── search.rs       # Keyword search, facets
```

It must **not** say `chat_answer compat wrapper`.

- [x] **Step 4: Re-run the live-doc grep**

Same command as Step 1.

Expected: `chat_answer` appears only as a removed/forbidden name in `src-tauri/AGENTS.md`. No "remains registered" / `llm_chat_answer_compat` in live docs.

- [x] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/AGENTS.md
git commit -m "docs: state that chat_answer is removed, not a live compat wrapper"
```

---

### Task 3: Document NFR timings as hardware targets

**Files:**
- Modify: `docs/DEVELOPMENT.md`
- Modify: `openspec/changes/add-local-llm-chat-interface/specs/llm-chat/spec.md` (Non-Functional Requirements section only)
- Modify: `openspec/changes/add-local-llm-chat-interface/specs/search/spec.md` (Non-Functional Requirements section only)

**Interfaces:**
- Consumes: NFR bullets in the two delta specs
- Produces: one DEVELOPMENT subsection agents can cite; specs annotated so verify does not treat missing CI clocks as a gap

- [x] **Step 1: Add a subsection under the local LLM / provisioning material in `docs/DEVELOPMENT.md`**

Place it after the verified side-load rules (after the "Generation cancellation is implemented" paragraph, before "See dev/local_llm_infrastructure_spike.md"). Insert:

```markdown
### Local ML hardware targets (not CI gates)

These numbers come from the `llm-chat` and `search` delta specs. They describe a desktop CPU released after 2018 with ≥ 4 cores and ≥ 4 GB RAM after the approved models are provisioned. GitHub Actions and `cargo test` do **not** enforce the wall-clock values (no TinyLlama/ONNX in CI, and shared runners vary). Path tests cover streaming, skip-reload, sqlite-vec ranking, and 128-row embed chunks.

| Target | Value |
| ------ | ----- |
| First streamed token | within 3 s of `llm_chat` on ≥ 4 GB RAM hardware |
| Follow-up `llm_chat` while status is `loaded` | generation begins within 500 ms (no GGUF reload) |
| `search_spells_semantic` | < 200 ms for ~10k indexed spells (query embed + sqlite-vec scan) |
| Batch embed 1,000 spells | < 30 s on the same class of CPU |

To measure locally after provisioning: use Chat for the token/follow-up targets; use Library semantic mode and Settings reindex for search/batch. Do not add these clocks to Playwright or `cargo test`.
```

- [x] **Step 2: Footnote the llm-chat spec NFRs**

At the end of `openspec/changes/add-local-llm-chat-interface/specs/llm-chat/spec.md` **Non-Functional Requirements**, append:

```markdown

Hardware targets for provisioned desktop machines. Automated tests cover the streaming and skip-reload paths; they do not assert these wall-clock values in CI. See `docs/DEVELOPMENT.md` (Local ML hardware targets).
```

- [x] **Step 3: Footnote the search spec NFRs**

At the end of `openspec/changes/add-local-llm-chat-interface/specs/search/spec.md` **Non-Functional Requirements**, append the same two-sentence footnote as Step 2.

- [x] **Step 4: Commit**

```bash
git add docs/DEVELOPMENT.md openspec/changes/add-local-llm-chat-interface/specs/llm-chat/spec.md openspec/changes/add-local-llm-chat-interface/specs/search/spec.md
git commit -m "docs: record local ML latency numbers as hardware targets, not CI SLAs"
```

---

### Task 4: Path tests for NFR behavior

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/llm.rs` (tests module)
- Modify: `apps/desktop/src-tauri/src/commands/embeddings.rs` (`EMBEDDING_INDEX_CHUNK_SIZE` + both `chunks(128)` call sites + unit test)
- Test: `cargo test` filters below

**Interfaces:**
- Consumes: `with_test_llm_chat_hooks`, `test_hooks_snapshot_for_chat_harness`, `RecordingRuntimeDriver`, `run_claimed_llm_chat`, `IsolatedTestPool`, `query_ranked_spells_by_cosine`
- Produces: `EMBEDDING_INDEX_CHUNK_SIZE: usize = 128` used by import and reindex loops

- [x] **Step 1: Write the failing llm tests** (add at the end of `llm.rs` `mod tests`, before the module's closing brace)

```rust
    #[tokio::test]
    async fn llm_chat_emits_token_event_before_done_event() {
        use std::sync::atomic::{AtomicBool, Ordering};

        struct OrderSink {
            token_before_done: Arc<AtomicBool>,
            done: Arc<AtomicBool>,
        }

        impl ChatEventSink for OrderSink {
            fn emit_token(&self, _token: &str) -> Result<(), AppError> {
                assert!(
                    !self.done.load(Ordering::SeqCst),
                    "token must be emitted before done"
                );
                self.token_before_done.store(true, Ordering::SeqCst);
                Ok(())
            }

            fn emit_done(&self, _event: DoneEvent) -> Result<(), AppError> {
                assert!(
                    self.token_before_done.load(Ordering::SeqCst),
                    "done must follow at least one token from RecordingRuntimeDriver"
                );
                self.done.store(true, Ordering::SeqCst);
                Ok(())
            }
        }

        let state = Arc::new(LlmState::default());
        let sink = Arc::new(OrderSink {
            token_before_done: Arc::new(AtomicBool::new(false)),
            done: Arc::new(AtomicBool::new(false)),
        });
        let preflight = ModelLoadPreflight {
            model_path: std::path::PathBuf::from(
                "C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
            ),
            approved_model_present: true,
            requirements: LlmSystemRequirementsSnapshot {
                free_disk_bytes: BASELINE_MIN_FREE_DISK_BYTES,
                free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES,
            },
        };

        with_test_llm_chat_hooks(
            test_hooks_snapshot_for_chat_harness(preflight, Arc::new(RecordingRuntimeDriver)),
            run_claimed_llm_chat(
                Arc::clone(&state),
                crate::commands::search::tests::llm_test_pool_with_rag_seed(),
                "fireball".to_string(),
                Vec::new(),
                "stream-first-token".to_string(),
                Arc::clone(&sink) as Arc<dyn ChatEventSink>,
            ),
        )
        .await
        .unwrap();

        assert!(sink.token_before_done.load(Ordering::SeqCst));
        assert!(sink.done.load(Ordering::SeqCst));
        assert_eq!(*state.status.lock().unwrap(), LlmStatus::Loaded);
    }

    #[tokio::test]
    async fn second_llm_chat_reuses_loaded_status_without_error() {
        let state = Arc::new(LlmState::default());
        let preflight = ModelLoadPreflight {
            model_path: std::path::PathBuf::from(
                "C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
            ),
            approved_model_present: true,
            requirements: LlmSystemRequirementsSnapshot {
                free_disk_bytes: BASELINE_MIN_FREE_DISK_BYTES,
                free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES,
            },
        };
        let pool = crate::commands::search::tests::llm_test_pool_with_rag_seed();

        #[derive(Default)]
        struct NoopSink;
        impl ChatEventSink for NoopSink {
            fn emit_token(&self, _token: &str) -> Result<(), AppError> {
                Ok(())
            }
            fn emit_done(&self, _event: DoneEvent) -> Result<(), AppError> {
                Ok(())
            }
        }

        let hooks = test_hooks_snapshot_for_chat_harness(
            preflight,
            Arc::new(RecordingRuntimeDriver),
        );

        with_test_llm_chat_hooks(
            hooks.clone(),
            run_claimed_llm_chat(
                Arc::clone(&state),
                Arc::clone(&pool),
                "first".to_string(),
                Vec::new(),
                "stream-loaded-1".to_string(),
                Arc::new(NoopSink) as Arc<dyn ChatEventSink>,
            ),
        )
        .await
        .unwrap();
        assert_eq!(*state.status.lock().unwrap(), LlmStatus::Loaded);

        with_test_llm_chat_hooks(
            hooks,
            run_claimed_llm_chat(
                Arc::clone(&state),
                pool,
                "second".to_string(),
                Vec::new(),
                "stream-loaded-2".to_string(),
                Arc::new(NoopSink) as Arc<dyn ChatEventSink>,
            ),
        )
        .await
        .unwrap();
        assert_eq!(*state.status.lock().unwrap(), LlmStatus::Loaded);
    }
```

`TestHooksSnapshot` must be `Clone` for the second test. If it is not `Clone` today, clone the `ModelLoadPreflight` and call `test_hooks_snapshot_for_chat_harness` twice with `Arc::new(RecordingRuntimeDriver)` instead of `hooks.clone()`. Do not add `Clone` to unrelated hook types.

- [x] **Step 2: Run the new llm tests to confirm they compile and pass against current `RecordingRuntimeDriver`**

```bash
cd apps/desktop/src-tauri
cargo test --lib llm_chat_emits_token_event_before_done_event -- --nocapture
cargo test --lib second_llm_chat_reuses_loaded_status_without_error -- --nocapture
```

Expected: PASS (these tests describe existing harness behavior). If `TestHooksSnapshot` is not `Clone`, fix the second test as noted in Step 1 and re-run.

If `llm_test_pool_with_rag_seed` is not public to this module, copy the pool helper usage from `rag_grounding_flows_to_done_event_on_success` in the same file — do not invent a new pool constructor.

- [x] **Step 3: Introduce `EMBEDDING_INDEX_CHUNK_SIZE` and fail a test that still sees a naked `128`**

Near the top of `embeddings.rs` (after the imports, with the other module constants), add:

```rust
pub(crate) const EMBEDDING_INDEX_CHUNK_SIZE: usize = 128;
```

Replace both `rows.chunks(128)` with `rows.chunks(EMBEDDING_INDEX_CHUNK_SIZE)`.

In the reindex progress `current` calculation that uses `* 128`, use the constant:

```rust
let current = ((offset + 1) * EMBEDDING_INDEX_CHUNK_SIZE).min(candidate_count as usize) as u32;
```

Add this test in `embeddings.rs` `mod tests`:

```rust
    #[test]
    fn embedding_index_chunk_size_is_128() {
        assert_eq!(EMBEDDING_INDEX_CHUNK_SIZE, 128);
        let rows: Vec<i32> = (0..300).collect();
        let chunks: Vec<&[i32]> = rows.chunks(EMBEDDING_INDEX_CHUNK_SIZE).collect();
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].len(), 128);
        assert_eq!(chunks[1].len(), 128);
        assert_eq!(chunks[2].len(), 44);
    }
```

- [x] **Step 4: Run embeddings + llm path tests**

```bash
cd apps/desktop/src-tauri
cargo test --lib embedding_index_chunk_size_is_128 -- --nocapture
cargo test --lib llm_chat_emits_token_event_before_done_event -- --nocapture
cargo test --lib second_llm_chat_reuses_loaded_status_without_error -- --nocapture
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src/commands/llm.rs apps/desktop/src-tauri/src/commands/embeddings.rs
git commit -m "test: cover LLM token-before-done, loaded follow-up, and 128-row embed chunks"
```

---

### Task 5: Settings embeddings reindex UI

**Files:**
- Create: `apps/desktop/src/hooks/useReindexProgress.ts`
- Create: `apps/desktop/src/hooks/useReindexProgress.test.tsx`
- Create: `apps/desktop/src/ui/settings/EmbeddingsReindexSection.tsx`
- Create: `apps/desktop/src/ui/settings/EmbeddingsReindexSection.test.tsx`
- Modify: `apps/desktop/src/ui/SettingsPage.tsx`
- Modify: `apps/desktop/src/ui/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `reindexEmbeddings(force: boolean): Promise<ReindexResult>` from `src/api/llm.ts`; `listenLlmEvent` from `src/api/llmEvents.ts`; `ReindexProgressEvent` / `ReindexResult` / `EmbeddingsStatus` from `src/types/llm.ts`; `useModelStatus()` from `src/hooks/useModelStatus.ts`
- Produces: `useReindexProgress(active: boolean): { current: number; total: number; fraction: number }`; `EmbeddingsReindexSection` with the testids listed below

**Testids (locked):**

| id | Role |
| -- | ---- |
| `settings-embeddings-section` | section landmark |
| `settings-reindex-missing-button` | `force=false` |
| `settings-reindex-all-button` | `force=true` |
| `settings-reindex-progress` | status text `current / total` while running |
| `settings-reindex-progress-bar` | `role="progressbar"` |
| `settings-reindex-result` | `{indexed} indexed, {skipped} skipped, {failed} failed` after success |
| `settings-reindex-error` | invoke failure |
| `settings-reindex-unavailable-hint` | shown when `embeddings.state !== "ready"` |

- [x] **Step 1: Write the failing hook test**

Create `apps/desktop/src/hooks/useReindexProgress.test.tsx` using the same `listen` mock pattern as `useModelDownloadProgress.test.tsx`:

```tsx
// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReindexProgress } from "./useReindexProgress";

const mockListen = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (e: { payload: unknown }) => void) => mockListen(event, handler),
}));

describe("useReindexProgress", () => {
  let handler: (e: { payload: { current: number; total: number } }) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockImplementation(async (event: string, next: typeof handler) => {
      if (event === "embeddings://reindex-progress") handler = next;
      return () => {};
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("tracks reindex progress events while active", async () => {
    const { result } = renderHook(() => useReindexProgress(true));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      handler({ payload: { current: 1, total: 4 } });
    });
    expect(result.current.current).toBe(1);
    expect(result.current.total).toBe(4);
    expect(result.current.fraction).toBeCloseTo(0.25);
  });

  it("active=false resets and ignores later events", async () => {
    const { result, rerender } = renderHook(
      ({ active }) => useReindexProgress(active),
      { initialProps: { active: true } },
    );
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      handler({ payload: { current: 2, total: 4 } });
    });
    rerender({ active: false });
    expect(result.current.current).toBe(0);
    expect(result.current.total).toBe(0);
    act(() => {
      handler({ payload: { current: 4, total: 4 } });
    });
    expect(result.current.current).toBe(0);
  });
});
```

- [x] **Step 2: Run the hook test to verify it fails**

```bash
cd apps/desktop
pnpm exec vitest run --project=unit src/hooks/useReindexProgress.test.tsx
```

Expected: FAIL — module `./useReindexProgress` is missing.

- [x] **Step 3: Implement `useReindexProgress`**

Create `apps/desktop/src/hooks/useReindexProgress.ts` by copying `useModelDownloadProgress.ts` and changing the event name and fields:

```ts
import { useEffect, useState } from "react";
import { listenLlmEvent } from "../api/llmEvents";
import type { ReindexProgressEvent } from "../types/llm";

export function useReindexProgress(active: boolean) {
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!active) {
      setCurrent(0);
      setTotal(0);
      return;
    }

    setCurrent(0);
    setTotal(0);

    let mounted = true;
    let unlisten: (() => void) | null = null;

    async function setup() {
      const unlistenFn = await listenLlmEvent<ReindexProgressEvent>(
        "embeddings://reindex-progress",
        (event) => {
          if (!mounted) return;
          setCurrent(event.payload.current);
          setTotal(event.payload.total);
        },
      );
      if (!mounted) {
        unlistenFn();
        return;
      }
      unlisten = unlistenFn;
    }

    void setup();

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [active]);

  const fraction = total > 0 ? Math.min(1, current / total) : 0;
  return { current, total, fraction };
}
```

- [x] **Step 4: Re-run the hook test**

```bash
cd apps/desktop
pnpm exec vitest run --project=unit src/hooks/useReindexProgress.test.tsx
```

Expected: PASS.

- [x] **Step 5: Write the failing section tests**

Create `apps/desktop/src/ui/settings/EmbeddingsReindexSection.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddingsReindexSection } from "./EmbeddingsReindexSection";

const reindexEmbeddings = vi.fn();
vi.mock("../../api/llm", () => ({
  reindexEmbeddings: (...args: unknown[]) => reindexEmbeddings(...args),
}));

vi.mock("../../hooks/useModelStatus", () => ({
  useModelStatus: () => mockStatus,
}));

vi.mock("../../hooks/useReindexProgress", () => ({
  useReindexProgress: () => ({ current: 1, total: 4, fraction: 0.25 }),
}));

let mockStatus: {
  embeddings: { state: string; errorMessage?: string | null };
  refresh: () => Promise<void>;
};

describe("EmbeddingsReindexSection", () => {
  beforeEach(() => {
    reindexEmbeddings.mockReset();
    mockStatus = {
      embeddings: { state: "ready" },
      refresh: vi.fn().mockResolvedValue(undefined),
    };
  });
  afterEach(cleanup);

  it("disables both buttons when embeddings are not ready", () => {
    mockStatus.embeddings = { state: "notProvisioned" };
    render(<EmbeddingsReindexSection />);
    expect(
      (screen.getByTestId("settings-reindex-missing-button") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByTestId("settings-reindex-unavailable-hint")).toBeTruthy();
  });

  it("calls reindexEmbeddings(false) from the missing-vectors button", async () => {
    reindexEmbeddings.mockResolvedValue({ total: 10, indexed: 2, skipped: 8, failed: 0 });
    render(<EmbeddingsReindexSection />);
    fireEvent.click(screen.getByTestId("settings-reindex-missing-button"));
    await waitFor(() => {
      expect(reindexEmbeddings).toHaveBeenCalledWith(false);
    });
    expect(screen.getByTestId("settings-reindex-result").textContent).toMatch(/2 indexed/);
  });

  it("calls reindexEmbeddings(true) from the all-spells button", async () => {
    reindexEmbeddings.mockResolvedValue({ total: 10, indexed: 10, skipped: 0, failed: 0 });
    render(<EmbeddingsReindexSection />);
    fireEvent.click(screen.getByTestId("settings-reindex-all-button"));
    await waitFor(() => {
      expect(reindexEmbeddings).toHaveBeenCalledWith(true);
    });
  });

  it("shows invoke errors inline", async () => {
    reindexEmbeddings.mockRejectedValue(new Error("embedding model is unavailable"));
    render(<EmbeddingsReindexSection />);
    fireEvent.click(screen.getByTestId("settings-reindex-missing-button"));
    expect(await screen.findByTestId("settings-reindex-error")).toBeTruthy();
  });
});
```

If `vi.mock("../../hooks/useModelStatus")` is evaluated before `let mockStatus` in Vitest, hoist `mockStatus` with `vi.hoisted`:

```ts
const { mockStatus } = vi.hoisted(() => ({
  mockStatus: {
    embeddings: { state: "ready" as string, errorMessage: null as string | null },
    refresh: vi.fn().mockResolvedValue(undefined),
  },
}));
```

Use that object in the mock factory. Do not use `any`.

- [x] **Step 6: Run the section test to verify it fails**

```bash
cd apps/desktop
pnpm exec vitest run --project=unit src/ui/settings/EmbeddingsReindexSection.test.tsx
```

Expected: FAIL — missing module.

- [x] **Step 7: Implement `EmbeddingsReindexSection`**

Create `apps/desktop/src/ui/settings/EmbeddingsReindexSection.tsx`:

- Import `reindexEmbeddings` from `../../api/llm`.
- Import `useModelStatus` from `../../hooks/useModelStatus`.
- Import `useReindexProgress` from `../../hooks/useReindexProgress`.
- `canRun = embeddings.state === "ready"`.
- Local state: `running` boolean, `result: ReindexResult | null`, `error: string | null`.
- `useReindexProgress(running)`.
- Buttons use the same focus-ring classes as `settings-theme-select` (`focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900`).
- `type="button"` on both buttons.
- Labels: `Index missing vectors` and `Re-index all spells`.
- While `running`, disable both buttons and render the progress bar (`aria-valuemin={0}` `aria-valuemax={100}` `aria-valuenow={Math.round(fraction * 100)}`) plus `settings-reindex-progress` text `${current} / ${total}`.
- On success, set `result` and call `refresh()`.
- On failure, set `error` to `err instanceof Error ? err.message : String(err)`.
- Unavailable hint copy: `Semantic search indexing is available after the embedding model is ready. Provision it from Chat or Library semantic mode.`

- [x] **Step 8: Re-run the section test**

```bash
cd apps/desktop
pnpm exec vitest run --project=unit src/ui/settings/EmbeddingsReindexSection.test.tsx
```

Expected: PASS.

- [x] **Step 9: Mount the section on SettingsPage and extend SettingsPage tests**

In `SettingsPage.tsx`, import `EmbeddingsReindexSection` and render it after the Appearance `</section>` (still inside the outer page `<section>`).

In `SettingsPage.test.tsx`, add:

```tsx
  it("renders the embeddings reindex section", () => {
    render(<SettingsPage />);
    expect(screen.getByTestId("settings-embeddings-section")).toBeTruthy();
  });
```

`SettingsPage` will now pull `useModelStatus` (real `invoke`) unless the section is always rendered. That will fail in SettingsPage tests that do not mock Tauri.

Fix: mock `useModelStatus` in `SettingsPage.test.tsx` (or mock `../../api/llm` `getLlmStatus`/`getEmbeddingsStatus` to resolve `{ status: "notProvisioned", modelPath: "" }` and `{ state: "notProvisioned" }`). Prefer mocking `../../hooks/useModelStatus` in `SettingsPage.test.tsx` only:

```ts
vi.mock("../hooks/useModelStatus", () => ({
  useModelStatus: () => ({
    llm: { status: "notProvisioned", modelPath: "" },
    embeddings: { state: "notProvisioned" },
    error: null,
    refresh: async () => {},
  }),
}));
```

- [x] **Step 10: Run Settings unit tests**

```bash
cd apps/desktop
pnpm exec vitest run --project=unit src/ui/SettingsPage.test.tsx src/ui/settings/EmbeddingsReindexSection.test.tsx src/hooks/useReindexProgress.test.tsx
```

Expected: PASS.

- [x] **Step 11: Commit**

```bash
git add apps/desktop/src/hooks/useReindexProgress.ts apps/desktop/src/hooks/useReindexProgress.test.tsx apps/desktop/src/ui/settings/EmbeddingsReindexSection.tsx apps/desktop/src/ui/settings/EmbeddingsReindexSection.test.tsx apps/desktop/src/ui/SettingsPage.tsx apps/desktop/src/ui/SettingsPage.test.tsx
git commit -m "feat: show embedding reindex progress and actions on Settings"
```

---

### Task 6: Agent docs and Settings E2E harness coverage

**Files:**
- Modify: `apps/desktop/src/AGENTS.md` (Local LLM Chat & Semantic Search section)
- Modify: `apps/desktop/tests/local_llm_chat.spec.ts`
- Modify: `openspec/changes/add-local-llm-chat-interface/design.md` (UI Architecture tree — add Settings embeddings reindex)

**Interfaces:**
- Consumes: Task 5 testids and `spellbookE2EHarness.localMl.installScenario({ reindex })`
- Produces: frontend AGENTS table row for Settings reindex; one Playwright test that drives the Settings buttons

- [x] **Step 1: Document Settings reindex in frontend AGENTS.md**

After the IPC wrappers paragraph in `apps/desktop/src/AGENTS.md`, add:

```markdown
**Settings reindex:** `SettingsPage` renders `EmbeddingsReindexSection` (`settings-embeddings-section`). Buttons call `reindexEmbeddings(false)` (`settings-reindex-missing-button`) and `reindexEmbeddings(true)` (`settings-reindex-all-button`). Subscribe to `embeddings://reindex-progress` with `useReindexProgress` (camelCase `{ current, total }`). Disable both buttons unless `embeddings_status.state === "ready"`. Do not display `cosineDistance`. Chat and Library remain the provisioning surfaces; Settings does not add download/import actions.
```

- [x] **Step 2: Add Settings to the design.md UI Architecture tree**

Under `LibrarySemanticEmptyState` in `design.md`, append:

```
SettingsEmbeddingsReindex
├── Index missing vectors (reindex_embeddings force=false)
├── Re-index all spells (force=true)
└── Progress from embeddings://reindex-progress
```

- [x] **Step 3: Add a Playwright test at the end of `apps/desktop/tests/local_llm_chat.spec.ts`**

```ts
  test("Settings reindex buttons emit progress and show the result summary", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.localLlm.installScenario({
      llmStatus: { status: "notProvisioned", modelPath: "" },
      embeddingsStatus: { state: "ready" },
      reindex: {
        progress: [
          { current: 1, total: 2 },
          { current: 2, total: 2 },
        ],
        result: { total: 2, indexed: 1, skipped: 1, failed: 0 },
      },
    });

    await page.getByTestId("settings-gear-button").click();
    await expect(page.getByTestId("settings-embeddings-section")).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
    await page.getByTestId("settings-reindex-missing-button").click();
    await expect(page.getByTestId("settings-reindex-result")).toContainText("1 indexed", {
      timeout: TIMEOUTS.medium,
    });

    const observations = await app.localLlm.observations();
    expect(observations).toContainEqual({
      kind: "command",
      name: "reindex_embeddings",
      args: { force: false },
    });
  });
```

Place it inside `test.describe("Local LLM semantic search and reindex", …)`.

- [x] **Step 4: Run unit tests (always) and Playwright on Windows**

Done: focused Vitest passed. Playwright skipped — no Tauri debug executable in the worktree.

```bash
cd apps/desktop
pnpm exec vitest run --project=unit src/ui/SettingsPage.test.tsx src/ui/settings/EmbeddingsReindexSection.test.tsx src/hooks/useReindexProgress.test.tsx
```

Expected: PASS.

Playwright (Windows, unsandboxed, after `pnpm build` if the debug webview loads `dist/`):

```bash
cd apps/desktop
npx playwright test tests/local_llm_chat.spec.ts --grep "Settings reindex"
```

Expected: PASS on win32. Skip this command on Linux (the spec file already `test.skip`s non-Windows).

- [x] **Step 5: Commit**

```bash
git add apps/desktop/src/AGENTS.md openspec/changes/add-local-llm-chat-interface/design.md apps/desktop/tests/local_llm_chat.spec.ts
git commit -m "docs: document Settings reindex and cover it in the local ML E2E harness"
```

---

### Task 7: Gate

**Files:** none new

- [x] **Step 1: Live-doc grep (Tasks 1–2)**

```bash
rg -n "source_path|llm_chat\(query" openspec/changes/add-local-llm-chat-interface/design.md
rg -n "remains registered|llm_chat_answer_compat" apps/desktop/src-tauri/AGENTS.md apps/desktop/src/AGENTS.md docs/DEVELOPMENT.md
```

Expected: no hits.

- [x] **Step 2: Rust path tests**

```bash
cd apps/desktop/src-tauri
cargo test --lib llm_chat_emits_token_event_before_done_event -- --nocapture
cargo test --lib second_llm_chat_reuses_loaded_status_without_error -- --nocapture
cargo test --lib embedding_index_chunk_size_is_128 -- --nocapture
```

Expected: PASS. Cargo accepts one `--lib` filter at a time; run the three tests separately.

- [x] **Step 3: Frontend unit + lint**

```bash
cd apps/desktop
pnpm exec vitest run --project=unit src/hooks/useReindexProgress.test.tsx src/ui/settings/EmbeddingsReindexSection.test.tsx src/ui/SettingsPage.test.tsx
pnpm run lint:biome
pnpm run typecheck
```

Expected: PASS.

- [x] **Step 4: Commit only if Step 3 formatted files**

Skipped: biome and typecheck did not change files.

If biome or the tests did not change files, skip. Otherwise:

```bash
git add -u
git commit -m "chore: apply lint and typecheck fixes for Settings reindex"
```

---

## Spec coverage map

| Verify finding | Plan task |
| -------------- | --------- |
| WARNING: design.md `query` / `source_path` / thin `DoneEvent` | Task 1 |
| SUGGESTION 1: `chat_answer` live docs | Task 2 |
| SUGGESTION 2: NFR timings undocumented / untested | Tasks 3–4 |
| SUGGESTION 3: Settings reindex progress UI | Tasks 5–6 |
| Final grep + tests | Task 7 |

## Self-review

- Spec coverage: all four findings have tasks.
- No TBD / "implement later" / "write tests for the above".
- IPC names are `message` / `file_path` / `filePath` throughout Tasks 1, 5, and 6.
- Historical `docs/superpowers/plans/` files are not modified.
- No new npm/crate dependencies.
