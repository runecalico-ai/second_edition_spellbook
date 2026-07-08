// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmbeddingsStatus, getLlmStatus } from "../api/llm";
import { useModelStatus } from "./useModelStatus";

vi.mock("../api/llm", () => ({
  getLlmStatus: vi.fn(),
  getEmbeddingsStatus: vi.fn(),
}));

describe("useModelStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLlmStatus).mockResolvedValue({
      status: "ready",
      modelPath: "/vault/models/tinyllama.gguf",
    });
    vi.mocked(getEmbeddingsStatus).mockResolvedValue({ state: "ready" });
  });

  it("loads both statuses on mount", async () => {
    const { result } = renderHook(() => useModelStatus());
    await waitFor(() => expect(result.current.llm.status).toBe("ready"));
    expect(result.current.embeddings.state).toBe("ready");
    expect(getLlmStatus).toHaveBeenCalled();
    expect(getEmbeddingsStatus).toHaveBeenCalled();
  });

  it("exposes refresh function", async () => {
    const { result } = renderHook(() => useModelStatus());
    await waitFor(() => expect(result.current.llm.status).toBe("ready"));
    vi.mocked(getLlmStatus).mockResolvedValueOnce({
      status: "loaded",
      modelPath: "/vault/models/tinyllama.gguf",
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.llm.status).toBe("loaded");
  });
});
