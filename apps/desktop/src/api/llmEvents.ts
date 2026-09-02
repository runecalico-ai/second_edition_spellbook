import { listen, type EventCallback, type UnlistenFn } from "@tauri-apps/api/event";
import { spellbookE2EHarness } from "../ui/spellbookE2EHarness";

/**
 * Subscribe to a local-ML production event through the E2E seam.
 *
 * When the opt-in Playwright local ML harness is active the subscription is
 * registered against the harness listener registry; otherwise it falls
 * through to the real Tauri event system.
 */
export function listenLlmEvent<T>(
  eventName: string,
  handler: EventCallback<T>,
): Promise<UnlistenFn> {
  return spellbookE2EHarness.localMl.listen<T>(eventName, handler) ?? listen<T>(eventName, handler);
}
