import type { AppliesTo, MagicResistanceKind, MagicResistanceSpec } from "../../../types/spell";
import { defaultMagicResistanceSpec } from "../../../types/spell";

const MR_KIND_LABELS: Record<MagicResistanceKind, string> = {
  unknown: "Unknown",
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

const PARTIAL_SCOPE_OPTIONS = [
  "damage_only",
  "non_damage_only",
  "primary_effect_only",
  "secondary_effects_only",
  "by_part_id",
];

interface MagicResistanceInputProps {
  value: MagicResistanceSpec | null | undefined;
  onChange: (v: MagicResistanceSpec) => void;
  damageKind?: string;
}

export function MagicResistanceInput({ value, onChange, damageKind }: MagicResistanceInputProps) {
  const spec = value ?? defaultMagicResistanceSpec();

  const updateSpec = (updates: Partial<MagicResistanceSpec>) => {
    onChange({ ...spec, ...updates });
  };

  const showAppliesTo = spec.kind !== "unknown";

  return (
    <div className="space-y-2" data-testid="magic-resistance-input">
      <div className="flex flex-wrap items-center gap-2">
        <select
          data-testid="magic-resistance-kind"
          aria-label="Magic resistance kind"
          value={spec.kind}
          onChange={(e) => {
            const kind = e.target.value as MagicResistanceKind;
            const next: MagicResistanceSpec = { ...spec, kind };
            if (kind === "unknown") {
              next.appliesTo = undefined;
              next.partial = undefined;
              next.specialRule = undefined;
            } else if (kind === "partial") {
              next.appliesTo = spec.appliesTo ?? "whole_spell";
              next.partial = spec.partial ?? { scope: "damage_only" };
              next.specialRule = undefined;
            } else if (kind === "special") {
              next.appliesTo = spec.appliesTo ?? "whole_spell";
              next.specialRule = spec.specialRule ?? "";
              next.partial = undefined;
            } else {
              next.appliesTo = spec.appliesTo ?? "whole_spell";
              next.partial = undefined;
              next.specialRule = undefined;
            }
            onChange(next);
          }}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
        >
          {(Object.entries(MR_KIND_LABELS) as [MagicResistanceKind, string][]).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>

        {showAppliesTo && (
          <select
            data-testid="magic-resistance-applies-to"
            aria-label="Applies to"
            value={spec.appliesTo ?? "whole_spell"}
            onChange={(e) => updateSpec({ appliesTo: e.target.value as AppliesTo })}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          >
            {(Object.entries(APPLIES_TO_LABELS) as [AppliesTo, string][]).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        )}

      </div>
      {spec.sourceText && (
        <div className="flex items-center gap-2 px-2 py-1 bg-amber-900/10 border border-amber-900/30 rounded text-[10px] text-amber-200/70 italic">
          <span className="font-bold uppercase not-italic">Original source text:</span>
          <span>{spec.sourceText}</span>
        </div>
      )}

      {spec.kind === "partial" && (
        <div className="flex flex-col gap-2 p-2 bg-neutral-900/50 rounded border border-neutral-800">
          <div className="flex items-center gap-2">
            <label
              htmlFor="magic-resistance-partial-scope"
              className="text-xs text-neutral-500 min-w-[60px]"
            >
              Scope:
            </label>
            <select
              id="magic-resistance-partial-scope"
              data-testid="magic-resistance-partial-scope"
              aria-label="Partial scope"
              value={spec.partial?.scope ?? "damage_only"}
              onChange={(e) =>
                updateSpec({
                  partial: {
                    ...spec.partial,
                    scope: e.target.value,
                  } as MagicResistanceSpec["partial"],
                })
              }
              className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
            >
              {PARTIAL_SCOPE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          {spec.partial?.scope === "by_part_id" && (
            <div className="flex items-center gap-2">
              <label
                htmlFor="magic-resistance-part-ids"
                className="text-xs text-neutral-500 min-w-[60px]"
              >
                Part IDs:
              </label>
              <div className="flex-1 flex flex-col gap-1">
                <input
                  id="magic-resistance-part-ids"
                  type="text"
                  data-testid="magic-resistance-part-ids"
                  aria-label="Part IDs (comma-separated)"
                  placeholder="Part IDs (e.g. part_1, part_2)"
                  disabled={damageKind !== "modeled"}
                  value={spec.partial?.partIds?.join(", ") ?? ""}
                  onChange={(e) => {
                    const partIds = e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean);
                    updateSpec({
                      partial: {
                        ...spec.partial,
                        scope: spec.partial?.scope ?? "damage_only",
                        partIds: partIds.length ? partIds : undefined,
                      } as MagicResistanceSpec["partial"],
                    });
                  }}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100 disabled:opacity-50"
                />
                {damageKind !== "modeled" && (
                  <p className="text-[10px] text-amber-500 italic">
                    No modeled damage parts available — set Damage to Modeled first
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {spec.kind === "special" && (
        <textarea
          data-testid="magic-resistance-special-rule"
          aria-label="Special rule"
          placeholder="Describe special MR rule..."
          value={spec.specialRule ?? ""}
          onChange={(e) => updateSpec({ specialRule: e.target.value || undefined })}
          className="w-full min-h-[60px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
        />
      )}

      <textarea
        data-testid="magic-resistance-notes"
        aria-label="Overall Magic Resistance notes"
        placeholder="Overall MR notes (optional)..."
        value={spec.notes ?? ""}
        onChange={(e) => updateSpec({ notes: e.target.value || undefined })}
        className="w-full min-h-[60px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
      />
    </div>
  );
}
