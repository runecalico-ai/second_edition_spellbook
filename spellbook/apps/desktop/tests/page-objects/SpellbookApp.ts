import path from "node:path";
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
  sphere?: string;
  classes?: string;
  components?: string;
  tags?: string;
  isCantrip?: boolean;
  isQuest?: boolean;
}

/**
 * Page Object Model for the Spellbook application.
 */
export class SpellbookApp {
  constructor(public page: Page) {}

  /** Navigate to a page using the nav link (preferring nav bar links) */
  async navigate(
    label: "Library" | "Characters" | "Import" | "Chat" | "App" | "Add Spell" | "Export",
  ): Promise<void> {
    if (label === "Add Spell") {
      // Ensure we are in Library first, as "Add Spell" is a contextual link
      await this.navigate("Library");
      await this.page.waitForTimeout(500); // Small wait for contextual link to mount
      await this.page.getByRole("link", { name: "Add Spell" }).click();
    } else {
      const link = this.page.getByRole("navigation").getByRole("link", { name: label });
      await link.click();
    }
    await this.page.waitForLoadState("networkidle").catch(() => {});
    // DO NOT reload here, it destroys SPA state that tests might rely on.
  }

  /** Wait for the Library heading to be visible */
  async waitForLibrary(): Promise<void> {
    await expect(this.page.getByRole("heading", { name: "Library" })).toBeVisible({
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
      sphere,
      classes,
      isCantrip,
      isQuest,
    } = options;

    await this.navigate("Add Spell");
    await expect(this.page.getByRole("heading", { name: "New Spell" })).toBeVisible();

    await this.page.waitForLoadState("networkidle");
    await this.page.waitForTimeout(500); // Allow React state to settle after mount

    const nameLoc = this.page.getByLabel("Name");
    await nameLoc.fill("");
    await nameLoc.fill(name);
    await expect(nameLoc).toHaveValue(name);

    const levelLoc = this.page.getByLabel("Level", { exact: true });
    if (isCantrip) {
      await levelLoc.fill("0");
      await this.page.locator(SELECTORS.cantripCheckbox).check();
    } else if (isQuest) {
      await levelLoc.fill("8");
      await this.page.locator(SELECTORS.questCheckbox).check();
    } else {
      await levelLoc.fill(level);
      await expect(levelLoc).toHaveValue(level);
    }

    if (school) {
      const schoolLoc = this.page.getByLabel("School");
      await schoolLoc.fill("");
      await schoolLoc.fill(school);
      await expect(schoolLoc).toHaveValue(school);
    }

    if (sphere) {
      const sphereLoc = this.page.getByLabel("Sphere");
      await sphereLoc.fill("");
      await sphereLoc.fill(sphere);
      await expect(sphereLoc).toHaveValue(sphere);
    }

    if (classes) {
      const classesLoc = this.page.getByLabel("Classes (e.g. Mage, Cleric)");
      await classesLoc.fill("");
      await classesLoc.fill(classes);
      await expect(classesLoc).toHaveValue(classes);
    }

    if (source) {
      const sourceLoc = this.page.getByLabel("Source");
      await sourceLoc.fill("");
      await sourceLoc.fill(source);
      await expect(sourceLoc).toHaveValue(source);
    }

    if (description) {
      const descLoc = this.page.getByLabel("Description");
      await descLoc.fill("");
      await descLoc.fill(description);
      await expect(descLoc).toHaveValue(description);
    }

    if (options.components) {
      const compLoc = this.page.getByPlaceholder("Components (V,S,M)");
      await compLoc.fill("");
      await compLoc.fill(options.components);
      await expect(compLoc).toHaveValue(options.components);
    }

    if (options.tags) {
      const tagsLoc = this.page.getByLabel("Tags");
      await tagsLoc.fill("");
      await tagsLoc.fill(options.tags);
      await expect(tagsLoc).toHaveValue(options.tags);
    }

    await this.page.locator("#btn-save-spell").click();
    await this.waitForLibrary();
  }

  /** Reset the import wizard to the first step */
  async resetImportWizard(): Promise<void> {
    await this.navigate("Import");
    const importMoreBtn = this.page.getByRole("button", { name: "Import More Files" });
    if (await importMoreBtn.isVisible()) {
      await importMoreBtn.click();
    }
    const cancelBtn = this.page.getByRole("button", { name: "Cancel" });
    if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
    }
  }

  /** Import a file through the import wizard */
  async importFile(filePath: string, allowOverwrite = false): Promise<void> {
    await this.resetImportWizard();

    const fileInput = this.page.locator(SELECTORS.fileInput);
    await expect(fileInput).toBeVisible({ timeout: TIMEOUTS.medium });

    await fileInput.setInputFiles(filePath);
    await expect(this.page.getByText(path.basename(filePath))).toBeVisible();

    await this.page.getByRole("button", { name: "Preview →" }).click();
    await expect(this.page.getByText(/Parsed \d+ spell\(s\)/)).toBeVisible({
      timeout: TIMEOUTS.medium, // Parsing might happen locally but still good to have buffer
    });

    await this.page.getByRole("button", { name: "Skip Review →" }).click();

    if (allowOverwrite) {
      const overwriteCheckbox = this.page.getByLabel("Overwrite existing spells");
      await expect(overwriteCheckbox).toBeVisible({ timeout: TIMEOUTS.short });
      await overwriteCheckbox.check();
    }

    await this.page.getByRole("button", { name: "Start Import" }).click();

    // Wait for the results screen to show the "Import More Files" button as success indicator
    // This involves backend processing, so give it robust timeout
    await expect(this.page.getByRole("button", { name: "Import More Files" })).toBeVisible({
      timeout: TIMEOUTS.long,
    });
  }

  /** Open a spell in the editor by name */
  async openSpell(name: string): Promise<void> {
    await this.navigate("Library");
    await this.page.getByPlaceholder(/Search spells/i).fill(name);
    await this.page.getByRole("button", { name: "Search", exact: true }).click();

    // Wait for the specific spell link to appear in the table
    const spellLink = this.page.getByRole("link", { name, exact: true });
    await expect(spellLink).toBeVisible({ timeout: TIMEOUTS.medium });

    // Explicitly wait for navigation after click
    // navigating via href is more robust than clicking in some Tauri contexts
    // But we revert to click() as the original issue was likely front matter
    await spellLink.click();

    await expect(this.page).toHaveURL(/\/edit\/\d+/, { timeout: TIMEOUTS.medium });
    await expect(this.page.getByRole("heading", { name: "Edit Spell" })).toBeVisible();
  }

  /** Clear all library filters */
  async clearFilters(): Promise<void> {
    await this.navigate("Library");
    const clearBtn = this.page.getByRole("button", { name: /Clear|Reset/i });
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
    } else {
      // Manual clear fallback if button not found
      const searchBox = this.page.getByPlaceholder(/Search spells/i);
      await searchBox.clear();
      await this.page.getByRole("button", { name: "Search", exact: true }).click();
    }
  }

  /** Select a character by name */
  async selectCharacter(name: string): Promise<void> {
    await this.navigate("Characters");
    await this.page.getByRole("link", { name: new RegExp(name) }).click();
  }

  /** Create a new character */
  async createCharacter(name: string): Promise<void> {
    await this.navigate("Characters");
    const nameInput = this.page.getByPlaceholder("New Name");
    await nameInput.fill(name);
    await this.page.getByRole("button", { name: "+", exact: true }).click();
    // Wait for the character to appear in the sidebar list
    await expect(this.page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  }

  /** Get a spell row in the library table */
  getSpellRow(spellName: string) {
    return this.page.getByRole("row", { name: new RegExp(spellName) });
  }
}
