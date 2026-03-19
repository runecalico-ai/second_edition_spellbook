import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVaultStartupFailureModal, createVaultStartupWarningModal } from "./App";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useNotifications } from "../store/useNotifications";
import { useTheme } from "../store/useTheme";
import App, { getThemeAnnouncement } from "./App";

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
  return renderToStaticMarkup(
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

  it("renders the settings gear button with an accessible name", () => {
    const html = renderAppShell();

    expect(html).toContain('data-testid="settings-gear-button"');
    expect(html).toContain('aria-label="Settings"');
    expect(html).toContain('href="/settings"');
  });

  it("mounts a hidden polite live region for theme announcements", () => {
    const html = renderAppShell();

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("System mode");
    expect(html).toContain("sr-only");
  });

  it("maps theme modes to announcement text", () => {
    expect(getThemeAnnouncement("light")).toBe("Light mode");
    expect(getThemeAnnouncement("dark")).toBe("Dark mode");
    expect(getThemeAnnouncement("system")).toBe("System mode");
  });

  it("does not enqueue a visible toast when the theme changes", () => {
    useTheme.getState().setTheme("dark");

    expect(useNotifications.getState().notifications).toEqual([]);
  });
});
