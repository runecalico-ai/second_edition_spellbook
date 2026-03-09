import type { RangeSpec } from "../../types/spell";
import { RANGE_DISTANCE_KINDS, RANGE_KIND_ONLY, rangeToText } from "../../types/spell";

function hasStructuredFields(spec: RangeSpec): boolean {
  if (RANGE_KIND_ONLY.includes(spec.kind as (typeof RANGE_KIND_ONLY)[number])) return true;
  if (RANGE_DISTANCE_KINDS.includes(spec.kind as (typeof RANGE_DISTANCE_KINDS)[number]))
    return spec.distance != null && spec.unit != null;
  return false; // "special" with no rawLegacyValue — not synthesizable
}

interface RangeDetailProps {
  spec: RangeSpec | undefined | null;
}

/**
 * Read-only display for RangeSpec.
 *
 * Fallback chain:
 *  1. spec.text           (computed canonical value from canonical_data)
 *  2. spec.rawLegacyValue (original authored string)
 *  3. synthesize from algebraic fields via rangeToText() when spec exists
 *  4. "—" when no spec
 */
export function RangeDetail({ spec }: RangeDetailProps) {
  if (!spec) {
    return (
      <span className="text-neutral-500" data-testid="range-detail-empty">
        —
      </span>
    );
  }

  const displayText =
    spec.text ??
    spec.rawLegacyValue ??
    (hasStructuredFields(spec) ? rangeToText(spec) : null) ??
    "—";

  return (
    <div className="space-y-1" data-testid="range-detail">
      <span className="text-sm text-neutral-100" data-testid="range-detail-text">
        {displayText}
      </span>
      {spec.notes && (
        <p className="text-xs text-neutral-400 italic" data-testid="range-detail-notes">
          {spec.notes}
        </p>
      )}
    </div>
  );
}
