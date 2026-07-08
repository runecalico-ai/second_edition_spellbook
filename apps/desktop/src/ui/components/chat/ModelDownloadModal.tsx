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

  const percent = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close download modal backdrop"
        data-testid={`${testId}-backdrop`}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 border-none p-0 m-0 w-full h-full cursor-default"
        onClick={onCancel}
      />
      <dialog
        open
        aria-labelledby={`${testId}-title`}
        data-testid={testId}
        className="relative z-10 w-full max-w-md rounded-2xl border border-neutral-200/60 dark:border-neutral-700/60 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-md p-6 shadow-2xl animate-in zoom-in-95 duration-200"
      >
        <h2 id={`${testId}-title`} className="text-lg font-semibold mb-2">
          Downloading {modelLabel}
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4" data-testid={`${testId}-bytes`}>
          {formatBytes(bytesDownloaded)} / {formatBytes(totalBytes)} ({percent}%)
        </p>
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          data-testid={`${testId}-progress-bar`}
          className="h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden mb-4"
        >
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <button
          type="button"
          data-testid={`${testId}-cancel-button`}
          className="w-full px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 text-sm"
          onClick={onCancel}
        >
          Cancel Download
        </button>
      </dialog>
    </div>
  );
}
