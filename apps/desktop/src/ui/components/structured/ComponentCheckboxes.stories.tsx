import type { Meta, StoryObj } from "@storybook/react";
import { ComponentCheckboxes } from "./ComponentCheckboxes";
import { fn } from "./storybook-utils";

const meta = {
  title: "SpellEditor/ComponentCheckboxes",
  component: ComponentCheckboxes,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof ComponentCheckboxes>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    components: null,
    materialComponents: null,
    onChange: fn(),
  },
};

/** Spell editor variant: only Verbal, Somatic, Material are shown (no Focus, Divine Focus, Experience). */
export const VsmOnly: Story = {
  args: {
    variant: "vsm",
    components: {
      verbal: true,
      somatic: true,
      material: false,
    },
    materialComponents: [],
    onChange: fn(),
  },
};

export const VerbalOnly: Story = {
  args: {
    components: {
      verbal: true,
      somatic: false,
      material: false,
    },
    materialComponents: [],
    onChange: fn(),
  },
};

export const VerbalSomatic: Story = {
  args: {
    components: {
      verbal: true,
      somatic: true,
      material: false,
    },
    materialComponents: [],
    onChange: fn(),
  },
};

export const AllComponents: Story = {
  args: {
    components: {
      verbal: true,
      somatic: true,
      material: true,
    },
    materialComponents: [],
    onChange: fn(),
  },
};

export const WithSingleMaterial: Story = {
  args: {
    components: {
      verbal: true,
      somatic: true,
      material: true,
    },
    materialComponents: [
      {
        name: "Bat guano",
        quantity: 1.0,
        isConsumed: false,
      },
    ],
    onChange: fn(),
  },
};

export const WithMultipleMaterials: Story = {
  args: {
    components: {
      verbal: true,
      somatic: true,
      material: true,
    },
    materialComponents: [
      {
        name: "Bat guano",
        quantity: 1.0,
        isConsumed: false,
      },
      {
        name: "Sulfur",
        quantity: 1.0,
        isConsumed: true,
        gpValue: 10,
      },
    ],
    onChange: fn(),
  },
};

export const WithComplexMaterial: Story = {
  args: {
    components: {
      verbal: true,
      somatic: true,
      material: true,
    },
    materialComponents: [
      {
        name: "Diamond",
        quantity: 1.0,
        isConsumed: true,
        gpValue: 1000,
        unit: "carat",
        description: "Must be worth at least 1000 gp",
      },
    ],
    onChange: fn(),
  },
};

export const WithQuantityGreaterThanOne: Story = {
  args: {
    components: {
      verbal: true,
      somatic: true,
      material: true,
    },
    materialComponents: [
      {
        name: "Crystal",
        quantity: 3.0,
        isConsumed: false,
        gpValue: 50,
      },
    ],
    onChange: fn(),
  },
};
