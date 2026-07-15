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
      .filter(
        (m): m is Extract<ChatDisplayMessage, { kind: "user" | "assistant" }> =>
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

        const errorMessage = formatChatSystemError(
          err instanceof Error ? err.message : String(err),
        );

        handledStreamErrorRef.current = true;
        // NOTE: setMessages's functional updater is not invoked synchronously —
        // React defers calling it until it actually processes the update, which
        // happens after this line has already run. So the "keep bubble vs.
        // replace with system message" decision is made *inside* the updater,
        // and assistantIdRef is only cleared on the branch that removes the
        // placeholder (the updater is a pure function of `prev`, so if React
        // invokes it more than once — e.g. under StrictMode — every invocation
        // reaches the same branch and the ref ends up in the same state).
        setMessages((prev) => {
          const assistant = prev.find(
            (m) => m.kind === "assistant" && m.id === pendingChat.assistantId,
          );
          if (assistant && assistant.content.trim().length > 0) {
            // Partial invoke failure — keep the assistant bubble and leave
            // assistantIdRef set so the stream-sync effect (triggered by the
            // setStreamId(null) reset above) can still run once more and
            // finalize isStreaming: false on the kept message.
            return prev;
          }

          assistantIdRef.current = null;
          return prev
            .filter((m) => m.id !== pendingChat.assistantId)
            .concat({
              id: `system-${Date.now()}`,
              kind: "system",
              content: errorMessage,
            });
        });
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
      setStreamId(null);
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
  }, [
    stream.response,
    stream.isGenerating,
    stream.grounding,
    stream.error,
    stream.cancelled,
    stream.timedOut,
  ]);

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
