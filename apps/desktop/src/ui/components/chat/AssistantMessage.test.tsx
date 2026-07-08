// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AssistantMessage } from "./AssistantMessage";

describe("AssistantMessage", () => {
  afterEach(cleanup);
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

  it("matches spell names case-insensitively", () => {
    render(
      <MemoryRouter>
        <AssistantMessage
          messageId="a2"
          content="You could cast fireball on the goblins."
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
    expect(link.textContent).toBe("Fireball");
  });

  it("renders the streaming cursor and defers spell links while streaming", () => {
    render(
      <MemoryRouter>
        <AssistantMessage
          messageId="a3"
          content="Try Fireball for area damage."
          searchTerms={["fireball"]}
          groundedSpells={[
            { id: 42, name: "Fireball", level: 3, descriptionSnippet: "Explosion." },
          ]}
          isStreaming={true}
        />
      </MemoryRouter>,
    );

    const bubble = screen.getByTestId("chat-assistant-bubble");
    expect(bubble.querySelector('[aria-hidden="true"]')).not.toBeNull();
    // Links are deferred until the stream completes.
    expect(screen.queryByTestId("spell-link-fireball")).toBeNull();
    expect(bubble.textContent).toContain("Try Fireball for area damage.");
  });

  it("renders plain text with no links when groundedSpells is empty", () => {
    render(
      <MemoryRouter>
        <AssistantMessage
          messageId="a4"
          content="Fireball is a classic spell."
          searchTerms={["fireball"]}
          groundedSpells={[]}
          isStreaming={false}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("spell-link-fireball")).toBeNull();
    expect(screen.getByTestId("chat-assistant-bubble").textContent).toContain(
      "Fireball is a classic spell.",
    );
  });

  it("hides the grounded-in indicator when searchTerms is empty", () => {
    render(
      <MemoryRouter>
        <AssistantMessage
          messageId="a5"
          content="Try Fireball for area damage."
          searchTerms={[]}
          groundedSpells={[
            { id: 42, name: "Fireball", level: 3, descriptionSnippet: "Explosion." },
          ]}
          isStreaming={false}
        />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("grounded-in-indicator")).toBeNull();
    // Segmentation still links the spell even without search terms.
    expect(screen.getByTestId("spell-link-fireball")).not.toBeNull();
  });
});
