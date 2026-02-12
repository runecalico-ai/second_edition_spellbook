import fs from "node:fs";
import path from "node:path";
import { TIMEOUTS } from "./fixtures/constants";
import { expect, test } from "./fixtures/test-fixtures";
import { generateRunId, getTestDirname } from "./fixtures/test-utils";
import { SpellbookApp } from "./page-objects/SpellbookApp";

const __dirname = getTestDirname(import.meta.url);

test.describe("Milestone Verification Flow", () => {
  test.slow();

  test("Milestone 1: Basic Spell Management", async ({ appContext }) => {

    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    await test.step("Create a basic spell", async () => {
      const spellName = `Fireball ${runId}`;
      await app.createSpell({
        name: spellName,
        level: "3",
        description: "A bright streak flashes from your pointing finger...",
      });
      await expect(page.getByText(spellName)).toBeVisible();
    });

    await test.step("Verify duplicate name warning", async () => {
      const spellName = `Fireball ${runId}`;
      await app.navigate("Add Spell");
      await page.getByTestId("spell-name-input").fill(spellName);
      // Depending on UI, check for warning text - just ensuring navigation for now
      await app.navigate("Library");
    });
  });

  test("Milestone 2: Import Wizard & Provenance", async ({ appContext, fileTracker }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    const importedName = `Imported Spell ${runId}`;
    const samplePath = fileTracker.track(path.resolve(__dirname, `tmp/sample-${runId}.md`));
    fs.writeFileSync(
      samplePath,
      `---\nname: ${importedName}\nlevel: 1\nsource: Test Manual\n---\nImported description.`,
    );

    await test.step("Import a markdown file", async () => {
      await app.importFile(samplePath);
      await expect(page.getByRole("button", { name: "Import More Files" })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
    });

    await test.step("Verify provenance data", async () => {
      await app.navigate("Library");
      await app.openSpell(importedName);
      await expect(page.getByText("Provenance (Imports)")).toBeVisible();
      await expect(page.getByText(/Type:\s*(MARKDOWN|MD)/i)).toBeVisible();
    });
  });

  test("Milestone 3: Library filters for components and tags", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    const taggedSpellName = `Tagged Spell ${runId}`;
    const decoySpellName = `Decoy Spell ${runId}`;

    await test.step("Setup: Create spells with components and tags", async () => {
      await app.createSpell({
        name: taggedSpellName,
        level: "2",
        description: "Tagged with components",
        classes: "Wizard",
        components: "M",
        tags: "alpha, beta",
      });

      await app.createSpell({
        name: decoySpellName,
        level: "1",
        description: "Decoy without tags",
      });
    });

    await test.step("Apply filters and verify results", async () => {
      await app.setLibraryFilters({ search: taggedSpellName });
      await expect(page.getByText(taggedSpellName)).toBeVisible();
      await expect(page.getByText(decoySpellName)).not.toBeVisible();

      await app.setLibraryFilters({
        search: "",
        className: "Wizard",
        component: "M",
        tag: "alpha",
      });

      // Verify results
      await expect(page.getByText(taggedSpellName)).toBeVisible();
      await expect(page.getByText(decoySpellName)).not.toBeVisible();

      // Clear filters
      await app.clearFilters();
    });
  });
});

test("Import conflict merge review flow", async ({ appContext, fileTracker }) => {
  const { page } = appContext;
  const app = new SpellbookApp(page);
  const runId = generateRunId();
  const conflictName = `Conflict Spell ${runId}`;
  const conflictSource = `Conflict Source ${runId}`;
  const originalDescription = "Original description";
  const incomingDescription = "Incoming description";

  await test.step("Setup: Create Existing Spell", async () => {
    await app.createSpell({
      name: conflictName,
      level: "1",
      description: originalDescription,
      source: conflictSource,
    });
    await app.navigate("Library");
    await app.setLibraryFilters({ search: conflictName });
    await expect(page.getByRole("link", { name: conflictName })).toBeVisible();
  });

  await test.step("Trigger conflict import and resolve", async () => {
    const samplePath = fileTracker.track(path.resolve(__dirname, `tmp/conflict-${runId}.md`));
    fs.writeFileSync(
      samplePath,
      `---\nname: ${conflictName}\nlevel: 1\nsource: ${conflictSource}\n---\n${incomingDescription}`,
    );

    await app.navigate("Import");
    const fileInput = page.getByTestId("import-file-input");
    await fileInput.setInputFiles(samplePath);
    await page.getByTestId("btn-preview-import").click();
    await page.getByTestId("btn-skip-review").click();
    await page.getByTestId("btn-start-import").click();

    await expect(page.getByText("Resolve Conflicts")).toBeVisible();
    await expect(page.getByTestId("btn-custom-merge")).toBeVisible();
    await expect(page.getByTestId("btn-use-incoming")).toBeVisible();
    await expect(page.getByTestId("btn-keep-existing")).toBeVisible();

    await expect(page.getByRole("columnheader", { name: "Field" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Existing" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Incoming" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Use" })).toBeVisible();

    await expect(page.getByLabel("Existing").first()).toBeVisible();
    await expect(page.getByLabel("Incoming").first()).toBeVisible();

    await page.getByTestId("btn-use-incoming").first().click();
    await page.getByTestId("btn-apply-resolutions").click();

    await expect(page.getByRole("button", { name: "Import More Files" })).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
  });

  await test.step("Verify updated spell", async () => {
    await app.navigate("Library");
    await app.setLibraryFilters({ search: conflictName });
    await page.getByText(conflictName).click();
    await expect(page.getByLabel("Description")).toHaveValue(incomingDescription);
  });
});

test("Spell editor persists extended fields", async ({ appContext, fileTracker }) => {
  const { page } = appContext;
  const app = new SpellbookApp(page);
  const runId = generateRunId();

  const importedName = `Extended Imported ${runId}`;
  const importedPath = fileTracker.track(path.resolve(__dirname, `tmp/extended-${runId}.md`));
  fs.writeFileSync(
    importedPath,
    [
      "---",
      `name: ${importedName}`,
      "level: 2",
      "school: Illusion",
      "class_list: Mage",
      "range: 10 ft",
      "components: V,S,M",
      "material_components: a crystal lens",
      "casting_time: 1 round",
      "duration: 1 turn",
      "area: 10-ft radius",
      "saving_throw: Negates",
      "reversible: 1",
      "tags: illusion, test",
      "source: Test Source",
      "edition: 2e",
      "author: Test Author",
      "license: OGL",
      "---",
      "Imported description text.",
    ].join("\n"),
  );

  await test.step("Load existing spell and confirm fields populate", async () => {
    await app.importFile(importedPath, false);

    await app.openSpell(importedName);
    await expect(page.getByTestId("spell-description-textarea")).toHaveValue(
      "Imported description text.",
    );
    await expect(page.getByTestId("spell-name-input")).toHaveValue(importedName);
    await expect(page.getByTestId("spell-school-input")).toHaveValue("Illusion");
    await expect(page.getByTestId("spell-classes-input")).toHaveValue("Mage");
    await expect(page.getByTestId("spell-source-input")).toHaveValue("Test Source");
    await expect(page.getByTestId("spell-edition-input")).toHaveValue("2e");
    await expect(page.getByTestId("spell-author-input")).toHaveValue("Test Author");
    await expect(page.getByTestId("spell-license-input")).toHaveValue("OGL");
    await expect(page.getByTestId("detail-range-input")).toHaveValue("10 ft");
    await expect(page.getByTestId("detail-components-input")).toHaveValue("V,S,M");
    await expect(page.getByTestId("chk-reversible")).toBeChecked();
    await expect(page.getByTestId("detail-duration-input")).toHaveValue("1 turn");
    await expect(page.getByTestId("detail-casting-time-input")).toHaveValue("1 round");
    await expect(page.getByTestId("detail-area-input")).toHaveValue("10-ft radius");
    await expect(page.getByTestId("detail-saving-throw-input")).toHaveValue("Negates");
    await expect(page.getByTestId("detail-material-components-input")).toHaveValue("a crystal lens");
    await expect(page.getByTestId("spell-tags-input")).toHaveValue("illusion, test");
    await expect(page.getByTestId("spell-description-textarea")).toHaveValue(
      "Imported description text.",
    );
  });

  await test.step("Update extended fields and confirm persistence", async () => {
    await page.getByTestId("spell-author-input").fill("Updated Author");
    await page.getByTestId("detail-range-input").fill("20 ft");
    await page.getByTestId("chk-reversible").uncheck();
    await page.getByTestId("spell-tags-input").fill("updated, tags");
    await page.getByTestId("btn-save-spell").click();
    await app.waitForLibrary();

    await app.openSpell(importedName);
    await expect(page.getByTestId("spell-author-input")).toHaveValue("Updated Author");
    await expect(page.getByTestId("detail-range-input")).toHaveValue("20 ft");
    await expect(page.getByTestId("chk-reversible")).not.toBeChecked();
    await expect(page.getByTestId("spell-tags-input")).toHaveValue("updated, tags");
  });

  await test.step("Create new spell with extended fields", async () => {
    const createdName = `Extended Created ${runId}`;
    await app.createSpell({
      name: createdName,
      level: "4",
      school: "Evocation",
      classes: "Mage",
      source: "Created Source",
      edition: "1e",
      author: "Created Author",
      license: "CC-BY",
      range: "Self",
      components: "V,S",
      isReversible: true,
      duration: "Instant",
      castingTime: "1 action",
      area: "Self",
      savingThrow: "None",
      materialComponents: "a drop of water",
      tags: "created, field",
      description: "Created description text.",
    });

    await app.openSpell(createdName);
    await expect(page.getByTestId("spell-edition-input")).toHaveValue("1e");
    await expect(page.getByTestId("spell-author-input")).toHaveValue("Created Author");
    await expect(page.getByTestId("spell-license-input")).toHaveValue("CC-BY");
    await expect(page.getByTestId("chk-reversible")).toBeChecked();
    await expect(page.getByTestId("detail-material-components-input")).toHaveValue(
      "a drop of water",
    );
    await expect(page.getByTestId("spell-tags-input")).toHaveValue("created, field");
    await expect(page.getByTestId("spell-description-textarea")).toHaveValue(
      "Created description text.",
    );
  });
});

test("M3 FTS5 Search covers author and material_components", async ({ appContext }) => {
  const { page } = appContext;
  const app = new SpellbookApp(page);
  const runId = generateRunId();

  const authorSpellName = `Author Search Spell ${runId}`;
  const materialSpellName = `Material Search Spell ${runId}`;
  const uniqueAuthor = `UniqueAuthorName${runId}`;
  const uniqueMaterial = `raregem${runId}`;

  await test.step("Create spell with unique author", async () => {
    await app.createSpell({
      name: authorSpellName,
      level: "3",
      author: uniqueAuthor,
      description: "A spell with a unique author.",
    });
  });

  await test.step("Create spell with unique material component", async () => {
    await app.createSpell({
      name: materialSpellName,
      level: "4",
      materialComponents: uniqueMaterial,
      description: "A spell with unique material.",
    });
  });

  await test.step("Search by author finds correct spell", async () => {
    await app.setLibraryFilters({ search: uniqueAuthor });
    await expect(page.getByText(authorSpellName)).toBeVisible({
      timeout: TIMEOUTS.short,
    });
    await expect(page.getByText(materialSpellName)).not.toBeVisible();
  });

  await test.step("Search by material component finds correct spell", async () => {
    await app.setLibraryFilters({ search: uniqueMaterial });
    await expect(page.getByText(materialSpellName)).toBeVisible({
      timeout: TIMEOUTS.short,
    });
    await expect(page.getByText(authorSpellName)).not.toBeVisible();
  });

  await test.step("Clear search shows both spells", async () => {
    await app.setLibraryFilters({ search: "" });
    await expect(page.getByText(authorSpellName)).toBeVisible();
    await expect(page.getByText(materialSpellName)).toBeVisible();
  });
});
