// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DoneEvent, DownloadProgressEvent } from "../types/llm";
import type { RangeSpec } from "../types/spell";
import type { LocalMlE2EScenario } from "./spellbookE2EHarness";
import { emitLocalMlEvent, spellbookE2EHarness } from "./spellbookE2EHarness";

function resetHarnessWindowState() {
  window.__IS_PLAYWRIGHT__ = undefined;
  window.__SPELLBOOK_E2E_SAVE_INVOKE_DELAY_MS = undefined;
  window.__SPELLBOOK_E2E_SPELL_PICKER_SEARCH_DELAYS__ = undefined;
  window.__SPELLBOOK_E2E_SPELL_PICKER_SEARCH_EVENTS__ = undefined;
  window.__SPELLBOOK_E2E_CORRUPT_RANGE_BASE = undefined;
  window.__SPELLBOOK_E2E_VISUAL_CONTRACT__ = undefined;
  window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = undefined;
  window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__ = undefined;
  window.__SPELLBOOK_E2E_LOCAL_ML_COMMANDS__ = undefined;
  spellbookE2EHarness.localMl.reset();
}

function readyScenario(): LocalMlE2EScenario {
  return {
    llmStatus: { status: "loaded", modelPath: "C:/models/llm.gguf" },
    embeddingsStatus: { state: "ready" },
  };
}

function createDistanceRangeSpec(value = 10): RangeSpec {
  return {
    kind: "distance",
    unit: "ft",
    text: `${value} ft`,
    distance: {
      mode: "fixed",
      value,
    },
  };
}

describe("spellbookE2EHarness", () => {
  beforeEach(() => {
    resetHarnessWindowState();
    vi.useRealTimers();
  });

  afterEach(() => {
    resetHarnessWindowState();
    vi.useRealTimers();
  });

  it("reads the spell editor visual contract state through the harness", () => {
    expect(spellbookE2EHarness.spellEditor.isVisualContractMode()).toBe(false);

    window.__SPELLBOOK_E2E_VISUAL_CONTRACT__ = "all-structured";

    expect(spellbookE2EHarness.spellEditor.isVisualContractMode()).toBe(true);
  });

  it("keeps local ML overrides opt-in", async () => {
    window.__IS_PLAYWRIGHT__ = true;
    expect(spellbookE2EHarness.localMl.getLlmStatus()).toBeUndefined();

    window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = readyScenario();
    const status = spellbookE2EHarness.localMl.getLlmStatus();
    expect(status).toBeDefined();
    if (!status) {
      throw new Error("expected llm status promise");
    }
    await expect(status).resolves.toMatchObject({
      status: "loaded",
    });
    expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
      kind: "command",
      name: "llm_status",
      args: {},
    });
  });

  it("returns isolated active embeddings status overrides and records their observation", async () => {
    window.__IS_PLAYWRIGHT__ = true;
    window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
      ...readyScenario(),
      embeddingsStatus: { state: "downloading", downloadProgress: 42 },
    };

    const status = await spellbookE2EHarness.localMl.getEmbeddingsStatus();

    expect(status).toEqual({ state: "downloading", downloadProgress: 42 });
    expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
      kind: "command",
      name: "embeddings_status",
      args: {},
    });

    if (!status) {
      throw new Error("expected embeddings status override");
    }
    status.state = "error";
    status.downloadProgress = 0;

    expect(window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__?.embeddingsStatus).toEqual({
      state: "downloading",
      downloadProgress: 42,
    });
  });

  it("requires Playwright mode for local ML overrides", () => {
    window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = readyScenario();

    expect(spellbookE2EHarness.localMl.getLlmStatus()).toBeUndefined();
    expect(spellbookE2EHarness.localMl.getEmbeddingsStatus()).toBeUndefined();
  });

  it("consumes one-shot range corruption probes through the harness", () => {
    window.__IS_PLAYWRIGHT__ = true;
    window.__SPELLBOOK_E2E_CORRUPT_RANGE_BASE = { value: -1 };

    const original = createDistanceRangeSpec(10);
    const corrupted = spellbookE2EHarness.spellEditor.applyRangeDistanceCorruption(original);
    const replay = spellbookE2EHarness.spellEditor.applyRangeDistanceCorruption(original);

    expect(corrupted.distance?.value).toBe(-1);
    expect(window.__SPELLBOOK_E2E_CORRUPT_RANGE_BASE?.consumed).toBe(true);
    expect(replay.distance?.value).toBe(10);
  });

  it("waits for configured save delays through the harness", async () => {
    vi.useFakeTimers();
    window.__IS_PLAYWRIGHT__ = true;
    window.__SPELLBOOK_E2E_SAVE_INVOKE_DELAY_MS = 31_500;

    let settled = false;
    const pending = spellbookE2EHarness.spellEditor.waitForSaveInvokeDelay().then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(29_999);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toBe(true);
  });

  it("returns undefined from localMl.listen when the harness is inactive", () => {
    const handler = vi.fn();

    expect(spellbookE2EHarness.localMl.listen("llm://download-progress", handler)).toBeUndefined();

    window.__IS_PLAYWRIGHT__ = true;
    expect(spellbookE2EHarness.localMl.listen("llm://download-progress", handler)).toBeUndefined();
    expect(handler).not.toHaveBeenCalled();
  });

  it("dispatches cloned payloads to registered listeners and records event observations", async () => {
    window.__IS_PLAYWRIGHT__ = true;
    window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = readyScenario();

    const received: Array<{ event: string; payload: unknown }> = [];
    const listenResult = spellbookE2EHarness.localMl.listen<{ bytesDownloaded: number }>(
      "llm://download-progress",
      (event) => {
        received.push({ event: event.event, payload: event.payload });
      },
    );
    expect(listenResult).toBeDefined();
    if (!listenResult) {
      throw new Error("expected active listen to return an unlisten promise");
    }
    const unlisten = await listenResult;

    const payload = { bytesDownloaded: 100, totalBytes: 200 };
    emitLocalMlEvent("llm://download-progress", payload);

    expect(received).toEqual([{ event: "llm://download-progress", payload }]);
    expect(received[0]?.payload).not.toBe(payload);
    expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
      kind: "event",
      name: "llm://download-progress",
      payload,
    });

    unlisten();
  });

  it("supports idempotent unlisten and keeps sibling listeners registered", async () => {
    window.__IS_PLAYWRIGHT__ = true;
    window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = readyScenario();

    const first = vi.fn();
    const second = vi.fn();
    const firstListen = spellbookE2EHarness.localMl.listen("embeddings://reindex-progress", first);
    const secondListen = spellbookE2EHarness.localMl.listen(
      "embeddings://reindex-progress",
      second,
    );
    if (!firstListen || !secondListen) {
      throw new Error("expected active listen to return unlisten promises");
    }
    const unlistenFirst = await firstListen;
    const unlistenSecond = await secondListen;

    unlistenFirst();
    unlistenFirst();
    emitLocalMlEvent("embeddings://reindex-progress", { current: 1, total: 2 });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    unlistenSecond();
    emitLocalMlEvent("embeddings://reindex-progress", { current: 2, total: 2 });
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("re-registers listeners on an event after its bucket empties", async () => {
    window.__IS_PLAYWRIGHT__ = true;
    window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = readyScenario();

    const handler = vi.fn();
    const firstListen = spellbookE2EHarness.localMl.listen("llm://download-progress", handler);
    if (!firstListen) {
      throw new Error("expected active listen to return an unlisten promise");
    }
    (await firstListen)();

    const secondListen = spellbookE2EHarness.localMl.listen("llm://download-progress", handler);
    if (!secondListen) {
      throw new Error("expected active listen to return an unlisten promise");
    }
    const unlisten = await secondListen;

    emitLocalMlEvent("llm://download-progress", { bytesDownloaded: 1, totalBytes: 2 });
    expect(handler).toHaveBeenCalledTimes(1);

    unlisten();
  });

  it("keeps local ML command overrides opt-in", () => {
    const localMl = spellbookE2EHarness.localMl;
    window.__IS_PLAYWRIGHT__ = true;

    expect(localMl.downloadLlmModel()).toBeUndefined();
    expect(localMl.downloadEmbeddingsModel()).toBeUndefined();
    expect(localMl.cancelLlmDownload()).toBeUndefined();
    expect(localMl.cancelEmbeddingsDownload()).toBeUndefined();
    expect(localMl.startLlmChat("Hi", "stream-1", [])).toBeUndefined();
    expect(localMl.cancelLlmGeneration("stream-1")).toBeUndefined();
    expect(localMl.searchSpellsSemantic("fireball")).toBeUndefined();
    expect(localMl.reindexEmbeddings(false)).toBeUndefined();
    expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toBeUndefined();
  });

  it("records active command observations for download and cancel overrides", async () => {
    window.__IS_PLAYWRIGHT__ = true;
    window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = readyScenario();
    const localMl = spellbookE2EHarness.localMl;

    await expect(localMl.downloadLlmModel()).resolves.toBeUndefined();
    await expect(localMl.downloadEmbeddingsModel()).resolves.toBeUndefined();
    await expect(localMl.cancelLlmDownload()).resolves.toBeUndefined();
    await expect(localMl.cancelEmbeddingsDownload()).resolves.toBeUndefined();
    await expect(localMl.cancelLlmGeneration("stream-9")).resolves.toBeUndefined();

    expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toEqual([
      { kind: "command", name: "llm_download_model", args: {} },
      { kind: "command", name: "embeddings_download_model", args: {} },
      { kind: "command", name: "llm_cancel_download", args: {} },
      { kind: "command", name: "embeddings_cancel_download", args: {} },
      { kind: "command", name: "llm_cancel_generation", args: { streamId: "stream-9" } },
    ]);
  });

  it("scripts startLlmChat overrides from the scenario chat block", async () => {
    window.__IS_PLAYWRIGHT__ = true;
    window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = readyScenario();
    const localMl = spellbookE2EHarness.localMl;
    const history = [{ role: "user" as const, content: "Hello" }];

    await expect(localMl.startLlmChat("What is fireball?", "stream-1", history)).resolves.toBe(
      undefined,
    );
    expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
      kind: "command",
      name: "llm_chat",
      args: { message: "What is fireball?", streamId: "stream-1", history },
    });

    window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
      ...readyScenario(),
      chat: {
        tokens: [],
        done: {
          fullResponse: "",
          cancelled: false,
          searchTerms: [],
          groundedSpells: [],
          timedOut: false,
        },
        invokeError: "model not loaded",
      },
    };
    await expect(localMl.startLlmChat("Hi", "stream-2", [])).rejects.toThrow("model not loaded");
  });

  it("returns isolated semantic results and scripted reindex results", async () => {
    window.__IS_PLAYWRIGHT__ = true;
    const scenario: LocalMlE2EScenario = {
      ...readyScenario(),
      semanticResults: [
        {
          id: 101,
          name: "Fireball",
          school: "Evocation",
          level: 3,
          isQuestSpell: 0,
          isCantrip: 0,
          cosineDistance: 0.12,
        },
      ],
      reindex: {
        progress: [],
        result: { total: 10, indexed: 8, skipped: 1, failed: 1 },
      },
    };
    window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = scenario;
    const localMl = spellbookE2EHarness.localMl;

    const results = await localMl.searchSpellsSemantic("fireball", 5);
    expect(results).toEqual(scenario.semanticResults);
    expect(results).not.toBe(scenario.semanticResults);
    expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
      kind: "command",
      name: "search_spells_semantic",
      args: { query: "fireball", limit: 5 },
    });

    const reindexed = await localMl.reindexEmbeddings(true);
    expect(reindexed).toEqual({ total: 10, indexed: 8, skipped: 1, failed: 1 });
    expect(reindexed).not.toBe(scenario.reindex?.result);
    expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
      kind: "command",
      name: "reindex_embeddings",
      args: { force: true },
    });
  });

  it("clones ranked semantic results through unchanged without re-sorting them", async () => {
    window.__IS_PLAYWRIGHT__ = true;
    const scenario: LocalMlE2EScenario = {
      ...readyScenario(),
      semanticResults: [
        {
          id: 201,
          name: "Shield",
          school: "Evocation",
          level: 1,
          isQuestSpell: 0,
          isCantrip: 0,
          cosineDistance: 0.08,
        },
        {
          id: 202,
          name: "Stoneskin",
          school: "Alteration",
          level: 4,
          isQuestSpell: 0,
          isCantrip: 0,
          cosineDistance: 0.21,
        },
      ],
    };
    window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = scenario;

    await expect(
      spellbookE2EHarness.localMl.searchSpellsSemantic("physical defense", 5),
    ).resolves.toEqual([
      expect.objectContaining({ name: "Shield", cosineDistance: 0.08 }),
      expect.objectContaining({ name: "Stoneskin", cosineDistance: 0.21 }),
    ]);
  });

  it("emits every scripted reindex progress event before resolving the reindex result", async () => {
    window.__IS_PLAYWRIGHT__ = true;
    window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
      ...readyScenario(),
      reindex: {
        progress: [
          { current: 1, total: 3 },
          { current: 2, total: 3 },
          { current: 3, total: 3 },
        ],
        result: { total: 3, indexed: 2, skipped: 1, failed: 0 },
      },
    };
    const localMl = spellbookE2EHarness.localMl;

    const progressEvents: Array<{ current: number; total: number }> = [];
    const listenResult = localMl.listen<{ current: number; total: number }>(
      "embeddings://reindex-progress",
      (event) => {
        progressEvents.push(event.payload);
      },
    );
    if (!listenResult) {
      throw new Error("expected active listen to return an unlisten promise");
    }
    await listenResult;

    await expect(localMl.reindexEmbeddings(true)).resolves.toEqual({
      total: 3,
      indexed: 2,
      skipped: 1,
      failed: 0,
    });

    expect(progressEvents).toEqual([
      { current: 1, total: 3 },
      { current: 2, total: 3 },
      { current: 3, total: 3 },
    ]);
  });

  it("resolves empty semantic results and rejects unscripted reindex when active", async () => {
    window.__IS_PLAYWRIGHT__ = true;
    window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = readyScenario();
    const localMl = spellbookE2EHarness.localMl;

    await expect(localMl.searchSpellsSemantic("fireball")).resolves.toEqual([]);
    expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
      kind: "command",
      name: "search_spells_semantic",
      args: { query: "fireball" },
    });

    await expect(localMl.reindexEmbeddings(false)).rejects.toThrow("not scripted");
  });

  describe("scripted downloads", () => {
    it("runs a manual-progress LLM download and applies terminal status on the second advance", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        llmStatus: { status: "notProvisioned", modelPath: "C:/models/llm.gguf" },
        download: {
          kind: "llm",
          manualProgress: true,
          progress: [
            { bytesDownloaded: 256, totalBytes: 1024 },
            { bytesDownloaded: 1024, totalBytes: 1024 },
          ],
          terminalLlmStatus: { status: "ready", modelPath: "C:/models/llm.gguf" },
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      const payloads: DownloadProgressEvent[] = [];
      const listenResult = localMl.listen<DownloadProgressEvent>(
        "llm://download-progress",
        (event) => {
          payloads.push(event.payload);
        },
      );
      if (!listenResult) {
        throw new Error("expected active listen to return an unlisten promise");
      }
      await listenResult;

      const downloadPromise = localMl.downloadLlmModel();
      expect(downloadPromise).toBeDefined();

      await Promise.resolve();
      expect(payloads).toEqual([{ bytesDownloaded: 256, totalBytes: 1024 }]);

      const duringDownloadStatus = localMl.getLlmStatus();
      await expect(duringDownloadStatus).resolves.toMatchObject({ status: "downloading" });

      localMl.advanceDownload();
      await Promise.resolve();
      expect(payloads).toEqual([
        { bytesDownloaded: 256, totalBytes: 1024 },
        { bytesDownloaded: 1024, totalBytes: 1024 },
      ]);

      localMl.advanceDownload();
      await downloadPromise;

      const status = spellbookE2EHarness.localMl.getLlmStatus();
      expect(status).toBeDefined();
      if (!status) {
        throw new Error("expected llm status promise");
      }
      await expect(status).resolves.toMatchObject({
        status: "ready",
      });
    });

    it("runs a manual-progress embeddings download and applies terminal status", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        embeddingsStatus: { state: "notProvisioned" },
        download: {
          kind: "embeddings",
          manualProgress: true,
          progress: [{ bytesDownloaded: 512, totalBytes: 512 }],
          terminalEmbeddingsStatus: { state: "ready" },
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      const payloads: DownloadProgressEvent[] = [];
      const listenResult = localMl.listen<DownloadProgressEvent>(
        "embeddings://download-progress",
        (event) => {
          payloads.push(event.payload);
        },
      );
      if (!listenResult) {
        throw new Error("expected active listen to return an unlisten promise");
      }
      await listenResult;

      const downloadPromise = localMl.downloadEmbeddingsModel();
      await Promise.resolve();
      expect(payloads).toEqual([{ bytesDownloaded: 512, totalBytes: 512 }]);

      localMl.advanceDownload();
      await downloadPromise;

      await expect(localMl.getEmbeddingsStatus()).resolves.toMatchObject({ state: "ready" });
    });

    it("cancels an active LLM download back to notProvisioned and resolves the download promise", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        llmStatus: { status: "notProvisioned", modelPath: "C:/models/llm.gguf" },
        download: {
          kind: "llm",
          manualProgress: true,
          progress: [
            { bytesDownloaded: 256, totalBytes: 1024 },
            { bytesDownloaded: 1024, totalBytes: 1024 },
          ],
          terminalLlmStatus: { status: "ready", modelPath: "C:/models/llm.gguf" },
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      const downloadPromise = localMl.downloadLlmModel();
      expect(downloadPromise).toBeDefined();
      await Promise.resolve();

      await localMl.cancelLlmDownload();
      await downloadPromise;

      await expect(localMl.getLlmStatus()).resolves.toMatchObject({ status: "notProvisioned" });

      // Further advances are no-ops once cancelled; no additional progress events fire.
      const payloads: DownloadProgressEvent[] = [];
      const listenResult = localMl.listen<DownloadProgressEvent>(
        "llm://download-progress",
        (event) => {
          payloads.push(event.payload);
        },
      );
      if (!listenResult) {
        throw new Error("expected active listen to return an unlisten promise");
      }
      await listenResult;
      // Cancellation clears remaining/pending progress; the listener sees
      // nothing from before cancellation, and advancing a cancelled (no
      // longer active) download is a no-op that emits nothing further.
      expect(payloads).toEqual([]);
      localMl.advanceDownload();
      await Promise.resolve();
      expect(payloads).toEqual([]);
    });

    it("runs an auto-progress LLM download without advanceDownload calls", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        llmStatus: { status: "notProvisioned", modelPath: "C:/models/llm.gguf" },
        download: {
          kind: "llm",
          progress: [
            { bytesDownloaded: 256, totalBytes: 1024 },
            { bytesDownloaded: 1024, totalBytes: 1024 },
          ],
          terminalLlmStatus: { status: "ready", modelPath: "C:/models/llm.gguf" },
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      const payloads: DownloadProgressEvent[] = [];
      const listenResult = localMl.listen<DownloadProgressEvent>(
        "llm://download-progress",
        (event) => {
          payloads.push(event.payload);
        },
      );
      if (!listenResult) {
        throw new Error("expected active listen to return an unlisten promise");
      }
      await listenResult;

      const downloadPromise = localMl.downloadLlmModel();
      expect(downloadPromise).toBeDefined();

      await downloadPromise;

      expect(payloads).toEqual([
        { bytesDownloaded: 256, totalBytes: 1024 },
        { bytesDownloaded: 1024, totalBytes: 1024 },
      ]);
      const status = spellbookE2EHarness.localMl.getLlmStatus();
      expect(status).toBeDefined();
      if (!status) {
        throw new Error("expected llm status promise");
      }
      await expect(status).resolves.toMatchObject({ status: "ready" });
    });

    it("cancels an active embeddings download back to notProvisioned and resolves the download promise", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        embeddingsStatus: { state: "notProvisioned" },
        download: {
          kind: "embeddings",
          manualProgress: true,
          progress: [
            { bytesDownloaded: 256, totalBytes: 512 },
            { bytesDownloaded: 512, totalBytes: 512 },
          ],
          terminalEmbeddingsStatus: { state: "ready" },
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      const downloadPromise = localMl.downloadEmbeddingsModel();
      expect(downloadPromise).toBeDefined();
      await Promise.resolve();

      await localMl.cancelEmbeddingsDownload();
      await downloadPromise;

      await expect(localMl.getEmbeddingsStatus()).resolves.toMatchObject({
        state: "notProvisioned",
      });

      // Further advances are no-ops once cancelled; no additional progress events fire.
      const payloads: DownloadProgressEvent[] = [];
      const listenResult = localMl.listen<DownloadProgressEvent>(
        "embeddings://download-progress",
        (event) => {
          payloads.push(event.payload);
        },
      );
      if (!listenResult) {
        throw new Error("expected active listen to return an unlisten promise");
      }
      await listenResult;
      expect(payloads).toEqual([]);
      localMl.advanceDownload();
      await Promise.resolve();
      expect(payloads).toEqual([]);
    });

    it("resolves a superseded download promise instead of orphaning it when a second download starts", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        llmStatus: { status: "notProvisioned", modelPath: "C:/models/llm.gguf" },
        download: {
          kind: "llm",
          manualProgress: true,
          progress: [{ bytesDownloaded: 256, totalBytes: 1024 }],
          terminalLlmStatus: { status: "ready", modelPath: "C:/models/llm.gguf" },
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      const firstDownload = localMl.downloadLlmModel();
      expect(firstDownload).toBeDefined();
      await Promise.resolve();

      const secondDownload = localMl.downloadLlmModel();
      expect(secondDownload).toBeDefined();
      if (!firstDownload) {
        throw new Error("expected first download promise");
      }

      const timeout = new Promise<string>((resolve) => {
        setTimeout(() => resolve("timeout"), 50);
      });
      const outcome = await Promise.race([firstDownload.then(() => "resolved"), timeout]);
      expect(outcome).toBe("resolved");
    });

    it("resolves an in-flight download promise instead of hanging when reset() runs mid-download", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        llmStatus: { status: "notProvisioned", modelPath: "C:/models/llm.gguf" },
        download: {
          kind: "llm",
          manualProgress: true,
          progress: [{ bytesDownloaded: 256, totalBytes: 1024 }],
          terminalLlmStatus: { status: "ready", modelPath: "C:/models/llm.gguf" },
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      const downloadPromise = localMl.downloadLlmModel();
      expect(downloadPromise).toBeDefined();
      if (!downloadPromise) {
        throw new Error("expected download promise");
      }
      await Promise.resolve();

      localMl.reset();

      const timeout = new Promise<string>((resolve) => {
        setTimeout(() => resolve("timeout"), 50);
      });
      const outcome = await Promise.race([downloadPromise.then(() => "resolved"), timeout]);
      expect(outcome).toBe("resolved");
    });

    it("queues the first download progress event until a listener registers after the download starts", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        llmStatus: { status: "notProvisioned", modelPath: "C:/models/llm.gguf" },
        download: {
          kind: "llm",
          manualProgress: true,
          progress: [{ bytesDownloaded: 256, totalBytes: 1024 }],
          terminalLlmStatus: { status: "ready", modelPath: "C:/models/llm.gguf" },
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      // Start the download before any listener is registered, mirroring
      // ChatPanel starting the download in a click handler before its
      // subsequent effect subscribes to progress.
      const downloadPromise = localMl.downloadLlmModel();
      expect(downloadPromise).toBeDefined();

      const payloads: DownloadProgressEvent[] = [];
      const listenResult = localMl.listen<DownloadProgressEvent>(
        "llm://download-progress",
        (event) => {
          payloads.push(event.payload);
        },
      );
      if (!listenResult) {
        throw new Error("expected active listen to return an unlisten promise");
      }
      // The event was retained in the pending queue because no listener was
      // registered when the download started, then flushed asynchronously
      // once `listen()` registered its handler.
      await listenResult;
      expect(payloads).toEqual([{ bytesDownloaded: 256, totalBytes: 1024 }]);
    });
  });

  describe("scripted chat streaming", () => {
    it("streams chat tokens in order and resolves with the scripted done payload", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      const streamId = "stream-magic-missile";
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        chat: {
          tokens: ["Magic ", "Missile"],
          done: {
            fullResponse: "Magic Missile",
            cancelled: false,
            timedOut: false,
            searchTerms: ["magic missile"],
            groundedSpells: [
              {
                id: 42,
                name: "Magic Missile",
                school: "Evocation",
                level: 1,
                descriptionSnippet: "A missile of magical energy.",
              },
            ],
          },
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      const tokens: string[] = [];
      const tokenListen = localMl.listen<{ token: string }>(`llm://token/${streamId}`, (event) => {
        tokens.push(event.payload.token);
      });
      const doneEvents: DoneEvent[] = [];
      const doneListen = localMl.listen<DoneEvent>(`llm://done/${streamId}`, (event) => {
        doneEvents.push(event.payload);
      });
      if (!tokenListen || !doneListen) {
        throw new Error("expected active listen to return unlisten promises");
      }
      await tokenListen;
      await doneListen;

      await localMl.startLlmChat("What is Magic Missile?", streamId, []);

      expect(tokens).toEqual(["Magic ", "Missile"]);
      expect(doneEvents).toHaveLength(1);
      expect(doneEvents[0]).toMatchObject({
        fullResponse: "Magic Missile",
        cancelled: false,
        timedOut: false,
        groundedSpells: [expect.objectContaining({ id: 42, name: "Magic Missile" })],
      });
    });

    it("rejects startLlmChat with the scripted invokeError and emits no token events", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      const streamId = "stream-error";
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        chat: {
          tokens: ["should", "never", "emit"],
          done: {
            fullResponse: "",
            cancelled: false,
            timedOut: false,
            searchTerms: [],
            groundedSpells: [],
          },
          invokeError: "Inference failed: test fault",
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      const tokens: string[] = [];
      const tokenListen = localMl.listen<{ token: string }>(`llm://token/${streamId}`, (event) => {
        tokens.push(event.payload.token);
      });
      if (!tokenListen) {
        throw new Error("expected active listen to return an unlisten promise");
      }
      await tokenListen;

      await expect(localMl.startLlmChat("Hi", streamId, [])).rejects.toThrow(
        "Inference failed: test fault",
      );

      await Promise.resolve();
      expect(tokens).toEqual([]);
    });

    it("cancels generation after the first token and resolves with a cancelled done payload", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      const streamId = "stream-cancel";
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        chat: {
          tokens: ["Magic ", "Missile"],
          pauseAfterToken: 1,
          done: {
            fullResponse: "Magic Missile",
            cancelled: false,
            timedOut: false,
            searchTerms: [],
            groundedSpells: [],
          },
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      const tokens: string[] = [];
      let resolveFirstToken: () => void = () => {};
      const firstToken = new Promise<void>((resolve) => {
        resolveFirstToken = resolve;
      });
      const tokenListen = localMl.listen<{ token: string }>(`llm://token/${streamId}`, (event) => {
        tokens.push(event.payload.token);
        if (tokens.length === 1) {
          resolveFirstToken();
        }
      });
      const doneEvents: DoneEvent[] = [];
      const doneListen = localMl.listen<DoneEvent>(`llm://done/${streamId}`, (event) => {
        doneEvents.push(event.payload);
      });
      if (!tokenListen || !doneListen) {
        throw new Error("expected active listen to return unlisten promises");
      }
      await tokenListen;
      await doneListen;

      const chatPromise = localMl.startLlmChat("What is Magic Missile?", streamId, []);
      expect(chatPromise).toBeDefined();
      if (!chatPromise) {
        throw new Error("expected chat promise");
      }

      await firstToken;
      expect(tokens).toEqual(["Magic "]);

      await localMl.cancelLlmGeneration(streamId);
      await chatPromise;

      expect(tokens).toEqual(["Magic "]);
      expect(doneEvents).toEqual([
        {
          fullResponse: "Magic ",
          cancelled: true,
          timedOut: false,
          searchTerms: [],
          groundedSpells: [],
        },
      ]);
      expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
        kind: "command",
        name: "llm_cancel_generation",
        args: { streamId },
      });
    });

    it("resumes a paused chat stream through advanceChat", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      const streamId = "stream-resume";
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        chat: {
          tokens: ["Magic ", "Missile"],
          pauseAfterToken: 1,
          done: {
            fullResponse: "Magic Missile",
            cancelled: false,
            timedOut: false,
            searchTerms: [],
            groundedSpells: [],
          },
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      const tokens: string[] = [];
      const tokenListen = localMl.listen<{ token: string }>(`llm://token/${streamId}`, (event) => {
        tokens.push(event.payload.token);
      });
      const doneEvents: DoneEvent[] = [];
      const doneListen = localMl.listen<DoneEvent>(`llm://done/${streamId}`, (event) => {
        doneEvents.push(event.payload);
      });
      if (!tokenListen || !doneListen) {
        throw new Error("expected active listen to return unlisten promises");
      }
      await tokenListen;
      await doneListen;

      const chatPromise = localMl.startLlmChat("What is Magic Missile?", streamId, []);
      if (!chatPromise) {
        throw new Error("expected chat promise");
      }

      await Promise.resolve();
      expect(tokens).toEqual(["Magic "]);
      expect(doneEvents).toEqual([]);

      localMl.advanceChat();
      await chatPromise;

      expect(tokens).toEqual(["Magic ", "Missile"]);
      expect(doneEvents).toEqual([
        {
          fullResponse: "Magic Missile",
          cancelled: false,
          timedOut: false,
          searchTerms: [],
          groundedSpells: [],
        },
      ]);
    });

    it("ignores a redundant advanceChat call while a resume is already running, avoiding a duplicate done event", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      const streamId = "stream-reentrant";
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        chat: {
          tokens: ["Magic ", "Missile"],
          pauseAfterToken: 1,
          done: {
            fullResponse: "Magic Missile",
            cancelled: false,
            timedOut: false,
            searchTerms: [],
            groundedSpells: [],
          },
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      const tokens: string[] = [];
      const tokenListen = localMl.listen<{ token: string }>(`llm://token/${streamId}`, (event) => {
        tokens.push(event.payload.token);
      });
      const doneEvents: DoneEvent[] = [];
      const doneListen = localMl.listen<DoneEvent>(`llm://done/${streamId}`, (event) => {
        doneEvents.push(event.payload);
      });
      if (!tokenListen || !doneListen) {
        throw new Error("expected active listen to return unlisten promises");
      }
      await tokenListen;
      await doneListen;

      const chatPromise = localMl.startLlmChat("What is Magic Missile?", streamId, []);
      if (!chatPromise) {
        throw new Error("expected chat promise");
      }
      let resolveCount = 0;
      void chatPromise.then(() => {
        resolveCount += 1;
      });

      await Promise.resolve();
      expect(tokens).toEqual(["Magic "]);
      expect(doneEvents).toEqual([]);

      // Two back-to-back advanceChat calls: the second must be a no-op
      // because a resume loop from the first is already running -- it
      // must not spawn a second concurrent runChatStream loop that would
      // race the original and double-emit the done event / double-resolve.
      localMl.advanceChat();
      localMl.advanceChat();

      await chatPromise;
      await Promise.resolve();

      expect(tokens).toEqual(["Magic ", "Missile"]);
      expect(doneEvents).toHaveLength(1);
      expect(resolveCount).toBe(1);
    });

    it("resolves a superseded chat promise instead of orphaning it when a second startLlmChat call supersedes it", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        chat: {
          tokens: ["Magic ", "Missile"],
          pauseAfterToken: 1,
          done: {
            fullResponse: "Magic Missile",
            cancelled: false,
            timedOut: false,
            searchTerms: [],
            groundedSpells: [],
          },
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      const firstChat = localMl.startLlmChat("Hi", "stream-a", []);
      expect(firstChat).toBeDefined();
      if (!firstChat) {
        throw new Error("expected first chat promise");
      }
      await Promise.resolve();

      const secondChat = localMl.startLlmChat("Hi again", "stream-b", []);
      expect(secondChat).toBeDefined();

      const timeout = new Promise<string>((resolve) => {
        setTimeout(() => resolve("timeout"), 50);
      });
      const outcome = await Promise.race([firstChat.then(() => "resolved"), timeout]);
      expect(outcome).toBe("resolved");

      // secondChat is intentionally left paused (pauseAfterToken) and
      // unawaited here; harness reset() in afterEach tears it down.
      void secondChat;
    });

    it("resolves a paused chat promise instead of orphaning it when a second startLlmChat call hits the invokeError short-circuit", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        chat: {
          tokens: ["Magic ", "Missile"],
          pauseAfterToken: 1,
          done: {
            fullResponse: "Magic Missile",
            cancelled: false,
            timedOut: false,
            searchTerms: [],
            groundedSpells: [],
          },
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      const firstChat = localMl.startLlmChat("Hi", "stream-a", []);
      expect(firstChat).toBeDefined();
      if (!firstChat) {
        throw new Error("expected first chat promise");
      }
      await Promise.resolve();

      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        chat: {
          tokens: ["should", "never", "emit"],
          done: {
            fullResponse: "",
            cancelled: false,
            timedOut: false,
            searchTerms: [],
            groundedSpells: [],
          },
          invokeError: "Inference failed: test fault",
        },
      };

      await expect(localMl.startLlmChat("Hi again", "stream-b", [])).rejects.toThrow(
        "Inference failed: test fault",
      );

      const timeout = new Promise<string>((resolve) => {
        setTimeout(() => resolve("timeout"), 50);
      });
      const outcome = await Promise.race([firstChat.then(() => "resolved"), timeout]);
      expect(outcome).toBe("resolved");
    });

    it("resolves a paused chat promise instead of orphaning it when a second startLlmChat call hits the no-chat short-circuit", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        chat: {
          tokens: ["Magic ", "Missile"],
          pauseAfterToken: 1,
          done: {
            fullResponse: "Magic Missile",
            cancelled: false,
            timedOut: false,
            searchTerms: [],
            groundedSpells: [],
          },
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      const firstChat = localMl.startLlmChat("Hi", "stream-a", []);
      expect(firstChat).toBeDefined();
      if (!firstChat) {
        throw new Error("expected first chat promise");
      }
      await Promise.resolve();

      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        chat: undefined,
      };

      const secondChat = localMl.startLlmChat("Hi again", "stream-b", []);
      expect(secondChat).toBeDefined();
      await secondChat;

      const timeout = new Promise<string>((resolve) => {
        setTimeout(() => resolve("timeout"), 50);
      });
      const outcome = await Promise.race([firstChat.then(() => "resolved"), timeout]);
      expect(outcome).toBe("resolved");
    });

    it("resolves an in-flight chat promise instead of hanging when reset() runs mid-stream", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      const streamId = "stream-reset-mid";
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = {
        ...readyScenario(),
        chat: {
          tokens: ["Magic ", "Missile"],
          pauseAfterToken: 1,
          done: {
            fullResponse: "Magic Missile",
            cancelled: false,
            timedOut: false,
            searchTerms: [],
            groundedSpells: [],
          },
        },
      };
      const localMl = spellbookE2EHarness.localMl;

      const chatPromise = localMl.startLlmChat("Hi", streamId, []);
      expect(chatPromise).toBeDefined();
      if (!chatPromise) {
        throw new Error("expected chat promise");
      }
      await Promise.resolve();

      localMl.reset();

      const timeout = new Promise<string>((resolve) => {
        setTimeout(() => resolve("timeout"), 50);
      });
      const outcome = await Promise.race([chatPromise.then(() => "resolved"), timeout]);
      expect(outcome).toBe("resolved");
    });
  });

  it("records spell picker events and honors configured picker delays through the harness", async () => {
    vi.useFakeTimers();
    window.__IS_PLAYWRIGHT__ = true;
    window.__SPELLBOOK_E2E_SPELL_PICKER_SEARCH_DELAYS__ = { "KNOWN:Fireball": 25 };
    window.__SPELLBOOK_E2E_SPELL_PICKER_SEARCH_EVENTS__ = [];

    spellbookE2EHarness.spellPicker.recordSearchEvent("KNOWN", "Fireball", "start");

    expect(window.__SPELLBOOK_E2E_SPELL_PICKER_SEARCH_EVENTS__).toEqual([
      { listType: "KNOWN", query: "Fireball", phase: "start" },
    ]);

    let settled = false;
    const pending = spellbookE2EHarness.spellPicker
      .waitForSearchDelay("KNOWN", "Fireball")
      .then(() => {
        settled = true;
      });

    await vi.advanceTimersByTimeAsync(24);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toBe(true);
  });
});
