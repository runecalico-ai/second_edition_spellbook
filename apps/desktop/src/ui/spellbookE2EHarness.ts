import type { EventCallback, UnlistenFn } from "@tauri-apps/api/event";
import { RANGE_DISTANCE_KINDS, type RangeSpec } from "../types/spell";
import type {
  ChatMessage,
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

const localMlEventListeners = new Map<string, Set<EventCallback<unknown>>>();
let nextLocalMlEventId = 1;

/**
 * Dispatch a simulated production event to harness-registered listeners.
 *
 * Payloads are cloned per listener so handlers cannot mutate shared scenario
 * state, and every emission is appended to the observation log. Scenario-driven
 * playback (download/chat/reindex sequencing) layers on top of this in later
 * harness work; this is the raw registry dispatch seam.
 */
export function emitLocalMlEvent(eventName: string, payload: unknown): void {
  recordLocalMlObservation("event", eventName, undefined, structuredClone(payload));

  const bucket = localMlEventListeners.get(eventName);
  if (!bucket) {
    return;
  }

  const eventId = nextLocalMlEventId;
  nextLocalMlEventId += 1;
  for (const handler of [...bucket]) {
    handler({ event: eventName, id: eventId, payload: structuredClone(payload) });
  }
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

    /**
     * Harness-side stand-in for Tauri `listen`. Returns `undefined` when the
     * harness is inactive so callers fall through to the real event system.
     */
    listen<T>(eventName: string, handler: EventCallback<T>): Promise<UnlistenFn> | undefined {
      const scenario = getLocalMlScenario();
      if (!scenario) {
        return undefined;
      }

      const bucket = localMlEventListeners.get(eventName) ?? new Set<EventCallback<unknown>>();
      const registered = handler as EventCallback<unknown>;
      bucket.add(registered);
      localMlEventListeners.set(eventName, bucket);

      let removed = false;
      const unlisten: UnlistenFn = () => {
        if (removed) {
          return;
        }
        removed = true;

        const current = localMlEventListeners.get(eventName);
        if (!current) {
          return;
        }
        current.delete(registered);
        if (current.size === 0) {
          localMlEventListeners.delete(eventName);
        }
      };

      return Promise.resolve(unlisten);
    },

    downloadLlmModel(): Promise<void> | undefined {
      const scenario = getLocalMlScenario();
      if (!scenario) {
        return undefined;
      }

      recordLocalMlObservation("command", "llm_download_model", {});
      return Promise.resolve();
    },

    downloadEmbeddingsModel(): Promise<void> | undefined {
      const scenario = getLocalMlScenario();
      if (!scenario) {
        return undefined;
      }

      recordLocalMlObservation("command", "embeddings_download_model", {});
      return Promise.resolve();
    },

    cancelLlmDownload(): Promise<void> | undefined {
      const scenario = getLocalMlScenario();
      if (!scenario) {
        return undefined;
      }

      recordLocalMlObservation("command", "llm_cancel_download", {});
      return Promise.resolve();
    },

    cancelEmbeddingsDownload(): Promise<void> | undefined {
      const scenario = getLocalMlScenario();
      if (!scenario) {
        return undefined;
      }

      recordLocalMlObservation("command", "embeddings_cancel_download", {});
      return Promise.resolve();
    },

    startLlmChat(
      message: string,
      streamId: string,
      history: ChatMessage[],
    ): Promise<void> | undefined {
      const scenario = getLocalMlScenario();
      if (!scenario) {
        return undefined;
      }

      recordLocalMlObservation("command", "llm_chat", {
        message,
        streamId,
        history: structuredClone(history),
      });

      const invokeError = scenario.chat?.invokeError;
      if (invokeError !== undefined) {
        return Promise.reject(new Error(invokeError));
      }
      return Promise.resolve();
    },

    cancelLlmGeneration(streamId: string): Promise<void> | undefined {
      const scenario = getLocalMlScenario();
      if (!scenario) {
        return undefined;
      }

      recordLocalMlObservation("command", "llm_cancel_generation", { streamId });
      return Promise.resolve();
    },

    searchSpellsSemantic(
      query: string,
      limit?: number,
    ): Promise<SemanticSearchResult[]> | undefined {
      const scenario = getLocalMlScenario();
      if (!scenario) {
        return undefined;
      }

      recordLocalMlObservation(
        "command",
        "search_spells_semantic",
        limit !== undefined ? { query, limit } : { query },
      );
      return Promise.resolve(structuredClone(scenario.semanticResults ?? []));
    },

    reindexEmbeddings(force: boolean): Promise<ReindexResult> | undefined {
      const scenario = getLocalMlScenario();
      if (!scenario) {
        return undefined;
      }

      recordLocalMlObservation("command", "reindex_embeddings", { force });

      const reindex = scenario.reindex;
      if (!reindex) {
        return Promise.reject(
          new Error("Local ML harness: reindex_embeddings is not scripted in this scenario"),
        );
      }
      return Promise.resolve(structuredClone(reindex.result));
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
