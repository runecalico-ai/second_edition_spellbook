import { useMemo } from "react";
import { clampScalar, parseNumericInput } from "../../../lib/validation";
import type { DurationSpec, RangeSpec, SpellCastingTime } from "../../../types/spell";
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
  rangeToText,
  durationToText,
  castingTimeToText,
} from "../../../types/spell";
import type {
  SpellEditorFieldError,
  SpellEditorValidatedFieldKey,
} from "../../spellEditorValidation";
import { ScalarInput, type ScalarFieldValidationError } from "./ScalarInput";

export type StructuredFieldType = "range" | "duration" | "casting_time";

function pickScalarErr(
  errors: SpellEditorFieldError[] | undefined,
  key: SpellEditorValidatedFieldKey,
): ScalarFieldValidationError | null {
  const e = errors?.find((x) => x.field === key);
  return e ? { testId: e.testId, message: e.message } : null;
}

export type StructuredFieldValue = RangeSpec | DurationSpec | SpellCastingTime;

const structuredSelectClass =
  "bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded px-2 py-1 text-sm border";

const structuredInputClass =
  "bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 rounded px-2 py-1 text-sm border";

const structuredInputInvalidClass =
  "bg-white dark:bg-neutral-900 border-red-400 dark:border-red-600 text-neutral-900 dark:text-neutral-100 rounded px-2 py-1 text-sm border";

const structuredGroupSurfaceClass =
  "space-y-3 rounded-xl border border-neutral-300 bg-white p-3 text-neutral-900 shadow-sm dark:border-neutral-700 dark:bg-neutral-950/60 dark:text-neutral-100";

const structuredPrimaryControlRowClass = "flex min-w-0 flex-wrap items-center gap-2";

const structuredSupportingRowClass =
  "rounded-lg border border-neutral-200 bg-neutral-50/70 p-2 dark:border-neutral-800 dark:bg-neutral-950/40";

const structuredPreviewRowClass =
  "rounded-lg border border-neutral-200 bg-neutral-50 px-2.5 py-2 dark:border-neutral-800 dark:bg-neutral-950/50";

const structuredInlineScalarClusterClass = "flex min-w-0 flex-wrap items-center gap-2";

const structuredTextMuted = "text-neutral-600 dark:text-neutral-400";

const structuredPreviewOutputClass =
  "text-sm italic text-neutral-700 dark:text-neutral-300";

interface StructuredFieldInputProps {
  fieldType: "range" | "duration" | "casting_time";
  value: RangeSpec | DurationSpec | SpellCastingTime | null | undefined;
  onChange: (v: StructuredFieldValue) => void;
  /** Spell editor: mark validated scalar fields visible on blur / mode change. */
  onValidationBlur?: () => void;
  /** Spell editor inline validation (Task 3). */
  visibleFieldErrors?: SpellEditorFieldError[];
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

export function StructuredFieldInput({
  fieldType,
  value,
  onChange,
  onValidationBlur,
  visibleFieldErrors,
}: StructuredFieldInputProps) {
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
      <div className={structuredGroupSurfaceClass} data-testid="structured-field-input">
        <div
          className={structuredPrimaryControlRowClass}
          data-testid="structured-field-primary-row"
        >
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
              } else {
                next.unit = undefined;
                next.distance = undefined;
                if (kind !== "special") {
                  next.rawLegacyValue = undefined;
                }
              }
              next.text = rangeToText(next);
              onChange(next);
              onValidationBlur?.();
            }}
            className={structuredSelectClass}
          >
            {allRangeKinds.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {isDistanceKind && (
            <div className={structuredInlineScalarClusterClass}>
              <ScalarInput
                value={spec.distance ?? { mode: "fixed", value: 0 }}
                onChange={(d) => {
                  const next = { ...spec, distance: d };
                  next.text = rangeToText(next);
                  onChange(next);
                }}
                data-testid="range-scalar"
                accessibleNamePrefix="Range "
                baseValueTestId="range-base-value"
                perLevelTestId="range-per-level"
                onFieldBlur={onValidationBlur}
                fixedFieldError={pickScalarErr(visibleFieldErrors, "range-base-value")}
                perLevelFieldError={pickScalarErr(visibleFieldErrors, "range-per-level")}
              />
              <select
                data-testid="range-unit"
                aria-label="Range unit"
                value={spec.unit ?? "ft"}
                onChange={(e) => {
                  const next = { ...spec, unit: e.target.value as RangeUnit };
                  next.text = rangeToText(next);
                  onChange(next);
                }}
                className={structuredSelectClass}
              >
                {(Object.entries(RANGE_UNIT_LABELS) as [RangeUnit, string][]).map(([u, label]) => (
                  <option key={u} value={u}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {(isSpecial || spec.rawLegacyValue) && (
            <input
              type="text"
              readOnly={!isSpecial}
              data-testid="range-raw-legacy"
              aria-label="Range raw legacy value"
              placeholder="Original text"
              value={spec.rawLegacyValue ?? ""}
              onChange={(e) => {
                const rawLegacyValue = e.target.value || undefined;
                const next = { ...spec, rawLegacyValue };
                next.text = rangeToText(next);
                onChange(next);
              }}
              className={`flex-1 min-w-[120px] ${structuredInputClass}`}
            />
          )}
        </div>
        <div
          className={structuredSupportingRowClass}
          data-testid="structured-field-supporting-row"
        >
          <textarea
            data-testid="range-notes"
            aria-label="Range notes"
            placeholder="Range notes (optional)..."
            value={spec.notes ?? ""}
            onChange={(e) => {
              const next = { ...spec, notes: e.target.value || undefined };
              next.text = rangeToText(next);
              onChange(next);
            }}
            className={`w-full min-h-[40px] rounded px-2 py-1 text-xs placeholder:text-neutral-500 dark:placeholder:text-neutral-600 ${structuredInputClass}`}
          />
        </div>
        <div
          className={structuredPreviewRowClass}
          data-testid="structured-field-preview-row"
        >
          <output
            className={structuredPreviewOutputClass}
            data-testid="range-text-preview"
            aria-label="Computed range text"
          >
            {rangeTextPreview || "—"}
          </output>
        </div>
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
      <div className={structuredGroupSurfaceClass} data-testid="structured-field-input">
        <div
          className={structuredPrimaryControlRowClass}
          data-testid="structured-field-primary-row"
        >
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
                next.condition = undefined;
                next.uses = undefined;
                next.rawLegacyValue = undefined;
              } else if (kind === "usage_limited") {
                next.unit = undefined;
                next.duration = undefined;
                next.condition = undefined;
                next.uses = spec.uses ?? { mode: "fixed", value: 1 };
                next.rawLegacyValue = undefined;
              } else if (
                DURATION_CONDITION_KINDS.includes(kind as (typeof DURATION_CONDITION_KINDS)[number])
              ) {
                next.unit = undefined;
                next.duration = undefined;
                next.condition = spec.condition ?? "";
                next.uses = undefined;
                next.rawLegacyValue = undefined;
              } else {
                next.unit = undefined;
                next.duration = undefined;
                next.condition = undefined;
                next.uses = undefined;
                if (kind !== "special") {
                  next.rawLegacyValue = undefined;
                }
              }
              next.text = durationToText(next);
              onChange(next);
              onValidationBlur?.();
            }}
            className={structuredSelectClass}
          >
            {ALL_DURATION_KINDS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {isTime && (
            <div className={structuredInlineScalarClusterClass}>
              <ScalarInput
                value={spec.duration ?? { mode: "fixed", value: 1 }}
                onChange={(d) => {
                  const next = { ...spec, duration: d };
                  next.text = durationToText(next);
                  onChange(next);
                }}
                data-testid="duration-scalar"
                accessibleNamePrefix="Duration time "
                baseValueTestId="duration-base-value"
                perLevelTestId="duration-per-level"
                onFieldBlur={onValidationBlur}
                fixedFieldError={pickScalarErr(visibleFieldErrors, "duration-base-value")}
                perLevelFieldError={pickScalarErr(visibleFieldErrors, "duration-per-level")}
              />
              <select
                data-testid="duration-unit"
                aria-label="Duration unit"
                value={spec.unit ?? "round"}
                onChange={(e) => {
                  const next = { ...spec, unit: e.target.value as DurationUnit };
                  next.text = durationToText(next);
                  onChange(next);
                }}
                className={structuredSelectClass}
              >
                {(Object.entries(DURATION_UNIT_LABELS) as [DurationUnit, string][]).map(
                  ([u, label]) => (
                    <option key={u} value={u}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </div>
          )}
          {isCondition && (
            <input
              type="text"
              data-testid="duration-condition"
              aria-label="Duration condition"
              placeholder="Condition text"
              value={spec.condition ?? ""}
              onChange={(e) => {
                const condition = e.target.value || undefined;
                const next = { ...spec, condition };
                next.text = durationToText(next);
                onChange(next);
              }}
              className={`flex-1 min-w-[140px] ${structuredInputClass}`}
            />
          )}
          {isUsageLimited && (
            <div className={structuredInlineScalarClusterClass}>
              <ScalarInput
                value={spec.uses ?? { mode: "fixed", value: 1 }}
                onChange={(u) => {
                  const next = { ...spec, uses: u };
                  next.text = durationToText(next);
                  onChange(next);
                }}
                data-testid="duration-uses-scalar"
                accessibleNamePrefix="Duration uses "
                baseValueTestId="duration-uses-value"
                perLevelTestId="duration-uses-per-level"
                onFieldBlur={onValidationBlur}
                fixedFieldError={pickScalarErr(visibleFieldErrors, "duration-uses-value")}
                perLevelFieldError={pickScalarErr(visibleFieldErrors, "duration-uses-per-level")}
              />
            </div>
          )}
          {(isSpecial || spec.rawLegacyValue) && (
            <input
              type="text"
              readOnly={!isSpecial}
              data-testid="duration-raw-legacy"
              aria-label="Duration raw legacy value"
              placeholder="Original text"
              value={spec.rawLegacyValue ?? ""}
              onChange={(e) => {
                const rawLegacyValue = e.target.value || undefined;
                const next = { ...spec, rawLegacyValue };
                next.text = durationToText(next);
                onChange(next);
              }}
              className={`flex-1 min-w-[120px] ${structuredInputClass}`}
            />
          )}
        </div>
        <div
          className={structuredSupportingRowClass}
          data-testid="structured-field-supporting-row"
        >
          <textarea
            data-testid="duration-notes"
            aria-label="Duration notes"
            placeholder="Duration notes (optional)..."
            value={spec.notes ?? ""}
            onChange={(e) => {
              const next = { ...spec, notes: e.target.value || undefined };
              next.text = durationToText(next);
              onChange(next);
            }}
            className={`w-full min-h-[40px] rounded px-2 py-1 text-xs placeholder:text-neutral-500 dark:placeholder:text-neutral-600 ${structuredInputClass}`}
          />
        </div>
        <div
          className={structuredPreviewRowClass}
          data-testid="structured-field-preview-row"
        >
          <output
            className={structuredPreviewOutputClass}
            data-testid="duration-text-preview"
            aria-label="Computed duration text"
          >
            {durationTextPreview || "—"}
          </output>
        </div>
      </div>
    );
  }

  // casting_time
  const ct = castingTimeSpec;
  const baseValue = ct.baseValue ?? 1;
  const perLevel = ct.perLevel ?? 0;
  const levelDivisor = ct.levelDivisor ?? 1;

  const ctBaseErr = pickScalarErr(visibleFieldErrors, "casting-time-base-value");
  const ctPerErr = pickScalarErr(visibleFieldErrors, "casting-time-per-level");

  const updateCt = (updates: Partial<SpellCastingTime>) => {
    const next = { ...ct, ...updates };
    next.text = castingTimeToText(next);
    onChange(next);
  };

  return (
    <div className={structuredGroupSurfaceClass} data-testid="structured-field-input">
      <div
        className={structuredPrimaryControlRowClass}
        data-testid="structured-field-primary-row"
      >
        <div className={structuredInlineScalarClusterClass}>
          <div className="flex flex-col gap-1">
            <input
              type="text"
              inputMode="decimal"
              id="casting-time-base-value"
              data-testid="casting-time-base-value"
              aria-label="Casting time base value"
              aria-invalid={ctBaseErr ? "true" : "false"}
              aria-describedby={ctBaseErr ? ctBaseErr.testId : undefined}
              className={`w-16 rounded px-2 py-1 text-sm ${ctBaseErr ? structuredInputInvalidClass : structuredInputClass}`}
              value={baseValue}
              onChange={(e) => {
                const v = clampScalar(parseNumericInput(e.target.value));
                updateCt({ baseValue: v });
              }}
              onBlur={() => onValidationBlur?.()}
            />
            {ctBaseErr && (
              <div className="animate-in fade-in duration-200 max-w-[min(100%,12rem)]">
                <p
                  id={ctBaseErr.testId}
                  data-testid={ctBaseErr.testId}
                  className="text-xs text-red-700 dark:text-red-400"
                >
                  {ctBaseErr.message}
                </p>
              </div>
            )}
          </div>
          <span className={`${structuredTextMuted} text-xs font-medium leading-none`}>+</span>
          <div className="flex flex-col gap-1">
            <input
              type="text"
              inputMode="decimal"
              id="casting-time-per-level"
              data-testid="casting-time-per-level"
              aria-label="Casting time per level"
              aria-invalid={ctPerErr ? "true" : "false"}
              aria-describedby={ctPerErr ? ctPerErr.testId : undefined}
              className={`w-14 rounded px-2 py-1 text-sm ${ctPerErr ? structuredInputInvalidClass : structuredInputClass}`}
              value={perLevel}
              onChange={(e) => {
                const v = clampScalar(parseNumericInput(e.target.value));
                updateCt({ perLevel: v });
              }}
              onBlur={() => onValidationBlur?.()}
            />
            {ctPerErr && (
              <div className="animate-in fade-in duration-200 max-w-[min(100%,12rem)]">
                <p
                  id={ctPerErr.testId}
                  data-testid={ctPerErr.testId}
                  className="text-xs text-red-700 dark:text-red-400"
                >
                  {ctPerErr.message}
                </p>
              </div>
            )}
          </div>
          <span className={`${structuredTextMuted} text-xs font-medium leading-none`}>/</span>
          <div className="flex flex-col gap-1">
            <input
              type="text"
              inputMode="decimal"
              data-testid="casting-time-level-divisor"
              aria-label="Casting time level divisor"
              className={`w-12 rounded px-2 py-1 text-sm ${structuredInputClass}`}
              value={levelDivisor}
              onChange={(e) => {
                const v = Math.max(1, Math.floor(parseNumericInput(e.target.value)) || 1);
                updateCt({ levelDivisor: v });
              }}
            />
          </div>
          <span className={`${structuredTextMuted} text-xs font-medium leading-none`}>
            /level
          </span>
        </div>
        <select
          data-testid="casting-time-unit"
          aria-label="Casting time unit selector"
          value={ct.unit}
          onChange={(e) => {
            const unit = e.target.value as CastingTimeUnit;
            updateCt(unit === "special" ? { unit } : { unit, rawLegacyValue: undefined });
            onValidationBlur?.();
          }}
          className={structuredSelectClass}
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
            readOnly={ct.unit !== "special"}
            data-testid="casting-time-raw-legacy"
            aria-label="Casting time raw legacy value"
            placeholder="Original text"
            value={ct.rawLegacyValue ?? ""}
            onChange={(e) => updateCt({ rawLegacyValue: e.target.value || undefined })}
            className={`flex-1 min-w-[120px] ${structuredInputClass}`}
          />
        )}
      </div>
      <div
        className={structuredPreviewRowClass}
        data-testid="structured-field-preview-row"
      >
        <output
          className={structuredPreviewOutputClass}
          data-testid="casting-time-text-preview"
          aria-label="Computed casting time text"
        >
          {castingTimeTextPreview || "—"}
        </output>
      </div>
    </div>
  );
}
