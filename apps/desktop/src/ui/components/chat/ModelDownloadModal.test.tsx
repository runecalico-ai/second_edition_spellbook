// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelDownloadModal } from "./ModelDownloadModal";

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

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
  HTMLDialogElement.prototype.showModal = originalShowModal;
  HTMLDialogElement.prototype.close = originalClose;
  vi.restoreAllMocks();
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
    expect(
      screen.getByTestId("model-download-modal-progress-bar").getAttribute("aria-valuenow"),
    ).toBe("50");
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

  it("opens and closes dialog on isOpen changes", () => {
    const { rerender } = render(
      <ModelDownloadModal
        isOpen
        modelLabel="Chat Model"
        bytesDownloaded={1}
        totalBytes={2}
        onCancel={() => {}}
      />,
    );

    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);

    rerender(
      <ModelDownloadModal
        isOpen={false}
        modelLabel="Chat Model"
        bytesDownloaded={1}
        totalBytes={2}
        onCancel={() => {}}
      />,
    );

    expect(HTMLDialogElement.prototype.close).toHaveBeenCalledTimes(1);
  });

  it("handles native dialog cancel event", () => {
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

    const dialog = screen.getByTestId("model-download-modal");
    fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
