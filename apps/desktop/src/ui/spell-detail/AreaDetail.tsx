import type { AreaSpec } from "../../types/spell";
import { areaToText } from "../../types/spell";

interface AreaDetailProps {
  spec: AreaSpec | undefined | null;
}

/**
 * Read-only display for AreaSpec.
 *
 * Fallback chain:
 *  1. spec.text           (computed canonical value from canonical_data)
 *  2. spec.rawLegacyValue (original authored string)
 *  3. synthesize from algebraic fields via areaToText() when spec exists
 *  4. "—" when no spec
 */
export function AreaDetail({ spec }: AreaDetailProps) {
  if (!spec) {
    return (
      <span className="text-neutral-500" data-testid="area-detail-empty">
        —
      </span>
    );
  }

  const displayText = spec.text ?? spec.rawLegacyValue ?? areaToText(spec);

  return (
    <div className="space-y-1" data-testid="area-detail">
      <span className="text-sm text-neutral-100" data-testid="area-detail-text">
        {displayText}
      </span>
      {spec.notes && (
        <p className="text-xs text-neutral-400 italic" data-testid="area-detail-notes">
          {spec.notes}
        </p>
      )}
    </div>
  );
}
