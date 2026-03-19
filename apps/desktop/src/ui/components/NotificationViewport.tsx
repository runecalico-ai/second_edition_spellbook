import { useEffect } from "react";
import type { NotificationItem } from "../../store/useNotifications";
import { useNotifications } from "../../store/useNotifications";

const toastClassNames: Record<NotificationItem["kind"], string> = {
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/80 dark:bg-emerald-950/80 dark:text-emerald-100",
  warning:
    "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/80 dark:bg-amber-950/80 dark:text-amber-100",
  error:
    "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/80 dark:bg-rose-950/80 dark:text-rose-100",
};

export function scheduleNotificationDismissals(
  notifications: NotificationItem[],
  dismissNotification: (id: string) => void,
) {
  const timers = notifications.map((notification) =>
    globalThis.setTimeout(() => {
      dismissNotification(notification.id);
    }, Math.max(0, notification.createdAtMs + notification.durationMs - Date.now())),
  );

  return () => {
    for (const timer of timers) {
      globalThis.clearTimeout(timer);
    }
  };
}

export function NotificationViewportContent({
  notifications,
  dismissNotification,
}: {
  notifications: NotificationItem[];
  dismissNotification: (id: string) => void;
}) {
  const viewport = (
    <output
      data-testid="notification-viewport"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end p-4"
    >
      <div className="flex max-w-sm flex-col-reverse items-stretch gap-3">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            data-testid={`toast-notification-${notification.kind}`}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${toastClassNames[notification.kind]}`}
          >
            <p className="flex-1 text-sm font-medium">{notification.message}</p>
            <button
              type="button"
              aria-label="Dismiss notification"
              className="rounded-md border border-current/20 px-2 py-1 text-xs font-semibold"
              onClick={() => dismissNotification(notification.id)}
            >
              Close
            </button>
          </div>
        ))}
      </div>
    </output>
  );

  return viewport;
}

export function NotificationViewport() {
  const notifications = useNotifications((state) => state.notifications);
  const dismissNotification = useNotifications((state) => state.dismissNotification);

  useEffect(() => {
    return scheduleNotificationDismissals(notifications, dismissNotification);
  }, [dismissNotification, notifications]);

  return (
    <NotificationViewportContent
      notifications={notifications}
      dismissNotification={dismissNotification}
    />
  );
}

export default NotificationViewport;