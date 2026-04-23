import type { Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import { TIMEOUTS } from "../fixtures/constants";

/**
 * SpellEditor school/sphere are controlled inputs; plain `fill` can flake in WebView2 after many navigations.
 * Set the native value and dispatch `input`/`change` so React `onChange` runs.
 */
export async function fillControlledTextInput(locator: Locator, value: string): Promise<void> {
  await expect(locator).toBeVisible({ timeout: TIMEOUTS.short });
  await locator.evaluate((el, v) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, v);
    else input.value = v;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await expect(locator).toHaveValue(value, { timeout: TIMEOUTS.medium });
}
