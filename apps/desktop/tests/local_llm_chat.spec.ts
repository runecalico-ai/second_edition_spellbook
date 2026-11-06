import type { Page } from "@playwright/test";
import type { SemanticSearchResult } from "../src/types/llm";
import { TIMEOUTS } from "./fixtures/constants";
import { expect, test } from "./fixtures/test-fixtures";
import { SpellbookApp } from "./page-objects/SpellbookApp";

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

interface RecordedIpcCall {
  command: string;
  args?: Record<string, unknown>;
}

type IpcProbeWindow = Window & {
  __SPELLBOOK_E2E_IPC_CALLS__?: RecordedIpcCall[];
  __SPELLBOOK_E2E_NEXT_DIALOG_RESULT__?: string | null;
};

const IPC_ORIGIN = "http://ipc.localhost";

const STUBBED_IPC_COMMANDS = [
  "plugin:dialog|open",
  "embeddings_import_model_file",
  "llm_import_model_file",
];

/**
 * Intercept Tauri IPC so native dialogs and model imports never reach the
 * backend. `plugin:dialog|open` resolves to
 * `__SPELLBOOK_E2E_NEXT_DIALOG_RESULT__`; the import commands resolve to
 * `null`. All other commands pass through unchanged.
 */
async function installIpcProbe(page: Page): Promise<void> {
  await page.evaluate(
    ({ ipcOrigin, stubbed }: { ipcOrigin: string; stubbed: string[] }) => {
      const probeWindow = window as IpcProbeWindow;
      const calls: RecordedIpcCall[] = [];
      probeWindow.__SPELLBOOK_E2E_IPC_CALLS__ = calls;
      probeWindow.__SPELLBOOK_E2E_NEXT_DIALOG_RESULT__ = null;

      // Tauri locks `window.__TAURI_INTERNALS__` and its `invoke` (both
      // non-writable), so intercept one layer down: Tauri's IPC POSTs each
      // command as JSON to `<ipcOrigin>/<command>` with the global `fetch`, and
      // resolves the call when the response has `Tauri-Response: ok`.
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const command = decodeURIComponent(url.pathname.slice(1));
        if (url.origin !== ipcOrigin || !stubbed.includes(command)) {
          return originalFetch(input, init);
        }

        const body = typeof init?.body === "string" ? init.body : "{}";
        calls.push({ command, args: JSON.parse(body) as Record<string, unknown> });
        const result =
          command === "plugin:dialog|open"
            ? (probeWindow.__SPELLBOOK_E2E_NEXT_DIALOG_RESULT__ ?? null)
            : null;
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json", "Tauri-Response": "ok" },
        });
      };
    },
    { ipcOrigin: IPC_ORIGIN, stubbed: STUBBED_IPC_COMMANDS },
  );
}

async function setNextDialogResult(page: Page, result: string | null): Promise<void> {
  await page.evaluate((value: string | null) => {
    (window as IpcProbeWindow).__SPELLBOOK_E2E_NEXT_DIALOG_RESULT__ = value;
  }, result);
}

async function readIpcCalls(page: Page): Promise<RecordedIpcCall[]> {
  return page.evaluate(() =>
    structuredClone((window as IpcProbeWindow).__SPELLBOOK_E2E_IPC_CALLS__ ?? []),
  );
}

function dialogOptions(calls: RecordedIpcCall[]): Record<string, unknown>[] {
  return calls
    .filter((call) => call.command === "plugin:dialog|open")
    .map((call) => (call.args?.options ?? {}) as Record<string, unknown>);
}

test.describe("Local LLM chat provisioning", () => {
  test("first-run provisioning shows model size, Download, Add Local Model, and no chat input", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.localLlm.installScenario({
      llmStatus: { status: "notProvisioned", modelPath: "" },
      embeddingsStatus: { state: "notProvisioned" },
    });

    await app.localLlm.openChat();

    const emptyState = page.getByTestId("chat-provisioning-empty-state");
    await expect(emptyState).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
    await expect(page.getByTestId("chat-llm-download-button")).toBeVisible();
    await expect(page.getByTestId("chat-llm-import-button")).toBeVisible();
    // Scoped to the visible empty state: the same "~700 MB" text is also
    // rendered (sr-only) inside the accessibility live region, so an
    // unscoped page.getByText(/700 MB/i) is a strict-mode locator ambiguity.
    await expect(emptyState.getByText(/700 MB/i)).toBeVisible();

    await expect(page.getByTestId("chat-input")).toHaveCount(0);
    await expect(page.getByTestId("chat-message-list")).toHaveCount(0);
  });

  test("download progress advances from 25% to 100% and completion enables chat input", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.localLlm.installScenario({
      llmStatus: { status: "notProvisioned", modelPath: "" },
      embeddingsStatus: { state: "notProvisioned" },
      download: {
        kind: "llm",
        progress: [
          { bytesDownloaded: 256, totalBytes: 1024 },
          { bytesDownloaded: 1024, totalBytes: 1024 },
        ],
        manualProgress: true,
        terminalLlmStatus: {
          status: "ready",
          modelPath: "/vault/models/tinyllama.gguf",
        },
      },
    });

    await app.localLlm.openChat();
    await app.localLlm.openLlmDownload();

    const progressBar = page.getByTestId("model-download-modal-progress-bar");
    await expect(progressBar).toHaveAttribute("aria-valuenow", "25", {
      timeout: TIMEOUTS.medium,
    });

    await app.localLlm.advanceDownload();
    await expect(progressBar).toHaveAttribute("aria-valuenow", "100", {
      timeout: TIMEOUTS.medium,
    });
    await expect(page.getByTestId("model-download-modal")).toBeVisible();

    await app.localLlm.advanceDownload();
    await expect(page.getByTestId("model-download-modal")).not.toBeVisible({
      timeout: TIMEOUTS.medium,
    });
    await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: TIMEOUTS.medium });
    await expect(page.getByTestId("chat-input")).toBeEnabled();

    const observations = await app.localLlm.observations();
    const progressEvents = observations.filter(
      (observation) =>
        observation.kind === "event" && observation.name === "llm://download-progress",
    );
    expect(progressEvents.length).toBeGreaterThan(0);
    for (const observation of progressEvents) {
      expect(Object.keys(observation.payload as Record<string, unknown>).sort()).toEqual(
        ["bytesDownloaded", "totalBytes"].sort(),
      );
    }
  });

  test("Add Local Embedding Model asks for a folder and Add Local Model asks for a file", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const fakeMiniLmFolder = "C:\\e2e\\models\\all-MiniLM-L6-v2";

    await test.step("Open Chat with both models unprovisioned", async () => {
      await app.localLlm.installScenario({
        llmStatus: { status: "notProvisioned", modelPath: "" },
        embeddingsStatus: { state: "notProvisioned" },
      });
      await app.localLlm.openChat();
      await expect(page.getByTestId("chat-llm-import-button")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await expect(page.getByTestId("chat-embeddings-import-button")).toBeVisible();
      await installIpcProbe(page);
    });

    await test.step("Embedding side-load opens a folder picker and imports the folder", async () => {
      await setNextDialogResult(page, fakeMiniLmFolder);
      await page.getByTestId("chat-embeddings-import-button").click();

      await expect
        .poll(async () => (await readIpcCalls(page)).map((call) => call.command), {
          timeout: TIMEOUTS.short,
        })
        .toContain("embeddings_import_model_file");

      const calls = await readIpcCalls(page);
      const options = dialogOptions(calls);
      expect(options).toHaveLength(1);
      expect(options[0]).toMatchObject({ directory: true, multiple: false });
      expect(calls).toContainEqual({
        command: "embeddings_import_model_file",
        args: { filePath: fakeMiniLmFolder },
      });
    });

    await test.step("Chat model side-load opens a file picker; cancel imports nothing", async () => {
      await setNextDialogResult(page, null);
      await page.getByTestId("chat-llm-import-button").click();

      await expect
        .poll(async () => dialogOptions(await readIpcCalls(page)).length, {
          timeout: TIMEOUTS.short,
        })
        .toBe(2);

      const calls = await readIpcCalls(page);
      expect(dialogOptions(calls)[1].directory).not.toBe(true);
      expect(calls.map((call) => call.command)).not.toContain("llm_import_model_file");
    });
  });
});

test.describe("Local LLM chat streaming", () => {
  test("user message and streamed assistant response render token-by-token to completion", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.localLlm.installScenario({
      llmStatus: { status: "loaded", modelPath: "/vault/models/tinyllama.gguf" },
      embeddingsStatus: { state: "notProvisioned" },
      chat: {
        tokens: ["Magic ", "Missile protects you."],
        pauseAfterToken: 1,
        done: {
          fullResponse: "Magic Missile protects you.",
          cancelled: false,
          timedOut: false,
          searchTerms: [],
          groundedSpells: [],
        },
      },
    });

    await app.localLlm.openChat();
    await app.localLlm.send("Tell me about Magic Missile");

    await expect(page.getByTestId("chat-user-bubble").last()).toContainText(
      "Tell me about Magic Missile",
    );

    const assistantBubble = page.getByTestId("chat-assistant-bubble").last();
    await expect(assistantBubble).toHaveAttribute("aria-busy", "true", {
      timeout: TIMEOUTS.medium,
    });
    await expect(assistantBubble).toHaveText("Magic ", { timeout: TIMEOUTS.medium });
    await expect(assistantBubble).not.toContainText("Missile");

    await app.localLlm.advanceChat();

    await expect(assistantBubble).toHaveAttribute("aria-busy", "false", {
      timeout: TIMEOUTS.medium,
    });
    await expect(assistantBubble).toHaveText("Magic Missile protects you.", {
      timeout: TIMEOUTS.medium,
    });
  });

  test("grounded spell link navigates to the spell's editor", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.createSpell({
      name: "Magic Missile",
      level: "1",
      description: "A missile of magical energy that unerringly strikes its target.",
    });
    await app.openSpell("Magic Missile");
    const match = page.url().match(/\/edit\/(\d+)$/);
    expect(match).not.toBeNull();
    const spellId = Number(match?.[1]);

    await app.localLlm.installScenario({
      llmStatus: { status: "loaded", modelPath: "/vault/models/tinyllama.gguf" },
      embeddingsStatus: { state: "notProvisioned" },
      chat: {
        tokens: ["Magic Missile is a reliable spell."],
        done: {
          fullResponse: "Magic Missile is a reliable spell.",
          cancelled: false,
          timedOut: false,
          searchTerms: ["magic missile"],
          groundedSpells: [
            {
              id: spellId,
              name: "Magic Missile",
              school: "Evocation",
              level: 1,
              descriptionSnippet: "A missile of magical energy.",
            },
          ],
        },
      },
    });

    await app.localLlm.openChat();
    await app.localLlm.send("Tell me about Magic Missile");

    const assistantBubble = page.getByTestId("chat-assistant-bubble").last();
    await expect(assistantBubble).toHaveAttribute("aria-busy", "false", {
      timeout: TIMEOUTS.medium,
    });

    await page.getByTestId("spell-link-magic-missile").click();

    await expect(page).toHaveURL(new RegExp(`/edit/${spellId}$`), {
      timeout: TIMEOUTS.medium,
    });
    await expect(page.getByRole("heading", { name: "Edit Spell" })).toBeVisible();
  });

  test("inline llm_chat invoke error shows a system message and allows retry", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.localLlm.installScenario({
      llmStatus: { status: "loaded", modelPath: "/vault/models/tinyllama.gguf" },
      embeddingsStatus: { state: "notProvisioned" },
      chat: {
        tokens: [],
        done: {
          fullResponse: "",
          cancelled: false,
          timedOut: false,
          searchTerms: [],
          groundedSpells: [],
        },
        invokeError: "Inference failed: E2E test fault",
      },
    });

    await app.localLlm.openChat();
    await app.localLlm.send("Tell me about Magic Missile");

    const systemMessage = page.getByTestId("chat-system-message");
    await expect(systemMessage).toBeVisible({ timeout: TIMEOUTS.medium });
    await expect(systemMessage).toContainText("Inference failed: E2E test fault");

    await expect(page.getByTestId("chat-assistant-bubble")).toHaveCount(0);

    const input = page.getByTestId("chat-input");
    await expect(input).toBeVisible();
    await expect(input).toBeEnabled();
    await input.fill("Try again");
    await expect(page.getByTestId("btn-ask-chat")).toBeEnabled();
  });

  test("cancelling mid-stream stops further tokens from arriving", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.localLlm.installScenario({
      llmStatus: { status: "loaded", modelPath: "/vault/models/tinyllama.gguf" },
      embeddingsStatus: { state: "notProvisioned" },
      chat: {
        tokens: ["Partial ", "response that should not fully arrive."],
        pauseAfterToken: 1,
        done: {
          fullResponse: "Partial response that should not fully arrive.",
          cancelled: false,
          timedOut: false,
          searchTerms: [],
          groundedSpells: [],
        },
      },
    });

    await app.localLlm.openChat();
    await app.localLlm.send("Tell me about Magic Missile");

    const assistantBubble = page.getByTestId("chat-assistant-bubble").last();
    await expect(assistantBubble).toContainText("Partial ", { timeout: TIMEOUTS.medium });

    await app.localLlm.cancelGeneration();

    await expect(assistantBubble).toHaveText("Partial ");
    await expect(assistantBubble).not.toContainText("response that should not fully arrive.");
    await expect(assistantBubble).toHaveAttribute("aria-busy", "false", {
      timeout: TIMEOUTS.medium,
    });

    const observations = await app.localLlm.observations();
    expect(observations).toContainEqual(
      expect.objectContaining({ kind: "command", name: "llm_cancel_generation" }),
    );
    const cancelObservation = observations.find(
      (observation) =>
        observation.kind === "command" && observation.name === "llm_cancel_generation",
    );
    expect(cancelObservation).toBeDefined();
    const args = cancelObservation?.args as Record<string, unknown>;
    expect(Object.keys(args)).toEqual(["streamId"]);
    expect(typeof args.streamId).toBe("string");
  });
});

test.describe("Local LLM semantic search and reindex", () => {
  test("semantic mode with unprovisioned embeddings shows the provisioning panel, not the generic empty state", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.localLlm.installScenario({
      llmStatus: { status: "notProvisioned", modelPath: "" },
      embeddingsStatus: { state: "notProvisioned" },
    });

    await app.navigate("Library");
    await app.waitForLibrary();
    await expect(page.getByTestId("library-mode-select")).toHaveValue("keyword");

    await page.getByTestId("search-input").fill("zzzz-no-match");
    await page.getByTestId("library-search-button").click();
    await expect(page.getByTestId("empty-search-state")).toBeVisible({
      timeout: TIMEOUTS.medium,
    });

    await app.localLlm.switchLibraryToSemantic();

    await expect(page.getByTestId("library-semantic-provisioning-state")).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
    await expect(page.getByTestId("library-embeddings-download-button")).toBeVisible();
    await expect(page.getByTestId("library-embeddings-import-button")).toBeVisible();
    await expect(page.getByTestId("empty-search-state")).toHaveCount(0);
  });

  test("semantic search returns ranked results and Library renders them in order without the raw score", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    const rankedSemanticResults: SemanticSearchResult[] = [
      {
        id: 1,
        name: "Shield",
        level: 1,
        isQuestSpell: 0,
        isCantrip: 0,
        cosineDistance: 0.08,
      },
      {
        id: 2,
        name: "Stoneskin",
        level: 4,
        isQuestSpell: 0,
        isCantrip: 0,
        cosineDistance: 0.21,
      },
    ];

    await app.localLlm.installScenario({
      llmStatus: { status: "notProvisioned", modelPath: "" },
      embeddingsStatus: { state: "ready" },
      semanticResults: rankedSemanticResults,
    });

    const results = await app.localLlm.runSemanticSearch("physical defense", 5);
    expect(results).toEqual(rankedSemanticResults);
    expect(results[0].cosineDistance).toBeLessThan(results[1].cosineDistance);

    const observations = await app.localLlm.observations();
    expect(observations).toContainEqual({
      kind: "command",
      name: "search_spells_semantic",
      args: { query: "physical defense", limit: 5 },
    });

    await app.localLlm.switchLibraryToSemantic();
    const resultsState = page.getByTestId("library-results-state");
    const previousSearchRequestId = await resultsState.getAttribute("data-search-request-id");

    await page.getByTestId("search-input").fill("physical defense");
    await page.getByTestId("library-search-button").click();

    await expect
      .poll(async () => resultsState.getAttribute("data-search-request-id"), {
        timeout: TIMEOUTS.medium,
        intervals: [50, 100, 200],
      })
      .not.toBe(previousSearchRequestId);

    await expect(resultsState).toHaveAttribute("data-results-settled", "true", {
      timeout: TIMEOUTS.medium,
    });

    const spellTable = page.getByTestId("spell-library-table");
    const spellLinks = spellTable.locator('[data-testid^="spell-link-"]');
    await expect(spellLinks).toHaveCount(2, { timeout: TIMEOUTS.medium });
    const testIds = await spellLinks.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-testid")),
    );
    expect(testIds).toEqual(["spell-link-shield", "spell-link-stoneskin"]);

    await expect(spellTable).not.toContainText("0.08");
    await expect(spellTable).not.toContainText("0.21");
  });

  test("reindex emits ordered progress events before resolving the summary result", async ({
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

    const result = await app.localLlm.runReindex(false);
    expect(result).toEqual({ total: 2, indexed: 1, skipped: 1, failed: 0 });

    const observations = await app.localLlm.observations();
    const progressPayloads = observations
      .filter(
        (observation) =>
          observation.kind === "event" && observation.name === "embeddings://reindex-progress",
      )
      .map((observation) => observation.payload);
    expect(progressPayloads).toEqual([
      { current: 1, total: 2 },
      { current: 2, total: 2 },
    ]);

    expect(observations).toContainEqual({
      kind: "command",
      name: "reindex_embeddings",
      args: { force: false },
    });
  });

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
});
