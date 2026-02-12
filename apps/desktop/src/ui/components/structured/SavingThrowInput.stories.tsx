import type { Meta, StoryObj } from "@storybook/react";
import { SavingThrowInput } from "./SavingThrowInput";
import { defaultSavingThrowSpec } from "../../../types/spell";
import { fn } from "./storybook-utils";

const meta = {
  title: "SpellEditor/SavingThrowInput",
  component: SavingThrowInput,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof SavingThrowInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    value: null,
    onChange: fn(),
  },
};

export const None: Story = {
  args: {
    value: {
      kind: "none",
    },
    onChange: fn(),
  },
};

export const Single: Story = {
  args: {
    value: {
      kind: "single",
      single: {
        id: "main_save",
        saveType: "spell",
        appliesTo: "each_target",
        onSuccess: { result: "no_effect" },
        onFailure: { result: "full_effect" },
      },
    },
    onChange: fn(),
  },
};

export const SingleParalyzation: Story = {
  args: {
    value: {
      kind: "single",
      single: {
        id: "poison_save",
        saveType: "paralyzation_poison_death",
        appliesTo: "each_target",
        onSuccess: { result: "reduced_effect" },
        onFailure: { result: "full_effect" },
      },
    },
    onChange: fn(),
  },
};

export const Multiple: Story = {
  args: {
    value: {
      kind: "multiple",
      multiple: [
        {
          id: "spell_save",
          saveType: "spell",
          appliesTo: "each_target",
          onSuccess: { result: "no_effect" },
          onFailure: { result: "full_effect" },
        },
        {
          id: "breath_save",
          saveType: "breath_weapon",
          appliesTo: "each_target",
          onSuccess: { result: "reduced_effect" },
          onFailure: { result: "full_effect" },
        },
      ],
    },
    onChange: fn(),
  },
};

export const DMAdjudicated: Story = {
  args: {
    value: {
      kind: "dm_adjudicated",
      dmGuidance: "Saving throw varies based on spell level and target type.",
    },
    onChange: fn(),
  },
};
