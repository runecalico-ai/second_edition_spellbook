// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPreHydrationTheme, readStoredThemeModeValue } from "./preHydrationTheme";

describe("preHydrationTheme", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("applies dark class and data-theme when stored mode is dark", () => {
    const root = document.createElement("html");
    applyPreHydrationTheme(root, "dark", false);
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.dataset.theme).toBe("dark");
  });

  it("resolves system mode from the prefers-dark hint", () => {
    const root = document.createElement("html");
    applyPreHydrationTheme(root, "system", true);
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.dataset.theme).toBe("dark");
  });

  it("treats invalid stored values like the theme store (fallback to system)", () => {
    const root = document.createElement("html");
    applyPreHydrationTheme(root, "not-a-mode", false);
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.dataset.theme).toBe("light");
  });

  it("returns null from readStoredThemeModeValue when localStorage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
    });

    expect(readStoredThemeModeValue()).toBeNull();
  });
});
