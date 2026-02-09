import { useCallback } from "react";
import type {
  DamagePart,
  SpellDamageSpec,
  DamageType,
  CombineMode,
} from "../../../types/spell";
import {
  defaultDamagePart,
  defaultSpellDamageSpec,
  generateDamagePartId,
} from "../../../types/spell";
import { parseNumericInput } from "../../../lib/validation";

const DAMAGE_KIND_LABELS: Record<SpellDamageSpec["kind"], string> = {
  none: "None",
  modeled: "Modeled",
  dm_adjudicated: "DM Adjudicated",
};

const COMBINE_MODE_LABELS: Record<NonNullable<SpellDamageSpec["combineMode"]>, string> = {
  sum: "Sum",
  max: "Max",
  choose_one: "Choose One",
  sequence: "Sequence",
};

const DAMAGE_TYPE_LABELS: Record<DamageType, string> = {
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

const MR_INTERACTION_LABELS: Record<NonNullable<DamagePart["mrInteraction"]>, string> = {
  normal: "Normal",
  ignores_mr: "Ignores MR",
  special: "Special",
  unknown: "Unknown",
};

interface DamageFormProps {
  value: SpellDamageSpec | null | undefined;
  onChange: (v: SpellDamageSpec) => void;
}

/** Format dice pool for display (e.g. "2d6+3"). */
function formatDicePool(pool: { terms: { count: number; sides: number }[]; flatModifier?: number }): string {
  const terms = pool.terms.map((t) => `${t.count}d${t.sides}`).join("+");
  const mod = pool.flatModifier ?? 0;
  if (mod === 0) return terms;
  return `${terms}+${mod}`;
}

/** Parse "2d6+3" into DicePool. */
function parseDiceFormula(input: string): { terms: { count: number; sides: number }[]; flatModifier: number } {
  const trimmed = input.trim();
  const match = trimmed.match(/^(\d+)d(\d+)(?:\+(\d+))?$/i);
  if (match) {
    const count = Math.max(0, Math.floor(Number.parseInt(match[1], 10)));
    const sides = Math.max(1, Math.floor(Number.parseInt(match[2], 10)));
    const flat = match[3] ? Math.floor(Number.parseInt(match[3], 10)) : 0;
    return {
      terms: count > 0 ? [{ count, sides }] : [],
      flatModifier: flat,
    };
  }
  const num = parseNumericInput(trimmed);
  if (!Number.isNaN(num) && num >= 0) {
    return { terms: [{ count: 1, sides: 1 }], flatModifier: Math.floor(num) };
  }
  return { terms: [{ count: 1, sides: 6 }], flatModifier: 0 };
}

export function DamageForm({ value, onChange }: DamageFormProps) {
  const spec = value ?? defaultSpellDamageSpec();

  const updateSpec = useCallback(
    (updates: Partial<SpellDamageSpec>) => {
      onChange({ ...spec, ...updates });
    },
    [spec, onChange],
  );

  const addPart = useCallback(() => {
    const part = defaultDamagePart();
    part.id = generateDamagePartId();
    const parts = [...(spec.parts ?? []), part];
    updateSpec({ kind: "modeled", parts, combineMode: spec.combineMode ?? "sum" });
  }, [spec, updateSpec]);

  const removePart = useCallback(
    (index: number) => {
      const parts = spec.parts?.filter((_, i) => i !== index) ?? [];
      if (parts.length === 0) {
        updateSpec({ kind: "none", parts: undefined });
      } else {
        updateSpec({ parts });
      }
    },
    [spec, updateSpec],
  );

  const updatePart = useCallback(
    (index: number, updates: Partial<DamagePart>) => {
      const parts = [...(spec.parts ?? [])];
      if (index >= 0 && index < parts.length) {
        parts[index] = { ...parts[index], ...updates };
        updateSpec({ parts });
      }
    },
    [spec, updateSpec],
  );

  return (
    <div className="space-y-3" data-testid="damage-form">
      <div className="flex flex-wrap items-center gap-2">
        <select
          data-testid="damage-form-kind"
          aria-label="Damage kind"
          value={spec.kind}
          onChange={(e) => {
            const kind = e.target.value as SpellDamageSpec["kind"];
            if (kind === "none") {
              onChange({ kind: "none" });
            } else if (kind === "dm_adjudicated") {
              onChange({
                kind: "dm_adjudicated",
                dmGuidance: spec.dmGuidance ?? "",
              });
            } else {
              const parts = spec.parts?.length ? spec.parts : [defaultDamagePart()];
              onChange({
                kind: "modeled",
                combineMode: spec.combineMode ?? "sum",
                parts,
              });
            }
          }}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
        >
          {(Object.entries(DAMAGE_KIND_LABELS) as [SpellDamageSpec["kind"], string][]).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>

        {spec.kind === "modeled" && (
          <>
            <select
              data-testid="damage-form-combine-mode"
              aria-label="Combine mode"
              value={spec.combineMode ?? "sum"}
              onChange={(e) =>
                updateSpec({ combineMode: e.target.value as CombineMode })
              }
              className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
            >
              {(Object.entries(COMBINE_MODE_LABELS) as [CombineMode, string][]).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              data-testid="damage-form-add-part"
              onClick={addPart}
              className="px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 rounded"
            >
              Add part
            </button>
          </>
        )}
      </div>

      {spec.kind === "dm_adjudicated" && (
        <textarea
          data-testid="damage-form-dm-guidance"
          aria-label="DM guidance"
          placeholder="Describe damage for DM adjudication..."
          value={spec.dmGuidance ?? ""}
          onChange={(e) => updateSpec({ dmGuidance: e.target.value || undefined })}
          className="w-full min-h-[60px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
        />
      )}

      {spec.kind === "modeled" &&
        spec.parts?.map((part, idx) => (
          <div
            key={part.id}
            className="flex flex-wrap items-start gap-2 p-2 bg-neutral-900/50 rounded border border-neutral-800"
            data-testid="damage-form-part"
          >
            <select
              data-testid="damage-form-part-type"
              aria-label="Damage type"
              value={part.damageType}
              onChange={(e) =>
                updatePart(idx, { damageType: e.target.value as DamageType })
              }
              className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
            >
              {(Object.entries(DAMAGE_TYPE_LABELS) as [DamageType, string][]).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="text"
              data-testid="damage-form-part-formula"
              aria-label="Dice formula"
              placeholder="e.g. 2d6+3"
              value={formatDicePool(part.base)}
              onChange={(e) => {
                const parsed = parseDiceFormula(e.target.value);
                updatePart(idx, {
                  base: {
                    terms: parsed.terms,
                    flatModifier: parsed.flatModifier,
                  },
                });
              }}
              className="w-20 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm font-mono text-neutral-100"
            />
            <input
              type="text"
              data-testid="damage-form-part-label"
              aria-label="Label"
              placeholder="Label (optional)"
              value={part.label ?? ""}
              onChange={(e) => updatePart(idx, { label: e.target.value || undefined })}
              className="w-32 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
            />
            <select
              data-testid="damage-form-part-mr-interaction"
              aria-label="MR interaction"
              value={part.mrInteraction ?? "normal"}
              onChange={(e) =>
                updatePart(idx, { mrInteraction: e.target.value as DamagePart["mrInteraction"] })
              }
              className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
            >
              {(Object.entries(MR_INTERACTION_LABELS) as [DamagePart["mrInteraction"], string][]).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <div className="flex-1 min-w-[200px] flex flex-col gap-1">
              <textarea
                data-testid="damage-form-part-notes"
                aria-label="Part notes"
                placeholder="Part notes (optional)"
                value={part.notes ?? ""}
                onChange={(e) => updatePart(idx, { notes: e.target.value || undefined })}
                className="w-full min-h-[40px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100"
              />
            </div>
            <button
              type="button"
              data-testid="damage-form-remove-part"
              onClick={() => removePart(idx)}
              className="px-2 py-1 text-xs text-red-400 hover:bg-neutral-800 rounded"
            >
              Remove
            </button>
          </div>
        ))}

      {spec.kind !== "none" && (
        <textarea
          data-testid="damage-form-notes"
          aria-label="Overall damage notes"
          placeholder="Overall damage notes (optional)..."
          value={spec.notes ?? ""}
          onChange={(e) => updateSpec({ notes: e.target.value || undefined })}
          className="w-full min-h-[60px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
        />
      )}
    </div>
  );
}
