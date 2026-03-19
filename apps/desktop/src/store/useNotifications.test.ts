import { describe, expect, it } from "vitest";
import { createNotificationsStore, NOTIFICATION_DURATION_BY_KIND } from "./useNotifications";

describe("useNotifications", () => {
  it("enqueues success, warning, and error notifications", () => {
    const store = createNotificationsStore();

    store.getState().pushNotification("success", "Saved spell.");
    store.getState().pushNotification("warning", "Spellbook is read-only.");
    store.getState().pushNotification("error", "Save failed.");

    expect(store.getState().notifications.map((item) => item.kind)).toEqual([
      "success",
      "warning",
      "error",
    ]);
  });

  it("caps the visible list at three items", () => {
    const store = createNotificationsStore();

    store.getState().pushNotification("success", "One");
    store.getState().pushNotification("success", "Two");
    store.getState().pushNotification("success", "Three");
    store.getState().pushNotification("success", "Four");

    expect(store.getState().notifications).toHaveLength(3);
  });

  it("drops the oldest entry when a fourth toast is pushed", () => {
    const store = createNotificationsStore();

    store.getState().pushNotification("success", "One");
    store.getState().pushNotification("warning", "Two");
    store.getState().pushNotification("error", "Three");
    store.getState().pushNotification("success", "Four");

    expect(store.getState().notifications.map((item) => item.message)).toEqual([
      "Two",
      "Three",
      "Four",
    ]);
  });

  it("assigns per-kind durations (success=3000, warning=5000, error=7000)", () => {
    const store = createNotificationsStore();

    store.getState().pushNotification("success", "Saved.");
    store.getState().pushNotification("warning", "Careful.");
    store.getState().pushNotification("error", "Failed.");

    const [success, warning, error] = store.getState().notifications;
    expect(success?.durationMs).toBe(NOTIFICATION_DURATION_BY_KIND.success);
    expect(warning?.durationMs).toBe(NOTIFICATION_DURATION_BY_KIND.warning);
    expect(error?.durationMs).toBe(NOTIFICATION_DURATION_BY_KIND.error);
  });

  it("dismisses a notification by id", () => {
    const store = createNotificationsStore();

    store.getState().pushNotification("success", "Saved.");
    store.getState().pushNotification("warning", "Careful.");

    const [first] = store.getState().notifications;
    store.getState().dismissNotification(first.id);

    expect(store.getState().notifications.map((item) => item.message)).toEqual(["Careful."]);
  });
});