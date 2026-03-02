interface WarningBannerProps {
  /** Field names that failed to parse, e.g. ["Range", "Duration"] */
  fields: string[];
}

/**
 * Non-dismissible warning banner shown when one or more fields fell back to
 * kind="special" after a failed parse. Dismissed per-field on user edit or
 * after a successful save.
 */
export function WarningBanner({ fields }: WarningBannerProps) {
  if (fields.length === 0) return null;
  const fieldList = fields.join(" and ");
  return (
    <div
      role="alert"
      className="rounded border border-amber-600/50 bg-amber-600/10 px-3 py-2 text-sm text-amber-200"
      data-testid="spell-editor-special-fallback-banner"
    >
      {fieldList} could not be fully parsed; original text preserved.
    </div>
  );
}
