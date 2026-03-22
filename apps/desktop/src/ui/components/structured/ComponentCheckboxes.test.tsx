// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ComponentCheckboxes } from "./ComponentCheckboxes";

afterEach(() => {
  cleanup();
});

const noMaterialComponents = {
  verbal: false,
  somatic: false,
  material: false,
  focus: false,
  divineFocus: false,
  experience: false,
};

const withMaterial = {
  verbal: false,
  somatic: false,
  material: true,
  focus: false,
  divineFocus: false,
  experience: false,
};

// ---------------------------------------------------------------------------
// VSM variant (default)
// ---------------------------------------------------------------------------
describe("ComponentCheckboxes – vsm variant", () => {
  it("renders component-checkboxes root container", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("component-checkboxes")).not.toBeNull();
  });

  it("renders component-checkbox-verbal inside root", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("component-checkbox-verbal")).not.toBeNull();
  });

  it("renders component-checkbox-somatic inside root", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("component-checkbox-somatic")).not.toBeNull();
  });

  it("renders component-checkbox-material inside root", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("component-checkbox-material")).not.toBeNull();
  });

  it("does NOT render focus/divine-focus/experience checkboxes in vsm variant", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByTestId("component-checkbox-focus")).toBeNull();
    expect(screen.queryByTestId("component-checkbox-divine-focus")).toBeNull();
    expect(screen.queryByTestId("component-checkbox-experience")).toBeNull();
  });

  it("renders component-text-preview inside root container", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("component-text-preview")).not.toBeNull();
  });

  it("component-text-preview is a descendant of component-checkboxes", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => {}}
      />,
    );
    const root = screen.getByTestId("component-checkboxes");
    const preview = screen.getByTestId("component-text-preview");
    expect(root.contains(preview)).toBe(true);
  });

  it("text preview shows dash when no components selected", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("component-text-preview").textContent).toBe("—");
  });

  it("text preview lists selected component letters", () => {
    render(
      <ComponentCheckboxes
        components={{ ...noMaterialComponents, verbal: true, somatic: true }}
        materialComponents={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("component-text-preview").textContent).toBe("V, S");
  });
});

// ---------------------------------------------------------------------------
// All variant
// ---------------------------------------------------------------------------
describe("ComponentCheckboxes – all variant", () => {
  it("renders focus/divine-focus/experience checkboxes in all variant", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => {}}
        variant="all"
      />,
    );
    expect(screen.getByTestId("component-checkbox-focus")).not.toBeNull();
    expect(screen.getByTestId("component-checkbox-divine-focus")).not.toBeNull();
    expect(screen.getByTestId("component-checkbox-experience")).not.toBeNull();
  });

  it("all variant preserves component-checkboxes root container", () => {
    render(
      <ComponentCheckboxes
        components={{ verbal: true, somatic: true, material: false, focus: true, divineFocus: true, experience: false }}
        materialComponents={[]}
        onChange={() => {}}
        variant="all"
      />,
    );
    expect(screen.getByTestId("component-checkboxes")).not.toBeNull();
  });

  it("all variant preserves component-text-preview", () => {
    render(
      <ComponentCheckboxes
        components={{ verbal: true, somatic: false, material: false, focus: false, divineFocus: false, experience: false }}
        materialComponents={[]}
        onChange={() => {}}
        variant="all"
      />,
    );
    expect(screen.getByTestId("component-text-preview")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Material subform
// ---------------------------------------------------------------------------
describe("ComponentCheckboxes – material subform", () => {
  it("material-component-add button is present when material=true", () => {
    render(
      <ComponentCheckboxes
        components={withMaterial}
        materialComponents={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("material-component-add")).not.toBeNull();
  });

  it("material-component-add button is a descendant of component-checkboxes root", () => {
    render(
      <ComponentCheckboxes
        components={withMaterial}
        materialComponents={[]}
        onChange={() => {}}
      />,
    );
    const root = screen.getByTestId("component-checkboxes");
    const addBtn = screen.getByTestId("material-component-add");
    expect(root.contains(addBtn)).toBe(true);
  });

  it("material-component-add button is NOT present when material=false", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByTestId("material-component-add")).toBeNull();
  });

  it("material-component-row appears for each material entry", () => {
    render(
      <ComponentCheckboxes
        components={withMaterial}
        materialComponents={[
          { name: "Bat fur", quantity: 1, isConsumed: false },
          { name: "Sulphur", quantity: 1, isConsumed: true },
        ]}
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByTestId("material-component-row")).toHaveLength(2);
  });

  // MUST FAIL: material subform should use theme-aware dark: prefixed surface classes,
  // but currently uses bare dark-only classes (bg-neutral-900/50, border-neutral-800)
  it("material subform uses theme-aware surface classes not dark-only", () => {
    const html = renderToStaticMarkup(
      <ComponentCheckboxes
        components={withMaterial}
        materialComponents={[]}
        onChange={() => {}}
      />,
    );
    // Currently the material container has class "space-y-2 p-2 bg-neutral-900/50 rounded border border-neutral-800"
    // It does NOT have dark: prefixed surface classes. Task 3 will fix this.
    // Assert the NEW expected class is present — this FAILS now:
    expect(html).toContain("dark:bg-neutral-900"); // FAILS: currently bg-neutral-900/50 not dark:bg-neutral-900
  });

  // MUST FAIL: material row items also use bare dark-only bg (no dark: prefix)
  it("material component rows use theme-aware row background class", () => {
    const html = renderToStaticMarkup(
      <ComponentCheckboxes
        components={withMaterial}
        materialComponents={[{ name: "Bat fur", quantity: 1, isConsumed: false }]}
        onChange={() => {}}
      />,
    );
    // Currently row div has "grid gap-2 p-2 bg-neutral-900 rounded text-sm" — no dark: prefix
    // Assert the NEW expected class is present — this FAILS now:
    expect(html).toContain("dark:bg-neutral-800"); // FAILS: currently plain bg-neutral-900
  });

  // MUST FAIL: data-testid="material-subform" does not exist on the container yet
  it("enabling Material reveals a visually nested material-subform container", () => {
    render(
      <ComponentCheckboxes
        components={{ verbal: false, somatic: false, material: true, focus: false, divineFocus: false, experience: false }}
        materialComponents={[]}
        onChange={() => {}}
      />,
    );
    // This MUST FAIL: data-testid="material-subform" does not exist on the container yet
    expect(screen.queryByTestId("material-subform")).not.toBeNull();
  });

  it("component-text-preview remains present when material rows are rendered", () => {
    render(
      <ComponentCheckboxes
        components={{ verbal: true, somatic: false, material: true, focus: false, divineFocus: false, experience: false }}
        materialComponents={[{ name: "Eye of newt", quantity: 1, isConsumed: false }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("component-text-preview")).not.toBeNull();
  });

  it("material-component-row renders inside root container when material enabled with rows", () => {
    render(
      <ComponentCheckboxes
        components={{ verbal: true, somatic: false, material: true, focus: false, divineFocus: false, experience: false }}
        materialComponents={[{ name: "Eye of newt", quantity: 1, isConsumed: false }]}
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByTestId("material-component-row")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Interaction: onChange callback invocation
// ---------------------------------------------------------------------------
describe("ComponentCheckboxes – onChange callbacks", () => {
  it("fires onChange when verbal checkbox is changed", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={onChange}
      />,
    );
    const verbCheckbox = getByTestId("component-checkbox-verbal") as HTMLInputElement;
    fireEvent.click(verbCheckbox);
    expect(onChange).toHaveBeenCalledTimes(1);
    const [calledComponents] = onChange.mock.calls[0];
    expect(calledComponents.verbal).toBe(true);
  });

  it("fires onChange when somatic checkbox is changed", () => {
    const onChange = vi.fn();
    const { getByTestId } = render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={onChange}
      />,
    );
    const somCheckbox = getByTestId("component-checkbox-somatic") as HTMLInputElement;
    fireEvent.click(somCheckbox);
    expect(onChange).toHaveBeenCalledTimes(1);
    const [calledComponents] = onChange.mock.calls[0];
    expect(calledComponents.somatic).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Interaction: destructive confirmation path
// ---------------------------------------------------------------------------
describe("ComponentCheckboxes – destructive confirmation", () => {
  it("calls onUncheckMaterialConfirm when unchecking material with rows present", async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const onChange = vi.fn();
    const { getByTestId } = render(
      <ComponentCheckboxes
        components={withMaterial}
        materialComponents={[{ name: "Bat fur", quantity: 1, isConsumed: false }]}
        onChange={onChange}
        onUncheckMaterialConfirm={confirm}
      />,
    );
    const matCheckbox = getByTestId("component-checkbox-material") as HTMLInputElement;
    fireEvent.click(matCheckbox);
    await Promise.resolve();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalled();
  });

  it("does NOT call onChange when confirm returns false", async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const onChange = vi.fn();
    const { getByTestId } = render(
      <ComponentCheckboxes
        components={withMaterial}
        materialComponents={[{ name: "Bat fur", quantity: 1, isConsumed: false }]}
        onChange={onChange}
        onUncheckMaterialConfirm={confirm}
      />,
    );
    const matCheckbox = getByTestId("component-checkbox-material") as HTMLInputElement;
    fireEvent.click(matCheckbox);
    await Promise.resolve();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});
