import { describe, expect, it, vi } from "vitest";
import { createVaultStartupFailureModal, createVaultStartupWarningModal } from "./App";

describe("createVaultStartupWarningModal", () => {
  it("builds an actionable startup warning modal", () => {
    const onOpenVaultMaintenance = vi.fn();
    const onDismiss = vi.fn();

    const modal = createVaultStartupWarningModal(
      {
        checkedCount: 3,
        missingCount: 1,
        reexportedCount: 1,
        repairedCount: 0,
        unrecoverable: [{ contentHash: "deadbeef", reason: "Missing file" }],
        warningCount: 1,
      },
      { onOpenVaultMaintenance, onDismiss },
    );

    expect(modal.title).toBe("Vault Integrity Check");
    expect(modal.type).toBe("warning");
    expect(modal.buttons.map((button) => button.label)).toEqual([
      "Dismiss",
      "Open Vault Maintenance",
    ]);

    modal.buttons[1].onClick?.();
    expect(onOpenVaultMaintenance).toHaveBeenCalledTimes(1);

    modal.buttons[0].onClick?.();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("uses a warning modal when the integrity summary reports warnings", () => {
    const modal = createVaultStartupWarningModal(
      {
        checkedCount: 3,
        missingCount: 0,
        reexportedCount: 0,
        repairedCount: 0,
        unrecoverable: [],
        warningCount: 1,
      },
      {
        onOpenVaultMaintenance: vi.fn(),
        onDismiss: vi.fn(),
      },
    );

    expect(modal.type).toBe("warning");
  });
});

describe("createVaultStartupFailureModal", () => {
  it("formats unknown errors into readable text", () => {
    const modal = createVaultStartupFailureModal(
      { code: "EFAIL" },
      {
        onOpenVaultMaintenance: vi.fn(),
        onDismiss: vi.fn(),
      },
    );

    expect(modal.message).toEqual(['Vault integrity startup check failed: {"code":"EFAIL"}']);
    expect(modal.type).toBe("warning");
  });
});
