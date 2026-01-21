import { expect, test } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/constants";
import { type TauriAppContext, cleanupTauriApp, launchTauriApp } from "./fixtures/tauri-fixture";
import { SpellbookApp } from "./page-objects/SpellbookApp";
import { generateRunId } from "./fixtures/test-utils";

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

let appContext: TauriAppContext | null = null;

test.beforeEach(async () => {
  appContext = await launchTauriApp({ timeout: TIMEOUTS.medium });
});

test.afterEach(async () => {
  await cleanupTauriApp(appContext);
  appContext = null;
});

test.describe("Character Profiles Foundation", () => {
  test("should handle character creation, identity, and abilities", async () => {
    if (!appContext) throw new Error("App context not initialized");
    const { page } = appContext;
    const app = new SpellbookApp(page);

    const charName = `Hero_${generateRunId()}`;

    await app.createCharacter(charName);
    await app.openCharacterEditor(charName);

    await app.updateIdentity({
      race: "Half-Elf",
      alignment: "Chaotic Good",
      enableCom: true,
    });

    await expect(page.getByLabel("Race")).toHaveValue("Half-Elf");

    await app.updateAbilities({
      str: 18,
      dex: 17,
      con: 16,
      int: 15,
      wis: 14,
      cha: 13,
      com: 19,
    });

    await expect(page.getByLabel("STR", { exact: true })).toHaveValue("18");
    await expect(page.getByLabel("COM", { exact: true })).toHaveValue("19");
  });

  test("should handle multi-classing and per-class spell lists", async () => {
    if (!appContext) throw new Error("App context not initialized");
    const { page } = appContext;
    const app = new SpellbookApp(page);

    const runId = generateRunId();
    const mageSpell = `MageSpell_${runId}`;
    const clericSpell = `ClericSpell_${runId}`;

    // 1. Create Spells in Library first
    await app.createSpell({
      name: mageSpell,
      level: "1",
      school: "Evocation",
      description: "Mage spell description",
    });
    await app.createSpell({
      name: clericSpell,
      level: "1",
      sphere: "All",
      description: "Cleric spell description",
    });

    const charName = `MageCleric_${runId}`;
    await app.createCharacter(charName);
    await app.openCharacterEditor(charName);

    // 2. Add Classes
    await app.addClass("Mage");
    await app.addClass("Cleric");

    // 3. Add Spells
    // Add Mage spell (Arcane)
    await app.addSpellToClass("Mage", mageSpell, "KNOWN");

    // Add Cleric spell to KNOWN first (required by spec)
    await app.addSpellToClass("Cleric", clericSpell, "KNOWN");

    // Add Cleric spell to PREPARED
    await app.addSpellToClass("Cleric", clericSpell, "PREPARED");

    // 4. Verify Isolation
    console.log("Verifying isolation with explicit selectors...");
    const mageSection = page.locator('div[aria-label="Class section for Mage"]');
    const clericSection = page.locator('div[aria-label="Class section for Cleric"]');

    // Verify Mage has MageSpell in KNOWN
    await mageSection.getByRole("button", { name: "KNOWN" }).click();
    await expect(mageSection.getByText(mageSpell)).toBeVisible();
    await expect(mageSection.getByText(clericSpell)).not.toBeVisible();

    // Verify Cleric has ClericSpell in PREPARED
    await clericSection.getByRole("button", { name: "PREPARED" }).click();
    await expect(clericSection.getByText(clericSpell)).toBeVisible();
    await expect(clericSection.getByText(mageSpell)).not.toBeVisible();
  });

  test("should enforce Known spell requirement for Prepared list", async () => {
    if (!appContext) throw new Error("App context not initialized");
    const { page } = appContext;
    const app = new SpellbookApp(page);

    const runId = generateRunId();
    const testSpell = `TestSpell_${runId}`;
    await app.createSpell({
      name: testSpell,
      level: "1",
      school: "Alteration",
      description: "Test",
    });

    const charName = `Validator_${runId}`;
    await app.createCharacter(charName);
    await app.openCharacterEditor(charName);
    await app.addClass("Mage");

    const mageSection = page.locator('div[aria-label="Class section for Mage"]');

    // 1. Try to add to PREPARED immediately (should fail or not be visible)
    // Since UI now filters the picker, checking for visibility in picker is the test
    await app.openSpellPicker("Mage", "PREPARED");
    const picker = page.getByTestId("spell-picker");
    await picker.getByPlaceholder("Search spells by name...").fill(testSpell);
    // Should show no results because it's not in KNOWN
    await expect(picker.getByText(testSpell)).not.toBeVisible();
    await picker.getByRole("button", { name: "CANCEL" }).click();

    // 2. Add to KNOWN
    await app.addSpellToClass("Mage", testSpell, "KNOWN");
    await expect(mageSection.getByText(testSpell)).toBeVisible();

    // 3. Now add to PREPARED (should succeed)
    await app.addSpellToClass("Mage", testSpell, "PREPARED");
    await mageSection.getByRole("button", { name: "PREPARED" }).click();
    await expect(mageSection.getByText(testSpell)).toBeVisible();

    // 4. Remove from KNOWN -> Should remove from PREPARED
    await mageSection.getByRole("button", { name: "KNOWN" }).click();

    // Revert to locator strategy that found the element previously
    const spellRow = mageSection
      .getByText(testSpell)
      .locator("..")
      .locator("..")
      .locator("..")
      .locator("..");
    // Force click to bypass potential visibility/overlap issues
    await spellRow
      .locator("button")
      .filter({ has: page.locator('svg path[d="M3 6h18"]') })
      .click({ force: true });

    // Verify gone from KNOWN
    await expect(mageSection.getByText(testSpell)).not.toBeVisible();

    // Verify gone from PREPARED
    await mageSection.getByRole("button", { name: "PREPARED" }).click();
    await expect(mageSection.getByText(testSpell)).not.toBeVisible();
  });

  test("should delete a character including checking cascade", async () => {
    if (!appContext) throw new Error("App context not initialized");
    const { page } = appContext;
    const app = new SpellbookApp(page);

    const charName = `DeleteMe_${generateRunId()}`;

    // 1. Create Character
    await app.createCharacter(charName);
    await app.openCharacterEditor(charName);

    // 2. Add some data (class, spell) to ensure deep deletion doesn't error
    await app.updateIdentity({ race: "Elf" });
    await app.addClass("Thief");

    // Go back to list
    await app.navigate("Characters");

    // 3. Delete
    // Hover over the character item to reveal the delete button
    const charItem = page.getByRole("link", { name: new RegExp(charName) });
    await charItem.hover();

    // Handle confirmation dialog
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain(`Are you sure you want to delete "${charName}"?`);
      await dialog.accept();
    });

    // Click delete button inside the item
    await charItem.locator('button[title="Delete Character"]').click();

    // 4. Verify gone
    await expect(page.getByRole("link", { name: new RegExp(charName) })).not.toBeVisible();
  });
});


