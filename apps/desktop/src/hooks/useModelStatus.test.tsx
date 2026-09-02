// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEmbeddingsStatus, getLlmStatus } from "../api/llm";
import { useModelStatus } from "./useModelStatus";

vi.mock("../api/llm", () => ({
  getLlmStatus: vi.fn(),
  getEmbeddingsStatus: vi.fn(),
}));

const ACTIVE_POLL_MS = 1500;

describe("useModelStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLlmStatus).mockResolvedValue({
      status: "ready",
      modelPath: "/vault/models/tinyllama.gguf",
    });
    vi.mocked(getEmbeddingsStatus).mockResolvedValue({ state: "ready" });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
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

    vi.mocked(getLlmStatus).mockClear();
    vi.mocked(getEmbeddingsStatus).mockClear();
    vi.mocked(getLlmStatus).mockResolvedValueOnce({
      status: "loaded",
      modelPath: "/vault/models/tinyllama.gguf",
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.llm.status).toBe("loaded");
    expect(getLlmStatus).toHaveBeenCalledTimes(1);
    expect(getEmbeddingsStatus).toHaveBeenCalledTimes(1);
  });

  it("sets error when getLlmStatus rejects", async () => {
    vi.mocked(getLlmStatus).mockRejectedValueOnce(new Error("llm failed"));

    const { result } = renderHook(() => useModelStatus());
    await waitFor(() => expect(result.current.error).toBe("llm failed"));
  });

  it("clears error on successful refresh", async () => {
    vi.mocked(getLlmStatus).mockRejectedValueOnce(new Error("llm failed"));

    const { result } = renderHook(() => useModelStatus());
    await waitFor(() => expect(result.current.error).toBe("llm failed"));

    vi.mocked(getLlmStatus).mockResolvedValue({
      status: "ready",
      modelPath: "/vault/models/tinyllama.gguf",
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBeNull();
  });

  it("polls while downloading and stops when ready", async () => {
    vi.useFakeTimers();

    vi.mocked(getLlmStatus).mockResolvedValue({
      status: "downloading",
      modelPath: "",
    });
    vi.mocked(getEmbeddingsStatus).mockResolvedValue({ state: "ready" });

    const { result } = renderHook(() => useModelStatus());

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.llm.status).toBe("downloading");

    const callsAfterActive = vi.mocked(getLlmStatus).mock.calls.length;
    expect(callsAfterActive).toBeGreaterThanOrEqual(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS);
    });

    expect(vi.mocked(getLlmStatus).mock.calls.length).toBeGreaterThan(callsAfterActive);

    vi.mocked(getLlmStatus).mockResolvedValue({
      status: "ready",
      modelPath: "/vault/models/tinyllama.gguf",
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS);
    });

    expect(result.current.llm.status).toBe("ready");

    const callsWhenReady = vi.mocked(getLlmStatus).mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVE_POLL_MS * 2);
    });

    expect(vi.mocked(getLlmStatus).mock.calls.length).toBe(callsWhenReady);
  });

  it("ignores stale refresh responses when a newer refresh is in flight", async () => {
    let resolveFirst: (value: Awaited<ReturnType<typeof getLlmStatus>>) => void = () => {};
    const firstPromise = new Promise<Awaited<ReturnType<typeof getLlmStatus>>>((resolve) => {
      resolveFirst = resolve;
    });

    vi.mocked(getLlmStatus)
      .mockImplementationOnce(() => firstPromise)
      .mockResolvedValue({
        status: "ready",
        modelPath: "/vault/models/tinyllama.gguf",
      });

    const { result } = renderHook(() => useModelStatus());

    await act(async () => {
      const staleRefresh = result.current.refresh();
      const freshRefresh = result.current.refresh();
      resolveFirst({
        status: "downloading",
        modelPath: "",
      });
      await staleRefresh;
      await freshRefresh;
    });

    expect(result.current.llm.status).toBe("ready");
  });
});
