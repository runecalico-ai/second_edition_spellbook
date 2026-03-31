import path from "node:path";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../fixtures/constants";

/** Common selectors used throughout the app */
export const SELECTORS = {
  spellName: '[data-testid="spell-name-input"]',
  level: '[data-testid="spell-level-input"]',
  levelPlaceholder: '[placeholder="Level"]',
  description: '[data-testid="spell-description-textarea"]',
  descriptionLabel: '[aria-label="Description"]',
  cantripCheckbox: '[data-testid="chk-cantrip"]',
  questCheckbox: '[data-testid="chk-quest"]',
  reversibleCheckbox: '[data-testid="chk-reversible"]',
  classesInput: '[data-testid="spell-classes-input"]',
  classesLabel: '[aria-label="Classes (e.g. Mage, Cleric)"]',
  fileInput: '[data-testid="import-file-input"]',

  /** Spell editor: canon-first single-line detail inputs (default view) */
  detailRangeInput: '[data-testid="detail-range-input"]',
  detailDurationInput: '[data-testid="detail-duration-input"]',
  detailCastingTimeInput: '[data-testid="detail-casting-time-input"]',
  detailAreaInput: '[data-testid="detail-area-input"]',
  detailSavingThrowInput: '[data-testid="detail-saving-throw-input"]',
  detailDamageInput: '[data-testid="detail-damage-input"]',
  detailMagicResistanceInput: '[data-testid="detail-magic-resistance-input"]',
  detailComponentsInput: '[data-testid="detail-components-input"]',
  detailMaterialComponentsInput: '[data-testid="detail-material-components-input"]',

  /** Spell editor: expand/collapse for structured form (one per detail field) */
  detailRangeExpand: '[data-testid="detail-range-expand"]',
  detailDurationExpand: '[data-testid="detail-duration-expand"]',
  detailCastingTimeExpand: '[data-testid="detail-casting-time-expand"]',
  detailAreaExpand: '[data-testid="detail-area-expand"]',
  detailSavingThrowExpand: '[data-testid="detail-saving-throw-expand"]',
  detailDamageExpand: '[data-testid="detail-damage-expand"]',
  detailMagicResistanceExpand: '[data-testid="detail-magic-resistance-expand"]',
  detailComponentsExpand: '[data-testid="detail-components-expand"]',
  detailMaterialComponentsExpand: '[data-testid="detail-material-components-expand"]',

  /** Spell editor: primary actions */
  btnSaveSpell: '[data-testid="btn-save-spell"]',
  btnCancelEdit: '[data-testid="btn-cancel-edit"]',
  btnDeleteSpell: '[data-testid="btn-delete-spell"]',

  /** Spell editor: canonical hash (structured data spec) */
  spellDetailHashDisplay: '[data-testid="spell-detail-hash-display"]',
  spellDetailHashCopy: '[data-testid="spell-detail-hash-copy"]',
  spellDetailHashExpand: '[data-testid="spell-detail-hash-expand"]',
} as const;

export type SpellTradition = "ARCANE" | "DIVINE";

export interface CreateSpellOptions {
  name: string;
  level?: string;
  description?: string;
  source?: string;
  /** Defaults to ARCANE. Use DIVINE when filling `sphere` without `school`. */
  tradition?: SpellTradition;
  /** Applied only when tradition is ARCANE (ignored for DIVINE). */
  school?: string;
  /** Applied only when tradition is DIVINE. */
  sphere?: string;
  classes?: string;
  components?: string;
  tags?: string;
  isCantrip?: boolean;
  isQuest?: boolean;
  author?: string;
  edition?: string;
  license?: string;
  range?: string;
  castingTime?: string;
  duration?: string;
  area?: string;
  savingThrow?: string;
  materialComponents?: string;
  isReversible?: boolean;
}

interface SpellPickerFilterSnapshot {
  search: string;
  minLevel: string;
  maxLevel: string;
  tags: string;
  school: string;
  sphere: string;
  questOnly: boolean;
  cantripsOnly: boolean;
}

/**
 * Page Object Model for the Spellbook application.
 */
export class SpellbookApp {
  constructor(public page: Page) {}

  private getClassSection(className: string) {
    return this.page.getByLabel(`Class section for ${className}`);
  }

  private async waitForLibraryResultsToSettle(previousSearchRequestId?: string | null): Promise<void> {
    const resultsState = this.page.getByTestId("library-results-state");
    await expect(resultsState).toBeVisible({ timeout: TIMEOUTS.short });

    if (previousSearchRequestId) {
      await expect
        .poll(async () => resultsState.getAttribute("data-search-request-id"), {
          timeout: TIMEOUTS.medium,
          intervals: [50, 100, 200],
        })
        .not.toBe(previousSearchRequestId);
    }

    await expect(resultsState).toHaveAttribute("data-results-settled", "true", {
      timeout: TIMEOUTS.medium,
    });
  }

  private async waitForSpellPickerResultsToSettle(
    options: {
      previousSearchRequestId?: string | null;
      requireNewRequestId?: boolean;
      expectPristineFilters?: boolean;
    } = {},
  ): Promise<void> {
    const picker = this.page.getByTestId("spell-picker");
    await expect(picker).toBeVisible({ timeout: TIMEOUTS.short });

    const resultsState = picker.getByTestId("spell-picker-results-state");
    await expect(resultsState).toBeVisible({ timeout: TIMEOUTS.short });

    if (options.requireNewRequestId && options.previousSearchRequestId) {
      await expect
        .poll(async () => resultsState.getAttribute("data-search-request-id"), {
          timeout: TIMEOUTS.medium,
          intervals: [50, 100, 200],
        })
        .not.toBe(options.previousSearchRequestId);
    }

    await expect(resultsState).toHaveAttribute("data-results-settled", "true", {
      timeout: TIMEOUTS.medium,
    });

    await expect
      .poll(async () => {
        const [currentFilterKey, currentSettledFilterKey, resultsSettled] = await Promise.all([
          resultsState.getAttribute("data-filter-key"),
          resultsState.getAttribute("data-settled-filter-key"),
          resultsState.getAttribute("data-results-settled"),
        ]);

        return (
          resultsSettled === "true" &&
          Boolean(currentFilterKey) &&
          currentFilterKey === currentSettledFilterKey
        );
      }, {
        timeout: TIMEOUTS.medium,
        intervals: [100, 200, 300],
      })
      .toBe(true);

    if (options.expectPristineFilters) {
      await expect
        .poll(async () => {
          const snapshot = await this.getSpellPickerFilterSnapshot();
          return JSON.stringify(snapshot);
        }, {
          timeout: TIMEOUTS.medium,
          intervals: [100, 200, 300],
        })
        .toBe(JSON.stringify(this.getPristineSpellPickerFilterSnapshot()));
    }
  }

  private getPristineSpellPickerFilterSnapshot(): SpellPickerFilterSnapshot {
    return {
      search: "",
      minLevel: "",
      maxLevel: "",
      tags: "",
      school: "",
      sphere: "",
      questOnly: false,
      cantripsOnly: false,
    };
  }

  private async getSpellPickerFilterSnapshot(): Promise<SpellPickerFilterSnapshot> {
    const picker = this.page.getByTestId("spell-picker");

    const [search, minLevel, maxLevel, tags, school, sphere, questOnly, cantripsOnly] =
      await Promise.all([
        picker.getByTestId("spell-picker-search-input").inputValue(),
        picker.getByTestId("filter-level-min").inputValue(),
        picker.getByTestId("filter-level-max").inputValue(),
        picker.getByTestId("filter-tags-input").inputValue(),
        picker.getByTestId("filter-school-select").inputValue(),
        picker.getByTestId("filter-sphere-select").inputValue(),
        picker.getByTestId("filter-is-quest").isChecked(),
        picker.getByTestId("filter-is-cantrip").isChecked(),
      ]);

    return {
      search,
      minLevel,
      maxLevel,
      tags,
      school,
      sphere,
      questOnly,
      cantripsOnly,
    };
  }

  private getNextSpellPickerFilterSnapshot(filters: {
    search?: string;
    minLevel?: string;
    maxLevel?: string;
    tags?: string;
    school?: string;
    sphere?: string;
    questOnly?: boolean;
    cantripsOnly?: boolean;
  }, current: SpellPickerFilterSnapshot): SpellPickerFilterSnapshot {
    return {
      search: filters.search ?? current.search,
      minLevel: filters.minLevel ?? current.minLevel,
      maxLevel: filters.maxLevel ?? current.maxLevel,
      tags: filters.tags ?? current.tags,
      school: filters.school ?? current.school,
      sphere: filters.sphere ?? current.sphere,
      questOnly: filters.questOnly ?? current.questOnly,
      cantripsOnly: filters.cantripsOnly ?? current.cantripsOnly,
    };
  }

  private async waitForCharacterSave(buttonTestId: string, idleLabel: string): Promise<void> {
    const saveButton = this.page.getByTestId(buttonTestId);
    const savingState = expect(saveButton).toBeDisabled({ timeout: TIMEOUTS.short }).catch(() => {
      return undefined;
    });

    await saveButton.click();
    await savingState;
    await expect(saveButton).toBeEnabled({ timeout: TIMEOUTS.medium });
    await expect(saveButton).toHaveText(idleLabel, { timeout: TIMEOUTS.medium });
  }

  private async switchClassTab(
    className: string,
    listType: "KNOWN" | "PREPARED",
  ): Promise<ReturnType<SpellbookApp["getClassSection"]>> {
    const classSection = this.getClassSection(className);
    const tabButton = classSection.getByTestId(`tab-${listType.toLowerCase()}`);

    await tabButton.click();
    await expect(tabButton).toHaveAttribute("aria-pressed", "true", {
      timeout: TIMEOUTS.short,
    });

    return classSection;
  }

  /** Navigate to a page using the nav link (preferring nav bar links) */
  async navigate(
    label: "Library" | "Characters" | "Import" | "Chat" | "App" | "Add Spell" | "Export",
  ): Promise<void> {
    console.log(`Navigating to: ${label}`);
    if (label === "Add Spell") {
      await this.navigate("Library");
      await this.waitForLibrary();
      const addLink = this.page.getByTestId("link-add-spell");
      await addLink.waitFor({ state: "visible", timeout: TIMEOUTS.medium });
      await addLink.click();
    } else if (label === "Import") {
      await this.page.getByRole("navigation").getByRole("link", { name: "Import" }).click();
    } else {
      const link = this.page.getByRole("navigation").getByRole("link", { name: label });
      await link.click();
    }
    await this.page.waitForLoadState("domcontentloaded").catch(() => {});
  }

  /** Wait for the Spell Library heading to be visible */
  async waitForLibrary(): Promise<void> {
    await expect(this.page.getByRole("heading", { name: "Spell Library" })).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
  }

  /**
   * Create a new spell via Add Spell → form → Save.
   * Fills the canon-first single-line detail inputs (range, duration, etc.); expanding
   * structured forms is not required. Waits for Library after save.
   */
  async createSpell(options: CreateSpellOptions): Promise<void> {
    const {
      name,
      level = "1",
      description = "",
      source = "",
      tradition: traditionOpt,
      school,
      sphere,
      classes,
      isCantrip,
      isQuest,
    } = options;

    const tradition: SpellTradition = traditionOpt ?? (sphere && !school ? "DIVINE" : "ARCANE");

    // Omitted school on ARCANE: deterministic default so E2E saves stay valid after conditional School/Sphere UI.
    const effectiveSchool = tradition === "ARCANE" ? (school ?? "Alteration") : school;
    console.log(`Creating spell: ${name}`);
    await this.navigate("Add Spell");
    await expect(this.page.getByRole("heading", { name: "New Spell" })).toBeVisible({
      timeout: TIMEOUTS.medium,
    });

    const nameLoc = this.page.getByTestId("spell-name-input");
    await expect(nameLoc).toBeVisible({ timeout: TIMEOUTS.medium });
    await nameLoc.fill(name);
    await expect(nameLoc).toHaveValue(name);

    const levelLoc = this.page.getByTestId("spell-level-input");
    if (isCantrip) {
      await levelLoc.fill("0");
      const checkbox = this.page.getByTestId("chk-cantrip");
      await expect(checkbox).toBeEnabled();
      await checkbox.check();
    } else if (isQuest) {
      await levelLoc.fill("8");
      const checkbox = this.page.getByTestId("chk-quest");
      await expect(checkbox).toBeEnabled();
      await checkbox.check();
    } else {
      await levelLoc.fill(level.toString());
      await expect(levelLoc).toHaveValue(level.toString());
    }

    const traditionSelect = this.page.getByTestId("spell-tradition-select");
    await traditionSelect.selectOption(tradition);

    if (tradition === "ARCANE" && effectiveSchool) {
      const schoolLoc = this.page.getByTestId("spell-school-input");
      await expect(schoolLoc).toBeVisible({ timeout: TIMEOUTS.short });
      await schoolLoc.fill("");
      await schoolLoc.fill(effectiveSchool);
      await expect(schoolLoc).toHaveValue(effectiveSchool);
    }

    if (tradition === "DIVINE" && sphere) {
      const sphereLoc = this.page.getByTestId("spell-sphere-input");
      await expect(sphereLoc).toBeVisible({ timeout: TIMEOUTS.short });
      await sphereLoc.fill("");
      await sphereLoc.fill(sphere);
      await expect(sphereLoc).toHaveValue(sphere);
    }

    if (classes) {
      const classesLoc = this.page.getByTestId("spell-classes-input");
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

    if (options.author) {
      await this.page.getByLabel("Author").fill(options.author);
    }
    if (options.edition) {
      await this.page.getByLabel("Edition").fill(options.edition);
    }
    if (options.license) {
      await this.page.getByLabel("License").fill(options.license);
    }
    if (options.range) {
      await this.page.locator(SELECTORS.detailRangeInput).fill(options.range);
    }
    if (options.castingTime) {
      await this.page.locator(SELECTORS.detailCastingTimeInput).fill(options.castingTime);
    }
    if (options.duration) {
      await this.page.locator(SELECTORS.detailDurationInput).fill(options.duration);
    }
    if (options.area) {
      await this.page.locator(SELECTORS.detailAreaInput).fill(options.area);
    }
    if (options.savingThrow) {
      await this.page.locator(SELECTORS.detailSavingThrowInput).fill(options.savingThrow);
    }
    if (options.materialComponents) {
      const matLoc = this.page.locator(SELECTORS.detailMaterialComponentsInput);
      await matLoc.fill(options.materialComponents);
    }
    if (options.isReversible !== undefined) {
      await this.page.getByLabel("Reversible").setChecked(options.isReversible);
    }

    if (description) {
      const descLoc = this.page.getByTestId("spell-description-textarea");
      await descLoc.fill(description);
      await expect(descLoc).toHaveValue(description);
    }

    if (options.components) {
      const compLoc = this.page.locator(SELECTORS.detailComponentsInput);
      await compLoc.fill(options.components);
      await expect(compLoc).toHaveValue(options.components);
    }

    if (options.tags) {
      const tagsLoc = this.page.getByLabel("Tags");
      await tagsLoc.fill("");
      await tagsLoc.fill(options.tags);
      await expect(tagsLoc).toHaveValue(options.tags);
    }

    await this.page.locator(SELECTORS.btnSaveSpell).click();
    console.log(`Saved spell: ${name}, waiting for Library...`);
    await this.waitForLibrary();
  }

  /** Reset the import wizard to the first step */
  async resetImportWizard(): Promise<void> {
    console.log("Resetting import wizard...");
    // Land on Library first so /edit/* is unmounted (avoids strict-mode "Cancel" clashes with SpellEditor).
    await this.navigate("Library");
    await this.waitForLibrary();
    await this.navigate("Import");
    const importMoreBtn = this.page.getByRole("button", {
      name: "Import More Files",
    });
    if (await importMoreBtn.isVisible()) {
      await importMoreBtn.click();
    }
    const fieldMapperCancel = this.page.getByTestId("btn-import-field-mapper-cancel");
    if (await fieldMapperCancel.isVisible()) {
      await fieldMapperCancel.click();
    }
    const modalCancel = this.page.getByTestId("modal-button-cancel");
    if (await modalCancel.isVisible()) {
      await modalCancel.click();
    }
  }

  /** Import a file through the import wizard */
  async importFile(filePath: string | string[], allowOverwrite = false): Promise<void> {
    console.log(`Importing file(s): ${filePath}`);
    await this.resetImportWizard();

    const fileInput = this.page.locator(SELECTORS.fileInput);
    await expect(fileInput).toBeVisible({ timeout: TIMEOUTS.medium });

    await fileInput.setInputFiles(filePath);

    if (Array.isArray(filePath)) {
      await expect(this.page.getByText(`${filePath.length} file(s) selected`)).toBeVisible();
    } else {
      await expect(this.page.getByText(path.basename(filePath))).toBeVisible();
    }

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

  /**
   * Open a spell in the editor by name (Library → search → click).
   * Waits for Edit Spell heading; editor shows canon-first single-line detail inputs by default.
   */
  async openSpell(name: string): Promise<void> {
    console.log(`Opening spell: ${name}`);
    await this.navigate("Library");
    await this.waitForLibrary();
    const resultsState = this.page.getByTestId("library-results-state");
    const previousSearchRequestId = await resultsState.getAttribute("data-search-request-id");
    await this.page.getByTestId("search-input").fill(name);
    await this.page.getByTestId("library-search-button").click();
    await this.waitForLibraryResultsToSettle(previousSearchRequestId);

    // Wait for the specific spell link to appear in the table
    const spellLink = this.page.getByRole("link", { name, exact: true });
    await expect(spellLink).toBeVisible({ timeout: TIMEOUTS.medium });

    // Explicitly wait for navigation after click
    // navigating via href is more robust than clicking in some Tauri contexts
    // But we revert to click() as the original issue was likely front matter
    await spellLink.click();

    await expect(this.page).toHaveURL(/\/edit\/\d+/, {
      timeout: TIMEOUTS.medium,
    });
    await expect(this.page.getByRole("heading", { name: "Edit Spell" })).toBeVisible();
  }

  /** Seed a legacy conflicted spell row through the test-only Tauri command and reload Library. */
  async seedConflictedSpell(name: string): Promise<void> {
    await this.navigate("Library");
    await this.page.evaluate(async (spellName: string) => {
      const internals = (
        window as Window & {
          __TAURI_INTERNALS__?: { invoke: (command: string, args?: object) => Promise<unknown> };
        }
      ).__TAURI_INTERNALS__;

      if (!internals?.invoke) {
        throw new Error("Tauri invoke not available");
      }

      await internals.invoke("test_seed_conflicted_spell", { name: spellName });
    }, name);
    await this.page.reload();
    await this.waitForLibrary();
  }

  /** Clear all library filters */
  async clearFilters(): Promise<void> {
    console.log("Clearing filters");
    await this.navigate("Library");
    await this.waitForLibrary();

    const resultsState = this.page.getByTestId("library-results-state");
    const previousSearchRequestId = await resultsState.getAttribute("data-search-request-id");

    const clearBtn = this.page.getByRole("button", { name: /Clear|Reset/i });
    if (await clearBtn.isVisible()) {
      await clearBtn.click();
    } else {
      // Manual clear fallback if button not found
      const searchBox = this.page.getByTestId("search-input");
      await searchBox.clear();
      await this.page.getByTestId("library-search-button").click();
    }

    await this.waitForLibraryResultsToSettle(previousSearchRequestId);
  }

  /** Select a character by name */
  async selectCharacter(name: string): Promise<void> {
    console.log(`Selecting character: ${name}`);
    await this.navigate("Characters");
    await this.page.getByRole("link", { name: name }).click();
  }

  /** Create a new character */
  async createCharacter(name: string): Promise<void> {
    console.log(`Creating character: ${name}`);
    await this.navigate("Characters");
    const nameInput = this.page.getByPlaceholder("New Name");
    await nameInput.fill(name);
    await this.page.getByRole("button", { name: "+", exact: true }).click();
    // Wait for the character to appear in the sidebar list
    await expect(this.page.getByRole("link", { name: name })).toBeVisible();
  }

  /** Get a spell row in the library table */
  getSpellRow(spellName: string) {
    console.log(`Getting spell row: ${spellName}`);
    return this.page.getByRole("row", { name: spellName });
  }

  /** Get the missing-library placeholder row in the character class spell list */
  getMissingSpellRow() {
    return this.page.getByTestId("spell-row-missing");
  }

  /** Open character editor by name */
  async openCharacterEditor(name: string): Promise<void> {
    console.log(`Opening character editor: ${name}`);
    await this.navigate("Characters");
    const link = this.page.getByRole("link", { name: name });
    await expect(link).toBeVisible();
    await link.click();
    await expect(this.page).toHaveURL(/\/character\/\d+\/edit/);
    await this.waitForProfileLoad();
  }

  /** Wait for the character profile loading state to disappear */
  async waitForProfileLoad(): Promise<void> {
    const loading = this.page.getByText("Loading character profile...");
    await expect(loading).not.toBeVisible({ timeout: TIMEOUTS.medium });
  }

  /** Update character identity */
  async updateIdentity(options: {
    race?: string;
    alignment?: string;
    enableCom?: boolean;
  }): Promise<void> {
    console.log("Updating character identity");
    if (options.race) {
      await this.page.getByTestId("char-race-input").fill(options.race);
    }
    if (options.alignment) {
      await this.page.getByTestId("char-alignment-select").selectOption(options.alignment);
    }
    if (options.enableCom !== undefined) {
      await this.page.getByTestId("toggle-com-checkbox").setChecked(options.enableCom, {
        force: true,
      });
    }
    await this.waitForCharacterSave("btn-save-identity", "Save Identity");
  }

  /** Open spell picker for a class */
  async openSpellPicker(className: string, listType: "KNOWN" | "PREPARED"): Promise<void> {
    console.log(`Opening spell picker for ${className} ${listType}`);
    const section = await this.switchClassTab(className, listType);
    // Click ADD
    await section.getByTestId("btn-open-spell-picker").click();

    const picker = this.page.getByTestId("spell-picker");
    await expect(picker).toBeVisible({ timeout: TIMEOUTS.medium });
    await expect(picker.getByTestId("spell-picker-class-name-marker")).toHaveAttribute(
      "data-class-name",
      className,
      { timeout: TIMEOUTS.short },
    );
    await expect(picker.getByTestId("spell-picker-list-type")).toHaveAttribute(
      "data-list-type",
      listType,
      { timeout: TIMEOUTS.short },
    );

    await this.waitForSpellPickerResultsToSettle({
      expectPristineFilters: true,
    });
  }

  /** Update character abilities */
  async updateAbilities(abilities: { [key: string]: number }): Promise<void> {
    console.log("Updating character abilities");
    for (const [key, val] of Object.entries(abilities)) {
      await this.page.getByTestId(`ability-${key.toLowerCase()}-input`).fill(val.toString());
    }
    await this.waitForCharacterSave("btn-save-abilities", "Save Abilities");
  }

  /** Add a class to the character */
  async addClass(className: string, customLabel?: string): Promise<void> {
    console.log(`Adding class: ${className}`);
    if (className === "Other" && customLabel) {
      this.page.once("dialog", async (dialog) => {
        await dialog.accept(customLabel);
      });
    }
    const select = this.page.locator("#new-class-select");
    await expect(select).toBeEnabled({ timeout: TIMEOUTS.medium });
    await select.selectOption(className);

    // Wait for the class row to appear in the list using data-testid
    const displayName = className === "Other" && customLabel ? customLabel : className;
    const classRow = this.page
      .locator(`[data-testid="class-row"]`)
      .filter({ hasText: displayName });
    await expect(classRow).toBeVisible({ timeout: TIMEOUTS.medium });

    // Ensure select is back to default and enabled
    await expect(select).toHaveValue("");
    await expect(select).toBeEnabled();
    console.log(`Class added and verified: ${displayName}`);
  }

  /** Add a spell to a class list */
  async addSpellToClass(
    className: string,
    spellName: string,
    listType: "KNOWN" | "PREPARED",
  ): Promise<void> {
    console.log(`Adding spell ${spellName} to class ${className} (${listType})`);
    const classSection = await this.switchClassTab(className, listType);
    await classSection.getByTestId("btn-open-spell-picker").click();

    // Wait for the specific picker modal to appear
    const picker = this.page.getByTestId("spell-picker");
    await expect(picker).toBeVisible({ timeout: TIMEOUTS.medium });
    console.log("Picker visible, searching for spell...");

    await picker.getByTestId("spell-picker-search-input").fill(spellName);

    const spellRow = picker.getByTestId(`spell-row-${spellName}`);
    await expect(spellRow).toBeVisible({ timeout: TIMEOUTS.medium });
    await spellRow.getByRole("button", { name: "ADD", exact: true }).click();
    console.log("Clicked ADD, closing picker...");

    // Optionally wait for picker to close if it doesn't close automatically
    await expect(picker).not.toBeVisible({ timeout: TIMEOUTS.medium });

    await expect(classSection.getByText(spellName)).toBeVisible();
    console.log(`Spell ${spellName} verified in class ${className}`);
  }

  /** Set library filters */
  async setLibraryFilters(filters: {
    questOnly?: boolean;
    cantripsOnly?: boolean;
    className?: string;
    component?: string;
    tag?: string;
    search?: string;
  }): Promise<void> {
    console.log("Setting library filters", filters);
    await this.navigate("Library");
    await this.waitForLibrary();

    const resultsState = this.page.getByTestId("library-results-state");
    const previousSearchRequestId = await resultsState.getAttribute("data-search-request-id");

    if (filters.search !== undefined) {
      const searchInput = this.page.getByTestId("search-input");
      await searchInput.fill(filters.search);
    }

    if (filters.className !== undefined) {
      await this.page.getByTestId("filter-class-select").selectOption(filters.className);
    }

    if (filters.component !== undefined) {
      await this.page.getByTestId("filter-component-select").selectOption(filters.component);
    }

    if (filters.tag !== undefined) {
      await this.page.getByTestId("filter-tag-select").selectOption(filters.tag);
    }

    if (filters.questOnly !== undefined) {
      const questCheckbox = this.page.getByTestId("filter-quest-checkbox");
      await questCheckbox.setChecked(filters.questOnly);
    }

    if (filters.cantripsOnly !== undefined) {
      const cantripCheckbox = this.page.getByTestId("filter-cantrip-checkbox");
      await cantripCheckbox.setChecked(filters.cantripsOnly);
    }

    // Trigger search if we filled filters or clear it
    await this.page.getByTestId("library-search-button").click();
    await this.waitForLibraryResultsToSettle(previousSearchRequestId);
  }

  /** Set filters in the open spell picker dialog */
  async setSpellPickerFilters(filters: {
    search?: string;
    minLevel?: string;
    maxLevel?: string;
    tags?: string;
    school?: string;
    sphere?: string;
    questOnly?: boolean;
    cantripsOnly?: boolean;
  }): Promise<void> {
    const picker = this.page.getByTestId("spell-picker");
    await expect(picker).toBeVisible();
    const resultsState = picker.getByTestId("spell-picker-results-state");
    const [currentFilters, previousSearchRequestId] = await Promise.all([
      this.getSpellPickerFilterSnapshot(),
      resultsState.getAttribute("data-search-request-id"),
    ]);
    const nextFilters = this.getNextSpellPickerFilterSnapshot(filters, currentFilters);
    const requireNewRequestId = JSON.stringify(currentFilters) !== JSON.stringify(nextFilters);

    if (filters.search !== undefined) {
      await picker.getByTestId("spell-picker-search-input").fill(filters.search);
    }

    if (filters.minLevel !== undefined) {
      await picker.getByTestId("filter-level-min").fill(filters.minLevel);
    }

    if (filters.maxLevel !== undefined) {
      await picker.getByTestId("filter-level-max").fill(filters.maxLevel);
    }

    if (filters.tags !== undefined) {
      await picker.getByTestId("filter-tags-input").fill(filters.tags);
    }

    if (filters.school !== undefined) {
      await picker.getByTestId("filter-school-select").selectOption(filters.school);
    }

    if (filters.sphere !== undefined) {
      await picker.getByTestId("filter-sphere-select").selectOption(filters.sphere);
    }

    if (filters.questOnly !== undefined) {
      await picker.getByTestId("filter-is-quest").setChecked(filters.questOnly);
    }

    if (filters.cantripsOnly !== undefined) {
      await picker.getByTestId("filter-is-cantrip").setChecked(filters.cantripsOnly);
    }

    await this.waitForSpellPickerResultsToSettle({
      previousSearchRequestId,
      requireNewRequestId,
    });
  }

  /** Clear all filters in the open spell picker dialog */
  async clearSpellPickerFilters(): Promise<void> {
    const picker = this.page.getByTestId("spell-picker");
    await expect(picker).toBeVisible();
    const resultsState = picker.getByTestId("spell-picker-results-state");
    const [currentFilters, previousSearchRequestId] = await Promise.all([
      this.getSpellPickerFilterSnapshot(),
      resultsState.getAttribute("data-search-request-id"),
    ]);
    const requireNewRequestId =
      JSON.stringify(currentFilters) !== JSON.stringify(this.getPristineSpellPickerFilterSnapshot());

    await picker.getByTestId("spell-picker-search-input").clear();
    await picker.getByTestId("filter-level-min").clear();
    await picker.getByTestId("filter-level-max").clear();
    await picker.getByTestId("filter-tags-input").clear();
    await picker.getByTestId("filter-school-select").selectOption("");
    await picker.getByTestId("filter-sphere-select").selectOption("");
    await picker.getByTestId("filter-is-quest").setChecked(false);
    await picker.getByTestId("filter-is-cantrip").setChecked(false);

    await this.waitForSpellPickerResultsToSettle({
      previousSearchRequestId,
      requireNewRequestId,
    });
  }

  /** Select multiple spells in the picker and click BULK ADD */
  async bulkAddSpells(names: string[]): Promise<void> {
    const picker = this.page.getByTestId("spell-picker");
    await expect(picker).toBeVisible();
    const searchInput = picker.getByTestId("spell-picker-search-input");

    // Clear filters first to ensure all spells can be found
    await this.clearSpellPickerFilters();

    for (const name of names) {
      await searchInput.fill(name);
      const row = picker.getByTestId(`spell-row-${name}`);
      await expect(row).toBeVisible();
      await row.locator('input[type="checkbox"]').check();
      // Clear search for next one
      await searchInput.clear();
    }

    await picker.getByRole("button", { name: "BULK ADD", exact: true }).click();
    await expect(picker).not.toBeVisible();
  }

  /**
   * Get the level input for a specific class in the Classes panel.
   * This targets the main class level input (with +/- buttons) in the Classes section,
   * NOT the level input in the Spell Management section.
   */
  getClassLevelInput(className: string) {
    console.log(`Getting level input for class: ${className}`);
    const classRow = this.page.getByTestId("class-row").filter({ hasText: className });
    return classRow.locator('input[type="number"]');
  }

  /** Delete the currently open character profile via header button */
  async deleteCurrentCharacter(): Promise<void> {
    console.log("Deleting current character via header button");
    await this.page.getByRole("button", { name: "DELETE PROFILE" }).click();
  }

  /** Verify character does not exist in the character list */
  async verifyCharacterNotExists(name: string): Promise<void> {
    console.log(`Verifying character does not exist: ${name}`);
    await this.navigate("Characters");
    await expect(this.page.getByRole("link", { name })).not.toBeVisible();
  }

  /** Delete a character from the main list view */
  async deleteCharacterFromList(name: string): Promise<void> {
    console.log(`Deleting character from list: ${name}`);
    await this.navigate("Characters");

    // Hover over the character item to reveal the delete button
    const testId = `character-item-${name.replace(/\s+/g, "-").toLowerCase()}`;
    const charItem = this.page.getByTestId(testId);
    await charItem.hover();

    // Handle confirmation dialog
    this.page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain(`Are you sure you want to delete "${name}"?`);
      await dialog.accept();
    });

    // Click delete button inside the item
    await charItem.locator('button[title="Delete Character"]').click();

    // Verify gone
    await expect(charItem).not.toBeVisible();
  }
  /** Remove a spell from a class list */
  async removeSpellFromClass(
    className: string,
    listType: "KNOWN" | "PREPARED",
    spellName: string,
  ): Promise<void> {
    console.log(`Removing spell ${spellName} from class ${className} (${listType})`);
    const classSection = await this.switchClassTab(className, listType);

    const spellRow = classSection.getByTestId(`spell-row-${spellName}`);
    await expect(spellRow).toBeVisible({ timeout: TIMEOUTS.medium });

    await spellRow.getByRole("button", { name: "Remove spell" }).click();

    // Verify removal
    await expect(classSection.getByText(spellName)).not.toBeVisible();
  }

  /** Verify a spell exists or does not exist in a class list */
  async verifySpellInClassList(
    className: string,
    listType: "KNOWN" | "PREPARED",
    spellName: string,
    shouldExist: boolean,
  ): Promise<void> {
    console.log(
      `Verifying spell ${spellName} ${shouldExist ? "exists" : "does not exist"} in class ${className} (${listType})`,
    );
    const classSection = await this.switchClassTab(className, listType);
    const spellRow = classSection.getByTestId(`spell-row-${spellName}`);

    if (shouldExist) {
      await expect(spellRow).toBeVisible({ timeout: TIMEOUTS.medium });
    } else {
      await expect(spellRow).not.toBeVisible();
    }
  }

  /** Open the spellbook builder for a character */
  async openSpellbookBuilder(name: string): Promise<void> {
    console.log(`Opening spellbook builder for: ${name}`);
      await this.openCharacterEditor(name);
      const builderLink = this.page.getByTestId("link-open-spellbook-builder");
      await expect(builderLink).toBeVisible({ timeout: TIMEOUTS.medium });
      await builderLink.click();
      await expect(this.page).toHaveURL(/\/character\/\d+\/builder/, {
        timeout: TIMEOUTS.medium,
      });
    await expect(this.page.getByRole("heading", { name: "Spellbook Builder" })).toBeVisible();
  }

  /** Set prepared status for a spell in the spellbook builder */
  async setPrepared(spellName: string, prepared: boolean): Promise<void> {
    const slug = spellName.replace(/\s+/g, "-").toLowerCase();
    const checkbox = this.page.getByTestId(`chk-prepared-${slug}`);
    if (prepared) {
      await checkbox.check();
    } else {
      await checkbox.uncheck();
    }
  }

  /** Set known status for a spell in the spellbook builder */
  async setKnown(spellName: string, known: boolean): Promise<void> {
    const slug = spellName.replace(/\s+/g, "-").toLowerCase();
    const checkbox = this.page.getByTestId(`chk-known-${slug}`);
    if (known) {
      await checkbox.check();
    } else {
      await checkbox.uncheck();
    }
  }

  /** Update notes for a spell in the spellbook builder */
  async updateSpellbookNotes(spellName: string, notes: string): Promise<void> {
    const slug = spellName.replace(/\s+/g, "-").toLowerCase();
    const input = this.page.getByTestId(`input-notes-${slug}`);
    await input.fill(notes);
    await input.blur();
  }

  /** Remove a spell from the spellbook builder */
  async removeSpellFromBuilder(spellName: string): Promise<void> {
    const slug = spellName.replace(/\s+/g, "-").toLowerCase();
    await this.page.getByTestId(`btn-remove-${slug}`).click();
    await expect(this.page.getByTestId(`spellbook-row-${slug}`)).not.toBeVisible();
  }

  /**
   * Import a `.json` spell bundle through the JSON import wizard path.
   * Navigates to Import, sets the file input to `filePath`, clicks Preview,
   * then clicks Import. Stops at the json-preview step with the Import button
   * available — does NOT resolve conflicts (call resolveNextConflict separately).
   *
   * Returns once either the result screen or the resolve-json conflict screen is visible.
   */
  async importJsonFile(filePath: string): Promise<void> {
    console.log(`Importing JSON file: ${filePath}`);
    await this.resetImportWizard();

    const fileInput = this.page.locator(SELECTORS.fileInput);
    await expect(fileInput).toBeVisible({ timeout: TIMEOUTS.medium });
    await fileInput.setInputFiles(filePath);

    // Wait for file selection to register
    await expect(this.page.getByText(path.basename(filePath))).toBeVisible({
      timeout: TIMEOUTS.short,
    });

    // Click the Preview button (which calls goToJsonPreview for .json files)
    await this.page.getByRole("button", { name: "Preview →" }).click();

    // Wait for json-preview step
    await expect(this.page.getByTestId("btn-import-json")).toBeVisible({
      timeout: TIMEOUTS.medium,
    });

    // Click Import to kick off import_spell_json
    await this.page.getByTestId("btn-import-json").click();

    // Wait for either: result screen (no conflicts) or resolve-json (has conflicts)
    await expect(
      this.page
        .locator('[data-testid="conflict-progress"]')
        .or(this.page.locator('[data-testid="btn-bulk-skip-all"]'))
        .or(this.page.locator('[data-testid="btn-import-more"]')),
    ).toBeVisible({ timeout: TIMEOUTS.long });
  }

  /**
   * Click a conflict resolution button on the per-conflict dialog.
   * @param action - "keep_existing" | "replace_with_new" | "keep_both"
   * @param applyToAll - If true, checks the Apply to All toggle first
   */
  async resolveNextConflict(
    action: "keep_existing" | "replace_with_new" | "keep_both",
    applyToAll = false,
  ): Promise<void> {
    if (applyToAll) {
      const toggle = this.page.getByTestId("toggle-apply-to-all");
      await expect(toggle).toBeVisible({ timeout: TIMEOUTS.short });
      if (!(await toggle.isChecked())) {
        await toggle.check();
      }
    }

    const testIdMap: Record<string, string> = {
      keep_existing: "btn-keep-existing-json",
      replace_with_new: "btn-replace-with-new",
      keep_both: "btn-keep-both",
    };

    await this.page.getByTestId(testIdMap[action]).click();
  }

  /** Inline spell-editor validation error (Chunk 2 — no routine validation modal). */
  async expectFieldError(testId: string): Promise<void> {
    await expect(this.page.getByTestId(testId)).toBeVisible({ timeout: TIMEOUTS.short });
  }

  /** Only the active School/Sphere branch should remain mounted for the selected tradition. */
  async expectActiveTraditionField(tradition: SpellTradition): Promise<void> {
    const schoolField = this.page.getByTestId("spell-school-field");
    const schoolInput = this.page.getByTestId("spell-school-input");
    const sphereField = this.page.getByTestId("spell-sphere-field");
    const sphereInput = this.page.getByTestId("spell-sphere-input");

    if (tradition === "ARCANE") {
      await expect(schoolField).toHaveCount(1);
      await expect(schoolInput).toHaveCount(1);
      await expect(schoolField).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(schoolInput).toBeVisible({ timeout: TIMEOUTS.short });
      await expect(sphereField).toHaveCount(0);
      await expect(sphereInput).toHaveCount(0);
      return;
    }

    await expect(sphereField).toHaveCount(1);
    await expect(sphereInput).toHaveCount(1);
    await expect(sphereField).toBeVisible({ timeout: TIMEOUTS.short });
    await expect(sphereInput).toBeVisible({ timeout: TIMEOUTS.short });
    await expect(schoolField).toHaveCount(0);
    await expect(schoolInput).toHaveCount(0);
  }

  /**
   * Routine spell-editor validation must not open a `role="dialog"` modal.
   * Call only on views where no dialog is expected (not e.g. spell picker / confirm).
   */
  async expectNoBlockingDialog(): Promise<void> {
    await expect(this.page.getByRole("dialog")).not.toBeVisible();
  }

  /** Success toast rendered inside the global notification viewport (polite live region). */
  async expectToastSuccessInViewport(message: string | RegExp): Promise<void> {
    const viewport = this.page.getByTestId("notification-viewport");
    await expect(viewport).toHaveAttribute("aria-live", "polite");
    const toast = viewport.getByTestId("toast-notification-success").filter({ hasText: message });
    await expect(toast.last()).toBeVisible({ timeout: TIMEOUTS.medium });
    await expect(toast.last()).toContainText(message);
  }

  async expectSpellSaveValidationHint(): Promise<void> {
    const hint = this.page.getByTestId("spell-save-validation-hint");
    await expect(hint).toBeVisible({ timeout: TIMEOUTS.short });
    await expect(hint).toHaveText("Fix the errors above to save");
  }
}
