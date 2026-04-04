import type { Meta, StoryObj } from "@storybook/react";
import { useLayoutEffect, type ComponentType, type ReactNode } from "react";
import { StructuredFieldInput } from "./StructuredFieldInput";
import { fn } from "./storybook-utils";

type StoryTheme = "light" | "dark";

function StoryThemeFrame({
  theme,
  children,
}: {
  theme: StoryTheme;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previousHasDarkClass = root.classList.contains("dark");
    const previousColorScheme = root.style.colorScheme;
    const previousTheme = root.dataset.theme;

    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
    root.dataset.theme = theme;

    return () => {
      root.classList.toggle("dark", previousHasDarkClass);
      root.style.colorScheme = previousColorScheme;
      if (previousTheme) {
        root.dataset.theme = previousTheme;
      } else {
        delete root.dataset.theme;
      }
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
};

const lightStory = {
  decorators: [withTheme("light")],
};

const meta = {
  title: "SpellEditor/StructuredFieldInput",
  component: StructuredFieldInput,
  parameters: {
    layout: "padded",
    backgrounds: {
      default: "light",
    },
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
      text: "10 ft",
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
      text: "10 yd + 5 yd/level",
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

export const RangeWithNotes: Story = {
  args: {
    fieldType: "range",
    value: {
      kind: "distance",
      distance: { mode: "fixed", value: 30 },
      unit: "ft",
      text: "30 ft",
      notes: "Range doubles outdoors in open terrain",
    },
    onChange: fn(),
  },
};

export const RangeWithNotesDark: Story = {
  ...darkStory,
  args: RangeWithNotes.args,
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
      text: "1 round",
    },
    onChange: fn(),
  },
};

export const DurationWithNotes: Story = {
  args: {
    fieldType: "duration",
    value: {
      kind: "time",
      unit: "round",
      duration: { mode: "fixed", value: 3 },
      text: "3 rounds",
      notes: "Duration halved in anti-magic field",
    },
    onChange: fn(),
  },
};

export const DurationWithNotesDark: Story = {
  ...darkStory,
  args: DurationWithNotes.args,
};

export const DurationTimePerLevel: Story = {
  args: {
    fieldType: "duration",
    value: {
      kind: "time",
      unit: "hour",
      duration: { mode: "per_level", value: 1, perLevel: 1 },
      text: "1 hr/level",
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
      text: "Special duration description",
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
      text: "1 minute",
      baseValue: 1,
      perLevel: 2,
      levelDivisor: 3,
      unit: "minute",
    },
    onChange: fn(),
  },
};

export const CastingTimeComplexDark: Story = {
  ...darkStory,
  args: CastingTimeComplex.args,
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

const visualGalleryPlaceholderArgs = {
  fieldType: "range" as const,
  value: { kind: "touch" as const },
  onChange: fn(),
};

export const VisualGallery: Story = {
  ...lightStory,
  args: visualGalleryPlaceholderArgs,
  render: () => (
    <div data-testid="structured-field-input-visual-gallery" className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Range
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <StructuredFieldInput
            fieldType="range"
            value={{
              kind: "distance",
              distance: { mode: "fixed", value: 30 },
              unit: "ft",
              text: "30 ft",
              notes: "Doubles outdoors in open terrain",
            }}
            onChange={fn()}
          />
          <StructuredFieldInput
            fieldType="range"
            value={{
              kind: "touch",
            }}
            onChange={fn()}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Duration
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <StructuredFieldInput
            fieldType="duration"
            value={{
              kind: "time",
              unit: "round",
              duration: { mode: "per_level", value: 1, perLevel: 1 },
              text: "1 round/level",
              notes: "Ends early if concentration is broken",
            }}
            onChange={fn()}
          />
          <StructuredFieldInput
            fieldType="duration"
            value={{
              kind: "conditional",
              condition: "Until dispelled or dismissed",
            }}
            onChange={fn()}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Casting Time
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <StructuredFieldInput
            fieldType="casting_time"
            value={{
              text: "1 minute",
              baseValue: 1,
              perLevel: 2,
              levelDivisor: 3,
              unit: "minute",
            }}
            onChange={fn()}
          />
          <StructuredFieldInput
            fieldType="casting_time"
            value={{
              text: "Special casting time",
              baseValue: 1,
              perLevel: 0,
              levelDivisor: 1,
              unit: "special",
              rawLegacyValue: "Special casting time",
            }}
            onChange={fn()}
          />
        </div>
      </section>
    </div>
  ),
};

export const VisualGalleryDark: Story = {
  ...darkStory,
  args: visualGalleryPlaceholderArgs,
  render: VisualGallery.render,
};
