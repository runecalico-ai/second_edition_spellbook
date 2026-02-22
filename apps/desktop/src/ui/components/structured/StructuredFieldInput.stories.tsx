import type { Meta, StoryObj } from "@storybook/react";
import { defaultCastingTime, defaultDurationSpec, defaultRangeSpec } from "../../../types/spell";
import { StructuredFieldInput } from "./StructuredFieldInput";
import { fn } from "./storybook-utils";

const meta = {
  title: "SpellEditor/StructuredFieldInput",
  component: StructuredFieldInput,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    fieldType: {
      control: "select",
      options: ["range", "duration", "casting_time"],
    },
  },
} satisfies Meta<typeof StructuredFieldInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RangeEmpty: Story = {
  args: {
    fieldType: "range",
    value: null,
    onChange: fn(),
  },
};

export const RangeDistance: Story = {
  args: {
    fieldType: "range",
    value: {
      kind: "distance",
      distance: { mode: "fixed", value: 10 },
      unit: "ft",
    },
    onChange: fn(),
  },
};

export const RangeDistancePerLevel: Story = {
  args: {
    fieldType: "range",
    value: {
      kind: "distance",
      distance: { mode: "per_level", value: 10, perLevel: 5 },
      unit: "yd",
    },
    onChange: fn(),
  },
};

export const RangeTouch: Story = {
  args: {
    fieldType: "range",
    value: {
      kind: "touch",
    },
    onChange: fn(),
  },
};

export const RangeSpecial: Story = {
  args: {
    fieldType: "range",
    value: {
      kind: "special",
      rawLegacyValue: "Special range description",
    },
    onChange: fn(),
  },
};

export const DurationEmpty: Story = {
  args: {
    fieldType: "duration",
    value: null,
    onChange: fn(),
  },
};

export const DurationInstant: Story = {
  args: {
    fieldType: "duration",
    value: {
      kind: "instant",
    },
    onChange: fn(),
  },
};

export const DurationTime: Story = {
  args: {
    fieldType: "duration",
    value: {
      kind: "time",
      unit: "round",
      duration: { mode: "fixed", value: 1 },
    },
    onChange: fn(),
  },
};

export const DurationTimePerLevel: Story = {
  args: {
    fieldType: "duration",
    value: {
      kind: "time",
      unit: "hour",
      duration: { mode: "per_level", value: 1, perLevel: 1 },
    },
    onChange: fn(),
  },
};

export const DurationConcentration: Story = {
  args: {
    fieldType: "duration",
    value: {
      kind: "concentration",
    },
    onChange: fn(),
  },
};

export const DurationConditional: Story = {
  args: {
    fieldType: "duration",
    value: {
      kind: "conditional",
      condition: "Until dispelled or dismissed",
    },
    onChange: fn(),
  },
};

export const DurationUsageLimited: Story = {
  args: {
    fieldType: "duration",
    value: {
      kind: "usage_limited",
      uses: { mode: "fixed", value: 3 },
    },
    onChange: fn(),
  },
};

export const DurationSpecial: Story = {
  args: {
    fieldType: "duration",
    value: {
      kind: "special",
      rawLegacyValue: "Special duration description",
    },
    onChange: fn(),
  },
};

export const CastingTimeEmpty: Story = {
  args: {
    fieldType: "casting_time",
    value: null,
    onChange: fn(),
  },
};

export const CastingTimeSimple: Story = {
  args: {
    fieldType: "casting_time",
    value: {
      text: "1 segment",
      baseValue: 1,
      perLevel: 0,
      levelDivisor: 1,
      unit: "segment",
    },
    onChange: fn(),
  },
};

export const CastingTimeWithPerLevel: Story = {
  args: {
    fieldType: "casting_time",
    value: {
      text: "1 round",
      baseValue: 1,
      perLevel: 1,
      levelDivisor: 1,
      unit: "round",
    },
    onChange: fn(),
  },
};

export const CastingTimeComplex: Story = {
  args: {
    fieldType: "casting_time",
    value: {
      text: "1 action",
      baseValue: 1,
      perLevel: 2,
      levelDivisor: 3,
      unit: "action",
    },
    onChange: fn(),
  },
};

export const CastingTimeSpecial: Story = {
  args: {
    fieldType: "casting_time",
    value: {
      text: "Special casting time",
      baseValue: 1,
      perLevel: 0,
      levelDivisor: 1,
      unit: "special",
      rawLegacyValue: "Special casting time",
    },
    onChange: fn(),
  },
};
