import { invoke } from "@tauri-apps/api/core";
import clsx from "classnames";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useModal } from "../store/useModal";
import Modal from "./components/Modal";

export default function App() {
  const { pathname } = useLocation();
  const { alert: modalAlert, confirm: modalConfirm } = useModal();

  const Tab = ({ to, label }: { to: string; label: string }) => (
    <Link
      to={to}
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

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Spellbook</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleBackup}
              className="text-xs px-2 py-1 bg-neutral-800 rounded hover:bg-neutral-700"
            >
              Backup
            </button>
            <button
              type="button"
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
