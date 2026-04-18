import { expect, test } from "./fixtures/test-fixtures";
import { TIMEOUTS } from "./fixtures/constants";
import { SpellbookApp } from "./page-objects/SpellbookApp";
import { fillControlledTextInput } from "./utils/fill-controlled-text-input";

/**
 * Evaluates horizontal overflow on a set of structured editor containers identified by
 * data-testid. Returns an array of objects describing any container whose scrollWidth
 * exceeds its clientWidth (i.e. nested horizontal clipping that would indicate the
 * content is too wide for the current viewport).
 *
 * Called via page.evaluate() so it runs inside the browser context.
 */
function checkNestedOverflow(ids: string[]) {
  return ids
    .map((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) return null;
      const { scrollWidth, clientWidth } = el;
      return scrollWidth > clientWidth
        ? { testId: id, scrollWidth, clientWidth, overflow: scrollWidth - clientWidth }
        : null;
    })
    .filter(
      (r): r is { testId: string; scrollWidth: number; clientWidth: number; overflow: number } =>
        r !== null,
    );
}

/** Structured editor container test-ids that must not clip horizontally at 900px. */
const STRUCTURED_SURFACE_IDS = [
  "structured-field-primary-row",
  "damage-form",
  "saving-throw-input",
  // "component-checkboxes" — requires expanding the components field; not covered here
] as const;

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
      await page
        .getByTestId("empty-library-create-button")
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
      test.skip(
        innerWidth !== 900,
        `setViewportSize did not resize the WebView2 window (got ${innerWidth}px). Verify this test manually at 900px.`,
      );
    }

    await test.step("Verify no horizontal scrollbar on spell editor page", async () => {
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);
    });

    await test.step("Restore viewport", async () => {
      await page.setViewportSize({ width: 1280, height: 768 });
    });
  });

  test("library page does not overflow at 900px window width", async ({ appContext }) => {
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
      test.skip(
        innerWidth !== 900,
        `setViewportSize did not resize the WebView2 window (got ${innerWidth}px). Verify this test manually at 900px.`,
      );
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
    // Verifies structured detail lines (range / duration / casting time / saving throw / damage)
    // wrap correctly at 900px when fully populated. Nested structured surfaces (damage-form,
    // saving-throw-input, component-checkboxes, structured-field-primary-row) are also checked
    // for horizontal overflow — not merely the root document.
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
        savingThrow: "Save vs. Spell",
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

    await test.step("Expand range structured field to surface structured-field-primary-row", async () => {
      const expandBtn = page.getByTestId("detail-range-expand");
      if (await expandBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await expandBtn.click();
        const loading = page.getByTestId("detail-range-loading");
        if (await loading.count()) {
          await expect(loading).not.toBeVisible({ timeout: TIMEOUTS.medium });
        }
        await expect(page.getByTestId("structured-field-primary-row").first()).toBeVisible({
          timeout: TIMEOUTS.medium,
        });
      }
    });

    await test.step("Expand saving throw structured field", async () => {
      const expandBtn = page.getByTestId("detail-saving-throw-expand");
      if (await expandBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await expandBtn.click();
        await expect(page.getByTestId("saving-throw-input")).toBeVisible({
          timeout: TIMEOUTS.medium,
        });
      }
    });

    await test.step("Expand damage structured field and set kind to modeled", async () => {
      const damageInput = page.getByTestId("detail-damage-input");
      if (await damageInput.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
        await damageInput.fill("2d8 fire");
        const expandBtn = page.getByTestId("detail-damage-expand");
        if (await expandBtn.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
          await expandBtn.click();
          await expect(page.getByTestId("damage-form")).toBeVisible({ timeout: TIMEOUTS.medium });
          // Switch to modeled kind to render the densest damage-form rows
          const kindSelect = page.getByTestId("damage-form-kind");
          if (await kindSelect.isVisible({ timeout: TIMEOUTS.short }).catch(() => false)) {
            await kindSelect.selectOption("modeled");
          }
        }
      }
    });

    await test.step("Resize to 900px wide", async () => {
      await page.setViewportSize({ width: 900, height: 768 });
      await page.waitForTimeout(500);
    });

    {
      const innerWidth = await page.evaluate(() => window.innerWidth);
      // Skip avoids asserting overflow when CDP viewport emulation did not apply.
      test.skip(
        innerWidth !== 900,
        `setViewportSize did not resize the WebView2 window (got ${innerWidth}px). Verify this test manually at 900px.`,
      );
    }

    // Root document overflow check — always valid since document always exists
    await test.step("Verify no horizontal overflow on root document with populated editor", async () => {
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);
    });

    await test.step("Assert structured surfaces are visible at 900px before overflow check", async () => {
      for (const id of STRUCTURED_SURFACE_IDS) {
        await expect(
          page.locator(`[data-testid="${id}"]`).first(),
          `Expected ${id} to be visible for overflow check`,
        ).toBeVisible({ timeout: TIMEOUTS.short });
      }
    });

    await test.step("Verify no nested horizontal overflow on structured editor surfaces", async () => {
      const overflowingContainers = await page.evaluate(
        checkNestedOverflow,
        Array.from(STRUCTURED_SURFACE_IDS),
      );
      expect(
        overflowingContainers,
        `Nested structured surfaces with horizontal overflow at 900px: ${JSON.stringify(overflowingContainers)}`,
      ).toHaveLength(0);
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
          const dialog = document.querySelector("[data-testid='modal-dialog']");
          const active = document.activeElement;
          return Boolean(dialog && active && dialog.contains(active));
        });
        expect(isInsideModal).toBe(true);
      }).toPass({ timeout: TIMEOUTS.short });
    });

    await test.step("Tab through all focusable elements — focus never escapes modal", async () => {
      // Count focusable elements first so we tab enough to guarantee a full cycle.
      // Even with 1 focusable element, after 5 tabs focus stays inside the modal.
      const focusableCount = await page
        .locator(
          "[data-testid='modal-dialog'] button, [data-testid='modal-dialog'] a[href], [data-testid='modal-dialog'] input, [data-testid='modal-dialog'] select, [data-testid='modal-dialog'] textarea, [data-testid='modal-dialog'] [tabindex]:not([tabindex='-1'])",
        )
        .count();
      // Tab (count + 2) times to cycle through all + one wrap-around
      const tabCount = Math.max(focusableCount + 2, 5);
      for (let i = 0; i < tabCount; i++) {
        await page.keyboard.press("Tab");
        const isInsideModal = await page.evaluate(() => {
          const dialog = document.querySelector("[data-testid='modal-dialog']");
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

// NOTE: Escape-key dismissal is covered at the unit layer in Modal.test.tsx
// ("calls onRequestClose when Escape cancel event fires and dismissible=true" and
// "does not call onRequestClose when Escape fires and dismissible=false").
// An E2E path is not added here because all modals reachable from header buttons
// use dismissible:false (vault maintenance, alert, confirm). If a deterministically
// reachable dismissible modal is added in a future chunk, promote this to an E2E test.

test.describe("Keyboard navigation tab order", () => {
  test("Library page has forward tab navigation without focus loops", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Library", async () => {
      await app.navigate("Library");
      await page.waitForTimeout(500);
    });

    await test.step("Tab from search input reaches filter controls in order", async () => {
      // Focus the search input first using the canonical Library selector.
      const searchInput = page.getByTestId("search-input").or(page.getByRole("searchbox")).first();
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

test.describe("Keyboard navigation — settings controls", () => {
  test("Settings theme controls are keyboard-navigable: follow-system toggle and theme select", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Settings", async () => {
      await page.getByTestId("settings-gear-button").click();
      await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
    });

    await test.step("Reset theme to follow-system via localStorage and reload", async () => {
      await page.emulateMedia({ colorScheme: "light" });
      await page.evaluate(() => localStorage.removeItem("spellbook-theme"));
      await page.reload();
      await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
    });

    await test.step("Navigate back to Settings after reload", async () => {
      await page.getByTestId("settings-gear-button").click();
      await expect(page.getByRole("heading", { name: /settings/i })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
    });

    // Helper: tab repeatedly until a specific data-testid receives focus
    const tabUntilFocused = async (testId: string, maxTabs = 25) => {
      for (let i = 0; i < maxTabs; i++) {
        await page.keyboard.press("Tab");
        const isFocused = await page.evaluate(
          (id) => document.activeElement?.getAttribute("data-testid") === id,
          testId,
        );
        if (isFocused) return;
      }
      throw new Error(`tabUntilFocused: "${testId}" not reached after ${maxTabs} tabs`);
    };

    await test.step("Establish focus anchor near settings form", async () => {
      await page
        .getByRole("heading", { name: /settings/i })
        .first()
        .click();
    });

    await test.step("Tab to follow-system checkbox using keyboard only", async () => {
      const followSystemCheckbox = page.getByTestId("settings-follow-system-checkbox");
      await tabUntilFocused("settings-follow-system-checkbox");
      await expect(followSystemCheckbox).toBeFocused();
    });

    await test.step("Press Space to uncheck follow-system", async () => {
      await page.keyboard.press("Space");
      const followSystemCheckbox = page.getByTestId("settings-follow-system-checkbox");
      await expect(followSystemCheckbox).not.toBeChecked();
    });

    await test.step("Verify theme select is now enabled", async () => {
      const themeSelect = page.getByTestId("settings-theme-select");
      await expect(themeSelect).toBeEnabled();
    });

    await test.step("Tab to theme select and change value with keyboard", async () => {
      const themeSelect = page.getByTestId("settings-theme-select");
      const themeBefore = await page.evaluate(() => document.documentElement.dataset.theme ?? "");
      await tabUntilFocused("settings-theme-select");
      await expect(themeSelect).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(async () => {
        const current = await page.evaluate(() => document.documentElement.dataset.theme ?? "");
        expect(current).not.toBe(themeBefore);
      }).toPass({ timeout: TIMEOUTS.short });
    });
  });
});

test.describe("Preserved modal modality", () => {
  test("Unsaved changes preserved dialog is visible, traps focus, and returns focus on dismiss", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell and fill fields", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await page.getByTestId("spell-name-input").fill("Unsaved Modal Focus Test");
      await page.getByTestId("spell-description-textarea").fill("Focus test description.");
      await page.getByTestId("detail-range-input").fill("Touch");
    });

    await test.step("Click cancel to trigger unsaved-changes dialog", async () => {
      await page.getByTestId("btn-cancel-edit").click();
      await expect(page.getByRole("heading", { name: "Unsaved changes" })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
    });

    await test.step("Assert modal dialog is visible", async () => {
      await expect(page.getByTestId("modal-dialog")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Assert aria-modal='true' on the dialog", async () => {
      await expect(page.getByTestId("modal-dialog")).toHaveAttribute("aria-modal", "true");
    });

    await test.step("Assert focus is inside the modal", async () => {
      await expect(async () => {
        const isInsideModal = await page.evaluate(() => {
          const dialog = document.querySelector("[data-testid='modal-dialog']");
          const active = document.activeElement;
          return Boolean(dialog && active && dialog.contains(active));
        });
        expect(isInsideModal).toBe(true);
      }).toPass({ timeout: TIMEOUTS.short });
    });

    await test.step("Tab 3 times and verify focus stays inside modal each time", async () => {
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press("Tab");
        const isInsideModal = await page.evaluate(() => {
          const dialog = document.querySelector("[data-testid='modal-dialog']");
          return Boolean(
            dialog && document.activeElement && dialog.contains(document.activeElement),
          );
        });
        expect(isInsideModal).toBe(true);
      }
    });

    await test.step("Dismiss via cancel/stay button inside dialog", async () => {
      await page
        .getByTestId("modal-dialog")
        .getByRole("button", { name: /cancel|no|stay/i })
        .click();
    });

    await test.step("Assert dialog is dismissed", async () => {
      await expect(page.getByTestId("modal-dialog")).not.toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Assert editor is still visible (stayed on page)", async () => {
      await expect(page.getByTestId("spell-name-input")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Verify focus returned to the cancel-edit button after modal dismiss", async () => {
      await expect(async () => {
        const focusedTestId = await page.evaluate(() =>
          document.activeElement?.getAttribute("data-testid"),
        );
        expect(focusedTestId).toBe("btn-cancel-edit");
      }).toPass({ timeout: TIMEOUTS.short });
    });
  });
});

test.describe("Accessibility — ARIA validation", () => {
  test("invalid spell-name field exposes aria-invalid and aria-describedby pointing to a visible error element", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
    });

    await test.step("Click Save without filling any fields", async () => {
      await page.getByTestId("btn-save-spell").click();
    });

    await test.step("Wait for validation hint", async () => {
      await app.expectSpellSaveValidationHint();
    });

    await test.step("Assert spell-name-error is visible", async () => {
      await expect(page.getByTestId("spell-name-error")).toBeVisible();
    });

    await test.step("Assert aria-invalid='true' on spell-name-input", async () => {
      await expect(page.getByTestId("spell-name-input")).toHaveAttribute("aria-invalid", "true");
    });

    await test.step("Assert aria-describedby contains 'spell-name-error'", async () => {
      await expect(page.getByTestId("spell-name-input")).toHaveAttribute(
        "aria-describedby",
        /spell-name-error/,
      );
    });

    await test.step("Assert the aria-describedby target element is visible", async () => {
      await expect(page.locator("#spell-name-error")).toBeVisible();
    });

    await test.step("Assert focus is on spell-name-input (first-invalid-field focus)", async () => {
      await expect(page.getByTestId("spell-name-input")).toBeFocused();
    });

    await test.step("Assert no blocking dialog appeared", async () => {
      await app.expectNoBlockingDialog();
    });
  });
});

test.describe("Keyboard accessibility — form submit via Enter", () => {
  test("pressing Enter on a non-textarea spell editor field saves the spell and navigates to Library", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await test.step("Navigate to Add Spell", async () => {
      await app.navigate("Add Spell");
      await expect(page.getByTestId("spell-name-input")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
    });

    await test.step("Fill required fields and focus level input for Enter submit", async () => {
      await page.getByTestId("spell-name-input").fill("Keyboard Submit Test Spell");
      await page
        .getByTestId("spell-description-textarea")
        .fill("A test spell for keyboard submit.");
      await page.getByTestId("spell-level-input").fill("3");
      await expect(page.getByTestId("spell-level-input")).toHaveValue("3");
      // ARCANE tradition (default) requires a school for levels 1-9
      const schoolInput = page.getByTestId("spell-school-input");
      await expect(schoolInput).toBeVisible({ timeout: TIMEOUTS.medium });
      await fillControlledTextInput(schoolInput, "Alteration");
      await expect(schoolInput).toHaveValue("Alteration");
    });

    await test.step("Focus level input and press Enter to submit", async () => {
      await page.getByTestId("spell-level-input").focus();
      await page.keyboard.press("Enter");
    });

    await test.step("Verify editor navigated away to Library after successful save", async () => {
      // After a successful save, SpellEditor calls navigate("/") which renders the Library.
      // We wait for the Library heading to confirm the spell was saved and the editor closed.
      await app.waitForLibrary();
    });
  });
});
