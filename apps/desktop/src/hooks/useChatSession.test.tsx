// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startLlmChat } from "../api/llm";
import { useChatSession } from "./useChatSession";

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
    mockStream.response = "";
    mockStream.isGenerating = false;
    mockStream.error = null;
  });

  it("captures prior history before adding the new user turn", async () => {
    vi.mocked(startLlmChat).mockResolvedValue(undefined);
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
    vi.mocked(startLlmChat).mockRejectedValue(
      new Error("Insufficient RAM: at least 1.5 GB free required to load the model. Close other applications and try again."),
    );
    const { result } = renderHook(() => useChatSession("ready"));

    act(() => {
      result.current.setDraft("Hello");
    });
    await act(async () => {
      await result.current.send();
    });

    await waitFor(() => {
      const system = result.current.messages.find((m) => m.kind === "system");
      expect(system?.content).toContain("Close other applications");
    });
    expect(result.current.messages.some((m) => m.kind === "assistant")).toBe(false);
  });

  it("shows a system message when stream fails without partial response", async () => {
    mockStream.error = "Inference failed: model context error";
    mockStream.isGenerating = false;
    mockStream.response = "";
    const { result } = renderHook(() => useChatSession("loaded"));

    act(() => {
      result.current.setDraft("Hello");
    });
    await act(async () => {
      await result.current.send();
    });

    await waitFor(() => {
      expect(result.current.messages.some((m) => m.kind === "system")).toBe(true);
    });
  });
});
