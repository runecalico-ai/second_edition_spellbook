import type { DamagePart, DicePool, SpellDamageSpec } from "../../types/spell";
import { formatDicePool } from "../../types/spell";

const DAMAGE_TYPE_LABELS: Record<string, string> = {
  acid: "Acid",
  cold: "Cold",
  electricity: "Electricity",
  fire: "Fire",
  sonic: "Sonic",
  force: "Force",
  magic: "Magic",
  negative_energy: "Negative Energy",
  positive_energy: "Positive Energy",
  poison: "Poison",
  psychic: "Psychic",
  physical_bludgeoning: "Bludgeoning",
  physical_piercing: "Piercing",
  physical_slashing: "Slashing",
  untyped: "Untyped",
  special: "Special",
};

function hasAlgebraicParts(parts: DamagePart[] | undefined): boolean {
  return !!(parts && parts.length > 0);
}

function isDicePoolNonEmpty(pool: DicePool): boolean {
  return pool.terms.length > 0;
}

interface DamagePartRowProps {
  part: DamagePart;
  index: number;
}

function DamagePartRow({ part, index }: DamagePartRowProps) {
  const formula = isDicePoolNonEmpty(part.base) ? formatDicePool(part.base) : null;
  const dmgType = DAMAGE_TYPE_LABELS[part.damageType] ?? part.damageType.replace(/_/g, " ");
  const saveInfo =
    part.save?.kind && part.save.kind !== "none"
      ? ` (${part.save.kind.replace(/_/g, " ")} save)`
      : "";
  const label = part.label ? ` — ${part.label}` : "";

  return (
    <div className="flex flex-wrap items-center gap-1 text-sm" data-testid={`damage-part-${index}`}>
      {formula && (
        <span className="font-mono text-amber-300" data-testid={`damage-formula-${index}`}>
          {formula}
        </span>
      )}
      <span className="text-neutral-300" data-testid={`damage-type-${index}`}>
        {dmgType}
      </span>
      {saveInfo && (
        <span className="text-neutral-500 text-xs" data-testid={`damage-save-${index}`}>
          {saveInfo}
        </span>
      )}
      {label && (
        <span className="text-neutral-500 text-xs" data-testid={`damage-label-${index}`}>
          {label}
        </span>
      )}
    </div>
  );
}

interface DamageDetailProps {
  spec: SpellDamageSpec | undefined | null;
}

/**
 * Read-only display for SpellDamageSpec.
 *
 * - "none": renders nothing
 * - "modeled" with parts: display structured formula from algebraic fields
 * - "dm_adjudicated" or missing parts: fall back to sourceText
 * - Always falls back to sourceText when algebraic fields are absent or empty
 */
export function DamageDetail({ spec }: DamageDetailProps) {
  if (!spec || spec.kind === "none") return null;

  const showAlgebraic = spec.kind === "modeled" && hasAlgebraicParts(spec.parts);

  if (showAlgebraic && spec.parts) {
    return (
      <div className="space-y-1" data-testid="damage-detail">
        {spec.parts.map((part, i) => (
          <DamagePartRow key={part.id ?? i} part={part} index={i} />
        ))}
        {spec.notes && (
          <p className="text-xs text-neutral-400 italic" data-testid="damage-notes">
            {spec.notes}
          </p>
        )}
      </div>
    );
  }

  // Fallback: sourceText (v2 field) preferred; dmGuidance (v1 backward-compat for dm_adjudicated)
  const fallbackText = spec.sourceText ?? spec.dmGuidance;
  if (!fallbackText && !spec.notes) return null;

  return (
    <div className="space-y-1" data-testid="damage-detail">
      {fallbackText && (
        <p className="text-sm text-neutral-200" data-testid="damage-source-text">
          {fallbackText}
        </p>
      )}
      {spec.notes && (
        <p className="text-xs text-neutral-400 italic" data-testid="damage-notes">
          {spec.notes}
        </p>
      )}
    </div>
  );
}
