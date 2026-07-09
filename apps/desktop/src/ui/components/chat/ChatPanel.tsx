// apps/desktop/src/ui/components/chat/ChatPanel.tsx
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelEmbeddingsDownload,
  cancelLlmDownload,
  downloadEmbeddingsModel,
  downloadLlmModel,
  importEmbeddingsModelFile,
  importLlmModelFile,
} from "../../../api/llm";
import { useChatSession } from "../../../hooks/useChatSession";
import { useModelDownloadProgress, type ModelKind } from "../../../hooks/useModelDownloadProgress";
import { useModelStatus } from "../../../hooks/useModelStatus";
import { ChatHeader } from "./ChatHeader";
import { ChatInputBar } from "./ChatInputBar";
import { ChatProvisioningPrompt } from "./ChatProvisioningPrompt";
import { canSendChat } from "./chatUtils";
import { MessageList } from "./MessageList";
import { ModelDownloadModal } from "./ModelDownloadModal";

const MODEL_LABEL: Record<ModelKind, string> = {
  llm: "Chat Model",
  embeddings: "Embedding Model",
};

async function pickModelFile(): Promise<string | null> {
  const selected = await open({ multiple: false });
  if (selected === null) return null;
  return Array.isArray(selected) ? selected[0] : selected;
}

export function ChatPanel() {
  const { llm, embeddings, error: statusError, refresh } = useModelStatus();
  const { messages, draft, setDraft, send, cancel, isGenerating, isModelLoading } = useChatSession(
    llm.status,
  );

  const [activeDownload, setActiveDownload] = useState<{ kind: ModelKind } | null>(null);
  // Tracks whether the currently-tracked download has actually reached the
  // "downloading" status at least once, so we don't prematurely close the
  // modal while a freshly-started download hasn't been observed by the
  // status poller yet.
  const sawDownloadingRef = useRef(false);

  // Auto-open the download modal on mount/revisit if a download is already
  // in progress on the backend (e.g. the user navigated away and back).
  useEffect(() => {
    if (activeDownload) return;
    if (llm.status === "downloading") {
      setActiveDownload({ kind: "llm" });
    } else if (embeddings.state === "downloading") {
      setActiveDownload({ kind: "embeddings" });
    }
  }, [llm.status, embeddings.state, activeDownload]);

  // Close the modal and refresh model status once the tracked download
  // leaves the "downloading" state (completed, failed, or was cancelled).
  //
  // We can't rely solely on "we previously observed downloading" because the
  // status poller may never catch the backend mid-download for very fast
  // downloads/imports (e.g. in tests where refresh() is a no-op). In that
  // case, an unambiguous terminal status reached for the tracked download's
  // own kind (ready/loaded/error) while a download is still tracked also
  // indicates completion and should close the modal. The check is scoped to
  // activeDownload.kind so an unrelated model's status can't prematurely
  // close the modal for the one actually being tracked (e.g. embeddings
  // already being "ready" shouldn't close an in-flight llm download modal).
  useEffect(() => {
    if (!activeDownload) {
      sawDownloadingRef.current = false;
      return;
    }

    const isDownloadingNow =
      activeDownload.kind === "llm" ? llm.status === "downloading" : embeddings.state === "downloading";

    if (isDownloadingNow) {
      sawDownloadingRef.current = true;
      return;
    }

    const successTerminal =
      activeDownload.kind === "llm"
        ? llm.status === "ready" || llm.status === "loaded"
        : embeddings.state === "ready";
    const failedAfterObservedDownload =
      sawDownloadingRef.current &&
      (activeDownload.kind === "llm" ? llm.status === "error" : embeddings.state === "error");

    if (sawDownloadingRef.current || successTerminal || failedAfterObservedDownload) {
      setActiveDownload(null);
      void refresh();
    }
  }, [activeDownload, llm.status, embeddings.state, refresh]);

  const handleDownloadLlm = useCallback(async () => {
    setActiveDownload({ kind: "llm" });
    try {
      await downloadLlmModel();
    } catch {
      setActiveDownload(null);
    } finally {
      void refresh();
    }
  }, [refresh]);

  const handleDownloadEmbeddings = useCallback(async () => {
    setActiveDownload({ kind: "embeddings" });
    try {
      await downloadEmbeddingsModel();
    } catch {
      setActiveDownload(null);
    } finally {
      void refresh();
    }
  }, [refresh]);

  const handleImportLlm = useCallback(async () => {
    const path = await pickModelFile();
    if (path === null) return;
    try {
      await importLlmModelFile(path);
    } catch {
      // Failure is surfaced to the user via llm.lastError after refresh().
    } finally {
      await refresh();
    }
  }, [refresh]);

  const handleImportEmbeddings = useCallback(async () => {
    const path = await pickModelFile();
    if (path === null) return;
    try {
      await importEmbeddingsModelFile(path);
    } catch {
      // Failure is surfaced to the user via embeddings.errorMessage after refresh().
    } finally {
      await refresh();
    }
  }, [refresh]);

  const handleCancelDownload = useCallback(async () => {
    const kind = activeDownload?.kind ?? "llm";
    try {
      if (kind === "llm") {
        await cancelLlmDownload();
      } else {
        await cancelEmbeddingsDownload();
      }
    } finally {
      setActiveDownload(null);
      void refresh();
    }
  }, [activeDownload, refresh]);

  const downloadKind: ModelKind =
    activeDownload?.kind ?? (embeddings.state === "downloading" ? "embeddings" : "llm");
  const isDownloadModalOpen =
    llm.status === "downloading" || embeddings.state === "downloading" || activeDownload !== null;
  const progress = useModelDownloadProgress(downloadKind, isDownloadModalOpen);

  const llmNeedsSetup = llm.status === "notProvisioned" || llm.status === "error";
  const embeddingsNeedsSetup = embeddings.state === "notProvisioned" || embeddings.state === "error";
  const canChat = canSendChat(llm.status);

  return (
    <div
      data-testid="chat-panel"
      className="flex flex-col h-[calc(100vh-12rem)] min-h-[480px] rounded-2xl border border-neutral-200/50 dark:border-neutral-700/50 bg-white/60 dark:bg-neutral-900/50 backdrop-blur-xl shadow-xl p-4 sm:p-6 animate-in fade-in zoom-in-95 duration-300"
    >
      <ChatHeader llm={llm} embeddings={embeddings} />
      {statusError ? (
        <p
          data-testid="chat-status-error"
          className="text-xs text-red-600 dark:text-red-400 mt-2"
        >
          {statusError}
        </p>
      ) : null}
      {!canChat ? (
        <ChatProvisioningPrompt
          onDownloadLlm={() => void handleDownloadLlm()}
          onImportLlm={() => void handleImportLlm()}
          onDownloadEmbeddings={() => void handleDownloadEmbeddings()}
          onImportEmbeddings={() => void handleImportEmbeddings()}
          onRetryDownload={() => void handleDownloadLlm()}
          llmNeedsSetup={llmNeedsSetup}
          llmErrorMessage={llm.lastError}
          embeddingsNotProvisioned={embeddingsNeedsSetup}
          embeddingsErrorMessage={embeddings.errorMessage}
        />
      ) : (
        <>
          <MessageList messages={messages} isModelLoading={isModelLoading} />
          {!isDownloadModalOpen && (
            <ChatInputBar
              value={draft}
              onChange={setDraft}
              onSend={() => void send()}
              onCancel={() => void cancel()}
              isGenerating={isGenerating}
              isModelLoading={isModelLoading}
              disabled={false}
            />
          )}
        </>
      )}
      {isDownloadModalOpen ? (
        <ModelDownloadModal
          isOpen
          modelLabel={MODEL_LABEL[downloadKind]}
          bytesDownloaded={progress.bytesDownloaded}
          totalBytes={progress.totalBytes}
          onCancel={() => void handleCancelDownload()}
        />
      ) : null}
    </div>
  );
}
