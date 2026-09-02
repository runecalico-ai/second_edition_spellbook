import { describe, expect, it } from "vitest";
import type { LlmStatus } from "../../../types/llm";
import { canSendChat, createStreamId, formatBytes, spellNameToSlug } from "./chatUtils";

describe("spellNameToSlug", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(spellNameToSlug("Fireball")).toBe("fireball");
    expect(spellNameToSlug("Magic Missile")).toBe("magic-missile");
  });

  it("trims leading and trailing whitespace before slugifying", () => {
    expect(spellNameToSlug("  Fireball  ")).toBe("fireball");
    expect(spellNameToSlug("  Magic Missile  ")).toBe("magic-missile");
  });

  it("collapses double spaces into a single hyphen", () => {
    expect(spellNameToSlug("Magic  Missile")).toBe("magic-missile");
  });

  it("returns empty string for empty input", () => {
    expect(spellNameToSlug("")).toBe("");
    expect(spellNameToSlug("   ")).toBe("");
  });

  it("strips punctuation for data-testid-safe slugs", () => {
    expect(spellNameToSlug("Tasha's Hideous Laughter")).toBe("tashas-hideous-laughter");
  });
});

describe("formatBytes", () => {
  it("formats human-readable sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(734003200)).toBe("700.0 MB");
  });

  it("returns 0 B for negative or non-finite values", () => {
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
  });

  it("formats fractional byte values without undefined units", () => {
    expect(formatBytes(0.5)).toBe("1 B");
  });

  it("formats byte boundary values", () => {
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
  });
});

describe("createStreamId", () => {
  it("returns non-empty id matching backend validate_stream_id contract", () => {
    const id = createStreamId();
    expect(id.length).toBeGreaterThan(0);
    expect(id.length).toBeLessThanOrEqual(128);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("starts with chat- prefix", () => {
    expect(createStreamId()).toMatch(/^chat-/);
  });

  it("returns unique ids across repeated calls", () => {
    const ids = Array.from({ length: 50 }, () => createStreamId());
    expect(new Set(ids).size).toBe(50);
  });
});

describe("canSendChat", () => {
  const expectedCanSendChat = {
    ready: true,
    loaded: true,
    notProvisioned: false,
    downloading: false,
    error: false,
  } satisfies Record<LlmStatus, boolean>;

  it.each(Object.entries(expectedCanSendChat) as [LlmStatus, boolean][])(
    "returns %s → %s",
    (status, expected) => {
      expect(canSendChat(status)).toBe(expected);
    },
  );
});
