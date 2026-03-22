// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { DurationSpec, RangeSpec, SpellCastingTime } from "../../../types/spell";
import { StructuredFieldInput } from "./StructuredFieldInput";

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Range mode
// ---------------------------------------------------------------------------
describe("StructuredFieldInput – range mode", () => {
  it("renders the structured-field-input root container", () => {
    render(<StructuredFieldInput fieldType="range" value={null} onChange={() => {}} />);
    expect(screen.getByTestId("structured-field-input")).not.toBeNull();
  });

  it("renders the range-kind-select inside the root container", () => {
    render(<StructuredFieldInput fieldType="range" value={null} onChange={() => {}} />);
    expect(screen.getByTestId("range-kind-select")).not.toBeNull();
  });

  it("renders the range-text-preview inside the root container", () => {
    render(<StructuredFieldInput fieldType="range" value={null} onChange={() => {}} />);
    expect(screen.getByTestId("range-text-preview")).not.toBeNull();
  });

  it("range-text-preview is a descendant of structured-field-input", () => {
    render(<StructuredFieldInput fieldType="range" value={null} onChange={() => {}} />);
    const root = screen.getByTestId("structured-field-input");
    const preview = screen.getByTestId("range-text-preview");
    expect(root.contains(preview)).toBe(true);
  });

  // MUST FAIL: root container should have "border" class (group surface), but current code only has "space-y-2"
  it("range mode root container has group surface border class", () => {
    const html = renderToStaticMarkup(
      <StructuredFieldInput fieldType="range" value={null} onChange={() => {}} />,
    );
    const container = document.createElement("div");
    container.innerHTML = html;
    const root = container.querySelector('[data-testid="structured-field-input"]');
    expect(root?.className.split(" ")).toContain("border"); // FAILS: current class is "space-y-2"
  });

  it("range distance mode renders range-base-value scalar input", () => {
    const rangeDistanceSpec: RangeSpec = {
      kind: "distance",
      distance: { mode: "fixed", value: 30 },
      unit: "ft",
    };
    render(
      <StructuredFieldInput fieldType="range" value={rangeDistanceSpec} onChange={() => {}} />,
    );
    expect(screen.getByTestId("range-base-value")).not.toBeNull();
  });

  it("range distance mode renders range-unit select", () => {
    const rangeDistanceSpec: RangeSpec = {
      kind: "distance",
      distance: { mode: "fixed", value: 30 },
      unit: "ft",
    };
    render(
      <StructuredFieldInput fieldType="range" value={rangeDistanceSpec} onChange={() => {}} />,
    );
    expect(screen.getByTestId("range-unit")).not.toBeNull();
  });

  it("range mode renders range-notes textarea", () => {
    const rangeDistanceSpec: RangeSpec = {
      kind: "distance",
      distance: { mode: "fixed", value: 30 },
      unit: "ft",
    };
    render(
      <StructuredFieldInput fieldType="range" value={rangeDistanceSpec} onChange={() => {}} />,
    );
    expect(screen.getByTestId("range-notes")).not.toBeNull();
  });

  it("range special kind renders range-raw-legacy inside structured-field-input root", () => {
    const rangeSpecialSpec: RangeSpec = { kind: "special", rawLegacyValue: "custom" };
    render(
      <StructuredFieldInput fieldType="range" value={rangeSpecialSpec} onChange={() => {}} />,
    );
    const root = screen.getByTestId("structured-field-input");
    const rawLegacy = screen.getByTestId("range-raw-legacy");
    expect(rawLegacy).not.toBeNull();
    expect(root.contains(rawLegacy)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Duration mode
// ---------------------------------------------------------------------------
describe("StructuredFieldInput – duration mode", () => {
  it("renders the structured-field-input root container", () => {
    render(<StructuredFieldInput fieldType="duration" value={null} onChange={() => {}} />);
    expect(screen.getByTestId("structured-field-input")).not.toBeNull();
  });

  it("renders the duration-kind-select inside the root container", () => {
    render(<StructuredFieldInput fieldType="duration" value={null} onChange={() => {}} />);
    expect(screen.getByTestId("duration-kind-select")).not.toBeNull();
  });

  it("renders the duration-text-preview inside the root container", () => {
    render(<StructuredFieldInput fieldType="duration" value={null} onChange={() => {}} />);
    expect(screen.getByTestId("duration-text-preview")).not.toBeNull();
  });

  it("duration-text-preview is a descendant of structured-field-input", () => {
    render(<StructuredFieldInput fieldType="duration" value={null} onChange={() => {}} />);
    const root = screen.getByTestId("structured-field-input");
    const preview = screen.getByTestId("duration-text-preview");
    expect(root.contains(preview)).toBe(true);
  });

  it("duration mode with time kind renders duration-unit select", () => {
    render(
      <StructuredFieldInput
        fieldType="duration"
        value={{ kind: "time", unit: "round", duration: { mode: "fixed", value: 1 } }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByTestId("duration-unit")).not.toBeNull();
  });

  it("duration time mode renders duration-base-value scalar input", () => {
    const durationTimeSpec: DurationSpec = {
      kind: "time",
      unit: "round",
      duration: { mode: "fixed", value: 3 },
    };
    render(
      <StructuredFieldInput fieldType="duration" value={durationTimeSpec} onChange={() => {}} />,
    );
    expect(screen.getByTestId("duration-base-value")).not.toBeNull();
  });

  it("duration time mode renders both scalar and unit controls inside the grouped root", () => {
    const timeSpec: DurationSpec = { kind: "time", unit: "round", duration: { mode: "fixed", value: 3 } };
    render(
      <StructuredFieldInput fieldType="duration" value={timeSpec} onChange={() => {}} />,
    );
    const root = screen.getByTestId("structured-field-input");
    const scalar = screen.getByTestId("duration-base-value");
    const unitSelect = screen.getByTestId("duration-unit");
    expect(root.contains(scalar)).toBe(true);
    expect(root.contains(unitSelect)).toBe(true);
  });

  // MUST FAIL: root container should have "border" class (group surface), but current code only has "space-y-2"
  it("duration mode root container has group surface border class", () => {
    const html = renderToStaticMarkup(
      <StructuredFieldInput fieldType="duration" value={null} onChange={() => {}} />,
    );
    const container = document.createElement("div");
    container.innerHTML = html;
    const root = container.querySelector('[data-testid="structured-field-input"]');
    expect(root?.className.split(" ")).toContain("border"); // FAILS: current class is "space-y-2"
  });
});

// ---------------------------------------------------------------------------
// Casting time mode
// ---------------------------------------------------------------------------
describe("StructuredFieldInput – casting_time mode", () => {
  it("renders the structured-field-input root container", () => {
    render(<StructuredFieldInput fieldType="casting_time" value={null} onChange={() => {}} />);
    expect(screen.getByTestId("structured-field-input")).not.toBeNull();
  });

  it("renders the casting-time-base-value input inside the root container", () => {
    render(<StructuredFieldInput fieldType="casting_time" value={null} onChange={() => {}} />);
    expect(screen.getByTestId("casting-time-base-value")).not.toBeNull();
  });

  it("renders the casting-time-unit select inside the root container", () => {
    render(<StructuredFieldInput fieldType="casting_time" value={null} onChange={() => {}} />);
    expect(screen.getByTestId("casting-time-unit")).not.toBeNull();
  });

  it("renders the casting-time-text-preview inside the root container", () => {
    render(<StructuredFieldInput fieldType="casting_time" value={null} onChange={() => {}} />);
    expect(screen.getByTestId("casting-time-text-preview")).not.toBeNull();
  });

  it("casting-time-text-preview is a descendant of structured-field-input", () => {
    render(<StructuredFieldInput fieldType="casting_time" value={null} onChange={() => {}} />);
    const root = screen.getByTestId("structured-field-input");
    const preview = screen.getByTestId("casting-time-text-preview");
    expect(root.contains(preview)).toBe(true);
  });

  it("casting_time mode renders casting-time-per-level input", () => {
    render(<StructuredFieldInput fieldType="casting_time" value={null} onChange={() => {}} />);
    expect(screen.getByTestId("casting-time-per-level")).not.toBeNull();
  });

  it("casting_time mode renders casting-time-level-divisor input", () => {
    render(<StructuredFieldInput fieldType="casting_time" value={null} onChange={() => {}} />);
    expect(screen.getByTestId("casting-time-level-divisor")).not.toBeNull();
  });

  // MUST FAIL: root container should have "border" class (group surface), but current code only has "space-y-2"
  it("casting_time mode root container has group surface border class", () => {
    const html = renderToStaticMarkup(
      <StructuredFieldInput fieldType="casting_time" value={null} onChange={() => {}} />,
    );
    const container = document.createElement("div");
    container.innerHTML = html;
    const root = container.querySelector('[data-testid="structured-field-input"]');
    expect(root?.className.split(" ")).toContain("border"); // FAILS: current class is "space-y-2"
  });

  it("casting-time with special unit renders raw-legacy input inside root", () => {
    const specialSpec: SpellCastingTime = { text: "", unit: "special", rawLegacyValue: "some text" };
    render(
      <StructuredFieldInput fieldType="casting_time" value={specialSpec} onChange={() => {}} />,
    );
    const root = screen.getByTestId("structured-field-input");
    const rawLegacy = screen.getByTestId("casting-time-raw-legacy");
    expect(rawLegacy).not.toBeNull();
    expect(root.contains(rawLegacy)).toBe(true);
  });
});
