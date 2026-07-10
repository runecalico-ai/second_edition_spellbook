// apps/desktop/src/hooks/useModelDownloadProgress.ts
import { useEffect, useState } from "react";
import { listenLlmEvent } from "../api/llmEvents";
import type { DownloadProgressEvent, EmbeddingsDownloadProgressEvent } from "../types/llm";

export type ModelKind = "llm" | "embeddings";

const EVENT_BY_KIND: Record<ModelKind, string> = {
  llm: "llm://download-progress",
  embeddings: "embeddings://download-progress",
};

export function useModelDownloadProgress(kind: ModelKind, active: boolean) {
  const [bytesDownloaded, setBytesDownloaded] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);

  useEffect(() => {
    if (!active) {
      setBytesDownloaded(0);
      setTotalBytes(0);
      return;
    }

    setBytesDownloaded(0);
    setTotalBytes(0);

    let mounted = true;
    let unlisten: (() => void) | null = null;

    async function setup() {
      // listenLlmEvent() failures are not surfaced to callers yet; callers should
      // treat stalled progress as a download/setup issue until error reporting exists.
      const unlistenFn = await listenLlmEvent<
        DownloadProgressEvent | EmbeddingsDownloadProgressEvent
      >(EVENT_BY_KIND[kind], (event) => {
        if (!mounted) return;
        setBytesDownloaded(event.payload.bytesDownloaded);
        setTotalBytes(event.payload.totalBytes);
      });

      if (!mounted) {
        unlistenFn();
        return;
      }
      unlisten = unlistenFn;
    }

    void setup();

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [kind, active]);

  const fraction = totalBytes > 0 ? Math.min(1, bytesDownloaded / totalBytes) : 0;

  return { bytesDownloaded, totalBytes, fraction };
}
