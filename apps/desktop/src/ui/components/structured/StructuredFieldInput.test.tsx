// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DurationSpec, RangeSpec, SpellCastingTime } from "../../../types/spell";
import type { SpellEditorFieldError } from "../../spellEditorValidation";
import { StructuredFieldInput } from "./StructuredFieldInput";

afterEach(() => {
  cleanup();
});

const ROOT_SURFACE_CLASSES = [
  "space-y-3",
  "rounded-xl",
  "border",
  "border-neutral-300",
  "bg-white",
  "p-3",
  "text-neutral-900",
  "shadow-sm",
  "dark:border-neutral-700",
  "dark:bg-neutral-950/60",
  "dark:text-neutral-100",
];

const PRIMARY_ROW_CLASSES = ["flex", "min-w-0", "flex-wrap", "items-center", "gap-2"];

const SUPPORTING_ROW_CLASSES = [
  "rounded-lg",
  "border",
  "border-neutral-200",
  "bg-neutral-50/70",
  "p-2",
  "dark:border-neutral-800",
  "dark:bg-neutral-950/40",
];

const PREVIEW_ROW_CLASSES = [
  "rounded-lg",
  "border",
  "border-neutral-200",
  "bg-neutral-50",
  "px-2.5",
  "py-2",
  "dark:border-neutral-800",
  "dark:bg-neutral-950/50",
];

function expectClasses(node: HTMLElement, classes: string[]) {
  const tokens = new Set(node.className.split(/\s+/).filter(Boolean));
  for (const className of classes) {
    expect(tokens.has(className)).toBe(true);
  }
}

function getRoot() {
  return screen.getByTestId("structured-field-input");
}

function expectPreviewRow(previewTestId: string, expectedText: string) {
  const preview = screen.getByTestId(previewTestId);
  expect(preview.tagName).toBe("OUTPUT");
  expect(preview.textContent).toBe(expectedText);
  expect(preview.getAttribute("aria-live")).toBeNull();
  expect(preview.getAttribute("aria-label")).toBeNull();
  return preview;
}

function expectRootChildren(root: HTMLElement, expectedCount: number) {
  const children = Array.from(root.children) as HTMLElement[];
  expect(children).toHaveLength(expectedCount);
  expectClasses(children[0] as HTMLElement, PRIMARY_ROW_CLASSES);
  return children;
}

describe("StructuredFieldInput", () => {
  it("primary control row includes flex-wrap for 900px layout compatibility", () => {
    render(
      <StructuredFieldInput
        fieldType="range"
        value={{ kind: "distance", unit: "ft", distance: { mode: "fixed", value: 10 } } as RangeSpec}
        onChange={() => {}}
      />,
    );
    const root = getRoot();
    const primary = root.children[0] as HTMLElement;
    const tokens = new Set(primary.className.split(/\s+/).filter(Boolean));
    expect(tokens.has("flex-wrap")).toBe(true);
    expect(tokens.has("min-w-0")).toBe(true);
  });

  it("locks the range grouped DOM contract", () => {
    render(
      <StructuredFieldInput
        fieldType="range"
        value={{
          kind: "distance",
          unit: "ft",
          distance: { mode: "fixed", value: 30 },
        } as RangeSpec}
        onChange={() => {}}
      />,
    );

    const root = getRoot();
    expectClasses(root, ROOT_SURFACE_CLASSES);
    const [primary, supporting, preview] = expectRootChildren(root, 3);
    expectClasses(supporting, SUPPORTING_ROW_CLASSES);
    expectClasses(preview, PREVIEW_ROW_CLASSES);
    expect(primary.contains(screen.getByTestId("range-kind-select"))).toBe(true);
    expect(primary.contains(screen.getByTestId("range-scalar"))).toBe(true);
    expect(primary.contains(screen.getByTestId("range-unit"))).toBe(true);
    expect(screen.queryByTestId("range-raw-legacy")).toBeNull();
    expect(supporting.contains(screen.getByTestId("range-notes"))).toBe(true);
    expect(preview.contains(expectPreviewRow("range-text-preview", "30 ft"))).toBe(true);
  });

  it("keeps range raw legacy fields in the primary row", () => {
    render(
      <StructuredFieldInput
        fieldType="range"
        value={{ kind: "special", rawLegacyValue: "legacy range" } as RangeSpec}
        onChange={() => {}}
      />,
    );

    const [primary, supporting, preview] = expectRootChildren(getRoot(), 3);
    expectClasses(supporting, SUPPORTING_ROW_CLASSES);
    expectClasses(preview, PREVIEW_ROW_CLASSES);
    expect(primary.contains(screen.getByTestId("range-kind-select"))).toBe(true);
    expect(primary.contains(screen.getByTestId("range-raw-legacy"))).toBe(true);
  });

  it("range kind changes recompute text and clear stale structured fields", () => {
    const onChange = vi.fn();
    render(
      <StructuredFieldInput
        fieldType="range"
        value={{
          kind: "distance",
          unit: "ft",
          distance: { mode: "fixed", value: 30 },
          rawLegacyValue: "legacy text",
          notes: "keep notes",
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId("range-kind-select"), { target: { value: "personal" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      kind: "personal",
      text: "Personal",
      unit: undefined,
      distance: undefined,
      rawLegacyValue: undefined,
    });
  });

  it("locks the duration grouped DOM contract", () => {
    render(
      <StructuredFieldInput
        fieldType="duration"
        value={{ kind: "time", unit: "round", duration: { mode: "fixed", value: 3 } }}
        onChange={() => {}}
      />,
    );

    const root = getRoot();
    expectClasses(root, ROOT_SURFACE_CLASSES);
    const [primary, supporting, preview] = expectRootChildren(root, 3);
    expectClasses(supporting, SUPPORTING_ROW_CLASSES);
    expectClasses(preview, PREVIEW_ROW_CLASSES);
    expect(primary.contains(screen.getByTestId("duration-kind-select"))).toBe(true);
    expect(primary.contains(screen.getByTestId("duration-scalar"))).toBe(true);
    expect(primary.contains(screen.getByTestId("duration-unit"))).toBe(true);
    expect(screen.queryByTestId("duration-condition")).toBeNull();
    expect(screen.queryByTestId("duration-raw-legacy")).toBeNull();
    expect(supporting.contains(screen.getByTestId("duration-notes"))).toBe(true);
    expect(preview.contains(expectPreviewRow("duration-text-preview", "3 round"))).toBe(true);
  });

  it("keeps duration special raw fields in the primary row", () => {
    render(
      <StructuredFieldInput
        fieldType="duration"
        value={{
          kind: "special",
          rawLegacyValue: "legacy duration",
          notes: "notes",
        } as DurationSpec}
        onChange={() => {}}
      />,
    );

    const [primary, supporting, preview] = expectRootChildren(getRoot(), 3);
    expectClasses(supporting, SUPPORTING_ROW_CLASSES);
    expectClasses(preview, PREVIEW_ROW_CLASSES);
    expect(primary.contains(screen.getByTestId("duration-kind-select"))).toBe(true);
    expect(primary.contains(screen.getByTestId("duration-raw-legacy"))).toBe(true);
  });

  it("keeps duration condition fields in the primary row", () => {
    render(
      <StructuredFieldInput
        fieldType="duration"
        value={{
          kind: "conditional",
          condition: "When cast",
        } as DurationSpec}
        onChange={() => {}}
      />,
    );

    const [primary, supporting, preview] = expectRootChildren(getRoot(), 3);
    expectClasses(supporting, SUPPORTING_ROW_CLASSES);
    expectClasses(preview, PREVIEW_ROW_CLASSES);
    expect(primary.contains(screen.getByTestId("duration-kind-select"))).toBe(true);
    expect(primary.contains(screen.getByTestId("duration-condition"))).toBe(true);
  });

  it("keeps duration usage-limited scalar controls in the primary row", () => {
    render(
      <StructuredFieldInput
        fieldType="duration"
        value={{
          kind: "usage_limited",
          uses: { mode: "fixed", value: 2 },
        } as DurationSpec}
        onChange={() => {}}
      />,
    );

    const [primary, supporting, preview] = expectRootChildren(getRoot(), 3);
    expectClasses(supporting, SUPPORTING_ROW_CLASSES);
    expectClasses(preview, PREVIEW_ROW_CLASSES);
    expect(primary.contains(screen.getByTestId("duration-kind-select"))).toBe(true);
    expect(primary.contains(screen.getByTestId("duration-uses-scalar"))).toBe(true);
    expect(preview.contains(expectPreviewRow("duration-text-preview", "2 use(s)"))).toBe(true);
  });

  it("duration kind changes recompute text and clear stale structured fields", () => {
    const onChange = vi.fn();
    render(
      <StructuredFieldInput
        fieldType="duration"
        value={{
          kind: "time",
          unit: "round",
          duration: { mode: "fixed", value: 3 },
          rawLegacyValue: "legacy text",
          notes: "keep notes",
        }}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId("duration-kind-select"), { target: { value: "instant" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      kind: "instant",
      text: "Instant",
      unit: undefined,
      duration: undefined,
      rawLegacyValue: undefined,
    });
  });

  it("locks the casting-time grouped DOM contract", () => {
    render(
      <StructuredFieldInput
        fieldType="casting_time"
        value={{
          text: "1 segment",
          unit: "segment",
          baseValue: 1,
          perLevel: 0,
          levelDivisor: 1,
          rawLegacyValue: "legacy ct",
        } as SpellCastingTime}
        onChange={() => {}}
      />,
    );

    const root = getRoot();
    expectClasses(root, ROOT_SURFACE_CLASSES);
    const [primary, preview] = expectRootChildren(root, 2);
    expectClasses(preview, PREVIEW_ROW_CLASSES);
    expect(primary.contains(screen.getByTestId("casting-time-base-value"))).toBe(true);
    expect(primary.contains(screen.getByTestId("casting-time-per-level"))).toBe(true);
    expect(primary.contains(screen.getByTestId("casting-time-level-divisor"))).toBe(true);
    expect(primary.contains(screen.getByTestId("casting-time-unit"))).toBe(true);
    expect(primary.contains(screen.getByTestId("casting-time-raw-legacy"))).toBe(true);
    expect(preview.contains(expectPreviewRow("casting-time-text-preview", "1 segment"))).toBe(true);
  });

  it("casting time unit switches clear raw legacy text when leaving special", () => {
    const onChange = vi.fn();
    render(
      <StructuredFieldInput
        fieldType="casting_time"
        value={{
          text: "legacy ct",
          unit: "special",
          baseValue: 1,
          perLevel: 0,
          levelDivisor: 1,
          rawLegacyValue: "legacy ct",
        } as SpellCastingTime}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId("casting-time-unit"), { target: { value: "segment" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      unit: "segment",
      rawLegacyValue: undefined,
    });
  });

  it("casting time base value edits recompute text through onChange", () => {
    const onChange = vi.fn();
    render(
      <StructuredFieldInput
        fieldType="casting_time"
        value={{
          text: "1 segment",
          unit: "segment",
          baseValue: 1,
          perLevel: 0,
          levelDivisor: 1,
        } as SpellCastingTime}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByTestId("casting-time-base-value"), { target: { value: "2" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      baseValue: 2,
      unit: "segment",
      text: "2 segments",
    });
  });

  it("casting time validation errors are rendered directly on the field", () => {
    const errors: SpellEditorFieldError[] = [
      {
        field: "casting-time-base-value",
        testId: "error-casting-time-base-value",
        message: "Base value must be 0 or greater",
        focusTarget: "casting-time-base-value",
      },
    ];

    render(
      <StructuredFieldInput
        fieldType="casting_time"
        value={null}
        onChange={() => {}}
        visibleFieldErrors={errors}
      />,
    );

    const error = screen.getByTestId("error-casting-time-base-value");
    expect(error.tagName).toBe("P");
    expect(error.textContent).toBe("Base value must be 0 or greater");
    expect(screen.getByTestId("casting-time-base-value").getAttribute("aria-describedby")).toBe(
      "error-casting-time-base-value",
    );
  });
});
