// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useTheme } from "../store/useTheme";
import {
  SettingsPage,
  getSelectableThemeValue,
  getThemeModeFromSystemToggle,
} from "./SettingsPage";

function resetThemeState() {
  useTheme.setState({
    mode: "system",
    resolvedTheme: "dark",
  });
}

describe("SettingsPage", () => {
  beforeEach(resetThemeState);
  afterEach(cleanup);

  it("renders the appearance section and settings controls with the standard focus ring pattern", () => {
    render(<SettingsPage />);

    expect(screen.getByText("Appearance")).toBeTruthy();
    expect(screen.getByTestId("settings-theme-select").className).toContain(
      "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900",
    );
    expect(screen.getByTestId("settings-follow-system-checkbox").className).toContain(
      "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900",
    );
    expect((screen.getByTestId("settings-theme-select") as HTMLSelectElement).value).toBe("dark");
    expect((screen.getByTestId("settings-follow-system-checkbox") as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("disables the select while follow system is enabled", () => {
    useTheme.setState({
      mode: "system",
      resolvedTheme: "dark",
    });

    render(<SettingsPage />);

    expect((screen.getByTestId("settings-theme-select") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByTestId("settings-follow-system-checkbox") as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("preserves the resolved theme when follow system is turned off", () => {
    expect(getThemeModeFromSystemToggle("dark", false)).toBe("dark");
    expect(getThemeModeFromSystemToggle("light", false)).toBe("light");
  });

  it("returns system when follow-system is turned on", () => {
    expect(getThemeModeFromSystemToggle("dark", true)).toBe("system");
    expect(getThemeModeFromSystemToggle("light", true)).toBe("system");
  });

  it("uses the resolved theme as the select value while system mode is active", () => {
    expect(getSelectableThemeValue("system", "dark")).toBe("dark");
    expect(getSelectableThemeValue("system", "light")).toBe("light");
    expect(getSelectableThemeValue("dark", "light")).toBe("dark");
  });

  it("pairs labels with the native controls", () => {
    render(<SettingsPage />);

    expect(screen.getByLabelText("Theme").getAttribute("id")).toBe("settings-theme-select");
    expect(screen.getByLabelText("Follow system preference").getAttribute("id")).toBe(
      "settings-follow-system-checkbox",
    );
  });
});

describe("SettingsPage interactions", () => {
  beforeEach(resetThemeState);
  afterEach(cleanup);

  it("resolves label-to-input association at runtime", () => {
    render(<SettingsPage />);

    const themeSelect = screen.getByLabelText("Theme");
    expect(themeSelect.getAttribute("data-testid")).toBe("settings-theme-select");

    const checkbox = screen.getByLabelText("Follow system preference");
    expect(checkbox.getAttribute("data-testid")).toBe("settings-follow-system-checkbox");
  });

  it("unchecking follow-system sets theme to resolved theme and shows that value in the select", () => {
    render(<SettingsPage />);

    const checkbox = screen.getByTestId("settings-follow-system-checkbox");
    fireEvent.click(checkbox);

    expect(useTheme.getState().mode).toBe("dark");
    expect((screen.getByTestId("settings-theme-select") as HTMLSelectElement).value).toBe("dark");
  });

  it("changing the select updates the explicit theme", () => {
    useTheme.setState({
      mode: "light",
      resolvedTheme: "light",
    });
    render(<SettingsPage />);

    const select = screen.getByTestId("settings-theme-select");
    fireEvent.change(select, { target: { value: "dark" } });

    expect(useTheme.getState().mode).toBe("dark");
  });

  it("checking follow-system enables system mode", () => {
    // Set store to explicit mode (checkbox unchecked, select enabled)
    useTheme.setState({ mode: "light", resolvedTheme: "light" });
    render(<SettingsPage />);
    const checkbox = screen.getByTestId("settings-follow-system-checkbox");
    fireEvent.click(checkbox);
    expect(useTheme.getState().mode).toBe("system");
  });
});
