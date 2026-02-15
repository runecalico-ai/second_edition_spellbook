import type { Meta, StoryObj } from "@storybook/react";
import { defaultSpellDamageSpec, generateDamagePartId } from "../../../types/spell";
import { DamageForm } from "./DamageForm";
import { fn } from "./storybook-utils";

const meta = {
  title: "SpellEditor/DamageForm",
  component: DamageForm,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof DamageForm>;

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

export const DMAdjudicated: Story = {
  args: {
    value: {
      kind: "dm_adjudicated",
      dmGuidance: "Damage varies based on spell level and target resistance.",
    },
    onChange: fn(),
  },
};

export const ModeledSinglePart: Story = {
  args: {
    value: {
      kind: "modeled",
      combineMode: "sum",
      parts: [
        {
          id: generateDamagePartId(),
          damageType: "fire",
          base: {
            terms: [{ count: 1, sides: 6 }],
            flatModifier: 0,
          },
          application: { scope: "per_target" },
          save: { kind: "none" },
        },
      ],
    },
    onChange: fn(),
  },
};

export const ModeledMultipleParts: Story = {
  args: {
    value: {
      kind: "modeled",
      combineMode: "sum",
      parts: [
        {
          id: generateDamagePartId(),
          damageType: "fire",
          base: {
            terms: [{ count: 1, sides: 6 }],
            flatModifier: 0,
          },
          application: { scope: "per_target" },
          save: { kind: "none" },
        },
        {
          id: generateDamagePartId(),
          damageType: "cold",
          base: {
            terms: [{ count: 1, sides: 4 }],
            flatModifier: 2,
          },
          application: { scope: "per_target" },
          save: { kind: "none" },
        },
      ],
    },
    onChange: fn(),
  },
};

export const ComplexScalingAndClamping: Story = {
  args: {
    value: {
      kind: "modeled",
      combineMode: "sum",
      parts: [
        {
          id: generateDamagePartId(),
          damageType: "fire",
          label: "Fireball base",
          base: {
            terms: [{ count: 1, sides: 6, perDieModifier: 1 }],
            flatModifier: 0,
          },
          application: { scope: "per_target" },
          save: { kind: "half" },
          scaling: [
            {
              kind: "add_dice_per_step",
              driver: "caster_level",
              step: 1,
              diceIncrement: { count: 1, sides: 6 },
              maxSteps: 9,
            },
          ],
          clampTotal: {
            maxTotal: 60,
          },
        },
      ],
    },
    onChange: fn(),
  },
};

export const MultiLevelBands: Story = {
  args: {
    value: {
      kind: "modeled",
      combineMode: "sum",
      parts: [
        {
          id: generateDamagePartId(),
          damageType: "magic",
          label: "Magic Missile-ish",
          base: {
            terms: [{ count: 1, sides: 4 }],
            flatModifier: 1,
          },
          application: { scope: "per_missile" },
          save: { kind: "none" },
          scaling: [
            {
              kind: "set_base_by_level_band",
              driver: "caster_level",
              step: 2,
              levelBands: [
                { min: 1, max: 2, base: { terms: [{ count: 1, sides: 4 }], flatModifier: 1 } },
                { min: 3, max: 4, base: { terms: [{ count: 2, sides: 4 }], flatModifier: 2 } },
                { min: 5, max: 6, base: { terms: [{ count: 3, sides: 4 }], flatModifier: 3 } },
              ],
            },
          ],
        },
      ],
    },
    onChange: fn(),
  },
};
