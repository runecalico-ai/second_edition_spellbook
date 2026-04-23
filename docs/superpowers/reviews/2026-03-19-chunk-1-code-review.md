# Chunk 1 Three-Pass Code Review

Branch: `add-spell-ui-design-and-accessibility`  
Base: `ea4a12f` (`main`)  
Head (review snapshot): `e8545e9`  
Date: 2026-03-19

**Resolved in:** `009e30d` (same branch; 2026-03-19)

| Area | Finding (below) | Status |
|------|-----------------|--------|
| Pass 1 | Pre-hydration `localStorage` throws before theme applies | **Fixed** — `getItem` wrapped in try/catch in `index.html` |
| Pass 1 | First-load bootstrap untested | **Fixed** — `apps/desktop/src/theme/preHydrationTheme.ts` + tests; `main.test.tsx` integration. *Residual:* nothing asserts the literal `<head>` script in `index.html` still exists (optional guard). |
| Pass 2 | Explicit → system announces wrong string | **Fixed** — `skipNextResolvedThemeAnnouncement` in `App.tsx` |
| Pass 2 | Explicit-to-system not covered by E2E | **Fixed** — `theme_and_feedback.spec.ts` |
| Pass 2 | Settings select contract under-tested | **Fixed** — `SettingsPage.test.tsx` (options + value after unchecking follow-system) |
| Pass 3 | Durations off-spec | **Fixed** — all kinds `3000ms` in `useNotifications.ts` |
| Pass 3 | Tests locked wrong durations | **Fixed** — `useNotifications.test.ts` asserts `3000` per kind |
| Pass 3 | Manual dismiss not exercised | **Fixed** — dismiss click + live viewport clears store in `NotificationViewport.test.tsx` |
| Pass 3 | Close control not `(x)` | **Fixed** — `×` dismiss button + `data-testid="toast-dismiss-button"` |

This review covers Chunk 1: Shared Theme and Feedback Foundations from [openspec/changes/add-spell-ui-design-and-accessibility/tasks.md](../../../openspec/changes/add-spell-ui-design-and-accessibility/tasks.md).

Subagent split:
- Pass 1 support: theme bootstrap/runtime
- Pass 2 support: settings UI/app shell/live-region behavior
- Pass 3 support: notifications and verification coverage
- Cross-check: test-only coverage gaps

## Pass 1: Theme Bootstrap and Runtime

### Findings

1. Medium: the pre-hydration bootstrap can abort before applying the theme class if storage access throws.  
   File: `apps/desktop/index.html:10`

   The inline bootstrap does `window.localStorage.getItem("spellbook-theme")` without a guard. The Zustand store already treats storage access as fallible, but the first-paint path does not. If `localStorage` throws in the WebView/browser context, the script exits before `document.documentElement.classList.toggle("dark", ...)` runs, which defeats the spec requirement to apply the resolved theme immediately and avoid a flash of the wrong theme.

2. Medium: first-load bootstrap behavior is effectively untested.  
   Files: `apps/desktop/src/main.test.tsx:63`, `apps/desktop/tests/theme_and_feedback.spec.ts:25`

   Current tests validate the post-mount runtime in `main.tsx`, not the required `<head>` bootstrap path in `index.html`. A regression that removes or breaks the inline script would still leave the current unit and E2E suite green, even though first paint would be wrong.

### Pass Assessment

*Historical:* The runtime wiring in [apps/desktop/src/main.tsx](c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src/main.tsx) is generally solid, but the no-flash requirement is not fully robust because the pre-hydration script is both fragile and unverified.

*After `009e30d`:* Bootstrap storage access is guarded; shared pre-hydration helpers are tested. Optional follow-up: assert `index.html` still ships the inline bootstrap (string/snapshot test).

## Pass 2: Settings UI and Theme Announcements

### Findings

1. Medium: switching from an explicit theme back to system mode can announce the resolved OS theme instead of the newly selected mode.  
   Files: `apps/desktop/src/ui/App.tsx:226`, `apps/desktop/src/ui/App.tsx:230`, `apps/desktop/src/ui/SettingsPage.tsx:33`

   Chunk 1 says the hidden live region should announce the new mode name, for example `"System mode"`. When the user re-enables `Follow system preference`, `setTheme("system")` can change both `themeMode` and `resolvedTheme`. The first effect writes `"System mode"`, but the second effect may immediately overwrite it with `"Light mode"` or `"Dark mode"` if the resolved OS theme changed during the same transition. That produces the wrong announcement for the user action that just occurred.

2. Medium: the explicit-to-system announcement path is not covered by tests.  
   File: `apps/desktop/tests/theme_and_feedback.spec.ts:61`

   The E2E suite checks system-mode updates after the page is already following the OS, but it never exercises the transition from explicit light/dark back to system. That leaves the announcement overwrite bug above unguarded.

3. Low: the tests do not verify the settings select contract tightly enough.  
   Files: `apps/desktop/src/ui/SettingsPage.test.tsx:22`, `apps/desktop/src/ui/SettingsPage.test.tsx:86`

   Coverage checks that the controls exist and that toggling updates store state, but it does not assert that the native select exposes exactly the required `Light` and `Dark` options, nor that unchecking `Follow system preference` immediately shows the current resolved theme value before the user changes the select.

### Pass Assessment

*Historical:* The settings route and shell integration are present, but the live-region behavior still has a real spec mismatch on one transition path, and the tests currently miss it.

*After `009e30d`:* Explicit → system announces **System mode**; E2E and unit tests cover the path; settings tests assert Light/Dark options and select value after disabling follow-system.

## Pass 3: Notifications and Verification

### Findings

1. Medium: toast durations do not match the Chunk 1 contract.  
   File: `apps/desktop/src/store/useNotifications.ts:21`

   The spec requires `3000ms` defaults for success, warning, and error, while keeping duration stored per type so the values can diverge later. The implementation currently hard-codes `success: 3000`, `warning: 5000`, and `error: 7000`, which is a direct behavior mismatch for Chunk 1.

2. Medium: the tests lock in the same off-spec duration behavior.  
   File: `apps/desktop/src/store/useNotifications.test.ts:45`

   The test suite asserts the incorrect `3000/5000/7000` table, so it would protect the current spec deviation instead of catching it.

3. Medium: notification tests do not verify the required manual-dismiss behavior.  
   File: `apps/desktop/src/ui/components/NotificationViewport.test.tsx:29`

   The tests check that a close control exists, but they never click the dismiss control to prove that a toast can actually be manually removed. Manual dismissal is still a required Chunk 1 behavior.

4. Low: the close control does not match the spec wording.  
   File: `apps/desktop/src/ui/components/NotificationViewport.tsx:53`

   The task calls for a close `(x)` button on each toast. The implementation renders a text `Close` button instead. This is smaller than the semantic issues above, but it is still a visible mismatch with the documented UI contract.

### Pass Assessment

*Historical:* This is still the weakest area of the chunk. The notification system exists, but it has an off-spec duration table, incomplete dismissal coverage, and a small visible mismatch in the close control.

*After `009e30d`:* Default durations match Chunk 1; tests enforce `3000ms`; manual dismiss is covered end-to-end on the viewport; close control uses **×** with an accessible name.

## Recommended Implementation Order

1. Fix [apps/desktop/src/store/useNotifications.ts](c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src/store/useNotifications.ts) so all three kinds default to `3000ms`, then update [apps/desktop/src/store/useNotifications.test.ts](c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src/store/useNotifications.test.ts).
2. Extend [apps/desktop/src/ui/components/NotificationViewport.test.tsx](c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src/ui/components/NotificationViewport.test.tsx) to cover real manual dismissal, and decide whether the close control in [apps/desktop/src/ui/components/NotificationViewport.tsx](c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src/ui/components/NotificationViewport.tsx) should follow the spec’s `(x)` wording literally.
3. Adjust the theme-announcement effect logic in [apps/desktop/src/ui/App.tsx](c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/src/ui/App.tsx) so switching to system mode announces `"System mode"` consistently.
4. Harden the bootstrap script in [apps/desktop/index.html](c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/apps/desktop/index.html) with the same defensive storage handling used in the theme store.
5. Add coverage for pre-hydration bootstrap behavior, explicit-to-system announcement flow, exact settings options, and resolved-theme display after unchecking follow-system.

## Overall

*Historical (at `e8545e9`):* Chunk 1 is not ready to treat as complete yet. There are no catastrophic regressions, but there are multiple medium-severity spec mismatches. At least one of them is currently baked into the tests, and several others remain unguarded by coverage.

*After `009e30d`:* The findings above are **addressed in implementation and tests** per the resolution table. Chunk 1 items from this review can be treated as **complete** for merge/QA, aside from the optional **index.html bootstrap presence** check if you want belt-and-suspenders regression protection.
