import { EmptyState, EmptyStateLiveRegion } from "../components/EmptyState";
import { ModelProvisioningActions } from "../components/chat/ModelProvisioningActions";
import type { SemanticAvailability } from "./librarySemantic";

interface LibrarySemanticProvisioningProps {
  availability: Exclude<SemanticAvailability, "keyword" | "ready">;
  errorMessage?: string | null;
  onDownload: () => void;
  onImport: () => void;
  onSwitchToKeyword: () => void;
  disabled?: boolean;
}

const COPY = {
  notProvisioned: {
    heading: "Semantic search needs the embedding model",
    description:
      "Download the all-MiniLM-L6-v2 embedding bundle (~90 MB) or add a verified local copy to search by meaning instead of keywords.",
  },
  downloading: {
    heading: "Downloading embedding model",
    description:
      "The download modal shows progress. Semantic search will be available when the model is ready.",
  },
  initializing: {
    heading: "Initializing embedding model",
    description: "The model is loading in the background. Try your search again in a few seconds.",
  },
  error: {
    heading: "Embedding model unavailable",
    description: "Semantic search is paused until the embedding model is installed or recovers.",
  },
} as const;

export function LibrarySemanticProvisioning({
  availability,
  errorMessage,
  onDownload,
  onImport,
  onSwitchToKeyword,
  disabled = false,
}: LibrarySemanticProvisioningProps) {
  const copy = COPY[availability];
  const visibleDescription =
    availability === "error" && errorMessage
      ? `${copy.description} ${errorMessage}`
      : copy.description;

  const testId =
    availability === "initializing"
      ? "library-semantic-initializing-state"
      : availability === "downloading"
        ? "library-semantic-downloading-state"
        : availability === "error"
          ? "library-semantic-error-state"
          : "library-semantic-provisioning-state";

  const showActions = availability === "notProvisioned" || availability === "error";

  return (
    <>
      <EmptyStateLiveRegion
        active
        testId={testId}
        heading={copy.heading}
        description={visibleDescription}
      />
      <EmptyState
        heading={copy.heading}
        description={visibleDescription}
        testId={testId}
        headingLevel="h3"
      >
        {availability === "initializing" || availability === "downloading" ? (
          <p
            className="text-sm text-neutral-500 dark:text-neutral-400"
            data-testid="library-semantic-loading-hint"
          >
            {availability === "initializing" ? "Loading model…" : "Download in progress…"}
          </p>
        ) : null}
        {showActions ? (
          <ModelProvisioningActions
            modelLabel="Embedding Model"
            onDownload={onDownload}
            onImport={onImport}
            downloadTestId="library-embeddings-download-button"
            importTestId="library-embeddings-import-button"
            disabled={disabled}
          />
        ) : null}
        <button
          type="button"
          data-testid="library-semantic-switch-keyword-button"
          className="mt-3 text-sm text-blue-700 underline hover:text-blue-600 dark:text-blue-400"
          onClick={onSwitchToKeyword}
        >
          Switch to keyword search
        </button>
      </EmptyState>
    </>
  );
}
