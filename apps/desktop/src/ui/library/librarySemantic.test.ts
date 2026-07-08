import { describe, expect, it } from "vitest";
import type { EmbeddingsStatus } from "../../types/llm";
import {
  canRunSemanticSearch,
  deriveSemanticAvailability,
  SEMANTIC_SEARCH_LIMIT,
  type SemanticAvailability,
} from "./librarySemantic";

describe("deriveSemanticAvailability", () => {
  const semanticModeExpectations = {
    notProvisioned: "notProvisioned",
    downloading: "downloading",
    initializing: "initializing",
    error: "error",
    ready: "ready",
  } satisfies Record<EmbeddingsStatus, SemanticAvailability>;

  it.each(
    Object.entries(semanticModeExpectations) as [EmbeddingsStatus, SemanticAvailability][],
  )("maps embeddings state %s → %s in semantic mode", (state, expected) => {
    expect(deriveSemanticAvailability("semantic", state)).toBe(expected);
  });

  it.each(
    Object.keys(semanticModeExpectations) as EmbeddingsStatus[],
  )("returns keyword in keyword mode regardless of embeddings state %s", (state) => {
    expect(deriveSemanticAvailability("keyword", state)).toBe("keyword");
  });
});

describe("canRunSemanticSearch", () => {
  const expectedCanRun = {
    keyword: false,
    notProvisioned: false,
    downloading: false,
    initializing: false,
    error: false,
    ready: true,
  } satisfies Record<SemanticAvailability, boolean>;

  it.each(Object.entries(expectedCanRun) as [SemanticAvailability, boolean][])(
    "returns %s → %s",
    (availability, expected) => {
      expect(canRunSemanticSearch(availability)).toBe(expected);
    },
  );
});

describe("SEMANTIC_SEARCH_LIMIT", () => {
  it("matches keyword search cap", () => {
    expect(SEMANTIC_SEARCH_LIMIT).toBe(100);
  });
});
