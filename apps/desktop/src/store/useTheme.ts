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

interface ThemeStoreState extends ThemeState {
  _systemPrefersDark: boolean;
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

export function readStoredThemeMode(): ThemeMode | null {
  try {
    const raw = getStorage()?.getItem(THEME_STORAGE_KEY) ?? null;
    if (raw === "light" || raw === "dark" || raw === "system") {
      return raw;
    }
    return null;
  } catch {
    return null;
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
  const initialMode = readStoredThemeMode() ?? "system";

  return create<ThemeStoreState>((set, get) => ({
    mode: initialMode,
    resolvedTheme: resolveThemeMode(initialMode, initialSystemPrefersDark),
    _systemPrefersDark: initialSystemPrefersDark,
    setTheme: (value) => {
      persistThemeMode(value);
      set({
        mode: value,
        resolvedTheme: resolveThemeMode(value, get()._systemPrefersDark),
      });
    },
    syncResolvedTheme: (nextSystemPrefersDark) => {
      set((state) => ({
        _systemPrefersDark: nextSystemPrefersDark,
        resolvedTheme: resolveThemeMode(state.mode, nextSystemPrefersDark),
      }));
    },
  }));
}

// This runs at module evaluation time, before the component tree mounts.
// In tests, jsdom's matchMedia always returns false, so the singleton's initial
// resolvedTheme is always "light" unless a test constructs a fresh store via
// createThemeStore. Tests that need a specific initial systemPrefersDark value
// should use createThemeStore(...) directly.
export const useTheme = createThemeStore(getSystemThemePreference());
