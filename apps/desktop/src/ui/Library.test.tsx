// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
});
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { useNotifications } from "../store/useNotifications";
import { NotificationViewport } from "./components/NotificationViewport";
import Library from "./Library";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const emptyFacets = {
  schools: [] as string[],
  sources: [] as string[],
  levels: [] as number[],
  classList: [] as string[],
  components: [] as string[],
  tags: [] as string[],
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderLibraryWithViewport() {
  const router = createMemoryRouter([{ path: "/", element: <Library /> }], {
    initialEntries: ["/"],
  });
  return render(
    <div>
      <RouterProvider router={router} />
      <NotificationViewport />
    </div>,
  );
}

function notificationViewport() {
  return screen.getByTestId("notification-viewport");
}

function expectFocusVisibleRing(element: HTMLElement) {
  const className = element.className;

  expect(className).toContain("focus-visible:ring-2");
  expect(className).toContain("focus-visible:ring-blue-500");
  expect(className).toContain("focus-visible:ring-offset-1");
  expect(className).toContain("dark:focus-visible:ring-offset-neutral-900");
}

function expectNoLegacyFocusOverrides(element: HTMLElement) {
  const className = element.className;

  expect(className).not.toContain("focus:w-auto");
  expect(className).not.toContain("focus:text-neutral-900");
  expect(className).not.toContain("dark:focus:text-white");
}

describe("Library heading hierarchy", () => {
  beforeEach(() => {
    useNotifications.setState({ notifications: [] });
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_facets":
          return emptyFacets;
        case "list_characters":
          return [];
        case "list_saved_searches":
          return [];
        case "search_keyword":
        case "search_semantic":
          return [];
        default:
          return undefined;
      }
    });
  });

  afterEach(() => {
    cleanup();
    useNotifications.setState({ notifications: [] });
    vi.restoreAllMocks();
  });

  it("renders a single page-level heading named Spell Library", async () => {
    renderLibraryWithViewport();

    expect(await screen.findByRole("heading", { level: 1, name: "Spell Library" })).toBeTruthy();
  });
});

describe("Library notifications (Task 5)", () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(window, "confirm").mockReturnValue(true);
    useNotifications.setState({ notifications: [] });
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_facets":
          return emptyFacets;
        case "list_characters":
          return [];
        case "list_saved_searches":
          return [];
        case "search_keyword":
        case "search_semantic":
          return [];
        default:
          return undefined;
      }
    });
  });

  afterEach(() => {
    cleanup();
    alertSpy.mockRestore();
    vi.restoreAllMocks();
    useNotifications.setState({ notifications: [] });
  });

  it("add-to-character success shows a toast in notification-viewport and does not call window.alert", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "list_facets") return emptyFacets;
      if (cmd === "list_characters") return [{ id: 1, name: "Alice" }];
      if (cmd === "list_saved_searches") return [];
      if (cmd === "search_keyword") {
        return [
          {
            id: 10,
            name: "Fireball",
            school: "Evocation",
            level: 3,
            isQuestSpell: 0,
            isCantrip: 0,
          },
        ];
      }
      if (cmd === "update_character_spell") return undefined;
      return undefined;
    });

    renderLibraryWithViewport();
    await waitFor(() => {
      expect(screen.getByTestId("spell-row-fireball")).toBeTruthy();
    });

    const addSelect = screen.getByTestId("add-to-char-select-fireball") as HTMLSelectElement;
    addSelect.focus();
    expect(document.activeElement).toBe(addSelect);

    fireEvent.change(addSelect, { target: { value: "1" } });

    await waitFor(() => {
      const viewport = notificationViewport();
      expect(within(viewport).getByText("Spell added to character!")).toBeTruthy();
      expect(within(viewport).getByTestId("toast-notification-success")).toBeTruthy();
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(addSelect);
    const viewportEl = notificationViewport();
    expect(viewportEl.contains(document.activeElement)).toBe(false);
  });

  it("add-to-character failure shows an error toast and does not call window.alert", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "list_facets") return emptyFacets;
      if (cmd === "list_characters") return [{ id: 1, name: "Alice" }];
      if (cmd === "list_saved_searches") return [];
      if (cmd === "search_keyword") {
        return [
          {
            id: 10,
            name: "Fireball",
            school: "Evocation",
            level: 3,
            isQuestSpell: 0,
            isCantrip: 0,
          },
        ];
      }
      if (cmd === "update_character_spell") throw new Error("ipc failed");
      return undefined;
    });

    renderLibraryWithViewport();
    await waitFor(() => {
      expect(screen.getByTestId("add-to-char-select-fireball")).toBeTruthy();
    });

    const addSelect = screen.getByTestId("add-to-char-select-fireball") as HTMLSelectElement;
    addSelect.focus();
    expect(document.activeElement).toBe(addSelect);
    fireEvent.change(addSelect, { target: { value: "1" } });

    await waitFor(() => {
      const viewport = notificationViewport();
      expect(within(viewport).getByText(/Failed to add spell:/)).toBeTruthy();
      expect(within(viewport).getByTestId("toast-notification-error")).toBeTruthy();
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(addSelect);
    expect(notificationViewport().contains(document.activeElement)).toBe(false);
  });

  it("save-search failure shows an error toast and does not call window.alert", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "list_facets") return emptyFacets;
      if (cmd === "list_characters") return [];
      if (cmd === "list_saved_searches") return [];
      if (cmd === "search_keyword") return [];
      if (cmd === "save_search") throw new Error("save failed");
      return undefined;
    });

    renderLibraryWithViewport();
    await waitFor(() => {
      expect(screen.getByTestId("btn-save-search-trigger")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("btn-save-search-trigger"));
    const nameInput = screen.getByTestId("save-search-name-input");
    nameInput.focus();
    expect(document.activeElement).toBe(nameInput);
    fireEvent.change(nameInput, { target: { value: "My search" } });
    const confirmBtn = screen.getByTestId("btn-save-search-confirm");
    confirmBtn.focus();
    expect(document.activeElement).toBe(confirmBtn);
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      const viewport = notificationViewport();
      expect(within(viewport).getByText(/Failed to save search:/)).toBeTruthy();
      expect(within(viewport).getByTestId("toast-notification-error")).toBeTruthy();
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(confirmBtn);
    expect(notificationViewport().contains(document.activeElement)).toBe(false);
  });

  it("delete-saved-search failure shows an error toast and does not call window.alert", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "list_facets") return emptyFacets;
      if (cmd === "list_characters") return [];
      if (cmd === "list_saved_searches") {
        return [
          {
            id: 42,
            name: "Saved",
            filterJson: JSON.stringify({
              query: "",
              mode: "keyword",
              filters: {},
            }),
            createdAt: "2020-01-01",
          },
        ];
      }
      if (cmd === "search_keyword") return [];
      if (cmd === "delete_saved_search") throw new Error("delete failed");
      return undefined;
    });

    renderLibraryWithViewport();
    await waitFor(() => {
      expect(screen.getByTestId("saved-searches-select")).toBeTruthy();
    });

    const savedSelect = screen.getByTestId("saved-searches-select") as HTMLSelectElement;
    savedSelect.focus();
    expect(document.activeElement).toBe(savedSelect);
    fireEvent.change(savedSelect, { target: { value: "42" } });
    const deleteBtn = screen.getByTestId("btn-delete-saved-search");
    deleteBtn.focus();
    expect(document.activeElement).toBe(deleteBtn);
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      const viewport = notificationViewport();
      expect(within(viewport).getByText(/Failed to delete saved search:/)).toBeTruthy();
      expect(within(viewport).getByTestId("toast-notification-error")).toBeTruthy();
    });
    expect(alertSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(deleteBtn);
    expect(notificationViewport().contains(document.activeElement)).toBe(false);
  });

  it("toast message is not rendered outside notification-viewport", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === "list_facets") return emptyFacets;
      if (cmd === "list_characters") return [{ id: 1, name: "Alice" }];
      if (cmd === "list_saved_searches") return [];
      if (cmd === "search_keyword") {
        return [
          {
            id: 10,
            name: "Fireball",
            school: "Evocation",
            level: 3,
            isQuestSpell: 0,
            isCantrip: 0,
          },
        ];
      }
      if (cmd === "update_character_spell") return undefined;
      return undefined;
    });

    const { container } = renderLibraryWithViewport();
    await waitFor(() => {
      expect(screen.getByTestId("add-to-char-select-fireball")).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId("add-to-char-select-fireball"), { target: { value: "1" } });
    await waitFor(() => {
      expect(within(notificationViewport()).getByText("Spell added to character!")).toBeTruthy();
    });
    const outsideViewport = container.querySelector("[data-testid='spell-library-table']");
    expect(outsideViewport).toBeTruthy();
    expect(
      within(outsideViewport as HTMLElement).queryByText("Spell added to character!"),
    ).toBeNull();
  });
});

describe("Library empty states", () => {
  beforeEach(() => {
    useNotifications.setState({ notifications: [] });
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_facets":
          return emptyFacets;
        case "list_characters":
          return [];
        case "list_saved_searches":
          return [];
        case "search_keyword":
        case "search_semantic":
          return [];
        default:
          return undefined;
      }
    });
  });

  afterEach(() => {
    cleanup();
    useNotifications.setState({ notifications: [] });
    vi.restoreAllMocks();
  });

  describe("empty library (no active filters)", () => {
    it("waits for the current initial search to settle before rendering the empty-library state", async () => {
      const searchDeferred = createDeferred<unknown[]>();
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        switch (cmd) {
          case "list_facets":
            return Promise.resolve(emptyFacets);
          case "list_characters":
            return Promise.resolve([]);
          case "list_saved_searches":
            return Promise.resolve([]);
          case "search_keyword":
            return searchDeferred.promise;
          case "search_semantic":
            return Promise.resolve([]);
          default:
            return Promise.resolve(undefined);
        }
      });

      renderLibraryWithViewport();

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith("search_keyword", {
          query: "",
          filters: expect.any(Object),
        });
      });
      expect(screen.queryByText("No Spells Yet")).toBeNull();
      expect(screen.queryByText("No Results")).toBeNull();

      searchDeferred.resolve([]);

      expect(await screen.findByText("No Spells Yet")).toBeTruthy();
    });

    it("renders the empty-library heading when no filters are active", async () => {
      renderLibraryWithViewport();
      const emptyState = await screen.findByTestId("empty-library-state");
      expect(within(emptyState).getByRole("heading", { name: "No Spells Yet" })).toBeTruthy();
      expect(within(emptyState).getByText(/Your spell library is empty/i)).toBeTruthy();
      expect(screen.getByTestId("library-empty-state-live-region").textContent).toBe(
        "No Spells Yet. Your spell library is empty. Create your first spell or import spells from a file.",
      );
      expect(screen.getByTestId("empty-library-create-button")).toBeTruthy();
      expect(screen.getByTestId("empty-library-import-button")).toBeTruthy();
    });

    it("does NOT show the empty-search state when no filters are active", async () => {
      renderLibraryWithViewport();
      await screen.findByText("No Spells Yet");
      expect(screen.queryByText("No Results")).toBeNull();
    });
  });

  describe("empty search (active filters, no results)", () => {
    it("keeps empty states suppressed until the latest overlapping search settles", async () => {
      const initialSearchDeferred = createDeferred<unknown[]>();
      const latestSearchDeferred = createDeferred<unknown[]>();
      let keywordSearchCalls = 0;

      vi.mocked(invoke).mockImplementation((cmd: string) => {
        switch (cmd) {
          case "list_facets":
            return Promise.resolve(emptyFacets);
          case "list_characters":
            return Promise.resolve([]);
          case "list_saved_searches":
            return Promise.resolve([]);
          case "search_keyword":
            keywordSearchCalls += 1;
            return keywordSearchCalls === 1
              ? initialSearchDeferred.promise
              : latestSearchDeferred.promise;
          case "search_semantic":
            return Promise.resolve([]);
          default:
            return Promise.resolve(undefined);
        }
      });

      renderLibraryWithViewport();

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith("search_keyword", {
          query: "",
          filters: expect.any(Object),
        });
      });

      fireEvent.change(screen.getByTestId("search-input"), {
        target: { value: "fireball" },
      });
      fireEvent.click(screen.getByTestId("library-search-button"));

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith("search_keyword", {
          query: "fireball",
          filters: expect.any(Object),
        });
      });

      initialSearchDeferred.resolve([]);

      await waitFor(() => {
        expect(screen.queryByText("No Spells Yet")).toBeNull();
        expect(screen.queryByText("No Results")).toBeNull();
      });

      latestSearchDeferred.resolve([]);

      expect(await screen.findByText("No Results")).toBeTruthy();
      expect(screen.queryByText("No Spells Yet")).toBeNull();
    });

    it("renders the empty-search state for semantic mode after the semantic search settles", async () => {
      const semanticDeferred = createDeferred<unknown[]>();
      vi.mocked(invoke).mockImplementation((cmd: string) => {
        switch (cmd) {
          case "list_facets":
            return Promise.resolve(emptyFacets);
          case "list_characters":
            return Promise.resolve([]);
          case "list_saved_searches":
            return Promise.resolve([]);
          case "search_keyword":
            return Promise.resolve([]);
          case "search_semantic":
            return semanticDeferred.promise;
          default:
            return Promise.resolve(undefined);
        }
      });

      renderLibraryWithViewport();
      await screen.findByText("No Spells Yet");

      fireEvent.change(screen.getByTestId("library-mode-select"), {
        target: { value: "semantic" },
      });
      fireEvent.change(screen.getByTestId("search-input"), {
        target: { value: "find hidden lore" },
      });
      fireEvent.click(screen.getByTestId("library-search-button"));

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith("search_semantic", { query: "find hidden lore" });
      });
      expect(screen.queryByText("No Results")).toBeNull();

      semanticDeferred.resolve([]);

      const emptyState = await screen.findByTestId("empty-search-state");
      expect(within(emptyState).getByRole("heading", { name: "No Results" })).toBeTruthy();
      expect(within(emptyState).getByText(/No spells match your current search/i)).toBeTruthy();
      expect(screen.getByTestId("library-empty-state-live-region").textContent).toBe(
        "No Results. No spells match your current search or filters.",
      );
      expect(screen.queryByText("No Spells Yet")).toBeNull();
    });

    it("renders the empty-search state after a query is typed and search is triggered", async () => {
      renderLibraryWithViewport();
      // Wait for initial empty-library render
      await screen.findByText("No Spells Yet");

      // Type a query
      const searchInput = screen.getByTestId("search-input");
      fireEvent.change(searchInput, { target: { value: "fireball" } });
      // Trigger search explicitly (the component searches on button click or Enter)
      fireEvent.click(screen.getByTestId("library-search-button"));

      // Now with an active query, the empty-search state should appear
      const emptyState = await screen.findByTestId("empty-search-state");
      expect(within(emptyState).getByRole("heading", { name: "No Results" })).toBeTruthy();
      expect(within(emptyState).getByText(/No spells match your current search/i)).toBeTruthy();
      expect(screen.getByTestId("empty-search-reset-button")).toBeTruthy();
      expect(screen.queryByText("No Spells Yet")).toBeNull();
    });

    it("clicking the empty-search Reset Filters button clears the search query", async () => {
      renderLibraryWithViewport();
      await screen.findByText("No Spells Yet");

      fireEvent.change(screen.getByTestId("search-input"), {
        target: { value: "fireball" },
      });
      fireEvent.click(screen.getByTestId("library-search-button"));
      await screen.findByText("No Results");

      fireEvent.click(screen.getByTestId("empty-search-reset-button"));

      // After reset, query clears → back to empty-library state
      expect(await screen.findByText("No Spells Yet")).toBeTruthy();
      expect((screen.getByTestId("search-input") as HTMLInputElement).value).toBe("");
      // Verify the empty-search state is no longer in the DOM
      expect(screen.queryByTestId("empty-search-reset-button")).toBeNull();
    });

    it("M-005 keeps the live-region announcement stable across repeated identical empty-search settles", async () => {
      const initialSearchDeferred = createDeferred<unknown[]>();
      const firstEmptySearchDeferred = createDeferred<unknown[]>();
      const secondEmptySearchDeferred = createDeferred<unknown[]>();
      let keywordSearchCalls = 0;

      vi.mocked(invoke).mockImplementation((cmd: string) => {
        switch (cmd) {
          case "list_facets":
            return Promise.resolve(emptyFacets);
          case "list_characters":
            return Promise.resolve([]);
          case "list_saved_searches":
            return Promise.resolve([]);
          case "search_keyword":
            keywordSearchCalls += 1;
            if (keywordSearchCalls === 1) {
              return initialSearchDeferred.promise;
            }
            if (keywordSearchCalls === 2) {
              return firstEmptySearchDeferred.promise;
            }
            return secondEmptySearchDeferred.promise;
          case "search_semantic":
            return Promise.resolve([]);
          default:
            return Promise.resolve(undefined);
        }
      });

      renderLibraryWithViewport();

      initialSearchDeferred.resolve([]);
      await screen.findByText("No Spells Yet");

      fireEvent.change(screen.getByTestId("search-input"), {
        target: { value: "fireball" },
      });
      fireEvent.click(screen.getByTestId("library-search-button"));

      firstEmptySearchDeferred.resolve([]);

      const liveRegion = screen.getByTestId("library-empty-state-live-region");
      await waitFor(() => {
        expect(screen.getByTestId("empty-search-state")).toBeTruthy();
        expect(liveRegion.textContent).toBe(
          "No Results. No spells match your current search or filters.",
        );
      });

      fireEvent.click(screen.getByTestId("library-search-button"));

      expect(liveRegion.textContent).toBe(
        "No Results. No spells match your current search or filters.",
      );

      secondEmptySearchDeferred.resolve([]);

      await waitFor(() => {
        expect(screen.getByTestId("empty-search-state")).toBeTruthy();
        expect(liveRegion.textContent).toBe(
          "No Results. No spells match your current search or filters.",
        );
      });
    });

    it("does not show the empty-library state while Reset Filters reloads a non-empty library", async () => {
      const defaultLibraryDeferred =
        createDeferred<
          Array<{
            id: number;
            name: string;
            school: string;
            level: number;
            classList: string;
            components: string;
            isQuestSpell: number;
            isCantrip: number;
          }>
        >();

      vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) => {
        switch (cmd) {
          case "list_facets":
            return Promise.resolve(emptyFacets);
          case "list_characters":
            return Promise.resolve([]);
          case "list_saved_searches":
            return Promise.resolve([]);
          case "search_keyword": {
            const searchArgs = args as { query?: string } | undefined;
            if (searchArgs?.query === "fireball") {
              return Promise.resolve([]);
            }

            return defaultLibraryDeferred.promise;
          }
          case "search_semantic":
            return Promise.resolve([]);
          default:
            return Promise.resolve(undefined);
        }
      });

      renderLibraryWithViewport();

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith("search_keyword", {
          query: "",
          filters: expect.any(Object),
        });
      });

      fireEvent.change(screen.getByTestId("search-input"), {
        target: { value: "fireball" },
      });
      fireEvent.click(screen.getByTestId("library-search-button"));

      expect(await screen.findByText("No Results")).toBeTruthy();
      expect(screen.queryByText("No Spells Yet")).toBeNull();

      fireEvent.click(screen.getByTestId("empty-search-reset-button"));

      expect((screen.getByTestId("search-input") as HTMLInputElement).value).toBe("");
      expect(screen.queryByText("No Results")).toBeNull();
      expect(screen.queryByText("No Spells Yet")).toBeNull();

      defaultLibraryDeferred.resolve([
        {
          id: 10,
          name: "Magic Missile",
          school: "Evocation",
          level: 1,
          classList: "Mage",
          components: "V, S",
          isQuestSpell: 0,
          isCantrip: 0,
        },
      ]);

      await waitFor(() => {
        expect(screen.getByTestId("spell-row-magic-missile")).toBeTruthy();
      });
      expect(screen.queryByText("No Spells Yet")).toBeNull();
      expect(screen.queryByText("No Results")).toBeNull();
    });

    it("resetting filters from a saved-search empty state clears the saved-search selection", async () => {
      vi.mocked(invoke).mockImplementation(async (cmd: string) => {
        switch (cmd) {
          case "list_facets":
            return emptyFacets;
          case "list_characters":
            return [];
          case "list_saved_searches":
            return [
              {
                id: 42,
                name: "Quest Search",
                filterJson: JSON.stringify({
                  query: "quest magic",
                  mode: "keyword",
                  filters: {},
                }),
                createdAt: "2026-03-21",
              },
            ];
          case "search_keyword":
          case "search_semantic":
            return [];
          default:
            return undefined;
        }
      });

      renderLibraryWithViewport();
      await waitFor(() => {
        expect(screen.getByTestId("saved-searches-select")).toBeTruthy();
      });

      fireEvent.change(screen.getByTestId("saved-searches-select"), {
        target: { value: "42" },
      });

      expect(await screen.findByText("No Results")).toBeTruthy();
      expect((screen.getByTestId("saved-searches-select") as HTMLSelectElement).value).toBe("42");

      fireEvent.click(screen.getByTestId("empty-search-reset-button"));

      expect(await screen.findByText("No Spells Yet")).toBeTruthy();
      expect((screen.getByTestId("saved-searches-select") as HTMLSelectElement).value).toBe("");
      expect((screen.getByTestId("search-input") as HTMLInputElement).value).toBe("");
    });
  });
});

describe("Library focus indicators", () => {
  beforeEach(() => {
    useNotifications.setState({ notifications: [] });
  });

  afterEach(() => {
    cleanup();
    useNotifications.setState({ notifications: [] });
    vi.restoreAllMocks();
  });

  it("adds visible focus rings to the search, filter, saved-search, and spell-row controls", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_facets":
          return {
            schools: ["Evocation"],
            sources: ["PHB"],
            levels: [3],
            classList: ["Mage"],
            components: ["V, S, M"],
            tags: ["Combat"],
          };
        case "list_characters":
          return [{ id: 1, name: "Alice" }];
        case "list_saved_searches":
          return [
            {
              id: 42,
              name: "Prepared Spells",
              filterJson: JSON.stringify({
                query: "",
                mode: "keyword",
                filters: {},
              }),
              createdAt: "2026-03-21",
            },
          ];
        case "search_keyword":
          return [
            {
              id: 10,
              name: "Fireball",
              school: "Evocation",
              level: 3,
              classList: "Mage",
              components: "V, S, M",
              isQuestSpell: 0,
              isCantrip: 0,
            },
          ];
        case "search_semantic":
          return [];
        default:
          return undefined;
      }
    });

    renderLibraryWithViewport();

    await waitFor(() => {
      expect(screen.getByTestId("spell-row-fireball")).toBeTruthy();
    });

    expectFocusVisibleRing(screen.getByTestId("search-input"));
    expectFocusVisibleRing(screen.getByTestId("library-mode-select"));
    expectFocusVisibleRing(screen.getByTestId("filter-school-select"));
    expectFocusVisibleRing(screen.getByTestId("filter-source-select"));
    expectFocusVisibleRing(screen.getByTestId("filter-class-select"));
    expectFocusVisibleRing(screen.getByTestId("filter-component-select"));
    expectFocusVisibleRing(screen.getByTestId("filter-tag-select"));
    expectFocusVisibleRing(screen.getByTestId("filter-quest-checkbox"));
    expectFocusVisibleRing(screen.getByTestId("filter-cantrip-checkbox"));
    expectFocusVisibleRing(screen.getByTestId("saved-searches-select"));
    expectFocusVisibleRing(screen.getByTestId("btn-save-search-trigger"));
    expectFocusVisibleRing(screen.getByTestId("btn-delete-saved-search"));
    expectFocusVisibleRing(screen.getByTestId("link-to-characters"));
    expectFocusVisibleRing(screen.getByTestId("link-add-spell"));
    expectFocusVisibleRing(screen.getByTestId("spell-link-fireball"));
    const addToCharSelect = screen.getByTestId("add-to-char-select-fireball");
    expectFocusVisibleRing(addToCharSelect);
    expectNoLegacyFocusOverrides(addToCharSelect);

    fireEvent.click(screen.getByTestId("btn-save-search-trigger"));
    const saveNameInput = await screen.findByTestId("save-search-name-input");

    expectFocusVisibleRing(saveNameInput);
    expectFocusVisibleRing(screen.getByTestId("btn-save-search-confirm"));
    expectFocusVisibleRing(screen.getByTestId("btn-save-search-cancel"));
    expect(screen.getByLabelText("Cancel saving search")).toBe(
      screen.getByTestId("btn-save-search-cancel"),
    );
  });

  it("adds visible focus rings to the empty-state CTA buttons", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_facets":
          return emptyFacets;
        case "list_characters":
          return [];
        case "list_saved_searches":
          return [];
        case "search_keyword":
        case "search_semantic":
          return [];
        default:
          return undefined;
      }
    });

    renderLibraryWithViewport();

    const createButton = await screen.findByTestId("empty-library-create-button");
    expectFocusVisibleRing(createButton);
    expectFocusVisibleRing(screen.getByTestId("empty-library-import-button"));

    fireEvent.change(screen.getByTestId("search-input"), {
      target: { value: "fireball" },
    });
    fireEvent.click(screen.getByTestId("library-search-button"));

    const resetButton = await screen.findByTestId("empty-search-reset-button");
    expectFocusVisibleRing(resetButton);
  });
});

describe("Library explicit search behavior", () => {
  beforeEach(() => {
    useNotifications.setState({ notifications: [] });
  });

  afterEach(() => {
    cleanup();
    useNotifications.setState({ notifications: [] });
    vi.restoreAllMocks();
  });

  it("does not rerun search when the query changes until submit is triggered", async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_facets":
          return emptyFacets;
        case "list_characters":
          return [];
        case "list_saved_searches":
          return [];
        case "search_keyword":
          return [];
        case "search_semantic":
          return [];
        default:
          return undefined;
      }
    });

    renderLibraryWithViewport();

    await waitFor(() => {
      expect(
        vi.mocked(invoke).mock.calls.filter((call) => call[0] === "search_keyword").length,
      ).toBeGreaterThan(0);
    });

    const initialSearchCount = vi
      .mocked(invoke)
      .mock.calls.filter((call) => call[0] === "search_keyword").length;

    fireEvent.change(screen.getByTestId("search-input"), {
      target: { value: "fireball" },
    });

    expect(
      vi.mocked(invoke).mock.calls.filter((call) => call[0] === "search_keyword"),
    ).toHaveLength(initialSearchCount);

    fireEvent.click(screen.getByTestId("library-search-button"));

    await waitFor(() => {
      expect(
        vi.mocked(invoke).mock.calls.filter((call) => call[0] === "search_keyword"),
      ).toHaveLength(initialSearchCount + 1);
    });
  });
});
