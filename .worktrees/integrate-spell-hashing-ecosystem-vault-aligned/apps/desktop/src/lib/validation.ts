/**
 * Shared input validation for structured spell fields.
 * - Clamp-on-change for numeric bounds (per frontend-standards).
 * - Advisory cap 999999 (show warning, allow value).
 * - Unit enum validation.
 */

const ADVISORY_CAP = 999999;
const MIN_SCALAR = 0;

/**
 * Clamp a numeric value to the minimum only (>= 0).
 * Advisory cap 999999 is NOT enforced here; use isAboveAdvisoryCap() to show a warning (no clamp per spec).
 */
export function clampScalar(value: number): number {
  if (Number.isNaN(value)) return MIN_SCALAR;
  if (value < MIN_SCALAR) return MIN_SCALAR;
  return value;
}

/**
 * Parse locale-aware numeric input (handles "." and "," as decimal separator).
 */
export function parseNumericInput(input: string): number {
  const normalized = input.replace(",", ".");
  const value = Number.parseFloat(normalized);
  return Number.isNaN(value) ? 0 : value;
}

/**
 * Whether the value is above the advisory cap (show warning, do not block).
 */
export function isAboveAdvisoryCap(value: number): boolean {
  return !Number.isNaN(value) && value > ADVISORY_CAP;
}

/**
 * Format a validation error message for display.
 */
export function formatError(field: string, message: string): string {
  return `${field}: ${message}`;
}

export const VALIDATION = {
  baseValueMin: 0,
  perLevelMin: 0,
  quantityMin: 1,
  quantityMinDecimal: 1.0,
  advisoryCap: ADVISORY_CAP,
} as const;
