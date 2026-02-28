import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { AreaDetail } from "./AreaDetail";

const meta = {
  title: "SpellDetail/AreaDetail",
  component: AreaDetail,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof AreaDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Q1 required scenarios
// ---------------------------------------------------------------------------

/** spec.text preferred over rawLegacyValue and synthesis */
export const TextPreferred: Story = {
  args: {
    spec: {
      kind: "radius_circle",
      text: "20-ft radius",
      rawLegacyValue: "different raw value",
      radius: { mode: "fixed", value: 999 },
      shapeUnit: "ft",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("area-detail-text")).toHaveTextContent("20-ft radius");
  },
};

/** rawLegacyValue used when spec.text absent */
export const FallbackToRawLegacy: Story = {
  args: {
    spec: {
      kind: "special",
      rawLegacyValue: "10-ft cube per level",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("area-detail-text")).toHaveTextContent("10-ft cube per level");
  },
};

/**
 * Synthesis from structured fields: kind="point" → areaToText returns "Point"
 */
export const SynthesisFromStructuredFields: Story = {
  args: {
    spec: { kind: "point" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("area-detail-text")).toHaveTextContent("Point");
  },
};

/** "—" when spec is null/undefined */
export const NullSpec: Story = {
  args: { spec: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("area-detail-empty")).toHaveTextContent("—");
    await expect(canvas.queryByTestId("area-detail")).not.toBeInTheDocument();
  },
};

/** Notes rendered when present */
export const WithNotes: Story = {
  args: {
    spec: {
      kind: "radius_sphere",
      text: "20-ft radius (sphere)",
      notes: "Centered on caster",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("area-detail-notes")).toHaveTextContent("Centered on caster");
  },
};

// ---------------------------------------------------------------------------
// Visual stories
// ---------------------------------------------------------------------------

export const RadiusCircle: Story = {
  args: {
    spec: {
      kind: "radius_circle",
      radius: { mode: "fixed", value: 30 },
      shapeUnit: "ft",
    },
  },
};

export const Cone: Story = {
  args: {
    spec: {
      kind: "cone",
      length: { mode: "fixed", value: 60 },
      shapeUnit: "ft",
    },
  },
};

export const Line: Story = {
  args: {
    spec: {
      kind: "line",
      length: { mode: "fixed", value: 60 },
      width: { mode: "fixed", value: 5 },
      shapeUnit: "ft",
    },
  },
};
