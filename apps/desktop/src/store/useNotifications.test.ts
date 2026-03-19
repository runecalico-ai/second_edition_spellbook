import { describe, expect, it } from "vitest";
import { createNotificationsStore } from "./useNotifications";

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

  it("stores a duration per item and defaults it to 3000ms", () => {
    const store = createNotificationsStore();

    store.getState().pushNotification("success", "Saved.");

    expect(store.getState().notifications[0]?.durationMs).toBe(3000);
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