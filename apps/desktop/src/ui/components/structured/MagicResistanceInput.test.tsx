// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MagicResistanceSpec } from "../../../types/spell";
import { MagicResistanceInput } from "./MagicResistanceInput";

afterEach(() => {
  cleanup();
});

function expectClasses(node: HTMLElement, classes: string[]) {
  const tokens = new Set(node.className.split(/\s+/).filter(Boolean));
  for (const className of classes) {
    expect(tokens.has(className)).toBe(true);
  }
}

const ROOT_SURFACE_CLASSES = [
  "rounded-xl",
  "border",
  "border-neutral-300",
  "bg-white",
  "text-neutral-900",
  "shadow-sm",
  "dark:border-neutral-700",
  "dark:bg-neutral-800",
  "dark:text-neutral-100",
];

const INPUT_SURFACE_CLASSES = [
  "bg-white",
  "border",
  "border-neutral-400",
  "text-neutral-900",
  "dark:bg-neutral-900",
  "dark:border-neutral-700",
  "dark:text-neutral-100",
];

const NESTED_SURFACE_CLASSES = [
  "rounded-lg",
  "border",
  "border-neutral-200",
  "bg-neutral-50/70",
  "dark:border-neutral-800",
  "dark:bg-neutral-700",
];

const MUTED_TEXT_CLASSES = ["text-neutral-600", "dark:text-neutral-400"];

const ANNOTATION_CLASSES = [
  "bg-amber-50",
  "border",
  "border-amber-300",
  "text-amber-700",
  "dark:bg-amber-900/10",
  "dark:border-amber-900/30",
  "dark:text-amber-400",
];

const HELPER_TEXT_CLASSES = ["text-amber-700", "dark:text-amber-400"];

describe("MagicResistanceInput", () => {
  it("renders the root controls, notes field, and source text annotation", () => {
    render(
      <MagicResistanceInput
        value={{
          kind: "normal",
          appliesTo: "whole_spell",
          notes: "MR applies normally",
          sourceText: "Magic resistance applies",
        }}
        onChange={() => {}}
      />,
    );

    const root = screen.getByTestId("magic-resistance-input");
    const kind = screen.getByTestId("magic-resistance-kind");
    const appliesTo = screen.getByTestId("magic-resistance-applies-to");
    const notes = screen.getByTestId("magic-resistance-notes");
    const annotation = screen.getByTestId("magic-resistance-source-text-annotation");
    const legend = root.querySelector("legend");

    expect(root.tagName).toBe("FIELDSET");
    expect(legend).not.toBeNull();
    expect(legend?.className.split(/\s+/)).toContain("sr-only");
    expect(legend?.textContent).toBe("Magic Resistance");
    expect(root.contains(kind)).toBe(true);
    expect(root.contains(appliesTo)).toBe(true);
    expect(root.contains(notes)).toBe(true);
    expect(root.contains(annotation)).toBe(true);
    expect(annotation.textContent).toContain("Original source text:");
    expect(annotation.textContent).toContain("Magic resistance applies");
    expectClasses(root, ROOT_SURFACE_CLASSES);
    expectClasses(kind, INPUT_SURFACE_CLASSES);
    expectClasses(appliesTo, INPUT_SURFACE_CLASSES);
    expectClasses(notes, ["w-full", ...INPUT_SURFACE_CLASSES]);
    expectClasses(annotation, ANNOTATION_CLASSES);
  });

  it("renders the partial by-part-id controls and helper text when damage is not modeled", () => {
    const value: MagicResistanceSpec = {
      kind: "partial",
      appliesTo: "whole_spell",
      partial: {
        scope: "by_part_id",
        partIds: ["part_fire"],
      },
      notes: "Partial MR",
    };

    render(<MagicResistanceInput value={value} onChange={() => {}} damageKind="none" />);

    const partIds = screen.getByTestId("magic-resistance-part-ids") as HTMLInputElement;
    const partialScope = screen.getByTestId("magic-resistance-partial-scope");
    const helperText = screen.getByText(
      "No modeled damage parts available — set Damage to Modeled first",
    );
    const scopeLabel = screen.getByText("Scope:");
    const partIdsLabel = screen.getByText("Part IDs:");

    expect(partialScope).not.toBeNull();
    expect(partIds.disabled).toBe(true);
    expectClasses(partialScope.closest("div")?.parentElement as HTMLElement, NESTED_SURFACE_CLASSES);
    expectClasses(partialScope, INPUT_SURFACE_CLASSES);
    expectClasses(partIds, ["w-full", ...INPUT_SURFACE_CLASSES]);
    expectClasses(scopeLabel, MUTED_TEXT_CLASSES);
    expectClasses(partIdsLabel, MUTED_TEXT_CLASSES);
    expectClasses(helperText, HELPER_TEXT_CLASSES);
  });

  it("changing the kind to partial seeds the partial payload and preserves annotations", () => {
    const onChange = vi.fn();

    render(
      <MagicResistanceInput
        value={{
          kind: "unknown",
          notes: "Carry forward",
          sourceText: "Legacy MR text",
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId("magic-resistance-kind"), {
      target: { value: "partial" },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      kind: "partial",
      appliesTo: "whole_spell",
      notes: "Carry forward",
      sourceText: "Legacy MR text",
      partial: { scope: "damage_only" },
      specialRule: undefined,
    });
  });

  it("splits and trims part ids before emitting onChange", () => {
    const onChange = vi.fn();

    render(
      <MagicResistanceInput
        value={{
          kind: "partial",
          appliesTo: "whole_spell",
          partial: { scope: "by_part_id" },
        }}
        onChange={onChange}
        damageKind="modeled"
      />,
    );

    fireEvent.change(screen.getByTestId("magic-resistance-part-ids"), {
      target: { value: "part_fire, part_ice , , part_arcane" },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      kind: "partial",
      partial: {
        scope: "by_part_id",
        partIds: ["part_fire", "part_ice", "part_arcane"],
      },
    });
  });
});