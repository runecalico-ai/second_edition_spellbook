export interface CanonicalFieldDecision<T> {
  suppressExpandParse: boolean;
  structuredValue?: T;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function decideCanonicalField<T>(
  canonicalRaw: Record<string, unknown>,
  key: string,
  normalize: (value: Record<string, unknown>) => T,
  validate: (value: T) => boolean,
): CanonicalFieldDecision<T> {
  if (!Object.prototype.hasOwnProperty.call(canonicalRaw, key)) {
    return { suppressExpandParse: false };
  }

  const rawValue = canonicalRaw[key];
  if (rawValue === null) {
    return { suppressExpandParse: true };
  }

  if (!isObjectRecord(rawValue)) {
    return { suppressExpandParse: false };
  }

  const normalizedValue = normalize(rawValue);
  if (!validate(normalizedValue)) {
    return { suppressExpandParse: false };
  }

  return {
    suppressExpandParse: true,
    structuredValue: normalizedValue,
  };
}
