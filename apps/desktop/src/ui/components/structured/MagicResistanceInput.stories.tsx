import type { Meta, StoryObj } from "@storybook/react";
import { defaultMagicResistanceSpec } from "../../../types/spell";
import { MagicResistanceInput } from "./MagicResistanceInput";
import { fn } from "./storybook-utils";

const meta = {
  title: "SpellEditor/MagicResistanceInput",
  component: MagicResistanceInput,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof MagicResistanceInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    value: null,
    onChange: fn(),
  },
};

export const Unknown: Story = {
  args: {
    value: {
      kind: "unknown",
    },
    onChange: fn(),
  },
};

export const Normal: Story = {
  args: {
    value: {
      kind: "normal",
      appliesTo: "whole_spell",
    },
    onChange: fn(),
  },
};

export const IgnoresMR: Story = {
  args: {
    value: {
      kind: "ignores_mr",
      appliesTo: "whole_spell",
    },
    onChange: fn(),
  },
};

export const Partial: Story = {
  args: {
    value: {
      kind: "partial",
      appliesTo: "harmful_effects_only",
      partial: {
        scope: "damage_only",
      },
    },
    onChange: fn(),
  },
};

export const PartialWithPartIds: Story = {
  args: {
    value: {
      kind: "partial",
      appliesTo: "whole_spell",
      partial: {
        scope: "by_part_id",
        partIds: ["part_1", "part_2"],
      },
    },
    onChange: fn(),
  },
};

export const Special: Story = {
  args: {
    value: {
      kind: "special",
      appliesTo: "dm",
      specialRule: "MR applies only to the initial damage, not ongoing effects.",
    },
    onChange: fn(),
  },
};
