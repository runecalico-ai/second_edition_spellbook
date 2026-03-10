import type { BulkConflictAction } from "../../types/import-types";

interface Props {
  /** Number of conflicts — component should only be rendered when this is >= 10 */
  conflictCount: number;
  disabled?: boolean;
  onAction: (action: BulkConflictAction) => void;
}

export default function BulkConflictSummaryDialog({
  conflictCount,
  disabled = false,
  onAction,
}: Props) {
  return (
    <div className="border border-amber-800/50 rounded-lg bg-amber-950/20 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden="true">
          ⚠️
        </span>
        <div>
          <h3 className="text-base font-bold text-amber-200">
            Found {conflictCount} conflicts. Choose default action:
          </h3>
          <p className="text-sm text-neutral-400 mt-1">
            This summary appears because there are 10 or more conflicts. You can still review each
            one individually.
          </p>
        </div>
      </div>

      {/* Action buttons — stacked, full-width */}
      <div className="space-y-2">
        <button
          type="button"
          data-testid="btn-bulk-skip-all"
          disabled={disabled}
          onClick={() => onAction("skip_all")}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-all active:scale-95 text-left"
        >
          <span className="font-semibold">Skip All</span>
          <span className="ml-2 text-xs text-neutral-500">
            — keep all existing spells unchanged
          </span>
        </button>

        <button
          type="button"
          data-testid="btn-bulk-replace-all"
          disabled={disabled}
          onClick={() => onAction("replace_all")}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all active:scale-95 text-left"
        >
          <span className="font-semibold">Replace All</span>
          <span className="ml-2 text-xs text-blue-200">
            — overwrite existing with incoming versions
          </span>
        </button>

        <button
          type="button"
          data-testid="btn-bulk-keep-all"
          disabled={disabled}
          onClick={() => onAction("keep_all")}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20 transition-all active:scale-95 text-left"
        >
          <span className="font-semibold">Keep All (Add Suffix)</span>
          <span className="ml-2 text-xs text-amber-200">— save incoming as "Name (1)", etc.</span>
        </button>

        <button
          type="button"
          data-testid="btn-bulk-review-each"
          disabled={disabled}
          onClick={() => onAction("review_each")}
          className="w-full px-4 py-2.5 rounded-lg text-sm font-semibold border border-neutral-600 bg-transparent hover:bg-neutral-800 text-neutral-300 transition-all active:scale-95 text-left"
        >
          <span className="font-semibold">Review Each</span>
          <span className="ml-2 text-xs text-neutral-500">— resolve one conflict at a time</span>
        </button>
      </div>
    </div>
  );
}
