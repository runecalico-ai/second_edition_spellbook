/**
 * E2E tests for JSON spell import conflict resolution UI.
 *
 * Tests cover the two main conflict resolution flows:
 *   1. Per-conflict dialog (< 10 conflicts): Keep Existing, Replace with New,
 *      Keep Both, and Apply to All.
 *   2. Bulk summary dialog (≥ 10 conflicts): Skip All, Replace All, Keep All,
 *      and Review Each (which falls through to per-conflict).
 *
 * Requires the Tauri app running on Windows (WebView2 CDP).
 */

import fs from "node:fs";
import path from "node:path";
import { TIMEOUTS } from "./fixtures/constants";
import { expect, test } from "./fixtures/test-fixtures";
import { generateRunId } from "./fixtures/test-utils";
import { SpellbookApp } from "./page-objects/SpellbookApp";
const LARGE_IMPORT_WARNING_THRESHOLD_BYTES = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Bundle helpers
// ---------------------------------------------------------------------------

/** Minimal CanonicalSpell JSON for use in test bundles. */
function makeSpell(name: string, description: string, level = 3) {
  return {
    schema_version: 1,
    name,
    level,
    description,
    tradition: "ARCANE",
    school: "Evocation",
    class_list: [],
    tags: [],
    source_refs: [],
  };
}

/** Write a single-spell JSON bundle to `filePath` and return the path. */
function writeSpellBundle(filePath: string, spells: ReturnType<typeof makeSpell>[]) {
  const bundle = {
    bundle_format_version: 1,
    spells,
  };
  fs.writeFileSync(filePath, JSON.stringify(bundle, null, 2), "utf-8");
  return filePath;
}

function buildSizedSpellBundle(
  targetBytes: number,
  overrides?: Partial<ReturnType<typeof makeSpell>>,
) {
  const spell = {
    ...makeSpell("SizedBundle", "", 3),
    ...overrides,
  };
  const bundle = {
    bundle_format_version: 1,
    spells: [spell],
  };
  const basePayload = JSON.stringify(bundle);
  const descriptionBytes = targetBytes - Buffer.byteLength(basePayload, "utf-8");

  if (descriptionBytes < 0) {
    throw new Error(
      `Target size ${targetBytes} is smaller than base payload ${basePayload.length}`,
    );
  }

  spell.description = "x".repeat(descriptionBytes);
  const payload = JSON.stringify(bundle);
  const payloadBytes = Buffer.byteLength(payload, "utf-8");

  if (payloadBytes !== targetBytes) {
    throw new Error(`Expected payload to be ${targetBytes} bytes, got ${payloadBytes}`);
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Helpers shared across file — create + import an initial version of a spell
// so a conflict exists on the second import.
// ---------------------------------------------------------------------------

async function seedSpellInDb(app: SpellbookApp, name: string, description: string, level = 3) {
  await app.createSpell({ name, level: String(level), description, school: "Evocation" });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("JSON Import Conflict Resolution", () => {
  test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");
  test.slow();

  test("json preview: exactly 10 MB proceeds without warning", async ({ appContext }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const payload = buildSizedSpellBundle(LARGE_IMPORT_WARNING_THRESHOLD_BYTES);

    await test.step("Open import wizard with exact-threshold bundle", async () => {
      await app.resetImportWizard();
      await page.getByTestId("import-file-input").setInputFiles({
        name: "exact-threshold.json",
        mimeType: "application/json",
        buffer: Buffer.from(payload, "utf-8"),
      });

      await expect(page.getByText("exact-threshold.json")).toBeVisible({ timeout: TIMEOUTS.short });
    });

    await test.step("Preview continues directly to JSON preview", async () => {
      await page.getByRole("button", { name: "Preview →" }).click();

      await expect(page.getByTestId("modal-dialog")).not.toBeVisible();
      await expect(page.getByTestId("btn-import-json")).toBeVisible({ timeout: TIMEOUTS.medium });
    });
  });

  test("json preview: 10 MB + 1 byte requires confirmation before preview", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const payload = buildSizedSpellBundle(LARGE_IMPORT_WARNING_THRESHOLD_BYTES + 1);

    await test.step("Open import wizard with oversized-warning bundle", async () => {
      await app.resetImportWizard();
      await page.getByTestId("import-file-input").setInputFiles({
        name: "warning-threshold.json",
        mimeType: "application/json",
        buffer: Buffer.from(payload, "utf-8"),
      });

      await expect(page.getByText("warning-threshold.json")).toBeVisible({
        timeout: TIMEOUTS.short,
      });
    });

    await test.step("Preview stops on confirmation modal", async () => {
      await page.getByRole("button", { name: "Preview →" }).click();

      await expect(page.getByTestId("modal-dialog")).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(page.getByTestId("modal-dialog")).toContainText("10 MB");
    });

    await test.step("Confirming resumes the normal JSON preview flow", async () => {
      await page.getByTestId("modal-button-confirm").click();
      await expect(page.getByTestId("btn-import-json")).toBeVisible({ timeout: TIMEOUTS.medium });
    });
  });

  test("json import: malicious strings render as text without injected elements", async ({
    appContext,
    fileTracker,
    testTmpDir,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const maliciousName = `<img src=x onerror=alert(1)>_${runId}`;
    const maliciousDescription = `<script>alert(1)</script> Imported ${runId}`;

    await test.step("Preview shows malicious strings as plain text", async () => {
      const jsonPath = fileTracker.track(path.join(testTmpDir, "bundle.json"));
      writeSpellBundle(jsonPath, [makeSpell(maliciousName, maliciousDescription)]);

      await app.resetImportWizard();
      await page.getByTestId("import-file-input").setInputFiles(jsonPath);
      await page.getByRole("button", { name: "Preview →" }).click();

      await expect(page.getByTestId("btn-import-json")).toBeVisible({ timeout: TIMEOUTS.medium });
      await expect(page.locator('img[src="x"]')).toHaveCount(0);
      await expect(page.locator("script").filter({ hasText: "alert(1)" })).toHaveCount(0);
    });

    await test.step("Imported spell remains literal in library and editor views", async () => {
      await page.getByTestId("btn-import-json").click();
      await expect(page.getByTestId("btn-import-more")).toBeVisible({ timeout: TIMEOUTS.long });

      await app.openSpell(maliciousName);
      await expect(page.getByTestId("spell-name-input")).toHaveValue(maliciousName);
      await expect(page.getByTestId("spell-description-textarea")).toHaveValue(
        maliciousDescription,
      );
      await expect(page.locator('img[src="x"]')).toHaveCount(0);
      await expect(page.locator("script").filter({ hasText: "alert(1)" })).toHaveCount(0);
    });
  });

  test("json preview: persisted reject-spell policy blocks invalid SourceRef URLs", async ({
    appContext,
    fileTracker,
    testTmpDir,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const jsonPath = fileTracker.track(path.join(testTmpDir, "bundle.json"));

    writeSpellBundle(jsonPath, [
      {
        ...makeSpell(`BadUrl_${runId}`, "Bundle with invalid SourceRef URL"),
        source_refs: [{ book: "PHB", url: "javascript:alert(1)" }],
      },
    ]);

    await test.step("Persist reject-spell policy in the import wizard", async () => {
      await app.resetImportWizard();
      await page.getByTestId("select-source-ref-url-policy").selectOption("reject-spell");

      await app.navigate("Library");
      await app.navigate("Import");

      await expect(page.getByTestId("select-source-ref-url-policy")).toHaveValue("reject-spell");
    });

    await test.step("Preview rejects spells with invalid SourceRef URLs", async () => {
      await page.getByTestId("import-file-input").setInputFiles(jsonPath);
      await page.getByRole("button", { name: "Preview →" }).click();

      await expect(page.getByText("1 spell(s) failed validation")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await expect(page.locator("text=/invalid SourceRef URL/i").first()).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await expect(page.getByTestId("btn-import-json")).toBeDisabled();
    });
  });

  // ─── Test 1: Per-conflict — Keep Existing ──────────────────────────────
  test("per-conflict: Keep Existing preserves original spell", async ({
    appContext,
    fileTracker,
    testTmpDir,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `ConflictKeepExisting_${runId}`;
    const originalDesc = "Original description — should be kept.";
    const incomingDesc = "Incoming description — should be discarded.";

    await test.step("Seed spell in DB", async () => {
      await seedSpellInDb(app, spellName, originalDesc);
    });

    await test.step("Import JSON with conflict", async () => {
      const jsonPath = fileTracker.track(path.join(testTmpDir, "bundle.json"));
      writeSpellBundle(jsonPath, [makeSpell(spellName, incomingDesc)]);

      await app.importJsonFile(jsonPath);
    });

    await test.step("Resolve: keep existing", async () => {
      await expect(page.getByTestId("conflict-progress")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await app.resolveNextConflict("keep_existing");

      // Result screen should appear
      await expect(page.getByTestId("btn-import-more")).toBeVisible({
        timeout: TIMEOUTS.long,
      });
    });

    await test.step("Verify spell not changed in DB", async () => {
      await app.openSpell(spellName);
      await expect(page.getByText(originalDesc)).toBeVisible({ timeout: TIMEOUTS.medium });
    });
  });

  // ─── Test 2: Per-conflict — Replace with New ───────────────────────────
  test("per-conflict: Replace with New overwrites spell content", async ({
    appContext,
    fileTracker,
    testTmpDir,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `ConflictReplace_${runId}`;
    const originalDesc = "Original — should be replaced.";
    const incomingDesc = `Replacement content ${runId}`;

    await test.step("Seed spell", async () => {
      await seedSpellInDb(app, spellName, originalDesc);
    });

    await test.step("Import conflicting JSON", async () => {
      const jsonPath = fileTracker.track(path.join(testTmpDir, "bundle.json"));
      writeSpellBundle(jsonPath, [makeSpell(spellName, incomingDesc)]);

      await app.importJsonFile(jsonPath);
    });

    await test.step("Resolve: replace with new", async () => {
      await expect(page.getByTestId("conflict-progress")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await app.resolveNextConflict("replace_with_new");

      await expect(page.getByTestId("btn-import-more")).toBeVisible({
        timeout: TIMEOUTS.long,
      });
    });

    await test.step("Verify spell updated in DB", async () => {
      await app.openSpell(spellName);
      await expect(page.getByText(incomingDesc)).toBeVisible({ timeout: TIMEOUTS.medium });
    });
  });

  // ─── Test 3: Per-conflict — Keep Both ──────────────────────────────────
  test("per-conflict: Keep Both creates a suffixed copy", async ({
    appContext,
    fileTracker,
    testTmpDir,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellName = `ConflictKeepBoth_${runId}`;
    const originalDesc = "Original — keep this.";
    const incomingDesc = `Incoming — add as new ${runId}`;

    await test.step("Seed spell", async () => {
      await seedSpellInDb(app, spellName, originalDesc);
    });

    await test.step("Import conflicting JSON", async () => {
      const jsonPath = fileTracker.track(path.join(testTmpDir, "bundle.json"));
      writeSpellBundle(jsonPath, [makeSpell(spellName, incomingDesc)]);

      await app.importJsonFile(jsonPath);
    });

    await test.step("Resolve: keep both", async () => {
      await expect(page.getByTestId("conflict-progress")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await app.resolveNextConflict("keep_both");

      await expect(page.getByTestId("btn-import-more")).toBeVisible({
        timeout: TIMEOUTS.long,
      });
    });

    await test.step("Verify both spells exist in Library", async () => {
      // Original should still be present
      await app.openSpell(spellName);
      await expect(page.getByText(originalDesc)).toBeVisible({ timeout: TIMEOUTS.medium });

      // Suffixed copy "(1)" should also exist
      await app.navigate("Library");
      await page.getByTestId("search-input").fill(spellName);
      await page.getByTestId("library-search-button").click();

      // Both the original and "(1)" variant should appear in results
      await expect(page.getByRole("link", { name: spellName, exact: true })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await expect(page.getByRole("link", { name: `${spellName} (1)`, exact: false })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
    });
  });

  // ─── Test 4: Apply to All ───────────────────────────────────────────────
  test("per-conflict: Apply to All resolves remaining conflicts in one click", async ({
    appContext,
    fileTracker,
    testTmpDir,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const spellNames = [`ATA_Alpha_${runId}`, `ATA_Beta_${runId}`, `ATA_Gamma_${runId}`];

    await test.step("Seed 3 spells", async () => {
      for (const name of spellNames) {
        await seedSpellInDb(app, name, "Original content.");
      }
    });

    await test.step("Import 3-spell bundle (all conflict)", async () => {
      const jsonPath = fileTracker.track(path.join(testTmpDir, "bundle.json"));
      writeSpellBundle(
        jsonPath,
        spellNames.map((n) => makeSpell(n, `Updated ${runId} for ${n}`)),
      );
      await app.importJsonFile(jsonPath);
    });

    await test.step("Resolve: enable Apply to All, then click Keep Existing", async () => {
      // Conflict 1 of 3
      await expect(page.getByTestId("conflict-progress")).toHaveText("Conflict 1 of 3", {
        timeout: TIMEOUTS.medium,
      });

      // Apply to All then resolve — should jump straight to result
      await app.resolveNextConflict("keep_existing", /* applyToAll */ true);

      await expect(page.getByTestId("btn-import-more")).toBeVisible({
        timeout: TIMEOUTS.long,
      });
      // Conflict 2 / 3 dialogs should never have appeared
      await expect(page.getByText("Conflict 2 of 3")).not.toBeVisible();
    });
  });

  // ─── Test 5: Bulk summary dialog (≥ 10 conflicts) ──────────────────────
  test("bulk dialog: shown for 10+ conflicts; Replace All resolves all", async ({
    appContext,
    fileTracker,
    testTmpDir,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const conflictCount = 10;

    await test.step(`Seed ${conflictCount} spells`, async () => {
      for (let i = 0; i < conflictCount; i++) {
        await seedSpellInDb(app, `BulkSpell_${runId}_${i}`, "Original.");
      }
    });

    await test.step(`Import ${conflictCount}-spell bundle (all conflict)`, async () => {
      const jsonPath = fileTracker.track(path.join(testTmpDir, "bundle.json"));
      const spells = Array.from({ length: conflictCount }, (_, i) =>
        makeSpell(`BulkSpell_${runId}_${i}`, `Updated ${runId} version`),
      );
      writeSpellBundle(jsonPath, spells);
      await app.importJsonFile(jsonPath);
    });

    await test.step("Bulk summary dialog visible, not per-conflict dialog", async () => {
      await expect(page.getByTestId("btn-bulk-replace-all")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      // Per-conflict dialog should NOT be shown
      await expect(page.getByTestId("conflict-progress")).not.toBeVisible();
      // Confirm conflict count displayed
      await expect(page.getByText(`Found ${conflictCount} conflicts`)).toBeVisible();
    });

    await test.step("Click Replace All → result screen", async () => {
      await page.getByTestId("btn-bulk-replace-all").click();
      await expect(page.getByTestId("btn-import-more")).toBeVisible({
        timeout: TIMEOUTS.long,
      });
      // Result should show conflicts resolved
      await expect(page.getByText(/Conflicts resolved/i)).toBeVisible();
    });
  });

  // ─── Test 6: Bulk Skip All ─────────────────────────────────────────────
  test("bulk dialog: Skip All keeps existing content; library unchanged", async ({
    appContext,
    fileTracker,
    testTmpDir,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const conflictCount = 10;
    const originalDesc = "Original content — Skip All must preserve.";
    const sampleName = `BulkSkip_${runId}_0`;

    await test.step(`Seed ${conflictCount} spells`, async () => {
      for (let i = 0; i < conflictCount; i++) {
        await seedSpellInDb(app, `BulkSkip_${runId}_${i}`, originalDesc);
      }
    });

    await test.step(`Import ${conflictCount}-spell bundle (all conflict)`, async () => {
      const jsonPath = fileTracker.track(path.join(testTmpDir, "bundle.json"));
      const spells = Array.from({ length: conflictCount }, (_, i) =>
        makeSpell(`BulkSkip_${runId}_${i}`, `Incoming ${runId} — should be skipped`),
      );
      writeSpellBundle(jsonPath, spells);
      await app.importJsonFile(jsonPath);
    });

    await test.step("Bulk summary visible; click Skip All", async () => {
      await expect(page.getByTestId("btn-bulk-skip-all")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await page.getByTestId("btn-bulk-skip-all").click();
      await expect(page.getByTestId("btn-import-more")).toBeVisible({
        timeout: TIMEOUTS.long,
      });
    });

    await test.step("Result screen shows conflicts resolved as kept", async () => {
      await expect(page.getByText(/Conflicts resolved/i)).toBeVisible();
      // Skip All maps to keep_existing: N kept, 0 replaced, 0 kept both
      await expect(page.getByText(new RegExp(`${conflictCount} kept`))).toBeVisible();
    });

    await test.step("Verify library: original spell content unchanged", async () => {
      await app.openSpell(sampleName);
      await expect(page.getByText(originalDesc)).toBeVisible({ timeout: TIMEOUTS.medium });
    });
  });

  // ─── Test 7: Bulk Keep All ─────────────────────────────────────────────
  test("bulk dialog: Keep All adds suffixed copies; library has both", async ({
    appContext,
    fileTracker,
    testTmpDir,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const conflictCount = 10;
    const originalDesc = "Original — keep this.";
    const incomingDesc = `Incoming ${runId} — keep both copy.`;
    const baseName = `BulkKeep_${runId}_0`;

    await test.step(`Seed ${conflictCount} spells`, async () => {
      for (let i = 0; i < conflictCount; i++) {
        await seedSpellInDb(app, `BulkKeep_${runId}_${i}`, originalDesc);
      }
    });

    await test.step(`Import ${conflictCount}-spell bundle (all conflict)`, async () => {
      const jsonPath = fileTracker.track(path.join(testTmpDir, "bundle.json"));
      const spells = Array.from({ length: conflictCount }, (_, i) =>
        makeSpell(`BulkKeep_${runId}_${i}`, incomingDesc),
      );
      writeSpellBundle(jsonPath, spells);
      await app.importJsonFile(jsonPath);
    });

    await test.step("Bulk summary visible; click Keep All", async () => {
      await expect(page.getByTestId("btn-bulk-keep-all")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await page.getByTestId("btn-bulk-keep-all").click();
      await expect(page.getByTestId("btn-import-more")).toBeVisible({
        timeout: TIMEOUTS.long,
      });
    });

    await test.step("Result screen shows conflicts resolved as kept both", async () => {
      await expect(page.getByText(/Conflicts resolved/i)).toBeVisible();
      // Keep All maps to keep_both: 0 kept, 0 replaced, N kept both
      await expect(page.getByText(new RegExp(`${conflictCount} kept both`))).toBeVisible();
    });

    await test.step("Verify library: original and suffixed copy exist", async () => {
      await app.openSpell(baseName);
      await expect(page.getByText(originalDesc)).toBeVisible({ timeout: TIMEOUTS.medium });

      await app.navigate("Library");
      await page.getByTestId("search-input").fill(baseName);
      await page.getByTestId("library-search-button").click();

      await expect(page.getByRole("link", { name: baseName, exact: true })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await expect(page.getByRole("link", { name: `${baseName} (1)`, exact: false })).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
    });
  });

  // ─── Test 8: Bulk Review Each ───────────────────────────────────────────
  test("bulk dialog: Review Each shows per-conflict dialog with progress", async ({
    appContext,
    fileTracker,
    testTmpDir,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);
    const runId = generateRunId();
    const conflictCount = 10;

    await test.step(`Seed ${conflictCount} spells`, async () => {
      for (let i = 0; i < conflictCount; i++) {
        await seedSpellInDb(app, `BulkReview_${runId}_${i}`, "Original.");
      }
    });

    await test.step(`Import ${conflictCount}-spell bundle (all conflict)`, async () => {
      const jsonPath = fileTracker.track(path.join(testTmpDir, "bundle.json"));
      const spells = Array.from({ length: conflictCount }, (_, i) =>
        makeSpell(`BulkReview_${runId}_${i}`, `Updated ${runId}`),
      );
      writeSpellBundle(jsonPath, spells);
      await app.importJsonFile(jsonPath);
    });

    await test.step("Bulk summary visible; click Review Each", async () => {
      await expect(page.getByTestId("btn-bulk-review-each")).toBeVisible({
        timeout: TIMEOUTS.medium,
      });
      await page.getByTestId("btn-bulk-review-each").click();
    });

    await test.step("Per-conflict dialog appears with Conflict 1 of N", async () => {
      await expect(page.getByTestId("conflict-progress")).toHaveText(
        `Conflict 1 of ${conflictCount}`,
        { timeout: TIMEOUTS.medium },
      );
      // Per-conflict action buttons visible
      await expect(page.getByTestId("btn-keep-existing-json")).toBeVisible();
    });

    await test.step("Resolve first conflict (Keep Existing); flow continues", async () => {
      await app.resolveNextConflict("keep_existing");
      // Either next conflict (2 of N) or result screen if only one was left
      await expect(
        page.getByTestId("conflict-progress").or(page.getByTestId("btn-import-more")),
      ).toBeVisible({ timeout: TIMEOUTS.long });
    });
  });
});
