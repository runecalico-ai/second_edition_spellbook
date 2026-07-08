import { describe, expect, it } from "vitest";
import { createStreamId, formatBytes, spellNameToSlug } from "./chatUtils";

describe("spellNameToSlug", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(spellNameToSlug("Fireball")).toBe("fireball");
    expect(spellNameToSlug("Magic Missile")).toBe("magic-missile");
  });
});

describe("formatBytes", () => {
  it("formats human-readable sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(734003200)).toBe("700.0 MB");
  });
});

describe("createStreamId", () => {
  it("returns alphanumeric-hyphen-underscore id under 128 chars", () => {
    const id = createStreamId();
    expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(id.length).toBeLessThanOrEqual(128);
  });
});
