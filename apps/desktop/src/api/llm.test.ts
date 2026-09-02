// @vitest-environment jsdom
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReindexResult, SemanticSearchResult } from "../types/llm";
import type { LocalMlE2EScenario } from "../ui/spellbookE2EHarness";
import {
  cancelEmbeddingsDownload,
  cancelLlmDownload,
  cancelLlmGeneration,
  downloadEmbeddingsModel,
  downloadLlmModel,
  getEmbeddingsStatus,
  getLlmStatus,
  importEmbeddingsModelFile,
  importLlmModelFile,
  reindexEmbeddings,
  searchSpellsSemantic,
  startLlmChat,
} from "./llm";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

function readyScenario(): LocalMlE2EScenario {
  return {
    llmStatus: { status: "loaded", modelPath: "C:/models/llm.gguf" },
    embeddingsStatus: { state: "ready" },
  };
}

function semanticResult(): SemanticSearchResult {
  return {
    id: 101,
    name: "Fireball",
    school: "Evocation",
    level: 3,
    isQuestSpell: 0,
    isCantrip: 0,
    cosineDistance: 0.12,
  };
}

function reindexResult(): ReindexResult {
  return { total: 10, indexed: 8, skipped: 1, failed: 1 };
}

function activateLocalMlScenario(scenario: LocalMlE2EScenario = readyScenario()) {
  window.__IS_PLAYWRIGHT__ = true;
  window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = scenario;
  return scenario;
}

describe("llm API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue(undefined);
    window.__IS_PLAYWRIGHT__ = undefined;
    window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = undefined;
    window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__ = undefined;
  });

  it("getLlmStatus invokes llm_status with no args", async () => {
    await getLlmStatus();
    expect(invoke).toHaveBeenCalledWith("llm_status");
  });

  it("downloadLlmModel invokes llm_download_model with no args", async () => {
    await downloadLlmModel();
    expect(invoke).toHaveBeenCalledWith("llm_download_model");
  });

  it("importLlmModelFile invokes llm_import_model_file with camelCase filePath", async () => {
    await importLlmModelFile("/path/to/model.gguf");
    expect(invoke).toHaveBeenCalledWith("llm_import_model_file", {
      filePath: "/path/to/model.gguf",
    });
  });

  it("cancelLlmDownload invokes llm_cancel_download with no args", async () => {
    await cancelLlmDownload();
    expect(invoke).toHaveBeenCalledWith("llm_cancel_download");
  });

  it("cancelLlmGeneration invokes llm_cancel_generation with camelCase streamId", async () => {
    await cancelLlmGeneration("stream-42");
    expect(invoke).toHaveBeenCalledWith("llm_cancel_generation", { streamId: "stream-42" });
  });

  it("startLlmChat invokes llm_chat with camelCase message, streamId, and history", async () => {
    const history = [{ role: "user" as const, content: "Hello" }];
    await startLlmChat("What is fireball?", "stream-1", history);
    expect(invoke).toHaveBeenCalledWith("llm_chat", {
      message: "What is fireball?",
      streamId: "stream-1",
      history,
    });
  });

  it("getEmbeddingsStatus invokes embeddings_status with no args", async () => {
    await getEmbeddingsStatus();
    expect(invoke).toHaveBeenCalledWith("embeddings_status");
  });

  it("downloadEmbeddingsModel invokes embeddings_download_model with no args", async () => {
    await downloadEmbeddingsModel();
    expect(invoke).toHaveBeenCalledWith("embeddings_download_model");
  });

  it("importEmbeddingsModelFile invokes embeddings_import_model_file with camelCase filePath", async () => {
    await importEmbeddingsModelFile("/path/to/embeddings.bin");
    expect(invoke).toHaveBeenCalledWith("embeddings_import_model_file", {
      filePath: "/path/to/embeddings.bin",
    });
  });

  it("cancelEmbeddingsDownload invokes embeddings_cancel_download with no args", async () => {
    await cancelEmbeddingsDownload();
    expect(invoke).toHaveBeenCalledWith("embeddings_cancel_download");
  });

  it("searchSpellsSemantic invokes search_spells_semantic with query only when limit omitted", async () => {
    await searchSpellsSemantic("fireball");
    expect(invoke).toHaveBeenCalledWith("search_spells_semantic", { query: "fireball" });
  });

  it("searchSpellsSemantic invokes search_spells_semantic with query and limit when provided", async () => {
    await searchSpellsSemantic("fireball", 5);
    expect(invoke).toHaveBeenCalledWith("search_spells_semantic", { query: "fireball", limit: 5 });
  });

  it("reindexEmbeddings invokes reindex_embeddings with camelCase force", async () => {
    await reindexEmbeddings(true);
    expect(invoke).toHaveBeenCalledWith("reindex_embeddings", { force: true });
  });

  describe("Playwright local ML overrides", () => {
    it("uses the explicit Playwright ML override without invoking Tauri", async () => {
      window.__IS_PLAYWRIGHT__ = true;
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = readyScenario();
      await expect(getLlmStatus()).resolves.toMatchObject({ status: "loaded" });
      expect(invoke).not.toHaveBeenCalled();
    });

    it("getEmbeddingsStatus uses the scenario override without invoking Tauri", async () => {
      activateLocalMlScenario({
        ...readyScenario(),
        embeddingsStatus: { state: "downloading", downloadProgress: 42 },
      });
      await expect(getEmbeddingsStatus()).resolves.toEqual({
        state: "downloading",
        downloadProgress: 42,
      });
      expect(invoke).not.toHaveBeenCalled();
    });

    it("downloadLlmModel resolves via the harness and records the command", async () => {
      activateLocalMlScenario();
      await expect(downloadLlmModel()).resolves.toBeUndefined();
      expect(invoke).not.toHaveBeenCalled();
      expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
        kind: "command",
        name: "llm_download_model",
        args: {},
      });
    });

    it("downloadEmbeddingsModel resolves via the harness and records the command", async () => {
      activateLocalMlScenario();
      await expect(downloadEmbeddingsModel()).resolves.toBeUndefined();
      expect(invoke).not.toHaveBeenCalled();
      expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
        kind: "command",
        name: "embeddings_download_model",
        args: {},
      });
    });

    it("cancelLlmDownload resolves via the harness and records the command", async () => {
      activateLocalMlScenario();
      await expect(cancelLlmDownload()).resolves.toBeUndefined();
      expect(invoke).not.toHaveBeenCalled();
      expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
        kind: "command",
        name: "llm_cancel_download",
        args: {},
      });
    });

    it("cancelEmbeddingsDownload resolves via the harness and records the command", async () => {
      activateLocalMlScenario();
      await expect(cancelEmbeddingsDownload()).resolves.toBeUndefined();
      expect(invoke).not.toHaveBeenCalled();
      expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
        kind: "command",
        name: "embeddings_cancel_download",
        args: {},
      });
    });

    it("startLlmChat resolves via the harness and records camelCase args", async () => {
      activateLocalMlScenario();
      const history = [{ role: "user" as const, content: "Hello" }];
      await expect(startLlmChat("What is fireball?", "stream-1", history)).resolves.toBeUndefined();
      expect(invoke).not.toHaveBeenCalled();
      expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
        kind: "command",
        name: "llm_chat",
        args: { message: "What is fireball?", streamId: "stream-1", history },
      });
    });

    it("startLlmChat preserves a scripted invoke error without falling back to Tauri", async () => {
      activateLocalMlScenario({
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
      });
      await expect(startLlmChat("Hi", "stream-1", [])).rejects.toThrow("model not loaded");
      expect(invoke).not.toHaveBeenCalled();
    });

    it("cancelLlmGeneration resolves via the harness and records camelCase args", async () => {
      activateLocalMlScenario();
      await expect(cancelLlmGeneration("stream-42")).resolves.toBeUndefined();
      expect(invoke).not.toHaveBeenCalled();
      expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
        kind: "command",
        name: "llm_cancel_generation",
        args: { streamId: "stream-42" },
      });
    });

    it("searchSpellsSemantic returns cloned scenario results without invoking Tauri", async () => {
      const scenario = activateLocalMlScenario({
        ...readyScenario(),
        semanticResults: [semanticResult()],
      });
      const results = await searchSpellsSemantic("fireball", 5);
      expect(results).toEqual([semanticResult()]);
      expect(results).not.toBe(scenario.semanticResults);
      expect(invoke).not.toHaveBeenCalled();
      expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
        kind: "command",
        name: "search_spells_semantic",
        args: { query: "fireball", limit: 5 },
      });
    });

    it("reindexEmbeddings returns the scripted result without invoking Tauri", async () => {
      activateLocalMlScenario({
        ...readyScenario(),
        reindex: { progress: [], result: reindexResult() },
      });
      await expect(reindexEmbeddings(true)).resolves.toEqual(reindexResult());
      expect(invoke).not.toHaveBeenCalled();
      expect(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__).toContainEqual({
        kind: "command",
        name: "reindex_embeddings",
        args: { force: true },
      });
    });

    it("reindexEmbeddings rejects when active but unscripted instead of invoking Tauri", async () => {
      activateLocalMlScenario();
      await expect(reindexEmbeddings(false)).rejects.toThrow("not scripted");
      expect(invoke).not.toHaveBeenCalled();
    });

    it("importLlmModelFile still invokes Tauri when a scenario is active", async () => {
      activateLocalMlScenario();
      await importLlmModelFile("/path/to/model.gguf");
      expect(invoke).toHaveBeenCalledWith("llm_import_model_file", {
        filePath: "/path/to/model.gguf",
      });
    });

    it("importEmbeddingsModelFile still invokes Tauri when a scenario is active", async () => {
      activateLocalMlScenario();
      await importEmbeddingsModelFile("/path/to/embeddings.bin");
      expect(invoke).toHaveBeenCalledWith("embeddings_import_model_file", {
        filePath: "/path/to/embeddings.bin",
      });
    });
  });
});
