import { TIMEOUTS } from "./fixtures/constants";
import { expect, test } from "./fixtures/test-fixtures";

const NAV_TEST_IDS = [
  "nav-link-library",
  "nav-link-characters",
  "nav-link-import",
  "nav-link-chat",
  "nav-link-export",
] as const;

test.describe("Content Security Policy", () => {
  test("built app enforces CSP without blocking its own UI", async ({ appContext }) => {
    const { page } = appContext;

    await test.step("Setup: collect CSP violations from first paint", async () => {
      await page.addInitScript(() => {
        window.__SPELLBOOK_E2E_CSP_VIOLATIONS__ = [];
        document.addEventListener("securitypolicyviolation", (event) => {
          window.__SPELLBOOK_E2E_CSP_VIOLATIONS__?.push(
            `${event.violatedDirective} ${event.blockedURI}`,
          );
        });
      });
      await page.reload();
      await expect(page.getByTestId("nav-link-library")).toBeVisible({ timeout: TIMEOUTS.long });
    });

    await test.step("Action: visit every main screen", async () => {
      for (const testId of NAV_TEST_IDS) {
        await page.getByTestId(testId).click();
        await page.waitForTimeout(500);
      }
      await page.getByTestId("settings-gear-button").click();
      await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
    });

    await test.step("Verify: inline theme script ran and nothing was blocked", async () => {
      await expect(page.locator("html")).toHaveAttribute("data-theme", /^(light|dark)$/);
      const violations = await page.evaluate(() => window.__SPELLBOOK_E2E_CSP_VIOLATIONS__ ?? []);
      expect(violations).toEqual([]);
    });

    // Runs last: the blocked eval itself reports a `script-src` violation.
    await test.step("Verify: CSP is active", async () => {
      // Code run via CDP (page.evaluate, addInitScript) is exempt from CSP eval checks,
      // so the probe runs from a page task.
      const evalOutcome = await page.evaluate(
        () =>
          new Promise<string>((resolve) => {
            setTimeout(() => {
              try {
                // biome-ignore lint/security/noGlobalEval: probes that the CSP blocks string evaluation
                eval("1");
                resolve("allowed");
              } catch (error) {
                resolve(error instanceof Error ? error.name : String(error));
              }
            }, 0);
          }),
      );
      expect(evalOutcome).toBe("EvalError");
    });
  });
});
