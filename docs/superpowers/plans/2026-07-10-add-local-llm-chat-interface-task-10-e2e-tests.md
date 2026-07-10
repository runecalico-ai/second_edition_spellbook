# Local LLM Chat Interface Task 10 E2E Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic Playwright coverage for all nine Task 10 chat, provisioning, semantic-search, and embedding-reindex workflows without downloading or loading production ML models.

**Architecture:** Extend the existing `spellbookE2EHarness` with a typed, opt-in local-ML scenario adapter. Production and ordinary E2E runs continue through real Tauri IPC; only pages with both `window.__IS_PLAYWRIGHT__ === true` and an explicit `window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__` use scripted statuses, command results, and event streams. A focused page object drives the user workflows, while an E2E-only browser bridge exposes command-only semantic search/reindex contracts that have no required v1 UI.

**Tech Stack:** React 18, TypeScript, Tauri v2 IPC/events, Playwright 1.58, Vitest 4, the existing Spellbook Tauri fixtures, and Biome.

---

## Scope and file map

**Create**

- `apps/desktop/src/api/llmEvents.ts` — one typed event-listener adapter used by production Tauri events and the Playwright harness.
- `apps/desktop/tests/page-objects/LocalLlmChat.ts` — reusable chat/provisioning/semantic interactions and deterministic harness setup.
- `apps/desktop/tests/local_llm_chat.spec.ts` — Task 10.1-10.9 Playwright scenarios.

**Modify**

- `apps/desktop/src/globals.d.ts` — typed scenario, observation, and command-bridge globals; no `any` casts.
- `apps/desktop/src/ui/spellbookE2EHarness.ts` — opt-in local-ML command/event simulator with cleanup-safe timers and observations.
- `apps/desktop/src/ui/spellbookE2EHarness.test.ts` — unit contracts for opt-in behavior, payload casing, streaming, cancellation, result pass-through, and reindex events.
- `apps/desktop/src/api/llm.ts` - delegate only the Task 10 commands scripted by the harness (`llm_status`, `embeddings_status`, both download commands, both download cancellations, `llm_chat`, generation cancellation, semantic search, and reindex); verified side-load wrappers remain real IPC because Task 10 only checks that their UI actions are present.
- `apps/desktop/src/hooks/useLlmStream.ts` — subscribe through `llmEvents.ts` rather than importing Tauri `listen` directly.
- `apps/desktop/src/hooks/useModelDownloadProgress.ts` — same event-adapter change for provisioning progress.
- `apps/desktop/src/ui/App.tsx` - install/remove the Playwright-only command bridge at app mount.
- `apps/desktop/src/ui/App.test.tsx` - verify bridge installation is opt-in and cleanup removes it without affecting normal App tests.
- `apps/desktop/tests/page-objects/SpellbookApp.ts` — expose the focused `LocalLlmChat` page object without adding raw chat locators to general tests.
- `openspec/changes/add-local-llm-chat-interface/tasks.md` — mark 10.1-10.9 complete only after the rebuilt Playwright suite passes.

**Do not modify**

- Model URLs, hashes, approved dependencies, or Rust inference/embedding implementation.
- Production behavior when no explicit Playwright ML scenario is installed.
- The spec requirements or design decisions; this task closes their existing E2E checklist only.

## Deterministic scenario contracts

Add these exported types beside the harness implementation and mirror them in `Window` declarations with `import type` aliases rather than duplicate anonymous shapes:

```typescript
export interface LocalMlE2EScenario {
  llmStatus: LlmStatusResponse;
  embeddingsStatus: EmbeddingsStatusResponse;
  download?: {
    kind: ModelKind;
    progress: DownloadProgressEvent[];
    manualProgress?: boolean;
    terminalLlmStatus?: LlmStatusResponse;
    terminalEmbeddingsStatus?: EmbeddingsStatusResponse;
  };
  chat?: {
    tokens: string[];
    done: DoneEvent;
    invokeError?: string;
    pauseAfterToken?: number;
  };
  semanticResults?: SemanticSearchResult[];
  reindex?: {
    progress: ReindexProgressEvent[];
    result: ReindexResult;
  };
}

export interface LocalMlE2EObservation {
  kind: "command" | "event";
  name: string;
  args?: unknown;
  payload?: unknown;
}

export interface LocalMlE2ECommandBridge {
  searchSpellsSemantic(query: string, limit?: number): Promise<SemanticSearchResult[]>;
  reindexEmbeddings(force: boolean): Promise<ReindexResult>;
  advanceDownload(): void;
  advanceChat(): void;
}
```

Rules locked by the plan:

1. Harness activation requires both Playwright mode and a scenario object. Existing `__IS_PLAYWRIGHT__` tests without an ML scenario still use real IPC.
2. All callbacks are queued asynchronously so tests exercise React's actual async transitions. Scripted pause points are advanced explicitly through the bridge; assertions never race a transient timer.
3. The simulator emits the exact production event names and camelCase payloads: `llm://download-progress`, `llm://token/<streamId>`, `llm://done/<streamId>`, and `embeddings://reindex-progress`.
4. Cancellation stops unsent tokens and emits one done payload with `cancelled: true`, `timedOut: false`, and the concatenated partial response.
5. Every command/event is appended to `__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__`; tests use this only for command/payload contracts that are not fully visible in the UI.
6. With `manualProgress: true`, starting a download emits the first progress item and pauses. Each `advanceDownload()` emits exactly one remaining progress item; one additional call after the final item applies terminal status and resolves the download command. This lets Playwright assert 25%, then 100%, then modal closure as three stable states.
7. The command bridge includes test controls `advanceDownload()` and `advanceChat()` only for scripted pause points; product commands remain separate and observations identify only actual product command/event traffic.
8. The page object installs scenario data with `page.addInitScript()` before reloading, so the scenario exists before React mounts and survives that reload. Each Playwright test already owns a fresh app/page, and the runtime reset clears pending work/listeners during unmount; no test depends on execution order.
9. Because `ChatPanel` starts the download in the click handler but subscribes to progress from a subsequent React effect, the harness queues scripted events until the matching listener exists, then flushes them in order. Add a unit test for this listener-after-command ordering so the E2E does not miss the first progress payload.
10. Starting a scripted download immediately changes the matching in-memory status to `downloading`. Applying its terminal state changes it to the configured `ready` response before resolving the download Promise. Cancelling changes it to `notProvisioned`, clears pending progress, and resolves the pending download plus cancel commands. `getLlmStatus()`/`getEmbeddingsStatus()` always clone the current mutable scenario state.

---

### Task 1: Build the opt-in local-ML harness contract

**Files:**

- Modify: `apps/desktop/src/globals.d.ts`
- Modify: `apps/desktop/src/ui/spellbookE2EHarness.ts`
- Modify: `apps/desktop/src/ui/spellbookE2EHarness.test.ts`

- [x] **Step 1.1: Write failing activation and observation tests**

Add tests proving that the local-ML adapter returns `undefined` when either Playwright mode or the scenario is absent, and records a command when both are present:

```typescript
it("keeps local ML overrides opt-in", async () => {
  window.__IS_PLAYWRIGHT__ = true;
  expect(spellbookE2EHarness.localMl.getLlmStatus()).toBeUndefined();

  window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = readyScenario();
  const status = spellbookE2EHarness.localMl.getLlmStatus();
  expect(status).toBeDefined();
  await expect(status!).resolves.toMatchObject({
    status: "loaded",
  });
  expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
    kind: "command",
    name: "llm_status",
    args: {},
  });
});
```

Extend the existing `resetHarnessWindowState()` to clear the scenario, observations, and bridge.

- [x] **Step 1.2: Run the focused test and confirm RED**

Run: `pnpm --dir apps/desktop exec vitest run src/ui/spellbookE2EHarness.test.ts`

Expected: FAIL because `localMl` and the globals do not exist.

- [x] **Step 1.3: Add the typed globals**

```typescript
import type {
  LocalMlE2ECommandBridge,
  LocalMlE2EObservation,
  LocalMlE2EScenario,
} from "./ui/spellbookE2EHarness";

declare global {
  interface Window {
    __SPELLBOOK_E2E_LOCAL_ML_SCENARIO__?: LocalMlE2EScenario;
    __SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__?: LocalMlE2EObservation[];
    __SPELLBOOK_E2E_LOCAL_ML_COMMANDS__?: LocalMlE2ECommandBridge;
  }
}
```

- [x] **Step 1.4: Implement status overrides and observation helpers**

Add `getScenario()`, `recordObservation()`, and the `localMl` member. Each command method returns `undefined` when inactive and a Promise when active so callers can use explicit fallback without swallowing real errors:

```typescript
getLlmStatus(): Promise<LlmStatusResponse> | undefined {
  const scenario = getLocalMlScenario();
  if (!scenario) return undefined;
  recordLocalMlObservation("command", "llm_status", {});
  return Promise.resolve(structuredClone(scenario.llmStatus));
}
```

Implement the equivalent `getEmbeddingsStatus()` now; later tasks add download/chat/search/reindex behavior.

- [x] **Step 1.5: Run focused tests and confirm GREEN**

Run: `pnpm --dir apps/desktop exec vitest run src/ui/spellbookE2EHarness.test.ts`

Expected: PASS.

- [x] **Step 1.6: Commit the harness foundation**

```powershell
git add apps/desktop/src/globals.d.ts apps/desktop/src/ui/spellbookE2EHarness.ts apps/desktop/src/ui/spellbookE2EHarness.test.ts
git commit -m "test(e2e): add opt-in local ML harness"
```

---

### Task 2: Route typed ML commands and events through the harness

**Files:**

- Create: `apps/desktop/src/api/llmEvents.ts`
- Modify: `apps/desktop/src/api/llm.ts`
- Modify: `apps/desktop/src/hooks/useLlmStream.ts`
- Modify: `apps/desktop/src/hooks/useModelDownloadProgress.ts`
- Test: existing `apps/desktop/src/api/llm.test.ts`, `apps/desktop/src/hooks/useLlmStream.test.tsx`, and `apps/desktop/src/hooks/useModelDownloadProgress.test.tsx`

- [x] **Step 2.1: Write failing API fallback tests**

For `getLlmStatus`, `getEmbeddingsStatus`, `downloadLlmModel`, `downloadEmbeddingsModel`, `cancelLlmDownload`, `cancelEmbeddingsDownload`, `startLlmChat`, `cancelLlmGeneration`, `searchSpellsSemantic`, and `reindexEmbeddings`, add override assertions and retain existing Tauri invocation assertions. Also assert `importLlmModelFile` and `importEmbeddingsModelFile` still invoke Tauri when a scenario is active, because verified side-load is deliberately outside the simulator:

```typescript
it("uses the explicit Playwright ML override without invoking Tauri", async () => {
  window.__IS_PLAYWRIGHT__ = true;
  window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = readyScenario();

  await expect(getLlmStatus()).resolves.toMatchObject({ status: "loaded" });
  expect(invoke).not.toHaveBeenCalled();
});
```

- [x] **Step 2.2: Run API tests and confirm RED**

Run: `pnpm --dir apps/desktop exec vitest run src/api/llm.test.ts`

Expected: FAIL because the wrappers always invoke Tauri.

- [x] **Step 2.3: Add the event adapter**

```typescript
import { listen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event";
import { spellbookE2EHarness } from "../ui/spellbookE2EHarness";

export function listenLlmEvent<T>(
  eventName: string,
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  return spellbookE2EHarness.localMl.listen<T>(eventName, handler) ?? listen<T>(eventName, handler);
}
```

The harness listener registry must return an idempotent unlisten function and delete empty event buckets.

- [x] **Step 2.4: Delegate commands with explicit fallback**

Use this exact shape so an active harness rejection is preserved and never falls through to production IPC:

```typescript
export async function getLlmStatus(): Promise<LlmStatusResponse> {
  const override = spellbookE2EHarness.localMl.getLlmStatus();
  return override === undefined ? invoke<LlmStatusResponse>("llm_status") : override;
}
```

Apply the same pattern to the ten scripted functions listed in Step 2.1. Leave both import wrappers unchanged. Do not change IPC command names or camelCase argument keys.

- [x] **Step 2.5: Switch both hooks to `listenLlmEvent`**

Replace direct `listen` imports and calls only; keep their state machines unchanged. Existing mocks should mock `../api/llmEvents` or use the real adapter with `@tauri-apps/api/event` mocked.

- [x] **Step 2.6: Run the adapter regression battery**

Run:

```powershell
pnpm --dir apps/desktop exec vitest run src/api/llm.test.ts src/hooks/useLlmStream.test.tsx src/hooks/useModelDownloadProgress.test.tsx
```

Expected: PASS, including pre-existing listener cleanup and stale-stream tests.

- [x] **Step 2.7: Commit the transport seam**

```powershell
git add apps/desktop/src/api/llm.ts apps/desktop/src/api/llmEvents.ts apps/desktop/src/hooks/useLlmStream.ts apps/desktop/src/hooks/useModelDownloadProgress.ts apps/desktop/src/api/llm.test.ts apps/desktop/src/hooks/useLlmStream.test.tsx apps/desktop/src/hooks/useModelDownloadProgress.test.tsx
git commit -m "test(e2e): route local ML flows through typed harness"
```

---

### Task 3: Simulate download, streaming, error, and cancellation behavior

**Files:**

- Modify: `apps/desktop/src/ui/spellbookE2EHarness.ts`
- Modify: `apps/desktop/src/ui/spellbookE2EHarness.test.ts`

- [ ] **Step 3.1: Write failing download/event tests**

Subscribe to `llm://download-progress`, start a scripted download, and assert ordered camelCase payloads and terminal status:

```typescript
expect(payloads).toEqual([
  { bytesDownloaded: 256, totalBytes: 1024 },
  { bytesDownloaded: 1024, totalBytes: 1024 },
]);
const status = spellbookE2EHarness.localMl.getLlmStatus();
expect(status).toBeDefined();
await expect(status!).resolves.toMatchObject({
  status: "ready",
});
```

- [ ] **Step 3.2: Write failing chat completion/error/cancel tests**

Cover three independent scenarios:

- tokens `"Magic "`, `"Missile"` followed by a done payload containing grounded spell id/name;
- `invokeError: "Inference failed: test fault"` rejects without token events;
- cancellation after the first token prevents the second token and emits `{ fullResponse: "Magic ", cancelled: true, timedOut: false }`.

- [ ] **Step 3.3: Run harness tests and confirm RED**

Run: `pnpm --dir apps/desktop exec vitest run src/ui/spellbookE2EHarness.test.ts`

Expected: FAIL for missing simulation methods.

- [ ] **Step 3.4: Implement ordered event scheduling and cleanup**

Maintain module-private pending-event queues, listener registries, and active stream state. `reset()` must clear pending events, listeners, and active streams. Event delivery must clone payloads before recording/delivering them. When no listener exists yet, retain the event; `listen()` flushes the matching queue asynchronously after registering its callback.

For downloads, validate that the invoked command matches `scenario.download.kind`, install one pending completion Promise, mutate the corresponding scenario status to `downloading`, and follow the manual-progress state machine from Rule 6. Add unit tests for LLM and embeddings download state transitions plus cancellation back to `notProvisioned`.

For chat cancellation, resolve the original `startLlmChat` promise after the cancellation done event; do not reject, because production cancellation is a successful terminal stream state.

- [ ] **Step 3.5: Run harness tests and confirm GREEN**

Run: `pnpm --dir apps/desktop exec vitest run src/ui/spellbookE2EHarness.test.ts`

Expected: PASS.

- [ ] **Step 3.6: Commit scripted async behavior**

```powershell
git add apps/desktop/src/ui/spellbookE2EHarness.ts apps/desktop/src/ui/spellbookE2EHarness.test.ts
git commit -m "test(e2e): script local ML progress and streams"
```

---

### Task 4: Add semantic-search and reindex command contracts

**Files:**

- Modify: `apps/desktop/src/ui/spellbookE2EHarness.ts`
- Modify: `apps/desktop/src/ui/spellbookE2EHarness.test.ts`
- Modify: `apps/desktop/src/ui/App.tsx`
- Modify: `apps/desktop/src/ui/App.test.tsx`

- [ ] **Step 4.1: Write failing ranked-result and reindex tests**

The semantic fixture supplies results already sorted by the backend contract, and the harness must clone and pass them through unchanged:

```typescript
await expect(spellbookE2EHarness.localMl.searchSpellsSemantic("physical defense", 5))
  .resolves.toEqual([
    expect.objectContaining({ name: "Shield", cosineDistance: 0.08 }),
    expect.objectContaining({ name: "Stoneskin", cosineDistance: 0.21 }),
  ]);
```

The reindex test asserts progress `{ current, total }` events and exact result `{ total, indexed, skipped, failed }`.

- [ ] **Step 4.2: Run harness tests and confirm RED**

Run: `pnpm --dir apps/desktop exec vitest run src/ui/spellbookE2EHarness.test.ts`

Expected: FAIL for missing search/reindex implementations.

- [ ] **Step 4.3: Implement semantic and reindex behavior**

Record exact command arguments `{ query, limit }` and `{ force }`. Clone semantic results without sorting or otherwise improving them: the simulator must not hide a frontend contract defect by inventing backend behavior. Emit every reindex progress event before resolving the result.

- [ ] **Step 4.4: Install the command-only browser bridge**

Add these imports to `App.tsx`:

```typescript
import { reindexEmbeddings, searchSpellsSemantic } from "../api/llm";
import { spellbookE2EHarness } from "./spellbookE2EHarness";
```

In a small `useEffect` in `App`, install the bridge only while the harness is active. Pass the public API functions into the harness factory to avoid an `api/llm.ts` -> harness -> `api/llm.ts` import cycle:

```typescript
useEffect(() => {
  const bridge = spellbookE2EHarness.localMl.createCommandBridge({
    searchSpellsSemantic,
    reindexEmbeddings,
  });
  if (!bridge) return;
  window.__SPELLBOOK_E2E_LOCAL_ML_COMMANDS__ = bridge;
  return () => {
    delete window.__SPELLBOOK_E2E_LOCAL_ML_COMMANDS__;
    spellbookE2EHarness.localMl.reset();
  };
}, []);
```

Define `createCommandBridge()` to accept the two functions with their production signatures and return the complete `LocalMlE2ECommandBridge`, including `advanceDownload` and `advanceChat`. The bridge's search/reindex methods call the injected public typed API wrappers, not harness internals. This covers the frontend API-adapter boundary; it intentionally does not claim to traverse native Tauri IPC while the deterministic scenario is active. If the scenario is installed after mount, the page object reloads once to install the bridge.

- [ ] **Step 4.5: Add App bridge lifecycle tests**

In `App.test.tsx`, reset all local-ML globals in `beforeEach`/`afterEach`. Add one test proving no bridge is installed without an explicit scenario, and one test that installs a ready scenario, renders `App`, asserts all four bridge methods exist, unmounts, and asserts `__SPELLBOOK_E2E_LOCAL_ML_COMMANDS__` is removed. Mock the two public API functions for this lifecycle test; command behavior remains covered in harness/API tests.

- [ ] **Step 4.6: Run unit and type checks**

Run:

```powershell
pnpm --dir apps/desktop exec vitest run src/ui/spellbookE2EHarness.test.ts src/ui/App.test.tsx
pnpm --dir apps/desktop typecheck
```

Expected: PASS.

- [ ] **Step 4.7: Commit command-only contracts**

```powershell
git add apps/desktop/src/ui/spellbookE2EHarness.ts apps/desktop/src/ui/spellbookE2EHarness.test.ts apps/desktop/src/ui/App.tsx apps/desktop/src/ui/App.test.tsx
git commit -m "test(e2e): expose semantic command bridge"
```

---

### Task 5: Create the focused Local LLM page object

**Files:**

- Create: `apps/desktop/tests/page-objects/LocalLlmChat.ts`
- Modify: `apps/desktop/tests/page-objects/SpellbookApp.ts`

- [ ] **Step 5.1: Add typed setup and reset helpers**

```typescript
export class LocalLlmChat {
  constructor(private readonly page: Page) {}

  async installScenario(scenario: LocalMlE2EScenario): Promise<void> {
    await this.page.addInitScript((value: LocalMlE2EScenario) => {
      window.__IS_PLAYWRIGHT__ = true;
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = value;
      window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__ = [];
    }, scenario);
    await this.page.reload();
    await expect(this.page.getByRole("navigation")).toBeVisible({ timeout: TIMEOUTS.medium });
  }

}
```

Do not add a reusable `resetScenario()` that implies `addInitScript()` can be removed from the current page. Isolation comes from the existing fresh `appContext` fixture; React unmount invokes the harness runtime reset during page/app teardown.

- [ ] **Step 5.2: Add user workflow helpers**

Implement `openChat()`, `send(message)`, `cancelGeneration()`, `openLlmDownload()`, `advanceDownload()`, `switchLibraryToSemantic()`, `runSemanticSearch(query, limit)`, `runReindex(force)`, and `observations()`. Use existing test IDs (`chat-input`, `btn-ask-chat`, `btn-cancel-chat`, `model-download-modal`, `chat-user-bubble`, `chat-assistant-bubble`, `chat-system-message`, `library-mode-select`) and Library's existing accessible mode controls.

Use one private guard for bridge access and keep values serializable across `page.evaluate`:

```typescript
async runSemanticSearch(query: string, limit?: number): Promise<SemanticSearchResult[]> {
  return this.page.evaluate(
    async ({ query, limit }) => {
      const bridge = window.__SPELLBOOK_E2E_LOCAL_ML_COMMANDS__;
      if (!bridge) throw new Error("Local ML E2E command bridge is not installed");
      return bridge.searchSpellsSemantic(query, limit);
    },
    { query, limit },
  );
}

async runReindex(force: boolean): Promise<ReindexResult> {
  return this.page.evaluate(async (forceValue) => {
    const bridge = window.__SPELLBOOK_E2E_LOCAL_ML_COMMANDS__;
    if (!bridge) throw new Error("Local ML E2E command bridge is not installed");
    return bridge.reindexEmbeddings(forceValue);
  }, force);
}

async advanceDownload(): Promise<void> {
  await this.page.evaluate(() => {
    const bridge = window.__SPELLBOOK_E2E_LOCAL_ML_COMMANDS__;
    if (!bridge) throw new Error("Local ML E2E command bridge is not installed");
    bridge.advanceDownload();
  });
}

async observations(): Promise<LocalMlE2EObservation[]> {
  return this.page.evaluate(
    () => structuredClone(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__ ?? []),
  );
}
```

UI-action helpers (`openChat`, `send`, `cancelGeneration`, `openLlmDownload`, and `switchLibraryToSemantic`) must end on a web-first visible/enabled/URL assertion. Control/data helpers (`advanceDownload`, `runSemanticSearch`, `runReindex`, and `observations`) return after the browser-side operation; the calling test immediately asserts the expected 25%, 100%, terminal, result, or observation state. Do not add `waitForTimeout`.

- [ ] **Step 5.3: Expose the focused page object**

```typescript
readonly localLlm = new LocalLlmChat(this.page);
```

Initialize it in `SpellbookApp` and import the class. Keep all local-ML implementation details in `LocalLlmChat.ts`.

- [ ] **Step 5.4: Run typecheck and lint on page objects**

Run:

```powershell
pnpm --dir apps/desktop typecheck
pnpm --dir apps/desktop exec biome lint tests/page-objects/LocalLlmChat.ts tests/page-objects/SpellbookApp.ts
```

Expected: PASS with no `any`, raw CSS workflow locator, or fixed-wait violations.

- [ ] **Step 5.5: Commit the page object**

```powershell
git add apps/desktop/tests/page-objects/LocalLlmChat.ts apps/desktop/tests/page-objects/SpellbookApp.ts
git commit -m "test(e2e): add local LLM chat page object"
```

---

### Task 6: Add provisioning Playwright scenarios (10.1-10.2)

**Files:**

- Create: `apps/desktop/tests/local_llm_chat.spec.ts`

- [ ] **Step 6.1: Write 10.1 first-run provisioning test**

Use the shared `test` fixture and a fresh app per test. Install `llmStatus: notProvisioned`, open Chat, and assert:

```typescript
await expect(page.getByTestId("chat-provisioning-empty-state")).toBeVisible();
await expect(page.getByTestId("chat-llm-download-button")).toBeVisible();
await expect(page.getByTestId("chat-llm-import-button")).toBeVisible();
await expect(page.getByText(/700 MB/i)).toBeVisible();
```

Confirm `chat-input` and `chat-message-list` are absent while unprovisioned, matching the spec's requirement not to show message input before readiness.

- [ ] **Step 6.2: Write 10.2 download progress/completion test**

Configure progress `256/1024`, then `1024/1024`, `manualProgress: true`, and terminal LLM status `ready`. Click Download and assert the modal and progressbar at 25%; call `advanceDownload()` once and assert the modal remains open at 100%; call it a second time to apply terminal status, then assert modal dismissal and enabled chat input. Finally read observations and assert the event payload keys are exactly `bytesDownloaded` and `totalBytes` (no `bytes_downloaded`/`total_bytes`).

- [ ] **Step 6.3: Rebuild before the first Playwright run**

Run: `pnpm --dir apps/desktop tauri:build --debug`

Expected: debug build succeeds.

- [ ] **Step 6.4: Run provisioning scenarios**

Run: `pnpm --dir apps/desktop exec playwright test tests/local_llm_chat.spec.ts --grep "provisioning|download progress"`

Expected: 2 passed.

- [ ] **Step 6.5: Commit provisioning E2E coverage**

```powershell
git add apps/desktop/tests/local_llm_chat.spec.ts
git commit -m "test(e2e): cover local model provisioning"
```

---

### Task 7: Add chat streaming, link, error, and cancellation scenarios (10.3-10.6)

**Files:**

- Modify: `apps/desktop/tests/local_llm_chat.spec.ts`

- [ ] **Step 7.1: Write 10.3 user-bubble and streaming-response test**

Configure `loaded`, tokens `"Magic "` and `"Missile protects you."`, and a matching done response. After Send, assert the user bubble immediately, assistant `aria-busy="true"` with partial text, then `aria-busy="false"` with full text.

- [ ] **Step 7.2: Write 10.4 grounded spell-link navigation test**

Before installing the ML scenario, create a real spell named `Magic Missile`, call `app.openSpell("Magic Missile")`, and extract the numeric id from the current URL with `const match = page.url().match(/\/edit\/(\d+)$/)`. Assert the match exists, convert `match[1]` to a number, and use that id in the scripted `groundedSpells` entry. Install the scenario, open Chat, complete the response, click `spell-link-magic-missile`, and assert the URL ends with `/edit/<captured-id>` plus the exact heading `Edit Spell`.

- [ ] **Step 7.3: Write 10.5 inline `llm_chat` error test**

Configure `invokeError: "Inference failed: E2E test fault"`. Send once; assert the user bubble remains, the empty assistant placeholder is removed, `chat-system-message` contains the error inline, and the chat input/send path is enabled for retry.

- [ ] **Step 7.4: Write 10.6 partial cancellation test**

Configure at least two tokens and pause after token 1. Wait for the first partial text, click Cancel Generation, then assert the assistant bubble keeps that partial text, becomes `aria-busy="false"`, and the later token never appears. Assert the recorded cancel command uses camelCase `{ streamId }`.

- [ ] **Step 7.5: Rebuild and run chat scenarios**

Run:

```powershell
pnpm --dir apps/desktop tauri:build --debug
pnpm --dir apps/desktop exec playwright test tests/local_llm_chat.spec.ts --grep "streaming|spell link|inline error|cancellation"
```

Expected: 4 passed.

- [ ] **Step 7.6: Commit chat E2E coverage**

```powershell
git add apps/desktop/tests/local_llm_chat.spec.ts
git commit -m "test(e2e): cover chat streaming and cancellation"
```

---

### Task 8: Add semantic availability, ranked results, and reindex scenarios (10.7-10.9)

**Files:**

- Modify: `apps/desktop/tests/local_llm_chat.spec.ts`

- [ ] **Step 8.1: Write 10.7 semantic-mode empty-state test**

Install `embeddingsStatus: notProvisioned`, select `semantic` through `library-mode-select`, and assert `library-semantic-provisioning-state`, `library-embeddings-download-button`, and `library-embeddings-import-button`. Assert `empty-search-state` is absent.

- [ ] **Step 8.2: Write 10.8 ranked `cosineDistance` adapter and Library-order test**

Call the browser bridge through `LocalLlmChat.runSemanticSearch("physical defense", 5)`. Assert two normal spell-summary objects, numeric `cosineDistance`, ascending order, and the observation:

```typescript
expect(observations).toContainEqual({
  kind: "command",
  name: "search_spells_semantic",
  args: { query: "physical defense", limit: 5 },
});
```

This is a frontend API-adapter Playwright test, not a native IPC or visual Library ranking test; Library intentionally hides ranking scores. Native ordering and camelCase serialization remain verified by the existing Rust tests in `commands/embeddings.rs` and the Tauri smoke tests in `src-tauri/src/lib.rs`.

In the same test, enter `physical defense` in `search-input`, select `semantic` in `library-mode-select`, click `library-search-button`, wait for `library-results-state[data-results-settled="true"]`, and assert the table links occur in the same order as the returned results (`Shield`, then `Stoneskin`). Assert the table text does not expose `0.08` or `0.21`, matching the design decision to preserve scores in the API but hide them in Library UI.

- [ ] **Step 8.3: Write 10.9 reindex progress/result contract test**

Run `reindex_embeddings(false)` through the bridge and assert the returned value is exactly `{ total: 2, indexed: 1, skipped: 1, failed: 0 }`. Read the harness observations and assert they contain ordered `embeddings://reindex-progress` payloads `{ current: 1, total: 2 }`, `{ current: 2, total: 2 }`, plus command args `{ force: false }`. No frontend reindex listener is added because the current application has no reindex-progress UI and the spec says the frontend MAY display it.

- [ ] **Step 8.4: Rebuild and run semantic scenarios**

Run:

```powershell
pnpm --dir apps/desktop tauri:build --debug
pnpm --dir apps/desktop exec playwright test tests/local_llm_chat.spec.ts --grep "semantic|reindex"
```

Expected: 3 passed.

- [ ] **Step 8.5: Commit semantic E2E coverage**

```powershell
git add apps/desktop/tests/local_llm_chat.spec.ts
git commit -m "test(e2e): cover semantic search and reindex"
```

---

### Task 9: Verify all Task 10 coverage, then update the OpenSpec checklist

**Files:**

- Modify: `openspec/changes/add-local-llm-chat-interface/tasks.md`

- [ ] **Step 9.1: Run focused unit regressions**

Run:

```powershell
pnpm --dir apps/desktop exec vitest run src/ui/spellbookE2EHarness.test.ts src/api/llm.test.ts src/hooks/useLlmStream.test.tsx src/hooks/useModelDownloadProgress.test.tsx src/hooks/useChatSession.test.tsx src/ui/components/chat/ChatPanel.test.tsx src/ui/Library.test.tsx
```

Expected: all tests pass.

- [ ] **Step 9.2: Run native semantic/reindex contract regressions**

Run:

```powershell
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml semantic_result_serializes_cosine_distance_in_camel_case -- --nocapture
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml semantic_search_result_serializes_flattened_spell_and_cosine_distance -- --nocapture
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml reindex_progress_event_serializes_with_expected_keys -- --nocapture
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml reindex_result_serializes_with_expected_summary_keys -- --nocapture
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml search_spells_semantic_command_is_registered_in_smoke_app -- --nocapture
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml reindex_embeddings_command_is_registered_in_smoke_app -- --nocapture
```

Expected: all six focused Rust tests pass. These checks cover native command registration and camelCase/result serialization that the deterministic frontend harness intentionally bypasses.

- [ ] **Step 9.3: Run static verification**

Run:

```powershell
pnpm --dir apps/desktop typecheck
pnpm --dir apps/desktop lint:biome
pnpm --dir apps/desktop format:check
```

Expected: all commands exit 0.

- [ ] **Step 9.4: Rebuild and run the complete new E2E file**

Run:

```powershell
pnpm --dir apps/desktop tauri:build --debug
pnpm --dir apps/desktop exec playwright test tests/local_llm_chat.spec.ts
```

Expected: 9 passed, 0 failed, 0 skipped on Windows.

- [ ] **Step 9.5: Run the adjacent smoke battery**

Run:

```powershell
pnpm --dir apps/desktop exec playwright test tests/local_llm_chat.spec.ts tests/spellbook_app_open_spell.spec.ts
```

Expected: all tests pass, proving the harness does not affect a normal scenario without explicit ML configuration.

- [ ] **Step 9.6: Mark OpenSpec Task 10 complete only now**

In `openspec/changes/add-local-llm-chat-interface/tasks.md`, change only 10.1 through 10.9 from `- [ ]` to `- [x]`. Do not mark Group 11 tasks.

- [ ] **Step 9.7: Verify spec diff and checklist coverage**

Run:

```powershell
git diff --check
git diff -- openspec/changes/add-local-llm-chat-interface/tasks.md
```

Expected: no whitespace errors; diff shows exactly nine Task 10 checkbox changes.

- [ ] **Step 9.8: Commit the completed spec state**

```powershell
git add openspec/changes/add-local-llm-chat-interface/tasks.md
git commit -m "chore(openspec): mark local LLM E2E tasks complete"
```

---

## Requirement-to-test matrix

| OpenSpec task | Playwright evidence |
| --- | --- |
| 10.1 | First Chat visit shows model size, Download, Add Local Model, and no chat input before readiness |
| 10.2 | Modal observes 25% then 100%, closes at ready, recorded payload keys are camelCase |
| 10.3 | User bubble appears before streamed partial and completed assistant response |
| 10.4 | Grounded spell link navigates to the real existing spell editor route |
| 10.5 | `llm_chat` rejection becomes inline system message and retry stays available |
| 10.6 | Cancel command stops future tokens and retains finalized partial assistant text |
| 10.7 | Semantic mode shows provisioning actions, not a broken/no-results state |
| 10.8 | API bridge returns ascending normal summaries plus numeric `cosineDistance` |
| 10.9 | API bridge observes reindex progress and exact `ReindexResult` fields |
| Completion bookkeeping | Task 9 updates only 10.1-10.9 after all verification passes |

## Verification and safety notes

- No new dependency is required, so the dependency-security approval workflow is not entered.
- The suite remains offline and deterministic; it never contacts model hosts or reads user model assets.
- The harness is frontend-only, explicitly opt-in, and covered by a normal-E2E smoke test to prevent accidental production interception.
- Backend inference, vector math, SHA verification, and Rust event serialization remain covered by existing Rust tests that Task 9 reruns explicitly; Task 10 adds end-user and frontend API-adapter confidence.
- Use web-first assertions and event/state transitions only. Do not add fixed sleeps.
- Always rebuild before Playwright because the fixture launches the compiled Tauri debug binary.

## Self-review checklist

- **Spec coverage:** All nine Task 10 checklist items map to one independent Playwright scenario.
- **Design alignment:** Tests preserve Rust-native/offline behavior, frontend-generated stream IDs, exact event names, FTS-grounded spell links, hidden semantic scores in Library, and reindex result/progress shapes.
- **Type consistency:** Scenario payloads reuse production `llm.ts` types; IPC keys and event payloads remain camelCase.
- **Isolation:** Fresh Tauri fixture per test, explicit scenario install/reset, no shared model/database state.
- **Placeholder scan:** No TBD/TODO/"similar to" implementation steps; every code-changing task names concrete files, commands, and expected results.
- **Spec completion:** The final task updates 10.1-10.9 only after the focused and adjacent E2E batteries pass.

## Grill-me refinement log

### Iteration 1: Scenario installation lifecycle

- **Question:** How is the scenario present before `App` mounts if a reload destroys values assigned by `page.evaluate()`?
- **Resolution:** Install it with `page.addInitScript()` and then reload. Fresh `appContext` fixtures provide inter-test isolation; do not pretend an init script can be removed at runtime.
- **Plan changes:** Corrected the page-object setup and runtime cleanup contract.

### Iteration 2: Simulator responsibility and transient states

- **Question:** Is the harness reproducing external behavior, or accidentally implementing behavior the product/backend should own?
- **Resolution:** Semantic results are passed through unchanged; fixtures arrive in contract-valid ascending order. Download progress uses an explicit pause/advance control so both intermediate and terminal states are deterministic.
- **Plan changes:** Removed harness sorting and timer-dependent progress assertions.

### Iteration 3: Exact UI/spec alignment

- **Question:** Do the planned locators and assertions match the current component tree and existing route behavior?
- **Resolution:** Use the real IDs `chat-llm-download-button`, `chat-llm-import-button`, `library-mode-select`, and `library-semantic-provisioning-state`. Assert chat input is absent before provisioning. Capture a real spell id by opening the created spell and parsing `/edit/<id>` before scripting grounding.
- **Plan changes:** Removed incorrect disabled-input and vague spell-id language.

### Iteration 4: Listener/command ordering

- **Question:** Can the first download-progress event fire before `useModelDownloadProgress` subscribes after React commits the active modal state?
- **Resolution:** Yes. The harness must queue events without listeners and flush them after subscription; a focused unit test locks this ordering down.
- **Plan changes:** Added pending-event queues, cleanup requirements, and a listener-after-command regression test.

### Iteration 5: Final coverage and completion audit

- **Question:** Does each Task 10 checkbox have independent evidence, and can spec checkboxes be marked before evidence exists?
- **Resolution:** Each of 10.1-10.9 maps to one Playwright scenario. The OpenSpec update is gated behind focused unit checks, static checks, a fresh debug build, all nine new E2Es, and an adjacent non-ML smoke test.
- **Plan changes:** Retained the explicit final spec-update task and limited its diff to nine Task 10 checkboxes.

### Iteration 6: Independent spec/application-code re-audit

- **Question:** Do route shapes, progress timing, bridge claims, and native-contract evidence match the application as it exists today?
- **Resolution:** Spell links use `/edit/:id`; progress requires a separate terminal advance after the 100% assertion; the bridge covers the frontend API adapter rather than native IPC; App bridge lifecycle needs its own tests; and native semantic/reindex serialization tests must be rerun explicitly.
- **Plan changes:** Corrected the route, introduced `manualProgress`, fully typed the four-method bridge, added `App.test.tsx`, added Library result-order/hidden-score assertions, and added six focused Rust verification commands.

**Satisfaction:** 99%. The remaining 1% is execution uncertainty inherent to WebView2/Tauri runtime behavior; the plan mitigates it with unit-tested adapters, deterministic controls, a required rebuild, native contract regressions, failure artifacts, and an adjacent smoke test.

## Decisions made

1. Use the repository's existing frontend Playwright harness, not real model downloads or test-only Rust inference commands.
2. Require explicit dual activation (`__IS_PLAYWRIGHT__` plus a scenario), leaving ordinary E2E and production IPC untouched.
3. Test user-visible chat/provisioning/Library behavior through the UI; use a narrow browser bridge only for semantic/reindex commands with no required v1 UI.
4. Reuse production TypeScript payload types and exact Tauri event/command names.
5. Make intermediate async states explicitly controllable and queue pre-subscription events.
6. Update OpenSpec completion state only after verification succeeds.

## Assumptions accepted

- Existing Rust tests remain the authority for inference correctness, vector math, SHA verification, and native serialization; this plan tests frontend integration and end-user workflows.
- The Windows WebView2 environment required by the repository is available when the implementation plan is executed.
- No dependency changes are necessary.

## Open questions

None. Every major branch needed to implement Task 10 has a selected design and verification path.
