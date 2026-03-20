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

function renderLibraryWithViewport() {
  const router = createMemoryRouter([{ path: "/", element: <Library /> }], { initialEntries: ["/"] });
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
    expect(within(outsideViewport as HTMLElement).queryByText("Spell added to character!")).toBeNull();
  });
});
