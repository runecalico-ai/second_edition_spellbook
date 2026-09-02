import { useEffect, useState } from "react";
import { listenLlmEvent } from "../api/llmEvents";
import type { ReindexProgressEvent } from "../types/llm";

export function useReindexProgress(active: boolean) {
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!active) {
      setCurrent(0);
      setTotal(0);
      return;
    }

    setCurrent(0);
    setTotal(0);

    let mounted = true;
    let unlisten: (() => void) | null = null;

    async function setup() {
      const unlistenFn = await listenLlmEvent<ReindexProgressEvent>(
        "embeddings://reindex-progress",
        (event) => {
          if (!mounted) return;
          setCurrent(event.payload.current);
          setTotal(event.payload.total);
        },
      );
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
  }, [active]);

  const fraction = total > 0 ? Math.min(1, current / total) : 0;
  return { current, total, fraction };
}
