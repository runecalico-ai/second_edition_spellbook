import * as fs from "node:fs";
import { expect, test } from "./fixtures/test-fixtures";
import { generateRunId } from "./fixtures/test-utils";
import { SpellbookApp } from "./page-objects/SpellbookApp";


test.describe("Character Print Options Dialog", () => {
  test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

  test("should show print dialog for character sheet with format options", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `PrintTest_${runId}`;

    await test.step("Create test character", async () => {
      await app.createCharacter(charName);
      await app.openCharacterEditor(charName);
    });

    await test.step("Click Print Sheet button and verify dialog appears", async () => {
      const printBtn = page.getByTestId("btn-print-sheet");
      await expect(printBtn).toBeVisible();
      await printBtn.click();

      // Verify dialog appears
      const dialog = page.getByTestId("print-options-dialog");
      await expect(dialog).toBeVisible();

      // Verify title
      await expect(page.getByText("Print Character Sheet")).toBeVisible();
    });

    await test.step("Verify format selection options", async () => {
      const formatSelect = page.getByTestId("print-format-select");
      await expect(formatSelect).toBeVisible();

      // Verify default is HTML
      await expect(formatSelect).toHaveValue("html");

      // Change to Markdown
      await formatSelect.selectOption("md");
      await expect(formatSelect).toHaveValue("md");
    });

    await test.step("Verify toggle options", async () => {
      const comCheckbox = page.getByTestId("include-com-checkbox");
      const notesCheckbox = page.getByTestId("include-notes-checkbox");

      await expect(comCheckbox).toBeVisible();
      await expect(notesCheckbox).toBeVisible();

      // Verify default states
      await expect(comCheckbox).not.toBeChecked();
      await expect(notesCheckbox).toBeChecked();

      // Toggle COM
      await comCheckbox.click();
      await expect(comCheckbox).toBeChecked();
    });

    await test.step("Cancel dialog", async () => {
      const cancelBtn = page.getByTestId("btn-cancel-print");
      await cancelBtn.click();

      // Verify dialog closes
      const dialog = page.getByTestId("print-options-dialog");
      await expect(dialog).not.toBeVisible();
    });
  });

  test("should show print dialog for spellbook pack with layout options", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `PackTest_${runId}`;

    await test.step("Create test character with class", async () => {
      await app.createCharacter(charName);
      await app.openCharacterEditor(charName);
      await app.addClass("Mage");
    });

    await test.step("Click Print Pack button and verify dialog appears", async () => {
      // Expand the Mage class section
      const classHeader = page.locator('[data-testid="class-row"]').filter({ hasText: "Mage" });
      await expect(classHeader).toBeVisible();

      // Find and click the Print Pack button
      const printPackBtn = page.getByTestId("btn-print-pack");
      await expect(printPackBtn).toBeVisible();
      await printPackBtn.click();

      // Verify dialog appears
      const dialog = page.getByTestId("print-options-dialog");
      await expect(dialog).toBeVisible();

      // Verify title includes class name
      await expect(page.getByText(/Print Spellbook Pack - Mage/)).toBeVisible();
    });

    await test.step("Verify layout selection options (spellbook pack only)", async () => {
      const layoutSelect = page.getByTestId("print-layout-select");
      await expect(layoutSelect).toBeVisible();

      // Verify default is compact
      await expect(layoutSelect).toHaveValue("compact");

      // Change to full
      await layoutSelect.selectOption("full");
      await expect(layoutSelect).toHaveValue("full");
    });

    await test.step("Verify format selection works for spellbook pack", async () => {
      const formatSelect = page.getByTestId("print-format-select");
      await expect(formatSelect).toBeVisible();

      // Change to Markdown
      await formatSelect.selectOption("md");
      await expect(formatSelect).toHaveValue("md");
    });

    await test.step("Confirm print and verify success", async () => {
      const confirmBtn = page.getByTestId("btn-confirm-print");
      await confirmBtn.click();

      // Wait for success modal
      await expect(page.getByText(/Print Success/)).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/Spellbook pack saved to:/)).toBeVisible();

      // Close success modal
      await page.getByRole("button", { name: "OK" }).click();

      // Verify print dialog is closed
      const dialog = page.getByTestId("print-options-dialog");
      await expect(dialog).not.toBeVisible();
    });
  });

  test("should apply selected options when printing character sheet", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `OptionsTest_${runId}`;

    await test.step("Create test character", async () => {
      await app.createCharacter(charName);
      await app.openCharacterEditor(charName);
    });

    await test.step("Open print dialog and select Markdown format", async () => {
      await page.getByTestId("btn-print-sheet").click();

      const dialog = page.getByTestId("print-options-dialog");
      await expect(dialog).toBeVisible();

      // Select Markdown format
      const formatSelect = page.getByTestId("print-format-select");
      await formatSelect.selectOption("md");

      // Enable COM
      const comCheckbox = page.getByTestId("include-com-checkbox");
      await comCheckbox.click();
    });

    await test.step("Confirm and verify success", async () => {
      const confirmBtn = page.getByTestId("btn-confirm-print");
      await confirmBtn.click();

      // Wait for success message
      const successToast = page.getByText(/Print Success/);
      await expect(successToast).toBeVisible({ timeout: 10000 });

      const messageLocator = page.getByText(/Character sheet saved to:/);
      await expect(messageLocator).toBeVisible();

      // Extract path from the toast message
      const message = await messageLocator.textContent();
      const path = message?.split("saved to: ")[1].trim();
      expect(path).toBeTruthy();

      if (path) {
        // Verify file content
        const content = fs.readFileSync(path, "utf8");

        if (path.endsWith(".md")) {
          expect(content).toContain(`# ${charName}`);
          expect(content).toContain("**Type:** PC");
          expect(content).toContain("## Abilities");
          expect(content).toContain("| STR | DEX | CON | INT | WIS | CHA | COM |");
          expect(content).toContain("## Classes");
        } else {
          // HTML
          expect(content).toContain(`<h1>${charName}</h1>`);
          expect(content).toContain("COM</div>");
          expect(content).toContain('class="spell-table"');
          expect(content).toContain("STR</div>");
        }
      }

      // Close success modal
      await page.getByRole("button", { name: "OK" }).click();
    });
  });

  test("should verify tooltips in character editor", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const charName = `TooltipTest_${runId}`;

    await app.createCharacter(charName);
    // Wait for manager to settle
    await expect(page.getByTestId("character-search-input")).toBeVisible();
    await app.openCharacterEditor(charName);

    // Verify COM tooltip
    const comLabel = page.getByText(/Enable Comeliness \(COM\)/);
    await expect(comLabel).toHaveAttribute("title", /Optional 2nd Edition ability score/, {
      timeout: 10000,
    });

    // Verify Spell Management tooltip
    const spellHeader = page.getByText(/Spell Management/);
    await expect(spellHeader.first()).toHaveAttribute(
      "title",
      /Manage spells for each class independently/,
    );
  });
});
