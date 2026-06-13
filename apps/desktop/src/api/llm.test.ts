import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
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

describe("llm API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoke).mockResolvedValue(undefined);
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
});
