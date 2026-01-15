import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Page, expect, test } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/constants";
import {
  type TauriAppContext,
  cleanupTauriApp,
  createFileTracker,
  launchTauriApp,
} from "./fixtures/tauri-fixture";
import { SpellbookApp } from "./page-objects/SpellbookApp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

let appContext: TauriAppContext | null = null;
const fileTracker = createFileTracker();

test.beforeAll(async () => {
  appContext = await launchTauriApp();
});

test.afterAll(() => {
  cleanupTauriApp(appContext);
  fileTracker.cleanup();
});

test("Milestone Verification Flow", async () => {
  if (!appContext) throw new Error("App context not initialized");
  const { page } = appContext;
  const app = new SpellbookApp(page);
  const runId = Date.now();
  const uniqueSpellName = `POM Known Spell ${runId}`;
  const characterName = `POM Character ${runId}`;

  await test.step("Milestone 0: Backup UI", async () => {
    const backupBtn = page.getByRole("button", { name: "Backup" });
    const restoreBtn = page.getByRole("button", { name: "Restore" });
    await expect(backupBtn).toBeVisible();
    await expect(restoreBtn).toBeVisible();
  });

  await test.step("Setup: Create Spell", async () => {
    await app.createSpell({
      name: uniqueSpellName,
      level: "3",
      description: "Cleanly created via helper.",
    });
  });

  await test.step("Milestone 1: Character Linkage", async () => {
    const charLink = page.getByRole("link", { name: "Characters", exact: true });
    await expect(charLink).toBeVisible();
    await charLink.click();
    await expect(page).toHaveURL(/\/character/);
    await expect(page.getByRole("heading", { name: "Characters" })).toBeVisible();
    await app.navigate("Library");
    await expect(page).toHaveURL(/\/$/);
    const select = page.locator("tbody tr").first().locator("select").first();
    await expect(select).toBeVisible();
  });

  await test.step("Milestone 1b: Known toggles persist", async () => {
    await app.navigate("Characters");
    await expect(page.getByRole("heading", { name: "Characters" })).toBeVisible();

    await page.getByPlaceholder("New Name").fill(characterName);
    await page.getByRole("button", { name: "+" }).click();
    const characterButton = page.getByRole("button", { name: characterName });
    await expect(characterButton).toBeVisible();
    await characterButton.click();

    await app.navigate("Library");
    const spellRow = app.getSpellRow(uniqueSpellName);
    await expect(spellRow).toBeVisible();
    const addDialog = page.waitForEvent("dialog");
    await spellRow.getByRole("combobox").selectOption({ label: characterName });
    await (await addDialog).accept();

    await app.navigate("Characters");
    await expect(characterButton).toBeVisible();
    await characterButton.click();
    const knownCheckbox = page.getByRole("checkbox", { name: `Known ${uniqueSpellName}` });
    await expect(knownCheckbox).toBeVisible();
    await knownCheckbox.setChecked(false);
    const preparedCheckbox = page.getByRole("checkbox", { name: `Prepared ${uniqueSpellName}` });
    await expect(preparedCheckbox).toBeVisible();
    await preparedCheckbox.setChecked(true);

    await app.navigate("Library");
    await app.navigate("Characters");
    await expect(characterButton).toBeVisible();
    await characterButton.click();
    const knownCheckboxAfter = page.getByRole("checkbox", { name: `Known ${uniqueSpellName}` });
    await expect(knownCheckboxAfter).not.toBeChecked();
    const preparedCheckboxAfter = page.getByRole("checkbox", {
      name: `Prepared ${uniqueSpellName}`,
    });
    await expect(preparedCheckboxAfter).toBeChecked();
  });

  await test.step("Milestone 2: Import Wizard & Provenance", async () => {
    const uniqueName = `Import Test Spell ${Date.now()}`;
    const samplePath = fileTracker.track(path.resolve(__dirname, "sample.md"));
    fs.writeFileSync(
      samplePath,
      `---\nname: ${uniqueName}\nlevel: 2\nsource: TestSource\n---\nImported description details.`,
    );

    // Test First Import
    await app.importFile(samplePath, false);
    await expect(page.getByText("Imported spells: 1")).toBeVisible({ timeout: TIMEOUTS.medium });

    // Test Skip Duplicate
    await app.importFile(samplePath, false);
    await expect(page.getByText("1 spells skipped")).toBeVisible();

    // Test Overwrite
    await app.importFile(samplePath, true);
    await expect(page.getByText("Imported spells: 1")).toBeVisible();

    // Verify Provenance
    await app.navigate("Library");
    await page.getByText(uniqueName).click();
    await expect(page.getByPlaceholder("Spell Name")).toHaveValue(uniqueName);
    await expect(page.getByText("Provenance (Imports)")).toBeVisible();
    await expect(page.getByText("Type: MD")).toBeVisible();
    await expect(page.getByText(/SHA256: [a-f0-9]{64}/)).toBeVisible();
  });

  await test.step("Milestone 3: Library filters for components and tags", async () => {
    const filterRunId = Date.now();
    const taggedSpellName = `Filter Spell ${filterRunId}`;
    const taggedSpellPath = fileTracker.track(path.resolve(__dirname, `filter-${filterRunId}.md`));
    fs.writeFileSync(
      taggedSpellPath,
      [
        "---",
        `name: ${taggedSpellName}`,
        "level: 2",
        "school: Evocation",
        "class_list: Wizard, Sorcerer",
        "components: V,S,M",
        "tags: alpha, beta",
        "---",
        "Filter test spell.",
      ].join("\n"),
    );
    const decoySpellName = `Filter Decoy ${filterRunId}`;
    const decoySpellPath = fileTracker.track(
      path.resolve(__dirname, `filter-decoy-${filterRunId}.md`),
    );
    fs.writeFileSync(
      decoySpellPath,
      [
        "---",
        `name: ${decoySpellName}`,
        "level: 3",
        "school: Abjuration",
        "class_list: Cleric",
        "components: V,S",
        "tags: delta",
        "---",
        "Decoy spell for filters.",
      ].join("\n"),
    );

    await app.importFile(taggedSpellPath, false);
    await expect(page.getByText("Imported spells: 1")).toBeVisible({ timeout: TIMEOUTS.medium });
    await app.importFile(decoySpellPath, false);
    await expect(page.getByText("Imported spells: 1")).toBeVisible({ timeout: TIMEOUTS.medium });

    await app.navigate("Library");

    const schoolSelect = page.locator("select", {
      has: page.getByRole("option", { name: "All schools" }),
    });
    await schoolSelect.selectOption({ label: "Evocation" });
    const levelSelect = page.locator("select", {
      has: page.getByRole("option", { name: "All levels" }),
    });
    await levelSelect.selectOption({ label: "2" });
    const classSelect = page.locator("select", {
      has: page.getByRole("option", { name: "All classes" }),
    });
    await classSelect.selectOption({ label: "Wizard" });
    const componentSelect = page.locator("select", {
      has: page.getByRole("option", { name: "All components" }),
    });
    await componentSelect.selectOption({ label: "M" });
    const tagSelect = page.locator("select", {
      has: page.getByRole("option", { name: "All tags" }),
    });
    await tagSelect.selectOption({ label: "alpha" });
    await page.getByRole("button", { name: "Search" }).click();

    await expect(app.getSpellRow(taggedSpellName)).toBeVisible();
    await expect(app.getSpellRow(decoySpellName)).toHaveCount(0);
  });
});

test("Import conflict merge review flow", async () => {
  if (!appContext) throw new Error("App context not initialized");
  const { page } = appContext;
  const app = new SpellbookApp(page);
  const runId = Date.now();
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
  });

  await test.step("Trigger conflict import and resolve", async () => {
    const samplePath = fileTracker.track(path.resolve(__dirname, `conflict-${runId}.md`));
    fs.writeFileSync(
      samplePath,
      `---\nname: ${conflictName}\nlevel: 1\nsource: ${conflictSource}\n---\n${incomingDescription}`,
    );

    await app.navigate("Import");
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(samplePath);
    await page.getByRole("button", { name: "Preview →" }).click();
    await page.getByRole("button", { name: "Skip Review →" }).click();
    await page.getByRole("button", { name: "Start Import" }).click();

    await expect(page.getByText("Resolve Conflicts")).toBeVisible();
    await expect(page.getByRole("button", { name: "Custom Merge" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Use Incoming" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep Existing" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Field" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Existing" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Incoming" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Use" })).toBeVisible();
    await expect(page.getByLabel("Existing")).toBeVisible();
    await expect(page.getByLabel("Incoming")).toBeVisible();
    await page.getByRole("button", { name: "Use Incoming" }).first().click();
    await page.getByRole("button", { name: "Apply Resolutions" }).click();
    await expect(page.getByText("Conflict resolutions")).toBeVisible({ timeout: TIMEOUTS.medium });
  });

  await test.step("Verify updated spell", async () => {
    await app.navigate("Library");
    await page.getByText(conflictName).click();
    await expect(page.getByLabel("Description")).toHaveValue(incomingDescription);
  });
});

test("Spell editor persists extended fields", async () => {
  if (!appContext) throw new Error("App context not initialized");
  const { page } = appContext;
  const app = new SpellbookApp(page);
  const runId = Date.now();

  const importedName = `Extended Imported ${runId}`;
  const importedPath = fileTracker.track(path.resolve(__dirname, `extended-${runId}.md`));
  fs.writeFileSync(
    importedPath,
    [
      "---",
      `name: ${importedName}`,
      "level: 2",
      "school: Illusion",
      "sphere: Lesser",
      "class_list: Mage, Cleric",
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
    await expect(page.getByText("Imported spells: 1")).toBeVisible({ timeout: TIMEOUTS.medium });

    await app.openSpell(importedName);
    await expect(page.getByLabel("School")).toHaveValue("Illusion");
    await expect(page.getByLabel("Sphere")).toHaveValue("Lesser");
    await expect(page.getByLabel("Classes (e.g. Mage, Cleric)")).toHaveValue("Mage, Cleric");
    await expect(page.getByLabel("Source")).toHaveValue("Test Source");
    await expect(page.getByLabel("Edition")).toHaveValue("2e");
    await expect(page.getByLabel("Author")).toHaveValue("Test Author");
    await expect(page.getByLabel("License")).toHaveValue("OGL");
    await expect(page.getByPlaceholder("Range")).toHaveValue("10 ft");
    await expect(page.getByPlaceholder("Components (V,S,M)")).toHaveValue("V,S,M");
    await expect(page.getByLabel("Reversible")).toBeChecked();
    await expect(page.getByPlaceholder("Duration")).toHaveValue("1 turn");
    await expect(page.getByPlaceholder("Casting Time")).toHaveValue("1 round");
    await expect(page.getByPlaceholder("Area")).toHaveValue("10-ft radius");
    await expect(page.getByPlaceholder("Save")).toHaveValue("Negates");
    await expect(page.getByLabel("Material Components")).toHaveValue("a crystal lens");
    await expect(page.getByLabel("Tags")).toHaveValue("illusion, test");
    await expect(page.getByLabel("Description")).toHaveValue("Imported description text.");
  });

  await test.step("Update extended fields and confirm persistence", async () => {
    await page.getByLabel("Sphere").fill("Greater");
    await page.getByLabel("Author").fill("Updated Author");
    await page.getByPlaceholder("Range").fill("20 ft");
    await page.getByLabel("Reversible").uncheck();
    await page.getByLabel("Tags").fill("updated, tags");
    await page.getByRole("button", { name: "Save Spell" }).click();

    await app.openSpell(importedName);
    await expect(page.getByLabel("Sphere")).toHaveValue("Greater");
    await expect(page.getByLabel("Author")).toHaveValue("Updated Author");
    await expect(page.getByPlaceholder("Range")).toHaveValue("20 ft");
    await expect(page.getByLabel("Reversible")).not.toBeChecked();
    await expect(page.getByLabel("Tags")).toHaveValue("updated, tags");
  });

  await test.step("Create new spell with extended fields", async () => {
    const createdName = `Extended Created ${runId}`;
    await app.navigate("Add Spell");
    await page.getByPlaceholder("Spell Name").fill(createdName);
    await page.getByPlaceholder("Level").fill("4");
    await page.getByLabel("School").fill("Evocation");
    await page.getByLabel("Sphere").fill("Minor");
    await page.getByLabel("Classes (e.g. Mage, Cleric)").fill("Mage");
    await page.getByLabel("Source").fill("Created Source");
    await page.getByLabel("Edition").fill("1e");
    await page.getByLabel("Author").fill("Created Author");
    await page.getByLabel("License").fill("CC-BY");
    await page.getByPlaceholder("Range").fill("Self");
    await page.getByPlaceholder("Components (V,S,M)").fill("V,S");
    await page.getByLabel("Reversible").check();
    await page.getByPlaceholder("Duration").fill("Instant");
    await page.getByPlaceholder("Casting Time").fill("1 action");
    await page.getByPlaceholder("Area").fill("Self");
    await page.getByPlaceholder("Save").fill("None");
    await page.getByLabel("Material Components").fill("a drop of water");
    await page.getByLabel("Tags").fill("created, field");
    await page.getByLabel("Description").fill("Created description text.");
    await page.getByRole("button", { name: "Save Spell" }).click();

    await app.openSpell(createdName);
    await expect(page.getByLabel("Edition")).toHaveValue("1e");
    await expect(page.getByLabel("Author")).toHaveValue("Created Author");
    await expect(page.getByLabel("License")).toHaveValue("CC-BY");
    await expect(page.getByLabel("Reversible")).toBeChecked();
    await expect(page.getByLabel("Material Components")).toHaveValue("a drop of water");
    await expect(page.getByLabel("Tags")).toHaveValue("created, field");
    await expect(page.getByLabel("Description")).toHaveValue("Created description text.");
  });
});
