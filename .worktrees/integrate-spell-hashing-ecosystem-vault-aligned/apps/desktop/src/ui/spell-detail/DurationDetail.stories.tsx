import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { DurationDetail } from "./DurationDetail";

const meta = {
  title: "SpellDetail/DurationDetail",
  component: DurationDetail,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof DurationDetail>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Q1 required scenarios
// ---------------------------------------------------------------------------

/** spec.text preferred over rawLegacyValue and synthesis */
export const TextPreferred: Story = {
  args: {
    spec: {
      kind: "time",
      text: "1 turn",
      rawLegacyValue: "1 round (from rawLegacy)",
      unit: "round",
      duration: { mode: "fixed", value: 999 },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("duration-detail-text")).toHaveTextContent("1 turn");
  },
};

/** rawLegacyValue used when spec.text absent */
export const FallbackToRawLegacy: Story = {
  args: {
    spec: {
      kind: "special",
      rawLegacyValue: "Until dispelled or 1 round/level",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("duration-detail-text")).toHaveTextContent(
      "Until dispelled or 1 round/level",
    );
  },
};

/**
 * Synthesis from structured fields: kind="time" with unit and duration
 * → durationToText returns "1 round"
 */
export const SynthesisFromStructuredFields: Story = {
  args: {
    spec: {
      kind: "time",
      unit: "round",
      duration: { mode: "fixed", value: 1 },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("duration-detail-text")).toHaveTextContent("1 round");
  },
};

/** "—" when spec is null/undefined */
export const NullSpec: Story = {
  args: { spec: null },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("duration-detail-empty")).toHaveTextContent("—");
    await expect(canvas.queryByTestId("duration-detail")).not.toBeInTheDocument();
  },
};

/**
 * F1 fix: kind="conditional" with condition="" — empty string is falsy so
 * hasStructuredFields returns false → synthesis skipped → falls back to "—"
 */
export const F1EmptyConditionNoSynthesis: Story = {
  args: {
    spec: {
      kind: "conditional",
      condition: "",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // displayText should be "—" because condition="" is falsy → no synthesis, no rawLegacyValue
    await expect(canvas.getByTestId("duration-detail-text")).toHaveTextContent("—");
  },
};

/** Notes field renders when present */
export const WithNotes: Story = {
  args: {
    spec: {
      kind: "time",
      text: "3 rounds/level",
      notes: "Ends early if caster is incapacitated",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("duration-detail-notes")).toHaveTextContent(
      "Ends early if caster is incapacitated",
    );
  },
};

// ---------------------------------------------------------------------------
// Visual stories
// ---------------------------------------------------------------------------

export const Instant: Story = {
  args: { spec: { kind: "instant" } },
};

export const Permanent: Story = {
  args: { spec: { kind: "permanent" } },
};

export const Concentration: Story = {
  args: { spec: { kind: "concentration" } },
};

export const PerLevel: Story = {
  args: {
    spec: {
      kind: "time",
      unit: "round",
      duration: { mode: "per_level", perLevel: 1 },
    },
  },
};
