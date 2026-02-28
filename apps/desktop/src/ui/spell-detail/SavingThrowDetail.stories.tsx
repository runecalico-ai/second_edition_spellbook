import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { SavingThrowDetail } from "./SavingThrowDetail";

const meta = {
  title: "SpellDetail/SavingThrowDetail",
  component: SavingThrowDetail,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof SavingThrowDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Q1 required scenarios
// ---------------------------------------------------------------------------

/** kind="none" → renders nothing; saving-throw-detail testid must be absent */
export const KindNone: Story = {
  args: {
    spec: { kind: "none" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId("saving-throw-detail")).not.toBeInTheDocument();
  },
};

/** kind="single" with rawLegacyValue → collapsible annotation present */
export const SingleWithLegacy: Story = {
  args: {
    spec: {
      kind: "single",
      single: {
        id: "s1",
        saveType: "spell",
        onSuccess: { result: "no_effect" },
        onFailure: { result: "full_effect" },
      },
      rawLegacyValue: "Save vs. Spell",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("saving-throw-detail")).toBeInTheDocument();
    await expect(canvas.getByTestId("saving-throw-legacy-collapsible")).toBeInTheDocument();
    await expect(canvas.getByTestId("saving-throw-raw-legacy")).toHaveTextContent("Save vs. Spell");
  },
};

/** kind="dm_adjudicated" without rawLegacyValue → shows "DM adjudicated" fallback text */
export const DmAdjudicatedWithoutLegacy: Story = {
  args: {
    spec: { kind: "dm_adjudicated" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("saving-throw-dm-adjudicated")).toHaveTextContent(
      "DM adjudicated",
    );
  },
};

/** kind="dm_adjudicated" with rawLegacyValue → shows the raw value, not the fallback text */
export const DmAdjudicatedWithLegacy: Story = {
  args: {
    spec: {
      kind: "dm_adjudicated",
      rawLegacyValue: "DM determines save type",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("saving-throw-dm-adjudicated")).toHaveTextContent(
      "DM determines save type",
    );
  },
};

/** notes always renders when present */
export const SingleWithNotes: Story = {
  args: {
    spec: {
      kind: "single",
      single: {
        id: "s2",
        saveType: "breath_weapon",
        onSuccess: { result: "reduced_effect" },
        onFailure: { result: "full_effect" },
      },
      notes: "Modified by target's magic resistance",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("saving-throw-notes")).toHaveTextContent(
      "Modified by target's magic resistance",
    );
  },
};

// ---------------------------------------------------------------------------
// Visual / documentation stories (no play assertions)
// ---------------------------------------------------------------------------

export const NullSpec: Story = {
  args: { spec: undefined },
};

export const Multiple: Story = {
  args: {
    spec: {
      kind: "multiple",
      multiple: [
        {
          id: "first",
          saveType: "spell",
          onSuccess: { result: "no_effect" },
          onFailure: { result: "full_effect" },
        },
        {
          id: "second",
          saveType: "paralyzation_poison_death",
          onSuccess: { result: "reduced_effect" },
          onFailure: { result: "full_effect" },
        },
      ],
      rawLegacyValue: "Save vs. Spell or Poison",
    },
  },
};
