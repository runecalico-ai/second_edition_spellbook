import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { MagicResistanceDetail } from "./MagicResistanceDetail";

const meta = {
  title: "SpellDetail/MagicResistanceDetail",
  component: MagicResistanceDetail,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof MagicResistanceDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Q1 required scenarios
// ---------------------------------------------------------------------------

/** kind="special" → sourceText rendered as primary content */
export const KindSpecialShowsSourceTextPrimary: Story = {
  args: {
    spec: {
      kind: "special",
      sourceText: "MR applies only to the initial targeting; secondary effects bypass MR",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("magic-resistance-source-text-primary")).toHaveTextContent(
      "MR applies only to the initial targeting; secondary effects bypass MR",
    );
    await expect(
      canvas.queryByTestId("magic-resistance-source-text-supplementary"),
    ).not.toBeInTheDocument();
  },
};

/** kind="unknown" hides appliesTo even when it is set */
export const KindUnknownHidesAppliesTo: Story = {
  args: {
    spec: {
      kind: "unknown",
      appliesTo: "whole_spell",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("magic-resistance-kind")).toHaveTextContent("N/A");
    await expect(
      canvas.queryByTestId("magic-resistance-applies-to"),
    ).not.toBeInTheDocument();
  },
};

/**
 * F2 fix verification: kind="special" with BOTH sourceText AND specialRule →
 * both data-testids must be present simultaneously.
 */
export const F2BothSourceTextAndSpecialRule: Story = {
  args: {
    spec: {
      kind: "special",
      sourceText: "Undead created by this spell are immune to MR checks",
      specialRule: "MR applies only to the initial summoning roll",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Primary sourceText is rendered
    await expect(canvas.getByTestId("magic-resistance-source-text-primary")).toHaveTextContent(
      "Undead created by this spell are immune to MR checks",
    );
    // specialRule is also rendered alongside — F2 fix: no !showSourceTextPrimary guard
    await expect(canvas.getByTestId("magic-resistance-special-rule")).toHaveTextContent(
      "MR applies only to the initial summoning roll",
    );
  },
};

// ---------------------------------------------------------------------------
// Visual stories
// ---------------------------------------------------------------------------

export const NullSpec: Story = {
  args: { spec: null },
};

export const KindNormal: Story = {
  args: {
    spec: {
      kind: "normal",
      appliesTo: "whole_spell",
    },
  },
};

export const KindIgnoresMr: Story = {
  args: {
    spec: {
      kind: "ignores_mr",
      appliesTo: "whole_spell",
    },
  },
};

export const KindPartial: Story = {
  args: {
    spec: {
      kind: "partial",
      appliesTo: "harmful_effects_only",
      partial: { scope: "damage_only" },
    },
  },
};

export const KindNormalWithNotes: Story = {
  args: {
    spec: {
      kind: "normal",
      appliesTo: "harmful_effects_only",
      notes: "Does not apply to area-of-effect portion",
    },
  },
};
