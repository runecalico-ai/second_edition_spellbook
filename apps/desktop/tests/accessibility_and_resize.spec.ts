import { expect, test } from "./fixtures/test-fixtures";
import { TIMEOUTS } from "./fixtures/constants";
import { SpellbookApp } from "./page-objects/SpellbookApp";

test.describe("Resize Hardening — 900px viewport", () => {
  // Safety net: restore default viewport even if a test fails mid-resize.
  // Each test also restores inline, but this afterEach ensures cleanup on assertion failures.
  test.afterEach(async ({ appContext }) => {
    await appContext.page.setViewportSize({ width: 1280, height: 768 }).catch(() => {});
  });

  test("spell editor structured fields do not overflow at 900px window width", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to spell editor (new spell)", async () => {
      await app.navigate("Library");
      await page.waitForTimeout(500);
      await page.getByTestId("empty-library-create-button")
        .or(page.getByRole("button", { name: /create spell/i }))
        .first()
        .click();
      await expect(
        page.locator("[data-testid='spell-name-input'], input[placeholder*='name' i]").first(),
      ).toBeVisible({ timeout: TIMEOUTS.medium });
    });

    await test.step("Resize window to 900px wide", async () => {
      await page.setViewportSize({ width: 900, height: 768 });
      await page.waitForTimeout(500); // 500ms matches standard settlement wait in this codebase
    });

    // Confirm viewport width OUTSIDE a step so test.skip() propagates correctly to the test
    // runner. test.skip() throws a SkipError that must reach the test runner directly —
    // calling it inside a test.step() callback risks having it caught by the step wrapper.
    // setViewportSize() in CDP/WebView2 mode sets the emulated viewport; if innerWidth !== 900,
    // the resize did not take effect and the overflow check below would test the wrong viewport.
    {
      const innerWidth = await page.evaluate(() => window.innerWidth);
      test.skip(innerWidth !== 900, `setViewportSize did not resize the WebView2 window (got ${innerWidth}px). Verify this test manually at 900px.`);
    }

    await test.step("Verify no horizontal scrollbar on spell editor page", async () => {
      // Checks root-level overflow. Note: content hidden by overflow:hidden on parents
      // won't be detected here — that's acceptable for the 900px minimum-width requirement.
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);
    });

    await test.step("Restore viewport", async () => {
      await page.setViewportSize({ width: 1280, height: 768 });
    });
  });

  test("library page does not overflow at 900px window width", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to library", async () => {
      await app.navigate("Library");
      await page.waitForTimeout(500);
    });

    await test.step("Resize window to 900px wide", async () => {
      await page.setViewportSize({ width: 900, height: 768 });
      await page.waitForTimeout(500);
    });

    {
      const innerWidth = await page.evaluate(() => window.innerWidth);
      // Skip avoids asserting overflow when CDP viewport emulation did not apply (same pattern as spell-editor resize test).
      test.skip(innerWidth !== 900, `setViewportSize did not resize the WebView2 window (got ${innerWidth}px). Verify this test manually at 900px.`);
    }

    await test.step("Verify no horizontal scrollbar", async () => {
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);
    });

    await test.step("Restore viewport", async () => {
      await page.setViewportSize({ width: 1280, height: 768 });
    });
  });

  test("spell editor structured fields do not overflow at 900px with populated data", async ({
    appContext,
  }) => {
    test.setTimeout(180_000);
    // Verifies structured detail lines (range / duration / casting time) wrap at 900px when filled.
    const { page } = appContext;
    const app = new SpellbookApp(page);

    // Capture the spell name so we can reopen it with app.openSpell()
    const spellName = `Chunk5 Resize Test ${Date.now()}`;

    await test.step("Create a spell with structured field data", async () => {
      await app.createSpell({
        name: spellName,
        level: "1",
        description: "Resize hardening test spell.",
        range: "Touch / 10 yards + 5 yards per level beyond 5th, line of sight",
        castingTime: "1 round + 1 segment per HD of target, up to 1 turn",
        duration: "2 rounds + 1 round per level, concentration to 1 turn maximum",
      });
      // After save, spell is in Library; open it for editing
      await app.waitForLibrary();
    });

    await test.step("Open the newly created spell in editor", async () => {
      // Use app.openSpell() (search-and-click workflow) rather than clicking the first spell row
      // directly, as clicking a row may not navigate to the editor if the row click-to-edit
      // behavior changes. app.openSpell() is the robust page-object method for this workflow.
      await app.openSpell(spellName);
      await page.waitForTimeout(500);
    });

    await test.step("Resize to 900px wide", async () => {
      await page.setViewportSize({ width: 900, height: 768 });
      await page.waitForTimeout(500);
    });

    {
      const innerWidth = await page.evaluate(() => window.innerWidth);
      // Skip avoids asserting overflow when CDP viewport emulation did not apply.
      test.skip(innerWidth !== 900, `setViewportSize did not resize the WebView2 window (got ${innerWidth}px). Verify this test manually at 900px.`);
    }

    await test.step("Verify no horizontal overflow with populated editor", async () => {
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);
    });

    await test.step("Restore viewport", async () => {
      await page.setViewportSize({ width: 1280, height: 768 });
    });
  });
});

test.describe("Modal focus trap and focus return", () => {
  test("modal traps focus within dialog and returns it to opener after close", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Library to get a stable page state", async () => {
      await app.navigate("Library");
      await page.waitForTimeout(500);
    });

    await test.step("Verify Vault Maintenance button is present before interacting", async () => {
      // Fast-fail if the button is missing rather than hanging at a click or waitFor
      await expect(page.getByTestId("btn-vault-maintenance")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Open Vault Maintenance modal via header button", async () => {
      await page.getByTestId("btn-vault-maintenance").click();
      await expect(page.getByTestId("modal-dialog")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Verify focus is trapped inside the modal", async () => {
      await expect(async () => {
        const isInsideModal = await page.evaluate(() => {
          const dialog = document.querySelector("dialog[open][data-testid='modal-dialog']");
          const active = document.activeElement;
          return Boolean(dialog && active && dialog.contains(active));
        });
        expect(isInsideModal).toBe(true);
      }).toPass({ timeout: TIMEOUTS.short });
    });

    await test.step("Tab through all focusable elements — focus never escapes modal", async () => {
      // Count focusable elements first so we tab enough to guarantee a full cycle.
      // Note: this test verifies focus STAYS inside the modal after N tabs, not that
      // wrap-around works specifically — wrap-around is browser-native behavior guaranteed
      // by showModal(). Even with 1 focusable element, after 5 tabs focus stays inside.
        const focusableCount = await page
          .locator(
            "[data-testid='modal-dialog'] button, [data-testid='modal-dialog'] a[href], [data-testid='modal-dialog'] input, [data-testid='modal-dialog'] select, [data-testid='modal-dialog'] textarea, [data-testid='modal-dialog'] [tabindex]:not([tabindex='-1'])",
          )
          .count();
      // Tab (count + 2) times to cycle through all + one wrap-around
      const tabCount = Math.max(focusableCount + 2, 8);
      for (let i = 0; i < tabCount; i++) {
        await page.keyboard.press("Tab");
        const isInsideModal = await page.evaluate(() => {
          const dialog = document.querySelector("dialog[open][data-testid='modal-dialog']");
          const active = document.activeElement;
          return Boolean(dialog && active && dialog.contains(active));
        });
        expect(isInsideModal).toBe(true);
      }
    });

    await test.step("Verify the VaultMaintenanceDialog close button testid matches Step 7.0", async () => {
      // If this fails, re-run Step 7.0 grep to find the real close button testid
      await expect(page.getByTestId("btn-close-vault-maintenance")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Close modal via VaultMaintenanceDialog close button", async () => {
      await page.getByTestId("btn-close-vault-maintenance").click();
      await expect(page.getByTestId("modal-dialog")).not.toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Verify focus returned to the Vault Maintenance button", async () => {
      // Use toPass() with timeout to handle the async focus restoration in useEffect
      await expect(async () => {
        const focusedTestId = await page.evaluate(() =>
          document.activeElement?.getAttribute("data-testid"),
        );
        expect(focusedTestId).toBe("btn-vault-maintenance");
      }).toPass({ timeout: TIMEOUTS.short });
    });
  });
});

// NOTE: Escape-key dismissal is not E2E-tested here because all modals reachable
// from header buttons use dismissible:false. The onCancel handler that processes
// the Escape 'cancel' event is covered by unit tests in Modal.test.tsx.
// If a dismissible modal trigger is added in a future chunk, add the Escape E2E
// test at that time.

test.describe("Keyboard navigation tab order", () => {
  test("Library page has forward tab navigation without focus loops", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Library", async () => {
      await app.navigate("Library");
      await page.waitForTimeout(500);
    });

    await test.step("Tab from search input reaches filter controls in order", async () => {
      // Focus the search input first (Library uses library-search-input per LOCATOR_STRATEGY)
      const searchInput = page
        .getByTestId("library-search-input")
        .or(page.getByRole("searchbox"))
        .first();
      await expect(searchInput).toBeVisible({ timeout: TIMEOUTS.medium });
      await searchInput.click();

      // Tab through a few controls and verify focus moves forward logically
      // (not backward, not stuck)
      const focusedElements: string[] = [];
      for (let i = 0; i < 5; i++) {
          await page.keyboard.press("Tab");
          const fingerprint = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el) {
              return "";
            }
            const id = el.getAttribute("data-testid") ?? "";
            const role = el.getAttribute("role") ?? "";
            return `${id}#${el.tagName}#${role}`;
          });
          focusedElements.push(fingerprint);
        }

      // All focused elements should be non-empty (focus must be moving)
      expect(focusedElements.every((id) => id.length > 0)).toBe(true);
      // No element should appear twice (no focus loops in first 5 tabs)
      const unique = new Set(focusedElements);
      expect(unique.size).toBe(focusedElements.length);
      // At least 2 of the 5 tab stops should be library filter controls (progress into toolbar)
      const libraryStops = focusedElements.filter((id) => id.startsWith("library-"));
      expect(libraryStops.length).toBeGreaterThanOrEqual(2);
    });
  });
});
