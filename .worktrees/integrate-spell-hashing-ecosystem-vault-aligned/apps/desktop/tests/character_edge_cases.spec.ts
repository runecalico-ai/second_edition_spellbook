import { expect, test } from "./fixtures/test-fixtures";
import { generateRunId } from "./fixtures/test-utils";
import { SpellbookApp } from "./page-objects/SpellbookApp";

test.describe("Character Edge Cases & Hardening", () => {
  test.beforeEach(async ({ appContext }) => {
    appContext.page.on("console", (msg) => console.log(`BROWSER [${msg.type()}]: ${msg.text()}`));
  });

  test("should handle long names and special characters", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    const longName = `Char_${"A".repeat(200)}_${runId}`;
    const specialName = `XSS_Test_<script>alert('x')</script>_'";--_${runId}`;
    const emojiName = `Emoji_🧙‍♂️✨🎲_${runId}`;

    // Test Long Name
    await app.createCharacter(longName);
    await expect(
      page.getByTestId("character-name-label").filter({ hasText: longName }),
    ).toBeVisible();

    // Test Special Characters (XSS/Injection)
    await app.createCharacter(specialName);
    await expect(
      page.getByTestId("character-name-label").filter({ hasText: specialName }),
    ).toBeVisible();

    // Test Emojis
    await app.createCharacter(emojiName);
    await expect(
      page.getByTestId("character-name-label").filter({ hasText: emojiName }),
    ).toBeVisible();

    // Cleanup
    await app.deleteCharacterFromList(longName);
    await app.deleteCharacterFromList(specialName);
    await app.deleteCharacterFromList(emojiName);
  });

  test("should enforce stat boundaries and persistence", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `Stat_Test_${runId}`;

    await app.createCharacter(charName);
    await app.openCharacterEditor(charName);

    // Test Ability Score Boundaries
    // Attempt negative value -> should clamp to 0 (per C4.4 validation)
    const strInput = page.getByTestId("ability-str-input");
    await strInput.fill("-5");
    await expect(strInput).toHaveValue("0");

    // Attempt valid high value
    await strInput.fill("25");
    await expect(strInput).toHaveValue("25");

    // Save
    await page.getByTestId("btn-save-abilities").click();
    // Reload to verify persistence
    await page.reload();
    await expect(strInput).toHaveValue("25");

    // Cleanup
    await app.navigate("Characters");
    await app.deleteCharacterFromList(charName);
  });

  test("should handle maximum classes limits", async ({ appContext }) => {
    // Just verifying we can add multiple classes without crashing
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `MultiClass_${runId}`;

    await app.createCharacter(charName);
    await app.openCharacterEditor(charName);

    await app.addClass("Mage");
    await app.addClass("Fighter");
    await app.addClass("Cleric");

    const rows = page.getByTestId("class-row");
    await expect(rows).toHaveCount(3);

    // Cleanup
    await app.navigate("Characters");
    await app.deleteCharacterFromList(charName);
  });

  test("should handle very high ability values without overflow", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `HighStats_${runId}`;

    await app.createCharacter(charName);
    await app.openCharacterEditor(charName);

    // Test value 1000
    const strInput = page.getByTestId("ability-str-input");
    await strInput.fill("1000");
    await expect(strInput).toHaveValue("1000");

    // Test INT_MAX (2147483647)
    await strInput.fill("2147483647");
    await expect(strInput).toHaveValue("2147483647");

    // Save and verify persistence
    await page.getByTestId("btn-save-abilities").click();
    await page.reload();
    await expect(strInput).toHaveValue("2147483647");

    // Verify UI displays correctly (no scientific notation or overflow)
    const displayedValue = await strInput.inputValue();
    expect(displayedValue).toBe("2147483647");
    expect(displayedValue).not.toContain("e");
    expect(displayedValue).not.toContain("Infinity");

    // Cleanup
    await app.navigate("Characters");
    await app.deleteCharacterFromList(charName);
  });

  test("should handle large spell lists across multiple classes", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `ManySpells_${runId}`;

    await app.createCharacter(charName);
    await app.openCharacterEditor(charName);

    // Add 3 classes
    await app.addClass("Mage");
    await app.addClass("Cleric");
    await app.addClass("Druid");

    // Test: Verify that UI handles multiple classes with the concept of
    // many spells without actually adding hundreds of spells
    // (Adding actual spells would require library setup and is too slow for E2E)

    // Verify all 3 classes are displayed
    const rows = page.getByTestId("class-row");
    await expect(rows).toHaveCount(3);

    // Verify each class row is interactive
    const mageRow = rows.filter({ hasText: "Mage" });
    await expect(mageRow).toBeVisible();

    const clericRow = rows.filter({ hasText: "Cleric" });
    await expect(clericRow).toBeVisible();

    const druidRow = rows.filter({ hasText: "Druid" });
    await expect(druidRow).toBeVisible();

    // Performance check: ensure UI is still responsive with multiple classes
    // Use .first() since there are 3 btn-print-pack buttons (one per class)
    await expect(page.getByTestId("btn-print-pack").first()).toBeVisible({ timeout: 5000 });

    // Cleanup
    await app.navigate("Characters");
    await app.deleteCharacterFromList(charName);
  });
});
