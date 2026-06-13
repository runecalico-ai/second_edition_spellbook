// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelLlmGeneration } from "../api/llm";
import { useLlmStream } from "./useLlmStream";

// Mock Tauri modules
const mockListen = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
  listen: (eventName: string, handler: (e: { payload: unknown }) => void) =>
    mockListen(eventName, handler),
}));

vi.mock("../api/llm", () => ({
  cancelLlmGeneration: vi.fn(),
}));

describe("useLlmStream", () => {
  let tokenHandler: (e: { payload: { token: string } }) => void;
  let doneHandler: (e: { payload: Record<string, unknown> }) => void;
  const mockTokenUnlisten = vi.fn();
  const mockDoneUnlisten = vi.fn();

  async function waitForListenersSetup() {
    await waitFor(() => {
      expect(mockListen).toHaveBeenCalledTimes(2);
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cancelLlmGeneration).mockResolvedValue(undefined);
    mockListen.mockImplementation(async (eventName: string, handler: unknown) => {
      if (eventName.includes("llm://token/")) {
        tokenHandler = handler as typeof tokenHandler;
        return mockTokenUnlisten;
      }
      if (eventName.includes("llm://done/")) {
        doneHandler = handler as typeof doneHandler;
        return mockDoneUnlisten;
      }
      return () => {};
    });
  });

  afterEach(() => {
    cleanup();
    mockTokenUnlisten.mockClear();
    mockDoneUnlisten.mockClear();
  });

  it("returns initial idle state when streamId is null", () => {
    const { result } = renderHook(() => useLlmStream(null));

    expect(result.current.response).toBe("");
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.grounding).toBeNull();
    expect(result.current.cancelled).toBe(false);
    expect(result.current.timedOut).toBe(false);
    expect(mockListen).not.toHaveBeenCalled();
  });

  it("subscribes to token and done events on streamId change", async () => {
    const { result } = renderHook(({ id }) => useLlmStream(id), {
      initialProps: { id: "test-stream" },
    });

    await waitForListenersSetup();

    expect(result.current.isGenerating).toBe(true);
    expect(mockListen).toHaveBeenCalledWith("llm://token/test-stream", expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith("llm://done/test-stream", expect.any(Function));
  });

  it("accumulates tokens as they arrive", async () => {
    const { result } = renderHook(() => useLlmStream("test-stream"));
    await waitForListenersSetup();

    act(() => {
      tokenHandler({ payload: { token: "Hello " } });
    });
    expect(result.current.response).toBe("Hello ");

    act(() => {
      tokenHandler({ payload: { token: "World!" } });
    });
    expect(result.current.response).toBe("Hello World!");
  });

  it("finalizes state and records grounding upon a done event", async () => {
    const { result } = renderHook(() => useLlmStream("test-stream"));
    await waitForListenersSetup();

    act(() => {
      tokenHandler({ payload: { token: "Fireball." } });
    });

    act(() => {
      doneHandler({
        payload: {
          fullResponse: "Final Fireball.",
          cancelled: false,
          searchTerms: ["fireball"],
          groundedSpells: [
            {
              id: 101,
              name: "Fireball",
              school: "Evocation",
              level: 3,
              descriptionSnippet: "A ball of fire explodes.",
            },
          ],
          timedOut: false,
        },
      });
    });

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.response).toBe("Final Fireball.");
    expect(result.current.grounding).toEqual({
      searchTerms: ["fireball"],
      groundedSpells: [
        {
          id: 101,
          name: "Fireball",
          school: "Evocation",
          level: 3,
          descriptionSnippet: "A ball of fire explodes.",
        },
      ],
    });
    expect(result.current.cancelled).toBe(false);
    expect(result.current.timedOut).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("handles cancelled done event correctly", async () => {
    const { result } = renderHook(() => useLlmStream("test-stream"));
    await waitForListenersSetup();

    act(() => {
      doneHandler({
        payload: {
          fullResponse: "Partial response",
          cancelled: true,
          searchTerms: [],
          groundedSpells: [],
          timedOut: false,
        },
      });
    });

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.cancelled).toBe(true);
    expect(result.current.timedOut).toBe(false);
    expect(result.current.error).toBe("Generation cancelled.");
  });

  it("handles timedOut done event correctly", async () => {
    const { result } = renderHook(() => useLlmStream("test-stream"));
    await waitForListenersSetup();

    act(() => {
      doneHandler({
        payload: {
          fullResponse: "Partial response before timeout",
          cancelled: false,
          searchTerms: [],
          groundedSpells: [],
          timedOut: true,
        },
      });
    });

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.cancelled).toBe(false);
    expect(result.current.timedOut).toBe(true);
    expect(result.current.error).toBe("Response timed out.");
  });

  it("calls cancelLlmGeneration and unsubscribes on cleanup", async () => {
    const { unmount, result } = renderHook(() => useLlmStream("test-stream"));
    await waitForListenersSetup();

    await act(async () => {
      await result.current.cancel();
    });

    expect(cancelLlmGeneration).toHaveBeenCalledWith("test-stream");

    unmount();
    expect(mockTokenUnlisten).toHaveBeenCalledTimes(1);
    expect(mockDoneUnlisten).toHaveBeenCalledTimes(1);
  });

  it("sets error and stops generating when listen() rejects", async () => {
    mockListen.mockRejectedValue(new Error("listen failed"));

    const { result } = renderHook(() => useLlmStream("test-stream"));

    await waitFor(() => {
      expect(result.current.error).toBe("listen failed");
      expect(result.current.isGenerating).toBe(false);
    });
  });

  it("resets to idle and unlistens when streamId rerenders to null", async () => {
    const { result, rerender } = renderHook(({ id }) => useLlmStream(id), {
      initialProps: { id: "test-stream" as string | null },
    });

    await waitForListenersSetup();

    act(() => {
      tokenHandler({ payload: { token: "partial" } });
    });
    expect(result.current.response).toBe("partial");

    rerender({ id: null });

    await waitFor(() => {
      expect(result.current.isGenerating).toBe(false);
      expect(result.current.response).toBe("");
      expect(result.current.error).toBeNull();
      expect(result.current.grounding).toBeNull();
      expect(result.current.cancelled).toBe(false);
      expect(result.current.timedOut).toBe(false);
    });

    expect(mockTokenUnlisten).toHaveBeenCalledTimes(1);
    expect(mockDoneUnlisten).toHaveBeenCalledTimes(1);
  });

  it("sets error on cancel rejection while generating, then clears on clean done", async () => {
    vi.mocked(cancelLlmGeneration).mockRejectedValue(new Error("cancel failed"));

    const { result } = renderHook(() => useLlmStream("test-stream"));
    await waitForListenersSetup();

    await act(async () => {
      await result.current.cancel();
    });

    await waitFor(() => {
      expect(result.current.error).toBe("cancel failed");
      expect(result.current.isGenerating).toBe(true);
    });

    act(() => {
      doneHandler({
        payload: {
          fullResponse: "Completed after cancel attempt",
          cancelled: false,
          searchTerms: [],
          groundedSpells: [],
          timedOut: false,
        },
      });
    });

    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("does not set error when cancel rejects after generation finished", async () => {
    vi.mocked(cancelLlmGeneration).mockRejectedValue(new Error("cancel failed"));

    const { result } = renderHook(() => useLlmStream("test-stream"));
    await waitForListenersSetup();

    act(() => {
      doneHandler({
        payload: {
          fullResponse: "Done",
          cancelled: false,
          searchTerms: [],
          groundedSpells: [],
          timedOut: false,
        },
      });
    });

    expect(result.current.isGenerating).toBe(false);

    await act(async () => {
      await result.current.cancel();
    });

    expect(result.current.error).toBeNull();
  });

  it("treats whitespace-only streamId as idle and does not listen", () => {
    const { result } = renderHook(() => useLlmStream("   "));

    expect(result.current.response).toBe("");
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.grounding).toBeNull();
    expect(result.current.cancelled).toBe(false);
    expect(result.current.timedOut).toBe(false);
    expect(mockListen).not.toHaveBeenCalled();
  });

  it("subscribes to trimmed channels for padded streamId", async () => {
    const { result } = renderHook(() => useLlmStream(" test-stream "));

    await waitForListenersSetup();

    expect(result.current.isGenerating).toBe(true);
    expect(mockListen).toHaveBeenCalledWith("llm://token/test-stream", expect.any(Function));
    expect(mockListen).toHaveBeenCalledWith("llm://done/test-stream", expect.any(Function));
  });
});
