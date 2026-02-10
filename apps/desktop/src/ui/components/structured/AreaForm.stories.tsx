import type { Meta, StoryObj } from '@storybook/react';
import { AreaForm } from './AreaForm';
import { defaultAreaSpec } from '../../../types/spell';
import { fn } from './storybook-utils';

const meta = {
  title: 'SpellEditor/AreaForm',
  component: AreaForm,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AreaForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    value: null,
    onChange: fn(),
  },
};

export const Point: Story = {
  args: {
    value: {
      kind: 'point',
    },
    onChange: fn(),
  },
};

export const RadiusCircle: Story = {
  args: {
    value: {
      kind: 'radius_circle',
      radius: { mode: 'fixed', value: 10 },
      shapeUnit: 'ft',
    },
    onChange: fn(),
  },
};

export const RadiusSphere: Story = {
  args: {
    value: {
      kind: 'radius_sphere',
      radius: { mode: 'fixed', value: 20 },
      shapeUnit: 'yd',
    },
    onChange: fn(),
  },
};

export const Cone: Story = {
  args: {
    value: {
      kind: 'cone',
      length: { mode: 'fixed', value: 30 },
      shapeUnit: 'ft',
    },
    onChange: fn(),
  },
};

export const Line: Story = {
  args: {
    value: {
      kind: 'line',
      length: { mode: 'per_level', value: 10, perLevel: 5 },
      shapeUnit: 'ft',
    },
    onChange: fn(),
  },
};

export const Rectangle: Story = {
  args: {
    value: {
      kind: 'rect',
      length: { mode: 'fixed', value: 10 },
      width: { mode: 'fixed', value: 5 },
      shapeUnit: 'ft',
    },
    onChange: fn(),
  },
};

export const RectangularPrism: Story = {
  args: {
    value: {
      kind: 'rect_prism',
      length: { mode: 'fixed', value: 10 },
      width: { mode: 'fixed', value: 5 },
      height: { mode: 'fixed', value: 8 },
      shapeUnit: 'ft',
    },
    onChange: fn(),
  },
};

export const Cylinder: Story = {
  args: {
    value: {
      kind: 'cylinder',
      radius: { mode: 'fixed', value: 5 },
      height: { mode: 'fixed', value: 10 },
      shapeUnit: 'ft',
    },
    onChange: fn(),
  },
};

export const Wall: Story = {
  args: {
    value: {
      kind: 'wall',
      length: { mode: 'fixed', value: 20 },
      height: { mode: 'fixed', value: 10 },
      thickness: { mode: 'fixed', value: 1 },
      shapeUnit: 'ft',
    },
    onChange: fn(),
  },
};

export const Cube: Story = {
  args: {
    value: {
      kind: 'cube',
      edge: { mode: 'fixed', value: 5 },
      shapeUnit: 'ft',
    },
    onChange: fn(),
  },
};

export const Volume: Story = {
  args: {
    value: {
      kind: 'volume',
      volume: { mode: 'fixed', value: 100 },
      unit: 'ft3',
    },
    onChange: fn(),
  },
};

export const Surface: Story = {
  args: {
    value: {
      kind: 'surface',
      surfaceArea: { mode: 'fixed', value: 50 },
      unit: 'ft2',
    },
    onChange: fn(),
  },
};

export const Tiles: Story = {
  args: {
    value: {
      kind: 'tiles',
      tileUnit: 'square',
      tileCount: { mode: 'fixed', value: 3 },
    },
    onChange: fn(),
  },
};

export const Creatures: Story = {
  args: {
    value: {
      kind: 'creatures',
      count: { mode: 'fixed', value: 5 },
      countSubject: 'creature',
    },
    onChange: fn(),
  },
};

export const Objects: Story = {
  args: {
    value: {
      kind: 'objects',
      count: { mode: 'per_level', value: 1, perLevel: 1 },
      countSubject: 'object',
    },
    onChange: fn(),
  },
};

export const Region: Story = {
  args: {
    value: {
      kind: 'region',
      regionUnit: 'building',
    },
    onChange: fn(),
  },
};

export const Scope: Story = {
  args: {
    value: {
      kind: 'scope',
      scopeUnit: 'los',
    },
    onChange: fn(),
  },
};

export const Special: Story = {
  args: {
    value: {
      kind: 'special',
      rawLegacyValue: 'Special area description',
    },
    onChange: fn(),
  },
};
