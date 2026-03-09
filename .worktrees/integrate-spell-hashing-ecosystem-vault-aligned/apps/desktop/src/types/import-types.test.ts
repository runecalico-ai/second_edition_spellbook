import { describe, expect, it } from "vitest";
import { abbreviateHash } from "./import-types";

describe("abbreviateHash", () => {
  it("returns empty string for null", () => {
    expect(abbreviateHash(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(abbreviateHash(undefined)).toBe("");
  });

  it("returns the full hash when 16 characters or fewer", () => {
    expect(abbreviateHash("abc123")).toBe("abc123");
    expect(abbreviateHash("1234567890abcdef")).toBe("1234567890abcdef"); // exactly 16
  });

  it("truncates hash longer than 16 characters and appends ellipsis", () => {
    const hash = "1234567890abcdef0000";
    expect(abbreviateHash(hash)).toBe("1234567890abcdef\u2026");
  });

  it("handles a realistic SHA-256 content hash", () => {
    const sha256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const result = abbreviateHash(sha256);
    expect(result).toBe("e3b0c44298fc1c14\u2026");
    expect(result.length).toBe(17); // 16 chars + "…"
  });

  it("does not truncate a 15-character hash", () => {
    const hash = "123456789012345";
    expect(abbreviateHash(hash)).toBe("123456789012345");
  });
});
