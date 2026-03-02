import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { CastingTimeDetail } from "./CastingTimeDetail";

const meta = {
  title: "SpellDetail/CastingTimeDetail",
  component: CastingTimeDetail,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof CastingTimeDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Q1 required scenarios
// ---------------------------------------------------------------------------

/** spec.text (non-empty) is used directly — no fallthrough */
export const TextPreferred: Story = {
  args: {
    spec: {
      text: "1 segment",
      unit: "segment",
      baseValue: 1,
      rawLegacyValue: "should not appear",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("casting-time-detail")).toHaveTextContent("1 segment");
  },
};

/**
 * Empty text ("") falls through to rawLegacyValue.
 * CastingTimeDetail uses || (not ??) so empty string is falsy and skipped.
 */
export const EmptyTextFallsToRawLegacy: Story = {
  args: {
    spec: {
      text: "",
      unit: "round",
      rawLegacyValue: "2 rounds",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("casting-time-detail")).toHaveTextContent("2 rounds");
  },
};

/**
 * Empty text AND no rawLegacyValue → falls through to castingTimeToText synthesis.
 * baseValue=1, unit="segment" → "1 segment"
 */
export const EmptyTextAndRawLegacyFallsToSynthesis: Story = {
  args: {
    spec: {
      text: "",
      unit: "segment",
      baseValue: 1,
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("casting-time-detail")).toHaveTextContent("1 segment");
  },
};

/** "—" when spec is null/undefined — renders the empty placeholder */
export const NullSpec: Story = {
  args: { spec: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("casting-time-detail-empty")).toHaveTextContent("—");
    await expect(canvas.queryByTestId("casting-time-detail")).not.toBeInTheDocument();
  },
};

// ---------------------------------------------------------------------------
// Visual stories
// ---------------------------------------------------------------------------

export const OneRound: Story = {
  args: {
    spec: {
      text: "1 round",
      unit: "round",
      baseValue: 1,
    },
  },
};

export const ThreeSegments: Story = {
  args: {
    spec: {
      text: "3 segments",
      unit: "segment",
      baseValue: 3,
    },
  },
};

export const SpecialUnit: Story = {
  args: {
    spec: {
      text: "",
      unit: "special",
      rawLegacyValue: "Varies by spell level",
    },
  },
};
