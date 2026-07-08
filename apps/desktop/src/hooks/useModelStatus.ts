import { useCallback, useEffect, useRef, useState } from "react";
import { getEmbeddingsStatus, getLlmStatus } from "../api/llm";
import type { EmbeddingsStatusResponse, LlmStatusResponse } from "../types/llm";

const ACTIVE_POLL_MS = 1500;

export function useModelStatus() {
  const [llm, setLlm] = useState<LlmStatusResponse>({
    status: "notProvisioned",
    modelPath: "",
  });
  const [embeddings, setEmbeddings] = useState<EmbeddingsStatusResponse>({
    state: "notProvisioned",
  });
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [llmStatus, embStatus] = await Promise.all([
        getLlmStatus(),
        getEmbeddingsStatus(),
      ]);
      if (!mountedRef.current) return;
      setLlm(llmStatus);
      setEmbeddings(embStatus);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  const isActive =
    llm.status === "downloading" ||
    embeddings.state === "downloading" ||
    embeddings.state === "initializing";

  useEffect(() => {
    if (!isActive) return;
    const id = window.setInterval(() => {
      void refresh();
    }, ACTIVE_POLL_MS);
    return () => window.clearInterval(id);
  }, [isActive, refresh]);

  return { llm, embeddings, error, refresh };
}
