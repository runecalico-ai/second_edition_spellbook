// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import type { SpellDetail } from "../../types/spell";
import { useSpellPersistence } from "./useSpellPersistence";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const { alertMock, confirmMock, navigateMock, pushNotificationMock } = vi.hoisted(() => ({
  alertMock: vi.fn().mockResolvedValue(undefined),
  confirmMock: vi.fn().mockResolvedValue(false),
  navigateMock: vi.fn(),
  pushNotificationMock: vi.fn(),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const mod = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...mod,
    useNavigate: () => navigateMock,
  };
});

vi.mock("../../store/useModal", () => ({
  useModal: () => ({
    alert: alertMock,
    confirm: confirmMock,
  }),
}));

vi.mock("../../store/useNotifications", () => ({
  useNotifications: (selector: (state: { pushNotification: typeof pushNotificationMock }) => unknown) =>
    selector({ pushNotification: pushNotificationMock }),
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

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe("useSpellPersistence load boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not invoke get_spell when the route id is invalid", async () => {
    const onLoadSuccess = vi.fn();
    const resetEditorUiState = vi.fn();
    const resetStructuredLoadState = vi.fn();

    renderHook(
      () =>
        useSpellPersistence({
          id: "not-a-number",
          isNew: false,
          resetEditorUiState,
          resetStructuredLoadState,
          onLoadSuccess,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(resetStructuredLoadState).toHaveBeenCalledTimes(1);
    });

    expect(vi.mocked(invoke)).not.toHaveBeenCalled();
    expect(resetEditorUiState).not.toHaveBeenCalled();
    expect(onLoadSuccess).not.toHaveBeenCalled();
  });

  it("rejects a loaded spell whose id does not match the requested edit route", async () => {
    vi.mocked(invoke).mockResolvedValue(baseLoadedSpell({ id: 99 }));
    const onLoadSuccess = vi.fn();
    const resetEditorUiState = vi.fn();
    const resetStructuredLoadState = vi.fn();

    renderHook(
      () =>
        useSpellPersistence({
          id: "1",
          isNew: false,
          resetEditorUiState,
          resetStructuredLoadState,
          onLoadSuccess,
        }),
      { wrapper },
    );

    await waitFor(() => {
      expect(vi.mocked(invoke)).toHaveBeenCalledWith("get_spell", { id: 1 });
    });

    await waitFor(() => {
      expect(resetStructuredLoadState).toHaveBeenCalledTimes(1);
    });

    expect(onLoadSuccess).not.toHaveBeenCalled();
  });
});