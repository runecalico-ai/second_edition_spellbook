import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ArtifactRow from "./ArtifactRow";
import type { SpellArtifact } from "../../types/spell";

const BASE: SpellArtifact = {
  id: 1,
  spellId: 1,
  type: "source",
  path: "a.md",
  hash: "abc123",
  importedAt: "2026-01-01T00:00:00Z",
};

describe("ArtifactRow", () => {
  it("shows not-hash-verified badge when spellContentHash is null", () => {
    const html = renderToStaticMarkup(
      <ArtifactRow artifact={{ ...BASE, spellContentHash: null }} />,
    );
    expect(html).toContain('data-testid="artifact-not-hash-verified"');
  });

  it("hides not-hash-verified badge when spellContentHash is set", () => {
    const html = renderToStaticMarkup(
      <ArtifactRow artifact={{ ...BASE, spellContentHash: "deadbeef" }} />,
    );
    expect(html).not.toContain('data-testid="artifact-not-hash-verified"');
  });

  it("shows not-hash-verified badge when spellContentHash is undefined (no hash column in backend)", () => {
    const html = renderToStaticMarkup(<ArtifactRow artifact={BASE} />);
    expect(html).toContain('data-testid="artifact-not-hash-verified"');
  });
});
