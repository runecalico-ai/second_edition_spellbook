import { useEffect, useRef } from "react";
import { formatBytes } from "./chatUtils";

interface ModelDownloadModalProps {
  isOpen: boolean;
  modelLabel: string;
  bytesDownloaded: number;
  totalBytes: number;
  onCancel: () => void;
  testId?: string;
}

export function ModelDownloadModal({
  isOpen,
  modelLabel,
  bytesDownloaded,
  totalBytes,
  onCancel,
  testId = "model-download-modal",
}: ModelDownloadModalProps) {
  if (!isOpen) return null;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) {
      dialog.showModal();
    }
    cancelButtonRef.current?.focus();

    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  const percent = totalBytes > 0 ? Math.min(100, Math.max(0, Math.round((bytesDownloaded / totalBytes) * 100))) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close download modal"
        data-testid={`${testId}-backdrop`}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 border-none p-0 m-0 w-full h-full cursor-default"
        onClick={onCancel}
      />
      <dialog
        ref={dialogRef}
        aria-labelledby={`${testId}-title`}
        data-testid={testId}
        onCancel={(event) => {
          event.preventDefault();
          onCancel();
        }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-neutral-200/60 dark:border-neutral-700/60 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md p-6 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <h2 id={`${testId}-title`} className="mb-2 text-lg font-semibold">
          Downloading {modelLabel}
        </h2>
        <p
          className="mb-4 text-sm text-neutral-600 dark:text-neutral-400"
          data-testid={`${testId}-bytes`}
          role="status"
          aria-live="polite"
        >
          {formatBytes(bytesDownloaded)} / {formatBytes(totalBytes)} ({percent}%)
        </p>
        <div
          role="progressbar"
          aria-label={`Downloading ${modelLabel}`}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          data-testid={`${testId}-progress-bar`}
          className="h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden mb-4"
        >
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${percent}%` }}
            data-testid={`${testId}-progress-fill`}
          />
        </div>
        <button
          ref={cancelButtonRef}
          type="button"
          data-testid={`${testId}-cancel-button`}
          className="w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-neutral-600"
          onClick={onCancel}
        >
          Cancel Download
        </button>
      </dialog>
    </div>
  );
}
