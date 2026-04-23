// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RangeSpec } from "../types/spell";
import { spellbookE2EHarness } from "./spellbookE2EHarness";

function resetHarnessWindowState() {
  window.__IS_PLAYWRIGHT__ = undefined;
  window.__SPELLBOOK_E2E_SAVE_INVOKE_DELAY_MS = undefined;
  window.__SPELLBOOK_E2E_SPELL_PICKER_SEARCH_DELAYS__ = undefined;
  window.__SPELLBOOK_E2E_SPELL_PICKER_SEARCH_EVENTS__ = undefined;
  window.__SPELLBOOK_E2E_CORRUPT_RANGE_BASE = undefined;
  window.__SPELLBOOK_E2E_VISUAL_CONTRACT__ = undefined;
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
