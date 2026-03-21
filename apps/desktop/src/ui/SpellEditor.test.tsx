// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import type { SpellDetail } from "../types/spell";
import { useNotifications } from "../store/useNotifications";
import { NotificationViewport } from "./components/NotificationViewport";
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
  fireEvent.change(screen.getByTestId("spell-description-textarea"), { target: { value: "Bright." } });
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
      within(fieldContainer("spell-description-textarea")).getByTestId("error-description-required"),
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
    expect(within(fieldContainer("spell-sphere-input")).getByTestId("error-sphere-required-divine-tradition")).toBeTruthy();
    fireEvent.change(tradition, { target: { value: "ARCANE" } });
    expect(screen.getByTestId("error-school-required-arcane-tradition")).toBeTruthy();
    expect(within(fieldContainer("spell-school-input")).getByTestId("error-school-required-arcane-tradition")).toBeTruthy();
  });

  it("validates tradition-dependent fields on tradition change without waiting for blur", () => {
    renderNewSpell();
    fireEvent.change(screen.getByTestId("spell-tradition-select"), { target: { value: "DIVINE" } });
    expect(
      within(fieldContainer("spell-sphere-input")).getByTestId("error-sphere-required-divine-tradition"),
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
      within(fieldContainer("spell-school-input")).getByTestId("error-school-required-arcane-tradition"),
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
    fireEvent.change(screen.getByTestId("spell-description-textarea"), { target: { value: "Desc" } });
    fireEvent.click(screen.getByTestId("btn-save-spell"));
    expect(
      within(fieldContainer("spell-school-input")).getByTestId("error-school-required-arcane-tradition"),
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
    expect(screen.getByTestId("toast-notification-success").textContent ?? "").toContain("Spell saved.");
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
    const spy = vi.spyOn(useNotifications.getState(), "pushNotification").mockImplementation((k, m) => {
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
    expect(screen.getByTestId("toast-notification-success").textContent ?? "").toContain("Spell saved.");
    spy.mockRestore();
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
    expect(screen.getByTestId("toast-notification-success").textContent ?? "").toContain("Spell saved.");
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

    vi.mocked(invoke).mockImplementation((cmd: string, args?: unknown) => {
      if (cmd !== "get_spell") return Promise.resolve(undefined);
      const spellId = (args as { id?: number } | undefined)?.id;
      if (spellId === 1) {
        return Promise.resolve(baseLoadedSpell({ id: 1, name: "First Spell" }));
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
      resolveSecondSpell?.(baseLoadedSpell({ id: 2, name: "Second Spell" }));
    });

    await waitFor(() => {
      expect((screen.getByTestId("spell-name-input") as HTMLInputElement).value).toBe("Second Spell");
    });
    expect(screen.getByTestId("btn-save-spell")).toBeTruthy();
    expect(screen.queryByTestId("error-description-required")).toBeNull();
    expect(screen.queryByTestId("spell-save-validation-hint")).toBeNull();
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
