import type { SpellCastingTime } from "../../types/spell";
import { castingTimeToText } from "../../types/spell";

interface CastingTimeDetailProps {
  spec: SpellCastingTime | undefined | null;
}

/**
 * Read-only display for SpellCastingTime.
 *
 * Fallback chain:
 *  1. spec.text           (computed canonical value from canonical_data)
 *  2. spec.rawLegacyValue (original authored string)
 *  3. synthesize from (baseValue, unit) via castingTimeToText() when spec exists
 *  4. "—" when no spec
 *
 * Note: SpellCastingTime has `text` as a required string field but may be empty;
 * the fallback chain uses truthiness to skip empty strings.
 */
export function CastingTimeDetail({ spec }: CastingTimeDetailProps) {
  if (!spec) {
    return (
      <span className="text-neutral-500" data-testid="casting-time-detail-empty">
        —
      </span>
    );
  }

  const displayText = spec.text || spec.rawLegacyValue || castingTimeToText(spec);

  return (
    <span className="text-sm text-neutral-100" data-testid="casting-time-detail">
      {displayText}
    </span>
  );
}
