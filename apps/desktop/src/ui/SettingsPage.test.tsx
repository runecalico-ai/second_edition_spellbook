import { beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
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
    expect(getThemeModeFromSystemToggle(true, "dark", false)).toBe("dark");
    expect(getThemeModeFromSystemToggle(true, "light", false)).toBe("light");
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