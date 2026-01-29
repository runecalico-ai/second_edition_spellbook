import { useState } from "react";
import clsx from "classnames";

export type PrintFormat = "html" | "md";
export type PrintLayout = "compact" | "full";

interface PrintOptionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (options: PrintOptions) => void;
  mode: "character_sheet" | "spellbook_pack";
  title: string;
}

export interface PrintOptions {
  format: PrintFormat;
  layout?: PrintLayout; // Only for spellbook packs
  includeCom?: boolean;
  includeNotes?: boolean;
}

export default function PrintOptionsDialog({
  isOpen,
  onClose,
  onConfirm,
  mode,
  title,
}: PrintOptionsDialogProps) {
  const [format, setFormat] = useState<PrintFormat>("html");
  const [layout, setLayout] = useState<PrintLayout>("compact");
  const [includeCom, setIncludeCom] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(true);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const options: PrintOptions = {
      format,
      includeCom,
      includeNotes,
    };

    if (mode === "spellbook_pack") {
      options.layout = layout;
    }

    onConfirm(options);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close print options dialog"
        data-testid="backdrop-close-button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 border-none p-0 m-0 w-full h-full cursor-default"
        onClick={onClose}
      />

      {/* Dialog Container */}
      <dialog
        open
        aria-modal="true"
        aria-labelledby="print-options-title"
        data-testid="print-options-dialog"
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-blue-500 bg-neutral-900 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        {/* Glow effect */}
        <div
          className="absolute -top-12 -left-12 h-32 w-32 rounded-full bg-blue-500 blur-3xl opacity-20"
          aria-hidden="true"
        />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg border border-blue-500 bg-blue-500/10">
              <svg
                role="img"
                aria-label="Print icon"
                className="w-6 h-6 text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
            </div>
            <h2 id="print-options-title" className="text-xl font-bold text-white">
              {title}
            </h2>
          </div>

          {/* Form */}
          <div className="space-y-4">
            {/* Format Selection */}
            <div>
              <label
                htmlFor="print-format"
                className="block text-sm font-medium text-neutral-300 mb-2"
              >
                Format
              </label>
              <select
                id="print-format"
                data-testid="print-format-select"
                value={format}
                onChange={(e) => setFormat(e.target.value as PrintFormat)}
                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="html">HTML (Print-ready)</option>
                <option value="md">Markdown</option>
              </select>
            </div>

            {/* Layout Selection (Spellbook Pack only) */}
            {mode === "spellbook_pack" && (
              <div>
                <label
                  htmlFor="print-layout"
                  className="block text-sm font-medium text-neutral-300 mb-2"
                >
                  Layout
                </label>
                <select
                  id="print-layout"
                  data-testid="print-layout-select"
                  value={layout}
                  onChange={(e) => setLayout(e.target.value as PrintLayout)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="compact">Compact (spell names only)</option>
                  <option value="full">Full (with stat blocks)</option>
                </select>
              </div>
            )}

            {/* Options */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="include-com-checkbox"
                  checked={includeCom}
                  onChange={(e) => setIncludeCom(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                />
                <span className="text-sm text-neutral-300">Include COM ability</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="include-notes-checkbox"
                  checked={includeNotes}
                  onChange={(e) => setIncludeNotes(e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0"
                />
                <span className="text-sm text-neutral-300">Include notes</span>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 flex justify-end gap-3">
            <button
              type="button"
              data-testid="btn-cancel-print"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-all active:scale-95"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="btn-confirm-print"
              onClick={handleConfirm}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 transition-all active:scale-95"
            >
              Print
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
