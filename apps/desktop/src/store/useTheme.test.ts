import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  createThemeStore,
  resolveThemeMode,
} from "./useTheme";

function createStorageMock(initialValue?: string | null) {
  const values = new Map<string, string>();

  if (initialValue !== undefined && initialValue !== null) {
    values.set(THEME_STORAGE_KEY, initialValue);
  }

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  } satisfies Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear">;
}

describe("useTheme", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to system mode when storage is empty", () => {
    vi.stubGlobal("localStorage", createStorageMock());

    const store = createThemeStore(false);

    expect(store.getState().mode).toBe("system");
    expect(store.getState().resolvedTheme).toBe("light");
  });

  it("restores persisted light and dark modes", () => {
    vi.stubGlobal("localStorage", createStorageMock("light"));
    expect(createThemeStore(true).getState().mode).toBe("light");

    vi.stubGlobal("localStorage", createStorageMock("dark"));
    expect(createThemeStore(false).getState().mode).toBe("dark");
  });

  it("falls back to system mode for invalid persisted values", () => {
    vi.stubGlobal("localStorage", createStorageMock("sepia"));

    const store = createThemeStore(true);

    expect(store.getState().mode).toBe("system");
    expect(store.getState().resolvedTheme).toBe("dark");
  });

  it("persists changes using the theme storage key", () => {
    const storage = createStorageMock();
    vi.stubGlobal("localStorage", storage);
    const store = createThemeStore(false);

    store.getState().setTheme("dark");

    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(store.getState().resolvedTheme).toBe("dark");
  });

  it("resolves active theme from mode and system preference", () => {
    expect(resolveThemeMode("light", true)).toBe("light");
    expect(resolveThemeMode("dark", false)).toBe("dark");
    expect(resolveThemeMode("system", true)).toBe("dark");
    expect(resolveThemeMode("system", false)).toBe("light");
  });
});