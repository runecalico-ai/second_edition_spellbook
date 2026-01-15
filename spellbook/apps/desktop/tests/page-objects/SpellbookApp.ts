import path from "node:path";
/**
 * Page Object Model for the Spellbook application.
 * Encapsulates common UI interactions to keep test scripts clean.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../fixtures/constants";

/** Common selectors used throughout the app */
export const SELECTORS = {
  spellName: '[placeholder="Spell Name"]',
  level: "#spell-level",
  levelPlaceholder: '[placeholder="Level"]',
  description: "textarea#spell-description",
  descriptionLabel: '[aria-label="Description"]',
  cantripCheckbox: 'label:has-text("Cantrip") input',
  questCheckbox: 'label:has-text("Quest Spell") input',
  reversibleCheckbox: '[aria-label="Reversible"]',
  classesInput: '[aria-label="Classes"]',
  classesLabel: '[aria-label="Classes (e.g. Mage, Cleric)"]',
  fileInput: 'input[type="file"]',
} as const;

export interface CreateSpellOptions {
  name: string;
  level?: string;
  description?: string;
  source?: string;
  school?: string;
  classes?: string;
  isCantrip?: boolean;
  isQuest?: boolean;
}

/**
 * Page Object Model for the Spellbook application.
 */
export class SpellbookApp {
  constructor(public page: Page) { }

  /** Navigate to a page using the nav link (preferring nav bar links) */
  async navigate(name: string): Promise<void> {
    // "Add Spell" isn't in the nav bar, it's in the Library page
    if (name === "Add Spell") {
      await this.page.getByRole("link", { name, exact: true }).click();
    } else {
      // All other navigation uses the nav bar
      await this.page.locator("nav").getByRole("link", { name, exact: true }).click();
    }
  }

  /** Wait for the Library heading to be visible */
  async waitForLibrary(): Promise<void> {
    await expect(this.page.getByRole("heading", { name: "Library" })).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
  }

  /** Wait for the New Spell heading to be visible */
  async waitForSpellEditor(): Promise<void> {
    await expect(this.page.getByRole("heading", { name: "New Spell", exact: true })).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
  }

  /** Create a new spell */
  async createSpell(options: CreateSpellOptions): Promise<void> {
    const {
      name,
      level = "1",
      description = "",
      source = "",
      school,
      classes,
      isCantrip,
      isQuest,
    } = options;

    await this.navigate("Add Spell");

    await this.page.getByPlaceholder("Spell Name").fill(name);

    if (isCantrip) {
      await this.page.locator(SELECTORS.cantripCheckbox).check();
    } else {
      // Use the id-based selector since level input has no placeholder
      await this.page.locator("#spell-level").fill(level);
    }

    if (isQuest) {
      await this.page.locator(SELECTORS.questCheckbox).check();
    }

    if (school) {
      await this.page.getByLabel("School").fill(school);
    }

    if (classes) {
      await this.page.getByLabel("Classes (e.g. Mage, Cleric)").fill(classes);
    }

    if (source) {
      await this.page.getByLabel("Source").fill(source);
    }

    // Fill description - use id-based selector
    if (description) {
      await this.page.locator("#spell-description").fill(description);
    }

    await this.page.getByRole("button", { name: "Save Spell" }).click();
    await this.navigate("Library");
  }

  /** Import a file through the import wizard */
  async importFile(filePath: string, allowOverwrite = false): Promise<void> {
    await this.navigate("Import");

    const fileInput = this.page.locator(SELECTORS.fileInput);
    await fileInput.setInputFiles(filePath);
    await expect(this.page.getByText(path.basename(filePath))).toBeVisible();

    await this.page.getByRole("button", { name: "Preview →" }).click();
    await expect(this.page.getByText(/Parsed \d+ spell/)).toBeVisible();
    await this.page.getByRole("button", { name: "Skip Review →" }).click();
    await expect(this.page.getByText(/Ready to import/)).toBeVisible();

    const overwriteCheckbox = this.page.getByLabel("Overwrite existing spells");
    if (allowOverwrite) {
      await overwriteCheckbox.check();
    } else {
      await overwriteCheckbox.uncheck();
    }

    await this.page.getByRole("button", { name: "Start Import" }).click();
  }

  /** Import multiple files */
  async importFiles(filePaths: string[]): Promise<void> {
    await this.navigate("Import");

    const fileInput = this.page.locator(SELECTORS.fileInput);
    await fileInput.setInputFiles(filePaths);

    await this.page.getByRole("button", { name: "Preview →" }).click();
    await expect(this.page.getByText(/Parsed \d+ spell/)).toBeVisible();
    await this.page.getByRole("button", { name: "Skip Review →" }).click();
    await expect(this.page.getByText(/Ready to import/)).toBeVisible();

    await this.page.getByRole("button", { name: "Start Import" }).click();
  }

  /** Open a spell in the editor by name */
  async openSpell(spellName: string): Promise<void> {
    await this.navigate("Library");
    await this.page.getByText(spellName).click();
    await expect(this.page.getByPlaceholder("Spell Name")).toHaveValue(spellName);
  }

  /** Create a new character */
  async createCharacter(name: string): Promise<void> {
    await this.navigate("Characters");
    await expect(this.page.getByRole("heading", { name: "Characters" })).toBeVisible();
    await this.page.getByPlaceholder("New Name").fill(name);
    await this.page.getByRole("button", { name: "+" }).click();
    await expect(this.page.getByRole("button", { name })).toBeVisible();
  }

  /** Select a character by name */
  async selectCharacter(name: string): Promise<void> {
    await this.page.getByRole("button", { name }).click();
  }

  /** Get a spell row in the library table */
  getSpellRow(spellName: string) {
    return this.page.getByRole("row", { name: new RegExp(spellName) });
  }

  /** Get a table row by text content */
  getRow(text: string) {
    return this.page.locator("tr").filter({ hasText: text }).first();
  }
}
