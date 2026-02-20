import { useMemo } from "react";
import { clampScalar, parseNumericInput } from "../../../lib/validation";
import type { DurationSpec, RangeSpec, SpellCastingTime, SpellScalar } from "../../../types/spell";
import {
  CASTING_TIME_UNIT_LABELS,
  type CastingTimeUnit,
  DURATION_CONDITION_KINDS,
  DURATION_KIND_ONLY,
  DURATION_UNIT_LABELS,
  type DurationKind,
  type DurationUnit,
  RANGE_DISTANCE_KINDS,
  RANGE_KIND_ONLY,
  RANGE_UNIT_LABELS,
  type RangeUnit,
  defaultCastingTime,
  defaultDurationSpec,
  defaultRangeSpec,
} from "../../../types/spell";
import { ScalarInput } from "./ScalarInput";

export type StructuredFieldType = "range" | "duration" | "casting_time";

export type StructuredFieldValue = RangeSpec | DurationSpec | SpellCastingTime;

interface StructuredFieldInputProps {
  fieldType: "range" | "duration" | "casting_time";
  value: RangeSpec | DurationSpec | SpellCastingTime | null | undefined;
  onChange: (v: StructuredFieldValue) => void;
}

/** Compute display text for range from structured value (lowercase units per spec). Exported for editor save/sync. */
export function rangeToText(spec: RangeSpec): string {
  if (spec.rawLegacyValue) return spec.rawLegacyValue;
  if (spec.kind === "special") return spec.rawLegacyValue ?? "Special";
  if (
    RANGE_DISTANCE_KINDS.includes(spec.kind as (typeof RANGE_DISTANCE_KINDS)[number]) &&
    spec.distance &&
    spec.unit
  ) {
    const d = spec.distance;
    const val =
      d.mode === "fixed"
        ? (d.value ?? 0)
        : (d.perLevel ?? (d as SpellScalar & { per_level?: number }).per_level ?? 0);
    const unit = spec.unit;
    if (d.mode === "per_level") {
      return `${val}/${unit}/level`;
    }
    return `${val} ${unit}`;
  }
  const labels: Record<string, string> = {
    personal: "Personal",
    touch: "Touch",
    los: "Line of sight",
    loe: "Line of effect",
    distance: "Distance",
    distance_los: "Distance (LOS)",
    distance_loe: "Distance (LOE)",
    sight: "Sight",
    hearing: "Hearing",
    voice: "Voice",
    senses: "Senses",
    same_room: "Same room",
    same_structure: "Same structure",
    same_dungeon_level: "Same dungeon level",
    wilderness: "Wilderness",
    same_plane: "Same plane",
    interplanar: "Interplanar",
    anywhere_on_plane: "Anywhere on plane",
    domain: "Domain",
    unlimited: "Unlimited",
  };
  return labels[spec.kind] ?? spec.kind;
}

/** Compute display text for duration. Exported for editor save/sync. */
export function durationToText(spec: DurationSpec): string {
  if (spec.rawLegacyValue) return spec.rawLegacyValue;
  if (spec.kind === "special") return spec.rawLegacyValue ?? "Special";
  if (DURATION_KIND_ONLY.includes(spec.kind as (typeof DURATION_KIND_ONLY)[number])) {
    const labels: Record<string, string> = {
      instant: "Instant",
      permanent: "Permanent",
      until_dispelled: "Until dispelled",
      concentration: "Concentration",
    };
    return labels[spec.kind] ?? spec.kind;
  }
  if (spec.kind === "time" && spec.unit && spec.duration) {
    const d = spec.duration;
    const val =
      d.mode === "fixed"
        ? (d.value ?? 0)
        : (d.perLevel ?? (d as SpellScalar & { per_level?: number }).per_level ?? 0);
    const unit = spec.unit;
    if (d.mode === "per_level") {
      return `${val} ${unit}/level`;
    }
    return `${val} ${unit}`;
  }
  if (DURATION_CONDITION_KINDS.includes(spec.kind as (typeof DURATION_CONDITION_KINDS)[number])) {
    return spec.condition ?? spec.kind.replace(/_/g, " ");
  }
  if (spec.kind === "usage_limited" && spec.uses) {
    const u = spec.uses;
    const val =
      u.mode === "fixed"
        ? (u.value ?? 0)
        : (u.perLevel ?? (u as SpellScalar & { per_level?: number }).per_level ?? 0);
    if (u.mode === "per_level") return `${val} uses/level`;
    return `${val} use(s)`;
  }
  return spec.kind.replace(/_/g, " ");
}

/** Compute display text for casting time from structured value. Exported for editor save/sync. */
export function castingTimeToText(ct: SpellCastingTime): string {
  if (ct.rawLegacyValue) return ct.rawLegacyValue;
  if (ct.unit === "special") return ct.rawLegacyValue ?? "Special";
  const base = ct.baseValue ?? 1;
  const perLevel = ct.perLevel ?? 0;
  const div = ct.levelDivisor ?? 1;
  const unit = ct.unit;
  const unitLabels: Record<string, string> = {
    segment: "segment",
    round: "round",
    turn: "turn",
    hour: "hour",
    minute: "minute",
    action: "action",
    bonus_action: "bonus action",
    reaction: "reaction",
    instantaneous: "instantaneous",
  };
  const u = unitLabels[unit] ?? unit;
  if (perLevel !== 0 && div !== 1) {
    return `${base} + ${perLevel}/${div}/level ${u}`;
  }
  if (perLevel !== 0) {
    return `${base} + ${perLevel}/level ${u}`;
  }
  if (base === 1) return `1 ${u}`;
  return `${base} ${u}s`;
}

const ALL_DURATION_KINDS: { value: DurationKind; label: string }[] = [
  ...DURATION_KIND_ONLY.map((k) => ({
    value: k,
    label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  })),
  { value: "time", label: "Time" },
  ...DURATION_CONDITION_KINDS.map((k) => ({
    value: k,
    label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
  })),
  { value: "usage_limited", label: "Usage limited" },
  { value: "special", label: "Special" },
];

export function StructuredFieldInput({ fieldType, value, onChange }: StructuredFieldInputProps) {
  const rangeSpec = (value as RangeSpec | null | undefined) ?? defaultRangeSpec();
  const durationSpec = (value as DurationSpec | null | undefined) ?? defaultDurationSpec();
  const castingTimeSpec = (value as SpellCastingTime | null | undefined) ?? defaultCastingTime();

  const rangeTextPreview = useMemo(
    () => (fieldType === "range" ? rangeToText(rangeSpec) : ""),
    [fieldType, rangeSpec],
  );
  const durationTextPreview = useMemo(
    () => (fieldType === "duration" ? durationToText(durationSpec) : ""),
    [fieldType, durationSpec],
  );
  const castingTimeTextPreview = useMemo(
    () => (fieldType === "casting_time" ? castingTimeToText(castingTimeSpec) : ""),
    [fieldType, castingTimeSpec],
  );

  if (fieldType === "range") {
    const spec = rangeSpec;
    const isDistanceKind = RANGE_DISTANCE_KINDS.includes(
      spec.kind as (typeof RANGE_DISTANCE_KINDS)[number],
    );
    const isSpecial = spec.kind === "special";
    const allRangeKinds: { value: string; label: string }[] = [
      ...RANGE_DISTANCE_KINDS.map((k) => ({
        value: k,
        label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      })),
      ...RANGE_KIND_ONLY.map((k) => ({
        value: k,
        label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      })),
      { value: "special", label: "Special" },
    ];

    return (
      <div className="space-y-2" data-testid="structured-field-input">
        <div className="flex flex-wrap items-center gap-2">
          <select
            data-testid="range-kind-select"
            aria-label="Range kind"
            value={spec.kind}
            onChange={(e) => {
              const kind = e.target.value as RangeSpec["kind"];
              const next: RangeSpec = { ...spec, kind };
              if (RANGE_DISTANCE_KINDS.includes(kind as (typeof RANGE_DISTANCE_KINDS)[number])) {
                next.unit = spec.unit ?? "ft";
                next.distance = spec.distance ?? { mode: "fixed", value: 0 };
                next.rawLegacyValue = undefined;
              } else if (kind !== "special") {
                next.unit = undefined;
                next.distance = undefined;
                next.rawLegacyValue = undefined;
              }
              onChange(next);
            }}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          >
            {allRangeKinds.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {isDistanceKind && (
            <>
              <ScalarInput
                value={spec.distance ?? { mode: "fixed", value: 0 }}
                onChange={(d) => onChange({ ...spec, distance: d })}
                data-testid="range-scalar"
                baseValueTestId="range-base-value"
                perLevelTestId="range-per-level"
              />
              <select
                data-testid="range-unit"
                aria-label="Range unit"
                value={spec.unit ?? "ft"}
                onChange={(e) => onChange({ ...spec, unit: e.target.value as RangeUnit })}
                className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
              >
                {(Object.entries(RANGE_UNIT_LABELS) as [RangeUnit, string][]).map(([u, label]) => (
                  <option key={u} value={u}>
                    {label}
                  </option>
                ))}
              </select>
            </>
          )}
          {isSpecial && (
            <input
              type="text"
              data-testid="range-raw-legacy"
              aria-label="Raw legacy value"
              placeholder="Original text"
              value={spec.rawLegacyValue ?? ""}
              onChange={(e) =>
                onChange({
                  ...spec,
                  rawLegacyValue: e.target.value || undefined,
                })
              }
              className="flex-1 min-w-[120px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
            />
          )}
        </div>
        <textarea
          data-testid="range-notes"
          aria-label="Range notes"
          placeholder="Range notes (optional)..."
          value={spec.notes ?? ""}
          onChange={(e) => onChange({ ...spec, notes: e.target.value || undefined })}
          className="w-full min-h-[40px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-600"
        />
        <p className="text-sm text-neutral-500 italic" data-testid="range-text-preview">
          {rangeTextPreview || "—"}
        </p>
      </div>
    );
  }

  if (fieldType === "duration") {
    const spec = durationSpec;
    const isTime = spec.kind === "time";
    const isCondition = DURATION_CONDITION_KINDS.includes(
      spec.kind as (typeof DURATION_CONDITION_KINDS)[number],
    );
    const isUsageLimited = spec.kind === "usage_limited";
    const isSpecial = spec.kind === "special";

    return (
      <div className="space-y-2" data-testid="structured-field-input">
        <div className="flex flex-wrap items-center gap-2">
          <select
            data-testid="duration-kind-select"
            aria-label="Duration kind"
            value={spec.kind}
            onChange={(e) => {
              const kind = e.target.value as DurationKind;
              const next: DurationSpec = { ...spec, kind };
              if (kind === "time") {
                next.unit = spec.unit ?? "round";
                next.duration = spec.duration ?? { mode: "fixed", value: 1 };
                next.rawLegacyValue = undefined;
              } else if (kind === "usage_limited") {
                next.uses = spec.uses ?? { mode: "fixed", value: 1 };
                next.rawLegacyValue = undefined;
              } else if (
                DURATION_CONDITION_KINDS.includes(kind as (typeof DURATION_CONDITION_KINDS)[number])
              ) {
                next.condition = spec.condition ?? "";
                next.rawLegacyValue = undefined;
              } else if (kind !== "special") {
                next.unit = undefined;
                next.duration = undefined;
                next.condition = undefined;
                next.uses = undefined;
                next.rawLegacyValue = undefined;
              }
              onChange(next);
            }}
            className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          >
            {ALL_DURATION_KINDS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {isTime && (
            <>
              <ScalarInput
                value={spec.duration ?? { mode: "fixed", value: 1 }}
                onChange={(d) => onChange({ ...spec, duration: d })}
                data-testid="duration-scalar"
                baseValueTestId="duration-base-value"
                perLevelTestId="duration-per-level"
              />
              <select
                data-testid="duration-unit"
                aria-label="Duration unit"
                value={spec.unit ?? "round"}
                onChange={(e) =>
                  onChange({
                    ...spec,
                    unit: e.target.value as DurationUnit,
                  })
                }
                className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
              >
                {(Object.entries(DURATION_UNIT_LABELS) as [DurationUnit, string][]).map(
                  ([u, label]) => (
                    <option key={u} value={u}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </>
          )}
          {isCondition && (
            <input
              type="text"
              data-testid="duration-condition"
              aria-label="Condition"
              placeholder="Condition text"
              value={spec.condition ?? ""}
              onChange={(e) => onChange({ ...spec, condition: e.target.value || undefined })}
              className="flex-1 min-w-[140px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
            />
          )}
          {isUsageLimited && (
            <ScalarInput
              value={spec.uses ?? { mode: "fixed", value: 1 }}
              onChange={(u) => onChange({ ...spec, uses: u })}
              data-testid="duration-uses-scalar"
              baseValueTestId="duration-uses-value"
              perLevelTestId="duration-uses-per-level"
            />
          )}
          {isSpecial && (
            <input
              type="text"
              data-testid="duration-raw-legacy"
              aria-label="Raw legacy value"
              placeholder="Original text"
              value={spec.rawLegacyValue ?? ""}
              onChange={(e) =>
                onChange({
                  ...spec,
                  rawLegacyValue: e.target.value || undefined,
                })
              }
              className="flex-1 min-w-[120px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
            />
          )}
        </div>
        <textarea
          data-testid="duration-notes"
          aria-label="Duration notes"
          placeholder="Duration notes (optional)..."
          value={spec.notes ?? ""}
          onChange={(e) => onChange({ ...spec, notes: e.target.value || undefined })}
          className="w-full min-h-[40px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-600"
        />
        <p className="text-sm text-neutral-500 italic" data-testid="duration-text-preview">
          {durationTextPreview || "—"}
        </p>
      </div>
    );
  }

  // casting_time
  const ct = castingTimeSpec;
  const baseValue = ct.baseValue ?? 1;
  const perLevel = ct.perLevel ?? 0;
  const levelDivisor = ct.levelDivisor ?? 1;

  const updateCt = (updates: Partial<SpellCastingTime>) => {
    const next = { ...ct, ...updates };
    next.text = castingTimeToText(next);
    onChange(next);
  };

  return (
    <div className="space-y-2" data-testid="structured-field-input">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          inputMode="decimal"
          data-testid="casting-time-base-value"
          aria-label="Base value"
          className="w-16 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          value={baseValue}
          onChange={(e) => {
            const v = clampScalar(parseNumericInput(e.target.value));
            updateCt({ baseValue: v });
          }}
        />
        <span className="text-neutral-500 text-sm">+</span>
        <input
          type="text"
          inputMode="decimal"
          data-testid="casting-time-per-level"
          aria-label="Per level"
          className="w-14 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          value={perLevel}
          onChange={(e) => {
            const v = clampScalar(parseNumericInput(e.target.value));
            updateCt({ perLevel: v });
          }}
        />
        <span className="text-neutral-500 text-sm">/</span>
        <input
          type="text"
          inputMode="decimal"
          data-testid="casting-time-level-divisor"
          aria-label="Level divisor"
          className="w-12 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
          value={levelDivisor}
          onChange={(e) => {
            const v = Math.max(1, Math.floor(parseNumericInput(e.target.value)) || 1);
            updateCt({ levelDivisor: v });
          }}
        />
        <span className="text-neutral-500 text-sm">/level</span>
        <select
          data-testid="casting-time-unit"
          aria-label="Casting time unit"
          value={ct.unit}
          onChange={(e) => {
            const unit = e.target.value as CastingTimeUnit;
            updateCt(unit === "special" ? { unit } : { unit, rawLegacyValue: undefined });
          }}
          className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
        >
          {(Object.entries(CASTING_TIME_UNIT_LABELS) as [CastingTimeUnit, string][]).map(
            ([u, label]) => (
              <option key={u} value={u}>
                {label}
              </option>
            ),
          )}
        </select>
        {(ct.unit === "special" || ct.rawLegacyValue) && (
          <input
            type="text"
            data-testid="casting-time-raw-legacy"
            aria-label="Raw legacy value"
            placeholder="Original text"
            value={ct.rawLegacyValue ?? ""}
            onChange={(e) => updateCt({ rawLegacyValue: e.target.value || undefined })}
            className="flex-1 min-w-[120px] bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm"
          />
        )}
      </div>
      <p className="text-sm text-neutral-500 italic" data-testid="casting-time-text-preview">
        {castingTimeTextPreview || "—"}
      </p>
    </div>
  );
}
