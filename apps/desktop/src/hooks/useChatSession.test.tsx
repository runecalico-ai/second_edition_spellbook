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
});
