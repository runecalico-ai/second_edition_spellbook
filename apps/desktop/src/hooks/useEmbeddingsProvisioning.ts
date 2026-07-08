import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelEmbeddingsDownload,
  downloadEmbeddingsModel,
  importEmbeddingsModelFile,
} from "../api/llm";
import { useModelDownloadProgress } from "./useModelDownloadProgress";
import type { EmbeddingsStatus } from "../types/llm";

interface UseEmbeddingsProvisioningOptions {
  embeddingsState: EmbeddingsStatus;
  refresh: () => Promise<void>;
}

export function useEmbeddingsProvisioning({
  embeddingsState,
  refresh,
}: UseEmbeddingsProvisioningOptions) {
  const [activeDownload, setActiveDownload] = useState(false);
  const sawDownloadingRef = useRef(false);
  // Prevents the modal from reopening after cancel while the backend still reports "downloading".
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (embeddingsState !== "downloading") {
      dismissedRef.current = false;
    }
  }, [embeddingsState]);

  useEffect(() => {
    if (activeDownload || dismissedRef.current) return;
    if (embeddingsState === "downloading") {
      setActiveDownload(true);
    }
  }, [embeddingsState, activeDownload]);

  useEffect(() => {
    if (!activeDownload) {
      sawDownloadingRef.current = false;
      return;
    }

    if (embeddingsState === "downloading") {
      sawDownloadingRef.current = true;
      return;
    }

    const successTerminal = embeddingsState === "ready";
    const failedAfterObserved =
      sawDownloadingRef.current && embeddingsState === "error";

    if (sawDownloadingRef.current || successTerminal || failedAfterObserved) {
      setActiveDownload(false);
      void refresh();
    }
  }, [activeDownload, embeddingsState, refresh]);

  const download = useCallback(async () => {
    setActiveDownload(true);
    try {
      await downloadEmbeddingsModel();
    } catch {
      setActiveDownload(false);
    } finally {
      await refresh();
    }
  }, [refresh]);

  const importBundle = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected === null) return;
    const path = Array.isArray(selected) ? selected[0] : selected;
    try {
      await importEmbeddingsModelFile(path);
    } finally {
      await refresh();
    }
  }, [refresh]);

  const cancelDownload = useCallback(async () => {
    try {
      await cancelEmbeddingsDownload();
    } finally {
      dismissedRef.current = true;
      setActiveDownload(false);
      await refresh();
    }
  }, [refresh]);

  const isDownloadModalOpen =
    activeDownload || (embeddingsState === "downloading" && !dismissedRef.current);
  const progress = useModelDownloadProgress("embeddings", isDownloadModalOpen);

  return {
    download,
    importBundle,
    cancelDownload,
    isDownloadModalOpen,
    progress,
  };
}
