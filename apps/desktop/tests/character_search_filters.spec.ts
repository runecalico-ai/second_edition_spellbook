import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures/test-fixtures";
import { generateRunId } from "./fixtures/test-utils";
import { SpellbookApp } from "./page-objects/SpellbookApp";

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

async function reopenSpellPickerWithoutSettledWait(
  app: SpellbookApp,
  className: string,
  listType: "KNOWN" | "PREPARED",
) {
  const classSection = app.page.getByLabel(`Class section for ${className}`);
  await classSection.getByTestId(`tab-${listType.toLowerCase()}`).click();
  await classSection.getByTestId("btn-open-spell-picker").click();

  const picker = app.page.getByTestId("spell-picker");
  await expect(picker).toBeVisible();
  return picker;
}

async function getSpellPickerRowTestIds(picker: Locator) {
  return picker.locator('[data-testid^="spell-row-"]').evaluateAll((nodes) =>
    nodes
      .map((node) => node.getAttribute("data-testid"))
      .filter((value): value is string => Boolean(value))
      .sort(),
  );
}

async function installSpellPickerSearchRaceHarness(
  page: Page,
  delayByQuery: Record<string, number>,
) {
  await page.evaluate((queryDelays) => {
    window.__SPELLBOOK_E2E_SPELL_PICKER_SEARCH_DELAYS__ = queryDelays;
    window.__SPELLBOOK_E2E_SPELL_PICKER_SEARCH_EVENTS__ = [];
  }, delayByQuery);
}

async function resetSpellPickerSearchRaceHarnessEvents(page: Page) {
  await page.evaluate(() => {
    window.__SPELLBOOK_E2E_SPELL_PICKER_SEARCH_EVENTS__ = [];
  });
}

async function readSpellPickerSearchRaceHarnessEvents(page: Page) {
  return page.evaluate(() => {
    return window.__SPELLBOOK_E2E_SPELL_PICKER_SEARCH_EVENTS__ ?? [];
  });
}

async function readSpellPickerFilterKeyState(picker: Locator) {
  const resultsState = picker.getByTestId("spell-picker-results-state");
  const [filterKey, settledFilterKey] = await Promise.all([
    resultsState.getAttribute("data-filter-key"),
    resultsState.getAttribute("data-settled-filter-key"),
  ]);

  if (!filterKey || !settledFilterKey) {
    throw new Error("Spell picker filter keys were not present");
  }

  return {
    active: JSON.parse(filterKey) as { query: string; listType: "KNOWN" | "PREPARED" },
    settled: JSON.parse(settledFilterKey) as { query: string; listType: "KNOWN" | "PREPARED" },
  };
}

async function readSpellPickerSearchRequestId(picker: Locator) {
  const requestId = await picker
    .getByTestId("spell-picker-results-state")
    .getAttribute("data-search-request-id");

  if (!requestId) {
    throw new Error("Spell picker search request id was not present");
  }

  return requestId;
}

test.describe("Character Search Filters (KNOWN vs PREPARED)", () => {
  async function expectPickerResultsSettled(picker: Locator) {
    const resultsState = picker.getByTestId("spell-picker-results-state");

    await expect(resultsState).toHaveAttribute("data-results-settled", "true");
    expect(await resultsState.getAttribute("data-filter-key")).toBe(
      await resultsState.getAttribute("data-settled-filter-key"),
    );
  }

  async function expectReopenedPickerSettlesToPristineResults(
    picker: Locator,
    expectedRowTestIds: readonly string[],
  ) {
    await expectPickerResultsSettled(picker);

    await expect(
      picker.locator("label").filter({ hasText: "Quest" }).locator("input"),
    ).not.toBeChecked();
    await expect(
      picker.locator("label").filter({ hasText: "Cantrip" }).locator("input"),
    ).not.toBeChecked();
    await expect(picker.getByPlaceholder("Search spells by name...")).toHaveValue("");
    await expect(picker.getByPlaceholder("Min")).toHaveValue("");
    await expect(picker.getByPlaceholder("Max")).toHaveValue("");
    await expect(picker.getByPlaceholder("TAGS...")).toHaveValue("");
    await expect(picker.getByTestId("filter-school-select")).toHaveValue("");
    await expect(picker.getByTestId("filter-sphere-select")).toHaveValue("");

    const rowTestIds = await picker.locator('[data-testid^="spell-row-"]').evaluateAll((nodes) =>
      nodes
        .map((node) => node.getAttribute("data-testid"))
        .filter((value): value is string => Boolean(value))
        .sort(),
    );

    expect(rowTestIds).toEqual(expectedRowTestIds);
  }

  test("KNOWN picker ignores stale out-of-order search completions and keeps the latest query settled", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    const alphaSpell = `RaceAlpha_${runId}`;
    const betaSpell = `RaceBeta_${runId}`;

    await test.step("Setup: Create spells, add a class, and install deterministic query delays", async () => {
      await app.createSpell({
        name: alphaSpell,
        level: "1",
        school: "Alteration",
        description: "Alpha race result",
      });
      await app.createSpell({
        name: betaSpell,
        level: "2",
        school: "Evocation",
        description: "Beta race result",
      });

      const charName = `FilterSync_${runId}`;
      await app.createCharacter(charName);
      await app.openCharacterEditor(charName);
      await app.addClass("Mage");

      await installSpellPickerSearchRaceHarness(page, {
        [`KNOWN:${alphaSpell}`]: 350,
        [`KNOWN:${betaSpell}`]: 25,
      });

      await app.openSpellPicker("Mage", "KNOWN");
    });

    const picker = page.getByTestId("spell-picker");
    const searchInput = picker.getByTestId("spell-picker-search-input");

    await test.step("Rapid overlapping searches resolve out of order but only the latest query wins", async () => {
      await resetSpellPickerSearchRaceHarnessEvents(page);

      await searchInput.fill(alphaSpell);
      await searchInput.fill(betaSpell);

      await expect
        .poll(async () => {
          const events = await readSpellPickerSearchRaceHarnessEvents(page);
          return events
            .filter((event) => event.query === alphaSpell || event.query === betaSpell)
            .map((event) => `${event.phase}:${event.query}`);
        })
        .toEqual([
          `start:${alphaSpell}`,
          `start:${betaSpell}`,
          `resolve:${betaSpell}`,
          `resolve:${alphaSpell}`,
        ]);

      await expectPickerResultsSettled(picker);

      const filterKeyState = await readSpellPickerFilterKeyState(picker);
      expect(filterKeyState.active).toMatchObject({ listType: "KNOWN", query: betaSpell });
      expect(filterKeyState.settled).toMatchObject({ listType: "KNOWN", query: betaSpell });

      expect(await getSpellPickerRowTestIds(picker)).toEqual([`spell-row-${betaSpell}`]);
    });
  });

  test("PREPARED picker keeps the latest rapid filter input settled", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    const alphaSpell = `PreparedAlpha_${runId}`;
    const betaSpell = `PreparedBeta_${runId}`;

    await test.step("Setup: Create spells, add them to KNOWN, and open PREPARED picker", async () => {
      await app.createSpell({
        name: alphaSpell,
        level: "1",
        school: "Alteration",
        description: "Alpha prepared",
      });
      await app.createSpell({
        name: betaSpell,
        level: "2",
        school: "Evocation",
        description: "Beta prepared",
      });

      const charName = `PreparedFilterSync_${runId}`;
      await app.createCharacter(charName);
      await app.openCharacterEditor(charName);
      await app.addClass("Mage");
      await app.addSpellToClass("Mage", alphaSpell, "KNOWN");
      await app.addSpellToClass("Mage", betaSpell, "KNOWN");
      await installSpellPickerSearchRaceHarness(page, {
        [`PREPARED:${alphaSpell}`]: 200,
        [`PREPARED:${betaSpell}`]: 25,
      });
      await app.openSpellPicker("Mage", "PREPARED");

      await expect(page.getByTestId("spell-picker-class-name-marker")).toHaveAttribute(
        "data-class-name",
        "Mage",
      );
    });

    const picker = page.getByTestId("spell-picker");
    const searchInput = picker.getByTestId("spell-picker-search-input");

    await test.step("Back-to-back local filter updates still settle on the latest query", async () => {
      await resetSpellPickerSearchRaceHarnessEvents(page);
      await searchInput.fill(alphaSpell);
      await searchInput.fill(betaSpell);

      await expect
        .poll(async () => {
          const events = await readSpellPickerSearchRaceHarnessEvents(page);
          return events
            .filter((event) => event.query === alphaSpell || event.query === betaSpell)
            .map((event) => `${event.phase}:${event.query}`);
        })
        .toEqual([
          `start:${alphaSpell}`,
          `start:${betaSpell}`,
          `resolve:${betaSpell}`,
          `resolve:${alphaSpell}`,
        ]);

      await expectPickerResultsSettled(picker);

      const filterKeyState = await readSpellPickerFilterKeyState(picker);
      expect(filterKeyState.active).toMatchObject({ listType: "PREPARED", query: betaSpell });
      expect(filterKeyState.settled).toMatchObject({ listType: "PREPARED", query: betaSpell });

      expect(await getSpellPickerRowTestIds(picker)).toEqual([`spell-row-${betaSpell}`]);
    });
  });

  test("should filter correctly when adding spells to KNOWN list", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    const spells = [
      {
        name: `Quest_Spell_${runId}`,
        level: "8",
        sphere: "All",
        description: "Q",
        isQuest: true,
      },
      {
        name: `Cantrip_Spell_${runId}`,
        level: "0",
        school: "Alteration",
        description: "C",
        isCantrip: true,
      },
      {
        name: `High_Level_${runId}`,
        level: "9",
        school: "Necromancy",
        description: "H",
        tags: "Chaos",
      },
      {
        name: `Sphere_Spell_${runId}`,
        level: "2",
        sphere: "Healing",
        description: "S",
      },
    ];

    await test.step("Setup: Create diverse spells", async () => {
      for (const s of spells) {
        await app.createSpell(s);
      }
    });

    await test.step("Setup: Create character and add Mage class", async () => {
      const charName = `Searcher_${runId}`;
      await app.createCharacter(charName);
      await app.openCharacterEditor(charName);
      await app.addClass("Mage");
    });

    await test.step("KNOWN List: Test search and global filters", async () => {
      await app.openSpellPicker("Mage", "KNOWN");
      const picker = page.getByTestId("spell-picker");

      // Test Quest filter
      await app.setSpellPickerFilters({ questOnly: true });
      await expect(picker.getByText(`Quest_Spell_${runId}`)).toBeVisible();
      await expect(picker.getByText(`Cantrip_Spell_${runId}`)).not.toBeVisible();

      // Reset quest and test Level Range
      await app.setSpellPickerFilters({
        questOnly: false,
        minLevel: "9",
        maxLevel: "9",
      });
      await expect(picker.getByText(`High_Level_${runId}`)).toBeVisible();
      await expect(picker.getByText(`Quest_Spell_${runId}`)).not.toBeVisible();

      // Reset level and test Tag filter
      await app.setSpellPickerFilters({
        minLevel: "",
        maxLevel: "",
        tags: "Chaos",
      });
      await expect(picker.getByText(`High_Level_${runId}`)).toBeVisible();
      await expect(picker.getByText(`Quest_Spell_${runId}`)).not.toBeVisible();

      // Add spells via bulk add
      await app.bulkAddSpells(spells.map((s) => s.name));
    });

    await test.step("PREPARED List: Test local filters", async () => {
      await app.openSpellPicker("Mage", "PREPARED");
      const picker = page.getByTestId("spell-picker");

      // Test Cantrip filter locally
      await app.setSpellPickerFilters({ cantripsOnly: true });
      await expect(picker.getByText(`Cantrip_Spell_${runId}`)).toBeVisible();
      await expect(picker.getByText(`High_Level_${runId}`)).not.toBeVisible();

      // Test Sphere filter locally
      await app.setSpellPickerFilters({
        cantripsOnly: false,
        sphere: "Healing",
      });
      await expect(picker.getByText(`Sphere_Spell_${runId}`)).toBeVisible();
      await expect(picker.getByText(`Cantrip_Spell_${runId}`)).not.toBeVisible();
    });
  });

  test("reopening the spell picker resets filters, starts loading, and settles to pristine results for KNOWN and PREPARED", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();

    const alphaSpell = `FilterResetAlpha_${runId}`;
    const betaSpell = `FilterResetBeta_${runId}`;

    await test.step("Setup: Create spell and character", async () => {
      await app.createSpell({
        name: alphaSpell,
        level: "5",
        school: "Evocation",
        description: "Alpha",
        tags: "Fire",
      });
      await app.createSpell({
        name: betaSpell,
        level: "2",
        school: "Alteration",
        description: "Beta",
        tags: "Storm",
      });

      const charName = `FilterReset_${runId}`;
      await app.createCharacter(charName);
      await app.openCharacterEditor(charName);
      await app.addClass("Mage");
      await app.addSpellToClass("Mage", alphaSpell, "KNOWN");
      await app.addSpellToClass("Mage", betaSpell, "KNOWN");

      await installSpellPickerSearchRaceHarness(page, {
        "KNOWN:": 25,
        [`KNOWN:${alphaSpell}`]: 350,
        "PREPARED:": 25,
        [`PREPARED:${alphaSpell}`]: 350,
      });
    });

    for (const [listType, expectedRowTestIds] of [
      ["KNOWN", [`spell-row-${alphaSpell}`, `spell-row-${betaSpell}`]],
      ["PREPARED", [`spell-row-${alphaSpell}`, `spell-row-${betaSpell}`]],
    ] as const) {
      await test.step(`Apply narrowing filters, close, and reopen ${listType} from loading to pristine results`, async () => {
        await app.openSpellPicker("Mage", listType);
        const picker = page.getByTestId("spell-picker");
        const resultsState = picker.getByTestId("spell-picker-results-state");
        const searchInput = picker.getByTestId("spell-picker-search-input");

        await app.setSpellPickerFilters({
          minLevel: "5",
          maxLevel: "9",
          tags: "Fire",
        });

        const preCloseSettledRequestId = await readSpellPickerSearchRequestId(picker);

        await resetSpellPickerSearchRaceHarnessEvents(page);
        await searchInput.fill(alphaSpell);

        let delayedPreCloseRequestId: string | null = null;
        await expect
          .poll(async () => {
            const [requestId, settled] = await Promise.all([
              resultsState.getAttribute("data-search-request-id"),
              resultsState.getAttribute("data-results-settled"),
            ]);

            delayedPreCloseRequestId =
              requestId && settled === "false" && requestId !== preCloseSettledRequestId
                ? requestId
                : null;

            return delayedPreCloseRequestId;
          })
          .not.toBeNull();

        expect(delayedPreCloseRequestId).not.toBeNull();
        expect(delayedPreCloseRequestId).not.toBe(preCloseSettledRequestId);

        await page.getByRole("button", { name: "CANCEL" }).click();
        await expect(page.getByTestId("spell-picker")).not.toBeVisible();

        const reopenedPicker = await reopenSpellPickerWithoutSettledWait(app, "Mage", listType);
        const reopenedResultsState = reopenedPicker.getByTestId("spell-picker-results-state");

        await expect(reopenedResultsState).toHaveAttribute("data-results-settled", "false");
        await expect(reopenedResultsState).toHaveAttribute("aria-busy", "true");

        let reopenedInFlightRequestId: string | null = null;
        await expect
          .poll(async () => {
            const [requestId, settled] = await Promise.all([
              reopenedResultsState.getAttribute("data-search-request-id"),
              reopenedResultsState.getAttribute("data-results-settled"),
            ]);

            reopenedInFlightRequestId =
              requestId &&
              settled === "false" &&
              requestId !== preCloseSettledRequestId &&
              requestId !== delayedPreCloseRequestId
                ? requestId
                : null;

            return reopenedInFlightRequestId;
          })
          .not.toBeNull();

        expect(reopenedInFlightRequestId).not.toBeNull();
        expect(reopenedInFlightRequestId).not.toBe(preCloseSettledRequestId);
        expect(reopenedInFlightRequestId).not.toBe(delayedPreCloseRequestId);

        await expect
          .poll(async () => {
            const events = await readSpellPickerSearchRaceHarnessEvents(page);
            return events
              .filter(
                (event) =>
                  event.listType === listType && (event.query === alphaSpell || event.query === ""),
              )
              .map((event) => `${event.phase}:${event.query || "<empty>"}`);
          })
          .toEqual([
            `start:${alphaSpell}`,
            "start:<empty>",
            "resolve:<empty>",
            `resolve:${alphaSpell}`,
          ]);

        await expectReopenedPickerSettlesToPristineResults(reopenedPicker, expectedRowTestIds);

        const finalSettledRequestId = await readSpellPickerSearchRequestId(reopenedPicker);
        expect(finalSettledRequestId).not.toBe(preCloseSettledRequestId);
        expect(finalSettledRequestId).not.toBe(delayedPreCloseRequestId);

        await page.getByRole("button", { name: "CANCEL" }).click();
        await expect(page.getByTestId("spell-picker")).not.toBeVisible();
      });
    }
  });
});
