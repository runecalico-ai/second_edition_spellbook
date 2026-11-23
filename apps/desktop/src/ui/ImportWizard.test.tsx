// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useImportActivity } from "../store/useImportActivity";
import ImportWizard, {
  detectImportFileType,
  hasLeadingYamlFrontMatter,
  isMarkdownSpellListContent,
  runWithImportActivity,
} from "./ImportWizard";

const mockInvoke = vi.fn();
const mockModalAlert = vi.fn(async () => {});
const mockModalConfirm = vi.fn(async () => true);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

vi.mock("../store/useModal", () => ({
  useModal: () => ({
    alert: mockModalAlert,
    confirm: mockModalConfirm,
  }),
}));

vi.mock("../api/vault", () => ({
  getVaultSettings: vi.fn(async () => ({ importSourceRefUrlPolicy: "drop-ref" })),
  setImportSourceRefUrlPolicy: vi.fn(async (policy: string) => ({
    importSourceRefUrlPolicy: policy,
  })),
}));

afterEach(() => {
  cleanup();
});

function createTestFile(name: string, content: string): File {
  const file = new File([content], name, {
    type: name.toLowerCase().endsWith(".json") ? "application/json" : "text/markdown",
  });
  if (typeof file.text !== "function") {
    Object.defineProperty(file, "text", {
      value: async () => content,
    });
  }
  if (typeof file.arrayBuffer !== "function") {
    const encoder = new TextEncoder();
    Object.defineProperty(file, "arrayBuffer", {
      value: async () => encoder.encode(content).buffer,
    });
  }
  return file;
}

describe("detectImportFileType", () => {
  it("returns json for all-.json files", () => {
    const files = [new File([], "a.json"), new File([], "b.JSON")];
    expect(detectImportFileType(files)).toBe("json");
  });

  it("returns markdown for all-.md files", () => {
    const files = [new File([], "a.md"), new File([], "b.md")];
    expect(detectImportFileType(files)).toBe("markdown");
  });

  it("returns markdown for all-.txt files", () => {
    const files = [new File([], "a.txt"), new File([], "b.txt")];
    expect(detectImportFileType(files)).toBe("markdown");
  });

  it("returns markdown for .pdf and .docx sidecar files", () => {
    const files = [new File([], "a.pdf"), new File([], "b.docx")];
    expect(detectImportFileType(files)).toBe("markdown");
  });

  it("returns mixed for a .json and .md combination", () => {
    const files = [new File([], "a.json"), new File([], "b.md")];
    expect(detectImportFileType(files)).toBe("mixed");
  });

  it("returns mixed for any partially-JSON selection", () => {
    const files = [new File([], "a.json"), new File([], "b.json"), new File([], "c.md")];
    expect(detectImportFileType(files)).toBe("mixed");
  });
});

describe("Markdown spell-list classification helpers", () => {
  it("detects closed YAML front matter including BOM, CRLF, and ... delimiters", () => {
    expect(hasLeadingYamlFrontMatter("---\nname: Fireball\n---\n\n## Effect\nBoom")).toBe(true);
    expect(hasLeadingYamlFrontMatter("\uFEFF---\r\nname: Wish\r\n...\r\nBody")).toBe(true);
    expect(hasLeadingYamlFrontMatter("---\nunclosed")).toBe(false);
    expect(hasLeadingYamlFrontMatter("## Spell Heading\n- Tradition: Arcane")).toBe(false);
  });

  it("excludes front-matter files and fenced headings from spell-list mode", () => {
    expect(isMarkdownSpellListContent("---\nname: Fireball\n---\n\n## Subheading\nDetails")).toBe(
      false,
    );
    expect(
      isMarkdownSpellListContent(
        "# Title\n```md\n## Ignored\n```\n~~~md\n## Also Ignored\n~~~\n### Review",
      ),
    ).toBe(false);
    expect(
      isMarkdownSpellListContent("# Preamble\n\n## Karsus's Avatar\n- Level: 12\n\nText"),
    ).toBe(true);
  });
});

describe("runWithImportActivity", () => {
  beforeEach(() => {
    useImportActivity.getState().reset();
  });

  it("marks import as active while work is pending", async () => {
    let resolveWork: (() => void) | undefined;
    const work = new Promise<void>((resolve) => {
      resolveWork = resolve;
    });

    const pending = runWithImportActivity(async () => {
      expect(useImportActivity.getState().isImportInProgress).toBe(true);
      await work;
    });

    expect(useImportActivity.getState().isImportInProgress).toBe(true);

    resolveWork?.();
    await pending;

    expect(useImportActivity.getState().isImportInProgress).toBe(false);
  });

  it("clears import activity when work throws", async () => {
    await expect(
      runWithImportActivity(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(useImportActivity.getState().isImportInProgress).toBe(false);
  });

  it("keeps import activity active until all overlapping work completes", async () => {
    let resolveFirst: (() => void) | undefined;
    let resolveSecond: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const second = new Promise<void>((resolve) => {
      resolveSecond = resolve;
    });

    const firstRun = runWithImportActivity(async () => {
      await first;
    });
    const secondRun = runWithImportActivity(async () => {
      await second;
    });

    expect(useImportActivity.getState().isImportInProgress).toBe(true);

    resolveFirst?.();
    await firstRun;

    expect(useImportActivity.getState().isImportInProgress).toBe(true);

    resolveSecond?.();
    await secondRun;

    expect(useImportActivity.getState().isImportInProgress).toBe(false);
  });
});

describe("ImportWizard routing and source-list IPC invocation", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockModalAlert.mockReset();
    mockModalConfirm.mockReset();
    mockModalConfirm.mockResolvedValue(true);
    useImportActivity.getState().reset();
  });

  it("routes single and multiple Markdown spell lists to preview_import_spell_json with markdownFiles", async () => {
    mockInvoke.mockResolvedValue({
      spells: [
        {
          spell: { name: "First Spell", level: 1, tradition: "ARCANE" },
          contentHash: "abc123",
          warnings: [],
        },
        {
          spell: { name: "Second Spell", level: 2, tradition: "DIVINE" },
          contentHash: "def456",
          warnings: [],
        },
      ],
      warnings: [],
      failures: [],
    });

    render(<ImportWizard />);
    const input = screen.getByTestId("import-file-input");

    const fileA = createTestFile(
      "book-a.md",
      "## First Spell\n- Tradition: Arcane\n- Level: 1\n- School: Evocation\n\nBody A.",
    );
    const fileB = createTestFile(
      "book-b.md",
      "## Second Spell\n- Tradition: Divine\n- Level: 2\n- Sphere: Healing\n\nBody B.",
    );

    fireEvent.change(input, { target: { files: [fileA, fileB] } });

    await waitFor(() => {
      expect(screen.getByTestId("btn-preview-import")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("btn-preview-import"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("preview_import_spell_json", {
        markdownFiles: [
          {
            name: "book-a.md",
            content:
              "## First Spell\n- Tradition: Arcane\n- Level: 1\n- School: Evocation\n\nBody A.",
          },
          {
            name: "book-b.md",
            content:
              "## Second Spell\n- Tradition: Divine\n- Level: 2\n- Sphere: Healing\n\nBody B.",
          },
        ],
        sourceRefUrlPolicy: "drop-ref",
      });
    });
  });

  it("keeps front-matter Markdown, headingless Markdown, .txt, .pdf, and .docx on the sidecar path", async () => {
    mockInvoke.mockResolvedValue({
      spells: [{ name: "Single Note", level: 1, description: "Body" }],
      artifacts: [],
      conflicts: [],
    });

    const cases = [
      createTestFile("single-fm.md", "---\nname: Single Note\n---\n\n## Sub\nBody"),
      createTestFile("plain.md", "# Plain Title\nNo level-2 spell headings here."),
      createTestFile("raw.txt", "## Looks Like Heading\nIgnored because txt"),
      createTestFile("tome.pdf", "PDF binary"),
      createTestFile("tome.docx", "DOCX binary"),
    ];

    for (const file of cases) {
      mockInvoke.mockClear();
      render(<ImportWizard />);
      const input = screen.getByTestId("import-file-input");
      fireEvent.change(input, { target: { files: [file] } });

      await waitFor(() => {
        expect(screen.getByTestId("btn-preview-import")).toBeTruthy();
      });

      fireEvent.click(screen.getByTestId("btn-preview-import"));

      await waitFor(() => {
        expect(mockInvoke).toHaveBeenCalledWith(
          "preview_import",
          expect.objectContaining({ files: expect.any(Array) }),
        );
      });
      expect(mockInvoke).not.toHaveBeenCalledWith("preview_import_spell_json", expect.anything());
      cleanup();
    }
  });

  it("rejects mixed Markdown spell-list and single-spell note selections", async () => {
    render(<ImportWizard />);
    const input = screen.getByTestId("import-file-input");

    const listMd = createTestFile(
      "list.md",
      "## First Spell\n- Tradition: Arcane\n- Level: 1\n- School: Evocation\n\nBody.",
    );
    const frontMatterMd = createTestFile("note.md", "---\nname: Single Note\n---\n\nBody.");

    fireEvent.change(input, { target: { files: [listMd, frontMatterMd] } });

    await waitFor(() => {
      expect(screen.getByTestId("file-type-error").textContent).toBe(
        "Cannot mix Markdown spell lists with single-spell notes. Please import spell lists separately from single-spell notes.",
      );
    });
    expect(screen.queryByTestId("btn-preview-import")).toBeNull();

    // Also rejects mixing a spell list with a .txt file
    const txtFile = createTestFile("notes.txt", "Some text");
    fireEvent.change(input, { target: { files: [listMd, txtFile] } });

    await waitFor(() => {
      expect(screen.getByTestId("file-type-error").textContent).toBe(
        "Cannot mix Markdown spell lists with single-spell notes. Please import spell lists separately from single-spell notes.",
      );
    });
  });

  it("reads only the first .json file when multiple JSON files are selected", async () => {
    mockInvoke.mockResolvedValue({
      spells: [{ spell: { name: "First JSON Spell", level: 1 }, contentHash: "h1", warnings: [] }],
      warnings: [],
      failures: [],
    });

    render(<ImportWizard />);
    const input = screen.getByTestId("import-file-input");

    const json1 = createTestFile("first.json", '{"spellscribe_version":"1.0.0","spells":[]}');
    const json2 = createTestFile("second.json", '{"should":"not be read"}');

    fireEvent.change(input, { target: { files: [json1, json2] } });

    await waitFor(() => {
      expect(screen.getByTestId("btn-preview-import")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("btn-preview-import"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("preview_import_spell_json", {
        payload: '{"spellscribe_version":"1.0.0","spells":[]}',
        sourceRefUrlPolicy: "drop-ref",
      });
    });
  });
});

describe("ImportWizard canonical preview and result UI (Task 5.2)", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockModalAlert.mockReset();
    mockModalConfirm.mockReset();
    mockModalConfirm.mockResolvedValue(true);
    useImportActivity.getState().reset();
  });

  it("renders Markdown preview heading, per-spell warnings, non-duplicate global warnings, and named failures", async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === "preview_import_spell_json") {
        return {
          spells: [
            {
              spell: {
                name: "Synthetic Ember",
                level: 1,
                tradition: "ARCANE",
                school: "Invocation/Evocation",
              },
              contentHash: "hash-ember",
              warnings: ["Needs review (flagged by source)", "Review note: Check range."],
            },
            {
              spell: {
                name: "Synthetic Ward",
                level: 3,
                tradition: "DIVINE",
                sphere: "Protection",
              },
              contentHash: "hash-ward",
              warnings: [],
            },
          ],
          warnings: [
            "Spell 'Synthetic Ember': Needs review (flagged by source)",
            "Spell 'Synthetic Ember': Review note: Check range.",
            "Dropped invalid SourceRef URL on Synthetic Ward",
          ],
          failures: [
            {
              spellName: "Synthetic Invalid Section",
              reason: "Spell 'Synthetic Invalid Section' (ARCANE) has no recognized school",
            },
          ],
        };
      }
      if (cmd === "import_spell_json") {
        return {
          importedCount: 2,
          duplicatesSkipped: { total: 0, mergedCount: 0, noChangeCount: 0 },
          conflicts: [],
          conflictsResolved: null,
          warnings: ["Review note carried to result"],
          failures: [
            {
              spellName: "Synthetic Invalid Section",
              reason: "Spell 'Synthetic Invalid Section' (ARCANE) has no recognized school",
            },
          ],
        };
      }
      return undefined;
    });

    render(<ImportWizard />);
    const input = screen.getByTestId("import-file-input");
    fireEvent.change(input, {
      target: {
        files: [createTestFile("list.md", "## Synthetic Ember\n- Level: 1\n\nBody.")],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("btn-preview-import")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("btn-preview-import"));

    await waitFor(() => {
      expect(screen.getByTestId("canonical-preview-summary").textContent).toBe(
        "Found 2 spell(s) in Markdown",
      );
    });
    expect(screen.getByText("2. Markdown Preview")).toBeTruthy();
    expect(screen.queryByTestId("high-level-magic-notice")).toBeNull();

    const spellsList = screen.getByTestId("canonical-preview-spells");
    expect(within(spellsList).getByText("Synthetic Ember")).toBeTruthy();
    expect(within(spellsList).getByText("Synthetic Ward")).toBeTruthy();

    const perSpellWarnings = screen.getByTestId("canonical-preview-spell-warnings");
    expect(perSpellWarnings.textContent).toContain("Needs review (flagged by source)");
    expect(perSpellWarnings.textContent).toContain("Review note: Check range.");

    const globalWarnings = screen.getByTestId("canonical-preview-warnings");
    expect(globalWarnings.textContent).toContain("Dropped invalid SourceRef URL on Synthetic Ward");
    expect(globalWarnings.textContent).not.toContain("Needs review (flagged by source)");

    const failuresBox = screen.getByTestId("canonical-preview-failures");
    expect(within(failuresBox).getByTestId("canonical-preview-failure-item").textContent).toContain(
      "Synthetic Invalid Section",
    );

    fireEvent.click(screen.getByTestId("btn-import-json"));

    await waitFor(() => {
      expect(screen.getByTestId("canonical-result-warnings").textContent).toContain(
        "Review note carried to result",
      );
    });
    expect(screen.getByTestId("canonical-result-failures").textContent).toContain(
      "Synthetic Invalid Section",
    );
  });

  it("displays JSON label and High-Level Magic notice for Level 10-12 or quest spells and honors session suppression", async () => {
    mockInvoke.mockResolvedValue({
      spells: [
        {
          spell: { name: "Karsus's Avatar", level: 12, tradition: "ARCANE" },
          contentHash: "hash-karsus",
          warnings: [],
        },
      ],
      warnings: [],
      failures: [],
    });

    render(<ImportWizard />);
    const input = screen.getByTestId("import-file-input");
    fireEvent.change(input, {
      target: {
        files: [createTestFile("epic.json", '{"spellscribe_version":"1.0.3","spells":[]}')],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("btn-preview-import")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("btn-preview-import"));

    await waitFor(() => {
      expect(screen.getByTestId("canonical-preview-summary").textContent).toBe(
        "Found 1 spell(s) in JSON",
      );
    });
    expect(screen.getByText("2. JSON Preview")).toBeTruthy();
    expect(screen.getByTestId("high-level-magic-notice")).toBeTruthy();

    fireEvent.click(screen.getByTestId("chk-suppress-high-level-warning"));
    fireEvent.click(screen.getByTestId("btn-dismiss-high-level-warning"));
    expect(screen.queryByTestId("high-level-magic-notice")).toBeNull();

    // Quest spell (isQuestSpell === 1) should stay suppressed in the same session after checkbox was checked
    mockInvoke.mockResolvedValueOnce({
      spells: [
        {
          spell: { name: "Quest Miracle", level: 8, tradition: "DIVINE", isQuestSpell: 1 },
          contentHash: "hash-quest",
          warnings: [],
        },
      ],
      warnings: [],
      failures: [],
    });
    fireEvent.click(screen.getByTestId("btn-back-to-select-json"));
    await waitFor(() => {
      expect(screen.getByTestId("btn-preview-import")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("btn-preview-import"));

    await waitFor(() => {
      expect(screen.getByTestId("canonical-preview-summary").textContent).toBe(
        "Found 1 spell(s) in JSON",
      );
    });
    expect(screen.queryByTestId("high-level-magic-notice")).toBeNull();
  });

  it("triggers High-Level Magic notice for Divine quest spells (isQuestSpell === 1)", async () => {
    mockInvoke.mockResolvedValue({
      spells: [
        {
          spell: { name: "Quest Miracle", level: 8, tradition: "DIVINE", isQuestSpell: 1 },
          contentHash: "hash-quest",
          warnings: [],
        },
      ],
      warnings: [],
      failures: [],
    });

    render(<ImportWizard />);
    fireEvent.change(screen.getByTestId("import-file-input"), {
      target: {
        files: [createTestFile("quest.md", "## Quest Miracle\n- Level: quest\n\nBody.")],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("btn-preview-import")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("btn-preview-import"));

    await waitFor(() => {
      expect(screen.getByTestId("high-level-magic-notice")).toBeTruthy();
    });
  });
});
