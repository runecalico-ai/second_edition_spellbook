import type { DurationSpec } from "../../types/spell";
import { DURATION_CONDITION_KINDS, DURATION_KIND_ONLY, durationToText } from "../../types/spell";

function hasStructuredFields(spec: DurationSpec): boolean {
  // Kind-only kinds are complete by themselves
  if (DURATION_KIND_ONLY.includes(spec.kind as (typeof DURATION_KIND_ONLY)[number])) return true;
  // Use truthy check (!!): empty string "" is falsy and produces empty synthesis, so exclude it
  if (DURATION_CONDITION_KINDS.includes(spec.kind as (typeof DURATION_CONDITION_KINDS)[number]))
    return !!spec.condition;
  if (spec.kind === "time") return spec.duration != null;
  if (spec.kind === "usage_limited") return spec.uses != null;
  return false; // "special" with no rawLegacyValue — not synthesizable
}

interface DurationDetailProps {
  spec: DurationSpec | undefined | null;
}

/**
 * Read-only display for DurationSpec.
 *
 * Fallback chain:
 *  1. spec.text           (computed canonical value from canonical_data)
 *  2. spec.rawLegacyValue (original authored string)
 *  3. synthesize from algebraic fields via durationToText() when spec exists
 *  4. "—" when no spec
 */
export function DurationDetail({ spec }: DurationDetailProps) {
  if (!spec) {
    return (
      <span className="text-neutral-500" data-testid="duration-detail-empty">
        —
      </span>
    );
  }

  const displayText =
    spec.text ??
    spec.rawLegacyValue ??
    (hasStructuredFields(spec) ? durationToText(spec) : null) ??
    "—";

  return (
    <div className="space-y-1" data-testid="duration-detail">
      <span className="text-sm text-neutral-100" data-testid="duration-detail-text">
        {displayText}
      </span>
      {spec.notes && (
        <p className="text-xs text-neutral-400 italic" data-testid="duration-detail-notes">
          {spec.notes}
        </p>
      )}
    </div>
  );
}
