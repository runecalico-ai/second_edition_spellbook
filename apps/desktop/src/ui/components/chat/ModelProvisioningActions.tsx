interface ModelProvisioningActionsProps {
  modelLabel: string;
  onDownload: () => void;
  onImport: () => void;
  downloadTestId: string;
  importTestId: string;
  disabled?: boolean;
}

export function ModelProvisioningActions({
  modelLabel,
  onDownload,
  onImport,
  downloadTestId,
  importTestId,
  disabled = false,
}: ModelProvisioningActionsProps) {
  return (
    <div className="flex flex-wrap gap-3 justify-center">
      <button
        type="button"
        data-testid={downloadTestId}
        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-50"
        onClick={onDownload}
        disabled={disabled}
      >
        Download {modelLabel}
      </button>
      <button
        type="button"
        data-testid={importTestId}
        className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-600 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
        onClick={onImport}
        disabled={disabled}
      >
        Add Local {modelLabel}
      </button>
    </div>
  );
}
