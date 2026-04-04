import { useCallback } from "react";
import { VALIDATION, parseNumericInput } from "../../../lib/validation";
import type {
  ApplicationScope,
  ApplicationSpec,
  ClampSpec,
  CombineMode,
  DamagePart,
  DamageType,
  DicePool,
  DiceTerm,
  SaveKind,
  SaveSpec,
  ScalingDriver,
  ScalingKind,
  ScalingRule,
  SpellDamageKind,
  SpellDamageSpec,
} from "../../../types/spell";
import {
  defaultDamagePart,
  defaultSpellDamageSpec,
  generateDamagePartId,
} from "../../../types/spell";

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
  visibleFieldErrors?: DamageFieldError[];
}

interface DamageFieldError {
  testId: string;
  message: string;
  focusTarget: string;
}

const rootSurfaceClass =
  "space-y-3 rounded-xl border border-neutral-300 bg-white p-3 text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

const controlClass =
  "rounded border border-neutral-400 bg-white px-2 py-1 text-sm text-neutral-900 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus-visible:ring-offset-neutral-900";

const nestedSurfaceClass =
  "flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-50/70 p-2 dark:border-neutral-800 dark:bg-neutral-700";

const subPanelClass =
  "grid grid-cols-1 gap-3 rounded border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-800/50 dark:bg-neutral-800/40 md:grid-cols-2";

const scalingSectionClass =
  "space-y-2 rounded border border-neutral-200 bg-neutral-50 p-2 dark:border-neutral-800/50 dark:bg-neutral-800/40";

const scalingRuleClass =
  "flex flex-wrap items-center gap-2 rounded border border-neutral-200 bg-white p-1.5 text-xs dark:border-neutral-700/60 dark:bg-neutral-900/70";

const annotationClass =
  "flex items-center gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] italic text-amber-700 dark:border-amber-900/30 dark:bg-amber-900/10 dark:text-amber-400";

const mutedTextClass = "text-neutral-600 dark:text-neutral-400";

const secondaryButtonClass =
  "rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-xs text-neutral-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 dark:focus-visible:ring-offset-neutral-900";

const destructiveButtonClass =
  "ml-auto rounded px-2 py-1 text-xs text-red-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 hover:bg-neutral-100 dark:text-red-400 dark:hover:bg-neutral-800 dark:focus-visible:ring-offset-neutral-900";

const ghostDestructiveButtonClass =
  "ml-auto text-red-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 dark:focus-visible:ring-offset-neutral-900";

const fieldErrorTextClass = "text-xs text-red-700 dark:text-red-400";

function pickDamageFieldError(
  errors: DamageFieldError[] | undefined,
  focusTarget: string,
): DamageFieldError | null {
  return (
    errors?.find(
      (error) => error.focusTarget === focusTarget || error.testId === `error-${focusTarget}`,
    ) ?? null
  );
}

function getFieldErrorA11yProps(error: DamageFieldError | null) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error?.testId,
  };
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

export function DamageForm({ value, onChange, visibleFieldErrors }: DamageFormProps) {
  const spec = value ?? defaultSpellDamageSpec();
  const damageFieldErrors = (visibleFieldErrors ?? []).filter((error) =>
    error.focusTarget.startsWith("damage-form"),
  );
  const uniqueDamageFieldErrors = Array.from(
    new Map(damageFieldErrors.map((error) => [error.testId, error])).values(),
  );
  const kindError = pickDamageFieldError(damageFieldErrors, "damage-form-kind");
  const combineModeError = pickDamageFieldError(damageFieldErrors, "damage-form-combine-mode");
  const dmGuidanceError = pickDamageFieldError(damageFieldErrors, "damage-form-dm-guidance");
  const notesError = pickDamageFieldError(damageFieldErrors, "damage-form-notes");

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
    <fieldset className={rootSurfaceClass} data-testid="damage-form">
      <legend className="sr-only">Damage</legend>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="damage-form-kind"
          data-testid="damage-form-kind"
          aria-label="Damage kind"
          {...getFieldErrorA11yProps(kindError)}
          value={spec.kind}
          onChange={(e) => {
            const kind = e.target.value as SpellDamageSpec["kind"];
            if (kind === "none") {
              onChange({
                kind: "none",
                parts: undefined,
                sourceText: spec.sourceText,
                notes: spec.notes,
              });
            } else if (kind === "dm_adjudicated") {
              onChange({
                kind: "dm_adjudicated",
                dmGuidance: spec.dmGuidance ?? "",
                sourceText: spec.sourceText,
                notes: spec.notes,
              });
            } else {
              const parts = spec.parts?.length ? spec.parts : [defaultDamagePart()];
              onChange({
                kind: "modeled",
                combineMode: spec.combineMode ?? "sum",
                parts,
                sourceText: spec.sourceText,
                notes: spec.notes,
              });
            }
          }}
          className={controlClass}
        >
          {(Object.entries(DAMAGE_KIND_LABELS) as [SpellDamageSpec["kind"], string][]).map(
            ([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ),
          )}
        </select>

        {spec.kind === "modeled" && (
          <>
            <select
              id="damage-form-combine-mode"
              data-testid="damage-form-combine-mode"
              aria-label="Combine mode"
              {...getFieldErrorA11yProps(combineModeError)}
              value={spec.combineMode ?? "sum"}
              onChange={(e) => updateSpec({ combineMode: e.target.value as CombineMode })}
              className={controlClass}
            >
              {(Object.entries(COMBINE_MODE_LABELS) as [CombineMode, string][]).map(
                ([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ),
              )}
            </select>
            <button
              type="button"
              data-testid="damage-form-add-part"
              onClick={addPart}
              className={secondaryButtonClass}
            >
              Add part
            </button>
          </>
        )}
      </div>

      {spec.sourceText && (
        <div data-testid="damage-source-text-annotation" className={annotationClass}>
          <span className="font-bold uppercase not-italic">Original source text:</span>
          <span>{spec.sourceText}</span>
        </div>
      )}

      {spec.kind === "dm_adjudicated" && (
        <textarea
          id="damage-form-dm-guidance"
          data-testid="damage-form-dm-guidance"
          aria-label="DM guidance"
          {...getFieldErrorA11yProps(dmGuidanceError)}
          placeholder="Describe damage for DM adjudication..."
          value={spec.dmGuidance ?? ""}
          onChange={(e) => updateSpec({ dmGuidance: e.target.value || undefined })}
          className={`w-full min-h-[60px] ${controlClass}`}
        />
      )}

      {spec.kind === "modeled" &&
        spec.parts?.map((part, idx) => {
          const partTypeFieldId = `damage-form-part-${idx}-type`;
          const formulaFieldId = `damage-form-part-${idx}-formula`;
          const perDieModifierFieldId = `damage-form-part-${idx}-per-die-modifier`;
          const labelFieldId = `damage-form-part-${idx}-label`;
          const mrInteractionFieldId = `damage-form-part-${idx}-mr-interaction`;
          const applicationScopeFieldId = `damage-form-part-${idx}-application-scope`;
          const applicationTicksFieldId = `damage-form-part-${idx}-application-ticks`;
          const applicationTickDriverFieldId = `damage-form-part-${idx}-application-tick-driver`;
          const saveKindFieldId = `damage-form-part-${idx}-save-kind`;
          const clampMinFieldId = `damage-form-part-${idx}-clamp-min`;
          const clampMaxFieldId = `damage-form-part-${idx}-clamp-max`;
          const notesFieldId = `damage-form-part-${idx}-notes`;
          const partTypeError = pickDamageFieldError(damageFieldErrors, partTypeFieldId);
          const formulaError = pickDamageFieldError(damageFieldErrors, formulaFieldId);
          const perDieModifierError = pickDamageFieldError(
            damageFieldErrors,
            perDieModifierFieldId,
          );
          const labelError = pickDamageFieldError(damageFieldErrors, labelFieldId);
          const mrInteractionError = pickDamageFieldError(damageFieldErrors, mrInteractionFieldId);
          const applicationScopeError = pickDamageFieldError(
            damageFieldErrors,
            applicationScopeFieldId,
          );
          const applicationTicksError = pickDamageFieldError(
            damageFieldErrors,
            applicationTicksFieldId,
          );
          const applicationTickDriverError = pickDamageFieldError(
            damageFieldErrors,
            applicationTickDriverFieldId,
          );
          const saveKindError = pickDamageFieldError(damageFieldErrors, saveKindFieldId);
          const clampMinError = pickDamageFieldError(damageFieldErrors, clampMinFieldId);
          const clampMaxError = pickDamageFieldError(damageFieldErrors, clampMaxFieldId);
          const partNotesError = pickDamageFieldError(damageFieldErrors, notesFieldId);

          return (
            <div key={part.id} className={nestedSurfaceClass} data-testid="damage-form-part">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  id={partTypeFieldId}
                  data-testid="damage-form-part-type"
                  aria-label={`Damage part ${idx + 1} type`}
                  {...getFieldErrorA11yProps(partTypeError)}
                  value={part.damageType}
                  onChange={(e) => updatePart(idx, { damageType: e.target.value as DamageType })}
                  className={controlClass}
                >
                  {(Object.entries(DAMAGE_TYPE_LABELS) as [DamageType, string][]).map(
                    ([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
                <input
                  id={formulaFieldId}
                  type="text"
                  data-testid="damage-form-part-formula"
                  aria-label={`Damage part ${idx + 1} dice formula`}
                  {...getFieldErrorA11yProps(formulaError)}
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
                  className={`w-20 font-mono ${controlClass}`}
                />
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] uppercase ${mutedTextClass}`}>Per Die:</span>
                  <input
                    id={perDieModifierFieldId}
                    type="text"
                    inputMode="decimal"
                    data-testid="damage-form-part-per-die-modifier"
                    aria-label={`Damage part ${idx + 1} per die modifier`}
                    {...getFieldErrorA11yProps(perDieModifierError)}
                    placeholder="+0"
                    className={`w-12 px-1.5 font-mono ${controlClass}`}
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
                  id={labelFieldId}
                  type="text"
                  data-testid="damage-form-part-label"
                  aria-label={`Damage part ${idx + 1} label`}
                  {...getFieldErrorA11yProps(labelError)}
                  placeholder="Label (optional)"
                  value={part.label ?? ""}
                  onChange={(e) => updatePart(idx, { label: e.target.value || undefined })}
                  className={`w-32 ${controlClass}`}
                />
                <select
                  id={mrInteractionFieldId}
                  data-testid="damage-form-part-mr-interaction"
                  aria-label={`Damage part ${idx + 1} magic resistance interaction`}
                  {...getFieldErrorA11yProps(mrInteractionError)}
                  value={part.mrInteraction ?? "normal"}
                  onChange={(e) =>
                    updatePart(idx, {
                      mrInteraction: e.target.value as DamagePart["mrInteraction"],
                    })
                  }
                  className={controlClass}
                >
                  {(
                    Object.entries(MR_INTERACTION_LABELS) as [DamagePart["mrInteraction"], string][]
                  ).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  data-testid="damage-form-remove-part"
                  onClick={() => removePart(idx)}
                  className={destructiveButtonClass}
                >
                  Remove
                </button>
              </div>

              <div className={subPanelClass}>
                {/* Application Column */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-20 text-[10px] uppercase font-bold ${mutedTextClass}`}>
                      Application:
                    </span>
                    <select
                      id={applicationScopeFieldId}
                      data-testid="damage-form-part-application-scope"
                      aria-label={`Damage part ${idx + 1} application scope`}
                      {...getFieldErrorA11yProps(applicationScopeError)}
                      value={part.application?.scope ?? "per_target"}
                      onChange={(e) =>
                        updatePart(idx, {
                          application: {
                            ...(part.application ?? { scope: "per_target" }),
                            scope: e.target.value as ApplicationScope,
                          },
                        })
                      }
                      className={`flex-1 py-0.5 text-xs outline-none ${controlClass}`}
                    >
                      {(
                        Object.entries(APPLICATION_SCOPE_LABELS) as [ApplicationScope, string][]
                      ).map(([k, label]) => (
                        <option key={k} value={k}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 ml-20">
                    <input
                      id={applicationTicksFieldId}
                      type="number"
                      data-testid="damage-form-part-application-ticks"
                      aria-label={`Damage part ${idx + 1} application ticks`}
                      {...getFieldErrorA11yProps(applicationTicksError)}
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
                      className={`w-16 py-0.5 text-xs outline-none ${controlClass}`}
                    />
                    <input
                      id={applicationTickDriverFieldId}
                      type="text"
                      data-testid="damage-form-part-application-tick-driver"
                      aria-label={`Damage part ${idx + 1} tick driver`}
                      {...getFieldErrorA11yProps(applicationTickDriverError)}
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
                      className={`flex-1 py-0.5 text-xs outline-none ${controlClass}`}
                    />
                  </div>
                </div>

                {/* Save/Clamping Column */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-12 text-[10px] uppercase font-bold ${mutedTextClass}`}>
                      Save:
                    </span>
                    <select
                      id={saveKindFieldId}
                      data-testid="damage-form-part-save-kind"
                      aria-label={`Damage part ${idx + 1} save kind`}
                      {...getFieldErrorA11yProps(saveKindError)}
                      value={part.save?.kind ?? "none"}
                      onChange={(e) =>
                        updatePart(idx, {
                          save: {
                            ...(part.save ?? { kind: "none" }),
                            kind: e.target.value as SaveKind,
                          },
                        })
                      }
                      className={`flex-1 py-0.5 text-xs outline-none ${controlClass}`}
                    >
                      {(Object.entries(SAVE_KIND_LABELS) as [SaveKind, string][]).map(
                        ([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-12 text-[10px] uppercase font-bold ${mutedTextClass}`}>
                      Clamp:
                    </span>
                    <input
                      id={clampMinFieldId}
                      type="number"
                      data-testid="damage-form-part-clamp-min"
                      aria-label={`Damage part ${idx + 1} minimum damage clamp`}
                      {...getFieldErrorA11yProps(clampMinError)}
                      placeholder="Min"
                      value={part.clampTotal?.minTotal ?? part.clamp_total?.min_total ?? ""}
                      onChange={(e) => {
                        const v = parseNumericInput(e.target.value);
                        updatePart(idx, {
                          clampTotal: {
                            ...part.clampTotal,
                            minTotal: Number.isNaN(v) ? undefined : v,
                          },
                        });
                      }}
                      className={`w-16 py-0.5 text-xs outline-none ${controlClass}`}
                    />
                    <input
                      id={clampMaxFieldId}
                      type="number"
                      data-testid="damage-form-part-clamp-max"
                      aria-label={`Damage part ${idx + 1} maximum damage clamp`}
                      {...getFieldErrorA11yProps(clampMaxError)}
                      placeholder="Max"
                      value={part.clampTotal?.maxTotal ?? part.clamp_total?.max_total ?? ""}
                      onChange={(e) => {
                        const v = parseNumericInput(e.target.value);
                        updatePart(idx, {
                          clampTotal: {
                            ...part.clampTotal,
                            maxTotal: Number.isNaN(v) ? undefined : v,
                          },
                        });
                      }}
                      className={`w-16 py-0.5 text-xs outline-none ${controlClass}`}
                    />
                  </div>
                </div>
              </div>

              {/* Scaling Rules Section */}
              <div className={scalingSectionClass}>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] uppercase font-bold ${mutedTextClass}`}>
                    Scaling Rules
                  </span>
                  <button
                    type="button"
                    data-testid="damage-form-part-add-scaling"
                    onClick={() => {
                      const scaling = [
                        ...(part.scaling ?? []),
                        { kind: "add_dice_per_step", driver: "caster_level", step: 1 },
                      ];
                      updatePart(idx, { scaling: scaling as ScalingRule[] });
                    }}
                    className="rounded border border-neutral-300 bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 dark:focus-visible:ring-offset-neutral-900"
                  >
                    + Add Rule
                  </button>
                </div>
                {part.scaling?.map((rule, sIdx) => {
                  const scalingKindFieldId = `damage-form-part-${idx}-scaling-${sIdx}-kind`;
                  const scalingDriverFieldId = `damage-form-part-${idx}-scaling-${sIdx}-driver`;
                  const scalingStepFieldId = `damage-form-part-${idx}-scaling-${sIdx}-step`;
                  const scalingDiceIncrementFieldId = `damage-form-part-${idx}-scaling-${sIdx}-dice-increment`;
                  const scalingFlatIncrementFieldId = `damage-form-part-${idx}-scaling-${sIdx}-flat-increment`;
                  const scalingKindError = pickDamageFieldError(
                    damageFieldErrors,
                    scalingKindFieldId,
                  );
                  const scalingDriverError = pickDamageFieldError(
                    damageFieldErrors,
                    scalingDriverFieldId,
                  );
                  const scalingStepError = pickDamageFieldError(
                    damageFieldErrors,
                    scalingStepFieldId,
                  );
                  const scalingDiceIncrementError = pickDamageFieldError(
                    damageFieldErrors,
                    scalingDiceIncrementFieldId,
                  );
                  const scalingFlatIncrementError = pickDamageFieldError(
                    damageFieldErrors,
                    scalingFlatIncrementFieldId,
                  );

                  return (
                    <div
                      key={`${idx}-${sIdx}-${rule.kind}-${rule.driver}-${rule.step}`}
                      className={scalingRuleClass}
                      data-testid="damage-form-part-scaling-rule"
                    >
                      <select
                        id={scalingKindFieldId}
                        data-testid="damage-form-part-scaling-kind"
                        aria-label={`Damage part ${idx + 1} scaling rule ${sIdx + 1} kind`}
                        {...getFieldErrorA11yProps(scalingKindError)}
                        value={rule.kind}
                        onChange={(e) => {
                          const scaling = [...(part.scaling ?? [])];
                          scaling[sIdx] = { ...rule, kind: e.target.value as ScalingKind };
                          updatePart(idx, { scaling });
                        }}
                        className={`px-1 py-0.5 text-xs ${controlClass}`}
                      >
                        {Object.entries(SCALING_KIND_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <select
                        id={scalingDriverFieldId}
                        data-testid="damage-form-part-scaling-driver"
                        aria-label={`Damage part ${idx + 1} scaling rule ${sIdx + 1} driver`}
                        {...getFieldErrorA11yProps(scalingDriverError)}
                        value={rule.driver}
                        onChange={(e) => {
                          const scaling = [...(part.scaling ?? [])];
                          scaling[sIdx] = { ...rule, driver: e.target.value as ScalingDriver };
                          updatePart(idx, { scaling });
                        }}
                        className={`px-1 py-0.5 text-xs ${controlClass}`}
                      >
                        {Object.entries(SCALING_DRIVER_LABELS).map(([k, label]) => (
                          <option key={k} value={k}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] ${mutedTextClass}`}>Every</span>
                        <input
                          id={scalingStepFieldId}
                          type="number"
                          data-testid="damage-form-part-scaling-step"
                          aria-label={`Damage part ${idx + 1} scaling rule ${sIdx + 1} step`}
                          {...getFieldErrorA11yProps(scalingStepError)}
                          placeholder="Step"
                          className={`w-10 px-1 py-0.5 text-xs ${controlClass}`}
                          value={rule.step}
                          onChange={(e) => {
                            const v = parseNumericInput(e.target.value);
                            const scaling = [...(part.scaling ?? [])];
                            scaling[sIdx] = { ...rule, step: Number.isNaN(v) ? 1 : Math.max(1, v) };
                            updatePart(idx, { scaling });
                          }}
                        />
                      </div>
                      {rule.kind === "add_dice_per_step" && (
                        <input
                          id={scalingDiceIncrementFieldId}
                          type="text"
                          data-testid="damage-form-part-scaling-dice-increment"
                          aria-label={`Damage part ${idx + 1} scaling rule ${sIdx + 1} dice increment`}
                          {...getFieldErrorA11yProps(scalingDiceIncrementError)}
                          placeholder="e.g. 1d6"
                          className={`w-16 px-1 py-0.5 text-xs font-mono ${controlClass}`}
                          value={
                            rule.diceIncrement
                              ? `${rule.diceIncrement.count}d${rule.diceIncrement.sides}`
                              : rule.dice_increment
                                ? `${rule.dice_increment.count}d${rule.dice_increment.sides}`
                                : ""
                          }
                          onChange={(e) => {
                            const m = e.target.value.match(/^(\d+)d(\d+)$/i);
                            if (m) {
                              const scaling = [...(part.scaling ?? [])];
                              scaling[sIdx] = {
                                ...rule,
                                diceIncrement: {
                                  count: Number.parseInt(m[1], 10),
                                  sides: Number.parseInt(m[2], 10),
                                },
                              };
                              updatePart(idx, { scaling });
                            }
                          }}
                        />
                      )}
                      {rule.kind === "add_flat_per_step" && (
                        <input
                          id={scalingFlatIncrementFieldId}
                          type="number"
                          data-testid="damage-form-part-scaling-flat-increment"
                          aria-label={`Damage part ${idx + 1} scaling rule ${sIdx + 1} flat increment`}
                          {...getFieldErrorA11yProps(scalingFlatIncrementError)}
                          placeholder="+1"
                          className={`w-12 px-1 py-0.5 text-xs ${controlClass}`}
                          value={rule.flatIncrement ?? rule.flat_increment ?? ""}
                          onChange={(e) => {
                            const v = parseNumericInput(e.target.value);
                            const scaling = [...(part.scaling ?? [])];
                            scaling[sIdx] = {
                              ...rule,
                              flatIncrement: Number.isNaN(v) ? undefined : v,
                            };
                            updatePart(idx, { scaling });
                          }}
                        />
                      )}
                      <button
                        type="button"
                        data-testid="damage-form-part-remove-scaling"
                        aria-label={`Remove damage part ${idx + 1} scaling rule ${sIdx + 1}`}
                        onClick={() => {
                          const scaling = part.scaling?.filter((_, i) => i !== sIdx);
                          updatePart(idx, { scaling });
                        }}
                        className={ghostDestructiveButtonClass}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>

              <textarea
                id={notesFieldId}
                data-testid="damage-form-part-notes"
                aria-label={`Damage part ${idx + 1} notes`}
                {...getFieldErrorA11yProps(partNotesError)}
                placeholder="Part notes (optional)"
                value={part.notes ?? ""}
                onChange={(e) => updatePart(idx, { notes: e.target.value || undefined })}
                className={`w-full min-h-[40px] text-xs outline-none ${controlClass}`}
              />
            </div>
          );
        })}

      {uniqueDamageFieldErrors.length > 0 && (
        <div aria-live="polite" className="space-y-1" data-testid="damage-form-field-errors">
          {uniqueDamageFieldErrors.map((error) => (
            <p
              key={error.testId}
              id={error.testId}
              data-testid={error.testId}
              className={fieldErrorTextClass}
            >
              {error.message}
            </p>
          ))}
        </div>
      )}

      {spec.kind !== "none" && (
        <textarea
          id="damage-form-notes"
          data-testid="damage-form-notes"
          aria-label="Overall damage notes"
          {...getFieldErrorA11yProps(notesError)}
          placeholder="Overall damage notes (optional)..."
          value={spec.notes ?? ""}
          onChange={(e) => updateSpec({ notes: e.target.value || undefined })}
          className={`w-full min-h-[60px] ${controlClass}`}
        />
      )}
    </fieldset>
  );
}
