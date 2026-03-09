import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import SpellConflictDiffDialog from "./SpellConflictDiffDialog";
import { fn } from "./structured/storybook-utils";

const meta = {
  title: "Import/SpellConflictDiffDialog",
  component: SpellConflictDiffDialog,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  decorators: [
    (Story: React.ComponentType) => (
      <div className="max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SpellConflictDiffDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const SHA_A = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const SHA_B = "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3";

const baseConflict = {
  existingId: 1,
  existingName: "Fireball",
  existingContentHash: SHA_A,
  incomingName: "Fireball",
  incomingContentHash: SHA_B,
};

// ---------------------------------------------------------------------------
// Visual stories
// ---------------------------------------------------------------------------

/** Baseline: conflict 1 of 3 with both hashes present. */
export const Default: Story = {
  args: {
    conflict: baseConflict,
    conflictIndex: 0,
    totalConflicts: 3,
    onResolve: fn(),
  },
};

/** existingContentHash is null — existing spell not yet migrated to v2. */
export const NoExistingHash: Story = {
  args: {
    conflict: {
      ...baseConflict,
      existingContentHash: null,
    },
    conflictIndex: 0,
    totalConflicts: 1,
    onResolve: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Not yet migrated")).toBeVisible();
  },
};

/** Progress badge: first of many — verifies "Conflict 1 of 15". */
export const FirstOfMany: Story = {
  args: {
    conflict: baseConflict,
    conflictIndex: 0,
    totalConflicts: 15,
    onResolve: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("conflict-progress")).toHaveTextContent("Conflict 1 of 15");
  },
};

/** Last conflict: "Conflict 15 of 15". */
export const LastOfMany: Story = {
  args: {
    conflict: baseConflict,
    conflictIndex: 14,
    totalConflicts: 15,
    onResolve: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("conflict-progress")).toHaveTextContent("Conflict 15 of 15");
  },
};

/** Hash abbreviation: long SHA-256 hashes are truncated to 16 chars + ellipsis. */
export const HashAbbreviation: Story = {
  args: {
    conflict: baseConflict,
    conflictIndex: 0,
    totalConflicts: 1,
    onResolve: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The full 64-char SHA is shown only in title attribute — display shows 16 chars + "…"
    const hashEl = canvas.getAllByText(/e3b0c44298fc1c14…/);
    await expect(hashEl[0]).toBeVisible();
  },
};

/** Apply to All: toggling the checkbox then clicking a resolution button. */
export const ApplyToAllFlow: Story = {
  args: {
    conflict: baseConflict,
    conflictIndex: 0,
    totalConflicts: 5,
    onResolve: fn(),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByTestId("toggle-apply-to-all");

    // Initially unchecked
    await expect(toggle).not.toBeChecked();

    // Check it
    await userEvent.click(toggle);
    await expect(toggle).toBeChecked();

    // All three resolution buttons should still be present
    await expect(canvas.getByTestId("btn-keep-existing-json")).toBeVisible();
    await expect(canvas.getByTestId("btn-replace-with-new")).toBeVisible();
    await expect(canvas.getByTestId("btn-keep-both")).toBeVisible();
  },
};
