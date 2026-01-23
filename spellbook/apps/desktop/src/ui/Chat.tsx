import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

type ChatResponse = {
  answer: string;
  citations: string[];
};

export default function Chat() {
  const [q, setQ] = useState("How many missiles at level 5?");
  const [a, setA] = useState<string>("(Answer will appear here)");
  const [citations, setCitations] = useState<string[]>([]);

  const ask = async () => {
    const response = await invoke<ChatResponse>("chat_answer", { prompt: q });
    setA(response.answer);
    setCitations(response.citations || []);
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
      <button className="px-3 py-2 bg-neutral-800 rounded-md" data-testid="btn-ask-chat" onClick={ask} type="button">
        Ask
      </button>
      <div className="bg-neutral-900 border border-neutral-800 rounded-md p-3 text-sm whitespace-pre-wrap" data-testid="chat-response-area">
        {a}
      </div>
      {citations.length > 0 && (
        <div className="text-xs text-neutral-400" data-testid="chat-citations">Citations: {citations.join(", ")}</div>
      )}
    </div>
  );
}
