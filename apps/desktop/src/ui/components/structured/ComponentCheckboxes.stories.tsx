import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, type ComponentType, type ReactNode } from "react";
import { ComponentCheckboxes } from "./ComponentCheckboxes";
import { fn } from "./storybook-utils";

type StoryTheme = "light" | "dark";

function StoryThemeFrame({
  theme,
  children,
}: {
  theme: StoryTheme;
  children: ReactNode;
}) {
  useEffect(() => {
    const root = document.documentElement;
    const previousHasDarkClass = root.classList.contains("dark");
    const previousColorScheme = root.style.colorScheme;

    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;

    return () => {
      root.classList.toggle("dark", previousHasDarkClass);
      root.style.colorScheme = previousColorScheme;
    };
  }, [theme]);

  return (
    <div className={theme === "dark" ? "dark rounded-2xl bg-neutral-950 p-4" : "rounded-2xl bg-white p-4"}>
      <div className="max-w-4xl">{children}</div>
    </div>
  );
}

const withTheme =
  (theme: StoryTheme) =>
  (Story: ComponentType) => (
    <StoryThemeFrame theme={theme}>
      <Story />
    </StoryThemeFrame>
  );

const darkStory = {
  parameters: {
    backgrounds: {
      default: "dark",
    },
  },
  decorators: [withTheme("dark")],
} as const;

const meta = {
  title: "SpellEditor/ComponentCheckboxes",
  component: ComponentCheckboxes,
  parameters: {
    layout: "padded",
    backgrounds: {
      default: "light",
    },
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
      focus: false,
      divineFocus: false,
      experience: false,
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
      focus: false,
      divineFocus: false,
      experience: false,
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
      focus: false,
      divineFocus: false,
      experience: false,
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
      focus: false,
      divineFocus: false,
      experience: false,
    },
    materialComponents: [],
    onChange: fn(),
  },
};

export const AllVariant: Story = {
  args: {
    variant: "all",
    components: {
      verbal: true,
      somatic: true,
      material: true,
      focus: true,
      divineFocus: true,
      experience: true,
    },
    materialComponents: [
      {
        name: "Diamond dust",
        quantity: 1.0,
        isConsumed: true,
        gpValue: 100,
      },
    ],
    onChange: fn(),
  },
};

export const AllVariantDark: Story = {
  ...darkStory,
  args: AllVariant.args,
};

export const WithSingleMaterial: Story = {
  args: {
    components: {
      verbal: true,
      somatic: true,
      material: true,
      focus: false,
      divineFocus: false,
      experience: false,
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
      focus: false,
      divineFocus: false,
      experience: false,
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
      focus: false,
      divineFocus: false,
      experience: false,
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
      focus: false,
      divineFocus: false,
      experience: false,
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
