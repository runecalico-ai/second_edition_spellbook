import { expect, test } from "./fixtures/test-fixtures";
import { SpellbookApp } from "./page-objects/SpellbookApp";

test.describe("Character Spell Notes Persistence", () => {
  test("should persist distinct notes for Known and Prepared lists", async ({ appContext }) => {
    // Correctly get the page from the Tauri app context
    const { page } = appContext;
    const app = new SpellbookApp(page);

    // Initial wait to be safe
    await page.waitForLoadState("domcontentloaded");

    // 1. Create a test spell first to ensuring it exists
    const spellName = `TestSpell ${Date.now()}`;
    await app.createSpell({
      name: spellName,
      level: "1",
      school: "Abjuration",
      description: "A test spell for notes persistence",
    });

    // 2. Create a character profile
    const charName = `Notes Test ${Date.now()}`;
    await app.createCharacter(charName);
    await app.openCharacterEditor(charName);

    // 3. Add a class (e.g., Mage)
    await app.addClass("Mage");

    // 4. Add the spell to the KNOWN list
    await app.addSpellToClass("Mage", spellName, "KNOWN");

    // 5. Type a unique note for that spell in KNOWN list
    const knownNote = `Known Note ${Date.now()}`;

    const classSection = page.locator(`[aria-label="Class section for Mage"]`);
    await classSection.getByRole("button", { name: "KNOWN" }).click();

    // Verify row exists using spell name in test id
    const knownRow = classSection.getByTestId(`spell-row-${spellName}`);
    await expect(knownRow).toBeVisible();

    const noteInput = knownRow.locator("input[placeholder='Add notes...']");
    await noteInput.fill(knownNote);
    await noteInput.blur();

    // 6. Reload the character to verify persistence
    await page.reload();
    await app.waitForProfileLoad();

    // 7. Verify persistence
    const classSectionReloaded = page.locator(`[aria-label="Class section for Mage"]`);
    await classSectionReloaded.getByRole("button", { name: "KNOWN" }).click();

    const knownRowAfterReload = classSectionReloaded.getByTestId(`spell-row-${spellName}`);
    await expect(knownRowAfterReload).toBeVisible();
    await expect(knownRowAfterReload.locator("input[placeholder='Add notes...']")).toHaveValue(
      knownNote,
    );

    // 8. Add same spell to PREPARED
    await app.addSpellToClass("Mage", spellName, "PREPARED");

    // 9. Type DIFFERENT note
    await classSectionReloaded.getByRole("button", { name: "PREPARED" }).click();
    const preparedRow = classSectionReloaded.getByTestId(`spell-row-${spellName}`);
    await expect(preparedRow).toBeVisible();

    const preparedNote = `Prepared Note ${Date.now()}`;
    const preparedNoteInput = preparedRow.locator("input[placeholder='Add notes...']");

    // Verify it doesn't have the Known note
    await expect(preparedNoteInput).not.toHaveValue(knownNote);

    await preparedNoteInput.fill(preparedNote);
    await preparedNoteInput.blur();

    // 10. Verify distinction
    await expect(preparedNoteInput).toHaveValue(preparedNote);

    await classSectionReloaded.getByRole("button", { name: "KNOWN" }).click();
    const knownRowCheck = classSectionReloaded.getByTestId(`spell-row-${spellName}`);
    await expect(knownRowCheck.locator("input[placeholder='Add notes...']")).toHaveValue(knownNote);

    // Final persistence check
    await page.reload();
    await app.waitForProfileLoad();
    const classSectionFinal = page.locator(`[aria-label="Class section for Mage"]`);

    await classSectionFinal.getByRole("button", { name: "KNOWN" }).click();
    await expect(
      classSectionFinal
        .getByTestId(`spell-row-${spellName}`)
        .locator("input[placeholder='Add notes...']"),
    ).toHaveValue(knownNote);

    await classSectionFinal.getByRole("button", { name: "PREPARED" }).click();
    await expect(
      classSectionFinal
        .getByTestId(`spell-row-${spellName}`)
        .locator("input[placeholder='Add notes...']"),
    ).toHaveValue(preparedNote);
  });
});
