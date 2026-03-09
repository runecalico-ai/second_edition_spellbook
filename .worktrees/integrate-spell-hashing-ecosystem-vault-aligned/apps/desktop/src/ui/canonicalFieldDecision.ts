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
  // Spec: loose equality covers both undefined (key absent) and null (key present with null value)
  if (canonicalRaw[key] == null) {
    return { suppressExpandParse: false };
  }

  const rawValue = canonicalRaw[key];
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
