// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmbeddingsStatus } from "../types/llm";
import { useEmbeddingsProvisioning } from "./useEmbeddingsProvisioning";

const downloadEmbeddingsModel = vi.fn();
const importEmbeddingsModelFile = vi.fn();
const cancelEmbeddingsDownload = vi.fn();
const open = vi.fn();

vi.mock("../api/llm", () => ({
  downloadEmbeddingsModel: (...args: unknown[]) => downloadEmbeddingsModel(...args),
  importEmbeddingsModelFile: (...args: unknown[]) => importEmbeddingsModelFile(...args),
  cancelEmbeddingsDownload: (...args: unknown[]) => cancelEmbeddingsDownload(...args),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => open(...args),
}));

vi.mock("./useModelDownloadProgress", () => ({
  useModelDownloadProgress: () => ({
    bytesDownloaded: 0,
    totalBytes: 0,
    fraction: 0,
  }),
}));

describe("useEmbeddingsProvisioning", () => {
  const refresh = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    downloadEmbeddingsModel.mockResolvedValue(undefined);
    importEmbeddingsModelFile.mockResolvedValue(undefined);
    cancelEmbeddingsDownload.mockResolvedValue(undefined);
    refresh.mockResolvedValue(undefined);
  });

  it("auto-opens modal when embeddingsState is downloading on mount", () => {
    const { result } = renderHook(() =>
      useEmbeddingsProvisioning({ embeddingsState: "downloading", refresh }),
    );

    expect(result.current.isDownloadModalOpen).toBe(true);
  });

  it("auto-closes modal when embeddingsState transitions downloading to ready", () => {
    const { result, rerender } = renderHook(
      ({ embeddingsState }: { embeddingsState: EmbeddingsStatus }) =>
        useEmbeddingsProvisioning({ embeddingsState, refresh }),
      { initialProps: { embeddingsState: "downloading" } },
    );

    expect(result.current.isDownloadModalOpen).toBe(true);

    rerender({ embeddingsState: "ready" });

    expect(result.current.isDownloadModalOpen).toBe(false);
    expect(refresh).toHaveBeenCalled();
  });

  it("auto-closes modal when embeddingsState transitions downloading to error after observing download", () => {
    const { result, rerender } = renderHook(
      ({ embeddingsState }: { embeddingsState: EmbeddingsStatus }) =>
        useEmbeddingsProvisioning({ embeddingsState, refresh }),
      { initialProps: { embeddingsState: "downloading" } },
    );

    expect(result.current.isDownloadModalOpen).toBe(true);

    rerender({ embeddingsState: "error" });

    expect(result.current.isDownloadModalOpen).toBe(false);
    expect(refresh).toHaveBeenCalled();
  });

  it("starts download and calls refresh", async () => {
    const { result } = renderHook(() =>
      useEmbeddingsProvisioning({ embeddingsState: "notProvisioned", refresh }),
    );

    await act(async () => {
      await result.current.download();
    });

    expect(downloadEmbeddingsModel).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalled();
    expect(result.current.isDownloadModalOpen).toBe(true);
  });

  it("closes modal when download() fails", async () => {
    downloadEmbeddingsModel.mockRejectedValue(new Error("network error"));
    const { result } = renderHook(() =>
      useEmbeddingsProvisioning({ embeddingsState: "notProvisioned", refresh }),
    );

    await act(async () => {
      await result.current.download();
    });

    expect(result.current.isDownloadModalOpen).toBe(false);
    expect(refresh).toHaveBeenCalled();
  });

  it("imports from a directory path when user picks a folder", async () => {
    open.mockResolvedValue("/vault/all-MiniLM-L6-v2");
    const { result } = renderHook(() =>
      useEmbeddingsProvisioning({ embeddingsState: "notProvisioned", refresh }),
    );

    await act(async () => {
      await result.current.importBundle();
    });

    expect(open).toHaveBeenCalledWith({ directory: true, multiple: false });
    expect(importEmbeddingsModelFile).toHaveBeenCalledWith("/vault/all-MiniLM-L6-v2");
    expect(refresh).toHaveBeenCalled();
  });

  it("does not import when user cancels folder picker", async () => {
    open.mockResolvedValue(null);
    const { result } = renderHook(() =>
      useEmbeddingsProvisioning({ embeddingsState: "notProvisioned", refresh }),
    );

    await act(async () => {
      await result.current.importBundle();
    });

    expect(importEmbeddingsModelFile).not.toHaveBeenCalled();
  });

  it("cancels download, closes modal, and calls refresh", async () => {
    const { result } = renderHook(() =>
      useEmbeddingsProvisioning({ embeddingsState: "downloading", refresh }),
    );

    await act(async () => {
      await result.current.cancelDownload();
    });

    expect(cancelEmbeddingsDownload).toHaveBeenCalledTimes(1);
    expect(result.current.isDownloadModalOpen).toBe(false);
    expect(result.current.isDownloadInProgress).toBe(false);
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps modal closed after cancel when backend still reports downloading", async () => {
    const { result, rerender } = renderHook(
      ({ embeddingsState }: { embeddingsState: EmbeddingsStatus }) =>
        useEmbeddingsProvisioning({ embeddingsState, refresh }),
      { initialProps: { embeddingsState: "downloading" } },
    );

    await act(async () => {
      await result.current.cancelDownload();
    });

    expect(result.current.isDownloadModalOpen).toBe(false);

    rerender({ embeddingsState: "downloading" });

    expect(result.current.isDownloadModalOpen).toBe(false);
  });
});
