import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type {
  LocalMlE2EObservation,
  LocalMlE2EScenario,
} from "../../src/ui/spellbookE2EHarness";
import type { ReindexResult, SemanticSearchResult } from "../../src/types/llm";
import { TIMEOUTS } from "../fixtures/constants";

/**
 * Focused page object for the Task 10 local LLM chat/provisioning/semantic
 * workflows. Keeps all local-ML harness locators, scenario installation, and
 * command-bridge access out of `SpellbookApp` and general E2E tests.
 */
export class LocalLlmChat {
  constructor(private readonly page: Page) {}

  /**
   * Install a deterministic local-ML scenario before `App` mounts, then
   * reload so the scripted status/download/chat/semantic/reindex behavior is
   * active from the first render. Isolation comes from the fresh per-test
   * `appContext` fixture; there is no separate `resetScenario()` because an
   * init script cannot be removed from the current page.
   */
  async installScenario(scenario: LocalMlE2EScenario): Promise<void> {
    await this.page.addInitScript((value: LocalMlE2EScenario) => {
      window.__IS_PLAYWRIGHT__ = true;
      window.__SPELLBOOK_E2E_LOCAL_ML_SCENARIO__ = value;
      window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__ = [];
    }, scenario);
    await this.page.reload();
    await expect(this.page.getByRole("navigation")).toBeVisible({ timeout: TIMEOUTS.medium });
  }

  /** Navigate to the Chat tab and wait for the chat panel to mount. */
  async openChat(): Promise<void> {
    await this.page.getByRole("navigation").getByRole("link", { name: "Chat" }).click();
    await expect(this.page.getByTestId("chat-panel")).toBeVisible({ timeout: TIMEOUTS.medium });
  }

  /** Fill the chat input and send, asserting the user bubble is rendered. */
  async send(message: string): Promise<void> {
    const input = this.page.getByTestId("chat-input");
    await input.fill(message);
    await this.page.getByTestId("btn-ask-chat").click();
    await expect(this.page.getByTestId("chat-user-bubble").last()).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
  }

  /** Click Cancel Generation and wait for it to become disabled (generation stopped). */
  async cancelGeneration(): Promise<void> {
    const cancelButton = this.page.getByTestId("btn-cancel-chat");
    await cancelButton.click();
    await expect(cancelButton).toBeDisabled({ timeout: TIMEOUTS.medium });
  }

  /** Click the chat LLM download button and wait for the download modal to open. */
  async openLlmDownload(): Promise<void> {
    await this.page.getByTestId("chat-llm-download-button").click();
    await expect(this.page.getByTestId("model-download-modal")).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
  }

  /**
   * Advance a manually-paused scripted download by exactly one step through
   * the command bridge. The calling test asserts the resulting 25%/100%/
   * terminal state; this control helper only performs the browser-side call.
   */
  async advanceDownload(): Promise<void> {
    await this.page.evaluate(() => {
      const bridge = window.__SPELLBOOK_E2E_LOCAL_ML_COMMANDS__;
      if (!bridge) throw new Error("Local ML E2E command bridge is not installed");
      bridge.advanceDownload();
    });
  }

  /** Navigate to Library and switch the search mode to semantic. */
  async switchLibraryToSemantic(): Promise<void> {
    await this.page.getByRole("navigation").getByRole("link", { name: "Library" }).click();
    await expect(this.page.getByRole("heading", { name: "Spell Library" })).toBeVisible({
      timeout: TIMEOUTS.medium,
    });
    await this.page.getByTestId("library-mode-select").selectOption("semantic");
    await expect(this.page.getByTestId("library-mode-select")).toHaveValue("semantic", {
      timeout: TIMEOUTS.medium,
    });
  }

  /** Run a semantic search through the command-only bridge (no required v1 UI). */
  async runSemanticSearch(query: string, limit?: number): Promise<SemanticSearchResult[]> {
    return this.page.evaluate(
      async ({ query, limit }) => {
        const bridge = window.__SPELLBOOK_E2E_LOCAL_ML_COMMANDS__;
        if (!bridge) throw new Error("Local ML E2E command bridge is not installed");
        return bridge.searchSpellsSemantic(query, limit);
      },
      { query, limit },
    );
  }

  /** Run a reindex through the command-only bridge (no required v1 UI). */
  async runReindex(force: boolean): Promise<ReindexResult> {
    return this.page.evaluate(async (forceValue) => {
      const bridge = window.__SPELLBOOK_E2E_LOCAL_ML_COMMANDS__;
      if (!bridge) throw new Error("Local ML E2E command bridge is not installed");
      return bridge.reindexEmbeddings(forceValue);
    }, force);
  }

  /** Read the harness's recorded command/event observations for contract assertions. */
  async observations(): Promise<LocalMlE2EObservation[]> {
    return this.page.evaluate(() =>
      structuredClone(window.__SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__ ?? []),
    );
  }
}
