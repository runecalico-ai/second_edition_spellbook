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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div
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
          className="text-sm text-neutral-500 animate-pulse"
        >
          Loading model…
        </output>
      ) : null}
      <div ref={bottomRef} />
    </div>
  );
}
