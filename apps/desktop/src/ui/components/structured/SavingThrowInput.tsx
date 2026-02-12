import type {
  SavingThrowSpec,
  SavingThrowKind,
  SingleSave,
  SaveType,
  SaveOutcome,
  SaveOutcomeEffect,
} from "../../../types/spell";
import { defaultSavingThrowSpec } from "../../../types/spell";
import { parseNumericInput } from "../../../lib/validation";

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
    <div className="space-y-2" data-testid="saving-throw-input">
      <div className="flex flex-wrap items-center gap-2">
        <select
          data-testid="saving-throw-kind"
          aria-label="Saving throw kind"
          value={spec.kind}
          onChange={(e) => {
            const kind = e.target.value as SavingThrowKind;
            if (kind === "none") {
              onChange({ kind: "none" });
            } else if (kind === "dm_adjudicated") {
              onChange({
                kind: "dm_adjudicated",
                dmGuidance: spec.dmGuidance ?? "",
              });
            } else if (kind === "single") {
              onChange({
                kind: "single",
                single: spec.single ?? DEFAULT_SINGLE_SAVE,
              });
            } else {
              onChange({
                kind: "multiple",
                multiple: spec.multiple?.length ? spec.multiple : [DEFAULT_SINGLE_SAVE],
              });
            }
          }}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
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

      {spec.kind === "dm_adjudicated" && (
        <textarea
          data-testid="saving-throw-dm-guidance"
          aria-label="DM guidance"
          placeholder="Describe saving throw for DM adjudication..."
          value={spec.dmGuidance ?? ""}
          onChange={(e) => updateSpec({ dmGuidance: e.target.value || undefined })}
          className="w-full min-h-[60px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
        />
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
            className="p-2 bg-neutral-900/50 rounded border border-neutral-800 space-y-2"
          >
            <div className="flex justify-between items-center">
              <span className="text-xs text-neutral-500">Save #{idx + 1}</span>
              <button
                type="button"
                data-testid="saving-throw-remove-multiple"
                onClick={() => removeMultiple(idx)}
                className="text-xs text-red-400 hover:bg-neutral-800 rounded px-1"
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
          className="px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 rounded"
        >
          Add save
        </button>
      )}

      {spec.kind !== "none" && (
        <textarea
          data-testid="saving-throw-notes"
          aria-label="Overall saving throw notes"
          placeholder="Overall saving throw notes (optional)..."
          value={spec.notes ?? ""}
          onChange={(e) => updateSpec({ notes: e.target.value || undefined })}
          className="w-full min-h-[60px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
        />
      )}
    </div>
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
    <div className="flex flex-col gap-2 p-2 bg-neutral-900/50 rounded">
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
          className="w-24 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100 font-mono"
        />
        <select
          data-testid={`${dataTestIdPrefix}-save-type`}
          aria-label="Save type"
          value={save.saveType}
          onChange={(e) => onChange({ saveType: e.target.value as SaveType })}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
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
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
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
          className="w-12 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
        />
        <select
          data-testid={`${dataTestIdPrefix}-applies-to`}
          aria-label="Applies to"
          value={save.appliesTo ?? "each_target"}
          onChange={(e) => onChange({ appliesTo: e.target.value })}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
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
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
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
            <span className="text-xs text-neutral-500">Success:</span>
            <select
              data-testid={`${dataTestIdPrefix}-on-success`}
              aria-label="On success"
              value={save.onSuccess?.result ?? "no_effect"}
              onChange={(e) =>
                onChange({
                  onSuccess: { ...save.onSuccess, result: e.target.value as SaveOutcome },
                })
              }
              className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100"
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
            className="w-full min-h-[40px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Failure:</span>
            <select
              data-testid={`${dataTestIdPrefix}-on-failure`}
              aria-label="On failure"
              value={save.onFailure?.result ?? "full_effect"}
              onChange={(e) =>
                onChange({
                  onFailure: { ...save.onFailure, result: e.target.value as SaveOutcome },
                })
              }
              className="flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100"
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
            className="w-full min-h-[40px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100"
          />
        </div>
      </div>
    </div>
  );
}
