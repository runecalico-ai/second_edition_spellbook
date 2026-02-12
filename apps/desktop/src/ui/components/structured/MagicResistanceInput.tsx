import type { MagicResistanceSpec, MagicResistanceKind, AppliesTo } from "../../../types/spell";
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
}

export function MagicResistanceInput({ value, onChange }: MagicResistanceInputProps) {
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
            } else if (kind === "special") {
              next.appliesTo = spec.appliesTo ?? "whole_spell";
              next.specialRule = spec.specialRule ?? "";
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

      {spec.kind === "partial" && (
        <div className="flex flex-wrap items-center gap-2 p-2 bg-neutral-900/50 rounded">
          <select
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
          <input
            type="text"
            data-testid="magic-resistance-part-ids"
            aria-label="Part IDs (comma-separated)"
            placeholder="Part IDs (optional)"
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
            className="flex-1 min-w-[120px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          />
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

      {spec.kind !== "unknown" && (
        <textarea
          data-testid="magic-resistance-notes"
          aria-label="Overall Magic Resistance notes"
          placeholder="Overall MR notes (optional)..."
          value={spec.notes ?? ""}
          onChange={(e) => updateSpec({ notes: e.target.value || undefined })}
          className="w-full min-h-[60px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
        />
      )}
    </div>
  );
}
