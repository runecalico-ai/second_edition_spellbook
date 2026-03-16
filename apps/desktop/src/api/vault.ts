import { invoke } from "@tauri-apps/api/core";
import type {
  SourceRefUrlPolicy,
  VaultGcSummary,
  VaultIntegritySummary,
  VaultSettings,
} from "../types/vault";

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
