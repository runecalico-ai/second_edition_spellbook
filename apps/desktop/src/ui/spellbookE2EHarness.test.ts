// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RangeSpec } from "../types/spell";
import type { LocalMlE2EScenario } from "./spellbookE2EHarness";
import { spellbookE2EHarness } from "./spellbookE2EHarness";

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
