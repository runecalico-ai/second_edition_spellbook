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
    expect(screen.getByTestId("empty-character-spellbook-state-live-region").textContent).toBe(
      "No Spells Added. This character's spellbook is empty.",
    );
    expect(
      screen.queryByText("This character's spellbook is empty.", { selector: "output" }),
    ).toBeNull();
    expect(
      within(emptyState).getByRole("button", { name: "Add Spell from Library" }),
    ).not.toBeNull();
    expect(emptyState.closest("td")?.getAttribute("colspan")).toBe("7");
  });

  it("uses theme-aware classes for the header summary and print controls", async () => {
    renderSpellbookBuilder(1);

    const summary = await screen.findByTestId("character-summary-label");
    const pageSizeSelect = screen.getByTestId("print-page-size-select");
    const compactPrintButton = screen.getByTestId("btn-print-spellbook-compact");
    const statBlockPrintButton = screen.getByTestId("btn-print-spellbook-stat-block");
    const backLink = screen.getByTestId("link-back-to-characters");

    expect(summary.className).toContain("text-neutral-600");
    expect(summary.className).toContain("dark:text-neutral-400");

    expect(pageSizeSelect.className).toContain("bg-white");
    expect(pageSizeSelect.className).toContain("dark:bg-neutral-900");
    expect(pageSizeSelect.className).toContain("border-neutral-500");
    expect(pageSizeSelect.className).toContain("dark:border-neutral-700");
    expect(pageSizeSelect.className).toContain("text-neutral-900");
    expect(pageSizeSelect.className).toContain("dark:text-neutral-100");

    for (const button of [compactPrintButton, statBlockPrintButton]) {
      expect(button.className).toContain("border-neutral-500");
      expect(button.className).toContain("bg-neutral-200");
      expect(button.className).toContain("text-neutral-900");
      expect(button.className).toContain("hover:bg-neutral-300");
      expect(button.className).toContain("dark:border-neutral-700");
      expect(button.className).toContain("dark:bg-neutral-800");
      expect(button.className).toContain("dark:text-neutral-100");
      expect(button.className).toContain("dark:hover:bg-neutral-700");
    }

    expect(backLink.className).toContain("text-neutral-600");
    expect(backLink.className).toContain("dark:text-neutral-400");
    expect(backLink.className).toContain("hover:text-neutral-900");
    expect(backLink.className).toContain("dark:hover:text-white");
  });

  it("clicking Add Spell from Library opens the spell picker", async () => {
    renderSpellbookBuilder(1);
    const addBtn = await screen.findByRole("button", { name: "Add Spell from Library" });
    expect(screen.queryByRole("dialog", { name: "Add spells" })).toBeNull();

    fireEvent.click(addBtn);

    const dialog = await screen.findByRole("dialog", { name: "Add spells" });
    const searchInput = within(dialog).getByTestId("spellbook-picker-search-input");
    expect(dialog.getAttribute("data-testid")).toBe("spellbook-picker-dialog");
    // Verify dialog has theme-aware container class
    expect(dialog.classList.contains("bg-white")).toBe(true);
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

  it("uses the upgraded light-mode border token across spell picker controls", async () => {
    renderSpellbookBuilder(1);

    fireEvent.click(await screen.findByRole("button", { name: "Add Spell from Library" }));

    const dialog = await screen.findByRole("dialog", { name: "Add spells" });
    const searchInput = within(dialog).getByTestId("spellbook-picker-search-input");
    const schoolSelect = within(dialog).getByRole("listbox");
    const levelSelects = within(dialog).getAllByRole("combobox");
    const questToggle = within(dialog).getByLabelText("Quest").closest("label");
    const cantripsToggle = within(dialog).getByLabelText("Cantrips Only").closest("label");

    expect(dialog.className).toContain("border-neutral-500");
    expect(dialog.className).not.toContain("border-neutral-300");

    for (const element of [searchInput, schoolSelect, ...levelSelects]) {
      expect(element.className).toContain("border-neutral-500");
      expect(element.className).not.toContain("border-neutral-300");
    }

    for (const toggle of [questToggle, cantripsToggle]) {
      expect(toggle).not.toBeNull();
      expect(toggle?.className).toContain("border-neutral-500");
      expect(toggle?.className).not.toContain("border-neutral-300");
    }
  });

  it("pressing Escape closes the picker and restores focus to the empty-state CTA", async () => {
    renderSpellbookBuilder(1);
    const addBtn = await screen.findByRole("button", { name: "Add Spell from Library" });

    fireEvent.click(addBtn);

    const dialog = await screen.findByRole("dialog", { name: "Add spells" });
    expect(document.activeElement).toBe(
      within(dialog).getByTestId("spellbook-picker-search-input"),
    );

    fireEvent.keyDown(dialog, { key: "Escape" });

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

  it("keeps the header spell count in a loading state until the spellbook finishes loading", async () => {
    const spellbook =
      deferred<
        Array<{
          spellId: number;
          spellName: string;
          spellLevel: number;
          spellSchool?: string;
          prepared: number;
          known: number;
          notes?: string;
        }>
      >();

    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      switch (cmd) {
        case "list_characters":
          return [{ id: 1, name: "Raistlin", type: "PC" }];
        case "get_character_spellbook":
          return spellbook.promise;
        case "list_facets":
          return { schools: [], levels: [] };
        default:
          return undefined;
      }
    });

    renderSpellbookBuilder(1);

    expect(screen.getByTestId("spellbook-count-label").textContent).toBe("Loading spellbook…");
    expect(screen.queryByText("0 spells in spellbook")).toBeNull();

    spellbook.resolve([
      {
        spellId: 10,
        spellName: "Fireball",
        spellLevel: 3,
        spellSchool: "Evocation",
        prepared: 0,
        known: 1,
        notes: "",
      },
      {
        spellId: 11,
        spellName: "Magic Missile",
        spellLevel: 1,
        spellSchool: "Evocation",
        prepared: 1,
        known: 1,
        notes: "",
      },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId("spellbook-count-label").textContent).toBe("2 spells in spellbook");
    });
  });
});
