import { useCallback, useEffect, useRef, useState } from "react";
import { startLlmChat } from "../api/llm";
import type { ChatMessage, LlmStatus } from "../types/llm";
import { useLlmStream } from "./useLlmStream";
import { canSendChat, createStreamId } from "../ui/components/chat/chatUtils";
import { formatChatSystemError } from "../ui/components/chat/chatProvisionerErrors";
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

export function useChatSession(llmStatus: LlmStatus) {
  const [messages, setMessages] = useState<ChatDisplayMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streamId, setStreamId] = useState<string | null>(null);
  const [pendingChat, setPendingChat] = useState<PendingChatRequest | null>(null);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const assistantIdRef = useRef<string | null>(null);
  const handledStreamErrorRef = useRef(false);

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
    handledStreamErrorRef.current = false;

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

        if (handledStreamErrorRef.current) {
          assistantIdRef.current = null;
          return;
        }

        const hasPartialResponse = stream.response.trim().length > 0;
        const errorMessage = formatChatSystemError(
          err instanceof Error ? err.message : String(err),
        );

        handledStreamErrorRef.current = true;
        setMessages((prev) => {
          if (prev.some((m) => m.kind === "system" && m.content === errorMessage)) {
            return prev;
          }

          if (hasPartialResponse) {
            return prev.concat({
              id: `system-${Date.now()}`,
              kind: "system",
              content: errorMessage,
            });
          }

          return prev
            .filter((m) => m.id !== pendingChat.assistantId)
            .concat({
              id: `system-${Date.now()}`,
              kind: "system",
              content: errorMessage,
            });
        });
        assistantIdRef.current = null;
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
    if (!stream.isGenerating) {
      setIsModelLoading(false);
    }
  }, [stream.isGenerating]);

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

    if (!stream.isGenerating && stream.error && stream.response.trim().length > 0) {
      return; // partial cancel/timeout — keep assistant bubble
    }

    if (!stream.isGenerating && stream.error && stream.response.trim().length === 0) {
      if (handledStreamErrorRef.current) return;
      handledStreamErrorRef.current = true;
      setIsModelLoading(false);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== assistantId),
        {
          id: `system-${Date.now()}`,
          kind: "system",
          content: formatChatSystemError(stream.error ?? "Unknown error"),
        },
      ]);
      assistantIdRef.current = null;
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
