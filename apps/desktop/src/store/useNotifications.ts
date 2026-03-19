import { create } from "zustand";

export type NotificationKind = "success" | "warning" | "error";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  message: string;
  durationMs: number;
  createdAtMs: number;
}

interface NotificationsState {
  notifications: NotificationItem[];
  pushNotification: (kind: NotificationKind, message: string) => void;
  dismissNotification: (id: string) => void;
}

export const MAX_VISIBLE_NOTIFICATIONS = 3;

export const NOTIFICATION_DURATION_BY_KIND: Record<NotificationKind, number> = {
  success: 3000,
  warning: 5000,
  error: 7000,
};

function createNotificationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createNotificationsStore() {
  return create<NotificationsState>((set) => ({
    notifications: [],
    pushNotification: (kind, message) => {
      const createdAtMs = Date.now();
      const nextItem: NotificationItem = {
        id: createNotificationId(),
        kind,
        message,
        durationMs: NOTIFICATION_DURATION_BY_KIND[kind],
        createdAtMs,
      };

      set((state) => ({
        notifications: [...state.notifications, nextItem].slice(-MAX_VISIBLE_NOTIFICATIONS),
      }));
    },
    dismissNotification: (id) => {
      set((state) => ({
        notifications: state.notifications.filter((item) => item.id !== id),
      }));
    },
  }));
}

export const useNotifications = createNotificationsStore();