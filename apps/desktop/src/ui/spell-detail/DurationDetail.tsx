import type { DurationSpec } from "../../types/spell";
import { durationToText } from "../../types/spell";

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

  const displayText = spec.text ?? spec.rawLegacyValue ?? durationToText(spec);

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
