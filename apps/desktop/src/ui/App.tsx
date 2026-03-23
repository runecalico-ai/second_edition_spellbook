import { invoke } from "@tauri-apps/api/core";
import clsx from "classnames";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import type { ShowModalOptions } from "../store/useModal";
import { useModal } from "../store/useModal";
import { useTheme } from "../store/useTheme";
import Modal from "./components/Modal";
import NotificationViewport from "./components/NotificationViewport";
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
      summary.unrecoverable.length > 0 ||
      summary.warningCount > 0 ||
      summary.repairedCount > 0 ||
      summary.reexportedCount > 0
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

export function getThemeAnnouncement(mode: "light" | "dark" | "system") {
  if (mode === "light") {
    return "Light mode";
  }

  if (mode === "dark") {
    return "Dark mode";
  }

  return "System mode";
}

export default function App() {
  const { pathname } = useLocation();
  const themeMode = useTheme((state) => state.mode);
  const resolvedTheme = useTheme((state) => state.resolvedTheme);
  const {
    alert: modalAlert,
    confirm: modalConfirm,
    showModal,
    showModalIfIdle,
    hideModal,
  } = useModal();
  const [themeAnnouncement, setThemeAnnouncement] = useState(() => getThemeAnnouncement(themeMode));
  const previousResolvedTheme = useRef(resolvedTheme);
  const previousThemeMode = useRef(themeMode);
  const skipNextResolvedThemeAnnouncement = useRef(false);

  const Tab = ({ to, label }: { to: string; label: string }) => (
    <Link
      to={to}
      data-testid={`nav-link-${label.toLowerCase()}`}
      className={clsx(
        "rounded-md px-3 py-2 transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900",
        pathname === to || (to === "/" && pathname === "/")
          ? "bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-950"
          : "text-stone-700 hover:bg-stone-200/80 hover:text-stone-950 dark:text-neutral-200 dark:hover:bg-neutral-800 dark:hover:text-neutral-50",
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

  // Theme announcement: two coordinated effects.
  // Effect 1 announces when themeMode changes (e.g., "Dark mode", "System mode").
  // Effect 2 announces the resolved theme when in system mode and the OS preference
  // changes (e.g., light → dark). When the user switches from an explicit mode back
  // to system, effect 1 must announce "System mode" without effect 2 immediately
  // overwriting that with the resolved OS theme on the same transition.
  useEffect(() => {
    const priorMode = previousThemeMode.current;
    previousThemeMode.current = themeMode;
    if (priorMode !== "system" && themeMode === "system") {
      skipNextResolvedThemeAnnouncement.current = true;
    }
    setThemeAnnouncement(getThemeAnnouncement(themeMode));
  }, [themeMode]);

  useEffect(() => {
    if (themeMode !== "system") {
      previousResolvedTheme.current = resolvedTheme;
      return;
    }

    if (skipNextResolvedThemeAnnouncement.current) {
      skipNextResolvedThemeAnnouncement.current = false;
      previousResolvedTheme.current = resolvedTheme;
      return;
    }

    if (previousResolvedTheme.current !== resolvedTheme) {
      setThemeAnnouncement(getThemeAnnouncement(resolvedTheme));
    }

    previousResolvedTheme.current = resolvedTheme;
  }, [resolvedTheme, themeMode]);

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-4 text-stone-950 dark:bg-neutral-950 dark:text-neutral-100">
      <div data-testid="theme-announcement-live-region" aria-live="polite" className="sr-only">
        {themeAnnouncement}
      </div>
      <div className="mx-auto max-w-6xl space-y-4">
        {/*
          Layout shell borders use border-stone-200/80 on white (~1.3:1), below WCAG 3:1 for non-text UI.
          Accepted deviation for chunk-5 Task 6: interactive controls use stronger borders and focus-visible rings.
        */}
        <header className="flex items-center justify-between rounded-2xl border border-stone-200/80 bg-white/90 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/80">
          <div className="text-xl font-semibold select-none">Spellbook</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="btn-backup"
                onClick={handleBackup}
                className="rounded-md bg-stone-900 px-2 py-1 text-xs text-stone-50 transition-colors hover:bg-stone-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900 dark:bg-neutral-800 dark:hover:bg-neutral-700"
              >
                Backup
              </button>
              <button
                type="button"
                data-testid="btn-vault-maintenance"
                onClick={openVaultMaintenance}
                className="rounded-md bg-stone-900 px-2 py-1 text-xs text-stone-50 transition-colors hover:bg-stone-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900 dark:bg-neutral-800 dark:hover:bg-neutral-700"
              >
                Vault
              </button>
              <button
                type="button"
                data-testid="btn-restore"
                onClick={handleRestore}
                className="rounded-md bg-stone-900 px-2 py-1 text-xs text-stone-50 transition-colors hover:bg-stone-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900 dark:bg-neutral-800 dark:hover:bg-neutral-700"
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
            <Link
              to="/settings"
              data-testid="settings-gear-button"
              aria-label="Settings"
              className="rounded-full border border-neutral-500 bg-stone-100 p-2 text-stone-900 transition-colors hover:bg-stone-200 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .75 1.7 1.7 0 0 1-3 0 1.7 1.7 0 0 0-1-.75 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.75-1 1.7 1.7 0 0 1 0-3 1.7 1.7 0 0 0 .75-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.75 1.7 1.7 0 0 1 3 0 1.7 1.7 0 0 0 1 .75 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c0 .38.14.75.4 1.02a1.7 1.7 0 0 1 0 2.96c-.26.27-.4.64-.4 1.02Z" />
              </svg>
            </Link>
          </div>
        </header>
        <main className="rounded-2xl border border-stone-200/80 bg-white/80 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/70">
          <Outlet />
        </main>
      </div>
      <NotificationViewport />
      <Modal />
    </div>
  );
}
