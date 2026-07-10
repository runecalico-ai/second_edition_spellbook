// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
