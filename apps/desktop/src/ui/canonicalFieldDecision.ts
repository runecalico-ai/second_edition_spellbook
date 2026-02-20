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
  // Spec: "null field: Treat as missing for hybrid loading (parse legacy string if available)"
  if (rawValue === null) {
    return { suppressExpandParse: false };
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
