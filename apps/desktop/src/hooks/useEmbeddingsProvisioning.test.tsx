// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("cancels download and closes modal", async () => {
    const { result } = renderHook(() =>
      useEmbeddingsProvisioning({ embeddingsState: "downloading", refresh }),
    );

    await act(async () => {
      await result.current.cancelDownload();
    });

    expect(cancelEmbeddingsDownload).toHaveBeenCalledTimes(1);
    expect(result.current.isDownloadModalOpen).toBe(false);
  });
});
