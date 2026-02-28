import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { DamageDetail } from "./DamageDetail";

const meta = {
  title: "SpellDetail/DamageDetail",
  component: DamageDetail,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof DamageDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Q1 required scenarios
// ---------------------------------------------------------------------------

/** kind="none" → renders null; damage-detail testid must be absent */
export const KindNone: Story = {
  args: {
    spec: { kind: "none" },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId("damage-detail")).not.toBeInTheDocument();
  },
};

/** kind="modeled" with algebraic parts → formula and type rendered */
export const ModeledWithParts: Story = {
  args: {
    spec: {
      kind: "modeled",
      combineMode: "sum",
      parts: [
        {
          id: "part_fire",
          damageType: "fire",
          base: { terms: [{ count: 2, sides: 6 }], flatModifier: 0 },
          application: { scope: "per_target" },
          save: { kind: "none" },
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("damage-formula-0")).toHaveTextContent("2d6");
    await expect(canvas.getByTestId("damage-type-0")).toHaveTextContent("Fire");
  },
};

/** Fallback to sourceText when no algebraic parts (modeled with empty parts) */
export const FallbackToSourceText: Story = {
  args: {
    spec: {
      kind: "modeled",
      parts: [],
      sourceText: "1d6 fire damage per level, max 10d6",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId("damage-formula-0")).not.toBeInTheDocument();
    await expect(canvas.getByTestId("damage-source-text")).toHaveTextContent(
      "1d6 fire damage per level, max 10d6",
    );
  },
};

/** Fallback to dmGuidance when sourceText absent (v1 backward-compat) */
export const FallbackToDmGuidance: Story = {
  args: {
    spec: {
      kind: "dm_adjudicated",
      dmGuidance: "Damage determined by DM based on target's vulnerability",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId("damage-formula-0")).not.toBeInTheDocument();
    await expect(canvas.getByTestId("damage-source-text")).toHaveTextContent(
      "Damage determined by DM based on target's vulnerability",
    );
  },
};

// ---------------------------------------------------------------------------
// Visual stories
// ---------------------------------------------------------------------------

export const NullSpec: Story = {
  args: { spec: null },
};

export const ModeledMultipleParts: Story = {
  args: {
    spec: {
      kind: "modeled",
      combineMode: "sum",
      parts: [
        {
          id: "part_fire",
          damageType: "fire",
          base: { terms: [{ count: 1, sides: 6 }], flatModifier: 3 },
          application: { scope: "per_target" },
          save: { kind: "half" },
        },
        {
          id: "part_cold",
          damageType: "cold",
          base: { terms: [{ count: 1, sides: 4 }], flatModifier: 0 },
          application: { scope: "per_target" },
          save: { kind: "none" },
        },
      ],
      notes: "Roll separately for each damage type",
    },
  },
};

export const ModeledWithNotes: Story = {
  args: {
    spec: {
      kind: "modeled",
      parts: [
        {
          id: "part_neg",
          damageType: "negative_energy",
          base: { terms: [{ count: 1, sides: 8 }], flatModifier: 0 },
          application: { scope: "per_target" },
          save: { kind: "none" },
          label: "drain",
        },
      ],
      notes: "Undead are healed instead",
    },
  },
};
