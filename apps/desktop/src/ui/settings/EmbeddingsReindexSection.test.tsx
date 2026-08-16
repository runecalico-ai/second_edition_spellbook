// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddingsReindexSection } from "./EmbeddingsReindexSection";

const reindexEmbeddings = vi.fn();
vi.mock("../../api/llm", () => ({
  reindexEmbeddings: (...args: unknown[]) => reindexEmbeddings(...args),
}));

const { mockStatus } = vi.hoisted(() => ({
  mockStatus: {
    embeddings: { state: "ready" as string, errorMessage: null as string | null },
    refresh: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../hooks/useModelStatus", () => ({
  useModelStatus: () => mockStatus,
}));

vi.mock("../../hooks/useReindexProgress", () => ({
  useReindexProgress: () => ({ current: 1, total: 4, fraction: 0.25 }),
}));

describe("EmbeddingsReindexSection", () => {
  beforeEach(() => {
    reindexEmbeddings.mockReset();
    mockStatus.embeddings = { state: "ready" };
    mockStatus.refresh = vi.fn().mockResolvedValue(undefined);
  });
  afterEach(cleanup);

  it("disables both buttons when embeddings are not ready", () => {
    mockStatus.embeddings = { state: "notProvisioned" };
    render(<EmbeddingsReindexSection />);
    expect(
      (screen.getByTestId("settings-reindex-missing-button") as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByTestId("settings-reindex-unavailable-hint")).toBeTruthy();
  });

  it("calls reindexEmbeddings(false) from the missing-vectors button", async () => {
    reindexEmbeddings.mockResolvedValue({ total: 10, indexed: 2, skipped: 8, failed: 0 });
    render(<EmbeddingsReindexSection />);
    fireEvent.click(screen.getByTestId("settings-reindex-missing-button"));
    await waitFor(() => {
      expect(reindexEmbeddings).toHaveBeenCalledWith(false);
    });
    expect(screen.getByTestId("settings-reindex-result").textContent).toMatch(/2 indexed/);
  });

  it("calls reindexEmbeddings(true) from the all-spells button", async () => {
    reindexEmbeddings.mockResolvedValue({ total: 10, indexed: 10, skipped: 0, failed: 0 });
    render(<EmbeddingsReindexSection />);
    fireEvent.click(screen.getByTestId("settings-reindex-all-button"));
    await waitFor(() => {
      expect(reindexEmbeddings).toHaveBeenCalledWith(true);
    });
  });

  it("shows invoke errors inline", async () => {
    reindexEmbeddings.mockRejectedValue(new Error("embedding model is unavailable"));
    render(<EmbeddingsReindexSection />);
    fireEvent.click(screen.getByTestId("settings-reindex-missing-button"));
    expect(await screen.findByTestId("settings-reindex-error")).toBeTruthy();
  });
});
