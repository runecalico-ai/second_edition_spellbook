import type { LlmChatGrounding } from "../../../types/llm";

interface GroundedInIndicatorProps {
  grounding: LlmChatGrounding | null;
}

export function GroundedInIndicator({ grounding }: GroundedInIndicatorProps) {
  if (!grounding || grounding.searchTerms.length === 0) return null;

  const terms = grounding.searchTerms.join(", ");
  const spellCount = grounding.groundedSpells.length;

  return (
    <p
      className="text-xs text-neutral-500 dark:text-neutral-400 mt-2"
      data-testid="grounded-in-indicator"
    >
      Grounded in: <span className="italic">{terms}</span>
      {spellCount > 0 ? ` (${spellCount} spell${spellCount === 1 ? "" : "s"})` : null}
    </p>
  );
}
