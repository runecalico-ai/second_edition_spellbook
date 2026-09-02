import { invoke } from "@tauri-apps/api/core";
import type {
  ChatMessage,
  EmbeddingsStatusResponse,
  LlmStatusResponse,
  ReindexResult,
  SemanticSearchResult,
} from "../types/llm";
import { spellbookE2EHarness } from "../ui/spellbookE2EHarness";

// Each scripted command checks the opt-in Playwright local ML harness first.
// An active harness result (including a rejection) is returned as-is and never
// falls through to production IPC; `undefined` means the harness is inactive.

// ── LLM Commands ────────────────────────────────────────────────────────────

export async function getLlmStatus(): Promise<LlmStatusResponse> {
  const override = spellbookE2EHarness.localMl.getLlmStatus();
  return override === undefined ? invoke<LlmStatusResponse>("llm_status") : override;
}

export async function downloadLlmModel(): Promise<void> {
  const override = spellbookE2EHarness.localMl.downloadLlmModel();
  return override === undefined ? invoke<void>("llm_download_model") : override;
}

export async function importLlmModelFile(filePath: string): Promise<void> {
  return invoke<void>("llm_import_model_file", { filePath });
}

export async function cancelLlmDownload(): Promise<void> {
  const override = spellbookE2EHarness.localMl.cancelLlmDownload();
  return override === undefined ? invoke<void>("llm_cancel_download") : override;
}

export async function cancelLlmGeneration(streamId: string): Promise<void> {
  const override = spellbookE2EHarness.localMl.cancelLlmGeneration(streamId);
  return override === undefined ? invoke<void>("llm_cancel_generation", { streamId }) : override;
}

export async function startLlmChat(
  message: string,
  streamId: string,
  history: ChatMessage[],
): Promise<void> {
  const override = spellbookE2EHarness.localMl.startLlmChat(message, streamId, history);
  return override === undefined
    ? invoke<void>("llm_chat", { message, streamId, history })
    : override;
}

// ── Embedding Commands ───────────────────────────────────────────────────────

export async function getEmbeddingsStatus(): Promise<EmbeddingsStatusResponse> {
  const override = spellbookE2EHarness.localMl.getEmbeddingsStatus();
  return override === undefined ? invoke<EmbeddingsStatusResponse>("embeddings_status") : override;
}

export async function downloadEmbeddingsModel(): Promise<void> {
  const override = spellbookE2EHarness.localMl.downloadEmbeddingsModel();
  return override === undefined ? invoke<void>("embeddings_download_model") : override;
}

export async function importEmbeddingsModelFile(filePath: string): Promise<void> {
  return invoke<void>("embeddings_import_model_file", { filePath });
}

export async function cancelEmbeddingsDownload(): Promise<void> {
  const override = spellbookE2EHarness.localMl.cancelEmbeddingsDownload();
  return override === undefined ? invoke<void>("embeddings_cancel_download") : override;
}

export async function searchSpellsSemantic(
  query: string,
  limit?: number,
): Promise<SemanticSearchResult[]> {
  const override = spellbookE2EHarness.localMl.searchSpellsSemantic(query, limit);
  if (override !== undefined) {
    return override;
  }

  // Omit `limit` when undefined so Tauri receives only `{ query }`; passing
  // `limit: undefined` would serialize the key and may confuse the Rust side.
  return invoke<SemanticSearchResult[]>(
    "search_spells_semantic",
    limit !== undefined ? { query, limit } : { query },
  );
}

export async function reindexEmbeddings(force: boolean): Promise<ReindexResult> {
  const override = spellbookE2EHarness.localMl.reindexEmbeddings(force);
  return override === undefined ? invoke<ReindexResult>("reindex_embeddings", { force }) : override;
}
