import { describe, expect, it } from "vitest";
import {
  canRunSemanticSearch,
  deriveSemanticAvailability,
  SEMANTIC_SEARCH_LIMIT,
} from "./librarySemantic";

describe("deriveSemanticAvailability", () => {
  it("returns keyword when mode is keyword regardless of embeddings state", () => {
    expect(deriveSemanticAvailability("keyword", "notProvisioned")).toBe("keyword");
    expect(deriveSemanticAvailability("keyword", "ready")).toBe("keyword");
  });

  it("maps embeddings states in semantic mode", () => {
    expect(deriveSemanticAvailability("semantic", "notProvisioned")).toBe("notProvisioned");
    expect(deriveSemanticAvailability("semantic", "downloading")).toBe("downloading");
    expect(deriveSemanticAvailability("semantic", "initializing")).toBe("initializing");
    expect(deriveSemanticAvailability("semantic", "error")).toBe("error");
    expect(deriveSemanticAvailability("semantic", "ready")).toBe("ready");
  });
});

describe("canRunSemanticSearch", () => {
  it("is true only when availability is ready", () => {
    expect(canRunSemanticSearch("ready")).toBe(true);
    expect(canRunSemanticSearch("initializing")).toBe(false);
    expect(canRunSemanticSearch("notProvisioned")).toBe(false);
  });
});

describe("SEMANTIC_SEARCH_LIMIT", () => {
  it("matches keyword search cap", () => {
    expect(SEMANTIC_SEARCH_LIMIT).toBe(100);
  });
});
