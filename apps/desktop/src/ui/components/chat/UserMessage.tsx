interface UserMessageProps {
  content: string;
  messageId: string;
}

export function UserMessage({ content, messageId }: UserMessageProps) {
  return (
    <div className="flex justify-end" data-testid={`chat-message-${messageId}`}>
      <div
        role="article"
        aria-label="Your message"
        data-testid="chat-user-bubble"
        className="max-w-[85%] rounded-2xl rounded-br-md bg-blue-600 text-white px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm"
      >
        {content}
      </div>
    </div>
  );
}
