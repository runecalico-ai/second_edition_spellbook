// @vitest-environment jsdom
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockRejectedValue(new Error("tauri not available")),
}));

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useNotifications } from "../store/useNotifications";
import { useTheme } from "../store/useTheme";
import App, {
  createVaultStartupFailureModal,
  createVaultStartupWarningModal,
  getThemeAnnouncement,
} from "./App";

function resetThemeState() {
  useTheme.setState({
    mode: "system",
    resolvedTheme: "light",
  });
}

function resetNotifications() {
  useNotifications.setState({ notifications: [] });
}

function renderAppShell(pathname = "/") {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<div>Library</div>} />
          <Route path="settings" element={<div>Settings</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const standardFocusRingPattern =
  "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900";

describe("createVaultStartupWarningModal", () => {
  beforeEach(() => {
    resetThemeState();
    resetNotifications();
  });

  it("builds an actionable startup warning modal", () => {
    const onOpenVaultMaintenance = vi.fn();
    const onDismiss = vi.fn();

    const modal = createVaultStartupWarningModal(
      {
        checkedCount: 3,
        missingCount: 1,
        reexportedCount: 1,
        repairedCount: 0,
        unrecoverable: [{ contentHash: "deadbeef", reason: "Missing file" }],
        warningCount: 1,
      },
      { onOpenVaultMaintenance, onDismiss },
    );

    expect(modal.title).toBe("Vault Integrity Check");
    expect(modal.type).toBe("warning");
    expect(modal.buttons.map((button) => button.label)).toEqual([
      "Dismiss",
      "Open Vault Maintenance",
    ]);

    modal.buttons[1].onClick?.();
    expect(onOpenVaultMaintenance).toHaveBeenCalledTimes(1);

    modal.buttons[0].onClick?.();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("uses a warning modal when the integrity summary reports warnings", () => {
    const modal = createVaultStartupWarningModal(
      {
        checkedCount: 3,
        missingCount: 0,
        reexportedCount: 0,
        repairedCount: 0,
        unrecoverable: [],
        warningCount: 1,
      },
      {
        onOpenVaultMaintenance: vi.fn(),
        onDismiss: vi.fn(),
      },
    );

    expect(modal.type).toBe("warning");
  });

  it("uses a warning modal when the integrity summary only reports reexports", () => {
    const modal = createVaultStartupWarningModal(
      {
        checkedCount: 3,
        missingCount: 0,
        reexportedCount: 1,
        repairedCount: 0,
        unrecoverable: [],
        warningCount: 0,
      },
      {
        onOpenVaultMaintenance: vi.fn(),
        onDismiss: vi.fn(),
      },
    );

    expect(modal.type).toBe("warning");
  });
});

describe("createVaultStartupFailureModal", () => {
  it("formats unknown errors into readable text", () => {
    const modal = createVaultStartupFailureModal(
      { code: "EFAIL" },
      {
        onOpenVaultMaintenance: vi.fn(),
        onDismiss: vi.fn(),
      },
    );

    expect(modal.message).toEqual(['Vault integrity startup check failed: {"code":"EFAIL"}']);
    expect(modal.type).toBe("warning");
  });
});

describe("App shell", () => {
  beforeEach(() => {
    resetThemeState();
    resetNotifications();
  });

  afterEach(cleanup);

  it("renders the navigation and action controls with the standard focus ring pattern", () => {
    renderAppShell();

    for (const testId of [
      "btn-backup",
      "btn-vault-maintenance",
      "btn-restore",
      "nav-link-library",
      "nav-link-characters",
      "nav-link-import",
      "nav-link-chat",
      "nav-link-export",
      "settings-gear-button",
    ]) {
      expect(screen.getByTestId(testId).className).toContain(standardFocusRingPattern);
    }

    expect(screen.getByTestId("settings-gear-button").getAttribute("aria-label")).toBe("Settings");
    expect(screen.getByTestId("settings-gear-button").getAttribute("href")).toBe("/settings");
    expect(screen.getByTestId("nav-link-library").getAttribute("href")).toBe("/");
  });

  it("mounts a hidden polite live region for theme announcements", () => {
    renderAppShell();

    expect(screen.getByTestId("theme-announcement-live-region").getAttribute("aria-live")).toBe(
      "polite",
    );
    expect(screen.getByTestId("theme-announcement-live-region").textContent).toBe("System mode");
  });

  it("live region contains Dark mode text when store initialises in dark mode", () => {
    // Use render (not renderToStaticMarkup) so Zustand's store subscription
    // is exercised via the real component lifecycle rather than the SSR snapshot path.
    useTheme.setState({ mode: "dark", resolvedTheme: "dark" });

    renderAppShell();

    expect(screen.getByTestId("theme-announcement-live-region").textContent).toBe("Dark mode");
  });

  it("maps theme modes to announcement text", () => {
    expect(getThemeAnnouncement("light")).toBe("Light mode");
    expect(getThemeAnnouncement("dark")).toBe("Dark mode");
    expect(getThemeAnnouncement("system")).toBe("System mode");
  });

  it("does not enqueue a visible toast when the theme changes", async () => {
    const { unmount } = renderAppShell();

    await act(async () => {
      useTheme.getState().setTheme("dark");
    });

    expect(useNotifications.getState().notifications).toEqual([]);
    unmount();
  });

  it("announces System mode when switching from explicit mode to system", async () => {
    useTheme.setState({ mode: "light", resolvedTheme: "light" });
    renderAppShell();

    await act(async () => {
      useTheme.getState().setTheme("system");
    });

    expect(screen.getByTestId("theme-announcement-live-region").textContent?.trim()).toBe(
      "System mode",
    );
  });

  it("announces resolved light or dark in system mode when the OS preference changes", async () => {
    renderAppShell();

    await act(async () => {
      useTheme.getState().syncResolvedTheme(true);
    });

    expect(screen.getByTestId("theme-announcement-live-region").textContent?.trim()).toBe(
      "Dark mode",
    );
  });
});
