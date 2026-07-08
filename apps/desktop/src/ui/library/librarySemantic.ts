import type { EmbeddingsStatus } from "../../types/llm";

export type SemanticAvailability =
  | "keyword"
  | "notProvisioned"
  | "downloading"
  | "initializing"
  | "error"
  | "ready";

export function deriveSemanticAvailability(
  mode: "keyword" | "semantic",
  embeddingsState: EmbeddingsStatus,
): SemanticAvailability {
  if (mode === "keyword") return "keyword";
  switch (embeddingsState) {
    case "notProvisioned":
      return "notProvisioned";
    case "downloading":
      return "downloading";
    case "initializing":
      return "initializing";
    case "error":
      return "error";
    case "ready":
      return "ready";
  }
}

export function canRunSemanticSearch(availability: SemanticAvailability): boolean {
  return availability === "ready";
}

export const SEMANTIC_SEARCH_LIMIT = 100;
