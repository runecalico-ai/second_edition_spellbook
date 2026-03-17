import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import VaultMaintenanceDialog, {
  formatVaultIntegritySummary,
  formatVaultMaintenanceError,
  optimizeVault,
  setImportSourceRefUrlPolicy,
  toggleIntegrityCheckOnOpen,
} from "./VaultMaintenanceDialog";
import type { VaultIntegritySummary, VaultSettings } from "../../types/vault";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);
const defaultSettings: VaultSettings = {
  integrityCheckOnOpen: true,
  importSourceRefUrlPolicy: "drop-ref",
};

function createSummary(overrides: Partial<VaultIntegritySummary> = {}): VaultIntegritySummary {
  return {
    checkedCount: 3,
    missingCount: 1,
    reexportedCount: 1,
    repairedCount: 0,
    unrecoverable: [],
    warningCount: 0,
    ...overrides,
  };
}

describe("VaultMaintenanceDialog", () => {
  beforeEach(() => {
    invokeMock.mockClear();
  });

  it("shows Optimize Vault and disables it while import is in progress", () => {
    const html = renderToStaticMarkup(
      <VaultMaintenanceDialog isImportInProgress={true} settings={defaultSettings} result={null} />,
    );

    expect(html).toContain("Optimize Vault");
    expect(html).toContain('data-testid="btn-optimize-vault"');
    expect(html).toContain("disabled");
  });

  it("invokes optimize_vault through the action helper", async () => {
    invokeMock.mockResolvedValue({
      deletedCount: 2,
      retainedCount: 5,
      warningCount: 0,
      integrity: createSummary(),
    });

    await optimizeVault();

    expect(invokeMock).toHaveBeenCalledWith("optimize_vault");
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it("toggles integrity-on-open and persists via IPC", async () => {
    invokeMock.mockResolvedValue({
      integrityCheckOnOpen: false,
      importSourceRefUrlPolicy: "drop-ref",
    } satisfies VaultSettings);

    const result = await toggleIntegrityCheckOnOpen(false);

    expect(invokeMock).toHaveBeenCalledWith("set_vault_integrity_check_on_open", {
      enabled: false,
    });
    expect(result.integrityCheckOnOpen).toBe(false);
  });

  it("persists import SourceRef URL policy via IPC", async () => {
    invokeMock.mockResolvedValue({
      integrityCheckOnOpen: true,
      importSourceRefUrlPolicy: "reject-spell",
    } satisfies VaultSettings);

    const result = await setImportSourceRefUrlPolicy("reject-spell");

    expect(invokeMock).toHaveBeenCalledWith("set_import_source_ref_url_policy", {
      policy: "reject-spell",
    });
    expect(result.importSourceRefUrlPolicy).toBe("reject-spell");
  });

  it("formats integrity summary and unrecoverable results", () => {
    const lines = formatVaultIntegritySummary(
      createSummary({
        repairedCount: 2,
        warningCount: 1,
        unrecoverable: [
          {
            contentHash: "deadbeef",
            reason: "Missing vault file and canonical_data is NULL",
          },
        ],
      }),
    );

    expect(lines.join("\n")).toContain("Repaired: 2");
    expect(lines.join("\n")).toContain("deadbeef");
    expect(lines.join("\n")).toContain("Missing vault file and canonical_data is NULL");
  });

  it("formats backend maintenance rejections into clean user-facing text", () => {
    const message = formatVaultMaintenanceError(
      "Vault optimization is unavailable while an import is in progress.",
      "Optimize Vault",
    );

    expect(message).toContain("Optimize Vault failed");
    expect(message).toContain("Vault optimization is unavailable while an import is in progress.");
  });

  it("renders an explicit close control for the maintenance dialog", () => {
    const html = renderToStaticMarkup(
      <VaultMaintenanceDialog
        isImportInProgress={false}
        settings={defaultSettings}
        result={null}
      />,
    );

    expect(html).toContain('data-testid="btn-close-vault-maintenance"');
  });
});
