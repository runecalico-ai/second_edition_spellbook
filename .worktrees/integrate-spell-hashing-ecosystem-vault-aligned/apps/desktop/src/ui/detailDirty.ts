import type { SpellDetail } from "../types/spell";

/** Canon-first detail field keys; only one may be expanded at a time. */
export type DetailFieldKey =
  | "range"
  | "components"
  | "duration"
  | "castingTime"
  | "area"
  | "savingThrow"
  | "damage"
  | "magicResistance"
  | "materialComponents";

export const DETAIL_FIELD_ORDER: DetailFieldKey[] = [
  "range",
  "components",
  "duration",
  "castingTime",
  "area",
  "savingThrow",
  "damage",
  "magicResistance",
  "materialComponents",
];

export const createDefaultDetailDirty = (): Record<DetailFieldKey, boolean> => ({
  range: false,
  components: false,
  duration: false,
  castingTime: false,
  area: false,
  savingThrow: false,
  damage: false,
  magicResistance: false,
  materialComponents: false,
});

/**
 * Returns next detailDirty state after save has serialized formOverrides.
 * Only detail fields are cleared, and components/materialComponents are cleared together.
 */
export const clearDetailDirtyForFormOverrides = (
  prev: Record<DetailFieldKey, boolean>,
  formOverrides: Partial<SpellDetail>,
): Record<DetailFieldKey, boolean> => {
  const keysToClear = new Set(
    Object.keys(formOverrides).filter((k): k is DetailFieldKey =>
      DETAIL_FIELD_ORDER.includes(k as DetailFieldKey),
    ),
  );

  if (keysToClear.has("components") || keysToClear.has("materialComponents")) {
    keysToClear.add("components");
    keysToClear.add("materialComponents");
  }

  const next = { ...prev };
  for (const k of keysToClear) {
    next[k] = false;
  }
  return next;
};
