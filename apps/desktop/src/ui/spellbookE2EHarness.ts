import { RANGE_DISTANCE_KINDS, type RangeSpec } from "../types/spell";
import type {
  DoneEvent,
  DownloadProgressEvent,
  EmbeddingsStatusResponse,
  LlmStatusResponse,
  ReindexProgressEvent,
  ReindexResult,
  SemanticSearchResult,
} from "../types/llm";

type SpellPickerListType = "KNOWN" | "PREPARED";
type SpellPickerSearchPhase = "start" | "resolve";
type ModelKind = "llm" | "embeddings";

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

function getLocalMlScenario(): LocalMlE2EScenario | undefined {
  if (!isPlaywrightHarnessActive()) {
    return undefined;
  }

  return window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__;
}

function recordLocalMlObservation(
  kind: LocalMlE2EObservation["kind"],
  name: string,
  args?: unknown,
  payload?: unknown,
): void {
  if (!window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__) {
    window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__ = [];
  }
  const observations = window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__;
  observations.push({
    kind,
    name,
    ...(args === undefined ? {} : { args }),
    ...(payload === undefined ? {} : { payload }),
  });
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
  localMl: {
    getLlmStatus(): Promise<LlmStatusResponse> | undefined {
      const scenario = getLocalMlScenario();
      if (!scenario) {
        return undefined;
      }

      recordLocalMlObservation("command", "llm_status", {});
      return Promise.resolve(structuredClone(scenario.llmStatus));
    },

    getEmbeddingsStatus(): Promise<EmbeddingsStatusResponse> | undefined {
      const scenario = getLocalMlScenario();
      if (!scenario) {
        return undefined;
      }

      recordLocalMlObservation("command", "embeddings_status", {});
      return Promise.resolve(structuredClone(scenario.embeddingsStatus));
    },
  },

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

      const ms =
        window.__SPELLBOOK_E2E_SPELL_PICKER_SEARCH_DELAYS__?.[
          buildSpellPickerDelayKey(listType, query)
        ];
      return waitForDelay(ms);
    },
  },
};
