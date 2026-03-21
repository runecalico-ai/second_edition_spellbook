import {
  VALIDATION,
  clampScalar,
  isAboveAdvisoryCap,
  parseNumericInput,
} from "../../../lib/validation";
import type { SpellScalar } from "../../../types/spell";

export interface ScalarFieldValidationError {
  testId: string;
  message: string;
}

const selectSurfaceClass =
  "bg-white dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100";

const inputSurfaceClass =
  "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100";

const inputBorderNeutral = "border-neutral-300 dark:border-neutral-700";
const inputBorderInvalid = "border-red-400 dark:border-red-600";
const inputBorderAdvisory = "border-amber-400 dark:border-amber-600";

interface ScalarInputProps {
  value: SpellScalar;
  onChange: (s: SpellScalar) => void;
  "data-testid"?: string;
  /** Override testid for the value input (e.g. "range-base-value", "duration-base-value"). */
  baseValueTestId?: string;
  /** Override testid for the per-level input (e.g. "range-per-level", "duration-per-level"). */
  perLevelTestId?: string;
  /** Spell editor: mark scalar validation fields visible (blur / mode change). */
  onFieldBlur?: () => void;
  /** Inline validation for fixed mode (Chunk 2 / Task 3). */
  fixedFieldError?: ScalarFieldValidationError | null;
  /** Inline validation for per-level mode (Chunk 2 / Task 3). */
  perLevelFieldError?: ScalarFieldValidationError | null;
}

const DEFAULT_SCALAR: SpellScalar = { mode: "fixed", value: 0 };

export function ScalarInput({
  value,
  onChange,
  "data-testid": testId = "scalar-input",
  baseValueTestId = "range-base-value",
  perLevelTestId = "range-per-level",
  onFieldBlur,
  fixedFieldError,
  perLevelFieldError,
}: ScalarInputProps) {
  const mode = value.mode ?? "fixed";
  const numValue = mode === "fixed" ? (value.value ?? 0) : (value.value ?? 0);
  const perLevel = value.perLevel ?? value.per_level ?? 0;

  const activeError = mode === "fixed" ? fixedFieldError : perLevelFieldError;
  const activeInputId = mode === "fixed" ? baseValueTestId : perLevelTestId;
  const advisory = isAboveAdvisoryCap(mode === "fixed" ? numValue : perLevel);

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
    onFieldBlur?.();
  };

  const effectiveValue = mode === "fixed" ? numValue : perLevel;

  const numberBorderClass = activeError
    ? inputBorderInvalid
    : advisory
      ? inputBorderAdvisory
      : inputBorderNeutral;

  return (
    <div className="flex flex-col gap-1" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2">
        <select
          data-testid={`${testId}-mode`}
          aria-label="Scalar mode"
          value={mode}
          onChange={(e) => handleModeChange(e.target.value as "fixed" | "per_level")}
          className={`rounded border px-2 py-1 text-sm ${selectSurfaceClass}`}
        >
          <option value="fixed">Fixed</option>
          <option value="per_level">Per level</option>
        </select>
        <input
          type="text"
          inputMode="decimal"
          id={activeInputId}
          data-testid={activeInputId}
          aria-label={mode === "fixed" ? "Base value" : "Per level"}
          aria-invalid={activeError ? "true" : undefined}
          aria-describedby={activeError ? activeError.testId : undefined}
          value={effectiveValue}
          onChange={(e) =>
            mode === "fixed"
              ? handleValueChange(e.target.value)
              : handlePerLevelChange(e.target.value)
          }
          onBlur={() => onFieldBlur?.()}
          className={`w-20 rounded border px-2 py-1 text-sm ${inputSurfaceClass} ${numberBorderClass}`}
        />
        {advisory && (
          <p
            className="text-[10px] font-medium text-amber-700 dark:text-amber-400"
            data-testid="scalar-advisory-cap-warning"
          >
            Value is above the recommended maximum ({VALIDATION.advisoryCap}). You can still save.
          </p>
        )}
      </div>
      {activeError && (
        <div className="animate-in fade-in duration-200">
          <p
            id={activeError.testId}
            data-testid={activeError.testId}
            className="text-xs text-red-700 dark:text-red-400"
          >
            {activeError.message}
          </p>
        </div>
      )}
    </div>
  );
}

export { DEFAULT_SCALAR };
