// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MaterialComponentSpec, SpellComponents } from "../../../types/spell";
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
        onChange={() => { }}
      />,
    );
    expect(screen.getByTestId("component-checkboxes")).not.toBeNull();
  });

  it("M-005: root container uses light and dark surface classes", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => { }}
      />,
    );
    const root = screen.getByTestId("component-checkboxes");
    const tokens = new Set(root.className.split(/\s+/).filter(Boolean));
    expect(tokens.has("bg-white")).toBe(true);
    expect(tokens.has("dark:bg-neutral-800")).toBe(true);
    expect(tokens.has("border-neutral-300")).toBe(true);
  });

  it("H-002: checkbox controls use the named interactive border token", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => { }}
      />,
    );
    const verbal = screen.getByTestId("component-checkbox-verbal");
    const somatic = screen.getByTestId("component-checkbox-somatic");
    const material = screen.getByTestId("component-checkbox-material");
    expect(verbal.className.split(/\s+/)).toContain("border-neutral-400");
    expect(somatic.className.split(/\s+/)).toContain("border-neutral-400");
    expect(material.className.split(/\s+/)).toContain("border-neutral-400");
  });

  it("renders component-checkbox-verbal inside root", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => { }}
      />,
    );
    expect(screen.getByTestId("component-checkbox-verbal")).not.toBeNull();
  });

  it("renders component-checkbox-somatic inside root", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => { }}
      />,
    );
    expect(screen.getByTestId("component-checkbox-somatic")).not.toBeNull();
  });

  it("renders component-checkbox-material inside root", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => { }}
      />,
    );
    expect(screen.getByTestId("component-checkbox-material")).not.toBeNull();
  });

  it("does NOT render focus/divine-focus/experience checkboxes in vsm variant", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => { }}
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
        onChange={() => { }}
      />,
    );
    expect(screen.getByTestId("component-text-preview")).not.toBeNull();
  });

  it("component-text-preview renders as an output element", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => { }}
      />,
    );
    const preview = screen.getByTestId("component-text-preview");
    expect(preview.tagName).toBe("OUTPUT");
  });

  it("M-001: component-text-preview exposes a programmatic label", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => { }}
      />,
    );
    expect(screen.getByTestId("component-text-preview").getAttribute("aria-label")).toBe(
      "Computed component text",
    );
  });

  it("component-text-preview is a descendant of component-checkboxes", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => { }}
      />,
    );
    const root = screen.getByTestId("component-checkboxes");
    const preview = screen.getByTestId("component-text-preview");
    expect(root.contains(preview)).toBe(true);
  });

  it("M-005: component-text-preview uses light-mode preview surface classes", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => { }}
      />,
    );
    const preview = screen.getByTestId("component-text-preview");
    const tokens = new Set(preview.className.split(/\s+/).filter(Boolean));
    expect(tokens.has("bg-neutral-50")).toBe(true);
    expect(tokens.has("border-neutral-200")).toBe(true);
    expect(tokens.has("dark:bg-neutral-700")).toBe(true);
  });

  it("renders the checkbox strip in a dedicated grouped container", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => { }}
      />,
    );
    const root = screen.getByTestId("component-checkboxes");
    const strip = screen.getByTestId("component-checkbox-strip");
    expect(root.contains(strip)).toBe(true);
    expect(within(strip).getByTestId("component-checkbox-verbal")).toBeTruthy();
    expect(within(strip).getByTestId("component-checkbox-somatic")).toBeTruthy();
    expect(within(strip).getByTestId("component-checkbox-material")).toBeTruthy();
  });

  it("M-006: uses the structured primary row gap utility for the checkbox strip", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => { }}
      />,
    );
    const strip = screen.getByTestId("component-checkbox-strip");
    const tokens = new Set(strip.className.split(/\s+/).filter(Boolean));
    expect(tokens.has("gap-2")).toBe(true);
    expect(tokens.has("gap-4")).toBe(false);
  });

  it("text preview shows dash when no components selected", () => {
    render(
      <ComponentCheckboxes
        components={noMaterialComponents}
        materialComponents={[]}
        onChange={() => { }}
      />,
    );
    expect(screen.getByTestId("component-text-preview").textContent).toBe("—");
  });

  it("text preview lists selected component letters", () => {
    render(
      <ComponentCheckboxes
        components={{ ...noMaterialComponents, verbal: true, somatic: true }}
        materialComponents={[]}
        onChange={() => { }}
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
        onChange={() => { }}
        variant="all"
      />,
    );
    expect(screen.getByTestId("component-checkbox-focus")).not.toBeNull();
    expect(screen.getByTestId("component-checkbox-divine-focus")).not.toBeNull();
    expect(screen.getByTestId("component-checkbox-experience")).not.toBeNull();
  });

  it("M-005: all variant preview includes focus, divine focus, and experience abbreviations", () => {
    render(
      <ComponentCheckboxes
        components={{
          verbal: false,
          somatic: false,
          material: false,
          focus: true,
          divineFocus: true,
          experience: true,
        }}
        materialComponents={[]}
        onChange={() => { }}
        variant="all"
      />,
    );
    expect(screen.getByTestId("component-text-preview").textContent).toBe("F, DF, XP");
  });

  it("all variant preserves component-checkboxes root container", () => {
    render(
      <ComponentCheckboxes
        components={{
          verbal: true,
          somatic: true,
          material: false,
          focus: true,
          divineFocus: true,
          experience: false,
        }}
        materialComponents={[]}
        onChange={() => { }}
        variant="all"
      />,
    );
    expect(screen.getByTestId("component-checkboxes")).not.toBeNull();
  });

  it("all variant preserves component-text-preview", () => {
    render(
      <ComponentCheckboxes
        components={{
          verbal: true,
          somatic: false,
          material: false,
          focus: false,
          divineFocus: false,
          experience: false,
        }}
        materialComponents={[]}
        onChange={() => { }}
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
      <ComponentCheckboxes components={withMaterial} materialComponents={[]} onChange={() => { }} />,
    );
    expect(screen.getByTestId("material-component-add")).not.toBeNull();
  });

  it("material-component-add button is a descendant of component-checkboxes root", () => {
    render(
      <ComponentCheckboxes components={withMaterial} materialComponents={[]} onChange={() => { }} />,
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
        onChange={() => { }}
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
        onChange={() => { }}
      />,
    );
    expect(screen.getAllByTestId("material-component-row")).toHaveLength(2);
  });

  it("material-component-row renders directly inside material-subform", () => {
    render(
      <ComponentCheckboxes
        components={withMaterial}
        materialComponents={[
          { name: "Bat fur", quantity: 1, isConsumed: false },
          { name: "Sulphur", quantity: 1, isConsumed: true },
        ]}
        onChange={() => { }}
      />,
    );
    const subform = screen.getByTestId("material-subform");
    const rows = within(subform).getAllByTestId("material-component-row");
    expect(rows).toHaveLength(2);
  });

  it("material subform uses theme-aware surface classes (H-001 palette tokens)", () => {
    render(
      <ComponentCheckboxes components={withMaterial} materialComponents={[]} onChange={() => { }} />,
    );
    const subform = screen.getByTestId("material-subform");
    const tokens = new Set(subform.className.split(/\s+/).filter(Boolean));
    expect(tokens.has("bg-white")).toBe(true);
    expect(tokens.has("dark:bg-neutral-800")).toBe(true);
    expect(tokens.has("border-neutral-300")).toBe(true);
  });

  it("H-002: material inputs use the named interactive border token", () => {
    render(
      <ComponentCheckboxes
        components={withMaterial}
        materialComponents={[{ name: "Bat fur", quantity: 1, isConsumed: false }]}
        onChange={() => { }}
      />,
    );
    expect(screen.getByTestId("material-component-name").className.split(/\s+/)).toContain(
      "border-neutral-400",
    );
    expect(screen.getByTestId("material-component-quantity").className.split(/\s+/)).toContain(
      "border-neutral-400",
    );
    expect(screen.getByTestId("material-component-gp-value").className.split(/\s+/)).toContain(
      "border-neutral-400",
    );
  });

  it("material component rows use theme-aware row background class", () => {
    render(
      <ComponentCheckboxes
        components={withMaterial}
        materialComponents={[{ name: "Bat fur", quantity: 1, isConsumed: false }]}
        onChange={() => { }}
      />,
    );
    const row = screen.getAllByTestId("material-component-row")[0] as HTMLElement;
    const tokens = new Set(row.className.split(/\s+/).filter(Boolean));
    expect(tokens.has("dark:bg-neutral-800")).toBe(true);
    expect(tokens.has("bg-neutral-50")).toBe(true);
  });

  it("enabling Material reveals a visually nested material-subform container", () => {
    render(
      <ComponentCheckboxes
        components={{
          verbal: false,
          somatic: false,
          material: true,
          focus: false,
          divineFocus: false,
          experience: false,
        }}
        materialComponents={[]}
        onChange={() => { }}
      />,
    );
    expect(screen.queryByTestId("material-subform")).not.toBeNull();
  });

  it("component-text-preview remains present when material rows are rendered", () => {
    render(
      <ComponentCheckboxes
        components={{
          verbal: true,
          somatic: false,
          material: true,
          focus: false,
          divineFocus: false,
          experience: false,
        }}
        materialComponents={[{ name: "Eye of newt", quantity: 1, isConsumed: false }]}
        onChange={() => { }}
      />,
    );
    expect(screen.getByTestId("component-text-preview")).not.toBeNull();
  });

  it("material-component-row renders inside root container when material enabled with rows", () => {
    render(
      <ComponentCheckboxes
        components={{
          verbal: true,
          somatic: false,
          material: true,
          focus: false,
          divineFocus: false,
          experience: false,
        }}
        materialComponents={[{ name: "Eye of newt", quantity: 1, isConsumed: false }]}
        onChange={() => { }}
      />,
    );
    expect(screen.getAllByTestId("material-component-row")).toHaveLength(1);
  });

  it("preserves the material row DOM node when editable values change", () => {
    const { rerender } = render(
      <ComponentCheckboxes
        components={withMaterial}
        materialComponents={[{ name: "Bat fur", quantity: 1, isConsumed: false }]}
        onChange={() => { }}
      />,
    );

    const initialRow = screen.getByTestId("material-component-row");

    rerender(
      <ComponentCheckboxes
        components={withMaterial}
        materialComponents={[{ name: "Bat guano", quantity: 1, isConsumed: false }]}
        onChange={() => { }}
      />,
    );

    expect(screen.getByTestId("material-component-row")).toBe(initialRow);
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
    expect(onChange).toHaveBeenCalledTimes(1);
    const [resultComp, resultMaterials] = onChange.mock.calls[0] as unknown as [
      SpellComponents,
      MaterialComponentSpec[],
    ];
    expect(resultComp.material).toBe(false);
    expect(resultMaterials).toHaveLength(0);
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
