import { create } from "zustand";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "spellbook-theme";

export interface ThemeState {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (value: ThemeMode) => void;
  syncResolvedTheme: (systemPrefersDark: boolean) => void;
}

function getStorage(): Pick<Storage, "getItem" | "setItem"> | null {
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }

  return null;
}

export function sanitizeThemeMode(value: string | null | undefined): ThemeMode {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }

  return "system";
}

export function resolveThemeMode(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  if (mode === "system") {
    return systemPrefersDark ? "dark" : "light";
  }

  return mode;
}

export function readStoredThemeMode(): ThemeMode {
  try {
    return sanitizeThemeMode(getStorage()?.getItem(THEME_STORAGE_KEY));
  } catch {
    return "system";
  }
}

function persistThemeMode(mode: ThemeMode) {
  try {
    getStorage()?.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Ignore storage write failures and keep the in-memory theme state.
  }
}

export function getSystemThemePreference(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function createThemeStore(initialSystemPrefersDark = false) {
  const initialMode = readStoredThemeMode();
  let systemPrefersDark = initialSystemPrefersDark;

  return create<ThemeState>((set, get) => ({
    mode: initialMode,
    resolvedTheme: resolveThemeMode(initialMode, systemPrefersDark),
    setTheme: (value) => {
      persistThemeMode(value);
      set({
        mode: value,
        resolvedTheme: resolveThemeMode(value, systemPrefersDark),
      });
    },
    syncResolvedTheme: (nextSystemPrefersDark) => {
      systemPrefersDark = nextSystemPrefersDark;
      set({
        resolvedTheme: resolveThemeMode(get().mode, systemPrefersDark),
      });
    },
  }));
}

export const useTheme = createThemeStore(getSystemThemePreference());