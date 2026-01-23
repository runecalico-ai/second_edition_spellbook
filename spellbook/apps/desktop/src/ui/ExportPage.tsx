import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

export default function ExportPage() {
  const [ids, setIds] = useState("");
  const [status, setStatus] = useState("");

  const exportSpells = async (format: "md" | "pdf") => {
    const list = ids
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .map((id) => Number(id))
      .filter((id) => !Number.isNaN(id));
    const path = await invoke<string>("export_spells", { ids: list, format });
    setStatus(path ? `Exported to ${path}` : "No output returned");
  };

  return (
    <div className="space-y-3">
      <h1 className="text-xl font-bold">Export Spells</h1>
      <p>Select spells or a character’s spellbook and export to Markdown or PDF.</p>
      <label htmlFor="export-ids" className="sr-only">
        Spell IDs
      </label>
      <input
        id="export-ids"
        data-testid="export-ids-input"
        className="w-full bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2"
        placeholder="Spell IDs (comma-separated)"
        value={ids}
        onChange={(e) => setIds(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          className="px-3 py-2 bg-neutral-800 rounded-md"
          data-testid="btn-export-md"
          onClick={() => exportSpells("md")}
          type="button"
        >
          Export Markdown
        </button>
        <button
          className="px-3 py-2 bg-neutral-800 rounded-md"
          data-testid="btn-export-pdf"
          onClick={() => exportSpells("pdf")}
          type="button"
        >
          Export PDF
        </button>
      </div>
      {status && <div className="text-xs text-neutral-400" data-testid="export-status-message">{status}</div>}
    </div>
  );
}
