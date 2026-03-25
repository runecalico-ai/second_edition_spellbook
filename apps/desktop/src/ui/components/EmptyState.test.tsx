// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyState, EmptyStateLiveRegion } from "./EmptyState";

afterEach(() => {
  cleanup();
});

describe("EmptyState", () => {
  it("renders visible empty-state content without status semantics on the container", () => {
    render(<EmptyState heading="No Spells Yet" description="Library is empty." />);

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByTestId("empty-state")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "No Spells Yet" })).not.toBeNull();
  });

  it("renders a persistent polite live region that updates only when active", () => {
    render(
      <EmptyStateLiveRegion
        heading="No Spells Added"
        description="This character's spellbook is empty."
        testId="empty-character-spellbook-state"
        active={false}
      />,
    );

    const liveRegion = screen.getByTestId("empty-character-spellbook-state-live-region");
    expect(liveRegion.getAttribute("role")).toBe("status");
    expect(liveRegion.getAttribute("aria-live")).toBe("polite");
    expect(liveRegion.textContent).toBe("");
  });

  it("announces the heading and description together when active", () => {
    render(
      <EmptyStateLiveRegion
        heading="No Spells Added"
        description="This character's spellbook is empty."
        testId="empty-character-spellbook-state"
        active
      />,
    );

    expect(screen.getByTestId("empty-character-spellbook-state-live-region").textContent).toBe(
      "No Spells Added. This character's spellbook is empty.",
    );
  });

  it("keeps the last announcement stable during short inactive cycles and updates when the message changes", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <EmptyStateLiveRegion
          heading="No Results"
          description="No spells match your current search or filters."
          testId="library-empty-state"
          active
        />,
      );

      const liveRegion = screen.getByTestId("library-empty-state-live-region");
      expect(liveRegion.textContent).toBe(
        "No Results. No spells match your current search or filters.",
      );

      rerender(
        <EmptyStateLiveRegion
          heading="No Results"
          description="No spells match your current search or filters."
          testId="library-empty-state"
          active={false}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(liveRegion.textContent).toBe(
        "No Results. No spells match your current search or filters.",
      );

      rerender(
        <EmptyStateLiveRegion
          heading="No Results"
          description="No spells match your current search or filters."
          testId="library-empty-state"
          active
        />,
      );

      expect(liveRegion.textContent).toBe(
        "No Results. No spells match your current search or filters.",
      );

      rerender(
        <EmptyStateLiveRegion
          heading="No Spells Yet"
          description="Your spell library is empty. Create your first spell or import spells from a file."
          testId="library-empty-state"
          active
        />,
      );

      expect(liveRegion.textContent).toBe(
        "No Spells Yet. Your spell library is empty. Create your first spell or import spells from a file.",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-announces the same message after the empty state has been inactive long enough to reset", () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <EmptyStateLiveRegion
          heading="No Results"
          description="No spells match your current search or filters."
          testId="library-empty-state"
          active
        />,
      );

      const liveRegion = screen.getByTestId("library-empty-state-live-region");
      expect(liveRegion.textContent).toBe(
        "No Results. No spells match your current search or filters.",
      );

      rerender(
        <EmptyStateLiveRegion
          heading="No Results"
          description="No spells match your current search or filters."
          testId="library-empty-state"
          active={false}
        />,
      );

      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(liveRegion.textContent).toBe("");

      rerender(
        <EmptyStateLiveRegion
          heading="No Results"
          description="No spells match your current search or filters."
          testId="library-empty-state"
          active
        />,
      );

      expect(liveRegion.textContent).toBe(
        "No Results. No spells match your current search or filters.",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders heading at the default level (h2)", () => {
    const html = renderToStaticMarkup(
      <EmptyState heading="No spells found" description="Add a spell to get started." />,
    );
    expect(html).toContain("<h2");
  });

  it("renders heading at a custom level (h3)", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        heading="No spells found"
        description="Add a spell to get started."
        headingLevel="h3"
      />,
    );
    expect(html).toContain("<h3");
  });

  it("renders the heading text", () => {
    const html = renderToStaticMarkup(
      <EmptyState heading="No spells found" description="Add a spell to get started." />,
    );
    expect(html).toContain("No spells found");
  });

  it("renders the description text", () => {
    const html = renderToStaticMarkup(
      <EmptyState heading="No spells found" description="Add a spell to get started." />,
    );
    expect(html).toContain("Add a spell to get started.");
  });

  it("renders without children (no CTA wrapper div)", () => {
    const html = renderToStaticMarkup(
      <EmptyState heading="No spells found" description="Add a spell to get started." />,
    );
    expect(html).not.toContain('class="flex gap-3 flex-wrap justify-center"');
  });

  it("renders with children (CTA wrapper div present)", () => {
    const html = renderToStaticMarkup(
      <EmptyState heading="No spells found" description="Add a spell to get started.">
        <button type="button">Add Spell</button>
      </EmptyState>,
    );
    expect(html).toContain('class="flex gap-3 flex-wrap justify-center"');
  });

  it("applies the default data-testid", () => {
    const html = renderToStaticMarkup(
      <EmptyState heading="No spells found" description="Add a spell to get started." />,
    );
    expect(html).toContain('data-testid="empty-state"');
  });

  it("applies a custom testId override", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        heading="No spells found"
        description="Add a spell to get started."
        testId="empty-library-state"
      />,
    );
    expect(html).toContain('data-testid="empty-library-state"');
  });
});
