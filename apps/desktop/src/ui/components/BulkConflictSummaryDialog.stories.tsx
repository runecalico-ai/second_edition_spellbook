import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "storybook/test";
import BulkConflictSummaryDialog from "./BulkConflictSummaryDialog";
import { fn } from "./structured/storybook-utils";

const meta = {
    title: "Import/BulkConflictSummaryDialog",
    component: BulkConflictSummaryDialog,
    parameters: {
        layout: "padded",
    },
    tags: ["autodocs"],
} satisfies Meta<typeof BulkConflictSummaryDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Visual stories
// ---------------------------------------------------------------------------

/** Exactly the threshold: 10 conflicts — minimum to show the bulk dialog. */
export const TenConflicts: Story = {
    args: {
        conflictCount: 10,
        onAction: fn(),
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText(/Found 10 conflicts/)).toBeVisible();
    },
};

/** Large count: 47 conflicts — verifies large numbers render correctly. */
export const ManyConflicts: Story = {
    args: {
        conflictCount: 47,
        onAction: fn(),
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText(/Found 47 conflicts/)).toBeVisible();
    },
};

// ---------------------------------------------------------------------------
// Interaction stories — verify all four buttons are present and clickable
// ---------------------------------------------------------------------------

/** All four action buttons are visible. */
export const AllButtonsPresent: Story = {
    args: {
        conflictCount: 12,
        onAction: fn(),
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByTestId("btn-bulk-skip-all")).toBeVisible();
        await expect(canvas.getByTestId("btn-bulk-replace-all")).toBeVisible();
        await expect(canvas.getByTestId("btn-bulk-keep-all")).toBeVisible();
        await expect(canvas.getByTestId("btn-bulk-review-each")).toBeVisible();
    },
};

/** Skip All button is clickable and present. */
export const ClickSkipAll: Story = {
    args: {
        conflictCount: 10,
        onAction: fn(),
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const btn = canvas.getByTestId("btn-bulk-skip-all");
        await expect(btn).toBeVisible();
        await userEvent.click(btn);
    },
};

/** Review Each button is clickable and present. */
export const ClickReviewEach: Story = {
    args: {
        conflictCount: 10,
        onAction: fn(),
    },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const btn = canvas.getByTestId("btn-bulk-review-each");
        await expect(btn).toBeVisible();
        await userEvent.click(btn);
    },
};
