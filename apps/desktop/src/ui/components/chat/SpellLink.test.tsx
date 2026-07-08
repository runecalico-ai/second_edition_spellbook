// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { SpellLink } from "./SpellLink";

describe("SpellLink", () => {
  afterEach(cleanup);

  it("links to the spell editor route", () => {
    render(
      <MemoryRouter>
        <SpellLink id={42} name="Fireball" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("spell-link-fireball").getAttribute("href")).toBe("/edit/42");
  });

  it("renders inert text for invalid ids", () => {
    render(
      <MemoryRouter>
        <SpellLink id={0} name="Fireball" />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("spell-link-fireball")).toBeNull();
    expect(screen.getByLabelText("Spell reference unavailable: Fireball")).toBeTruthy();
  });
});
