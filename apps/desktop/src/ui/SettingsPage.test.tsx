// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
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

  it("renders the appearance section and settings controls", () => {
    const html = renderToStaticMarkup(<SettingsPage />);

    expect(html).toContain("Appearance");
    expect(html).toContain('data-testid="settings-theme-select"');
    expect(html).toContain('data-testid="settings-follow-system-checkbox"');
  });

  it("disables the select while follow system is enabled", () => {
    useTheme.setState({
      mode: "system",
      resolvedTheme: "dark",
    });

    const html = renderToStaticMarkup(<SettingsPage />);

    expect(html).toContain('disabled=""');
    expect(html).toContain('checked=""');
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
    const html = renderToStaticMarkup(<SettingsPage />);

    expect(html).toContain('for="settings-theme-select"');
    expect(html).toContain('id="settings-theme-select"');
    expect(html).toContain('for="settings-follow-system-checkbox"');
    expect(html).toContain('id="settings-follow-system-checkbox"');
  });
});

describe("SettingsPage interactions", () => {
  beforeEach(resetThemeState);
  afterEach(cleanup);

  it("resolves label-to-input association at runtime", () => {
    render(<SettingsPage />);

    const themeSelect = screen.getByLabelText("Theme");
    expect(themeSelect.getAttribute("data-testid")).toBe(
      "settings-theme-select",
    );

    const checkbox = screen.getByLabelText("Follow system preference");
    expect(checkbox.getAttribute("data-testid")).toBe(
      "settings-follow-system-checkbox",
    );
  });

  it("unchecking follow-system sets theme to resolved theme", () => {
    render(<SettingsPage />);

    const checkbox = screen.getByTestId("settings-follow-system-checkbox");
    fireEvent.click(checkbox);

    expect(useTheme.getState().mode).toBe("dark");
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
