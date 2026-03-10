export interface VaultUnrecoverableEntry {
  contentHash: string;
  reason: string;
}

export interface VaultIntegritySummary {
  checkedCount: number;
  missingCount: number;
  reexportedCount: number;
  repairedCount: number;
  unrecoverable: VaultUnrecoverableEntry[];
  warningCount: number;
}

export interface VaultGcSummary {
  deletedCount: number;
  retainedCount: number;
  warningCount: number;
  integrity: VaultIntegritySummary;
}

export interface VaultSettings {
  integrityCheckOnOpen: boolean;
}

export type VaultMaintenanceResult =
  | { kind: "integrity"; summary: VaultIntegritySummary }
  | { kind: "optimize"; summary: VaultGcSummary };
