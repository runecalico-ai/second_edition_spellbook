import { useMemo } from "react";
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function segmentContentWithSpellLinks(content: string, spells: RagSpellContext[]) {
  // Drop spells without a usable name so they never widen the alternation regex.
  const named = spells.filter((s) => s.name.trim().length > 0);
  if (named.length === 0) return [content];

  // Longest name first so "Fireball Storm" wins over "Fireball" on overlaps.
  const sorted = [...named].sort((a, b) => b.name.length - a.name.length);

  // Deduplicate by lowercased name; first spell in the sorted list wins.
  const byName = new Map<string, RagSpellContext>();
  for (const spell of sorted) {
    const key = spell.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, spell);
  }

  // Word-boundary lookarounds prevent substring false positives (e.g. "Fireball"
  // inside "Fireballistics"). \w treats letters/digits/underscore as word chars.
  const pattern = new RegExp(
    `((?<![\\w])(?:${sorted.map((s) => escapeRegExp(s.name)).join("|")})(?![\\w]))`,
    "gi",
  );

  return content.split(pattern).map((part, index) => {
    const match = byName.get(part.toLowerCase());
    if (match) {
      return <SpellLink key={`spell-${index}`} id={match.id} name={match.name} />;
    }
    return <span key={`text-${index}`}>{part}</span>;
  });
}

export function AssistantMessage({
  content,
  messageId,
  groundedSpells,
  searchTerms,
  isStreaming,
}: AssistantMessageProps) {
  // Defer link segmentation until the stream completes: segmenting on every token
  // rebuilds the regex and re-splits growing content, and mid-stream text can hold
  // partial spell names. Memoize the finished result so re-renders stay cheap.
  const segments = useMemo(
    () => (isStreaming ? null : segmentContentWithSpellLinks(content, groundedSpells)),
    [content, groundedSpells, isStreaming],
  );

  return (
    <div className="flex justify-start" data-testid={`chat-message-${messageId}`}>
      <div className="max-w-[85%]">
        <div
          data-testid="chat-assistant-bubble"
          className="rounded-2xl rounded-bl-md bg-white/80 dark:bg-neutral-800/80 backdrop-blur-sm border border-neutral-200/60 dark:border-neutral-700/60 px-4 py-2.5 text-sm whitespace-pre-wrap shadow-sm"
        >
          {isStreaming ? content : segments}
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
