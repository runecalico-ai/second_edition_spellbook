import type { SpellScalar } from "../../../types/spell";
import { clampScalar, parseNumericInput, isAboveAdvisoryCap, VALIDATION } from "../../../lib/validation";

interface ScalarInputProps {
  value: SpellScalar;
  onChange: (s: SpellScalar) => void;
  "data-testid"?: string;
  /** Override testid for the value input (e.g. "range-base-value", "duration-base-value"). */
  baseValueTestId?: string;
  /** Override testid for the per-level input (e.g. "range-per-level", "duration-per-level"). */
  perLevelTestId?: string;
}

const DEFAULT_SCALAR: SpellScalar = { mode: "fixed", value: 0 };

export function ScalarInput({
  value,
  onChange,
  "data-testid": testId = "scalar-input",
  baseValueTestId = "range-base-value",
  perLevelTestId = "range-per-level",
}: ScalarInputProps) {
  const mode = value.mode ?? "fixed";
  const numValue = mode === "fixed" ? (value.value ?? 0) : value.value ?? 0;
  const perLevel = value.perLevel ?? value.per_level ?? 0;

  const handleValueChange = (raw: string) => {
    const parsed = parseNumericInput(raw);
    const clamped = clampScalar(parsed);
    onChange({
      ...value,
      mode: "fixed",
      value: clamped,
      perLevel: undefined,
      per_level: undefined,
    });
  };

  const handlePerLevelChange = (raw: string) => {
    const parsed = parseNumericInput(raw);
    const clamped = clampScalar(parsed);
    onChange({
      ...value,
      mode: "per_level",
      value: undefined,
      perLevel: clamped,
      per_level: clamped,
    });
  };

  const handleModeChange = (newMode: "fixed" | "per_level") => {
    if (newMode === "fixed") {
      onChange({
        mode: "fixed",
        value: value.value ?? value.perLevel ?? value.per_level ?? 0,
      });
    } else {
      onChange({
        mode: "per_level",
        perLevel: value.perLevel ?? value.per_level ?? 0,
        per_level: value.perLevel ?? value.per_level ?? 0,
      });
    }
  };

  const effectiveValue = mode === "fixed" ? numValue : perLevel;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid={testId}>
      <select
        data-testid={`${testId}-mode`}
        aria-label="Scalar mode"
        value={mode}
        onChange={(e) =>
          handleModeChange(e.target.value as "fixed" | "per_level")
        }
        className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-neutral-100"
      >
        <option value="fixed">Fixed</option>
        <option value="per_level">Per level</option>
      </select>
      <input
        type="text"
        inputMode="decimal"
        data-testid={mode === "fixed" ? baseValueTestId : perLevelTestId}
        aria-label={mode === "fixed" ? "Base value" : "Per level"}
        value={effectiveValue}
        onChange={(e) =>
          mode === "fixed"
            ? handleValueChange(e.target.value)
            : handlePerLevelChange(e.target.value)
        }
        className={`w-20 bg-neutral-900 border ${isAboveAdvisoryCap(effectiveValue) ? "border-yellow-500" : "border-neutral-700"
          } rounded px-2 py-1 text-sm text-neutral-100`}
      />
      {isAboveAdvisoryCap(effectiveValue) && (
        <p className="text-[10px] text-yellow-500 font-medium" data-testid="scalar-advisory-cap-warning">
          Value is above the recommended maximum ({VALIDATION.advisoryCap}). You can still save.
        </p>
      )}
    </div>
  );
}

export { DEFAULT_SCALAR };
