// apps/desktop/src/ui/components/chat/ChatHeader.tsx
import type { EmbeddingsStatusResponse, LlmStatusResponse } from "../../../types/llm";
import { ModelStatusBadge } from "./ModelStatusBadge";

interface ChatHeaderProps {
  llm: LlmStatusResponse;
  embeddings: EmbeddingsStatusResponse;
}

export function ChatHeader({ llm, embeddings }: ChatHeaderProps) {
  return (
    <header
      data-testid="chat-header"
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-neutral-200/60 dark:border-neutral-700/60"
    >
      <h1 className="text-xl font-bold tracking-tight">Ask the Spellbook</h1>
      <div className="flex flex-wrap gap-2" data-testid="chat-status-badges">
        <ModelStatusBadge label="LLM" status={llm.status} testId="chat-llm-status-badge" />
        <ModelStatusBadge
          label="Embeddings"
          status={embeddings.state}
          testId="chat-embeddings-status-badge"
        />
      </div>
    </header>
  );
}
