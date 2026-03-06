import { useState } from "react";
import { abbreviateHash } from "../../types/import-types";
import type {
    HashImportConflict,
    HashConflictResolution,
} from "../../types/import-types";

interface Props {
    conflict: HashImportConflict;
    /** 0-based index of the current conflict being displayed */
    conflictIndex: number;
    totalConflicts: number;
    onResolve: (resolution: HashConflictResolution, applyToAll: boolean) => void;
}

export default function SpellConflictDiffDialog({
    conflict,
    conflictIndex,
    totalConflicts,
    onResolve,
}: Props) {
    const [applyToAll, setApplyToAll] = useState(false);

    const resolve = (action: HashConflictResolution["action"]) => {
        onResolve(
            {
                existingId: conflict.existingId,
                incomingContentHash: conflict.incomingContentHash,
                action,
            },
            applyToAll,
        );
    };

    return (
        <div className="border border-neutral-800 rounded-lg bg-neutral-900/50 p-4 space-y-4">
            {/* Header: progress + spell name */}
            <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-neutral-200">
                    {conflict.existingName}
                </div>
                <span
                    data-testid="conflict-progress"
                    className="px-2 py-0.5 text-xs rounded-full bg-amber-900/40 border border-amber-700 text-amber-300 font-mono"
                >
                    Conflict {conflictIndex + 1} of {totalConflicts}
                </span>
            </div>

            {/* Side-by-side hash diff */}
            <div className="grid grid-cols-2 gap-3">
                {/* Existing column */}
                <div className="border border-neutral-700 rounded bg-neutral-900 p-3 space-y-1">
                    <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">
                        Existing
                    </div>
                    <div className="text-sm text-neutral-200 font-medium">{conflict.existingName}</div>
                    {conflict.existingContentHash ? (
                        <div
                            className="font-mono text-xs text-neutral-400 break-all"
                            title={conflict.existingContentHash}
                        >
                            {abbreviateHash(conflict.existingContentHash)}
                        </div>
                    ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] rounded bg-neutral-700 text-neutral-400">
                            Not yet migrated
                        </span>
                    )}
                </div>

                {/* Incoming column */}
                <div className="border border-amber-800/60 rounded bg-amber-950/20 p-3 space-y-1">
                    <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide">
                        Incoming
                    </div>
                    <div className="text-sm text-neutral-200 font-medium">{conflict.incomingName}</div>
                    <div
                        className="font-mono text-xs text-amber-300 break-all"
                        title={conflict.incomingContentHash}
                    >
                        {abbreviateHash(conflict.incomingContentHash)}
                    </div>
                </div>
            </div>

            <p className="text-xs text-neutral-500">
                Same name · Different content hash — choose how to resolve
            </p>

            {/* Apply to All toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-neutral-300">
                <input
                    type="checkbox"
                    data-testid="toggle-apply-to-all"
                    checked={applyToAll}
                    onChange={(e) => setApplyToAll(e.target.checked)}
                    className="rounded border-neutral-700 bg-neutral-800 text-amber-500 focus:ring-amber-500"
                />
                Apply this choice to all remaining conflicts
            </label>

            {/* Resolution buttons */}
            <div className="flex flex-wrap gap-2 pt-1">
                <button
                    type="button"
                    data-testid="btn-keep-existing-json"
                    onClick={() => resolve("keep_existing")}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-all active:scale-95"
                >
                    Keep Existing
                </button>
                <button
                    type="button"
                    data-testid="btn-replace-with-new"
                    onClick={() => resolve("replace_with_new")}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all active:scale-95"
                >
                    Replace with New
                </button>
                <button
                    type="button"
                    data-testid="btn-keep-both"
                    onClick={() => resolve("keep_both")}
                    className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20 transition-all active:scale-95"
                >
                    Keep Both
                </button>
            </div>
        </div>
    );
}
