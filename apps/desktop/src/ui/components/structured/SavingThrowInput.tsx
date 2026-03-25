import { parseNumericInput } from "../../../lib/validation";
import type {
  SaveOutcome,
  SaveOutcomeEffect,
  SaveType,
  SavingThrowKind,
  SavingThrowSpec,
  SingleSave,
} from "../../../types/spell";
import { defaultSavingThrowSpec } from "../../../types/spell";

const SAVING_THROW_KIND_LABELS: Record<SavingThrowKind, string> = {
  none: "None",
  single: "Single",
  multiple: "Multiple",
  dm_adjudicated: "DM Adjudicated",
};

const SAVE_TYPE_LABELS: Record<SaveType, string> = {
  paralyzation_poison_death: "Paralyzation/Poison/Death",
  rod_staff_wand: "Rod/Staff/Wand",
  petrification_polymorph: "Petrification/Polymorph",
  breath_weapon: "Breath Weapon",
  spell: "Spell",
  special: "Special",
};

const SAVE_OUTCOME_LABELS: Record<SaveOutcome, string> = {
  no_effect: "No effect",
  reduced_effect: "Reduced effect",
  full_effect: "Full effect",
  partial_damage_only: "Partial (damage only)",
  partial_non_damage_only: "Partial (non-damage only)",
  special: "Special",
};

const SAVE_VS_LABELS: Record<string, string> = {
  spell: "Spell",
  poison: "Poison",
  death_magic: "Death Magic",
  polymorph: "Polymorph",
  petrification: "Petrification",
  breath: "Breath",
  weapon: "Weapon",
  other: "Other",
};

const SAVE_TIMING_LABELS: Record<string, string> = {
  on_hit: "On Hit",
  on_contact: "On Contact",
  on_entry: "On Entry",
  end_of_round: "End of Round",
  on_effect: "On Effect",
  special: "Special",
};

const DEFAULT_SINGLE_SAVE: SingleSave = {
  saveType: "spell",
  appliesTo: "each_target",
  onSuccess: { result: "no_effect" },
  onFailure: { result: "full_effect" },
};

const rootSurfaceClass =
  "space-y-2 rounded-xl border border-neutral-300 bg-white p-3 text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

const controlClass =
  "rounded border border-neutral-400 bg-white px-2 py-1 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100";

const nestedSurfaceClass =
  "space-y-2 rounded-lg border border-neutral-200 bg-neutral-50/70 p-2 dark:border-neutral-800 dark:bg-neutral-700";

const annotationClass =
  "flex items-center gap-2 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] italic text-amber-700 dark:border-amber-900/30 dark:bg-amber-900/10 dark:text-amber-400";

const mutedTextClass = "text-neutral-600 dark:text-neutral-400";

const secondaryButtonClass =
  "rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-200 dark:border-neutral-700 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600";

const removeButtonClass =
  "rounded px-1 text-xs text-red-600 hover:bg-neutral-100 dark:text-red-400 dark:hover:bg-neutral-800";

interface SavingThrowInputProps {
  value: SavingThrowSpec | null | undefined;
  onChange: (v: SavingThrowSpec) => void;
}

export function SavingThrowInput({ value, onChange }: SavingThrowInputProps) {
  const spec = value ?? defaultSavingThrowSpec();

  const updateSpec = (updates: Partial<SavingThrowSpec>) => {
    onChange({ ...spec, ...updates });
  };

  const updateSingle = (updates: Partial<SingleSave>) => {
    const single = { ...(spec.single ?? DEFAULT_SINGLE_SAVE), ...updates };
    updateSpec({ single });
  };

  const addMultiple = () => {
    const multiple = [...(spec.multiple ?? []), { ...DEFAULT_SINGLE_SAVE }];
    updateSpec({ multiple });
  };

  const removeMultiple = (index: number) => {
    const multiple = spec.multiple?.filter((_, i) => i !== index) ?? [];
    updateSpec({ multiple: multiple.length ? multiple : undefined });
  };

  const updateMultipleAt = (index: number, updates: Partial<SingleSave>) => {
    const multiple = [...(spec.multiple ?? [])];
    if (index >= 0 && index < multiple.length) {
      multiple[index] = { ...multiple[index], ...updates };
      updateSpec({ multiple });
    }
  };

  return (
    <fieldset className={rootSurfaceClass} data-testid="saving-throw-input">
      <legend className="sr-only">Saving Throw</legend>
      <div className="flex flex-wrap items-center gap-2">
        <select
          data-testid="saving-throw-kind"
          aria-label="Saving throw kind"
          value={spec.kind}
          onChange={(e) => {
            const kind = e.target.value as SavingThrowKind;
            if (kind === "none") {
              onChange({ kind: "none", notes: spec.notes, rawLegacyValue: spec.rawLegacyValue });
            } else if (kind === "dm_adjudicated") {
              onChange({
                kind: "dm_adjudicated",
                notes: spec.notes,
                rawLegacyValue: spec.rawLegacyValue,
              });
            } else if (kind === "single") {
              onChange({
                kind: "single",
                single: spec.single ?? DEFAULT_SINGLE_SAVE,
                notes: spec.notes,
                rawLegacyValue: spec.rawLegacyValue,
              });
            } else {
              onChange({
                kind: "multiple",
                multiple: spec.multiple?.length ? spec.multiple : [DEFAULT_SINGLE_SAVE],
                notes: spec.notes,
                rawLegacyValue: spec.rawLegacyValue,
              });
            }
          }}
          className={controlClass}
        >
          {(Object.entries(SAVING_THROW_KIND_LABELS) as [SavingThrowKind, string][]).map(
            ([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ),
          )}
        </select>
      </div>

      {spec.rawLegacyValue && (
        <div
          data-testid="saving-throw-raw-legacy-annotation"
          className={annotationClass}
        >
          <span className="font-bold uppercase not-italic">Original source text:</span>
          <span>{spec.rawLegacyValue}</span>
        </div>
      )}

      {spec.kind === "single" && spec.single && (
        <SingleSaveForm
          save={spec.single}
          onChange={updateSingle}
          dataTestIdPrefix="saving-throw-single"
        />
      )}

      {spec.kind === "multiple" &&
        spec.multiple?.map((s, idx) => (
          <div
            key={`save-${idx}-${s.saveType}-${s.appliesTo}`}
            className={nestedSurfaceClass}
          >
            <div className="flex justify-between items-center">
              <span className={`text-xs ${mutedTextClass}`}>Save #{idx + 1}</span>
              <button
                type="button"
                data-testid={`saving-throw-remove-multiple-${idx}`}
                aria-label="Remove save"
                onClick={() => removeMultiple(idx)}
                className={removeButtonClass}
              >
                Remove
              </button>
            </div>
            <SingleSaveForm
              save={s}
              onChange={(u) => updateMultipleAt(idx, u)}
              dataTestIdPrefix={`saving-throw-multiple-${idx}`}
            />
          </div>
        ))}
      {spec.kind === "multiple" && (
        <button
          type="button"
          data-testid="saving-throw-add-multiple"
          onClick={addMultiple}
          className={secondaryButtonClass}
        >
          Add save
        </button>
      )}

      {/* Notes: always rendered in v2 — sole narrative field after dm_guidance removal */}
      <textarea
        data-testid="saving-throw-notes"
        aria-label="Overall saving throw notes"
        placeholder="Overall saving throw notes (optional)..."
        value={spec.notes ?? ""}
        onChange={(e) => updateSpec({ notes: e.target.value || undefined })}
        className={`w-full min-h-[60px] ${controlClass}`}
      />
    </fieldset>
  );
}

function SingleSaveForm({
  save,
  onChange,
  dataTestIdPrefix,
}: {
  save: SingleSave;
  onChange: (u: Partial<SingleSave>) => void;
  dataTestIdPrefix: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${nestedSurfaceClass}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          data-testid={`${dataTestIdPrefix}-id`}
          aria-label="Save ID"
          placeholder="id (snake_case)"
          value={save.id ?? ""}
          onChange={(e) => {
            const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_");
            onChange({ id: val || undefined });
          }}
          className={`w-24 font-mono ${controlClass}`}
        />
        <select
          data-testid={`${dataTestIdPrefix}-save-type`}
          aria-label="Save type"
          value={save.saveType}
          onChange={(e) => onChange({ saveType: e.target.value as SaveType })}
          className={controlClass}
        >
          {(Object.entries(SAVE_TYPE_LABELS) as [SaveType, string][]).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select
          data-testid={`${dataTestIdPrefix}-save-vs`}
          aria-label="Save vs"
          value={save.saveVs ?? "spell"}
          onChange={(e) => onChange({ saveVs: e.target.value })}
          className={controlClass}
        >
          {Object.entries(SAVE_VS_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              vs {label}
            </option>
          ))}
        </select>
        <input
          type="text"
          inputMode="numeric"
          data-testid={`${dataTestIdPrefix}-modifier`}
          aria-label="Modifier"
          placeholder="+0"
          value={save.modifier ?? 0}
          onChange={(e) => {
            const v = parseNumericInput(e.target.value);
            onChange({ modifier: Number.isNaN(v) ? 0 : v });
          }}
          className={`w-12 ${controlClass}`}
        />
        <select
          data-testid={`${dataTestIdPrefix}-applies-to`}
          aria-label="Applies to"
          value={save.appliesTo ?? "each_target"}
          onChange={(e) => onChange({ appliesTo: e.target.value })}
          className={controlClass}
        >
          <option value="each_target">Each Target</option>
          <option value="each_round">Each Round</option>
          <option value="each_application">Each Application</option>
          <option value="once_per_cast">Once Per Cast</option>
          <option value="special">Special</option>
        </select>
        <select
          data-testid={`${dataTestIdPrefix}-timing`}
          aria-label="Timing"
          value={save.timing ?? "on_effect"}
          onChange={(e) => onChange({ timing: e.target.value })}
          className={controlClass}
        >
          {Object.entries(SAVE_TIMING_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs ${mutedTextClass}`}>Success:</span>
            <select
              data-testid={`${dataTestIdPrefix}-on-success`}
              aria-label="On success"
              value={save.onSuccess?.result ?? "no_effect"}
              onChange={(e) =>
                onChange({
                  onSuccess: { ...save.onSuccess, result: e.target.value as SaveOutcome },
                })
              }
              className={`flex-1 ${controlClass} text-xs`}
            >
              {(Object.entries(SAVE_OUTCOME_LABELS) as [SaveOutcome, string][]).map(
                ([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </div>
          <textarea
            data-testid={`${dataTestIdPrefix}-on-success-notes`}
            aria-label="Success notes"
            placeholder="Notes on success..."
            value={save.onSuccess?.notes ?? ""}
            onChange={(e) =>
              onChange({ onSuccess: { ...save.onSuccess, notes: e.target.value || undefined } })
            }
            className={`w-full min-h-[40px] ${controlClass} text-xs`}
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs ${mutedTextClass}`}>Failure:</span>
            <select
              data-testid={`${dataTestIdPrefix}-on-failure`}
              aria-label="On failure"
              value={save.onFailure?.result ?? "full_effect"}
              onChange={(e) =>
                onChange({
                  onFailure: { ...save.onFailure, result: e.target.value as SaveOutcome },
                })
              }
              className={`flex-1 ${controlClass} text-xs`}
            >
              {(Object.entries(SAVE_OUTCOME_LABELS) as [SaveOutcome, string][]).map(
                ([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ),
              )}
            </select>
          </div>
          <textarea
            data-testid={`${dataTestIdPrefix}-on-failure-notes`}
            aria-label="Failure notes"
            placeholder="Notes on failure..."
            value={save.onFailure?.notes ?? ""}
            onChange={(e) =>
              onChange({ onFailure: { ...save.onFailure, notes: e.target.value || undefined } })
            }
            className={`w-full min-h-[40px] ${controlClass} text-xs`}
          />
        </div>
      </div>
    </div>
  );
}
