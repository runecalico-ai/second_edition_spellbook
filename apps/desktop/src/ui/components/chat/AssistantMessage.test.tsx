// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AssistantMessage } from "./AssistantMessage";

describe("AssistantMessage", () => {
  it("renders spell names as links to the editor route", () => {
    render(
      <MemoryRouter>
        <AssistantMessage
          messageId="a1"
          content="Try Fireball for area damage."
          searchTerms={["fireball"]}
          groundedSpells={[
            { id: 42, name: "Fireball", level: 3, descriptionSnippet: "Explosion." },
          ]}
          isStreaming={false}
        />
      </MemoryRouter>,
    );

    const link = screen.getByTestId("spell-link-fireball");
    expect(link.getAttribute("href")).toBe("/edit/42");
    expect(screen.getByTestId("grounded-in-indicator").textContent).toContain("fireball");
  });
});
