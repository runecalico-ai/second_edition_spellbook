// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavingThrowSpec } from "../../../types/spell";
import { SavingThrowInput } from "./SavingThrowInput";

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

describe("SavingThrowInput", () => {
  it("renders the root controls and raw legacy annotation", () => {
    render(
      <SavingThrowInput
        value={{
          kind: "none",
          notes: "Keep this note",
          rawLegacyValue: "Save vs. spell for half",
        }}
        onChange={() => {}}
      />,
    );

    const root = screen.getByTestId("saving-throw-input");
    const kind = screen.getByTestId("saving-throw-kind");
    const notes = screen.getByTestId("saving-throw-notes");
    const annotation = screen.getByTestId("saving-throw-raw-legacy-annotation");
    const legend = root.querySelector("legend");

    expect(root.tagName).toBe("FIELDSET");
    expect(legend).not.toBeNull();
    expect(legend?.className.split(/\s+/)).toContain("sr-only");
    expect(legend?.textContent).toBe("Saving Throw");
    expect(root.contains(kind)).toBe(true);
    expect(root.contains(notes)).toBe(true);
    expect(root.contains(annotation)).toBe(true);
    expect(annotation.textContent).toContain("Original source text:");
    expect(annotation.textContent).toContain("Save vs. spell for half");
    expectClasses(root, ROOT_SURFACE_CLASSES);
    expectClasses(kind, INPUT_SURFACE_CLASSES);
    expectClasses(notes, ["w-full", ...INPUT_SURFACE_CLASSES]);
    expectClasses(annotation, ANNOTATION_CLASSES);
  });

  it("renders the single-save grouped controls", () => {
    const value: SavingThrowSpec = {
      kind: "single",
      single: {
        id: "save_spell",
        saveType: "spell",
        saveVs: "spell",
        modifier: -2,
        appliesTo: "each_target",
        timing: "on_effect",
        onSuccess: { result: "no_effect", notes: "Negated" },
        onFailure: { result: "full_effect", notes: "Full effect" },
      },
      notes: "Overall notes",
    };

    render(<SavingThrowInput value={value} onChange={() => {}} />);

    const id = screen.getByTestId("saving-throw-single-id");
    const saveType = screen.getByTestId("saving-throw-single-save-type");
    const saveVs = screen.getByTestId("saving-throw-single-save-vs");
    const modifier = screen.getByTestId("saving-throw-single-modifier");
    const appliesTo = screen.getByTestId("saving-throw-single-applies-to");
    const timing = screen.getByTestId("saving-throw-single-timing");
    const success = screen.getByTestId("saving-throw-single-on-success");
    const failure = screen.getByTestId("saving-throw-single-on-failure");
    const successNotes = screen.getByTestId("saving-throw-single-on-success-notes");
    const failureNotes = screen.getByTestId("saving-throw-single-on-failure-notes");
    const successLabel = screen.getByText("Success:");
    const failureLabel = screen.getByText("Failure:");

    expect(id).not.toBeNull();
    expect(saveType).not.toBeNull();
    expect(saveVs).not.toBeNull();
    expect(modifier).not.toBeNull();
    expect(appliesTo).not.toBeNull();
    expect(timing).not.toBeNull();
    expect(success).not.toBeNull();
    expect(failure).not.toBeNull();
    expect(successNotes).not.toBeNull();
    expect(failureNotes).not.toBeNull();
    expectClasses(id.closest("div")?.parentElement as HTMLElement, NESTED_SURFACE_CLASSES);
    expectClasses(id, ["w-24", "font-mono", ...INPUT_SURFACE_CLASSES]);
    expectClasses(saveType, INPUT_SURFACE_CLASSES);
    expectClasses(saveVs, INPUT_SURFACE_CLASSES);
    expectClasses(modifier, ["w-12", ...INPUT_SURFACE_CLASSES]);
    expectClasses(appliesTo, INPUT_SURFACE_CLASSES);
    expectClasses(timing, INPUT_SURFACE_CLASSES);
    expectClasses(success, ["flex-1", ...INPUT_SURFACE_CLASSES]);
    expectClasses(failure, ["flex-1", ...INPUT_SURFACE_CLASSES]);
    expectClasses(successNotes, ["w-full", ...INPUT_SURFACE_CLASSES]);
    expectClasses(failureNotes, ["w-full", ...INPUT_SURFACE_CLASSES]);
    expectClasses(successLabel, MUTED_TEXT_CLASSES);
    expectClasses(failureLabel, MUTED_TEXT_CLASSES);
  });

  it("changing the kind to multiple seeds the multiple-save payload and preserves annotations", () => {
    const onChange = vi.fn();

    render(
      <SavingThrowInput
        value={{
          kind: "none",
          notes: "Carry forward",
          rawLegacyValue: "Legacy save text",
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId("saving-throw-kind"), { target: { value: "multiple" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      kind: "multiple",
      notes: "Carry forward",
      rawLegacyValue: "Legacy save text",
    });
    expect(onChange.mock.calls[0]?.[0].multiple).toHaveLength(1);
    expect(onChange.mock.calls[0]?.[0].multiple?.[0]).toMatchObject({
      saveType: "spell",
      appliesTo: "each_target",
      onSuccess: { result: "no_effect" },
      onFailure: { result: "full_effect" },
    });
  });

  it("sanitizes single-save ids before emitting onChange", () => {
    const onChange = vi.fn();

    render(
      <SavingThrowInput
        value={{
          kind: "single",
          single: {
            saveType: "spell",
            appliesTo: "each_target",
            onSuccess: { result: "no_effect" },
            onFailure: { result: "full_effect" },
          },
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId("saving-throw-single-id"), {
      target: { value: "Spell Save! 2" },
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      kind: "single",
      single: expect.objectContaining({ id: "spell_save__2" }),
    });
  });
});
