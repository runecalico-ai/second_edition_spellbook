// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelDownloadModal } from "./ModelDownloadModal";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

afterEach(() => {
  cleanup();
});

describe("ModelDownloadModal", () => {
  it("renders modal content and progress metadata", () => {
    render(
      <ModelDownloadModal
        isOpen
        modelLabel="Chat Model"
        bytesDownloaded={350_000_000}
        totalBytes={700_000_000}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByTestId("model-download-modal")).toBeTruthy();
    expect(screen.getByTestId("model-download-modal-bytes").textContent).toContain("50%");
    expect(screen.getByTestId("model-download-modal-progress-bar").getAttribute("aria-valuenow")).toBe("50");
  });

  it("calls onCancel for cancel button and backdrop", () => {
    const onCancel = vi.fn();
    render(
      <ModelDownloadModal
        isOpen
        modelLabel="Chat Model"
        bytesDownloaded={1}
        totalBytes={2}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByTestId("model-download-modal-cancel-button"));
    fireEvent.click(screen.getByTestId("model-download-modal-backdrop"));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
