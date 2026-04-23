import { RANGE_DISTANCE_KINDS, type RangeSpec } from "../types/spell";

type SpellPickerListType = "KNOWN" | "PREPARED";
type SpellPickerSearchPhase = "start" | "resolve";

const MAX_DELAY_MS = 30_000;

function clampDelayMs(ms: number | undefined): number | null {
  if (typeof ms !== "number" || Number.isNaN(ms) || ms <= 0) {
    return null;
  }

  return Math.min(Math.floor(ms), MAX_DELAY_MS);
}

function isPlaywrightHarnessActive(): boolean {
  return typeof window !== "undefined" && window.__IS_PLAYWRIGHT__ === true;
}

function waitForDelay(ms: number | undefined): Promise<void> {
  const clampedMs = clampDelayMs(ms);
  if (clampedMs === null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, clampedMs));
}

function buildSpellPickerDelayKey(listType: SpellPickerListType, query: string): string {
  return `${listType}:${query}`;
}

export const spellbookE2EHarness = {
  spellEditor: {
    isVisualContractMode(): boolean {
      return (
        typeof window !== "undefined" &&
        window.__SPELLBOOK_E2E_VISUAL_CONTRACT__ === "all-structured"
      );
    },

    applyRangeDistanceCorruption(spec: RangeSpec): RangeSpec {
      if (!isPlaywrightHarnessActive()) {
        return spec;
      }

      const probe = window.__SPELLBOOK_E2E_CORRUPT_RANGE_BASE;
      if (
        !probe ||
        probe.consumed === true ||
        !RANGE_DISTANCE_KINDS.includes(spec.kind as (typeof RANGE_DISTANCE_KINDS)[number])
      ) {
        return spec;
      }

      probe.consumed = true;
      return {
        ...spec,
        distance: {
          mode: "fixed",
          value: probe.value,
        },
      };
    },

    waitForSaveInvokeDelay(): Promise<void> {
      if (!isPlaywrightHarnessActive()) {
        return Promise.resolve();
      }

      return waitForDelay(window.__SPELLBOOK_E2E_SAVE_INVOKE_DELAY_MS);
    },
  },

  spellPicker: {
    recordSearchEvent(
      listType: SpellPickerListType,
      query: string,
      phase: SpellPickerSearchPhase,
    ): void {
      if (!isPlaywrightHarnessActive()) {
        return;
      }

      window.__SPELLBOOK_E2E_SPELL_PICKER_SEARCH_EVENTS__?.push({ listType, query, phase });
    },

    waitForSearchDelay(listType: SpellPickerListType, query: string): Promise<void> {
      if (!isPlaywrightHarnessActive()) {
        return Promise.resolve();
      }

      const ms = window.__SPELLBOOK_E2E_SPELL_PICKER_SEARCH_DELAYS__?.[
        buildSpellPickerDelayKey(listType, query)
      ];
      return waitForDelay(ms);
    },
  },
};