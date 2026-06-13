import { invoke } from "@tauri-apps/api/core";
import type {
  ChatMessage,
  EmbeddingsStatusResponse,
  LlmStatusResponse,
  ReindexResult,
  SemanticSearchResult,
} from "../types/llm";

// ── LLM Commands ────────────────────────────────────────────────────────────

export async function getLlmStatus(): Promise<LlmStatusResponse> {
  return invoke<LlmStatusResponse>("llm_status");
}

export async function downloadLlmModel(): Promise<void> {
  return invoke<void>("llm_download_model");
}

export async function importLlmModelFile(filePath: string): Promise<void> {
  return invoke<void>("llm_import_model_file", { filePath });
}

export async function cancelLlmDownload(): Promise<void> {
  return invoke<void>("llm_cancel_download");
}

export async function cancelLlmGeneration(streamId: string): Promise<void> {
  return invoke<void>("llm_cancel_generation", { streamId });
}

export async function startLlmChat(
  message: string,
  streamId: string,
  history: ChatMessage[],
): Promise<void> {
  return invoke<void>("llm_chat", { message, streamId, history });
}

// ── Embedding Commands ───────────────────────────────────────────────────────

export async function getEmbeddingsStatus(): Promise<EmbeddingsStatusResponse> {
  return invoke<EmbeddingsStatusResponse>("embeddings_status");
}

export async function downloadEmbeddingsModel(): Promise<void> {
  return invoke<void>("embeddings_download_model");
}

export async function importEmbeddingsModelFile(filePath: string): Promise<void> {
  return invoke<void>("embeddings_import_model_file", { filePath });
}

export async function cancelEmbeddingsDownload(): Promise<void> {
  return invoke<void>("embeddings_cancel_download");
}

export async function searchSpellsSemantic(
  query: string,
  limit?: number,
): Promise<SemanticSearchResult[]> {
  return invoke<SemanticSearchResult[]>(
    "search_spells_semantic",
    limit !== undefined ? { query, limit } : { query },
  );
}

export async function reindexEmbeddings(force: boolean): Promise<ReindexResult> {
  return invoke<ReindexResult>("reindex_embeddings", { force });
}
