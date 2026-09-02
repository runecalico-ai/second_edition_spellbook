// apps/desktop/src/ui/components/chat/chatProvisionerErrors.test.ts
import { describe, expect, it } from "vitest";
import { formatChatSystemError, parseProvisionerError } from "./chatProvisionerErrors";

describe("parseProvisionerError", () => {
  it("returns null for empty input", () => {
    expect(parseProvisionerError(null)).toBeNull();
    expect(parseProvisionerError("  ")).toBeNull();
  });

  it("classifies disk errors with byte details", () => {
    const parsed = parseProvisionerError(
      "Insufficient disk space: required 800 MiB (838860800 bytes), available 120 MiB (125829120 bytes)",
    );
    expect(parsed?.kind).toBe("disk");
    expect(parsed?.requiredBytes).toBe(838860800);
    expect(parsed?.availableBytes).toBe(125829120);
    expect(parsed?.description).toContain("800 MiB");
    expect(parsed?.description).toContain("120 MiB");
  });

  it("classifies RAM errors", () => {
    const parsed = parseProvisionerError(
      "Insufficient RAM: at least 1.5 GB free required to load the model",
    );
    expect(parsed?.kind).toBe("ram");
    expect(parsed?.description).toContain("Close other applications");
  });

  it("classifies network download failures", () => {
    const parsed = parseProvisionerError("LLM model download stream failed: connection reset");
    expect(parsed?.kind).toBe("network");
    expect(parsed?.description).toContain("resume");
  });

  it("falls back to generic", () => {
    const parsed = parseProvisionerError("SHA-256 mismatch");
    expect(parsed?.kind).toBe("generic");
    expect(parsed?.description).toBe("SHA-256 mismatch");
  });

  it("does not misclassify a DB connection pool error as network", () => {
    const parsed = parseProvisionerError("Connection pool error: timed out waiting for connection");
    expect(parsed?.kind).toBe("generic");
  });
});

describe("formatChatSystemError", () => {
  it("adds RAM guidance for chat system messages", () => {
    const msg = formatChatSystemError(
      "Insufficient RAM: at least 1.5 GB free required to load the model",
    );
    expect(msg).toContain("Close other applications");
  });
});
