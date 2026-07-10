import { useCallback, useEffect, useRef, useState } from "react";
import { cancelLlmGeneration } from "../api/llm";
import { listenLlmEvent } from "../api/llmEvents";
import type { DoneEvent, LlmChatGrounding, TokenEvent } from "../types/llm";

export interface LlmStreamState {
  response: string;
  isGenerating: boolean;
  error: string | null;
  grounding: LlmChatGrounding | null;
  cancelled: boolean;
  timedOut: boolean;
  cancel: () => Promise<void>;
}

export function useLlmStream(streamId: string | null): LlmStreamState {
  const [response, setResponse] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grounding, setGrounding] = useState<LlmChatGrounding | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  const trimmedStreamId = streamId?.trim() ?? "";
  const effectiveStreamId = trimmedStreamId.length > 0 ? trimmedStreamId : null;

  const streamIdRef = useRef<string | null>(null);
  streamIdRef.current = effectiveStreamId;

  const isGeneratingRef = useRef(false);
  isGeneratingRef.current = isGenerating;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cancel = useCallback(async () => {
    if (!streamIdRef.current) return;
    try {
      await cancelLlmGeneration(streamIdRef.current);
    } catch (err) {
      if (mountedRef.current && isGeneratingRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  }, []);

  useEffect(() => {
    if (!effectiveStreamId) {
      setResponse("");
      setIsGenerating(false);
      setError(null);
      setGrounding(null);
      setCancelled(false);
      setTimedOut(false);
      return;
    }

    setResponse("");
    setIsGenerating(true);
    setError(null);
    setGrounding(null);
    setCancelled(false);
    setTimedOut(false);

    let active = true;
    const unlisteners: Array<() => void> = [];

    async function setupListeners() {
      try {
        const tokenUn = await listenLlmEvent<TokenEvent>(
          `llm://token/${effectiveStreamId}`,
          (event) => {
            if (!active) return;
            setResponse((prev) => prev + event.payload.token);
          },
        );

        if (!active) {
          tokenUn();
          return;
        }
        unlisteners.push(tokenUn);

        const doneUn = await listenLlmEvent<DoneEvent>(
          `llm://done/${effectiveStreamId}`,
          (event) => {
            if (!active) return;
            setIsGenerating(false);
            setResponse((prev) =>
              event.payload.fullResponse.length > 0 ? event.payload.fullResponse : prev,
            );
            setGrounding({
              searchTerms: event.payload.searchTerms,
              groundedSpells: event.payload.groundedSpells,
            });

            const wasCancelled = event.payload.cancelled;
            const wasTimedOut = event.payload.timedOut;

            if (wasCancelled) {
              setCancelled(true);
            }
            if (wasTimedOut) {
              setTimedOut(true);
            }

            if (wasCancelled && wasTimedOut) {
              setError("Response timed out. Generation cancelled.");
            } else if (wasCancelled) {
              setError("Generation cancelled.");
            } else if (wasTimedOut) {
              setError("Response timed out.");
            } else {
              setError(null);
            }
          },
        );

        if (!active) {
          doneUn();
          return;
        }
        unlisteners.push(doneUn);
      } catch (err) {
        for (const unlisten of unlisteners) {
          unlisten();
        }
        if (active) {
          setError(err instanceof Error ? err.message : String(err));
          setIsGenerating(false);
        }
      }
    }

    setupListeners();

    return () => {
      active = false;
      for (const unlisten of unlisteners) {
        unlisten();
      }
    };
  }, [effectiveStreamId]);

  return {
    response,
    isGenerating,
    error,
    grounding,
    cancelled,
    timedOut,
    cancel,
  };
}
