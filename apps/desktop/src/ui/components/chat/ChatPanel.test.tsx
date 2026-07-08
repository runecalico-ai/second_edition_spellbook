// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmbeddingsStatusResponse, LlmStatusResponse } from "../../../types/llm";
import { ChatPanel } from "./ChatPanel";

const mockOpen = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => mockOpen(...args),
}));

const mockDownloadLlmModel = vi.fn();
const mockDownloadEmbeddingsModel = vi.fn();
const mockImportLlmModelFile = vi.fn();
const mockImportEmbeddingsModelFile = vi.fn();
const mockCancelLlmDownload = vi.fn();
const mockCancelEmbeddingsDownload = vi.fn();
vi.mock("../../../api/llm", () => ({
  downloadLlmModel: (...args: unknown[]) => mockDownloadLlmModel(...args),
  downloadEmbeddingsModel: (...args: unknown[]) => mockDownloadEmbeddingsModel(...args),
  importLlmModelFile: (...args: unknown[]) => mockImportLlmModelFile(...args),
  importEmbeddingsModelFile: (...args: unknown[]) => mockImportEmbeddingsModelFile(...args),
  cancelLlmDownload: (...args: unknown[]) => mockCancelLlmDownload(...args),
  cancelEmbeddingsDownload: (...args: unknown[]) => mockCancelEmbeddingsDownload(...args),
}));

let llmStatus: LlmStatusResponse;
let embeddingsStatus: EmbeddingsStatusResponse;
const mockRefresh = vi.fn();
vi.mock("../../../hooks/useModelStatus", () => ({
  useModelStatus: () => ({
    llm: llmStatus,
    embeddings: embeddingsStatus,
    error: null,
    refresh: mockRefresh,
  }),
}));

const mockSend = vi.fn();
const mockCancel = vi.fn();
const mockSetDraft = vi.fn();
vi.mock("../../../hooks/useChatSession", () => ({
  useChatSession: () => ({
    messages: [],
    draft: "",
    setDraft: mockSetDraft,
    send: mockSend,
    cancel: mockCancel,
    isGenerating: false,
    isModelLoading: false,
  }),
}));

vi.mock("../../../hooks/useModelDownloadProgress", () => ({
  useModelDownloadProgress: () => ({ bytesDownloaded: 100, totalBytes: 200, fraction: 0.5 }),
}));

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

beforeEach(() => {
  vi.clearAllMocks();
  llmStatus = { status: "notProvisioned", modelPath: "" };
  embeddingsStatus = { state: "notProvisioned" };
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
  // jsdom does not implement matchMedia; MessageList checks prefers-reduced-motion on render.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
  // jsdom does not implement scrollIntoView; MessageList scrolls to the bottom on updates.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  HTMLDialogElement.prototype.showModal = originalShowModal;
  HTMLDialogElement.prototype.close = originalClose;
});

describe("ChatPanel", () => {
  it("renders the glass wrapper and header", () => {
    render(<ChatPanel />);
    expect(screen.getByTestId("chat-panel")).toBeTruthy();
    expect(screen.getByTestId("chat-header")).toBeTruthy();
  });

  it("shows the provisioning prompt when the LLM is not provisioned", () => {
    llmStatus = { status: "notProvisioned", modelPath: "" };
    render(<ChatPanel />);

    expect(screen.getByTestId("chat-provisioning-empty-state")).toBeTruthy();
    expect(screen.queryByTestId("chat-input-bar")).toBeNull();
    expect(screen.queryByTestId("model-download-modal")).toBeNull();
  });

  it("shows the chat input when the LLM is ready", () => {
    llmStatus = { status: "ready", modelPath: "/vault/models/tinyllama.gguf" };
    render(<ChatPanel />);

    expect(screen.getByTestId("chat-input-bar")).toBeTruthy();
    expect(screen.getByTestId("chat-message-list")).toBeTruthy();
    expect(screen.queryByTestId("chat-provisioning-empty-state")).toBeNull();
    expect(screen.queryByTestId("model-download-modal")).toBeNull();
  });

  it("shows the chat input when the LLM is loaded", () => {
    llmStatus = { status: "loaded", modelPath: "/vault/models/tinyllama.gguf" };
    render(<ChatPanel />);

    expect(screen.getByTestId("chat-input-bar")).toBeTruthy();
    expect(screen.queryByTestId("chat-provisioning-empty-state")).toBeNull();
  });

  it("gates the provisioning prompt with llmNeedsSetup and surfaces lastError on error status", () => {
    llmStatus = { status: "error", modelPath: "", lastError: "Boom: disk full" };
    render(<ChatPanel />);

    const emptyState = screen.getByTestId("chat-provisioning-empty-state");
    expect(emptyState).toBeTruthy();
    expect(within(emptyState).getByText(/Model setup failed: Boom: disk full/)).toBeTruthy();
  });

  it("auto-opens the download modal when llm.status is downloading on mount", () => {
    llmStatus = { status: "downloading", modelPath: "", bytesDownloaded: 100, totalBytes: 200 };
    render(<ChatPanel />);

    expect(screen.getByTestId("model-download-modal")).toBeTruthy();
    expect(screen.queryByTestId("chat-input-bar")).toBeNull();
    expect(screen.queryByTestId("chat-provisioning-empty-state")).toBeNull();
  });

  it("auto-opens the download modal when embeddings.state is downloading on mount", () => {
    llmStatus = { status: "notProvisioned", modelPath: "" };
    embeddingsStatus = { state: "downloading", downloadProgress: 0.5 };
    render(<ChatPanel />);

    expect(screen.getByTestId("model-download-modal")).toBeTruthy();
    expect(screen.getByText(/Downloading Embedding Model/)).toBeTruthy();
  });

  it("clicking Download Chat Model calls downloadLlmModel and opens the modal", async () => {
    mockDownloadLlmModel.mockResolvedValue(undefined);
    llmStatus = { status: "notProvisioned", modelPath: "" };
    render(<ChatPanel />);

    fireEvent.click(screen.getByTestId("chat-llm-download-button"));

    expect(mockDownloadLlmModel).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("model-download-modal")).toBeTruthy();
  });

  it("clicking Add Local Chat Model opens the file picker and imports the selected file", async () => {
    mockOpen.mockResolvedValue("/path/to/model.gguf");
    mockImportLlmModelFile.mockResolvedValue(undefined);
    llmStatus = { status: "notProvisioned", modelPath: "" };
    render(<ChatPanel />);

    fireEvent.click(screen.getByTestId("chat-llm-import-button"));

    await vi.waitFor(() => {
      expect(mockImportLlmModelFile).toHaveBeenCalledWith("/path/to/model.gguf");
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("does not import when the file picker is cancelled", async () => {
    mockOpen.mockResolvedValue(null);
    llmStatus = { status: "notProvisioned", modelPath: "" };
    render(<ChatPanel />);

    fireEvent.click(screen.getByTestId("chat-llm-import-button"));

    await vi.waitFor(() => {
      expect(mockOpen).toHaveBeenCalledTimes(1);
    });
    expect(mockImportLlmModelFile).not.toHaveBeenCalled();
  });

        it("unwraps an array result from the file picker", async () => {
          mockOpen.mockResolvedValue(["/first/path.gguf", "/second/path.gguf"]);
          mockImportEmbeddingsModelFile.mockResolvedValue(undefined);
          llmStatus = { status: "notProvisioned", modelPath: "" };
          embeddingsStatus = { state: "notProvisioned" };
          render(<ChatPanel />);

    fireEvent.click(screen.getByTestId("chat-embeddings-import-button"));

    await vi.waitFor(() => {
      expect(mockImportEmbeddingsModelFile).toHaveBeenCalledWith("/first/path.gguf");
    });
  });

  it("cancelling the download calls cancelLlmDownload and closes the modal", async () => {
    mockDownloadLlmModel.mockResolvedValue(undefined);
    mockCancelLlmDownload.mockResolvedValue(undefined);
    llmStatus = { status: "notProvisioned", modelPath: "" };
    render(<ChatPanel />);

    fireEvent.click(screen.getByTestId("chat-llm-download-button"));
    expect(await screen.findByTestId("model-download-modal")).toBeTruthy();

    fireEvent.click(screen.getByTestId("model-download-modal-cancel-button"));

    expect(mockCancelLlmDownload).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(screen.queryByTestId("model-download-modal")).toBeNull();
    });
    expect(screen.getByTestId("chat-provisioning-empty-state")).toBeTruthy();
  });
});
