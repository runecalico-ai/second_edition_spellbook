import { test, expect } from "@playwright/test";
import { SpellbookApp } from "./page-objects/SpellbookApp";

test("Capture Final Screenshot", async ({ page }) => {
  const app = new SpellbookApp(page);
  await app.navigate("Library");
  // Ensure some badges are visible
  await expect(page.getByText("Cantrip")).toBeVisible({ timeout: 10000 });
  await page.screenshot({ path: "tests/screenshots/FINAL_VERIFICATION.png", fullPage: true });
});
