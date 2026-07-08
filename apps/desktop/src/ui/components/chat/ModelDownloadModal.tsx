import { useEffect, useLayoutEffect, useRef } from "react";
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!dialog.open && typeof dialog.showModal === "function") {
        dialog.showModal();
      }
      cancelButtonRef.current?.focus();
      return;
    }

    if (dialog.open && typeof dialog.close === "function") {
      dialog.close();
    }
    if (triggerRef.current && triggerRef.current.isConnected) {
      triggerRef.current.focus();
    }
    triggerRef.current = null;
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableSelector =
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog.open) return;
      const nodes = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (!(active instanceof Node) || !dialog.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const percent = totalBytes > 0 ? Math.min(100, Math.max(0, Math.round((bytesDownloaded / totalBytes) * 100))) : 0;

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby={`${testId}-title`}
      aria-describedby={`${testId}-bytes`}
      data-testid={testId}
      className="fixed inset-0 m-0 h-full w-full max-h-none max-w-none items-center justify-center border-none bg-transparent p-4 [&[open]]:flex"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <button
        type="button"
        aria-label="Cancel download"
        data-testid={`${testId}-backdrop`}
        className="absolute inset-0 cursor-default border-none bg-black/60 p-0 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-neutral-200/60 bg-white/90 p-6 shadow-2xl backdrop-blur-md animate-in zoom-in-95 duration-200 dark:border-neutral-700/60 dark:bg-neutral-900/90">
        <h2 id={`${testId}-title`} className="mb-2 text-lg font-semibold">
          Downloading {modelLabel}
        </h2>
        <p
          id={`${testId}-bytes`}
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
      </div>
    </dialog>
  );
}
