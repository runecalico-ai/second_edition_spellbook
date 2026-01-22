import { expect, test } from "./fixtures/test-fixtures";
import { TIMEOUTS } from "./fixtures/constants";
import { SpellbookApp } from "./page-objects/SpellbookApp";
import { handleCustomModal } from "./utils/dialog-handler";
import { generateRunId } from "./fixtures/test-utils";

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

test.describe("Character Profiles Foundation", () => {
  test("should handle multi-classing and per-class spell lists", async ({ appContext }) => {
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
    console.log("Verifying isolation...");

    // Verify Mage has MageSpell in KNOWN
    await app.verifySpellInClassList("Mage", "KNOWN", mageSpell, true);
    await app.verifySpellInClassList("Mage", "KNOWN", clericSpell, false);

    // Verify Cleric has ClericSpell in PREPARED
    await app.verifySpellInClassList("Cleric", "PREPARED", clericSpell, true);
    await app.verifySpellInClassList("Cleric", "PREPARED", mageSpell, false);
  });

  test("should enforce Known spell requirement for Prepared list", async ({ appContext }) => {
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

    // 1. Try to add to PREPARED immediately (should fail with an error)
    await app.openSpellPicker("Mage", "PREPARED");
    // Wait for the alert modal
    await handleCustomModal(page, "OK");
    await page.waitForTimeout(300); // Settlement wait for modal close

    // 2. Add to KNOWN
    await app.addSpellToClass("Mage", testSpell, "KNOWN");
    await app.verifySpellInClassList("Mage", "KNOWN", testSpell, true);

    // 3. Now add to PREPARED (should succeed)
    await app.addSpellToClass("Mage", testSpell, "PREPARED");
    await app.verifySpellInClassList("Mage", "PREPARED", testSpell, true);

    // 4. Remove from KNOWN -> Should remove from PREPARED
    await app.removeSpellFromClass("Mage", "KNOWN", testSpell);

    // Verify gone from KNOWN
    await app.verifySpellInClassList("Mage", "KNOWN", testSpell, false);

    // Verify gone from PREPARED
    await app.verifySpellInClassList("Mage", "PREPARED", testSpell, false);
  });
});
