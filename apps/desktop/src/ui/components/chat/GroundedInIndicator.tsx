import type { LlmChatGrounding } from "../../../types/llm";

interface GroundedInIndicatorProps {
  grounding: LlmChatGrounding | null;
}

export function GroundedInIndicator({ grounding }: GroundedInIndicatorProps) {
  const terms = grounding?.searchTerms.filter((t) => t.trim().length > 0) ?? [];
  if (terms.length === 0) return null;

  const spellCount = grounding!.groundedSpells.filter((s) => s.name.trim().length > 0).length;

  return (
    <p
      className="text-xs text-neutral-500 dark:text-neutral-400 mt-2"
      data-testid="grounded-in-indicator"
      aria-live="polite"
    >
      Grounded in: <span className="italic">{terms.join(", ")}</span>
      {spellCount > 0 ? ` (${spellCount} spell${spellCount === 1 ? "" : "s"})` : null}
    </p>
  );
}
