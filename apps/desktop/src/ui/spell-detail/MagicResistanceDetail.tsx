import type { AppliesTo, MagicResistanceKind, MagicResistanceSpec } from "../../types/spell";

const MR_KIND_LABELS: Record<MagicResistanceKind, string> = {
  unknown: "N/A",
  normal: "Normal",
  ignores_mr: "Ignores MR",
  partial: "Partial",
  special: "Special",
};

const APPLIES_TO_LABELS: Record<AppliesTo, string> = {
  whole_spell: "Whole Spell",
  harmful_effects_only: "Harmful Effects Only",
  beneficial_effects_only: "Beneficial Effects Only",
  dm: "DM Discretion",
};

interface MagicResistanceDetailProps {
  spec: MagicResistanceSpec | undefined | null;
}

/**
 * Read-only display for MagicResistanceSpec.
 *
 * - Displays `kind` and `appliesTo` (where applicable)
 * - Displays `sourceText` when present — primary content when kind = "special"
 * - For kind = "unknown": renders minimal text
 */
export function MagicResistanceDetail({ spec }: MagicResistanceDetailProps) {
  if (!spec) {
    return (
      <span className="text-neutral-500" data-testid="magic-resistance-detail-empty">
        —
      </span>
    );
  }

  const kindLabel = MR_KIND_LABELS[spec.kind] ?? spec.kind.replace(/_/g, " ");
  const showAppliesTo = spec.appliesTo != null && spec.kind !== "unknown";
  const appliesToLabel = spec.appliesTo ? APPLIES_TO_LABELS[spec.appliesTo] : null;

  // For "special" kind, sourceText is the primary descriptive content
  const showSourceTextPrimary = spec.kind === "special" && spec.sourceText;
  // For other kinds, sourceText is supplementary
  const showSourceTextSupplementary = spec.kind !== "special" && spec.sourceText;
  // specialRule is shown for "special" kind whenever present — shown alongside sourceText if both populated,
  // since they represent distinct data (raw imported string vs. curated rule annotation)
  const showSpecialRule = spec.kind === "special" && spec.specialRule != null;

  return (
    <div className="space-y-1" data-testid="magic-resistance-detail">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-neutral-100" data-testid="magic-resistance-kind">
          {kindLabel}
        </span>
        {showAppliesTo && appliesToLabel && (
          <span className="text-neutral-400 text-xs" data-testid="magic-resistance-applies-to">
            ({appliesToLabel})
          </span>
        )}
        {spec.partial?.scope && (
          <span className="text-neutral-400 text-xs" data-testid="magic-resistance-partial-scope">
            — {spec.partial.scope.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {showSourceTextPrimary && (
        <p className="text-sm text-neutral-200" data-testid="magic-resistance-source-text-primary">
          {spec.sourceText}
        </p>
      )}

      {showSourceTextSupplementary && (
        <p
          className="text-xs text-neutral-400"
          data-testid="magic-resistance-source-text-supplementary"
        >
          {spec.sourceText}
        </p>
      )}

      {showSpecialRule && (
        <p className="text-xs text-neutral-400" data-testid="magic-resistance-special-rule">
          {spec.specialRule}
        </p>
      )}

      {spec.notes && (
        <p className="text-xs text-neutral-400 italic" data-testid="magic-resistance-notes">
          {spec.notes}
        </p>
      )}
    </div>
  );
}
