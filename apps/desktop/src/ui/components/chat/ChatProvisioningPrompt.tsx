import { EmptyState, EmptyStateLiveRegion } from "../EmptyState";
import { ModelProvisioningActions } from "./ModelProvisioningActions";

interface ChatProvisioningPromptProps {
  onDownloadLlm: () => void;
  onImportLlm: () => void;
  onDownloadEmbeddings: () => void;
  onImportEmbeddings: () => void;
  llmNeedsSetup: boolean; // notProvisioned OR error
  llmErrorMessage?: string | null;
  embeddingsNotProvisioned: boolean;
  disabled?: boolean;
}

export function ChatProvisioningPrompt({
  onDownloadLlm,
  onImportLlm,
  onDownloadEmbeddings,
  onImportEmbeddings,
  llmNeedsSetup,
  llmErrorMessage,
  embeddingsNotProvisioned,
  disabled = false,
}: ChatProvisioningPromptProps) {
  const active = llmNeedsSetup;

  return (
    <>
      <EmptyStateLiveRegion
        active={active}
        testId="chat-provisioning-empty-state"
        heading="Set up local AI"
        description={
          llmErrorMessage
            ? `Model setup failed: ${llmErrorMessage}`
            : "Download the TinyLlama chat model (~700 MB) to ask questions about your spell library. Chat works without the embedding model, but semantic search in the Library requires it."
        }
      />
      <EmptyState
        testId="chat-provisioning-empty-state"
        heading="Set up local AI"
        description={
          llmErrorMessage
            ? `Model setup failed: ${llmErrorMessage}`
            : "Download the TinyLlama chat model (~700 MB) to ask questions about your spell library. Chat works without the embedding model, but semantic search in the Library requires it."
        }
        headingLevel="h2"
      >
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
