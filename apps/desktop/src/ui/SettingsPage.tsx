import type { ChangeEvent } from "react";
import type { ResolvedTheme, ThemeMode } from "../store/useTheme";
import { useTheme } from "../store/useTheme";

export function getSelectableThemeValue(
  mode: ThemeMode,
  resolvedTheme: ResolvedTheme,
): ResolvedTheme {
  return mode === "system" ? resolvedTheme : mode;
}

export function getThemeModeFromSystemToggle(
  resolvedTheme: ResolvedTheme,
  nextChecked: boolean,
): ThemeMode {
  if (nextChecked) {
    return "system";
  }

  return resolvedTheme;
}

export function SettingsPage() {
  const mode = useTheme((state) => state.mode);
  const resolvedTheme = useTheme((state) => state.resolvedTheme);
  const setTheme = useTheme((state) => state.setTheme);
  const isFollowingSystem = mode === "system";

  const handleThemeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setTheme(event.currentTarget.value as ResolvedTheme);
  };

  const handleSystemToggle = (event: ChangeEvent<HTMLInputElement>) => {
    setTheme(getThemeModeFromSystemToggle(resolvedTheme, event.currentTarget.checked));
  };

  return (
    <section className="space-y-6 rounded-2xl border border-stone-200 bg-white/90 p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/80">
      {/*
        Layout shell borders: border-stone-200 on white is below WCAG 3:1 for non-text UI.
        Accepted deviation for chunk-5 Task 6; form controls use border-neutral-500.
      */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-stone-600 dark:text-neutral-300">
          Adjust shared application preferences.
        </p>
      </div>

      <section className="space-y-4" aria-labelledby="settings-appearance-heading">
        <div className="space-y-1">
          <h2 id="settings-appearance-heading" className="text-lg font-semibold">
            Appearance
          </h2>
          <p
            id="settings-appearance-hint"
            className="text-sm text-stone-600 dark:text-neutral-300"
          >
            Choose a theme or follow your operating system preference.
          </p>
        </div>

        <div className="space-y-4 rounded-xl border border-stone-200/80 bg-stone-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
          <div className="space-y-2">
            <label htmlFor="settings-theme-select" className="block text-sm font-medium">
              Theme
            </label>
            <select
              id="settings-theme-select"
              data-testid="settings-theme-select"
              aria-describedby="settings-appearance-hint"
              className="w-full rounded-lg border border-neutral-500 bg-white px-3 py-2 text-sm text-neutral-900 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              value={getSelectableThemeValue(mode, resolvedTheme)}
              disabled={isFollowingSystem}
              onChange={handleThemeChange}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          <label
            htmlFor="settings-follow-system-checkbox"
            className="flex items-center gap-3 text-sm font-medium"
          >
            <input
              id="settings-follow-system-checkbox"
              type="checkbox"
              data-testid="settings-follow-system-checkbox"
              aria-describedby="settings-appearance-hint"
              checked={isFollowingSystem}
              onChange={handleSystemToggle}
              className="h-4 w-4 rounded border-neutral-500 bg-white text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900 dark:border-neutral-700 dark:bg-neutral-900"
            />
            Follow system preference
          </label>
        </div>
      </section>
    </section>
  );
}

export default SettingsPage;
