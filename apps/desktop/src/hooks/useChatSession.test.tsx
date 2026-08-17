// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startLlmChat } from "../api/llm";
import { formatChatSystemError } from "../ui/components/chat/chatProvisionerErrors";
import { useChatSession } from "./useChatSession";
import { useLlmStream } from "./useLlmStream";

const mockStream = {
  response: "",
  isGenerating: false,
  error: null as string | null,
  grounding: null,
  cancelled: false,
  timedOut: false,
  cancel: vi.fn(),
};

vi.mock("../api/llm", () => ({ startLlmChat: vi.fn() }));
vi.mock("./useLlmStream", () => ({
  useLlmStream: vi.fn(() => mockStream),
}));

describe("useChatSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(startLlmChat).mockResolvedValue(undefined);
    mockStream.response = "";
    mockStream.isGenerating = false;
    mockStream.error = null;
    mockStream.grounding = null;
    mockStream.cancelled = false;
    mockStream.timedOut = false;
    vi.mocked(useLlmStream).mockImplementation(() => mockStream);
  });

  it("captures prior history before adding the new user turn", async () => {
    const { result } = renderHook(() => useChatSession("loaded"));

    act(() => {
      result.current.setDraft("Second question");
    });
    await act(async () => {
      await result.current.send();
    });

    await waitFor(() => expect(startLlmChat).toHaveBeenCalled());
    const [, streamId, history] = vi.mocked(startLlmChat).mock.calls[0];
    expect(streamId).toMatch(/^chat-/);
    expect(history).toEqual([]); // first turn has empty prior history
    expect(result.current.messages.some((m) => m.kind === "user")).toBe(true);
  });

  it("shows a system message when llm_chat invoke fails with RAM error", async () => {
    const ramError = "Insufficient RAM: at least 1.5 GB free required to load the model.";
    vi.mocked(startLlmChat).mockRejectedValue(new Error(ramError));
    const { result } = renderHook(() => useChatSession("ready"));

    act(() => {
      result.current.setDraft("Hello");
    });
    await act(async () => {
      await result.current.send();
    });

    const expected = formatChatSystemError(ramError);
    await waitFor(() => {
      const system = result.current.messages.find((m) => m.kind === "system");
      expect(system?.content).toBe(expected);
    });
    expect(result.current.messages.some((m) => m.kind === "assistant")).toBe(false);
  });

  it("shows a new system message on each retry even when the error text repeats", async () => {
    const repeatedError = "Inference failed: model context error";
    vi.mocked(startLlmChat).mockRejectedValue(new Error(repeatedError));
    const { result } = renderHook(() => useChatSession("loaded"));
    const expected = formatChatSystemError(repeatedError);

    act(() => {
      result.current.setDraft("First question");
    });
    await act(async () => {
      await result.current.send();
    });

    await waitFor(() => {
      const systemMessages = result.current.messages.filter((m) => m.kind === "system");
      expect(systemMessages).toHaveLength(1);
      expect(systemMessages[0]?.content).toBe(expected);
    });

    act(() => {
      result.current.setDraft("Second question, same failure");
    });
    await act(async () => {
      await result.current.send();
    });

    await waitFor(() => {
      const systemMessages = result.current.messages.filter((m) => m.kind === "system");
      // The second failure must surface its own system message rather than being
      // deduped against the first turn's identical error text.
      expect(systemMessages).toHaveLength(2);
      expect(systemMessages[1]?.content).toBe(expected);
    });

    // No orphaned assistant placeholder should be left stuck streaming with empty content.
    expect(
      result.current.messages.some(
        (m) => m.kind === "assistant" && m.isStreaming && m.content === "",
      ),
    ).toBe(false);
  });

  it("keeps assistant when invoke fails after partial content in messages", async () => {
    vi.mocked(useLlmStream).mockImplementation(() => ({
      ...mockStream,
      isGenerating: mockStream.isGenerating,
      error: mockStream.error,
      response: mockStream.response,
    }));

    let rejectChat: (err: Error) => void;
    vi.mocked(startLlmChat).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectChat = reject;
        }),
    );

    const { result, rerender } = renderHook(() => useChatSession("loaded"));

    act(() => {
      result.current.setDraft("Hello");
    });

    mockStream.isGenerating = true;
    mockStream.error = null;
    mockStream.response = "";

    await act(async () => {
      await result.current.send();
    });

    await waitFor(() => expect(startLlmChat).toHaveBeenCalled());

    await act(async () => {
      mockStream.response = "Partial answer";
      rerender();
    });

    await act(async () => {
      rejectChat?.(new Error("Inference failed: model context error"));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      const assistant = result.current.messages.find((m) => m.kind === "assistant");
      expect(assistant?.content).toBe("Partial answer");
    });
    expect(result.current.messages.some((m) => m.kind === "assistant")).toBe(true);
    expect(result.current.messages.some((m) => m.kind === "system")).toBe(false);
  });

  it("finalizes isStreaming to false after invoke fails with partial content once the stream resets", async () => {
    vi.mocked(useLlmStream).mockImplementation(() => ({
      ...mockStream,
      isGenerating: mockStream.isGenerating,
      error: mockStream.error,
      response: mockStream.response,
    }));

    let rejectChat: (err: Error) => void;
    vi.mocked(startLlmChat).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectChat = reject;
        }),
    );

    const { result, rerender } = renderHook(() => useChatSession("loaded"));

    act(() => {
      result.current.setDraft("Hello");
    });

    mockStream.isGenerating = true;
    mockStream.error = null;
    mockStream.response = "";

    await act(async () => {
      await result.current.send();
    });

    await waitFor(() => expect(startLlmChat).toHaveBeenCalled());

    await act(async () => {
      mockStream.response = "Partial answer";
      rerender();
    });

    await act(async () => {
      rejectChat?.(new Error("Inference failed: model context error"));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Bubble is kept with its partial content after the invoke failure.
    await waitFor(() => {
      const assistant = result.current.messages.find((m) => m.kind === "assistant");
      expect(assistant?.content).toBe("Partial answer");
    });

    // Simulate useLlmStream(null)'s reset effect (useLlmStream.ts lines 52-61),
    // which fires once setStreamId(null) takes effect: response/isGenerating
    // reset back to their idle defaults.
    await act(async () => {
      mockStream.isGenerating = false;
      mockStream.response = "";
      mockStream.error = null;
      rerender();
    });

    // The kept bubble must be finalized to isStreaming: false, not stuck
    // pulsing forever because assistantIdRef.current was nulled too early.
    await waitFor(() => {
      const assistant = result.current.messages.find((m) => m.kind === "assistant");
      expect(assistant?.isStreaming).toBe(false);
    });

    const assistant = result.current.messages.find((m) => m.kind === "assistant");
    expect(assistant?.content).toBe("Partial answer");
  });

  it("shows system message and removes assistant when invoke fails with generic inference error", async () => {
    const inferenceError = "Inference failed: model context error";
    vi.mocked(startLlmChat).mockRejectedValue(new Error(inferenceError));
    const { result } = renderHook(() => useChatSession("loaded"));

    act(() => {
      result.current.setDraft("Hello");
    });
    await act(async () => {
      await result.current.send();
    });

    const expected = formatChatSystemError(inferenceError);
    await waitFor(() => {
      const systemMessages = result.current.messages.filter((m) => m.kind === "system");
      expect(systemMessages).toHaveLength(1);
      expect(systemMessages[0]?.content).toBe(expected);
    });
    expect(result.current.messages.some((m) => m.kind === "assistant")).toBe(false);
  });

  it("shows a system message when stream fails without partial response", async () => {
    vi.mocked(useLlmStream).mockImplementation(() => ({
      ...mockStream,
      isGenerating: mockStream.isGenerating,
      error: mockStream.error,
      response: mockStream.response,
    }));

    const { result, rerender } = renderHook(() => useChatSession("loaded"));

    act(() => {
      result.current.setDraft("Hello");
    });

    mockStream.isGenerating = true;
    mockStream.error = null;
    mockStream.response = "";

    await act(async () => {
      await result.current.send();
    });

    await waitFor(() => expect(startLlmChat).toHaveBeenCalled());

    await act(async () => {
      mockStream.isGenerating = false;
      mockStream.error = "Inference failed: model context error";
      mockStream.response = "";
      rerender();
    });

    const expected = formatChatSystemError("Inference failed: model context error");
    await waitFor(() => {
      const systemMessages = result.current.messages.filter((m) => m.kind === "system");
      expect(systemMessages).toHaveLength(1);
      expect(systemMessages[0]?.content).toBe(expected);
    });
    expect(result.current.messages.some((m) => m.kind === "assistant")).toBe(false);
  });

  it("allows a successful retry send after an invoke failure resets generation state", async () => {
    const inferenceError = "Inference failed: model context error";
    vi.mocked(startLlmChat).mockRejectedValueOnce(new Error(inferenceError));
    const { result } = renderHook(() => useChatSession("loaded"));

    act(() => {
      result.current.setDraft("First question");
    });
    await act(async () => {
      await result.current.send();
    });

    const expected = formatChatSystemError(inferenceError);
    await waitFor(() => {
      const system = result.current.messages.find((m) => m.kind === "system");
      expect(system?.content).toBe(expected);
    });

    // Generation/loading state must fully reset after the failure so the
    // input stays usable and a retry isn't blocked by leftover state.
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.isModelLoading).toBe(false);

    // Retry: second send with startLlmChat now succeeding.
    vi.mocked(startLlmChat).mockResolvedValueOnce(undefined);

    act(() => {
      result.current.setDraft("Second question, retried");
    });
    await act(async () => {
      await result.current.send();
    });

    await waitFor(() => expect(startLlmChat).toHaveBeenCalledTimes(2));
    const [secondMessage] = vi.mocked(startLlmChat).mock.calls[1];
    expect(secondMessage).toBe("Second question, retried");

    expect(
      result.current.messages.some(
        (m) => m.kind === "user" && m.content === "Second question, retried",
      ),
    ).toBe(true);
  });

  it("keeps the assistant bubble when stream fails with partial response", async () => {
    vi.mocked(useLlmStream).mockImplementation(() => ({
      ...mockStream,
      isGenerating: mockStream.isGenerating,
      error: mockStream.error,
      response: mockStream.response,
    }));

    const { result, rerender } = renderHook(() => useChatSession("loaded"));

    act(() => {
      result.current.setDraft("Hello");
    });

    mockStream.isGenerating = true;
    mockStream.error = null;
    mockStream.response = "";

    await act(async () => {
      await result.current.send();
    });

    await waitFor(() => expect(startLlmChat).toHaveBeenCalled());

    await act(async () => {
      mockStream.isGenerating = false;
      mockStream.error = "Generation cancelled";
      mockStream.response = "Partial answer";
      rerender();
    });

    await waitFor(() => {
      const assistant = result.current.messages.find((m) => m.kind === "assistant");
      expect(assistant?.content).toBe("Partial answer");
    });
    expect(
      result.current.messages.some((m) => m.kind === "assistant" && m.content === "Partial answer"),
    ).toBe(true);
    expect(result.current.messages.some((m) => m.kind === "system")).toBe(false);
  });

  it("keeps history in memory only and does not persist across remounts or web storage", async () => {
    const unusedStorage = () => ({
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    });
    const localStorageMock = unusedStorage();
    const sessionStorageMock = unusedStorage();
    vi.stubGlobal("localStorage", localStorageMock);
    vi.stubGlobal("sessionStorage", sessionStorageMock);

    const first = renderHook(() => useChatSession("loaded"));
    act(() => {
      first.result.current.setDraft("Remember this turn");
    });
    await act(async () => {
      await first.result.current.send();
    });
    await waitFor(() => expect(startLlmChat).toHaveBeenCalled());
    expect(first.result.current.messages.some((m) => m.kind === "user")).toBe(true);
    first.unmount();

    const second = renderHook(() => useChatSession("loaded"));
    expect(second.result.current.messages).toEqual([]);
    second.unmount();

    expect(localStorageMock.setItem).not.toHaveBeenCalled();
    expect(localStorageMock.getItem).not.toHaveBeenCalled();
    expect(sessionStorageMock.setItem).not.toHaveBeenCalled();
    expect(sessionStorageMock.getItem).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
