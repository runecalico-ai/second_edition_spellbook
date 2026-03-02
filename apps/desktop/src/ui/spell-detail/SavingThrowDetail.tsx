import type { SaveType, SavingThrowSpec } from "../../types/spell";

const SAVE_TYPE_LABELS: Record<SaveType, string> = {
  paralyzation_poison_death: "Paralyzation/Poison/Death",
  rod_staff_wand: "Rod/Staff/Wand",
  petrification_polymorph: "Petrification/Polymorph",
  breath_weapon: "Breath Weapon",
  spell: "Spell",
  special: "Special",
};

interface SavingThrowDetailProps {
  spec: SavingThrowSpec | undefined | null;
}

function SaveEntry({
  saveType,
  saveVs,
  index,
}: {
  saveType: SaveType;
  saveVs?: string;
  index?: number;
}) {
  const testSuffix = index != null ? `-${index}` : "";
  return (
    <div
      className="flex flex-wrap gap-1 items-center text-sm"
      data-testid={`save-entry${testSuffix}`}
    >
      <span className="font-medium text-neutral-100" data-testid={`save-type${testSuffix}`}>
        {SAVE_TYPE_LABELS[saveType] ?? saveType.replace(/_/g, " ")}
      </span>
      {saveVs && (
        <span className="text-neutral-400" data-testid={`save-vs${testSuffix}`}>
          vs. {saveVs}
        </span>
      )}
    </div>
  );
}

/**
 * Read-only display component for a SavingThrowSpec.
 *
 * - "none": renders nothing
 * - "single" / "multiple": displays save entries; rawLegacyValue as collapsible annotation
 * - "dm_adjudicated": rawLegacyValue (or notes) as primary content
 * - notes always shown when present
 * - No dm_guidance / dmGuidance references (removed in schema v2)
 */
export function SavingThrowDetail({ spec }: SavingThrowDetailProps) {
  if (!spec || spec.kind === "none") return null;

  return (
    <div className="space-y-1" data-testid="saving-throw-detail">
      {spec.kind === "single" && spec.single && (
        <>
          <SaveEntry saveType={spec.single.saveType} saveVs={spec.single.saveVs} />
          {spec.rawLegacyValue && (
            <details className="text-xs" data-testid="saving-throw-legacy-collapsible">
              <summary className="cursor-pointer text-neutral-500 hover:text-neutral-400 select-none">
                Original source
              </summary>
              <p
                className="mt-1 pl-2 text-neutral-400 border-l border-neutral-700"
                data-testid="saving-throw-raw-legacy"
              >
                {spec.rawLegacyValue}
              </p>
            </details>
          )}
        </>
      )}

      {spec.kind === "multiple" && spec.multiple && spec.multiple.length > 0 && (
        <>
          <div className="space-y-0.5" data-testid="saving-throw-multiple-entries">
            {spec.multiple.map((entry, i) => (
              <SaveEntry
                key={entry.id ?? i}
                saveType={entry.saveType}
                saveVs={entry.saveVs}
                index={i}
              />
            ))}
          </div>
          {spec.rawLegacyValue && (
            <details className="text-xs" data-testid="saving-throw-legacy-collapsible">
              <summary className="cursor-pointer text-neutral-500 hover:text-neutral-400 select-none">
                Original source
              </summary>
              <p
                className="mt-1 pl-2 text-neutral-400 border-l border-neutral-700"
                data-testid="saving-throw-raw-legacy"
              >
                {spec.rawLegacyValue}
              </p>
            </details>
          )}
        </>
      )}

      {spec.kind === "dm_adjudicated" && (
        <p className="text-sm text-neutral-200" data-testid="saving-throw-dm-adjudicated">
          {spec.rawLegacyValue ?? "DM adjudicated"}
        </p>
      )}

      {spec.notes && (
        <p className="text-xs text-neutral-400 italic" data-testid="saving-throw-notes">
          {spec.notes}
        </p>
      )}
    </div>
  );
}
