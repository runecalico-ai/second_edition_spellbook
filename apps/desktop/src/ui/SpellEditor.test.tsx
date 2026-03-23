// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import type { SpellDetail } from "../types/spell";
import { useNotifications } from "../store/useNotifications";
import { NotificationViewport } from "./components/NotificationViewport";
import { DETAIL_FIELD_ORDER } from "./detailDirty";
import SpellEditor from "./SpellEditor";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const { alertMock, confirmMock } = vi.hoisted(() => ({
  alertMock: vi.fn().mockResolvedValue(undefined),
  confirmMock: vi.fn().mockResolvedValue(false),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    useBlocker: () => ({ state: "unblocked" as const }),
  };
});

vi.mock("../store/useModal", () => ({
  useModal: () => ({
    alert: alertMock,
    confirm: confirmMock,
  }),
}));

function renderNewSpell() {
  const router = createMemoryRouter([{ path: "/edit/:id", element: <SpellEditor /> }], {
    initialEntries: ["/edit/new"],
  });
  return render(<RouterProvider router={router} />);
}

function renderNewSpellWithLibraryAndNotifications() {
  const router = createMemoryRouter(
    [
      { path: "/", element: <div data-testid="library-route">Library</div> },
      { path: "/edit/:id", element: <SpellEditor /> },
    ],
    { initialEntries: ["/edit/new"] },
  );
  return render(
    <div>
      <RouterProvider router={router} />
      <NotificationViewport />
    </div>,
  );
}

function fillValidNewArcaneSpell() {
  fireEvent.change(screen.getByTestId("spell-name-input"), { target: { value: "Light" } });
  fireEvent.change(screen.getByTestId("spell-description-textarea"), {
    target: { value: "Bright." },
  });
  fireEvent.change(screen.getByTestId("spell-school-input"), { target: { value: "Evocation" } });
}

function baseLoadedSpell(overrides: Partial<SpellDetail> = {}): SpellDetail {
  return {
    id: 1,
    name: "Loaded Spell",
    school: "Evocation",
    sphere: null,
    level: 1,
    description: "A fine spell.",
    range: "120 ft",
    components: "",
    materialComponents: "",
    castingTime: "1",
    duration: "",
    area: "",
    savingThrow: "",
    damage: "",
    magicResistance: "",
    reversible: 0,
    isQuestSpell: 0,
    isCantrip: 0,
    classList: "Mage",
    ...overrides,
  };
}

async function renderEditSpell(spell: SpellDetail) {
  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    if (cmd === "get_spell") return spell;
    return undefined;
  });
  const router = createMemoryRouter([{ path: "/edit/:id", element: <SpellEditor /> }], {
    initialEntries: ["/edit/1"],
  });
  const utils = render(<RouterProvider router={router} />);
  await waitFor(() => {
    expect(screen.queryByText("Loading...")).toBeNull();
  });
  return utils;
}

function fieldContainer(testId: string) {
  const el = screen.getByTestId(testId);
  const container = el.parentElement;
  if (!container) throw new Error(`missing parent for ${testId}`);
  return container;
}

function detailFieldRoot(field: string) {
  const input = screen.getByTestId(`detail-${field}-input`);
  const root = input.parentElement?.parentElement;
  if (!root) {
    throw new Error(`missing structured detail root for ${field}`);
  }
  return root;
}

function isBefore(left: Element, right: Element) {
  return Boolean(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING);
}

const HASH_FIXTURE = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

function expectStandardFocusRing(testId: string) {
  const className = screen.getByTestId(testId).className;
  expect(className).toContain("focus-visible:ring-2");
  expect(className).toContain("focus-visible:ring-blue-500");
  expect(className).toContain("focus-visible:ring-offset-1");
  expect(className).toContain("dark:focus-visible:ring-offset-neutral-900");
}

function expectDangerFocusRing(testId: string) {
  const className = screen.getByTestId(testId).className;
  expect(className).toContain("focus-visible:ring-2");
  expect(className).toContain("focus-visible:ring-red-500");
  expect(className).toContain("focus-visible:ring-offset-1");
  expect(className).toContain("dark:focus-visible:ring-offset-neutral-900");
}

describe("hash display", () => {
  beforeEach(async () => {
    useNotifications.setState({ notifications: [] });
    await renderEditSpell(baseLoadedSpell({ contentHash: HASH_FIXTURE }));
    render(<NotificationViewport />);
  });

  afterEach(() => {
    cleanup();
    useNotifications.setState({ notifications: [] });
    vi.restoreAllMocks();
  });

  it("renders the hash as a card with 16-character truncation in the collapsed state", () => {
    const card = screen.getByTestId("spell-detail-hash-card");
    const display = screen.getByTestId("spell-detail-hash-display");
    const copyButton = screen.getByTestId("spell-detail-hash-copy");
    const expandButton = screen.getByTestId("spell-detail-hash-expand");

    expect(card.contains(display)).toBe(true);
    expect(card.contains(copyButton)).toBe(true);
    expect(card.contains(expandButton)).toBe(true);
    expect(display.textContent).toBe(`${HASH_FIXTURE.slice(0, 16)}...`);
  });

  it("omits a title attribute on the hash display", () => {
    expect(screen.getByTestId("spell-detail-hash-display").hasAttribute("title")).toBe(false);
  });

  it("uses visible button names for copy and expand controls and expands to the full hash", () => {
    const expandButton = screen.getByTestId("spell-detail-hash-expand");
    expect(screen.getByTestId("spell-detail-hash-copy").getAttribute("aria-label")).toBeNull();
    expect(expandButton.getAttribute("aria-label")).toBeNull();
    expect(expandButton.getAttribute("aria-expanded")).toBe("false");
    expect(expandButton.getAttribute("aria-controls")).toBe("spell-detail-hash-value");
    expect(screen.getByRole("button", { name: "Copy" })).toBe(screen.getByTestId("spell-detail-hash-copy"));
    expect(screen.getByRole("button", { name: "Expand" })).toBe(expandButton);

    fireEvent.click(expandButton);

    expect(screen.getByTestId("spell-detail-hash-display").textContent).toBe(HASH_FIXTURE);
    expect(expandButton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Collapse" })).toBe(expandButton);
  });

  it("copies the full hash and shows the success toast", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    try {
      fireEvent.click(screen.getByTestId("spell-detail-hash-copy"));

      expect(writeText).toHaveBeenCalledWith(HASH_FIXTURE);
      expect(screen.queryByRole("dialog")).toBeNull();
      const viewport = screen.getByTestId("notification-viewport");
      await waitFor(() => {
        expect(
          within(viewport).getByTestId("toast-notification-success").textContent ?? "",
        ).toContain("Hash copied to clipboard.");
      });
      expect(viewport.closest("output[aria-live='polite']")).not.toBeNull();
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
    }
  });

  it("shows an error toast when copying the hash fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard failed"));
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText,
      },
    });

    try {
      fireEvent.click(screen.getByTestId("spell-detail-hash-copy"));

      expect(writeText).toHaveBeenCalledWith(HASH_FIXTURE);
      expect(screen.queryByRole("dialog")).toBeNull();
      const viewport = screen.getByTestId("notification-viewport");
      await waitFor(() => {
        expect(
          within(viewport).getByTestId("toast-notification-error").textContent ?? "",
        ).toContain("Failed to copy hash.");
      });
      expect(viewport.closest("output[aria-live='polite']")).not.toBeNull();
    } finally {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: originalClipboard,
      });
    }
  });
});

describe("SpellEditor structured detail controls", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("exposes field-specific accessible names for expand buttons", async () => {
    await renderEditSpell(baseLoadedSpell());

    expect(screen.getByRole("button", { name: "Expand Range" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Expand Duration" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Expand Casting Time" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Expand Components" })).toBeTruthy();
  });
});

describe("SpellEditor inline validation (Task 2)", () => {
  beforeEach(() => {
    alertMock.mockClear();
    confirmMock.mockClear();
    vi.mocked(invoke).mockReset();
    useNotifications.setState({ notifications: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("does not show the save validation hint while the form is pristine", () => {
    renderNewSpell();
    expect(screen.queryByTestId("spell-save-validation-hint")).toBeNull();
  });

  it("does not show required-field inline errors before blur or failed submit", () => {
    renderNewSpell();
    expect(screen.queryByTestId("spell-name-error")).toBeNull();
    expect(screen.queryByTestId("error-description-required")).toBeNull();
  });

  it("clicking Save with an invalid form shows inline errors and the save hint", () => {
    renderNewSpell();
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    expect(screen.getByTestId("spell-name-error")).toBeTruthy();
    expect(screen.getByTestId("spell-save-validation-hint").textContent?.trim()).toBe(
      "Fix the errors above to save",
    );
    expect(alertMock).not.toHaveBeenCalled();
  });

  it("renders each inline error in the same field container as its input", () => {
    renderNewSpell();
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    expect(within(fieldContainer("spell-name-input")).getByTestId("spell-name-error")).toBeTruthy();
    expect(
      within(fieldContainer("spell-description-textarea")).getByTestId(
        "error-description-required",
      ),
    ).toBeTruthy();
  });

  it("clears a field error immediately when that field becomes valid", () => {
    renderNewSpell();
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    expect(screen.getByTestId("spell-name-error")).toBeTruthy();
    fireEvent.change(screen.getByTestId("spell-name-input"), { target: { value: "Light" } });
    expect(screen.queryByTestId("spell-name-error")).toBeNull();
    expect(screen.getByTestId("error-description-required")).toBeTruthy();
  });

  it("revalidates school and sphere immediately when tradition changes", () => {
    renderNewSpell();
    const tradition = screen.getByTestId("spell-tradition-select");
    fireEvent.change(tradition, { target: { value: "DIVINE" } });
    expect(screen.getByTestId("error-sphere-required-divine-tradition")).toBeTruthy();
    expect(
      within(fieldContainer("spell-sphere-input")).getByTestId(
        "error-sphere-required-divine-tradition",
      ),
    ).toBeTruthy();
    fireEvent.change(tradition, { target: { value: "ARCANE" } });
    expect(screen.getByTestId("error-school-required-arcane-tradition")).toBeTruthy();
    expect(
      within(fieldContainer("spell-school-input")).getByTestId(
        "error-school-required-arcane-tradition",
      ),
    ).toBeTruthy();
  });

  it("validates tradition-dependent fields on tradition change without waiting for blur", () => {
    renderNewSpell();
    fireEvent.change(screen.getByTestId("spell-tradition-select"), { target: { value: "DIVINE" } });
    expect(
      within(fieldContainer("spell-sphere-input")).getByTestId(
        "error-sphere-required-divine-tradition",
      ),
    ).toBeTruthy();
  });

  it("clears the hidden mutually exclusive field when tradition changes", () => {
    renderNewSpell();
    fireEvent.change(screen.getByTestId("spell-school-input"), { target: { value: "Evocation" } });

    fireEvent.change(screen.getByTestId("spell-tradition-select"), { target: { value: "DIVINE" } });
    fireEvent.change(screen.getByTestId("spell-sphere-input"), { target: { value: "Fire" } });

    expect(screen.queryByTestId("error-tradition-conflict")).toBeNull();

    fireEvent.change(screen.getByTestId("spell-tradition-select"), { target: { value: "ARCANE" } });

    const schoolInput = screen.getByTestId("spell-school-input") as HTMLInputElement;
    expect(schoolInput.value).toBe("");
    expect(
      within(fieldContainer("spell-school-input")).getByTestId(
        "error-school-required-arcane-tradition",
      ),
    ).toBeTruthy();
  });

  it("mounts the newly relevant tradition field with fade-in animation and unmounts the other immediately", () => {
    renderNewSpell();
    expect(screen.getByTestId("spell-school-field").className).toMatch(/animate-in/);
    expect(screen.getByTestId("spell-school-field").className).toMatch(/fade-in/);
    expect(screen.queryByTestId("spell-sphere-input")).toBeNull();
    fireEvent.change(screen.getByTestId("spell-tradition-select"), { target: { value: "DIVINE" } });
    expect(screen.queryByTestId("spell-school-input")).toBeNull();
    expect(screen.getByTestId("spell-sphere-field").className).toMatch(/animate-in/);
    expect(screen.getByTestId("spell-sphere-field").className).toMatch(/fade-in/);
  });

  it("shows Arcane missing-school validation without tradition conflict", () => {
    renderNewSpell();
    fireEvent.change(screen.getByTestId("spell-name-input"), { target: { value: "Test" } });
    fireEvent.change(screen.getByTestId("spell-description-textarea"), {
      target: { value: "Desc" },
    });
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    expect(
      within(fieldContainer("spell-school-input")).getByTestId(
        "error-school-required-arcane-tradition",
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId("error-tradition-conflict")).toBeNull();
  });

  it("shows a required-field error after blur without submit", () => {
    renderNewSpell();
    const name = screen.getByTestId("spell-name-input");
    fireEvent.blur(name);
    expect(screen.getByTestId("spell-name-error")).toBeTruthy();
    expect(screen.queryByTestId("spell-save-validation-hint")).toBeNull();
  });

  it("does not save when Enter is pressed during IME composition in the name field", async () => {
    renderNewSpellWithLibraryAndNotifications();
    fillValidNewArcaneSpell();

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("spell-name-input"), {
        key: "Enter",
        code: "Enter",
        isComposing: true,
      });
    });

    expect(
      vi.mocked(invoke).mock.calls.filter((call) => call[0] === "create_spell"),
    ).toHaveLength(0);
    expect(screen.queryByTestId("library-route")).toBeNull();
  });

  it("saves when Enter is pressed in the name field outside IME composition", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "create_spell") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    renderNewSpellWithLibraryAndNotifications();
    fillValidNewArcaneSpell();

    await act(async () => {
      fireEvent.keyDown(screen.getByTestId("spell-name-input"), {
        key: "Enter",
        code: "Enter",
      });
    });

    expect(
      vi.mocked(invoke).mock.calls.filter((call) => call[0] === "create_spell"),
    ).toHaveLength(1);
    await waitFor(() => {
      expect(screen.getByTestId("library-route")).toBeTruthy();
    });
  });

  it("sets beforeunload returnValue when there are unsaved changes", () => {
    renderNewSpell();

    fireEvent.change(screen.getByTestId("spell-name-input"), { target: { value: "Light" } });

    const event = new Event("beforeunload", { cancelable: true });
    Object.defineProperty(event, "returnValue", {
      configurable: true,
      value: undefined,
      writable: true,
    });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect((event as Event & { returnValue: string }).returnValue).toBe("");
  });
});

describe("SpellEditor accessibility and structured validation (Task 3)", () => {
  beforeEach(() => {
    alertMock.mockClear();
    confirmMock.mockClear();
    vi.mocked(invoke).mockReset();
    useNotifications.setState({ notifications: [] });
  });

  afterEach(() => {
    cleanup();
  });

  it("uses spell-name-error instead of the legacy error-name-required testid", () => {
    renderNewSpell();
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    expect(screen.queryByTestId("error-name-required")).toBeNull();
    expect(screen.getByTestId("spell-name-error")).toBeTruthy();
  });

  it("marks invalid fields with aria-invalid and wires aria-describedby to inline errors after failed save", async () => {
    renderNewSpell();
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    const name = screen.getByTestId("spell-name-input");
    await waitFor(() => {
      expect(name.getAttribute("aria-invalid")).toBe("true");
    });
    expect(name.getAttribute("aria-describedby")).toBe("spell-name-error");
    const err = screen.getByTestId("spell-name-error");
    expect(err.id).toBe("spell-name-error");
  });

  it("wires aria-invalid and aria-describedby for the description textarea when it is invalid", async () => {
    renderNewSpell();

    fireEvent.click(screen.getByTestId("btn-save-spell"));

    const description = screen.getByTestId("spell-description-textarea");
    await waitFor(() => {
      expect(description.getAttribute("aria-invalid")).toBe("true");
    });
    expect(description.getAttribute("aria-describedby")).toBe("error-description-required");
    expect(screen.getByTestId("error-description-required").id).toBe("error-description-required");
  });

  it("clears description ARIA error wiring once the textarea becomes valid again", async () => {
    renderNewSpell();

    fireEvent.click(screen.getByTestId("btn-save-spell"));

    const description = screen.getByTestId("spell-description-textarea");
    await waitFor(() => {
      expect(description.getAttribute("aria-invalid")).toBe("true");
    });

    fireEvent.change(description, { target: { value: "Recovered description" } });

    await waitFor(() => {
      expect(description.getAttribute("aria-invalid")).toBeNull();
      expect(description.getAttribute("aria-describedby")).toBeNull();
    });
  });

  it("wires aria-invalid and aria-describedby for invalid level, school, sphere, and classes fields", async () => {
    const expectAriaErrorWiring = (inputTestId: string, errorTestId: string) => {
      const input = screen.getByTestId(inputTestId);
      expect(input.getAttribute("aria-invalid")).toBe("true");
      expect(input.getAttribute("aria-describedby")).toBe(errorTestId);
      expect(screen.getByTestId(errorTestId).id).toBe(errorTestId);
    };

    const invalidLevelSpell = await renderEditSpell(baseLoadedSpell({ level: 13 }));
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    await waitFor(() => {
      expect(screen.getByTestId("error-level-range")).toBeTruthy();
    });
    const levelInput = screen.getByTestId("spell-level-input");
    expect(levelInput.getAttribute("aria-invalid")).toBe("true");
    expect(levelInput.getAttribute("aria-describedby")).toBe("error-level-range spell-level-display");
    expect(screen.getByTestId("error-level-range").id).toBe("error-level-range");
    invalidLevelSpell.unmount();

    const missingSchoolSpell = await renderEditSpell(baseLoadedSpell({ school: "" }));
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    await waitFor(() => {
      expect(screen.getByTestId("error-school-required-arcane-tradition")).toBeTruthy();
    });
    expectAriaErrorWiring("spell-school-input", "error-school-required-arcane-tradition");
    missingSchoolSpell.unmount();

    const newSpell = renderNewSpell();
    fireEvent.change(screen.getByTestId("spell-tradition-select"), { target: { value: "DIVINE" } });
    await waitFor(() => {
      expect(screen.getByTestId("error-sphere-required-divine-tradition")).toBeTruthy();
    });
    expectAriaErrorWiring("spell-sphere-input", "error-sphere-required-divine-tradition");
    newSpell.unmount();

    await renderEditSpell(
      baseLoadedSpell({
        level: 10,
        school: "Evocation",
        sphere: null,
        classList: "Cleric",
      }),
    );
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    await waitFor(() => {
      expect(screen.getByTestId("error-epic-arcane-class-restriction")).toBeTruthy();
    });
    expectAriaErrorWiring("spell-classes-input", "error-epic-arcane-class-restriction");
  });

  it("concatenates multiple spell-level error ids into aria-describedby", async () => {
    await renderEditSpell(
      baseLoadedSpell({
        level: 13,
        school: "Evocation",
        sphere: "Fire",
        isQuestSpell: 1,
        isCantrip: 1,
        classList: "Mage",
      }),
    );

    fireEvent.click(screen.getByTestId("btn-save-spell"));

    await waitFor(() => {
      expect(screen.getByTestId("error-level-range")).toBeTruthy();
      expect(screen.getByTestId("error-epic-quest-conflict")).toBeTruthy();
      expect(screen.getByTestId("error-cantrip-level")).toBeTruthy();
    });

    const level = screen.getByTestId("spell-level-input");
    expect(level.getAttribute("aria-invalid")).toBe("true");
    expect(level.getAttribute("aria-describedby")?.split(/\s+/)).toEqual([
      "error-level-range",
      "error-epic-quest-conflict",
      "error-cantrip-level",
      "spell-level-display",
    ]);
    expect(screen.getByTestId("error-level-range").id).toBe("error-level-range");
    expect(screen.getByTestId("error-epic-quest-conflict").id).toBe("error-epic-quest-conflict");
    expect(screen.getByTestId("error-cantrip-level").id).toBe("error-cantrip-level");
  });

  it("reveals and focuses the hidden school field for an invalid epic Divine spell", async () => {
    await renderEditSpell(
      baseLoadedSpell({
        level: 10,
        school: "",
        sphere: "Healing",
      }),
    );

    fireEvent.click(screen.getByTestId("btn-save-spell"));

    const school = await screen.findByTestId("spell-school-input");
    await waitFor(() => {
      expect(school.getAttribute("aria-invalid")).toBe("true");
      expect(document.activeElement).toBe(school);
    });
  });

  it("reveals and focuses the hidden sphere field for an invalid Arcane quest spell", async () => {
    await renderEditSpell(
      baseLoadedSpell({
        level: 8,
        school: "Evocation",
        sphere: "",
        isQuestSpell: 1,
      }),
    );

    fireEvent.click(screen.getByTestId("btn-save-spell"));

    const sphere = await screen.findByTestId("spell-sphere-input");
    await waitFor(() => {
      expect(sphere.getAttribute("aria-invalid")).toBe("true");
      expect(document.activeElement).toBe(sphere);
    });
  });

  it("omits aria-invalid when a top-level field currently has no error", () => {
    renderNewSpell();
    const name = screen.getByTestId("spell-name-input");
    expect(name.hasAttribute("aria-invalid")).toBe(false);
  });

  it("moves focus to the first invalid field on first failed submit", async () => {
    renderNewSpell();
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByTestId("spell-name-input"));
    });
  });

  it("wraps first-shown inline validation feedback in an animate-in container", () => {
    renderNewSpell();
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    const err = screen.getByTestId("spell-name-error");
    expect(err.parentElement?.className ?? "").toMatch(/animate-in/);
    expect(err.parentElement?.className ?? "").toMatch(/fade-in/);
  });

  it("keeps tradition conflict feedback inline with role=alert for discoverability", async () => {
    await renderEditSpell(
      baseLoadedSpell({
        school: "Evocation",
        sphere: "Fire",
        canonicalData: null,
      }),
    );
    const banner = screen.getByTestId("error-tradition-conflict");
    expect(banner.getAttribute("role")).toBe("alert");
    expect(banner.id).toBe("error-tradition-conflict");
    const tradition = screen.getByTestId("spell-tradition-select");
    expect(tradition.getAttribute("aria-invalid")).toBe("true");
    expect(tradition.getAttribute("aria-describedby")).toBe("error-tradition-conflict");
  });

  it("applies the danger focus-visible ring to every invalid top-level field driven by field validation", async () => {
    const invalidArcaneSpell = await renderEditSpell(
      baseLoadedSpell({
        name: "",
        description: "",
        level: 13,
        school: "",
        sphere: null,
      }),
    );

    fireEvent.click(screen.getByTestId("btn-save-spell"));

    await waitFor(() => {
      expect(screen.getByTestId("spell-name-error")).toBeTruthy();
      expect(screen.getByTestId("error-description-required")).toBeTruthy();
      expect(screen.getByTestId("error-level-range")).toBeTruthy();
      expect(screen.getByTestId("error-school-required-arcane")).toBeTruthy();
    });

    [
      "spell-name-input",
      "spell-description-textarea",
      "spell-level-input",
      "spell-school-input",
    ].forEach(expectDangerFocusRing);

    invalidArcaneSpell.unmount();

    const newSpell = renderNewSpell();

    fireEvent.change(screen.getByTestId("spell-tradition-select"), { target: { value: "DIVINE" } });

    await waitFor(() => {
      expect(screen.getByTestId("error-sphere-required-divine-tradition")).toBeTruthy();
    });
    expectDangerFocusRing("spell-sphere-input");

    newSpell.unmount();

    const epicSpell = await renderEditSpell(
      baseLoadedSpell({
        level: 10,
        school: "Evocation",
        sphere: null,
        classList: "Cleric",
      }),
    );
    fireEvent.click(screen.getByTestId("btn-save-spell"));

    await waitFor(() => {
      expect(screen.getByTestId("error-epic-arcane-class-restriction")).toBeTruthy();
    });
    expectDangerFocusRing("spell-classes-input");

    epicSpell.unmount();

    await renderEditSpell(
      baseLoadedSpell({
        school: "Evocation",
        sphere: "Fire",
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("error-tradition-conflict")).toBeTruthy();
    });
    expectDangerFocusRing("spell-tradition-select");
  });

  it("applies the standard focus-visible ring to every interactive SpellEditor control", async () => {
    await renderEditSpell(
      baseLoadedSpell({
        contentHash: HASH_FIXTURE,
        artifacts: [
          {
            id: 1,
            spellId: 1,
            type: "import",
            path: "spell.txt",
            hash: HASH_FIXTURE,
            importedAt: "2024-01-01T00:00:00Z",
          },
        ],
      }),
    );

    [
      "print-page-size-select",
      "btn-print-compact",
      "btn-print-stat-block",
      "btn-delete-spell",
      "btn-cancel-edit",
      "btn-save-spell",
      "spell-detail-hash-copy",
      "spell-detail-hash-expand",
      "spell-name-input",
      "spell-level-input",
      "chk-cantrip",
      "chk-quest",
      "spell-tradition-select",
      "spell-school-input",
      "spell-classes-input",
      "spell-source-input",
      "spell-edition-input",
      "spell-author-input",
      "spell-license-input",
      "chk-reversible",
      "spell-tags-input",
      "spell-description-textarea",
      "btn-reparse-artifact",
    ].forEach(expectStandardFocusRing);

    fireEvent.click(screen.getByTestId("detail-components-expand"));
    await waitFor(() => {
      expect(screen.getByTestId("component-checkboxes")).toBeTruthy();
    });
    [
      "component-checkbox-verbal",
      "component-checkbox-somatic",
      "component-checkbox-material",
    ].forEach(expectStandardFocusRing);

    fireEvent.click(screen.getByTestId("component-checkbox-material"));
    await waitFor(() => {
      expect(screen.getByTestId("material-subform")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("material-component-add"));
    await waitFor(() => {
      expect(screen.getByTestId("material-component-remove")).toBeTruthy();
    });
    expectStandardFocusRing("material-component-consumed");
    expectDangerFocusRing("material-component-remove");

    fireEvent.change(screen.getByTestId("spell-tradition-select"), { target: { value: "DIVINE" } });
    await waitFor(() => {
      expect(screen.getByTestId("spell-sphere-input")).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId("spell-sphere-input"), {
      target: { value: "Healing" },
    });
    await waitFor(() => {
      expect(screen.queryByTestId("error-sphere-required-divine-tradition")).toBeNull();
    });
    expectStandardFocusRing("spell-sphere-input");

    DETAIL_FIELD_ORDER.forEach((field) => {
      const kebabField = field.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
      expectStandardFocusRing(`detail-${kebabField}-input`);
      expectStandardFocusRing(`detail-${kebabField}-expand`);
    });
  });

  it("shows range scalar validation with correct copy, ARIA, and same-container adjacency", async () => {
    await renderEditSpell(
      baseLoadedSpell({
        canonicalData: JSON.stringify({
          range: {
            kind: "distance",
            unit: "ft",
            distance: { mode: "fixed", value: -1 },
            text: "-1 ft",
          },
        }),
      }),
    );
    fireEvent.click(screen.getByTestId("detail-range-expand"));
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    const scalarRoot = screen.getByTestId("range-scalar");
    const baseInput = screen.getByTestId("range-base-value");
    await waitFor(() => {
      expect(baseInput.getAttribute("aria-invalid")).toBe("true");
    });
    expect(baseInput.getAttribute("aria-describedby")).toBe("error-range-base-value");
    const msg = within(scalarRoot).getByTestId("error-range-base-value");
    expect(msg.textContent?.trim()).toBe("Base value must be 0 or greater");
    expect(msg.id).toBe("error-range-base-value");
  });

  it("expands and focuses the first invalid structured field when it is collapsed on submit", async () => {
    await renderEditSpell(
      baseLoadedSpell({
        canonicalData: JSON.stringify({
          range: {
            kind: "distance",
            unit: "ft",
            distance: { mode: "fixed", value: -1 },
            text: "-1 ft",
          },
        }),
      }),
    );

    expect(screen.getByTestId("detail-range-expand").getAttribute("aria-expanded")).toBe(
      "false",
    );

    fireEvent.click(screen.getByTestId("btn-save-spell"));

    await waitFor(() => {
      expect(screen.getByTestId("detail-range-expand").getAttribute("aria-expanded")).toBe(
        "true",
      );
    });

    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });

    expect(document.activeElement).toBe(screen.getByTestId("range-base-value"));
  });

  it("omits aria-invalid on ScalarInput when the active scalar field is valid", async () => {
    await renderEditSpell(
      baseLoadedSpell({
        canonicalData: JSON.stringify({
          range: {
            kind: "distance",
            unit: "ft",
            distance: { mode: "fixed", value: 120 },
            text: "120 ft",
          },
        }),
      }),
    );

    fireEvent.click(screen.getByTestId("detail-range-expand"));

    const baseInput = screen.getByTestId("range-base-value");
    expect(baseInput.hasAttribute("aria-invalid")).toBe(false);
  });

  it("shows casting-time base validation with correct copy, ARIA, and same-container adjacency", async () => {
    await renderEditSpell(
      baseLoadedSpell({
        canonicalData: JSON.stringify({
          casting_time: {
            unit: "segment",
            base_value: -1,
            per_level: 0,
            level_divisor: 1,
            text: "-1",
          },
        }),
      }),
    );
    fireEvent.click(screen.getByTestId("detail-casting-time-expand"));
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    const baseInput = screen.getByTestId("casting-time-base-value");
    await waitFor(() => {
      expect(baseInput.getAttribute("aria-invalid")).toBe("true");
    });
    expect(baseInput.getAttribute("aria-describedby")).toBe("error-casting-time-base-value");
    const structured = screen.getByTestId("structured-field-input");
    const msg = within(structured).getByTestId("error-casting-time-base-value");
    expect(msg.textContent?.trim()).toBe("Base value must be 0 or greater");
    expect(structured.contains(baseInput)).toBe(true);
    expect(structured.contains(msg)).toBe(true);
  });

  it("shows area radius validation with correct copy, ARIA, and same-container adjacency", async () => {
    await renderEditSpell(
      baseLoadedSpell({
        canonicalData: JSON.stringify({
          area: {
            kind: "radius_circle",
            radius: { mode: "fixed", value: -1 },
            shape_unit: "ft",
            text: "-1 ft radius",
          },
        }),
      }),
    );
    fireEvent.click(screen.getByTestId("detail-area-expand"));
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    const scalarRoot = screen.getByTestId("area-form-radius");
    const baseInput = screen.getByTestId("area-form-radius-value");
    await waitFor(() => {
      expect(baseInput.getAttribute("aria-invalid")).toBe("true");
    });
    expect(baseInput.getAttribute("aria-describedby")).toBe("error-area-form-radius-value");
    const msg = within(scalarRoot).getByTestId("error-area-form-radius-value");
    expect(msg.textContent?.trim()).toBe("Radius must be 0 or greater");
    expect(msg.id).toBe("error-area-form-radius-value");
  });

  it("keeps the range detail label, expand control, and structured surface in a coherent order", async () => {
    await renderEditSpell(
      baseLoadedSpell({
        canonicalData: JSON.stringify({
          range: {
            kind: "distance",
            unit: "ft",
            distance: { mode: "fixed", value: 120 },
            text: "120 ft",
          },
        }),
      }),
    );

    fireEvent.click(screen.getByTestId("detail-range-expand"));

    const root = detailFieldRoot("range");
    const label = root.querySelector('label[for="detail-range-input"]');
    const input = screen.getByTestId("detail-range-input");
    const expand = screen.getByTestId("detail-range-expand");
    const panel = document.getElementById("detail-range-panel") as HTMLElement;

    expect(label).toBeTruthy();
    expect(isBefore(label as Element, input)).toBe(true);
    expect(isBefore(input, expand)).toBe(true);
    expect(isBefore(expand, panel)).toBe(true);

    const structured = within(panel).getByTestId("structured-field-input");
    const kindSelect = within(structured).getByTestId("range-kind-select");
    const preview = within(panel).getByTestId("range-text-preview");

    expect(structured.contains(preview)).toBe(true);
    expect((kindSelect.compareDocumentPosition(preview) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
      .toBe(true);
  });

  it("keeps the components panel surface subtle and nests the material subform inside it", async () => {
    await renderEditSpell(
      baseLoadedSpell({
        canonicalData: JSON.stringify({
          components: {
            verbal: true,
            somatic: true,
            material: true,
          },
          material_components: [
            {
              name: "ruby dust",
              quantity: 1,
              gpValue: 100,
              isConsumed: true,
            },
          ],
        }),
      }),
    );

    fireEvent.click(screen.getByTestId("detail-components-expand"));

    const root = detailFieldRoot("components");
    const label = root.querySelector('label[for="detail-components-input"]');
    const input = screen.getByTestId("detail-components-input");
    const expand = screen.getByTestId("detail-components-expand");
    const panel = document.getElementById("detail-components-panel") as HTMLElement;
    const componentGroup = within(panel).getByTestId("component-checkboxes");
    const materialSubform = within(componentGroup).getByTestId("material-subform");

    expect(label).toBeTruthy();
    expect(isBefore(label as Element, input)).toBe(true);
    expect(isBefore(input, expand)).toBe(true);
    expect(isBefore(expand, panel)).toBe(true);
    expect(panel.contains(componentGroup)).toBe(true);
    expect(componentGroup.contains(materialSubform)).toBe(true);
  });

  it("keeps special-hint text below the structured group inside the expanded panel", async () => {
    await renderEditSpell(
      baseLoadedSpell({
        canonicalData: JSON.stringify({
          range: {
            kind: "special",
            raw_legacy_value: "Far beyond the stars",
            text: "Far beyond the stars",
          },
        }),
      }),
    );

    fireEvent.click(screen.getByTestId("detail-range-expand"));

    const panel = document.getElementById("detail-range-panel") as HTMLElement;
    const structured = within(panel).getByTestId("structured-field-input");
    const hint = within(panel).getByTestId("detail-range-special-hint");

    expect(panel.contains(structured)).toBe(true);
    expect(panel.contains(hint)).toBe(true);
    expect((structured.compareDocumentPosition(hint) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0)
      .toBe(true);
  });

  it("moves focus to the first focusable child when expanding a structured panel", async () => {
    await renderEditSpell(
      baseLoadedSpell({
        canonicalData: JSON.stringify({
          range: {
            kind: "distance",
            unit: "ft",
            distance: { mode: "fixed", value: 30 },
            text: "30 ft",
          },
        }),
      }),
    );

    fireEvent.click(screen.getByTestId("detail-range-expand"));

    // Structured panel renders immediately when canonical data is present (no async parse)
    const panel = document.getElementById("detail-range-panel") as HTMLElement;
    expect(panel).not.toBeNull();
    const kindSelect = within(panel).getByTestId("range-kind-select");
    expect(kindSelect).not.toBeNull();

    // The focus management effect queues a requestAnimationFrame; flush it via act
    await act(async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    });

    // After RAF flush, focus should be on the first focusable child
    expect(document.activeElement).toBe(kindSelect);
  });
});

describe("SpellEditor save progress and success feedback (Task 4)", () => {
  beforeEach(() => {
    alertMock.mockClear();
    confirmMock.mockClear();
    vi.mocked(invoke).mockReset();
    useNotifications.setState({ notifications: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("keeps the save label as Save Spell until 300ms when save is still pending, then shows Saving…", async () => {
    vi.useFakeTimers();
    let resolveSave: () => void;
    const savePromise = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "create_spell") return savePromise as Promise<unknown>;
      return Promise.resolve(undefined);
    });

    renderNewSpellWithLibraryAndNotifications();
    fillValidNewArcaneSpell();
    const saveBtn = screen.getByTestId("btn-save-spell");
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    expect(saveBtn.textContent?.trim()).toBe("Save Spell");
    await act(async () => {
      vi.advanceTimersByTime(299);
    });
    expect(saveBtn.textContent?.trim()).toBe("Save Spell");
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(saveBtn.textContent?.trim()).toBe("Saving…");
    await act(async () => {
      resolveSave?.();
    });
    vi.useRealTimers();
    await waitFor(() => {
      expect(screen.getByTestId("library-route")).toBeTruthy();
    });
    expect(screen.getByTestId("toast-notification-success").textContent ?? "").toContain(
      "Spell saved.",
    );
  });

  it("resolves save before 300ms without ever showing Saving…", async () => {
    vi.useFakeTimers();
    let resolveSave: () => void;
    const savePromise = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "create_spell") return savePromise as Promise<unknown>;
      return Promise.resolve(undefined);
    });

    renderNewSpellWithLibraryAndNotifications();
    fillValidNewArcaneSpell();
    const saveBtn = screen.getByTestId("btn-save-spell");
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    expect(saveBtn.textContent?.trim()).toBe("Save Spell");
    await act(async () => {
      resolveSave?.();
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      vi.advanceTimersByTime(299);
    });
    vi.useRealTimers();
    await waitFor(() => {
      expect(screen.getByTestId("library-route")).toBeTruthy();
    });
    expect(screen.queryByText("Saving…")).toBeNull();
  });

  it("ignores a second save click while the first save is still in flight (single invoke)", async () => {
    let resolveSave: () => void;
    const savePromise = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "create_spell") return savePromise as Promise<unknown>;
      return Promise.resolve(undefined);
    });

    renderNewSpellWithLibraryAndNotifications();
    fillValidNewArcaneSpell();
    const saveBtn = screen.getByTestId("btn-save-spell");
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    expect(vi.mocked(invoke).mock.calls.filter((c) => c[0] === "create_spell")).toHaveLength(1);
    await act(async () => {
      resolveSave?.();
    });
    await waitFor(() => {
      expect(screen.getByTestId("library-route")).toBeTruthy();
    });
  });

  it("disables delete and cancel immediately when save starts, and keeps them disabled while Saving… shows", async () => {
    vi.useFakeTimers();
    let resolveSave: () => void;
    const savePromise = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "update_spell") return savePromise as Promise<unknown>;
      if (cmd === "get_spell") {
        return Promise.resolve(baseLoadedSpell());
      }
      return Promise.resolve(undefined);
    });

    await act(async () => {
      render(
        <div>
          <RouterProvider
            router={createMemoryRouter(
              [
                { path: "/", element: <div data-testid="library-route">Library</div> },
                { path: "/edit/:id", element: <SpellEditor /> },
              ],
              { initialEntries: ["/edit/1"] },
            )}
          />
          <NotificationViewport />
        </div>,
      );
    });
    vi.useRealTimers();
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).toBeNull();
    });
    vi.useFakeTimers();

    const saveBtn = screen.getByTestId("btn-save-spell");
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    expect(saveBtn.textContent?.trim()).toBe("Save Spell");
    expect((screen.getByTestId("btn-delete-spell") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("btn-cancel-edit") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(saveBtn.textContent?.trim()).toBe("Saving…");
    expect((screen.getByTestId("btn-delete-spell") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("btn-cancel-edit") as HTMLButtonElement).disabled).toBe(true);
    const nameInput = screen.getByTestId("spell-name-input") as HTMLInputElement;
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: "Tampered" } });
    });
    expect(nameInput.value).toBe("Loaded Spell");
    await act(async () => {
      resolveSave?.();
    });
    vi.useRealTimers();
    await waitFor(() => {
      expect(screen.getByTestId("library-route")).toBeTruthy();
    });
  });

  it("does not accept name edits while save is in flight (including before Saving… appears)", async () => {
    vi.useFakeTimers();
    let resolveSave: () => void;
    const savePromise = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "create_spell") return savePromise as Promise<unknown>;
      return Promise.resolve(undefined);
    });

    renderNewSpellWithLibraryAndNotifications();
    fillValidNewArcaneSpell();
    const nameInput = screen.getByTestId("spell-name-input") as HTMLInputElement;
    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-save-spell"));
    });
    expect(screen.getByTestId("btn-save-spell").textContent?.trim()).toBe("Save Spell");
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: "Changed" } });
    });
    expect(nameInput.value).toBe("Light");
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId("btn-save-spell").textContent?.trim()).toBe("Saving…");
    await act(async () => {
      resolveSave?.();
    });
    vi.useRealTimers();
    await waitFor(() => {
      expect(screen.getByTestId("library-route")).toBeTruthy();
    });
  });

  it("pushes success notification before navigation (editor still mounted)", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "create_spell") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    let editorMountedWhenPushed = false;
    const origPush = useNotifications.getState().pushNotification;
    const spy = vi
      .spyOn(useNotifications.getState(), "pushNotification")
      .mockImplementation((k, m) => {
        editorMountedWhenPushed = screen.queryByTestId("spell-name-input") !== null;
        origPush(k, m);
      });

    renderNewSpellWithLibraryAndNotifications();
    fillValidNewArcaneSpell();
    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-save-spell"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("library-route")).toBeTruthy();
    });
    expect(editorMountedWhenPushed).toBe(true);
    expect(screen.getByTestId("toast-notification-success").textContent ?? "").toContain(
      "Spell saved.",
    );
    spy.mockRestore();
  });

  it("includes structured component specs in the create payload after structured editing", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "create_spell") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    renderNewSpellWithLibraryAndNotifications();
    fillValidNewArcaneSpell();

    fireEvent.click(screen.getByTestId("detail-components-expand"));
    await waitFor(() => {
      expect(screen.getByTestId("component-checkboxes")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("component-checkbox-material"));
    await waitFor(() => {
      expect(screen.getByTestId("material-subform")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("material-component-add"));
    fireEvent.change(screen.getByTestId("material-component-name"), {
      target: { value: "Bat guano" },
    });
    fireEvent.change(screen.getByTestId("material-component-gp-value"), {
      target: { value: "50" },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-save-spell"));
    });

    await waitFor(() => {
      expect(vi.mocked(invoke).mock.calls.some((call) => call[0] === "create_spell")).toBe(true);
    });

    const createCall = vi.mocked(invoke).mock.calls.find((call) => call[0] === "create_spell");
    const payload = (createCall?.[1] as { spell: SpellDetail }).spell;

    expect(payload.componentsSpec).toMatchObject({ material: true });
    expect(payload.materialComponentsSpec).toMatchObject([
      {
        name: "Bat guano",
        gpValue: 50,
      },
    ]);
  });

  it("includes structured component specs in the update payload after structured editing", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_spell") return Promise.resolve(baseLoadedSpell());
      if (cmd === "update_spell") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    await act(async () => {
      render(
        <div>
          <RouterProvider
            router={createMemoryRouter(
              [
                { path: "/", element: <div data-testid="library-route">Library</div> },
                { path: "/edit/:id", element: <SpellEditor /> },
              ],
              { initialEntries: ["/edit/1"] },
            )}
          />
          <NotificationViewport />
        </div>,
      );
    });

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).toBeNull();
    });

    fireEvent.click(screen.getByTestId("detail-components-expand"));
    await waitFor(() => {
      expect(screen.getByTestId("component-checkboxes")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("component-checkbox-material"));
    await waitFor(() => {
      expect(screen.getByTestId("material-subform")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("material-component-add"));
    fireEvent.change(screen.getByTestId("material-component-name"), {
      target: { value: "Amber resin" },
    });
    fireEvent.change(screen.getByTestId("material-component-unit"), {
      target: { value: "dram" },
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-save-spell"));
    });

    await waitFor(() => {
      expect(vi.mocked(invoke).mock.calls.some((call) => call[0] === "update_spell")).toBe(true);
    });

    const updateCall = vi.mocked(invoke).mock.calls.find((call) => call[0] === "update_spell");
    const payload = (updateCall?.[1] as { spell: SpellDetail }).spell;

    expect(payload.componentsSpec).toMatchObject({ material: true });
    expect(payload.materialComponentsSpec).toMatchObject([
      {
        name: "Amber resin",
        unit: "dram",
      },
    ]);
  });

  it("shows the same success toast after update_spell", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_spell") return Promise.resolve(baseLoadedSpell());
      if (cmd === "update_spell") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    await act(async () => {
      render(
        <div>
          <RouterProvider
            router={createMemoryRouter(
              [
                { path: "/", element: <div data-testid="library-route">Library</div> },
                { path: "/edit/:id", element: <SpellEditor /> },
              ],
              { initialEntries: ["/edit/1"] },
            )}
          />
          <NotificationViewport />
        </div>,
      );
    });
    await waitFor(() => {
      expect(screen.queryByText("Loading...")).toBeNull();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-save-spell"));
    });
    await waitFor(() => {
      expect(screen.getByTestId("library-route")).toBeTruthy();
    });
    expect(screen.getByTestId("toast-notification-success").textContent ?? "").toContain(
      "Spell saved.",
    );
  });

  it("does not move focus to the toast dismiss control on successful save", async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "create_spell") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });

    renderNewSpellWithLibraryAndNotifications();
    fillValidNewArcaneSpell();
    const saveBtn = screen.getByTestId("btn-save-spell");
    saveBtn.focus();
    await act(async () => {
      fireEvent.click(saveBtn);
    });
    await waitFor(() => {
      expect(screen.getByTestId("toast-notification-success")).toBeTruthy();
    });
    const dismiss = screen.getByTestId("toast-dismiss-button");
    expect(dismiss).not.toBe(document.activeElement);
  });

  it("keeps save disabled after failed submit until blocking errors are cleared", () => {
    renderNewSpell();
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    const saveBtn = screen.getByTestId("btn-save-spell") as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    fireEvent.change(screen.getByTestId("spell-name-input"), { target: { value: "X" } });
    fireEvent.change(screen.getByTestId("spell-description-textarea"), { target: { value: "Y" } });
    fireEvent.change(screen.getByTestId("spell-school-input"), { target: { value: "Evocation" } });
    expect(saveBtn.disabled).toBe(false);
  });

  it("resets validation UI and hides stale editor content while a different spell loads into the same editor", async () => {
    let resolveSecondSpell: ((spell: SpellDetail) => void) | undefined;
    const secondSpellPromise = new Promise<SpellDetail>((resolve) => {
      resolveSecondSpell = resolve;
    });
    const firstHash = "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const secondHash = "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) => {
      if (cmd !== "get_spell") return Promise.resolve(undefined);
      const spellId = (args as { id?: number } | undefined)?.id;
      if (spellId === 1) {
        return Promise.resolve(
          baseLoadedSpell({ id: 1, name: "First Spell", contentHash: firstHash }),
        );
      }
      if (spellId === 2) {
        return secondSpellPromise;
      }
      return Promise.resolve(undefined);
    });

    const router = createMemoryRouter([{ path: "/edit/:id", element: <SpellEditor /> }], {
      initialEntries: ["/edit/1"],
    });

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).toBeNull();
    });

    fireEvent.click(screen.getByTestId("spell-detail-hash-expand"));
    expect(screen.getByTestId("spell-detail-hash-display").textContent).toBe(firstHash);

    fireEvent.change(screen.getByTestId("spell-description-textarea"), { target: { value: "" } });
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    expect(screen.getByTestId("error-description-required")).toBeTruthy();
    expect(screen.getByTestId("spell-save-validation-hint")).toBeTruthy();

    await act(async () => {
      await router.navigate("/edit/2");
    });

    await waitFor(() => {
      expect(screen.queryByTestId("error-description-required")).toBeNull();
      expect(screen.queryByTestId("spell-save-validation-hint")).toBeNull();
    });
    expect(screen.getByText("Loading...")).toBeTruthy();
    expect(screen.queryByTestId("btn-save-spell")).toBeNull();

    await act(async () => {
      resolveSecondSpell?.(
        baseLoadedSpell({
          id: 2,
          name: "Second Spell",
          contentHash: secondHash,
        }),
      );
    });

    await waitFor(() => {
      expect((screen.getByTestId("spell-name-input") as HTMLInputElement).value).toBe(
        "Second Spell",
      );
    });
    expect(screen.getByTestId("btn-save-spell")).toBeTruthy();
    expect(screen.queryByTestId("error-description-required")).toBeNull();
    expect(screen.queryByTestId("spell-save-validation-hint")).toBeNull();
    expect(screen.getByTestId("spell-detail-hash-display").textContent).toBe(
      `${secondHash.slice(0, 16)}...`,
    );
  });

  it("keeps the editor visible until save resolves, then navigates to Library", async () => {
    let resolveSave: () => void;
    const savePromise = new Promise<void>((resolve) => {
      resolveSave = resolve;
    });
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "create_spell") return savePromise as Promise<unknown>;
      return Promise.resolve(undefined);
    });

    renderNewSpellWithLibraryAndNotifications();
    fillValidNewArcaneSpell();
    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-save-spell"));
    });
    expect(screen.getByTestId("spell-name-input")).toBeTruthy();
    expect(screen.queryByTestId("library-route")).toBeNull();
    await act(async () => {
      resolveSave?.();
    });
    await waitFor(() => {
      expect(screen.getByTestId("library-route")).toBeTruthy();
    });
  });
});
