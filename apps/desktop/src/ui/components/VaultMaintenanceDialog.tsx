import { invoke } from "@tauri-apps/api/core";
import { useEffect, useMemo, useState } from "react";
import { useImportActivity } from "../../store/useImportActivity";
import { useModal } from "../../store/useModal";
import type {
  SourceRefUrlPolicy,
  VaultGcSummary,
  VaultIntegritySummary,
  VaultMaintenanceResult,
  VaultSettings,
} from "../../types/vault";

interface VaultMaintenanceDialogProps {
  isImportInProgress?: boolean;
  settings?: VaultSettings;
  result?: VaultMaintenanceResult | null;
  onRunIntegrityCheck?: () => Promise<VaultIntegritySummary>;
  onOptimizeVault?: () => Promise<VaultGcSummary>;
  onToggleIntegrityCheckOnOpen?: (enabled: boolean) => Promise<VaultSettings>;
}

type PendingAction = "integrity" | "optimize" | "toggle" | null;

export async function getVaultSettings(): Promise<VaultSettings> {
  return invoke<VaultSettings>("get_vault_settings");
}

export async function runVaultIntegrityCheck(): Promise<VaultIntegritySummary> {
  return invoke<VaultIntegritySummary>("run_vault_integrity_check");
}

export async function optimizeVault(): Promise<VaultGcSummary> {
  return invoke<VaultGcSummary>("optimize_vault");
}

export async function toggleIntegrityCheckOnOpen(enabled: boolean): Promise<VaultSettings> {
  return invoke<VaultSettings>("set_vault_integrity_check_on_open", { enabled });
}

export async function setImportSourceRefUrlPolicy(
  policy: SourceRefUrlPolicy,
): Promise<VaultSettings> {
  return invoke<VaultSettings>("set_import_source_ref_url_policy", { policy });
}

export function formatVaultMaintenanceError(error: unknown, actionLabel: string): string {
  const detail =
    error instanceof Error ? error.message : typeof error === "string" ? error : String(error);
  return `${actionLabel} failed: ${detail}`;
}

export function formatVaultIntegritySummary(summary: VaultIntegritySummary): string[] {
  const lines = [
    `Checked: ${summary.checkedCount}`,
    `Missing: ${summary.missingCount}`,
    `Re-exported: ${summary.reexportedCount}`,
    `Repaired: ${summary.repairedCount}`,
    `Warnings: ${summary.warningCount}`,
  ];

  for (const item of summary.unrecoverable) {
    lines.push(`Unrecoverable ${item.contentHash}: ${item.reason}`);
  }

  return lines;
}

function formatVaultMaintenanceResult(result: VaultMaintenanceResult): string[] {
  if (result.kind === "integrity") {
    return formatVaultIntegritySummary(result.summary);
  }

  return [
    `Deleted: ${result.summary.deletedCount}`,
    `Retained: ${result.summary.retainedCount}`,
    `Warnings: ${result.summary.warningCount}`,
    ...formatVaultIntegritySummary(result.summary.integrity),
  ];
}

export default function VaultMaintenanceDialog({
  isImportInProgress,
  settings: settingsOverride,
  result: resultOverride,
  onRunIntegrityCheck,
  onOptimizeVault,
  onToggleIntegrityCheckOnOpen,
}: VaultMaintenanceDialogProps) {
  const importInProgressFromStore = useImportActivity((state) => state.isImportInProgress);
  const hideModal = useModal((state) => state.hideModal);
  const [settings, setSettings] = useState<VaultSettings>(
    settingsOverride ?? { integrityCheckOnOpen: true, importSourceRefUrlPolicy: "drop-ref" },
  );
  const [result, setResult] = useState<VaultMaintenanceResult | null>(resultOverride ?? null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  useEffect(() => {
    if (settingsOverride) {
      setSettings(settingsOverride);
      return;
    }

    let cancelled = false;
    void getVaultSettings()
      .then((nextSettings) => {
        if (!cancelled) {
          setSettings(nextSettings);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSettings({ integrityCheckOnOpen: true, importSourceRefUrlPolicy: "drop-ref" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [settingsOverride]);

  useEffect(() => {
    if (resultOverride !== undefined) {
      setResult(resultOverride);
    }
  }, [resultOverride]);

  const effectiveImportInProgress = isImportInProgress ?? importInProgressFromStore;
  const resultLines = useMemo(() => (result ? formatVaultMaintenanceResult(result) : []), [result]);

  const handleRunIntegrityCheck = async () => {
    setPendingAction("integrity");
    try {
      const summary = onRunIntegrityCheck
        ? await onRunIntegrityCheck()
        : await runVaultIntegrityCheck();
      setErrorMessage(null);
      setResult({ kind: "integrity", summary });
    } catch (error) {
      setErrorMessage(formatVaultMaintenanceError(error, "Run Integrity Check"));
    } finally {
      setPendingAction(null);
    }
  };

  const handleOptimizeVault = async () => {
    setPendingAction("optimize");
    try {
      const summary = onOptimizeVault ? await onOptimizeVault() : await optimizeVault();
      setErrorMessage(null);
      setResult({ kind: "optimize", summary });
    } catch (error) {
      setErrorMessage(formatVaultMaintenanceError(error, "Optimize Vault"));
    } finally {
      setPendingAction(null);
    }
  };

  const handleIntegrityCheckToggle = async (enabled: boolean) => {
    setPendingAction("toggle");
    try {
      const nextSettings = onToggleIntegrityCheckOnOpen
        ? await onToggleIntegrityCheckOnOpen(enabled)
        : await toggleIntegrityCheckOnOpen(enabled);
      setErrorMessage(null);
      setSettings(nextSettings);
    } catch (error) {
      setErrorMessage(formatVaultMaintenanceError(error, "Update integrity check setting"));
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="vault-maintenance-dialog">
      <p className="text-sm text-neutral-400">
        Run manual vault maintenance and control automatic integrity checks when the app opens.
      </p>

      <div className="flex flex-col gap-3">
        <button
          type="button"
          data-testid="btn-run-vault-integrity-check"
          onClick={() => void handleRunIntegrityCheck()}
          disabled={pendingAction !== null}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:opacity-50"
        >
          {pendingAction === "integrity" ? "Checking Vault…" : "Run Integrity Check"}
        </button>

        <button
          type="button"
          data-testid="btn-optimize-vault"
          onClick={() => void handleOptimizeVault()}
          disabled={effectiveImportInProgress || pendingAction !== null}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-500 disabled:opacity-50"
        >
          {pendingAction === "optimize" ? "Optimizing Vault…" : "Optimize Vault"}
        </button>

        {effectiveImportInProgress && (
          <div
            className="rounded border border-amber-700/50 bg-amber-950/20 px-3 py-2 text-xs text-amber-300"
            data-testid="vault-optimize-disabled-reason"
          >
            Optimize Vault is disabled while import commands are active.
          </div>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          data-testid="toggle-integrity-check-on-open"
          checked={settings.integrityCheckOnOpen}
          disabled={pendingAction === "toggle"}
          onChange={(event) => {
            void handleIntegrityCheckToggle(event.target.checked);
          }}
          className="rounded border-neutral-700 bg-neutral-900 text-blue-600"
        />
        Run integrity check automatically when the app opens
      </label>

      {errorMessage && (
        <div
          className="rounded-lg border border-red-900/60 bg-red-950/20 p-3 text-sm text-red-200"
          data-testid="vault-maintenance-error"
        >
          {errorMessage}
        </div>
      )}

      {resultLines.length > 0 && (
        <div
          className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3 text-sm text-neutral-300"
          data-testid="vault-maintenance-results"
        >
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Latest result
          </div>
          <ul className="space-y-1">
            {resultLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          data-testid="btn-close-vault-maintenance"
          onClick={hideModal}
          disabled={pendingAction !== null}
          className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold text-neutral-200 transition-all hover:bg-neutral-700 disabled:opacity-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}
