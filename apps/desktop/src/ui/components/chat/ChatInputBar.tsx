import { useCallback, type KeyboardEvent } from "react";

interface ChatInputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel: () => void;
  isGenerating: boolean;
  isModelLoading?: boolean;
  disabled: boolean;
}

export function ChatInputBar({
  value,
  onChange,
  onSend,
  onCancel,
  isGenerating,
  isModelLoading = false,
  disabled,
}: ChatInputBarProps) {
  const sendBlocked = disabled || isGenerating || isModelLoading || !value.trim();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        if (event.nativeEvent.isComposing) return;
        event.preventDefault();
        if (!sendBlocked) {
          onSend();
        }
      }
    },
    [onSend, sendBlocked],
  );

  return (
    <div
      data-testid="chat-input-bar"
      className="flex flex-col gap-2 border-t border-neutral-200/60 dark:border-neutral-700/60 pt-3"
    >
      <label htmlFor="chat-input" className="sr-only">
        Chat message
      </label>
      <textarea
        id="chat-input"
        data-testid="chat-input"
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="Ask about spells in your library…"
        className="w-full resize-y rounded-xl border border-neutral-300 dark:border-neutral-600 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-sm px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          data-testid="btn-cancel-chat"
          className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 text-sm disabled:opacity-40"
          onClick={onCancel}
          disabled={!isGenerating}
        >
          Cancel Generation
        </button>
        <button
          type="button"
          data-testid="btn-ask-chat"
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-40"
          onClick={onSend}
          disabled={sendBlocked}
        >
          Send
        </button>
      </div>
    </div>
  );
}
