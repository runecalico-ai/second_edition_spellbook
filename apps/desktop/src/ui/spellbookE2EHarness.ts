import type { EventCallback, UnlistenFn } from "@tauri-apps/api/event";
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
import { RANGE_DISTANCE_KINDS, type RangeSpec } from "../types/spell";

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
const localMlPendingEvents = new Map<string, unknown[]>();
let nextLocalMlEventId = 1;

function deliverToBucket(
  bucket: Set<EventCallback<unknown>>,
  eventName: string,
  payload: unknown,
): void {
  const eventId = nextLocalMlEventId;
  nextLocalMlEventId += 1;
  for (const handler of [...bucket]) {
    handler({ event: eventName, id: eventId, payload: structuredClone(payload) });
  }
}

/**
 * Dispatch a simulated production event to harness-registered listeners.
 *
 * Payloads are cloned per listener so handlers cannot mutate shared scenario
 * state, and every emission is appended to the observation log. When no
 * listener is registered yet for `eventName`, the cloned payload is retained
 * in a pending queue and flushed the moment a matching `listen()` call
 * registers a handler (see `ChatPanel`'s start-then-subscribe ordering).
 */
export function emitLocalMlEvent(eventName: string, payload: unknown): void {
  const cloned = structuredClone(payload);
  recordLocalMlObservation("event", eventName, undefined, cloned);

  const bucket = localMlEventListeners.get(eventName);
  if (!bucket || bucket.size === 0) {
    const queue = localMlPendingEvents.get(eventName) ?? [];
    queue.push(cloned);
    localMlPendingEvents.set(eventName, queue);
    return;
  }

  deliverToBucket(bucket, eventName, cloned);
}

type ModelDownloadStatus = "downloading" | "notProvisioned";

interface ActiveDownloadState {
  kind: ModelKind;
  remainingProgress: DownloadProgressEvent[];
  download: NonNullable<LocalMlE2EScenario["download"]>;
  scenario: LocalMlE2EScenario;
  resolve: () => void;
  cancelled: boolean;
}

interface ActiveChatStreamState {
  streamId: string;
  remainingTokens: string[];
  pauseAfterToken?: number;
  emittedCount: number;
  emittedTokens: string[];
  done: DoneEvent;
  resolve: () => void;
  cancelled: boolean;
  isRunning: boolean;
}

let activeDownload: ActiveDownloadState | null = null;
let activeChatStream: ActiveChatStreamState | null = null;

function downloadProgressEventName(kind: ModelKind): string {
  return kind === "llm" ? "llm://download-progress" : "embeddings://download-progress";
}

function mutateDownloadStatus(
  scenario: LocalMlE2EScenario,
  kind: ModelKind,
  status: ModelDownloadStatus,
): void {
  if (kind === "llm") {
    scenario.llmStatus = { ...scenario.llmStatus, status };
  } else {
    scenario.embeddingsStatus = { ...scenario.embeddingsStatus, state: status };
  }
}

/**
 * Resolve and discard the currently active download, if any, without
 * touching scenario status. Used when a download is superseded by a new
 * start or abandoned by `reset()`, so the original `downloadLlmModel()` /
 * `downloadEmbeddingsModel()` caller's promise never hangs.
 */
function abandonActiveDownload(): void {
  const state = activeDownload;
  if (!state) {
    return;
  }
  state.cancelled = true;
  state.resolve();
  activeDownload = null;
}

/**
 * Resolve and discard the currently active chat stream, if any, emitting a
 * synthetic cancelled-style done event first so listeners observe a
 * terminal state. Used when a chat stream is superseded by a new
 * `startLlmChat()` call or abandoned by `reset()`, so the original caller's
 * promise never hangs.
 */
function abandonActiveChatStream(): void {
  const state = activeChatStream;
  if (!state) {
    return;
  }
  if (!state.cancelled) {
    state.cancelled = true;
    const cancelledDone: DoneEvent = {
      fullResponse: state.emittedTokens.join(""),
      cancelled: true,
      timedOut: false,
      searchTerms: [],
      groundedSpells: [],
    };
    emitLocalMlEvent(chatDoneEventName(state.streamId), cancelledDone);
  }
  state.resolve();
  activeChatStream = null;
}

function applyDownloadTerminal(state: ActiveDownloadState): void {
  if (state.kind === "llm") {
    if (state.download.terminalLlmStatus) {
      state.scenario.llmStatus = structuredClone(state.download.terminalLlmStatus);
    }
  } else if (state.download.terminalEmbeddingsStatus) {
    state.scenario.embeddingsStatus = structuredClone(state.download.terminalEmbeddingsStatus);
  }

  state.resolve();
  if (activeDownload === state) {
    activeDownload = null;
  }
}

async function runAutoDownload(state: ActiveDownloadState): Promise<void> {
  while (state.remainingProgress.length > 0) {
    await Promise.resolve();
    if (state.cancelled || activeDownload !== state) {
      return;
    }
    const next = state.remainingProgress.shift();
    if (next) {
      emitLocalMlEvent(downloadProgressEventName(state.kind), next);
    }
  }

  await Promise.resolve();
  if (state.cancelled || activeDownload !== state) {
    return;
  }
  applyDownloadTerminal(state);
}

function startDownload(scenario: LocalMlE2EScenario, kind: ModelKind): Promise<void> | undefined {
  const download = scenario.download;
  if (!download || download.kind !== kind) {
    return undefined;
  }

  abandonActiveDownload();
  mutateDownloadStatus(scenario, kind, "downloading");

  const remainingProgress = [...download.progress];
  const first = remainingProgress.shift();

  let resolveFn: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve;
  });

  const state: ActiveDownloadState = {
    kind,
    remainingProgress,
    download,
    scenario,
    resolve: resolveFn,
    cancelled: false,
  };
  activeDownload = state;

  if (first) {
    emitLocalMlEvent(downloadProgressEventName(kind), first);
  }

  if (!download.manualProgress) {
    void runAutoDownload(state);
  }

  return promise;
}

function cancelActiveDownload(kind: ModelKind): void {
  const state = activeDownload;
  if (!state || state.kind !== kind || state.cancelled) {
    return;
  }

  state.cancelled = true;
  state.remainingProgress = [];
  localMlPendingEvents.delete(downloadProgressEventName(kind));
  mutateDownloadStatus(state.scenario, kind, "notProvisioned");
  state.resolve();
  if (activeDownload === state) {
    activeDownload = null;
  }
}

function chatTokenEventName(streamId: string): string {
  return `llm://token/${streamId}`;
}

function chatDoneEventName(streamId: string): string {
  return `llm://done/${streamId}`;
}

function finishChatStream(state: ActiveChatStreamState, donePayload: DoneEvent): void {
  emitLocalMlEvent(chatDoneEventName(state.streamId), donePayload);
  state.resolve();
  if (activeChatStream === state) {
    activeChatStream = null;
  }
}

async function runChatStream(state: ActiveChatStreamState): Promise<void> {
  state.isRunning = true;
  try {
    while (state.remainingTokens.length > 0) {
      if (state.pauseAfterToken !== undefined && state.emittedCount >= state.pauseAfterToken) {
        return;
      }

      await Promise.resolve();
      if (state.cancelled || activeChatStream !== state) {
        return;
      }

      const token = state.remainingTokens.shift();
      if (token === undefined) {
        continue;
      }
      state.emittedTokens.push(token);
      state.emittedCount += 1;
      emitLocalMlEvent(chatTokenEventName(state.streamId), { token });
    }

    await Promise.resolve();
    if (state.cancelled || activeChatStream !== state) {
      return;
    }
    finishChatStream(state, state.done);
  } finally {
    state.isRunning = false;
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

      const queued = localMlPendingEvents.get(eventName);
      if (queued && queued.length > 0) {
        localMlPendingEvents.delete(eventName);
        Promise.resolve().then(() => {
          for (const payload of queued) {
            deliverToBucket(bucket, eventName, payload);
          }
        });
      }

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
      return startDownload(scenario, "llm") ?? Promise.resolve();
    },

    downloadEmbeddingsModel(): Promise<void> | undefined {
      const scenario = getLocalMlScenario();
      if (!scenario) {
        return undefined;
      }

      recordLocalMlObservation("command", "embeddings_download_model", {});
      return startDownload(scenario, "embeddings") ?? Promise.resolve();
    },

    cancelLlmDownload(): Promise<void> | undefined {
      const scenario = getLocalMlScenario();
      if (!scenario) {
        return undefined;
      }

      recordLocalMlObservation("command", "llm_cancel_download", {});
      cancelActiveDownload("llm");
      return Promise.resolve();
    },

    cancelEmbeddingsDownload(): Promise<void> | undefined {
      const scenario = getLocalMlScenario();
      if (!scenario) {
        return undefined;
      }

      recordLocalMlObservation("command", "embeddings_cancel_download", {});
      cancelActiveDownload("embeddings");
      return Promise.resolve();
    },

    /**
     * Advance a manually-paused scripted download by exactly one step: emit
     * the next queued progress event, or -- once progress is exhausted --
     * apply the scenario's terminal status and resolve the download command.
     * No-op when no download is active (e.g. `manualProgress` is not set).
     */
    advanceDownload(): void {
      const state = activeDownload;
      if (!state || state.cancelled) {
        return;
      }

      if (state.remainingProgress.length > 0) {
        const next = state.remainingProgress.shift();
        if (next) {
          emitLocalMlEvent(downloadProgressEventName(state.kind), next);
        }
        return;
      }

      applyDownloadTerminal(state);
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

      const chat = scenario.chat;
      if (chat?.invokeError !== undefined) {
        return Promise.reject(new Error(chat.invokeError));
      }
      if (!chat) {
        return Promise.resolve();
      }

      abandonActiveChatStream();

      let resolveFn: () => void = () => {};
      const promise = new Promise<void>((resolve) => {
        resolveFn = resolve;
      });

      const state: ActiveChatStreamState = {
        streamId,
        remainingTokens: [...chat.tokens],
        pauseAfterToken: chat.pauseAfterToken,
        emittedCount: 0,
        emittedTokens: [],
        done: chat.done,
        resolve: resolveFn,
        cancelled: false,
        isRunning: false,
      };
      activeChatStream = state;
      void runChatStream(state);

      return promise;
    },

    /**
     * Resume a scripted chat stream paused by `chat.pauseAfterToken`. No-op
     * when no chat stream is active, it has already terminated, or a
     * `runChatStream` loop is currently executing (e.g. a redundant/early
     * `advanceChat()` call) -- guards against spawning a second concurrent
     * loop that would race the original over `remainingTokens` and could
     * double-emit the terminal done event.
     */
    advanceChat(): void {
      const state = activeChatStream;
      if (!state || state.cancelled || state.isRunning) {
        return;
      }

      state.pauseAfterToken = undefined;
      void runChatStream(state);
    },

    cancelLlmGeneration(streamId: string): Promise<void> | undefined {
      const scenario = getLocalMlScenario();
      if (!scenario) {
        return undefined;
      }

      recordLocalMlObservation("command", "llm_cancel_generation", { streamId });

      const state = activeChatStream;
      if (state && state.streamId === streamId && !state.cancelled) {
        state.cancelled = true;
        const cancelledDone: DoneEvent = {
          fullResponse: state.emittedTokens.join(""),
          cancelled: true,
          timedOut: false,
          searchTerms: [],
          groundedSpells: [],
        };
        finishChatStream(state, cancelledDone);
      }

      return Promise.resolve();
    },

    /**
     * Clear all module-private harness state: pending event queues, listener
     * registries, and any in-flight scripted download/chat stream. Intended
     * for use in test teardown and by the App-mounted command bridge's
     * unmount cleanup (a later task wires the latter).
     *
     * Any in-flight download/chat promise is resolved (not merely dropped)
     * before its state is cleared, so a caller `await`ing
     * `downloadLlmModel()`/`downloadEmbeddingsModel()`/`startLlmChat()` at
     * the moment `reset()` runs does not hang forever.
     */
    reset(): void {
      abandonActiveDownload();
      abandonActiveChatStream();
      localMlEventListeners.clear();
      localMlPendingEvents.clear();
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
