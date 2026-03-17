import { invoke } from "@tauri-apps/api/core";
import clsx from "classnames";
import { useCallback, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import type { ShowModalOptions } from "../store/useModal";
import { useModal } from "../store/useModal";
import Modal from "./components/Modal";
import {
  formatVaultIntegritySummary,
  getVaultSettings,
  runVaultIntegrityCheck,
} from "../api/vault";
import VaultMaintenanceDialog from "./components/VaultMaintenanceDialog";
import type { VaultIntegritySummary } from "../types/vault";

export function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function createVaultStartupWarningModal(
  summary: VaultIntegritySummary,
  handlers: {
    onOpenVaultMaintenance: () => void;
    onDismiss: () => void;
  },
): ShowModalOptions {
  return {
    title: "Vault Integrity Check",
    message: formatVaultIntegritySummary(summary),
    type:
      summary.unrecoverable.length > 0 || summary.warningCount > 0 || summary.repairedCount > 0
        ? "warning"
        : "info",
    dismissible: true,
    buttons: [
      {
        label: "Dismiss",
        variant: "secondary",
        onClick: handlers.onDismiss,
      },
      {
        label: "Open Vault Maintenance",
        variant: "primary",
        onClick: handlers.onOpenVaultMaintenance,
      },
    ],
  };
}

export function createVaultStartupFailureModal(
  error: unknown,
  handlers: {
    onOpenVaultMaintenance: () => void;
    onDismiss: () => void;
  },
): ShowModalOptions {
  return {
    title: "Vault Warning",
    message: [`Vault integrity startup check failed: ${formatUnknownError(error)}`],
    type: "warning",
    dismissible: true,
    buttons: [
      {
        label: "Dismiss",
        variant: "secondary",
        onClick: handlers.onDismiss,
      },
      {
        label: "Open Vault Maintenance",
        variant: "primary",
        onClick: handlers.onOpenVaultMaintenance,
      },
    ],
  };
}

export default function App() {
  const { pathname } = useLocation();
  const {
    alert: modalAlert,
    confirm: modalConfirm,
    showModal,
    showModalIfIdle,
    hideModal,
  } = useModal();

  const Tab = ({ to, label }: { to: string; label: string }) => (
    <Link
      to={to}
      data-testid={`nav-link-${label.toLowerCase()}`}
      className={clsx(
        "px-3 py-2 rounded-md",
        pathname === to || (to === "/" && pathname === "/")
          ? "bg-neutral-800"
          : "hover:bg-neutral-800/60",
      )}
    >
      {label}
    </Link>
  );

  const handleBackup = async () => {
    const path = prompt("Enter full path for backup (e.g. C:\\Backup\\spellbook.zip):");
    if (!path) return;
    try {
      const result = await invoke("backup_vault", { destinationPath: path });
      await modalAlert(`Backup created at: ${result}`, "Backup Successful", "success");
    } catch (e) {
      await modalAlert(`Backup failed: ${e}`, "Backup Error", "error");
    }
  };

  const handleRestore = async () => {
    const path = prompt("Enter full path to restore from:");
    if (!path) return;

    const confirmed = await modalConfirm(
      "This will OVERWRITE your current database. All unsaved changes will be lost. Are you sure?",
      "Restore Database",
    );
    if (!confirmed) return;

    try {
      await invoke("restore_vault", { backupPath: path, allowOverwrite: true });
      await modalAlert(
        "Restore complete. The application will now reload.",
        "Restore Successful",
        "success",
      );
      window.location.reload();
    } catch (e) {
      await modalAlert(`Restore failed: ${e}`, "Restore Error", "error");
    }
  };

  const openVaultMaintenance = useCallback(() => {
    showModal({
      title: "Vault Maintenance",
      message: "",
      type: "info",
      dismissible: false,
      buttons: [],
      customContent: <VaultMaintenanceDialog />,
    });
  }, [showModal]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const settings = await getVaultSettings();
        if (!settings.integrityCheckOnOpen || cancelled) {
          return;
        }

        const summary = await runVaultIntegrityCheck();
        if (cancelled) {
          return;
        }

        if (
          summary.warningCount > 0 ||
          summary.repairedCount > 0 ||
          summary.reexportedCount > 0 ||
          summary.unrecoverable.length > 0
        ) {
          showModalIfIdle(
            createVaultStartupWarningModal(summary, {
              onOpenVaultMaintenance: openVaultMaintenance,
              onDismiss: hideModal,
            }),
          );
        }
      } catch (error) {
        if (!cancelled) {
          showModalIfIdle(
            createVaultStartupFailureModal(error, {
              onOpenVaultMaintenance: openVaultMaintenance,
              onDismiss: hideModal,
            }),
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hideModal, openVaultMaintenance, showModalIfIdle]);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div className="text-xl font-semibold select-none">Spellbook</div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="btn-backup"
              onClick={handleBackup}
              className="text-xs px-2 py-1 bg-neutral-800 rounded hover:bg-neutral-700"
            >
              Backup
            </button>
            <button
              type="button"
              data-testid="btn-vault-maintenance"
              onClick={openVaultMaintenance}
              className="text-xs px-2 py-1 bg-neutral-800 rounded hover:bg-neutral-700"
            >
              Vault
            </button>
            <button
              type="button"
              data-testid="btn-restore"
              onClick={handleRestore}
              className="text-xs px-2 py-1 bg-neutral-800 rounded hover:bg-neutral-700"
            >
              Restore
            </button>
          </div>
          <nav className="space-x-2">
            <Tab to="/" label="Library" />
            <Tab to="/character" label="Characters" />
            <Tab to="/import" label="Import" />
            <Tab to="/chat" label="Chat" />
            <Tab to="/export" label="Export" />
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <Modal />
    </div>
  );
}
