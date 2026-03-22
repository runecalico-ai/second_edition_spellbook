// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModalShell } from "./Modal";

let showModalMock: ReturnType<typeof vi.fn>;
let closeMock: ReturnType<typeof vi.fn>;
let originalShowModal: HTMLDialogElement["showModal"] | undefined;
let originalClose: HTMLDialogElement["close"] | undefined;

beforeEach(() => {
  originalShowModal = HTMLDialogElement.prototype.showModal;
  originalClose = HTMLDialogElement.prototype.close;
  showModalMock = vi.fn(function mockShowModal(this: HTMLDialogElement) {
    Object.defineProperty(this, "open", {
      configurable: true,
      value: true,
    });
  });
  closeMock = vi.fn(function mockClose(this: HTMLDialogElement) {
    Object.defineProperty(this, "open", {
      configurable: true,
      value: false,
    });
  });
  HTMLDialogElement.prototype.showModal = showModalMock;
  HTMLDialogElement.prototype.close = closeMock;
});

afterEach(() => {
  cleanup();
  if (originalShowModal) {
    HTMLDialogElement.prototype.showModal = originalShowModal;
  } else {
    delete HTMLDialogElement.prototype.showModal;
  }
  if (originalClose) {
    HTMLDialogElement.prototype.close = originalClose;
  } else {
    delete HTMLDialogElement.prototype.close;
  }
  vi.restoreAllMocks();
});

describe("Modal", () => {
  it("renders stable test ids for shared modal controls when open", () => {
    render(
      <ModalShell
        isOpen={true}
        type="warning"
        title="Vault Integrity Check"
        message={["Problem found"]}
        dismissible={true}
        buttons={[
          { label: "Dismiss", variant: "secondary", testId: "modal-button-dismiss" },
          {
            label: "Open Vault Maintenance",
            variant: "primary",
            testId: "modal-button-open-vault-maintenance",
          },
        ]}
        onRequestClose={() => {}}
      />,
    );

    expect(screen.getByTestId("modal-dialog")).toBeTruthy();
    expect(screen.getByTestId("modal-content")).toBeTruthy();
    expect(screen.getByTestId("modal-button-dismiss")).toBeTruthy();
    expect(screen.getByTestId("modal-button-open-vault-maintenance")).toBeTruthy();
  });

  it("calls showModal when isOpen becomes true", async () => {
    render(
      <ModalShell
        isOpen={true}
        type="info"
        title="Test"
        message="hello"
        buttons={[]}
        onRequestClose={() => {}}
      />,
    );

    await waitFor(() => expect(showModalMock).toHaveBeenCalledTimes(1));
  });

  it("calls onRequestClose when Escape cancel event fires and dismissible=true", () => {
    const onRequestClose = vi.fn();

    render(
      <ModalShell
        isOpen={true}
        type="info"
        title="Test"
        message="hello"
        buttons={[]}
        dismissible={true}
        onRequestClose={onRequestClose}
      />,
    );

    fireEvent(
      screen.getByTestId("modal-dialog"),
      new Event("cancel", { bubbles: false, cancelable: true }),
    );

    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onRequestClose when Escape fires and dismissible=false", () => {
    const onRequestClose = vi.fn();

    render(
      <ModalShell
        isOpen={true}
        type="info"
        title="Test"
        message="hello"
        buttons={[]}
        dismissible={false}
        onRequestClose={onRequestClose}
      />,
    );

    fireEvent(
      screen.getByTestId("modal-dialog"),
      new Event("cancel", { bubbles: false, cancelable: true }),
    );

    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it("calls onRequestClose when the dialog root is clicked and dismissible=true", () => {
    const onRequestClose = vi.fn();

    render(
      <ModalShell
        isOpen={true}
        type="info"
        title="Test"
        message="hello"
        buttons={[]}
        dismissible={true}
        onRequestClose={onRequestClose}
      />,
    );

    fireEvent.click(screen.getByTestId("modal-dialog"));

    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onRequestClose when clicking inside modal content", () => {
    const onRequestClose = vi.fn();

    render(
      <ModalShell
        isOpen={true}
        type="info"
        title="Test"
        message="hello"
        buttons={[{ label: "OK", variant: "primary", testId: "modal-button-ok" }]}
        dismissible={true}
        onRequestClose={onRequestClose}
      />,
    );

    fireEvent.click(screen.getByTestId("modal-content"));

    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it("dialog element remains in the DOM when isOpen is false", () => {
    const { getByTestId } = render(
      <ModalShell
        isOpen={false}
        type="info"
        title="Test"
        message="hello"
        buttons={[]}
        onRequestClose={() => {}}
      />,
    );

    const dialog = getByTestId("modal-dialog") as HTMLDialogElement;
    expect(dialog).toBeTruthy();
    expect(dialog.open).toBe(false);
  });

  it("does not move focus on an initial closed render", () => {
    const sentinel = document.createElement("button");
    sentinel.type = "button";
    document.body.append(sentinel);
    sentinel.focus();

    render(
      <ModalShell
        isOpen={false}
        type="info"
        title="Test"
        message="hello"
        buttons={[]}
        onRequestClose={() => {}}
      />,
    );

    expect(document.activeElement).toBe(sentinel);
    expect(closeMock).not.toHaveBeenCalled();
    sentinel.remove();
  });

  it("calls close and restores focus to the opener when the modal closes", async () => {
    const opener = document.createElement("button");
    opener.type = "button";
    document.body.append(opener);
    opener.focus();

    const { rerender } = render(
      <ModalShell
        isOpen={true}
        type="info"
        title="Test"
        message="hello"
        buttons={[]}
        onRequestClose={() => {}}
      />,
    );

    await waitFor(() => expect(showModalMock).toHaveBeenCalledTimes(1));

    rerender(
      <ModalShell
        isOpen={false}
        type="info"
        title="Test"
        message="hello"
        buttons={[]}
        onRequestClose={() => {}}
      />,
    );

    await waitFor(() => expect(closeMock).toHaveBeenCalledTimes(1));
    expect(document.activeElement).toBe(opener);

    opener.remove();
  });

  it("falls back to the document body when the opener is removed before close", async () => {
    const opener = document.createElement("button");
    opener.type = "button";
    document.body.append(opener);
    opener.focus();

    const { rerender } = render(
      <ModalShell
        isOpen={true}
        type="info"
        title="Test"
        message="hello"
        buttons={[]}
        onRequestClose={() => {}}
      />,
    );

    await waitFor(() => expect(showModalMock).toHaveBeenCalledTimes(1));
    opener.remove();

    rerender(
      <ModalShell
        isOpen={false}
        type="info"
        title="Test"
        message="hello"
        buttons={[]}
        onRequestClose={() => {}}
      />,
    );

    await waitFor(() => expect(closeMock).toHaveBeenCalledTimes(1));
    expect(document.activeElement).toBe(document.body);
  });
});
