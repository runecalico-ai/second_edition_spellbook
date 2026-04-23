// @vitest-environment jsdom
// C-002 regression coverage: structured contract checks for layout, theme tokens, and onChange plumbing.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SpellDamageSpec } from "../../../types/spell";
import { DamageForm } from "./DamageForm";

afterEach(() => {
  cleanup();
});

function expectClasses(node: HTMLElement, classes: string[]) {
  const tokens = new Set(node.className.split(/\s+/).filter(Boolean));
  for (const className of classes) {
    expect(tokens.has(className)).toBe(true);
  }
}

const FOCUS_RING_CLASSES = [
  "focus-visible:ring-2",
  "focus-visible:ring-blue-500",
  "focus-visible:ring-offset-1",
  "dark:focus-visible:ring-offset-neutral-900",
];

function expectFocusRing(node: Element) {
  expectClasses(node as HTMLElement, FOCUS_RING_CLASSES);
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

const DEEP_NESTED_SURFACE_CLASSES = [
  "rounded",
  "border",
  "border-neutral-200",
  "bg-neutral-50",
  "dark:border-neutral-800/50",
  "dark:bg-neutral-800/40",
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

describe("DamageForm", () => {
  it("C-001/M-003: renders dual-theme root, grouped semantics, notes field, and source text annotation", () => {
    render(
      <DamageForm
        value={{
          kind: "dm_adjudicated",
          dmGuidance: "DM decides based on terrain.",
          notes: "Overall damage notes",
          sourceText: "1d6 per level, maximum 10d6",
        }}
        onChange={() => {}}
      />,
    );

    const root = screen.getByTestId("damage-form");
    const kind = screen.getByTestId("damage-form-kind");
    const guidance = screen.getByTestId("damage-form-dm-guidance");
    const notes = screen.getByTestId("damage-form-notes");
    const annotation = screen.getByTestId("damage-source-text-annotation");
    const legend = root.querySelector("legend");

    expect(root.tagName).toBe("FIELDSET");
    expect(legend).not.toBeNull();
    expect(legend?.className.split(/\s+/)).toContain("sr-only");
    expect(legend?.textContent).toBe("Damage");
    expect(root.contains(kind)).toBe(true);
    expect(root.contains(guidance)).toBe(true);
    expect(root.contains(notes)).toBe(true);
    expect(root.contains(annotation)).toBe(true);
    expect(annotation.textContent).toContain("Original source text:");
    expect(annotation.textContent).toContain("1d6 per level, maximum 10d6");
    expectClasses(root, ROOT_SURFACE_CLASSES);
    expectClasses(kind, INPUT_SURFACE_CLASSES);
    expectClasses(guidance, ["w-full", ...INPUT_SURFACE_CLASSES]);
    expectClasses(notes, ["w-full", ...INPUT_SURFACE_CLASSES]);
    expectClasses(annotation, ANNOTATION_CLASSES);
    expectFocusRing(kind);
    expectFocusRing(guidance);
    expectFocusRing(notes);
  });

  it("renders modeled damage parts inside the grouped damage editor surface", () => {
    const value: SpellDamageSpec = {
      kind: "modeled",
      combineMode: "sum",
      notes: "Area damage",
      parts: [
        {
          id: "part_fire",
          damageType: "fire",
          base: { terms: [{ count: 1, sides: 6 }], flatModifier: 0 },
          application: { scope: "per_target", ticks: 1, tickDriver: "round" },
          save: { kind: "half" },
          mrInteraction: "normal",
          notes: "Burning damage",
        },
      ],
    };

    render(<DamageForm value={value} onChange={() => {}} />);

    expect(screen.getByTestId("damage-form-combine-mode")).not.toBeNull();
    expect(screen.getByTestId("damage-form-add-part")).not.toBeNull();
    const part = screen.getByTestId("damage-form-part");
    const partType = within(part).getByTestId("damage-form-part-type");
    const formula = within(part).getByTestId("damage-form-part-formula");
    const perDie = within(part).getByTestId("damage-form-part-per-die-modifier");
    const applicationScope = within(part).getByTestId("damage-form-part-application-scope");
    const saveKind = within(part).getByTestId("damage-form-part-save-kind");
    const clampMin = within(part).getByTestId("damage-form-part-clamp-min");
    const clampMax = within(part).getByTestId("damage-form-part-clamp-max");
    const addScaling = within(part).getByTestId("damage-form-part-add-scaling");
    const notes = within(part).getByTestId("damage-form-part-notes");
    const perDieLabel = within(part).getByText("Per Die:");
    const applicationLabel = within(part).getByText("Application:");
    const saveLabel = within(part).getByText("Save:");
    const clampLabel = within(part).getByText("Clamp:");
    const scalingLabel = within(part).getByText("Scaling Rules");
    const subPanels = Array.from(part.querySelectorAll("div")).filter((node) =>
      node.className.includes("bg-neutral-50"),
    );

    expectClasses(part, NESTED_SURFACE_CLASSES);
    expectClasses(partType, INPUT_SURFACE_CLASSES);
    expectClasses(formula, ["w-20", "font-mono", ...INPUT_SURFACE_CLASSES]);
    expectClasses(perDie, ["w-12", "font-mono", ...INPUT_SURFACE_CLASSES]);
    expectClasses(applicationScope, ["flex-1", ...INPUT_SURFACE_CLASSES]);
    expectClasses(saveKind, ["flex-1", ...INPUT_SURFACE_CLASSES]);
    expectClasses(clampMin, ["w-16", ...INPUT_SURFACE_CLASSES]);
    expectClasses(clampMax, ["w-16", ...INPUT_SURFACE_CLASSES]);
    expectClasses(notes, ["w-full", ...INPUT_SURFACE_CLASSES]);
    expectClasses(perDieLabel, MUTED_TEXT_CLASSES);
    expectClasses(applicationLabel, MUTED_TEXT_CLASSES);
    expectClasses(saveLabel, MUTED_TEXT_CLASSES);
    expectClasses(clampLabel, MUTED_TEXT_CLASSES);
    expectClasses(scalingLabel, MUTED_TEXT_CLASSES);
    expect(addScaling).not.toBeNull();
    expect(subPanels.length >= 2).toBe(true);
    for (const panel of subPanels.slice(0, 2)) {
      expectClasses(panel as HTMLElement, DEEP_NESTED_SURFACE_CLASSES);
    }
    const interactiveElements = part.querySelectorAll("select, input, textarea, button");
    expect(interactiveElements.length).toBeGreaterThan(0);
    for (const element of interactiveElements) {
      expectFocusRing(element);
    }
    expectFocusRing(screen.getByTestId("damage-form-combine-mode"));
    expectFocusRing(screen.getByTestId("damage-form-add-part"));
  });

  it("changing the damage kind to modeled seeds a default part and preserves top-level text fields", () => {
    const onChange = vi.fn();

    render(
      <DamageForm
        value={{
          kind: "none",
          notes: "Carry forward",
          sourceText: "Legacy fireball text",
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId("damage-form-kind"), { target: { value: "modeled" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      kind: "modeled",
      combineMode: "sum",
      notes: "Carry forward",
      sourceText: "Legacy fireball text",
    });
    expect(onChange.mock.calls[0]?.[0].parts).toHaveLength(1);
    expect(onChange.mock.calls[0]?.[0].parts?.[0]).toMatchObject({
      damageType: "fire",
      application: { scope: "per_target" },
      save: { kind: "none" },
    });
  });

  it("parses dice formulas before emitting modeled part updates", () => {
    const onChange = vi.fn();

    render(
      <DamageForm
        value={{
          kind: "modeled",
          combineMode: "sum",
          parts: [
            {
              id: "part_fire",
              damageType: "fire",
              base: { terms: [{ count: 1, sides: 6 }], flatModifier: 0 },
              application: { scope: "per_target" },
              save: { kind: "none" },
            },
          ],
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId("damage-form-part-formula"), {
      target: { value: "2d6+3" },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      kind: "modeled",
      parts: [
        expect.objectContaining({
          id: "part_fire",
          base: {
            terms: [{ count: 2, sides: 6 }],
            flatModifier: 3,
          },
        }),
      ],
    });
  });

  it("links modeled damage field errors to the matching control with aria attributes", () => {
    render(
      <DamageForm
        value={{
          kind: "modeled",
          combineMode: "sum",
          parts: [
            {
              id: "part_fire",
              damageType: "fire",
              base: { terms: [{ count: 1, sides: 6 }], flatModifier: 0 },
              application: { scope: "per_target" },
              save: { kind: "none" },
            },
          ],
        }}
        visibleFieldErrors={[
          {
            focusTarget: "damage-form-part-0-formula",
            testId: "error-damage-form-part-0-formula",
            message: "Damage formula must be valid",
          },
        ]}
        onChange={() => {}}
      />,
    );

    const formula = screen.getByTestId("damage-form-part-formula");
    const error = screen.getByTestId("error-damage-form-part-0-formula");

    expect(formula.getAttribute("id")).toBe("damage-form-part-0-formula");
    expect(formula.getAttribute("aria-invalid")).toBe("true");
    expect(formula.getAttribute("aria-describedby")).toBe("error-damage-form-part-0-formula");
    expect(error.textContent).toBe("Damage formula must be valid");
  });
});
