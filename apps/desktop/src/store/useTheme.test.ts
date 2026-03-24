import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  createThemeStore,
  readStoredThemeMode,
  resolveThemeMode,
  sanitizeThemeMode,
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

  it("M-002 keeps in-memory theme state functional when localStorage.setItem throws during setTheme", () => {
    const values = new Map<string, string>([[THEME_STORAGE_KEY, "light"]]);
    const storage = {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem() {
        throw new Error("M-002 simulated localStorage write failure");
      },
      removeItem(key: string) {
        values.delete(key);
      },
      clear() {
        values.clear();
      },
    } satisfies Pick<Storage, "getItem" | "setItem" | "removeItem" | "clear">;

    vi.stubGlobal("localStorage", storage);
    const store = createThemeStore(false);

    store.getState().syncResolvedTheme(true);
    store.getState().setTheme("system");

    expect(store.getState().mode).toBe("system");
    expect(store.getState().resolvedTheme).toBe("dark");
    expect(readStoredThemeMode()).toBe("light");
  });

  it("resolves active theme from mode and system preference", () => {
    expect(resolveThemeMode("light", true)).toBe("light");
    expect(resolveThemeMode("dark", false)).toBe("dark");
    expect(resolveThemeMode("system", true)).toBe("dark");
    expect(resolveThemeMode("system", false)).toBe("light");
  });
});

describe("sanitizeThemeMode", () => {
  it("returns system for null, undefined, and unknown values", () => {
    expect(sanitizeThemeMode(null)).toBe("system");
    expect(sanitizeThemeMode(undefined)).toBe("system");
    expect(sanitizeThemeMode("sepia")).toBe("system");
  });

  it("passes through valid theme values", () => {
    expect(sanitizeThemeMode("light")).toBe("light");
    expect(sanitizeThemeMode("dark")).toBe("dark");
    expect(sanitizeThemeMode("system")).toBe("system");
  });
});

describe("syncResolvedTheme", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves to dark when called with true in system mode", () => {
    vi.stubGlobal("localStorage", createStorageMock());
    const store = createThemeStore(false);

    store.getState().syncResolvedTheme(true);

    expect(store.getState().resolvedTheme).toBe("dark");
  });

  it("resolves to light when called with false in system mode", () => {
    vi.stubGlobal("localStorage", createStorageMock());
    const store = createThemeStore(false);

    store.getState().syncResolvedTheme(false);

    expect(store.getState().resolvedTheme).toBe("light");
  });

  it("explicit light mode wins over system preference", () => {
    vi.stubGlobal("localStorage", createStorageMock("light"));
    const store = createThemeStore(false);

    store.getState().syncResolvedTheme(true);

    expect(store.getState().resolvedTheme).toBe("light");
  });

  it("setTheme to system uses the stored systemPrefersDark value", () => {
    vi.stubGlobal("localStorage", createStorageMock("light"));
    const store = createThemeStore(false);

    store.getState().syncResolvedTheme(true);
    store.getState().setTheme("system");

    expect(store.getState().resolvedTheme).toBe("dark");
  });
});

describe("readStoredThemeMode", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the stored value when localStorage contains a valid theme mode", () => {
    vi.stubGlobal("localStorage", createStorageMock("light"));
    expect(readStoredThemeMode()).toBe("light");

    vi.stubGlobal("localStorage", createStorageMock("dark"));
    expect(readStoredThemeMode()).toBe("dark");

    vi.stubGlobal("localStorage", createStorageMock("system"));
    expect(readStoredThemeMode()).toBe("system");
  });

  it("returns null when localStorage is empty or the key is absent", () => {
    vi.stubGlobal("localStorage", createStorageMock());
    expect(readStoredThemeMode()).toBeNull();
  });

  it("returns null when the stored value is an invalid string", () => {
    vi.stubGlobal("localStorage", createStorageMock("sepia"));
    expect(readStoredThemeMode()).toBeNull();
  });

  it("returns null when localStorage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("storage unavailable");
      },
      setItem() {},
      removeItem() {},
      clear() {},
    });
    expect(readStoredThemeMode()).toBeNull();
  });
});
