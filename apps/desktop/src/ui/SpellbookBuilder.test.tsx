// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import SpellbookBuilder from "./SpellbookBuilder";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

function renderSpellbookBuilder(characterId: number) {
  const router = createMemoryRouter([{ path: "/spellbook/:id", element: <SpellbookBuilder /> }], {
    initialEntries: [`/spellbook/${characterId}`],
  });
  return render(<RouterProvider router={router} />);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

describe("empty character spellbook state", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_characters":
          return [{ id: 1, name: "Raistlin", type: "PC" }];
        case "get_character_spellbook":
          return [];
        case "list_facets":
          return { schools: [], levels: [] };
        case "search_keyword":
          return [
            {
              id: 10,
              name: "Fireball",
              school: "Evocation",
              level: 3,
              isQuestSpell: 0,
            },
          ];
        default:
          return undefined;
      }
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the empty spellbook heading when the character has no spells", async () => {
    renderSpellbookBuilder(1);
    const emptyState = await screen.findByTestId("empty-character-spellbook-state");
    expect(within(emptyState).getByRole("heading", { name: "No Spells Added" })).not.toBeNull();
    expect(within(emptyState).getByText("This character's spellbook is empty.")).not.toBeNull();
    expect(screen.getByRole("status").textContent).toBe("This character's spellbook is empty.");
    expect(within(emptyState).getByRole("button", { name: "Add Spell from Library" })).not.toBeNull();
    expect(emptyState.closest("td")?.getAttribute("colspan")).toBe("7");
  });

  it("clicking Add Spell from Library opens the spell picker", async () => {
    renderSpellbookBuilder(1);
    const addBtn = await screen.findByRole("button", { name: "Add Spell from Library" });
    expect(screen.queryByRole("dialog", { name: "Add spells" })).toBeNull();

    fireEvent.click(addBtn);

    const dialog = await screen.findByRole("dialog", { name: "Add spells" });
    const searchInput = within(dialog).getByTestId("spellbook-picker-search-input");
    expect(dialog.getAttribute("data-testid")).toBe("spellbook-picker-dialog");
    expect(searchInput).not.toBeNull();
    expect(document.activeElement).toBe(searchInput);
    expect(within(dialog).getByRole("button", { name: "Search" })).not.toBeNull();

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("search_keyword", {
        query: "",
        filters: {
          schools: null,
          levelMin: null,
          levelMax: null,
          isQuestSpell: null,
          isCantrip: null,
        },
      });
    });

    const closeButton = within(dialog).getByRole("button", { name: "Close" });
    const pickerAddButton = await within(dialog).findByTestId("btn-add-picker-fireball");
    (pickerAddButton as HTMLButtonElement).focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(closeButton);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(pickerAddButton);

    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Add spells" })).toBeNull();
      expect(document.activeElement).toBe(addBtn);
    });
  });

  it("backdrop click closes the picker and restores focus to the empty-state CTA", async () => {
    renderSpellbookBuilder(1);
    const addBtn = await screen.findByRole("button", { name: "Add Spell from Library" });

    fireEvent.click(addBtn);
    await screen.findByRole("dialog", { name: "Add spells" });

    expect(screen.getByTestId("spellbook-picker-backdrop").getAttribute("tabindex")).toBe("-1");
    fireEvent.click(screen.getByTestId("spellbook-picker-backdrop"));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Add spells" })).toBeNull();
      expect(document.activeElement).toBe(addBtn);
    });
  });

  it("closes the picker and restores focus to the back link when character loading resolves to not found", async () => {
    const characters = deferred<Array<{ id: number; name: string; type: "PC" | "NPC" }>>();

    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_characters":
          return characters.promise;
        case "get_character_spellbook":
          return [];
        case "list_facets":
          return { schools: [], levels: [] };
        case "search_keyword":
          return [
            {
              id: 10,
              name: "Fireball",
              school: "Evocation",
              level: 3,
              isQuestSpell: 0,
            },
          ];
        default:
          return undefined;
      }
    });

    renderSpellbookBuilder(1);
    const addBtn = await screen.findByRole("button", { name: "Add Spell from Library" });

    fireEvent.click(addBtn);
    await screen.findByRole("dialog", { name: "Add spells" });

    characters.resolve([]);

    const backLink = await screen.findByRole("link", { name: "← Back to Characters" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Add spells" })).toBeNull();
      expect(document.activeElement).toBe(backLink);
    });
  });

  it("returns focus to the header trigger when the empty-state trigger unmounts after adding a spell", async () => {
    let spellbookEntries: Array<{
      spellId: number;
      spellName: string;
      spellLevel: number;
      spellSchool?: string;
      prepared: number;
      known: number;
      notes?: string;
    }> = [];

    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_characters":
          return [{ id: 1, name: "Raistlin", type: "PC" }];
        case "get_character_spellbook":
          return spellbookEntries;
        case "list_facets":
          return { schools: [], levels: [] };
        case "search_keyword":
          return [
            {
              id: 10,
              name: "Fireball",
              school: "Evocation",
              level: 3,
              isQuestSpell: 0,
            },
          ];
        case "update_character_spell":
          spellbookEntries = [
            {
              spellId: 10,
              spellName: "Fireball",
              spellLevel: 3,
              spellSchool: "Evocation",
              prepared: 0,
              known: 1,
              notes: "",
            },
          ];
          return undefined;
        default:
          return undefined;
      }
    });

    renderSpellbookBuilder(1);
    const emptyStateButton = await screen.findByRole("button", { name: "Add Spell from Library" });
    const headerAddButton = screen.getByTestId("btn-open-picker");

    fireEvent.click(emptyStateButton);

    const dialog = await screen.findByRole("dialog", { name: "Add spells" });
    fireEvent.click(await within(dialog).findByTestId("btn-add-picker-fireball"));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Add Spell from Library" })).toBeNull();
    });

    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Add spells" })).toBeNull();
      expect(document.activeElement).toBe(headerAddButton);
    });
  });

  it("keeps add-spell actions disabled until the character finishes loading", async () => {
    const characters = deferred<Array<{ id: number; name: string; type: "PC" | "NPC" }>>();
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_characters":
          return characters.promise;
        case "get_character_spellbook":
          return [];
        case "list_facets":
          return { schools: [], levels: [] };
        case "search_keyword":
          return [
            {
              id: 10,
              name: "Fireball",
              school: "Evocation",
              level: 3,
              isQuestSpell: 0,
            },
          ];
        default:
          return undefined;
      }
    });

    renderSpellbookBuilder(1);
    const headerAddButton = screen.getByTestId("btn-open-picker") as HTMLButtonElement;
    const addBtn = await screen.findByRole("button", { name: "Add Spell from Library" });
    expect(headerAddButton.matches(":disabled")).toBe(false);

    fireEvent.click(addBtn);

    const dialog = await screen.findByRole("dialog", { name: "Add spells" });
    const pickerAddButton = (await within(dialog).findByTestId(
      "btn-add-picker-fireball",
    )) as HTMLButtonElement;
    expect(pickerAddButton.matches(":disabled")).toBe(true);
    expect(pickerAddButton.textContent).toBe("Loading...");
    expect(within(dialog).getByText(/Character details are still loading/i)).not.toBeNull();

    characters.resolve([{ id: 1, name: "Raistlin", type: "PC" }]);

    await waitFor(() => {
      expect(pickerAddButton.matches(":disabled")).toBe(false);
    });

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Add spells" })).toBeNull();
    });

    fireEvent.click(addBtn);
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Add spells" })).not.toBeNull();
    });
  });
});
