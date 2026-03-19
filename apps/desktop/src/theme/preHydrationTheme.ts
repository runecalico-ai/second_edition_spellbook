import { resolveThemeMode, sanitizeThemeMode, THEME_STORAGE_KEY } from "../store/useTheme";

export function readStoredThemeModeValue(): string | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function applyPreHydrationTheme(
  root: HTMLElement,
  storedValue: string | null,
  prefersDark: boolean,
): void {
  const mode = sanitizeThemeMode(storedValue);
  const resolved = resolveThemeMode(mode, prefersDark);
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = resolved;
}
