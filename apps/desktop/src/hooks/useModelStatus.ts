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
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const [llmStatus, embStatus] = await Promise.all([
        getLlmStatus(),
        getEmbeddingsStatus(),
      ]);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setLlm(llmStatus);
      setEmbeddings(embStatus);
      setError(null);
    } catch (err) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
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
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, ACTIVE_POLL_MS);
    return () => window.clearInterval(id);
  }, [isActive, refresh]);

  return { llm, embeddings, error, refresh };
}
