import clsx from "classnames";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { useModal } from "../../store/useModal";
import type { ModalButton, ModalType } from "../../store/useModal";

function buttonTestId(label: string): string {
  return `modal-button-${label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

interface ModalShellProps {
  isOpen: boolean;
  type: ModalType;
  title: string;
  message: string | string[];
  buttons: Array<ModalButton & { testId?: string }>;
  customContent?: ReactNode;
  dismissible?: boolean;
  onRequestClose: () => void;
}

export function ModalShell({
  isOpen,
  type,
  title,
  message,
  buttons,
  customContent,
  dismissible = true,
  onRequestClose,
}: ModalShellProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (isOpen) {
      triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") {
          dialog.showModal();
        }
      }
      return;
    }

    if (dialog.open) {
      if (typeof dialog.close === "function") {
        dialog.close();
      }
    }

    if (!triggerRef.current) {
      return;
    }

    if (triggerRef.current.isConnected) {
      triggerRef.current.focus();
    } else {
      if (!document.body.hasAttribute("tabindex")) {
        document.body.tabIndex = -1;
      }
      document.body.focus();
    }
    triggerRef.current = null;
  }, [isOpen]);

  const typeStyles = {
    info: "border-blue-500 bg-blue-500/10 text-blue-400",
    success: "border-green-500 bg-green-500/10 text-green-400",
    warning: "border-yellow-500 bg-yellow-500/10 text-yellow-400",
    error: "border-red-500 bg-red-500/10 text-red-400",
  };

  const buttonStyles = {
    primary: "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20",
    secondary: "bg-neutral-800 hover:bg-neutral-700 text-neutral-300",
    danger: "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/20",
  };

  return (
    <dialog
      ref={dialogRef}
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby={descriptionId}
      data-testid="modal-dialog"
      className="fixed inset-0 z-[100] m-0 flex h-full w-full max-h-none max-w-none items-center justify-center overflow-y-auto border-none bg-transparent p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && dismissible) {
          onRequestClose();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) {
          onRequestClose();
        }
      }}
    >
      <div
        data-testid="modal-content"
        className={clsx(
          "relative my-auto w-full max-w-md overflow-y-auto rounded-xl border bg-neutral-900 shadow-2xl animate-in zoom-in-95 duration-200",
          "max-h-[calc(100vh-2rem)] overflow-x-hidden",
          typeStyles[type],
        )}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Glow effect */}
        <div
          className={clsx(
            "absolute -top-12 -left-12 h-32 w-32 rounded-full blur-3xl opacity-20",
            type === "error"
              ? "bg-red-500"
              : type === "warning"
                ? "bg-yellow-500"
                : type === "success"
                  ? "bg-green-500"
                  : "bg-blue-500",
          )}
          aria-hidden="true"
        />

        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className={clsx("p-2 rounded-lg border", typeStyles[type])}>
              {type === "error" && (
                <svg
                  role="img"
                  aria-label="Error icon"
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              )}
              {type === "warning" && (
                <svg
                  role="img"
                  aria-label="Warning icon"
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
              {type === "success" && (
                <svg
                  role="img"
                  aria-label="Success icon"
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
              {type === "info" && (
                <svg
                  role="img"
                  aria-label="Info icon"
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              )}
            </div>
            <h2 id="modal-title" className="text-xl font-bold text-white">
              {title}
            </h2>
          </div>

          {customContent ? (
            <div id={descriptionId} className="text-neutral-300">
              {customContent}
            </div>
          ) : (
            <div id={descriptionId} className="text-neutral-300 space-y-2">
              {Array.isArray(message) ? (
                <ul className="list-disc list-inside space-y-1">
                  {message.map((m, i) => (
                    <li key={`${i}-${m.substring(0, 20)}`}>{m}</li>
                  ))}
                </ul>
              ) : (
                <p className="whitespace-pre-wrap">{message}</p>
              )}
            </div>
          )}

          {buttons.length > 0 && (
            <div className="mt-8 flex justify-end gap-3">
              {buttons.map((btn, i) => (
                <button
                  key={`${i}-${btn.label}`}
                  type="button"
                  data-testid={btn.testId ?? buttonTestId(btn.label)}
                  onClick={() => btn.onClick?.()}
                  className={clsx(
                    "px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-95",
                    buttonStyles[btn.variant || "secondary"],
                  )}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}

export default function Modal() {
  const {
    isOpen,
    type,
    title,
    message,
    buttons,
    customContent,
    dismissible = true,
    hideModal,
  } = useModal();

  return (
    <ModalShell
      isOpen={isOpen}
      type={type}
      title={title}
      message={message}
      buttons={buttons}
      customContent={customContent}
      dismissible={dismissible}
      onRequestClose={hideModal}
    />
  );
}
