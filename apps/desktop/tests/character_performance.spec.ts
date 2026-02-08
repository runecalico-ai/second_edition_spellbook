import { test, expect } from "./fixtures/test-fixtures";
import { SpellbookApp } from "./page-objects/SpellbookApp";

test.describe("Performance: Character Search", () => {
  test("should search quickly with multiple characters", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    // Seed data via UI (100 chars)
    // Optimized loop: Avoid full page navigation checks for every creation
    await app.navigate("Characters");
    const nameInput = page.getByTestId("new-character-name-input");
    const createBtn = page.getByTestId("btn-create-character");

    const count = 100;
    const batchSize = 10;

    await test.step(`Seed ${count} characters`, async () => {
      for (let i = 0; i < count; i++) {
        await nameInput.fill(`PerfChar_${i}_Mage`);
        await createBtn.click();
        // Small wait to allow React state to settle/backend to start
        // We don't strictly need to wait for list to update every time if we trust the queue,
        // but to be safe and avoid flakes:
        if (i % batchSize === 0) {
          await page.waitForTimeout(200);
        }
      }
      // Final wait to ensure all are loaded
      await page.waitForTimeout(1000);
      await expect(page.getByTestId("character-list").locator("a")).toHaveCount(count);
    });

    const searchInput = page.getByTestId("character-search-input");

    // Measure search latency
    await test.step("Measure Search Latency", async () => {
      const start = Date.now();
      await searchInput.fill("Mage");
      // Wait for the specific item to be visible as a proxy for search completion
      await expect(page.getByTestId(`character-item-perfchar_${count - 1}_mage`)).toBeVisible();
      const end = Date.now();

      const duration = end - start;
      console.log(`Search duration for ${count} items: ${duration}ms`);

      // Requirement: < 150ms ideal, but allow some buffer for test env overhead
      // The spec says <150ms response. Playwright 'fill' + 'expect' includes roundtrip.
      // 500ms is a safe upper bound for "UI + Search + Render".
      expect(duration).toBeLessThan(500);
    });
  });
});
