// apps/desktop/src/hooks/useModelDownloadProgress.ts
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import type {
  DownloadProgressEvent,
  EmbeddingsDownloadProgressEvent,
} from "../types/llm";

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

    let mounted = true;
    let unlisten: (() => void) | null = null;

    async function setup() {
      unlisten = await listen<DownloadProgressEvent | EmbeddingsDownloadProgressEvent>(
        EVENT_BY_KIND[kind],
        (event) => {
          if (!mounted) return;
          setBytesDownloaded(event.payload.bytesDownloaded);
          setTotalBytes(event.payload.totalBytes);
        },
      );
    }

    void setup();

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [kind, active]);

  const fraction = totalBytes > 0 ? bytesDownloaded / totalBytes : 0;

  return { bytesDownloaded, totalBytes, fraction };
}
