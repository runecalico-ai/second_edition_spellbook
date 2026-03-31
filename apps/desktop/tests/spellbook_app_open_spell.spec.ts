import { expect, test } from "./fixtures/test-fixtures";
import { generateRunId } from "./fixtures/test-utils";
import { SpellbookApp } from "./page-objects/SpellbookApp";

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

test("openSpell waits for the new library search to settle before using search results", async ({
  appContext,
}) => {
  const { page } = appContext;
  const app = new SpellbookApp(page);
  const runId = generateRunId();
  const spellName = `OpenSpell Search Sync ${runId}`;

  await app.createSpell({
    name: spellName,
    level: "1",
    description: "Regression coverage for openSpell search settling.",
    school: "Evocation",
    classes: "Wizard",
  });

  await page.evaluate((targetName: string) => {
    type LibraryTimelineEvent = {
      kind: "state" | "click";
      requestId?: string | null;
      settled?: string | null;
      time: number;
    };

    const events: LibraryTimelineEvent[] = [];
    const resultsState = document.querySelector<HTMLElement>('[data-testid="library-results-state"]');

    if (!resultsState) {
      throw new Error("library-results-state not found");
    }

    const recordState = () => {
      events.push({
        kind: "state",
        requestId: resultsState.getAttribute("data-search-request-id"),
        settled: resultsState.getAttribute("data-results-settled"),
        time: performance.now(),
      });
    };

    recordState();

    const observer = new MutationObserver(() => {
      recordState();
    });

    observer.observe(resultsState, {
      attributes: true,
      attributeFilter: ["data-search-request-id", "data-results-settled"],
    });

    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        const spellLink = target.closest("a");
        if (spellLink?.textContent?.trim() !== targetName) {
          return;
        }

        events.push({ kind: "click", time: performance.now() });
      },
      true,
    );

    (window as Window & {
      __SPELLBOOK_LIBRARY_OPEN_SPELL_TIMELINE__?: LibraryTimelineEvent[];
      __SPELLBOOK_LIBRARY_OPEN_SPELL_OBSERVER__?: MutationObserver;
    }).__SPELLBOOK_LIBRARY_OPEN_SPELL_TIMELINE__ = events;
    (window as Window & {
      __SPELLBOOK_LIBRARY_OPEN_SPELL_TIMELINE__?: LibraryTimelineEvent[];
      __SPELLBOOK_LIBRARY_OPEN_SPELL_OBSERVER__?: MutationObserver;
    }).__SPELLBOOK_LIBRARY_OPEN_SPELL_OBSERVER__ = observer;
  }, spellName);

  await app.openSpell(spellName);

  const timeline = await page.evaluate(() => {
    return (
      window as Window & {
        __SPELLBOOK_LIBRARY_OPEN_SPELL_TIMELINE__?: Array<{
          kind: "state" | "click";
          requestId?: string | null;
          settled?: string | null;
          time: number;
        }>;
        __SPELLBOOK_LIBRARY_OPEN_SPELL_OBSERVER__?: MutationObserver;
      }
    ).__SPELLBOOK_LIBRARY_OPEN_SPELL_TIMELINE__ ?? [];
  });

  const initialState = timeline.find((event) => event.kind === "state");
  const settledState = timeline.find(
    (event) =>
      event.kind === "state" &&
      event.requestId !== initialState?.requestId &&
      event.settled === "true",
  );
  const clickEvent = timeline.find((event) => event.kind === "click");

  expect(initialState).toBeTruthy();
  expect(settledState).toBeTruthy();
  expect(clickEvent).toBeTruthy();
  expect(settledState?.time).toBeLessThan(clickEvent?.time ?? Number.POSITIVE_INFINITY);
});

test("clearFilters waits for the reset search to settle before returning", async ({
  appContext,
}) => {
  const { page } = appContext;
  const app = new SpellbookApp(page);
  const runId = generateRunId();
  const spellName = `ClearFilters Sync ${runId}`;
  const decoyName = `ClearFilters Decoy ${runId}`;

  await app.createSpell({
    name: spellName,
    level: "1",
    description: "Regression coverage for library reset settling.",
    school: "Evocation",
    classes: "Wizard",
  });
  await app.createSpell({
    name: decoyName,
    level: "2",
    description: "Decoy row used to confirm reset results are rendered.",
    school: "Alteration",
    classes: "Wizard",
  });

  await app.setLibraryFilters({ search: spellName });

  await page.evaluate(() => {
    type LibraryTimelineEvent = {
      kind: "state" | "click";
      requestId?: string | null;
      settled?: string | null;
      time: number;
    };

    const resultsState = document.querySelector<HTMLElement>('[data-testid="library-results-state"]');
    if (!resultsState) {
      throw new Error("library-results-state not found");
    }

    const internals = (
      window as Window & {
        __TAURI_INTERNALS__?: {
          invoke: (command: string, args?: object) => Promise<unknown>;
        };
        __SPELLBOOK_DELAY_NEXT_EMPTY_LIBRARY_SEARCH__?: boolean;
        __SPELLBOOK_LIBRARY_CLEAR_FILTERS_TIMELINE__?: LibraryTimelineEvent[];
        __SPELLBOOK_LIBRARY_CLEAR_FILTERS_OBSERVER__?: MutationObserver;
      }
    ).__TAURI_INTERNALS__;

    if (!internals?.invoke) {
      throw new Error("Tauri invoke not available");
    }

    if (!(window as Window & { __SPELLBOOK_LIBRARY_DELAY_INSTALLED__?: boolean }).__SPELLBOOK_LIBRARY_DELAY_INSTALLED__) {
      const originalInvoke = internals.invoke.bind(internals);
      internals.invoke = async (command: string, args?: object) => {
        const shouldDelay =
          command === "search_keyword" &&
          (window as Window & { __SPELLBOOK_DELAY_NEXT_EMPTY_LIBRARY_SEARCH__?: boolean })
            .__SPELLBOOK_DELAY_NEXT_EMPTY_LIBRARY_SEARCH__ === true &&
          typeof args === "object" &&
          args !== null &&
          "query" in args &&
          (args as { query?: unknown }).query === "";

        if (shouldDelay) {
          (window as Window & { __SPELLBOOK_DELAY_NEXT_EMPTY_LIBRARY_SEARCH__?: boolean })
            .__SPELLBOOK_DELAY_NEXT_EMPTY_LIBRARY_SEARCH__ = false;
          await new Promise((resolve) => window.setTimeout(resolve, 1500));
        }

        return originalInvoke(command, args);
      };

      (window as Window & { __SPELLBOOK_LIBRARY_DELAY_INSTALLED__?: boolean }).__SPELLBOOK_LIBRARY_DELAY_INSTALLED__ = true;
    }

    const events: LibraryTimelineEvent[] = [];
    const recordState = () => {
      events.push({
        kind: "state",
        requestId: resultsState.getAttribute("data-search-request-id"),
        settled: resultsState.getAttribute("data-results-settled"),
        time: performance.now(),
      });
    };

    recordState();

    const observer = new MutationObserver(() => {
      recordState();
    });

    observer.observe(resultsState, {
      attributes: true,
      attributeFilter: ["data-search-request-id", "data-results-settled"],
    });

    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        const button = target.closest("button");
        if (!button || !/clear|reset/i.test(button.textContent ?? "")) {
          return;
        }

        events.push({ kind: "click", time: performance.now() });
      },
      true,
    );

    (window as Window & {
      __SPELLBOOK_DELAY_NEXT_EMPTY_LIBRARY_SEARCH__?: boolean;
      __SPELLBOOK_LIBRARY_CLEAR_FILTERS_TIMELINE__?: LibraryTimelineEvent[];
      __SPELLBOOK_LIBRARY_CLEAR_FILTERS_OBSERVER__?: MutationObserver;
    }).__SPELLBOOK_DELAY_NEXT_EMPTY_LIBRARY_SEARCH__ = true;
    (window as Window & {
      __SPELLBOOK_LIBRARY_CLEAR_FILTERS_TIMELINE__?: LibraryTimelineEvent[];
      __SPELLBOOK_LIBRARY_CLEAR_FILTERS_OBSERVER__?: MutationObserver;
    }).__SPELLBOOK_LIBRARY_CLEAR_FILTERS_TIMELINE__ = events;
    (window as Window & {
      __SPELLBOOK_LIBRARY_CLEAR_FILTERS_TIMELINE__?: LibraryTimelineEvent[];
      __SPELLBOOK_LIBRARY_CLEAR_FILTERS_OBSERVER__?: MutationObserver;
    }).__SPELLBOOK_LIBRARY_CLEAR_FILTERS_OBSERVER__ = observer;
  });

  await app.clearFilters();
  const completionTime = await page.evaluate(() => performance.now());

  const resultsState = page.getByTestId("library-results-state");
  await expect(resultsState).toHaveAttribute("data-results-settled", "true");
  await expect(page.getByRole("link", { name: spellName, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: decoyName, exact: true })).toBeVisible();

  const timeline = await page.evaluate(() => {
    const state = window as Window & {
      __SPELLBOOK_LIBRARY_CLEAR_FILTERS_TIMELINE__?: Array<{
        kind: "state" | "click";
        requestId?: string | null;
        settled?: string | null;
        time: number;
      }>;
      __SPELLBOOK_LIBRARY_CLEAR_FILTERS_OBSERVER__?: MutationObserver;
    };

    state.__SPELLBOOK_LIBRARY_CLEAR_FILTERS_OBSERVER__?.disconnect();
    return state.__SPELLBOOK_LIBRARY_CLEAR_FILTERS_TIMELINE__ ?? [];
  });

  const initialState = timeline.find((event) => event.kind === "state");
  const clickEvent = timeline.find((event) => event.kind === "click");
  const settledState = timeline.find(
    (event) =>
      event.kind === "state" &&
      event.requestId !== initialState?.requestId &&
      event.settled === "true",
  );

  expect(initialState).toBeTruthy();
  expect(clickEvent).toBeTruthy();
  expect(settledState).toBeTruthy();
  expect(clickEvent?.time).toBeLessThan(settledState?.time ?? Number.POSITIVE_INFINITY);
  expect(settledState?.time).toBeLessThan(completionTime);
});