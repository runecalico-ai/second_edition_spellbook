import { useCallback } from "react";
import type {
  SpellDamageSpec,
  SpellDamageKind,
  CombineMode,
  DamagePart,
  DamageType,
  ApplicationScope,
  ApplicationSpec,
  SaveKind,
  SaveSpec,
  DicePool,
  DiceTerm,
  ScalingKind,
  ScalingDriver,
  ScalingRule,
  ClampSpec,
} from "../../../types/spell";
import {
  defaultDamagePart,
  defaultSpellDamageSpec,
  generateDamagePartId,
} from "../../../types/spell";
import { parseNumericInput, VALIDATION } from "../../../lib/validation";

const DAMAGE_KIND_LABELS: Record<SpellDamageKind, string> = {
  none: "None",
  modeled: "Modeled",
  dm_adjudicated: "DM Adjudicated",
};

const COMBINE_MODE_LABELS: Record<CombineMode, string> = {
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

const SCALING_KIND_LABELS: Record<ScalingKind, string> = {
  add_dice_per_step: "Add Dice per Step",
  add_flat_per_step: "Add Flat per Step",
  set_base_by_level_band: "Set Base by Level Band",
};

const SCALING_DRIVER_LABELS: Record<ScalingDriver, string> = {
  caster_level: "Caster Level",
  spell_level: "Spell Level",
  target_hd: "Target HD",
  target_level: "Target Level",
  choice: "Choice",
  other: "Other",
};

const APPLICATION_SCOPE_LABELS: Record<ApplicationScope, string> = {
  per_target: "Per Target",
  per_area_target: "Per Area Target",
  per_missile: "Per Missile",
  per_ray: "Per Ray",
  per_round: "Per Round",
  per_turn: "Per Turn",
  per_hit: "Per Hit",
  special: "Special",
};

const SAVE_KIND_LABELS: Record<SaveKind, string> = {
  none: "None",
  half: "Half",
  negates: "Negates",
  partial: "Partial",
  special: "Special",
};

interface DamageFormProps {
  value: SpellDamageSpec | null | undefined;
  onChange: (v: SpellDamageSpec) => void;
}

/** Format dice pool for display (e.g. "2d6+3"). */
function formatDicePool(pool: DicePool): string {
  if (!pool.terms || pool.terms.length === 0) return `${pool.flatModifier ?? 0}`;
  const first = pool.terms[0];
  const terms = `${first.count}d${first.sides}`;
  const mod = pool.flatModifier ?? 0;
  if (mod === 0) return terms;
  return `${terms}${mod > 0 ? "+" : ""}${mod}`;
}

/** Parse "2d6+3" into DicePool. */
function parseDiceFormula(input: string): { terms: DiceTerm[]; flatModifier: number } {
  const trimmed = input.trim();
  const match = trimmed.match(/^(\d+)d(\d+)(?:[+-](\d+))?$/i);
  if (match) {
    const count = Math.max(0, Math.floor(Number.parseInt(match[1], 10)));
    const sides = Math.max(1, Math.floor(Number.parseInt(match[2], 10)));
    let flat = match[3] ? Math.floor(Number.parseInt(match[3], 10)) : 0;
    if (trimmed.includes("-") && match[3]) flat = -flat;
    return {
      terms: count > 0 ? [{ count, sides }] : [],
      flatModifier: flat,
    };
  }
  const num = parseNumericInput(trimmed);
  if (!Number.isNaN(num)) {
    return { terms: [], flatModifier: Math.floor(num) };
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
    const existingIds = new Set((spec.parts ?? []).map((p) => p.id));
    let id = generateDamagePartId();
    for (let i = 0; i < 5 && existingIds.has(id); i++) {
      id = generateDamagePartId();
    }
    if (existingIds.has(id)) {
      id = `${id.slice(0, 27)}_${Math.random().toString(36).slice(2, 6)}`.slice(0, 32);
    }
    const part = defaultDamagePart();
    part.id = id;
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
    <div className="space-y-3" data-testid="damage-form" aria-label="Spell damage editor">
      <div className="flex flex-wrap items-center gap-2">
        <select
          data-testid="damage-form-kind"
          aria-label="Damage kind"
          value={spec.kind}
          onChange={(e) => {
            const kind = e.target.value as SpellDamageSpec["kind"];
            if (kind === "none") {
              onChange({ kind: "none", parts: undefined });
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
            className="flex flex-col gap-2 p-2 bg-neutral-900/50 rounded border border-neutral-800"
            data-testid="damage-form-part"
          >
            <div className="flex flex-wrap items-center gap-2">
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
                      ...part.base,
                      terms: parsed.terms,
                      flatModifier: parsed.flatModifier,
                    },
                  });
                }}
                className="w-20 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm font-mono text-neutral-100"
              />
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-neutral-500 uppercase">Per Die:</span>
                <input
                  type="text"
                  inputMode="decimal"
                  data-testid="damage-form-part-per-die-modifier"
                  aria-label="Per die modifier"
                  placeholder="+0"
                  className="w-12 bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-sm text-neutral-100 font-mono"
                  value={part.base.terms?.[0]?.perDieModifier ?? ""}
                  onChange={(e) => {
                    const v = parseNumericInput(e.target.value);
                    const terms = [...(part.base.terms ?? [])];
                    if (terms.length > 0) {
                      terms[0] = { ...terms[0], perDieModifier: Number.isNaN(v) ? undefined : v };
                      updatePart(idx, { base: { ...part.base, terms } });
                    }
                  }}
                />
              </div>
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
              <button
                type="button"
                data-testid="damage-form-remove-part"
                onClick={() => removePart(idx)}
                className="ml-auto px-2 py-1 text-xs text-red-400 hover:bg-neutral-800 rounded"
              >
                Remove
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-2 bg-neutral-800/30 rounded border border-neutral-800/50">
              {/* Application Column */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-neutral-500 w-20">Application:</span>
                  <select
                    data-testid="damage-form-part-application-scope"
                    aria-label="Application scope"
                    value={part.application?.scope ?? "per_target"}
                    onChange={(e) =>
                      updatePart(idx, {
                        application: {
                          ...(part.application ?? { scope: "per_target" }),
                          scope: e.target.value as ApplicationScope,
                        },
                      })
                    }
                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-0.5 text-xs text-neutral-100 outline-none"
                  >
                    {(Object.entries(APPLICATION_SCOPE_LABELS) as [ApplicationScope, string][]).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 ml-20">
                  <input
                    type="number"
                    data-testid="damage-form-part-application-ticks"
                    aria-label="Ticks"
                    placeholder="Ticks"
                    value={part.application?.ticks ?? ""}
                    onChange={(e) => {
                      const v = parseNumericInput(e.target.value);
                      updatePart(idx, {
                        application: {
                          ...(part.application ?? { scope: "per_target" }),
                          ticks: Number.isNaN(v) || v <= 0 ? undefined : v,
                        },
                      });
                    }}
                    className="w-16 bg-neutral-900 border border-neutral-700 rounded px-2 py-0.5 text-xs text-neutral-100 outline-none"
                  />
                  <input
                    type="text"
                    data-testid="damage-form-part-application-tick-driver"
                    aria-label="Tick driver"
                    placeholder="Tick driver (e.g. round)"
                    value={part.application?.tickDriver ?? ""}
                    onChange={(e) =>
                      updatePart(idx, {
                        application: {
                          ...(part.application ?? { scope: "per_target" }),
                          tickDriver: e.target.value || undefined,
                        },
                      })
                    }
                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-0.5 text-xs text-neutral-100 outline-none"
                  />
                </div>
              </div>

              {/* Save/Clamping Column */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-neutral-500 w-12">Save:</span>
                  <select
                    data-testid="damage-form-part-save-kind"
                    aria-label="Save kind"
                    value={part.save?.kind ?? "none"}
                    onChange={(e) =>
                      updatePart(idx, {
                        save: {
                          ...(part.save ?? { kind: "none" }),
                          kind: e.target.value as SaveKind,
                        },
                      })
                    }
                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-0.5 text-xs text-neutral-100 outline-none"
                  >
                    {(Object.entries(SAVE_KIND_LABELS) as [SaveKind, string][]).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-neutral-500 w-12">Clamp:</span>
                  <input
                    type="number"
                    data-testid="damage-form-part-clamp-min"
                    aria-label="Min damage"
                    placeholder="Min"
                    value={part.clampTotal?.minTotal ?? part.clamp_total?.min_total ?? ""}
                    onChange={(e) => {
                      const v = parseNumericInput(e.target.value);
                      updatePart(idx, {
                        clampTotal: { ...part.clampTotal, minTotal: Number.isNaN(v) ? undefined : v },
                      });
                    }}
                    className="w-16 bg-neutral-900 border border-neutral-700 rounded px-2 py-0.5 text-xs text-neutral-100 outline-none"
                  />
                  <input
                    type="number"
                    data-testid="damage-form-part-clamp-max"
                    aria-label="Max damage"
                    placeholder="Max"
                    value={part.clampTotal?.maxTotal ?? part.clamp_total?.max_total ?? ""}
                    onChange={(e) => {
                      const v = parseNumericInput(e.target.value);
                      updatePart(idx, {
                        clampTotal: { ...part.clampTotal, maxTotal: Number.isNaN(v) ? undefined : v },
                      });
                    }}
                    className="w-16 bg-neutral-900 border border-neutral-700 rounded px-2 py-0.5 text-xs text-neutral-100 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Scaling Rules Section */}
            <div className="p-2 bg-neutral-800/20 rounded border border-neutral-800/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-500">Scaling Rules</span>
                <button
                  type="button"
                  data-testid="damage-form-part-add-scaling"
                  onClick={() => {
                    const scaling = [...(part.scaling ?? []), { kind: "add_dice_per_step", driver: "caster_level", step: 1 }];
                    updatePart(idx, { scaling: scaling as ScalingRule[] });
                  }}
                  className="px-2 py-0.5 text-[10px] bg-neutral-700 hover:bg-neutral-600 rounded text-neutral-300"
                >
                  + Add Rule
                </button>
              </div>
              {part.scaling?.map((rule, sIdx) => (
                <div key={sIdx} className="flex flex-wrap items-center gap-2 p-1.5 bg-neutral-900/50 rounded border border-neutral-700/30 text-xs">
                  <select
                    value={rule.kind}
                    onChange={(e) => {
                      const scaling = [...(part.scaling ?? [])];
                      scaling[sIdx] = { ...rule, kind: e.target.value as ScalingKind };
                      updatePart(idx, { scaling });
                    }}
                    className="bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5"
                  >
                    {Object.entries(SCALING_KIND_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                  <select
                    value={rule.driver}
                    onChange={(e) => {
                      const scaling = [...(part.scaling ?? [])];
                      scaling[sIdx] = { ...rule, driver: e.target.value as ScalingDriver };
                      updatePart(idx, { scaling });
                    }}
                    className="bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5"
                  >
                    {Object.entries(SCALING_DRIVER_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>{label}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-neutral-500">Every</span>
                    <input
                      type="number"
                      placeholder="Step"
                      className="w-10 bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5"
                      value={rule.step}
                      onChange={(e) => {
                        const v = parseNumericInput(e.target.value);
                        const scaling = [...(part.scaling ?? [])];
                        scaling[sIdx] = { ...rule, step: Number.isNaN(v) ? 1 : v };
                        updatePart(idx, { scaling });
                      }}
                    />
                  </div>
                  {rule.kind === "add_dice_per_step" && (
                    <input
                      type="text"
                      placeholder="e.g. 1d6"
                      className="w-16 bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 font-mono"
                      value={rule.diceIncrement ? `${rule.diceIncrement.count}d${rule.diceIncrement.sides}` : rule.dice_increment ? `${rule.dice_increment.count}d${rule.dice_increment.sides}` : ""}
                      onChange={(e) => {
                        const m = e.target.value.match(/^(\d+)d(\d+)$/i);
                        if (m) {
                          const scaling = [...(part.scaling ?? [])];
                          scaling[sIdx] = { ...rule, diceIncrement: { count: parseInt(m[1]), sides: parseInt(m[2]) } };
                          updatePart(idx, { scaling });
                        }
                      }}
                    />
                  )}
                  {rule.kind === "add_flat_per_step" && (
                    <input
                      type="number"
                      placeholder="+1"
                      className="w-12 bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5"
                      value={rule.flatIncrement ?? rule.flat_increment ?? ""}
                      onChange={(e) => {
                        const v = parseNumericInput(e.target.value);
                        const scaling = [...(part.scaling ?? [])];
                        scaling[sIdx] = { ...rule, flatIncrement: Number.isNaN(v) ? undefined : v };
                        updatePart(idx, { scaling });
                      }}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const scaling = part.scaling?.filter((_, i) => i !== sIdx);
                      updatePart(idx, { scaling });
                    }}
                    className="text-red-400 hover:text-red-300 ml-auto"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <textarea
              data-testid="damage-form-part-notes"
              aria-label="Part notes"
              placeholder="Part notes (optional)"
              value={part.notes ?? ""}
              onChange={(e) => updatePart(idx, { notes: e.target.value || undefined })}
              className="w-full min-h-[40px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100 outline-none"
            />
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
