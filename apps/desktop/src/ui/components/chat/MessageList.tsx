import { useEffect, useRef } from "react";
import type { ChatDisplayMessage } from "../../../hooks/chatSessionTypes";
import { AssistantMessage } from "./AssistantMessage";
import { SystemMessage } from "./SystemMessage";
import { UserMessage } from "./UserMessage";

interface MessageListProps {
  messages: ChatDisplayMessage[];
  isModelLoading: boolean;
}

export function MessageList({ messages, isModelLoading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const lastMessage = messages[messages.length - 1];
  const streamingContentLength =
    lastMessage?.kind === "assistant" && lastMessage.isStreaming
      ? lastMessage.content.length
      : 0;

  useEffect(() => {
    const isStreaming =
      lastMessage?.kind === "assistant" && lastMessage.isStreaming;
    bottomRef.current?.scrollIntoView({
      // Instant scroll during token streaming avoids smooth-scroll jank.
      behavior: isStreaming || prefersReducedMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [messages.length, streamingContentLength, isModelLoading, lastMessage, prefersReducedMotion]);

  return (
    <div
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      data-testid="chat-message-list"
      className="flex-1 overflow-y-auto space-y-4 pr-1 min-h-[200px]"
    >
      {messages.map((message) => {
        if (message.kind === "user") {
          return <UserMessage key={message.id} messageId={message.id} content={message.content} />;
        }
        if (message.kind === "system") {
          return <SystemMessage key={message.id} messageId={message.id} content={message.content} />;
        }
        return (
          <AssistantMessage
            key={message.id}
            messageId={message.id}
            content={message.content}
            searchTerms={message.grounding?.searchTerms ?? []}
            groundedSpells={message.groundedSpells}
            isStreaming={message.isStreaming}
          />
        );
      })}
      {isModelLoading ? (
        <output
          data-testid="chat-model-loading-indicator"
          aria-live="polite"
          className="text-sm text-neutral-500 animate-pulse"
        >
          Loading model…
        </output>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}
