import type { Meta, StoryObj } from '@storybook/react';
import { DamageForm } from './DamageForm';
import { defaultSpellDamageSpec, generateDamagePartId } from '../../../types/spell';
import { fn } from './storybook-utils';

const meta = {
  title: 'SpellEditor/DamageForm',
  component: DamageForm,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
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
      kind: 'none',
    },
    onChange: fn(),
  },
};

export const DMAdjudicated: Story = {
  args: {
    value: {
      kind: 'dm_adjudicated',
      dmGuidance: 'Damage varies based on spell level and target resistance.',
    },
    onChange: fn(),
  },
};

export const ModeledSinglePart: Story = {
  args: {
    value: {
      kind: 'modeled',
      combineMode: 'sum',
      parts: [
        {
          id: generateDamagePartId(),
          damageType: 'fire',
          base: {
            terms: [{ count: 1, sides: 6 }],
            flatModifier: 0,
          },
          application: 'instant',
          save: { kind: 'none' },
        },
      ],
    },
    onChange: fn(),
  },
};

export const ModeledMultipleParts: Story = {
  args: {
    value: {
      kind: 'modeled',
      combineMode: 'sum',
      parts: [
        {
          id: generateDamagePartId(),
          damageType: 'fire',
          base: {
            terms: [{ count: 1, sides: 6 }],
            flatModifier: 0,
          },
          application: 'instant',
          save: { kind: 'none' },
        },
        {
          id: generateDamagePartId(),
          damageType: 'cold',
          base: {
            terms: [{ count: 1, sides: 4 }],
            flatModifier: 2,
          },
          application: 'instant',
          save: { kind: 'none' },
        },
      ],
    },
    onChange: fn(),
  },
};

export const ModeledWithModifier: Story = {
  args: {
    value: {
      kind: 'modeled',
      combineMode: 'sum',
      parts: [
        {
          id: generateDamagePartId(),
          damageType: 'fire',
          base: {
            terms: [{ count: 2, sides: 6 }],
            flatModifier: 3,
          },
          application: 'instant',
          save: { kind: 'none' },
        },
      ],
    },
    onChange: fn(),
  },
};

export const ModeledMaxCombine: Story = {
  args: {
    value: {
      kind: 'modeled',
      combineMode: 'max',
      parts: [
        {
          id: generateDamagePartId(),
          damageType: 'fire',
          base: {
            terms: [{ count: 1, sides: 6 }],
            flatModifier: 0,
          },
          application: 'instant',
          save: { kind: 'none' },
        },
        {
          id: generateDamagePartId(),
          damageType: 'cold',
          base: {
            terms: [{ count: 1, sides: 8 }],
            flatModifier: 0,
          },
          application: 'instant',
          save: { kind: 'none' },
        },
      ],
    },
    onChange: fn(),
  },
};
