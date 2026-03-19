// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { useNotifications, NOTIFICATION_DURATION_BY_KIND } from "../../store/useNotifications";
import {
  NotificationViewport,
  NotificationViewportContent,
  scheduleNotificationDismissals,
} from "./NotificationViewport";

function resetNotifications() {
  useNotifications.setState({ notifications: [] });
}

describe("NotificationViewport", () => {
  beforeEach(resetNotifications);
  afterEach(cleanup);
  afterEach(() => vi.useRealTimers());

  it("renders a polite live-region viewport that stacks upward", () => {
    const html = renderToStaticMarkup(<NotificationViewport />);

    expect(html).toContain("<output");
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("flex-col-reverse");
  });

  it("renders toast test ids and close buttons", () => {
    const html = renderToStaticMarkup(
      <NotificationViewportContent
        notifications={[
          {
            id: "success-1",
            kind: "success",
            message: "Saved.",
            durationMs: 3000,
            createdAtMs: 0,
          },
          {
            id: "warning-1",
            kind: "warning",
            message: "Careful.",
            durationMs: 3000,
            createdAtMs: 0,
          },
          {
            id: "error-1",
            kind: "error",
            message: "Failed.",
            durationMs: 3000,
            createdAtMs: 0,
          },
        ]}
        dismissNotification={() => {}}
      />,
    );

    expect(html).toContain('data-testid="toast-notification-success"');
    expect(html).toContain('data-testid="toast-notification-warning"');
    expect(html).toContain('data-testid="toast-notification-error"');
    expect(html).toContain('aria-label="Dismiss notification"');
    expect(html).toContain("×");
  });

  it("removes a toast when its dismiss control is activated", () => {
    const dismissNotification = vi.fn();
    const { getAllByTestId } = render(
      <NotificationViewportContent
        notifications={[
          {
            id: "toast-dismiss-1",
            kind: "success",
            message: "Saved.",
            durationMs: 3000,
            createdAtMs: 0,
          },
        ]}
        dismissNotification={dismissNotification}
      />,
    );

    fireEvent.click(getAllByTestId("toast-dismiss-button")[0]);

    expect(dismissNotification).toHaveBeenCalledWith("toast-dismiss-1");
  });

  it("clears the store when dismiss is clicked on the live viewport", () => {
    useNotifications.getState().pushNotification("success", "Saved.");
    expect(useNotifications.getState().notifications).toHaveLength(1);

    const { getByTestId } = render(<NotificationViewport />);
    fireEvent.click(getByTestId("toast-dismiss-button"));

    expect(useNotifications.getState().notifications).toHaveLength(0);
  });

  it("auto-dismisses notifications using their configured durations", () => {
    vi.useFakeTimers();
    const dismissNotification = vi.fn();

    const cancelTimers = scheduleNotificationDismissals(
      [
        {
          id: "toast-1",
          kind: "success",
          message: "Saved.",
          durationMs: 1200,
          createdAtMs: Date.now(),
        },
      ],
      dismissNotification,
    );

    vi.advanceTimersByTime(1199);
    expect(dismissNotification).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(dismissNotification).toHaveBeenCalledWith("toast-1");

    cancelTimers();
  });

  it("preserves remaining time when the list changes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-18T00:00:00.000Z"));
    const dismissNotification = vi.fn();

    const first = {
      id: "toast-1",
      kind: "success" as const,
      message: "Saved.",
      durationMs: 1200,
      createdAtMs: Date.now(),
    };

    let cancelTimers = scheduleNotificationDismissals([first], dismissNotification);
    vi.advanceTimersByTime(1000);
    cancelTimers();

    cancelTimers = scheduleNotificationDismissals(
      [
        first,
        {
          id: "toast-2",
          kind: "warning",
          message: "Careful.",
          durationMs: 1200,
          createdAtMs: Date.now(),
        },
      ],
      dismissNotification,
    );

    vi.advanceTimersByTime(199);
    expect(dismissNotification).not.toHaveBeenCalledWith("toast-1");

    vi.advanceTimersByTime(1);
    expect(dismissNotification).toHaveBeenCalledWith("toast-1");

    cancelTimers();
  });

  it("does not fire dismiss timer after unmount", () => {
    vi.useFakeTimers();

    useNotifications.getState().pushNotification("success", "Saved.");

    const { unmount } = render(<NotificationViewport />);

    unmount();

    vi.advanceTimersByTime(NOTIFICATION_DURATION_BY_KIND.success);

    const { notifications } = useNotifications.getState();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].kind).toBe("success");
  });
});