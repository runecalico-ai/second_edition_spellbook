// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import type { RangeSpec, SpellDetail } from "../types/spell";
import SpellEditor from "./SpellEditor";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const { alertMock, confirmMock, hydrateSpellMock } = vi.hoisted(() => ({
  alertMock: vi.fn().mockResolvedValue(undefined),
  confirmMock: vi.fn().mockResolvedValue(false),
  hydrateSpellMock: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    useBlocker: () => ({ state: "unblocked" as const }),
  };
});

vi.mock("./hooks/useSpellParser", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./hooks/useSpellParser")>();
  return {
    ...mod,
    useSpellParser: () => ({
      hydrateSpell: hydrateSpellMock,
      parsersPending: false,
      setParsersPending: vi.fn(),
      parserFallbackFields: new Set<string>(),
      setParserFallbackFields: vi.fn(),
    }),
  };
});

vi.mock("../store/useModal", () => ({
  useModal: () => ({
    alert: alertMock,
    confirm: confirmMock,
  }),
}));

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

  render(<RouterProvider router={router} />);

  await waitFor(() => {
    expect(screen.queryByText("Loading...")).toBeNull();
  });
}

describe("SpellEditor hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("hydrates loaded parser state through the shared hook", async () => {
    const hydratedRange: RangeSpec = {
      kind: "distance",
      unit: "ft",
      text: "999 ft",
      distance: {
        mode: "fixed",
        value: 999,
      },
    };

    hydrateSpellMock.mockImplementation(
      (_data: SpellDetail, isActive: () => boolean, setters: {
        setStructuredRange: (value: RangeSpec | null) => void;
        setSuppressExpandParse: (
          updater: (
            prev: Partial<Record<string, boolean>>,
          ) => Partial<Record<string, boolean>>,
        ) => void;
      }) => {
        if (!isActive()) return;
        setters.setStructuredRange(hydratedRange);
        setters.setSuppressExpandParse((prev) => ({ ...prev, range: true }));
      },
    );

    const spell = baseLoadedSpell({ canonicalData: null, range: "120 ft" });

    await renderEditSpell(spell);

    await waitFor(() => {
      expect(hydrateSpellMock).toHaveBeenCalledTimes(1);
      expect(hydrateSpellMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: spell.id, range: spell.range }),
        expect.any(Function),
        expect.objectContaining({
          setStructuredRange: expect.any(Function),
          setSuppressExpandParse: expect.any(Function),
        }),
      );
    });

    fireEvent.click(screen.getByTestId("detail-range-expand"));

    const baseInput = await screen.findByTestId("range-base-value");
    expect((baseInput as HTMLInputElement).value).toBe("999");
  });
});