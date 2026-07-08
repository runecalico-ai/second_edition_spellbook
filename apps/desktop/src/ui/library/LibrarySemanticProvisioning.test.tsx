// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LibrarySemanticProvisioning } from "./LibrarySemanticProvisioning";

afterEach(() => {
  cleanup();
});

describe("LibrarySemanticProvisioning", () => {
  it("renders provisioning actions when notProvisioned", () => {
    render(
      <LibrarySemanticProvisioning
        availability="notProvisioned"
        errorMessage={null}
        onDownload={vi.fn()}
        onImport={vi.fn()}
        onSwitchToKeyword={vi.fn()}
      />,
    );

    expect(screen.getByTestId("library-semantic-provisioning-state")).toBeTruthy();
    expect(screen.getByTestId("library-embeddings-download-button")).toBeTruthy();
    expect(screen.getByTestId("library-embeddings-import-button")).toBeTruthy();
  });

  it("renders initializing copy without search-reset wording", () => {
    render(
      <LibrarySemanticProvisioning
        availability="initializing"
        errorMessage={null}
        onDownload={vi.fn()}
        onImport={vi.fn()}
        onSwitchToKeyword={vi.fn()}
      />,
    );

    expect(screen.getByTestId("library-semantic-initializing-state")).toBeTruthy();
    expect(screen.queryByTestId("empty-search-reset-button")).toBeNull();
  });

  it("renders error state with message and provisioning actions", () => {
    render(
      <LibrarySemanticProvisioning
        availability="error"
        errorMessage="ONNX runtime failed"
        onDownload={vi.fn()}
        onImport={vi.fn()}
        onSwitchToKeyword={vi.fn()}
      />,
    );

    expect(screen.getByTestId("library-semantic-error-state")).toBeTruthy();
    expect(screen.getByTestId("library-semantic-error-state-live-region").textContent).toMatch(
      /ONNX runtime failed/,
    );
    expect(screen.getByTestId("library-embeddings-download-button")).toBeTruthy();
    expect(screen.getByTestId("library-embeddings-import-button")).toBeTruthy();
    expect(screen.getByTestId("library-semantic-switch-keyword-button")).toBeTruthy();
  });

  it("renders downloading state with loading hint and no provisioning actions", () => {
    render(
      <LibrarySemanticProvisioning
        availability="downloading"
        errorMessage={null}
        onDownload={vi.fn()}
        onImport={vi.fn()}
        onSwitchToKeyword={vi.fn()}
      />,
    );

    expect(screen.getByTestId("library-semantic-downloading-state")).toBeTruthy();
    expect(screen.getByTestId("library-semantic-loading-hint").textContent).toMatch(
      /Download in progress/,
    );
    expect(screen.queryByTestId("library-embeddings-download-button")).toBeNull();
    expect(screen.queryByTestId("library-embeddings-import-button")).toBeNull();
  });
});
