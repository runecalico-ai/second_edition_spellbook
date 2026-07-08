import { useCallback, useEffect, useRef, useState } from "react";
import { startLlmChat } from "../api/llm";
import type { ChatMessage } from "../types/llm";
import { useLlmStream } from "./useLlmStream";
import { canSendChat, createStreamId } from "../ui/components/chat/chatUtils";
import type { ChatDisplayMessage } from "./chatSessionTypes";

export type {
  UserDisplayMessage,
  AssistantDisplayMessage,
  SystemDisplayMessage,
  ChatDisplayMessage,
} from "./chatSessionTypes";

interface PendingChatRequest {
  message: string;
  history: ChatMessage[];
  assistantId: string;
}

export function useChatSession(llmStatus: string) {
  const [messages, setMessages] = useState<ChatDisplayMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streamId, setStreamId] = useState<string | null>(null);
  const [pendingChat, setPendingChat] = useState<PendingChatRequest | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const assistantIdRef = useRef<string | null>(null);

  const stream = useLlmStream(streamId);

  const toApiHistory = useCallback((): ChatMessage[] => {
    return messages
      .filter((m): m is Extract<ChatDisplayMessage, { kind: "user" | "assistant" }> =>
        m.kind === "user" || m.kind === "assistant",
      )
      .map((m) => ({ role: m.kind, content: m.content }));
  }, [messages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || stream.isGenerating || !canSendChat(llmStatus)) return;

    const priorHistory = toApiHistory();
    const userId = `user-${Date.now()}`;
    const assistantId = `assistant-${Date.now()}`;
    assistantIdRef.current = assistantId;

    setMessages((prev) => [
      ...prev,
      { id: userId, kind: "user", content: text },
      {
        id: assistantId,
        kind: "assistant",
        content: "",
        grounding: null,
        groundedSpells: [],
        isStreaming: true,
        cancelled: false,
        timedOut: false,
      },
    ]);
    setDraft("");

    if (llmStatus === "ready") {
      setIsModelLoading(true);
    }

    const nextStreamId = createStreamId();
    setPendingChat({ message: text, history: priorHistory, assistantId });
    setStreamId(nextStreamId);
  }, [draft, llmStatus, stream.isGenerating, toApiHistory]);

  // Invoke AFTER streamId is set and useLlmStream listeners are subscribed
  useEffect(() => {
    if (!streamId || !pendingChat) return;

    let active = true;

    async function invokeChat() {
      // One microtask tick so useLlmStream's listen() setup runs first
      await Promise.resolve();
      if (!active) return;

      try {
        await startLlmChat(pendingChat.message, streamId, pendingChat.history);
      } catch (err) {
        if (!active) return;
        setIsModelLoading(false);
        setStreamId(null);
        setMessages((prev) =>
          prev
            .filter((m) => m.id !== pendingChat.assistantId)
            .concat({
              id: `system-${Date.now()}`,
              kind: "system",
              content: err instanceof Error ? err.message : String(err),
            }),
        );
      } finally {
        if (active) setPendingChat(null);
      }
    }

    void invokeChat();
    return () => {
      active = false;
    };
  }, [streamId, pendingChat]);

  useEffect(() => {
    if (!stream.isGenerating && stream.response) {
      setIsModelLoading(false);
    }
  }, [stream.isGenerating, stream.response]);

  useEffect(() => {
    const assistantId = assistantIdRef.current;
    if (!assistantId) return;

    setMessages((prev) =>
      prev.map((m) => {
        if (m.kind !== "assistant" || m.id !== assistantId) return m;
        return {
          ...m,
          content: stream.response || m.content,
          grounding: stream.grounding,
          groundedSpells: stream.grounding?.groundedSpells ?? m.groundedSpells,
          isStreaming: stream.isGenerating,
          cancelled: stream.cancelled,
          timedOut: stream.timedOut,
        };
      }),
    );

    if (!stream.isGenerating && stream.error && stream.response) {
      return; // partial cancel/timeout — keep assistant bubble
    }

    if (!stream.isGenerating && stream.error && !stream.response) {
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== assistantId),
        { id: `system-${Date.now()}`, kind: "system", content: stream.error ?? "Unknown error" },
      ]);
    }
  }, [stream.response, stream.isGenerating, stream.grounding, stream.error, stream.cancelled, stream.timedOut]);

  const cancel = useCallback(async () => {
    await stream.cancel();
  }, [stream]);

  return {
    messages,
    draft,
    setDraft,
    send,
    cancel,
    isGenerating: stream.isGenerating,
    isModelLoading,
  };
}
