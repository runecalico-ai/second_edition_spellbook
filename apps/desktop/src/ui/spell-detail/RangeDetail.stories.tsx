import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { RangeDetail } from "./RangeDetail";

const meta = {
  title: "SpellDetail/RangeDetail",
  component: RangeDetail,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof RangeDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Q1 required scenarios
// ---------------------------------------------------------------------------

/** spec.text preferred over rawLegacyValue and synthesis */
export const TextPreferred: Story = {
  args: {
    spec: {
      kind: "distance",
      text: "60 ft",
      rawLegacyValue: "60 yards (from rawLegacy)",
      distance: { mode: "fixed", value: 999 },
      unit: "ft",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("range-detail-text")).toHaveTextContent("60 ft");
  },
};

/** rawLegacyValue used when spec.text absent */
export const FallbackToRawLegacy: Story = {
  args: {
    spec: {
      kind: "distance",
      rawLegacyValue: "30 yards",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("range-detail-text")).toHaveTextContent("30 yards");
  },
};

/**
 * Synthesis called when both text and rawLegacyValue are absent AND structured
 * fields are present. kind="touch" is a kind-only value → rangeToText returns "Touch".
 */
export const SynthesisFromStructuredFields: Story = {
  args: {
    spec: { kind: "touch" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("range-detail-text")).toHaveTextContent("Touch");
  },
};

/** "—" when spec is null/undefined (null spec) */
export const NullSpec: Story = {
  args: { spec: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("range-detail-empty")).toHaveTextContent("—");
    await expect(canvas.queryByTestId("range-detail")).not.toBeInTheDocument();
  },
};

/** Notes field renders when present */
export const WithNotes: Story = {
  args: {
    spec: {
      kind: "distance",
      text: "120 ft",
      notes: "Range doubles outdoors",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("range-detail-notes")).toHaveTextContent("Range doubles outdoors");
  },
};

// ---------------------------------------------------------------------------
// Visual stories
// ---------------------------------------------------------------------------

export const DistanceWithUnit: Story = {
  args: {
    spec: {
      kind: "distance",
      distance: { mode: "fixed", value: 120 },
      unit: "ft",
    },
  },
};

export const Personal: Story = {
  args: { spec: { kind: "personal" } },
};

export const Unlimited: Story = {
  args: { spec: { kind: "unlimited" } },
};
