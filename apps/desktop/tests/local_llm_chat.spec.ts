import { expect, test } from "./fixtures/test-fixtures";
import { TIMEOUTS } from "./fixtures/constants";
import { SpellbookApp } from "./page-objects/SpellbookApp";

test.skip(process.platform !== "win32", "Tauri CDP tests require WebView2 on Windows.");

test.describe("Local LLM chat provisioning", () => {
  test("first-run provisioning shows model size, Download, Add Local Model, and no chat input", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.localLlm.installScenario({
      llmStatus: { status: "notProvisioned", modelPath: "" },
      embeddingsStatus: { state: "notProvisioned" },
    });

    await app.localLlm.openChat();

    const emptyState = page.getByTestId("chat-provisioning-empty-state");
    await expect(emptyState).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
    await expect(page.getByTestId("chat-llm-download-button")).toBeVisible();
    await expect(page.getByTestId("chat-llm-import-button")).toBeVisible();
    // Scoped to the visible empty state: the same "~700 MB" text is also
    // rendered (sr-only) inside the accessibility live region, so an
    // unscoped page.getByText(/700 MB/i) is a strict-mode locator ambiguity.
    await expect(emptyState.getByText(/700 MB/i)).toBeVisible();

    await expect(page.getByTestId("chat-input")).toHaveCount(0);
    await expect(page.getByTestId("chat-message-list")).toHaveCount(0);
  });

  test("download progress advances from 25% to 100% and completion enables chat input", async ({
    appContext,
  }) => {
    const { page } = appContext;
    const app = new SpellbookApp(page);

    await app.localLlm.installScenario({
      llmStatus: { status: "notProvisioned", modelPath: "" },
      embeddingsStatus: { state: "notProvisioned" },
      download: {
        kind: "llm",
        progress: [
          { bytesDownloaded: 256, totalBytes: 1024 },
          { bytesDownloaded: 1024, totalBytes: 1024 },
        ],
        manualProgress: true,
        terminalLlmStatus: {
          status: "ready",
          modelPath: "/vault/models/tinyllama.gguf",
        },
      },
    });

    await app.localLlm.openChat();
    await app.localLlm.openLlmDownload();

    const progressBar = page.getByTestId("model-download-modal-progress-bar");
    await expect(progressBar).toHaveAttribute("aria-valuenow", "25", {
      timeout: TIMEOUTS.medium,
    });

    await app.localLlm.advanceDownload();
    await expect(progressBar).toHaveAttribute("aria-valuenow", "100", {
      timeout: TIMEOUTS.medium,
    });
    await expect(page.getByTestId("model-download-modal")).toBeVisible();

    await app.localLlm.advanceDownload();
    await expect(page.getByTestId("model-download-modal")).not.toBeVisible({
      timeout: TIMEOUTS.medium,
    });
    await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: TIMEOUTS.medium });
    await expect(page.getByTestId("chat-input")).toBeEnabled();

    const observations = await app.localLlm.observations();
    const progressEvents = observations.filter(
      (observation) =>
        observation.kind === "event" && observation.name === "llm://download-progress",
    );
    expect(progressEvents.length).toBeGreaterThan(0);
    for (const observation of progressEvents) {
      expect(Object.keys(observation.payload as Record<string, unknown>).sort()).toEqual(
        ["bytesDownloaded", "totalBytes"].sort(),
      );
    }
  });
});
