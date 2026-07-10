import type {
  LocalMlE2ECommandBridge,
  LocalMlE2EObservation,
  LocalMlE2EScenario,
} from "./ui/spellbookE2EHarness";

declare global {
  interface Window {
    __IS_PLAYWRIGHT__?: boolean;
    /** Playwright E2E: optional delay (ms) before `create_spell` / `update_spell` invoke (capped at 30s). */
    __SPELLBOOK_E2E_SAVE_INVOKE_DELAY_MS?: number;
    /** Playwright E2E: optional per-query spell-picker search delays keyed as `${listType}:${query}`. */
    __SPELLBOOK_E2E_SPELL_PICKER_SEARCH_DELAYS__?: Record<string, number>;
    /** Playwright E2E: optional spell-picker search event log for deterministic race assertions. */
    __SPELLBOOK_E2E_SPELL_PICKER_SEARCH_EVENTS__?: Array<{
      listType: "KNOWN" | "PREPARED";
      query: string;
      phase: "start" | "resolve";
    }>;
    /**
     * Playwright E2E: one-shot corrupt `RangeSpec.distance` after the user picks a distance kind,
     * so blur/submit can surface scalar copy ("Base value must be 0 or greater") despite clamp-on-change inputs.
     */
    __SPELLBOOK_E2E_CORRUPT_RANGE_BASE?: { value: number; consumed?: boolean };
    /** Playwright E2E: visual-contract mode for screenshots that need all structured fields expanded. */
    __SPELLBOOK_E2E_VISUAL_CONTRACT__?: "all-structured";
    /** Playwright E2E: explicit opt-in local ML harness scenario. */
    __SPELLBOOK_E2E_LOCAL_ML_SCENARIO__?: LocalMlE2EScenario;
    /** Playwright E2E: local ML harness command and event log. */
    __SPELLBOOK_E2E_LOCAL_ML_OBSERVATIONS__?: LocalMlE2EObservation[];
    /** Playwright E2E: local ML harness command-only bridge. */
    __SPELLBOOK_E2E_LOCAL_ML_COMMANDS__?: LocalMlE2ECommandBridge;
  }
}
