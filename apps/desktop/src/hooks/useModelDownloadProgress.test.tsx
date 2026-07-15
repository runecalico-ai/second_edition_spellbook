// apps/desktop/src/hooks/useModelDownloadProgress.test.tsx
// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useModelDownloadProgress } from "./useModelDownloadProgress";

const mockListen = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (e: { payload: unknown }) => void) => mockListen(event, handler),
}));

describe("useModelDownloadProgress", () => {
  let llmHandler: (e: { payload: { bytesDownloaded: number; totalBytes: number } }) => void;
  let embeddingsHandler: (e: {
    payload: { bytesDownloaded: number; totalBytes: number };
  }) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockImplementation(async (event: string, handler: typeof llmHandler) => {
      if (event === "llm://download-progress") llmHandler = handler;
      if (event === "embeddings://download-progress") embeddingsHandler = handler;
      return () => {};
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("tracks llm download progress events", async () => {
    const { result } = renderHook(() => useModelDownloadProgress("llm", true));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      llmHandler({ payload: { bytesDownloaded: 350_000_000, totalBytes: 700_000_000 } });
    });
    expect(result.current.bytesDownloaded).toBe(350_000_000);
    expect(result.current.totalBytes).toBe(700_000_000);
    expect(result.current.fraction).toBeCloseTo(0.5);
  });

  it("tracks embeddings download progress events", async () => {
    const { result } = renderHook(() => useModelDownloadProgress("embeddings", true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockListen).toHaveBeenCalledWith("embeddings://download-progress", expect.any(Function));
    act(() => {
      embeddingsHandler({ payload: { bytesDownloaded: 50_000_000, totalBytes: 100_000_000 } });
    });
    expect(result.current.bytesDownloaded).toBe(50_000_000);
    expect(result.current.totalBytes).toBe(100_000_000);
    expect(result.current.fraction).toBeCloseTo(0.5);
  });

  it("active=false resets to 0 and does not update from events", async () => {
    const { result, rerender } = renderHook(
      ({ active }) => useModelDownloadProgress("llm", active),
      { initialProps: { active: true } },
    );
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      llmHandler({ payload: { bytesDownloaded: 100, totalBytes: 200 } });
    });
    expect(result.current.bytesDownloaded).toBe(100);

    rerender({ active: false });
    expect(result.current.bytesDownloaded).toBe(0);
    expect(result.current.totalBytes).toBe(0);

    act(() => {
      llmHandler({ payload: { bytesDownloaded: 500, totalBytes: 1000 } });
    });
    expect(result.current.bytesDownloaded).toBe(0);
    expect(result.current.totalBytes).toBe(0);
    expect(result.current.fraction).toBe(0);
  });

  it("unmount before listen resolves does not leak", async () => {
    const mockUnlisten = vi.fn();
    let resolveListen!: (unlisten: () => void) => void;
    const listenPromise = new Promise<() => void>((resolve) => {
      resolveListen = resolve;
    });

    mockListen.mockImplementation(() => listenPromise);

    const { unmount } = renderHook(() => useModelDownloadProgress("llm", true));
    unmount();

    await act(async () => {
      resolveListen(mockUnlisten);
      await listenPromise;
    });

    expect(mockUnlisten).toHaveBeenCalledTimes(1);
  });

  it("clamps fraction to 1 when bytesDownloaded exceeds totalBytes", async () => {
    const { result } = renderHook(() => useModelDownloadProgress("llm", true));
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      llmHandler({ payload: { bytesDownloaded: 900, totalBytes: 700 } });
    });
    expect(result.current.fraction).toBe(1);
  });
});
