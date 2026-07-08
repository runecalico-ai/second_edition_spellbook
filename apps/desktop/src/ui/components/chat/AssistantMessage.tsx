import type { RagSpellContext } from "../../../types/llm";
import { GroundedInIndicator } from "./GroundedInIndicator";
import { SpellLink } from "./SpellLink";

interface AssistantMessageProps {
  content: string;
  messageId: string;
  groundedSpells: RagSpellContext[];
  searchTerms: string[];
  isStreaming: boolean;
}

function segmentContentWithSpellLinks(content: string, spells: RagSpellContext[]) {
  if (spells.length === 0) return [content];

  const sorted = [...spells].sort((a, b) => b.name.length - a.name.length);
  const pattern = new RegExp(
    `(${sorted.map((s) => s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );

  return content.split(pattern).map((part, index) => {
    const match = sorted.find((s) => s.name.toLowerCase() === part.toLowerCase());
    if (match) {
      return <SpellLink key={`${match.id}-${index}`} id={match.id} name={match.name} />;
    }
    return part;
  });
}

export function AssistantMessage({
  content,
  messageId,
  groundedSpells,
  searchTerms,
  isStreaming,
}: AssistantMessageProps) {
  return (
    <div className="flex justify-start" data-testid={`chat-message-${messageId}`}>
      <div className="max-w-[85%]">
        <div
          data-testid="chat-assistant-bubble"
          className="rounded-2xl rounded-bl-md bg-white/80 dark:bg-neutral-800/80 backdrop-blur-sm border border-neutral-200/60 dark:border-neutral-700/60 px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm"
        >
          {segmentContentWithSpellLinks(content, groundedSpells)}
          {isStreaming ? (
            <span className="inline-block w-2 h-4 ml-0.5 bg-neutral-400 animate-pulse" aria-hidden="true" />
          ) : null}
        </div>
        <GroundedInIndicator
          grounding={{ searchTerms, groundedSpells }}
        />
      </div>
    </div>
  );
}
