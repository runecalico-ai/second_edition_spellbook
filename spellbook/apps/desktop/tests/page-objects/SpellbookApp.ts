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

/**
 * Page Object Model for the Spellbook application.
 */
export class SpellbookApp {
	constructor(public page: Page) {}

	/** Navigate to a page using the nav link (preferring nav bar links) */
	async navigate(
		label:
			| "Library"
			| "Characters"
			| "Import"
			| "Chat"
			| "App"
			| "Add Spell"
			| "Export",
	): Promise<void> {
		console.log(`Navigating to: ${label}`);
		if (label === "Add Spell") {
			await this.navigate("Library");
			await this.page.locator("#link-add-spell").click();
		} else {
			const link = this.page
				.getByRole("navigation")
				.getByRole("link", { name: label });
			await link.click();
		}
		await this.page.waitForLoadState("domcontentloaded").catch(() => {});
		await this.page.waitForTimeout(500);
	}

	/** Wait for the Library heading to be visible */
	async waitForLibrary(): Promise<void> {
		await expect(
			this.page.getByRole("heading", { name: "Library" }),
		).toBeVisible({
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
		console.log(`Creating spell: ${name}`);
		await this.navigate("Add Spell");
		await expect(
			this.page.getByRole("heading", { name: "New Spell" }),
		).toBeVisible();

		await this.page.waitForLoadState("networkidle");
		await this.page.waitForTimeout(500); // Allow React state to settle after mount

		const nameLoc = this.page.locator("#spell-name");
		await nameLoc.fill(name);
		await expect(nameLoc).toHaveValue(name);

		const levelLoc = this.page.locator("#spell-level");
		if (isCantrip) {
			await levelLoc.fill("0");
			const checkbox = this.page.locator(SELECTORS.cantripCheckbox);
			await expect(checkbox).toBeEnabled();
			await checkbox.check();
		} else if (isQuest) {
			await levelLoc.fill("8");
			const checkbox = this.page.locator(SELECTORS.questCheckbox);
			await expect(checkbox).toBeEnabled();
			await checkbox.check();
		} else {
			await levelLoc.fill(level.toString());
			await expect(levelLoc).toHaveValue(level.toString());
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
			await this.page.getByPlaceholder("Range").fill(options.range);
		}
		if (options.castingTime) {
			await this.page
				.getByPlaceholder("Casting Time")
				.fill(options.castingTime);
		}
		if (options.duration) {
			await this.page.getByPlaceholder("Duration").fill(options.duration);
		}
		if (options.area) {
			await this.page.getByPlaceholder("Area").fill(options.area);
		}
		if (options.savingThrow) {
			await this.page.getByPlaceholder("Save").fill(options.savingThrow);
		}
		if (options.materialComponents) {
			await this.page
				.getByLabel("Material Components")
				.fill(options.materialComponents);
		}
		if (options.isReversible !== undefined) {
			await this.page.getByLabel("Reversible").setChecked(options.isReversible);
		}

		if (description) {
			const descLoc = this.page.locator("#spell-description");
			await descLoc.fill(description);
			await expect(descLoc).toHaveValue(description);
		}

		if (options.components) {
			const compLoc = this.page.getByPlaceholder("Components (V,S,M)");
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
		console.log(`Saved spell: ${name}, waiting for Library...`);
		await this.waitForLibrary();
	}

	/** Reset the import wizard to the first step */
	async resetImportWizard(): Promise<void> {
		console.log("Resetting import wizard...");
		await this.navigate("Import");
		const importMoreBtn = this.page.getByRole("button", {
			name: "Import More Files",
		});
		if (await importMoreBtn.isVisible()) {
			await importMoreBtn.click();
		}
		const cancelBtn = this.page.getByRole("button", { name: "Cancel" });
		if (await cancelBtn.isVisible()) {
			await cancelBtn.click();
		}
	}

	/** Import a file through the import wizard */
	async importFile(
		filePath: string | string[],
		allowOverwrite = false,
	): Promise<void> {
		console.log(`Importing file(s): ${filePath}`);
		await this.resetImportWizard();

		const fileInput = this.page.locator(SELECTORS.fileInput);
		await expect(fileInput).toBeVisible({ timeout: TIMEOUTS.medium });

		await fileInput.setInputFiles(filePath);

		if (Array.isArray(filePath)) {
			await expect(
				this.page.getByText(`${filePath.length} file(s) selected`),
			).toBeVisible();
		} else {
			await expect(this.page.getByText(path.basename(filePath))).toBeVisible();
		}

		await this.page.getByRole("button", { name: "Preview →" }).click();
		await expect(this.page.getByText(/Parsed \d+ spell\(s\)/)).toBeVisible({
			timeout: TIMEOUTS.medium, // Parsing might happen locally but still good to have buffer
		});

		await this.page.getByRole("button", { name: "Skip Review →" }).click();

		if (allowOverwrite) {
			const overwriteCheckbox = this.page.getByLabel(
				"Overwrite existing spells",
			);
			await expect(overwriteCheckbox).toBeVisible({ timeout: TIMEOUTS.short });
			await overwriteCheckbox.check();
		}

		await this.page.getByRole("button", { name: "Start Import" }).click();

		// Wait for the results screen to show the "Import More Files" button as success indicator
		// This involves backend processing, so give it robust timeout
		await expect(
			this.page.getByRole("button", { name: "Import More Files" }),
		).toBeVisible({
			timeout: TIMEOUTS.long,
		});
	}

	/** Open a spell in the editor by name */
	async openSpell(name: string): Promise<void> {
		console.log(`Opening spell: ${name}`);
		await this.navigate("Library");
		await this.page.getByPlaceholder(/Search spells/i).fill(name);
		await this.page
			.getByRole("button", { name: "Search", exact: true })
			.click();

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
		await expect(
			this.page.getByRole("heading", { name: "Edit Spell" }),
		).toBeVisible();
	}

	/** Clear all library filters */
	async clearFilters(): Promise<void> {
		console.log("Clearing filters");
		await this.navigate("Library");
		const clearBtn = this.page.getByRole("button", { name: /Clear|Reset/i });
		if (await clearBtn.isVisible()) {
			await clearBtn.click();
		} else {
			// Manual clear fallback if button not found
			const searchBox = this.page.getByPlaceholder(/Search spells/i);
			await searchBox.clear();
			await this.page
				.getByRole("button", { name: "Search", exact: true })
				.click();
		}
	}

	/** Select a character by name */
	async selectCharacter(name: string): Promise<void> {
		console.log(`Selecting character: ${name}`);
		await this.navigate("Characters");
		await this.page.getByRole("link", { name: new RegExp(name) }).click();
	}

	/** Create a new character */
	async createCharacter(name: string): Promise<void> {
		console.log(`Creating character: ${name}`);
		await this.navigate("Characters");
		const nameInput = this.page.getByPlaceholder("New Name");
		await nameInput.fill(name);
		await this.page.getByRole("button", { name: "+", exact: true }).click();
		// Wait for the character to appear in the sidebar list
		await expect(
			this.page.getByRole("link", { name: new RegExp(name) }),
		).toBeVisible();
	}

	/** Get a spell row in the library table */
	getSpellRow(spellName: string) {
		console.log(`Getting spell row: ${spellName}`);
		return this.page.getByRole("row", { name: new RegExp(spellName) });
	}

	/** Open character editor by name */
	async openCharacterEditor(name: string): Promise<void> {
		console.log(`Opening character editor: ${name}`);
		await this.navigate("Characters");
		const link = this.page.getByRole("link", { name: new RegExp(name) });
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
			await this.page.locator("#char-race").fill(options.race);
		}
		if (options.alignment) {
			await this.page
				.locator("#char-alignment")
				.selectOption(options.alignment);
		}
		if (options.enableCom !== undefined) {
			await this.page
				.locator("#toggle-com")
				.setChecked(options.enableCom, { force: true });
		}
		await this.page.getByRole("button", { name: "Save Identity" }).click();
		await this.page.waitForTimeout(500); // Allow save to complete
	}

	/** Open spell picker for a class */
	async openSpellPicker(
		className: string,
		listType: "KNOWN" | "PREPARED",
	): Promise<void> {
		console.log(`Opening spell picker for ${className} ${listType}`);
		const section = this.page.getByLabel(`Class section for ${className}`);
		// Ensure the tab is active
		await section.getByRole("button", { name: listType, exact: true }).click();
		// Click ADD
		await section.getByRole("button", { name: "+ ADD", exact: true }).click();
	}

	/** Update character abilities */
	async updateAbilities(abilities: { [key: string]: number }): Promise<void> {
		console.log("Updating character abilities");
		for (const [key, val] of Object.entries(abilities)) {
			await this.page
				.getByLabel(key.toUpperCase(), { exact: true })
				.fill(val.toString());
		}
		await this.page.getByRole("button", { name: "Save Abilities" }).click();
		await this.page.waitForTimeout(500);
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
		const displayName =
			className === "Other" && customLabel ? customLabel : className;
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
		console.log(
			`Adding spell ${spellName} to class ${className} (${listType})`,
		);
		// Find the specific spell list container for this class using aria-label
		const classSection = this.page.locator(
			`[aria-label="Class section for ${className}"]`,
		);
		await classSection.getByRole("button", { name: listType }).click();
		await this.page.waitForTimeout(300);
		await classSection.getByRole("button", { name: "+ ADD" }).click();

		// Wait for the specific picker modal to appear
		const picker = this.page.locator('[data-testid="spell-picker"]');
		await expect(picker).toBeVisible({ timeout: TIMEOUTS.medium });
		console.log("Picker visible, searching for spell...");

		await picker.locator("#spell-search-input").fill(spellName);
		await this.page.waitForTimeout(1000); // Wait for search results and debounce
		await picker
			.getByRole("button", { name: "ADD", exact: true })
			.first()
			.click();
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

		if (filters.search !== undefined) {
			const searchInput = this.page.getByPlaceholder(/Search spells/i);
			await searchInput.fill(filters.search);
		}

		if (filters.className !== undefined) {
			await this.page
				.getByLabel("Class filter")
				.selectOption(filters.className);
		}

		if (filters.component !== undefined) {
			await this.page
				.getByLabel("Component filter")
				.selectOption(filters.component);
		}

		if (filters.tag !== undefined) {
			await this.page.getByLabel("Tag filter").selectOption(filters.tag);
		}

		if (filters.questOnly !== undefined) {
			const questCheckbox = this.page.locator(
				'label:has-text("Quest Spells") input',
			);
			await questCheckbox.setChecked(filters.questOnly);
		}

		if (filters.cantripsOnly !== undefined) {
			const cantripCheckbox = this.page.locator(
				'label:has-text("Cantrips Only") input',
			);
			await cantripCheckbox.setChecked(filters.cantripsOnly);
		}

		// Trigger search if we filled filters or clear it
		await this.page
			.getByRole("button", { name: "Search", exact: true })
			.click();

		// Wait for the search/filter to settle
		await this.page.waitForTimeout(500);
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

		if (filters.search !== undefined) {
			await picker
				.getByPlaceholder("Search spells by name...")
				.fill(filters.search);
		}

		if (filters.minLevel !== undefined) {
			await picker.getByPlaceholder("Min").fill(filters.minLevel);
		}

		if (filters.maxLevel !== undefined) {
			await picker.getByPlaceholder("Max").fill(filters.maxLevel);
		}

		if (filters.tags !== undefined) {
			await picker.getByPlaceholder("TAGS...").fill(filters.tags);
		}

		if (filters.school !== undefined) {
			await picker.locator("select").first().selectOption(filters.school);
		}

		if (filters.sphere !== undefined) {
			// Find sphere select (usually second one if both present, or only one)
			const selects = picker.locator("select");
			const count = await selects.count();
			if (count > 1) {
				await selects.nth(1).selectOption(filters.sphere);
			} else {
				await selects.first().selectOption(filters.sphere);
			}
		}

		if (filters.questOnly !== undefined) {
			await picker
				.locator("label")
				.filter({ hasText: "Quest" })
				.locator("input")
				.setChecked(filters.questOnly);
		}

		if (filters.cantripsOnly !== undefined) {
			await picker
				.locator("label")
				.filter({ hasText: "Cantrip" })
				.locator("input")
				.setChecked(filters.cantripsOnly);
		}

		// Settlement wait for debounce
		await this.page.waitForTimeout(300);
	}

	/** Clear all filters in the open spell picker dialog */
	async clearSpellPickerFilters(): Promise<void> {
		const picker = this.page.getByTestId("spell-picker");
		await expect(picker).toBeVisible();

		await picker.getByPlaceholder("Search spells by name...").clear();
		await picker.getByPlaceholder("Min").clear();
		await picker.getByPlaceholder("Max").clear();
		await picker.getByPlaceholder("TAGS...").clear();

		const selects = picker.locator("select");
		const count = await selects.count();
		for (let i = 0; i < count; i++) {
			await selects.nth(i).selectOption("");
		}

		await picker
			.locator("label")
			.filter({ hasText: "Quest" })
			.locator("input")
			.uncheck();
		await picker
			.locator("label")
			.filter({ hasText: "Cantrip" })
			.locator("input")
			.uncheck();

		await this.page.waitForTimeout(300);
	}

	/** Select multiple spells in the picker and click BULK ADD */
	async bulkAddSpells(names: string[]): Promise<void> {
		const picker = this.page.getByTestId("spell-picker");
		await expect(picker).toBeVisible();

		// Clear filters first to ensure all spells can be found
		await this.clearSpellPickerFilters();

		for (const name of names) {
			await picker.getByPlaceholder("Search spells by name...").fill(name);
			const row = picker.getByTestId(`spell-row-${name}`);
			await expect(row).toBeVisible();
			await row.locator('input[type="checkbox"]').check();
			// Clear search for next one
			await picker.getByPlaceholder("Search spells by name...").clear();
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
		const classRow = this.page
			.getByTestId("class-row")
			.filter({ hasText: className });
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
		const charItem = this.page.getByRole("link", { name: new RegExp(name) });
		await charItem.hover();

		// Handle confirmation dialog
		this.page.once("dialog", async (dialog) => {
			expect(dialog.message()).toContain(
				`Are you sure you want to delete "${name}"?`,
			);
			await dialog.accept();
		});

		// Click delete button inside the item
		await charItem.locator('button[title="Delete Character"]').click();

		// Verify gone
		await expect(
			this.page.getByRole("link", { name: new RegExp(name) }),
		).not.toBeVisible();
	}
}
