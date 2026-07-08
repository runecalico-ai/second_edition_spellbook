// apps/desktop/src/hooks/useModelDownloadProgress.test.tsx
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useModelDownloadProgress } from "./useModelDownloadProgress";

const mockListen = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, handler: (e: { payload: unknown }) => void) =>
    mockListen(event, handler),
}));

describe("useModelDownloadProgress", () => {
  let llmHandler: (e: { payload: { bytesDownloaded: number; totalBytes: number } }) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    mockListen.mockImplementation(async (event: string, handler: typeof llmHandler) => {
      if (event === "llm://download-progress") llmHandler = handler;
      return () => {};
    });
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
});
