interface SystemMessageProps {
  content: string;
  messageId: string;
}

export function SystemMessage({ content, messageId }: SystemMessageProps) {
  return (
    <div className="flex justify-center" data-testid={`chat-message-${messageId}`}>
      <output
        data-testid="chat-system-message"
        aria-live="polite"
        className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2 max-w-[90%] text-center"
      >
        {content}
      </output>
    </div>
  );
}
