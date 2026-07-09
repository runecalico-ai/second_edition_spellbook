import { EmptyState, EmptyStateLiveRegion } from "../EmptyState";
import { parseProvisionerError } from "./chatProvisionerErrors";
import { ModelProvisioningActions } from "./ModelProvisioningActions";

interface ChatProvisioningPromptProps {
  onDownloadLlm: () => void;
  onImportLlm: () => void;
  onDownloadEmbeddings: () => void;
  onImportEmbeddings: () => void;
  onRetryDownload?: () => void;
  llmNeedsSetup: boolean; // notProvisioned OR error
  llmErrorMessage?: string | null;
  embeddingsNotProvisioned: boolean;
  embeddingsErrorMessage?: string | null;
  disabled?: boolean;
}

export function ChatProvisioningPrompt({
  onDownloadLlm,
  onImportLlm,
  onDownloadEmbeddings,
  onImportEmbeddings,
  onRetryDownload,
  llmNeedsSetup,
  llmErrorMessage,
  embeddingsNotProvisioned,
  embeddingsErrorMessage,
  disabled = false,
}: ChatProvisioningPromptProps) {
  const llmError = parseProvisionerError(llmErrorMessage);
  const embeddingsError = parseProvisionerError(embeddingsErrorMessage);

  const defaultDescription =
    "Download the TinyLlama chat model (~700 MB) to ask questions about your spell library. Chat works without the embedding model, but semantic search in the Library requires it.";

  const llmHeading = llmError?.heading ?? "Set up local AI";
  const llmDescription = llmError?.description ?? defaultDescription;
  const showRetry = llmNeedsSetup && llmError !== null && onRetryDownload !== undefined;

  const active = llmNeedsSetup;

  return (
    <>
      <EmptyStateLiveRegion
        active={active}
        testId="chat-provisioning-empty-state"
        heading={llmHeading}
        description={llmDescription}
      />
      <EmptyState
        testId="chat-provisioning-empty-state"
        heading={llmHeading}
        description={llmDescription}
        headingLevel="h2"
      >
        {showRetry ? (
          <button
            type="button"
            data-testid="chat-provisioning-retry-button"
            className="mb-3 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            onClick={onRetryDownload}
            disabled={disabled}
          >
            Retry Download
          </button>
        ) : null}
        {llmNeedsSetup ? (
          <ModelProvisioningActions
            modelLabel="Chat Model"
            onDownload={onDownloadLlm}
            onImport={onImportLlm}
            downloadTestId="chat-llm-download-button"
            importTestId="chat-llm-import-button"
            disabled={disabled}
          />
        ) : null}
        {embeddingsNotProvisioned ? (
          <div className="mt-4 w-full border-t border-neutral-200 dark:border-neutral-700 pt-4">
            <p className="text-xs text-neutral-500 mb-3">Optional: enable Library semantic search</p>
            {embeddingsError ? (
              <p
                className="mb-3 text-sm text-red-600 dark:text-red-400"
                data-testid="chat-embeddings-error-message"
              >
                {embeddingsError.description}
              </p>
            ) : null}
            <ModelProvisioningActions
              modelLabel="Embedding Model"
              onDownload={onDownloadEmbeddings}
              onImport={onImportEmbeddings}
              downloadTestId="chat-embeddings-download-button"
              importTestId="chat-embeddings-import-button"
              disabled={disabled}
            />
          </div>
        ) : null}
      </EmptyState>
    </>
  );
}
