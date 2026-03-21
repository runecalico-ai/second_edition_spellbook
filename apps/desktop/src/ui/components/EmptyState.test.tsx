// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

afterEach(() => {
  cleanup();
});

describe("EmptyState", () => {
  it("announces by default", () => {
    render(<EmptyState heading="No Spells Yet" description="Library is empty." />);

    const status = screen.getByRole("status");
    expect(status.getAttribute("data-testid")).toBe("empty-state");
    expect(screen.getByRole("heading", { name: "No Spells Yet" })).not.toBeNull();
  });

  it("suppresses the live region when announce is false", () => {
    render(
      <EmptyState
        heading="No Spells Added"
        description="This character's spellbook is empty."
        announce={false}
        testId="empty-character-spellbook-state"
      />,
    );

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByTestId("empty-character-spellbook-state")).not.toBeNull();
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
