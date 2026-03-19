import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useNotifications } from "../../store/useNotifications";
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
  });

  it("auto-dismisses notifications using their configured durations", () => {
    vi.useFakeTimers();
    const dismissNotification = vi.fn();

    const cleanup = scheduleNotificationDismissals(
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

    cleanup();
    vi.useRealTimers();
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

    let cleanup = scheduleNotificationDismissals([first], dismissNotification);
    vi.advanceTimersByTime(1000);
    cleanup();

    cleanup = scheduleNotificationDismissals(
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

    cleanup();
    vi.useRealTimers();
  });
});