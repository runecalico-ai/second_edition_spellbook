// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AreaForm } from "./AreaForm";

afterEach(() => {
  cleanup();
});

const FOCUS_RING_CLASSES = [
  "focus-visible:ring-2",
  "focus-visible:ring-blue-500",
  "focus-visible:ring-offset-1",
  "dark:focus-visible:ring-offset-neutral-900",
];

function expectClasses(node: HTMLElement, classes: string[]) {
  const tokens = new Set(node.className.split(/\s+/).filter(Boolean));
  for (const className of classes) {
    expect(tokens.has(className)).toBe(true);
  }
}

describe("AreaForm", () => {
  it("M-002: area preview uses semantic output with accessible label", () => {
    render(
      <AreaForm
        value={{
          kind: "special",
          rawLegacyValue: "legacy area",
          text: "legacy area",
          notes: "area notes",
        }}
        onChange={() => { }}
      />,
    );

    const preview = screen.getByTestId("area-text-preview");
    expect(preview.tagName).toBe("OUTPUT");
    expect(preview.getAttribute("aria-label")).toBe("Computed area text");
  });

  it("H-002: area interactive controls use named border role tokens", () => {
    render(
      <AreaForm
        value={{
          kind: "special",
          rawLegacyValue: "legacy area",
          text: "legacy area",
          notes: "area notes",
        }}
        onChange={() => { }}
      />,
    );

    expect(screen.getByTestId("area-form-kind").className.split(/\s+/)).toContain(
      "border-neutral-400",
    );
    expect(screen.getByTestId("area-form-raw-legacy").className.split(/\s+/)).toContain(
      "border-neutral-400",
    );
    expect(screen.getByTestId("area-form-notes").className.split(/\s+/)).toContain(
      "border-neutral-400",
    );
  });

  it("applies the standard focus-visible ring to rendered area controls", () => {
    const { rerender } = render(
      <AreaForm
        value={{
          kind: "radius_circle",
          radius: { mode: "fixed", value: 10 },
          shapeUnit: "ft",
          notes: "area notes",
        }}
        onChange={() => { }}
      />,
    );

    for (const element of screen
      .getByTestId("area-form")
      .querySelectorAll("select, input, textarea")) {
      expectClasses(element as HTMLElement, FOCUS_RING_CLASSES);
    }

    rerender(
      <AreaForm
        value={{
          kind: "special",
          rawLegacyValue: "special area",
          notes: "special notes",
          text: "special area",
        }}
        onChange={() => { }}
      />,
    );

    for (const element of screen
      .getByTestId("area-form")
      .querySelectorAll("select, input, textarea")) {
      expectClasses(element as HTMLElement, FOCUS_RING_CLASSES);
    }
  });
});
