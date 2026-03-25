// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScalarInput } from "./ScalarInput";

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

describe("ScalarInput", () => {
  it("applies the standard focus-visible ring to the mode select and numeric input", () => {
    render(
      <ScalarInput value={{ mode: "fixed", value: 3 }} onChange={vi.fn()} data-testid="scalar" />,
    );

    expectClasses(screen.getByTestId("scalar-mode"), FOCUS_RING_CLASSES);
    expectClasses(screen.getByTestId("range-base-value"), FOCUS_RING_CLASSES);
  });

  it("keeps the focus-visible ring when switching to per-level mode", () => {
    render(
      <ScalarInput
        value={{ mode: "per_level", perLevel: 3, per_level: 3 }}
        onChange={vi.fn()}
        data-testid="scalar"
      />,
    );

    expectClasses(screen.getByTestId("scalar-mode"), FOCUS_RING_CLASSES);
    expectClasses(screen.getByTestId("range-per-level"), FOCUS_RING_CLASSES);
  });
});