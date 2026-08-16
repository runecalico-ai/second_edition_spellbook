import { useState } from "react";
import { reindexEmbeddings } from "../../api/llm";
import { useModelStatus } from "../../hooks/useModelStatus";
import { useReindexProgress } from "../../hooks/useReindexProgress";
import type { ReindexResult } from "../../types/llm";

const BUTTON_CLASSES =
  "rounded-lg border border-neutral-500 bg-white px-3 py-2 text-sm font-medium text-neutral-900 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed disabled:opacity-50";

export function EmbeddingsReindexSection() {
  const { embeddings, refresh } = useModelStatus();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ReindexResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { current, total, fraction } = useReindexProgress(running);
  const canRun = embeddings.state === "ready";

  const handleReindex = async (force: boolean) => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const nextResult = await reindexEmbeddings(force);
      setResult(nextResult);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section
      data-testid="settings-embeddings-section"
      className="space-y-4"
      aria-labelledby="settings-embeddings-heading"
    >
      <div className="space-y-1">
        <h2 id="settings-embeddings-heading" className="text-lg font-semibold">
          Embeddings
        </h2>
        <p className="text-sm text-stone-600 dark:text-neutral-300">
          Rebuild semantic search indexes for your spellbook.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          data-testid="settings-reindex-missing-button"
          className={BUTTON_CLASSES}
          disabled={!canRun || running}
          onClick={() => void handleReindex(false)}
        >
          Index missing vectors
        </button>
        <button
          type="button"
          data-testid="settings-reindex-all-button"
          className={BUTTON_CLASSES}
          disabled={!canRun || running}
          onClick={() => void handleReindex(true)}
        >
          Re-index all spells
        </button>
      </div>

      {!canRun && (
        <p
          data-testid="settings-reindex-unavailable-hint"
          className="text-sm text-amber-700 dark:text-amber-300"
        >
          Semantic search indexing is available after the embedding model is ready. Provision it
          from Chat or Library semantic mode.
        </p>
      )}

      {running && (
        <div className="space-y-2" aria-live="polite">
          <p data-testid="settings-reindex-progress">
            {current} / {total}
          </p>
          <div
            data-testid="settings-reindex-progress-bar"
            role="progressbar"
            tabIndex={0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fraction * 100)}
            className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-neutral-800"
          >
            <div
              className="h-full bg-blue-600 transition-[width]"
              style={{ width: `${Math.round(fraction * 100)}%` }}
            />
          </div>
        </div>
      )}

      {result && (
        <output data-testid="settings-reindex-result">
          {result.indexed} indexed, {result.skipped} skipped, {result.failed} failed
        </output>
      )}

      {error && (
        <p data-testid="settings-reindex-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
