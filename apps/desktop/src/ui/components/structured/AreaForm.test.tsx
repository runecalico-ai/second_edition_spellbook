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
  it("applies the standard focus-visible ring to rendered area controls", () => {
    const { rerender } = render(
      <AreaForm
        value={{
          kind: "radius_circle",
          radius: { mode: "fixed", value: 10 },
          shapeUnit: "ft",
          notes: "area notes",
        }}
        onChange={() => {}}
      />,
    );

    for (const element of screen.getByTestId("area-form").querySelectorAll("select, input, textarea")) {
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
        onChange={() => {}}
      />,
    );

    for (const element of screen.getByTestId("area-form").querySelectorAll("select, input, textarea")) {
      expectClasses(element as HTMLElement, FOCUS_RING_CLASSES);
    }
  });
});