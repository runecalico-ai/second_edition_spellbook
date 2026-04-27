import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";

type TokenEvent = {
  token: string;
};

type DoneEvent = {
  fullResponse: string;
  cancelled: boolean;
};

export default function Chat() {
  const isMountedRef = useRef(true);
  const isGeneratingRef = useRef(false);
  const activeStreamIdRef = useRef<string | null>(null);
  const [q, setQ] = useState("How many missiles at level 5?");
  const [a, setA] = useState<string>("(Answer will appear here)");
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeStreamId, setActiveStreamId] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      const streamId = activeStreamIdRef.current;
      if (streamId) {
        void invoke<void>("llm_cancel_generation", { streamId });
      }
    };
  }, []);

  const ask = async () => {
    if (!q.trim() || isGeneratingRef.current) {
      return;
    }
    isGeneratingRef.current = true;

    const streamId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setIsGenerating(true);
    setActiveStreamId(streamId);
    activeStreamIdRef.current = streamId;
    setError(null);
    setA("");

    let tokenUnlisten: (() => void) | null = null;
    let doneUnlisten: (() => void) | null = null;
    let resolveDone: (() => void) | null = null;
    let doneFallbackTimerId: number | null = null;
    const donePromise = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });

    try {
      tokenUnlisten = await listen<TokenEvent>(`llm://token/${streamId}`, (event) => {
        if (!isMountedRef.current) {
          return;
        }
        setA((prev) => `${prev}${event.payload.token}`);
      });

      doneUnlisten = await listen<DoneEvent>(`llm://done/${streamId}`, (event) => {
        if (isMountedRef.current) {
          setA((prev) =>
            event.payload.fullResponse.length > 0 ? event.payload.fullResponse : prev,
          );
        }
        resolveDone?.();
      });

      await invoke<void>("llm_chat", { message: q, streamId });
      await Promise.race([
        donePromise,
        new Promise<void>((resolve) => {
          doneFallbackTimerId = window.setTimeout(() => {
            resolve();
          }, 5000);
        }),
      ]);
    } catch (caught) {
      try {
        await invoke<void>("llm_cancel_generation", { streamId });
      } catch {
        // Ignore best-effort cancellation failures while surfacing the primary error.
      }

      if (isMountedRef.current) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    } finally {
      if (doneFallbackTimerId !== null) {
        window.clearTimeout(doneFallbackTimerId);
      }
      if (tokenUnlisten) {
        tokenUnlisten();
      }
      if (doneUnlisten) {
        doneUnlisten();
      }
      isGeneratingRef.current = false;
      activeStreamIdRef.current = null;
      if (isMountedRef.current) {
        setIsGenerating(false);
        setActiveStreamId(null);
      }
    }
  };

  const cancel = async () => {
    const streamId = activeStreamIdRef.current;
    if (!streamId || !isGeneratingRef.current) {
      return;
    }

    try {
      await invoke<void>("llm_cancel_generation", { streamId });
    } catch (caught) {
      if (isMountedRef.current) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    }
  };

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Ask the Spellbook</h1>
      <label htmlFor="chat-input" className="sr-only">
        Query
      </label>
      <textarea
        id="chat-input"
        data-testid="chat-input"
        className="w-full bg-neutral-900 border border-neutral-700 rounded-md p-2"
        rows={4}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <button
        className="px-3 py-2 bg-neutral-800 rounded-md"
        data-testid="btn-ask-chat"
        onClick={ask}
        disabled={isGenerating}
        type="button"
      >
        {isGenerating ? "Generating..." : "Ask"}
      </button>
      <button
        className="px-3 py-2 bg-neutral-800 rounded-md"
        data-testid="btn-cancel-chat"
        onClick={cancel}
        disabled={!isGenerating}
        type="button"
      >
        Cancel Generation
      </button>
      <div
        className="bg-neutral-900 border border-neutral-800 rounded-md p-3 text-sm whitespace-pre-wrap"
        data-testid="chat-response-area"
      >
        {a}
      </div>
      {error && (
        <div className="text-xs text-red-300" data-testid="chat-error">
          {error}
        </div>
      )}
    </div>
  );
}
