import clsx from "classnames";
import { useModal } from "../../store/useModal";

export default function Modal() {
  const { isOpen, type, title, message, buttons, dismissible = true, hideModal } = useModal();

  if (!isOpen) return null;

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close modal"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 border-none p-0 m-0 w-full h-full cursor-default"
        onClick={() => {
          if (dismissible) {
            hideModal();
          }
        }}
      />

      {/* Modal Container */}
      <dialog
        open
        aria-modal="true"
        aria-labelledby="modal-title"
        className={clsx(
          "relative w-full max-w-md overflow-hidden rounded-xl border bg-neutral-900 shadow-2xl animate-in zoom-in-95 duration-200",
          typeStyles[type],
        )}
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

          <div className="text-neutral-300 space-y-2">
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

          <div className="mt-8 flex justify-end gap-3">
            {buttons.map((btn, i) => (
              <button
                key={`${i}-${btn.label}`}
                type="button"
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
        </div>
      </dialog>
    </div>
  );
}
