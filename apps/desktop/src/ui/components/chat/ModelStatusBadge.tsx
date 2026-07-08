import clsx from "classnames";

const LABELS: Record<string, string> = {
  notProvisioned: "Not installed",
  downloading: "Downloading",
  initializing: "Initializing",
  ready: "Ready",
  loaded: "Loaded",
  error: "Error",
};

const COLORS: Record<string, string> = {
  notProvisioned: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  downloading: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  initializing: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  ready: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  loaded: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  error: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
};

interface ModelStatusBadgeProps {
  label: string;
  status: string;
  testId: string;
}

export function ModelStatusBadge({ label, status, testId }: ModelStatusBadgeProps) {
  const text = LABELS[status] ?? status;
  return (
    <span
      data-testid={testId}
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        COLORS[status] ?? COLORS.notProvisioned,
      )}
      title={`${label}: ${text}`}
    >
      <span className="font-semibold">{label}</span>
      <span aria-hidden="true">·</span>
      <span>{text}</span>
    </span>
  );
}
