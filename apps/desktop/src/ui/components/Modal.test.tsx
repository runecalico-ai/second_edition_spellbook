import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ModalShell } from "./Modal";

describe("Modal", () => {
  it("renders stable test ids for shared modal controls", () => {
    const html = renderToStaticMarkup(
      <ModalShell
        isOpen={true}
        type="warning"
        title="Vault Integrity Check"
        message={["Problem found"]}
        dismissible={true}
        buttons={[
          { label: "Dismiss", variant: "secondary" },
          { label: "Open Vault Maintenance", variant: "primary" },
        ]}
        onRequestClose={() => {}}
      />,
    );

    expect(html).toContain('data-testid="modal-dialog"');
    expect(html).toContain('data-testid="modal-backdrop"');
    expect(html).toContain('data-testid="modal-button-dismiss"');
    expect(html).toContain('data-testid="modal-button-open-vault-maintenance"');
  });
});
