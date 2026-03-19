import { describe, expect, it } from "vitest";
import { createThemeStore } from "./store/useTheme";
import { appRoutes, attachThemeRuntime } from "./main";

function createRootElementStub() {
  const classNames = new Set<string>();

  return {
    dataset: {} as DOMStringMap,
    classList: {
      toggle(name: string, force?: boolean) {
        if (force === true) {
          classNames.add(name);
          return true;
        }
        if (force === false) {
          classNames.delete(name);
          return false;
        }
        // force === undefined: true toggle behavior
        if (classNames.has(name)) {
          classNames.delete(name);
          return false;
        }
        classNames.add(name);
        return true;
      },
      contains(name: string) {
        return classNames.has(name);
      },
    },
  };
}

function createMediaQueryListStub(matches: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>();

  return {
    matches,
    addEventListener(_name: string, listener: (event: { matches: boolean }) => void) {
      listeners.add(listener);
    },
    removeEventListener(_name: string, listener: (event: { matches: boolean }) => void) {
      listeners.delete(listener);
    },
    emit(nextMatches: boolean) {
      this.matches = nextMatches;
      for (const listener of listeners) {
        listener({ matches: nextMatches });
      }
    },
  };
}

describe("main", () => {
  it("includes the settings route in the root shell", () => {
    const rootRoute = appRoutes[0];
    const childPaths = rootRoute.children?.map((route) => route.path);

    expect(childPaths).toContain("settings");
  });

  it("applies system theme updates while mode is system", () => {
    const store = createThemeStore(false);
    const rootElement = createRootElementStub();
    const mediaQueryList = createMediaQueryListStub(false);

    const detach = attachThemeRuntime({ rootElement, mediaQueryList, store });

    mediaQueryList.emit(true);

    expect(rootElement.classList.contains("dark")).toBe(true);
    expect(rootElement.dataset.theme).toBe("dark");

    detach();
  });

  it("ignores system theme changes when mode is explicit", () => {
    const store = createThemeStore(false);
    store.getState().setTheme("light");
    const rootElement = createRootElementStub();
    const mediaQueryList = createMediaQueryListStub(false);

    const detach = attachThemeRuntime({ rootElement, mediaQueryList, store });

    mediaQueryList.emit(true);

    expect(rootElement.classList.contains("dark")).toBe(false);
    expect(rootElement.dataset.theme).toBe("light");

    detach();
  });
});