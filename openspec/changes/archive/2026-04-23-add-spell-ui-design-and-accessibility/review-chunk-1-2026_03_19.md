# Code Review — Chunk 1: Shared Theme and Feedback Foundations

**Branch:** `add-spell-ui-design-and-accessibility`
**Commits reviewed:** `58fca67` → `009e30d`
**Date:** 2026-03-19
**Passes:** 3 parallel passes (Theme Store & Infrastructure / Notification System / UI Integration & E2E)

---

## Overall Assessment

**Ready to proceed to Chunk 2.** No Critical issues found across all three passes. The spec is fully implemented for Chunk 1 scope. The important issues below are coverage gaps, edge-case risks, and pre-existing debt — none block forward progress, but several should be fixed before or during Chunk 2.

---

## Pass 1 — Theme Store & Pre-Hydration Infrastructure

**Files reviewed:**
- `apps/desktop/src/store/useTheme.ts`
- `apps/desktop/src/store/useTheme.test.ts`
- `apps/desktop/src/theme/preHydrationTheme.ts`
- `apps/desktop/src/theme/preHydrationTheme.test.ts`
- `apps/desktop/tailwind.config.js`
- `apps/desktop/index.html`
- `apps/desktop/src/main.tsx`
- `apps/desktop/src/main.test.tsx`

### Strengths

- **Defense-in-depth on localStorage.** `getStorage()` guards with `typeof localStorage !== "undefined"`, both read and write paths are wrapped in `try/catch`, and the inline script mirrors the same guard. All three locations handle the same failure mode independently, which is correct for a Tauri desktop app.
- **Sanitization is centralized and reused.** `sanitizeThemeMode` in `useTheme.ts` is the single source of validation logic, and `preHydrationTheme.ts` imports and delegates to it rather than duplicating the allow-list.
- **Pre-hydration inline script is tight and correct.** The IIFE in `index.html` is self-contained, has no external dependencies, and applies both the `dark` class and `data-theme` attribute atomically before React hydration. The storage key literal in the script matches `THEME_STORAGE_KEY`.
- **`attachThemeRuntime` is properly abstracted for testing.** Exporting it with injected dependencies (rootElement, mediaQueryList, store) makes the OS-change tests straightforward and free of DOM mocking.
- **Notification stacking cap is a clean one-liner.** `[...state.notifications, nextItem].slice(-MAX_VISIBLE_NOTIFICATIONS)` drops oldest from the front without branching.
- **Timer math accounts for elapsed time.** `Math.max(0, createdAtMs + durationMs - Date.now())` correctly handles the case where a notification's timer must be rescheduled.
- **Live-region announcement coordination is well-documented.** The two-effect pattern in `App.tsx` includes a clear comment explaining the `skipNextResolvedThemeAnnouncement` ref.
- **Test coverage is behavior-focused, not implementation-focused.**

### Issues

#### Important

**P1-I1 — `syncResolvedTheme` mutates a closure variable rather than Zustand state**
File: `apps/desktop/src/store/useTheme.ts`, lines 65 and 77–82

`systemPrefersDark` is a closure-local `let` variable inside `createThemeStore`. `syncResolvedTheme` mutates it outside Zustand's observable state. This means future `setTheme` calls produce the correct `resolvedTheme` only because of closure mutation, not because Zustand's state is self-consistent — a fragile contract for future maintainers.

**Recommendation:** Store `systemPrefersDark` as part of Zustand state so that `setTheme` and `syncResolvedTheme` both read from the same canonical source.

---

**P1-I2 — `useTheme` singleton calls `getSystemThemePreference()` at module evaluation time**
File: `apps/desktop/src/store/useTheme.ts`, line 86

```ts
export const useTheme = createThemeStore(getSystemThemePreference());
```

This executes `window.matchMedia(...)` during module load, before the component tree mounts. In jsdom-based tests, `matchMedia` always returns `false` at that point, which can produce confusing behavior if a test imports from `useTheme` indirectly (e.g., via `App.tsx`) and gets a different initial `resolvedTheme` than expected.

**Recommendation:** Add a comment at line 86 documenting this initialization timing. Alternatively, defer `getSystemThemePreference()` to the first store action after mount.

---

**P1-I3 — `syncResolvedTheme` has no direct unit test**
File: `apps/desktop/src/store/useTheme.test.ts`

`syncResolvedTheme` is exercised indirectly in `main.test.tsx` but has no direct test in `useTheme.test.ts`. A dedicated test that:
1. Creates a store with `systemPrefersDark = false`
2. Calls `syncResolvedTheme(true)`
3. Asserts `resolvedTheme` is `"dark"` in system mode
4. Calls `setTheme("dark")` then `setTheme("system")` to confirm the closure value persists

would serve as both coverage and a regression guard for P1-I1.

---

**P1-I4 — Inline script can diverge from `preHydrationTheme.ts` without build-time enforcement**
Files: `apps/desktop/src/theme/preHydrationTheme.ts` and `apps/desktop/index.html`

`preHydrationTheme.ts` exists as a tested reference, but only `main.test.tsx` line 95 cross-checks consistency — and only for one scenario (explicit dark). Missing coverage:
- System mode with OS dark preference
- System mode with OS light preference
- Invalid stored value fallback

**Recommendation:** Expand the cross-reference tests in `main.test.tsx` to cover all three scenarios. Add a comment in `index.html` above the script block pointing to `preHydrationTheme.ts` as the canonical reference.

---

**P1-I5 — Cancel-and-reschedule pattern for timers has a narrow edge-case race**
File: `apps/desktop/src/ui/components/NotificationViewport.tsx`, lines 75–78

Every time the `notifications` list reference changes, all timers are cancelled and rescheduled using remaining-time math. This is correct. However, if `Date.now()` returns a value between an old timer firing and the new timer being set, a notification that arrives just as another one is about to expire can cause the expiring one to dismiss slightly earlier than its configured duration. This is a cosmetic edge-case, not a correctness failure. The existing "preserves remaining time" test covers the expected behavior.

**Recommendation:** Add a comment in the component documenting this behavior.

#### Minor

**P1-M1 — `index.html` body has hardcoded dark-mode background classes**
File: `apps/desktop/index.html`, line 30

`bg-stone-50 text-stone-950 dark:bg-neutral-950 dark:text-neutral-100` on `<body>` duplicates classes on the App root `<div>`. Removal is already scheduled in Chunk 3 `tasks.md` line 141.

---

**P1-M2 — No guard against concurrent `setTheme` + `syncResolvedTheme` race**
File: `apps/desktop/src/store/useTheme.ts`, lines 70–76

Rapid concurrent calls (e.g., OS change fires while user changes theme select) could produce unexpected `resolvedTheme` ordering. Not a real-world issue in a single-threaded browser, but worth noting if `syncResolvedTheme` is ever called from an async path.

---

**P1-M3 — `addListener`/`removeListener` deprecated API fallback is untested and unnecessary**
File: `apps/desktop/src/main.tsx`, lines 36–42

These branches target environments without `addEventListener` on `MediaQueryList`. Tauri's Chromium target guarantees `addEventListener`. The tests only exercise the `addEventListener` path. Safe to remove.

---

**P1-M4 — `readStoredThemeMode` is not directly tested**
File: `apps/desktop/src/store/useTheme.test.ts`

`readStoredThemeMode` is exported but not directly imported in the test file. Explicit tests for the `getStorage()` null path and `try/catch` fallback would provide a direct failure signal if the function is changed.

---

**P1-M5 — `settings-gear-button` is on a `<Link>` not a `<button>`**
File: `apps/desktop/src/ui/App.tsx`, lines 299–317

The testid name implies a button, but the implementation uses a `<Link>` (renders as `<a>`). Semantics are correct for navigation. Naming inconsistency only — no functional impact.

---

## Pass 2 — Transient Notification System

**Files reviewed:**
- `apps/desktop/src/store/useNotifications.ts`
- `apps/desktop/src/store/useNotifications.test.ts`
- `apps/desktop/src/ui/components/NotificationViewport.tsx`
- `apps/desktop/src/ui/components/NotificationViewport.test.tsx`

### Strengths

- **Factory pattern for tests avoids cross-test state contamination.** `createNotificationsStore` producing separate instances is the right split from the exported singleton.
- **`scheduleNotificationDismissals` is a pure function** — independently testable without mounting a component.
- **Remaining-time math is correct.** `Math.max(0, createdAtMs + durationMs - Date.now())` correctly computes wall-clock remaining time. The "preserves remaining time" test directly exercises this.
- **`useEffect` cleanup correctly cancels timers** on unmount and every list-change re-run.
- **Oldest-removed eviction is correct.** `[...state.notifications, nextItem].slice(-MAX_VISIBLE_NOTIFICATIONS)` is idiomatic and correct.
- **All three required `data-testid` values** (`toast-notification-success`, `toast-notification-warning`, `toast-notification-error`) are present and generated dynamically from `notification.kind`.
- **Close button has an accessible name.** `aria-label="Dismiss notification"` is present.
- **`NotificationViewport` is mounted correctly** in `App.tsx` alongside `<Modal />`.

### Spec Compliance

| Requirement | Status |
|---|---|
| Non-modal toast for success / warning / error | ✅ Met |
| Routine status must NOT require acknowledgment | ✅ Met |
| `<output aria-live="polite">` live region | ✅ Met |
| Fixed position, bottom-right | ✅ Met |
| Stack toasts upward | ✅ Met — `flex-col-reverse` |
| Max visible = 3, oldest removed on 4th push | ✅ Met |
| Auto-dismiss 3000ms default per type | ✅ Met |
| Duration stored per type, independently changeable | ✅ Met — `NOTIFICATION_DURATION_BY_KIND` map |
| Manual dismiss via × button | ✅ Met |
| Mounted in App.tsx alongside modal infrastructure | ✅ Met |
| `toast-notification-success` testid | ✅ Met |
| `toast-notification-warning` testid | ✅ Met |
| `toast-notification-error` testid | ✅ Met |

### Issues

#### Important

**P2-I1 — `aria-atomic="false"` override may produce fragmented AT announcements**
File: `apps/desktop/src/ui/components/NotificationViewport.tsx`, line 42

`<output>` has an implicit `aria-atomic="true"`. The implementation overrides this to `false`, meaning AT will attempt to announce only the newly changed child when the list changes. With `flex-col-reverse` and slice-based eviction, a DOM update involves both adding a new node and potentially removing the oldest. With `aria-atomic="false"`, some AT implementations will announce both changes independently, which can produce confusing output (e.g., announcing the evicted toast as disappearing while announcing the new one). Removing `aria-atomic="false"` and using the element's implicit `true` is the safer choice.

**Recommendation:** Remove `aria-atomic="false"` from the `<output>` element.

---

**P2-I2 — No test covering manual dismiss + sibling timer independence**
File: `apps/desktop/src/ui/components/NotificationViewport.test.tsx`

When the user manually dismisses one toast, `useEffect` re-runs and reschedules timers for siblings using remaining-time math. There is no test that explicitly verifies a sibling's timer is not disturbed by another toast's manual dismiss. The existing "does not fire dismiss timer after unmount" test covers unmount-level cleanup but not this case.

**Recommendation:** Add a test: push two notifications, manually dismiss the first, confirm the second still auto-dismisses at its expected time.

---

**P2-I3 — `toast-dismiss-button` testid is undocumented in `tasks.md`**
File: `apps/desktop/src/ui/components/NotificationViewport.tsx`, line 55

The tasks.md testid contract does not include `toast-dismiss-button`, yet two test file assertions depend on it (lines 83, 93 of the test file). This creates an undocumented dependency.

**Recommendation:** Either add `toast-dismiss-button` to the testid contract in `tasks.md`, or replace the test assertions with `getByRole("button", { name: "Dismiss notification" })` to avoid relying on an undocumented testid.

#### Minor

**P2-M1 — `×` is a raw character rather than an explicit Unicode or HTML entity**
File: `apps/desktop/src/ui/components/NotificationViewport.tsx`, line 60

No AT issue since the button has `aria-label`. Cosmetic: using `{"\u00D7"}` would make the intent explicit to future readers.

---

**P2-M2 — `createdAtMs` is not directly asserted in store tests**
File: `apps/desktop/src/store/useNotifications.test.ts`

A regression setting `createdAtMs` to `0` or `undefined` would cause timers to fire immediately (clamped to 0 ms). Adding `expect(notification.createdAtMs).toBeGreaterThan(0)` in the enqueue test would close this gap.

---

**P2-M3 — No App-level mount test for NotificationViewport**
File: `apps/desktop/src/ui/components/NotificationViewport.test.tsx`

No test guards against the viewport being accidentally removed from `App.tsx`. The component is useless if not mounted.

---

## Pass 3 — UI Integration (App, SettingsPage, SpellEditor, E2E)

**Files reviewed:**
- `apps/desktop/src/ui/App.tsx`
- `apps/desktop/src/ui/App.test.tsx`
- `apps/desktop/src/ui/SettingsPage.tsx`
- `apps/desktop/src/ui/SettingsPage.test.tsx`
- `apps/desktop/src/ui/SpellEditor.tsx` (diff only: lines 2025–2049)
- `apps/desktop/tests/theme_and_feedback.spec.ts`

### Strengths

- **Router integration is clean.** `/settings` registered in `main.tsx` under the `App` shell; gear button is a `<Link to="/settings">` — no custom handler, no router bypass.
- **Live region is properly separated from the notification portal.** `<div aria-live="polite" className="sr-only">` in App.tsx:258 is standalone and distinct from `<output aria-live="polite">` in NotificationViewport. No collision.
- **Two-effect announcement coordination correctly handles system-mode edge case.** `skipNextResolvedThemeAnnouncement` ref is a sound solution to the subtle sequencing issue.
- **SettingsPage helper functions are pure and exported** — independently testable without mounting the component.
- **All three required `data-testid` values present and correct:** `settings-gear-button` (App.tsx:300), `settings-theme-select` (SettingsPage.tsx:63), `settings-follow-system-checkbox` (SettingsPage.tsx:81).
- **Label association is correct.** Select uses explicit `htmlFor`/`id` pairing; checkbox uses wrapping `<label>` with `htmlFor`/`id`. `SettingsPage.test.tsx` confirms both are resolvable via `getByLabelText`.
- **Gear button is accessible.** `aria-label="Settings"` on the link; SVG has `aria-hidden="true"`.
- **SpellEditor hash copy migration is minimal and correct.** Two lines replace `modalAlert` calls with `pushNotification` calls without altering surrounding logic.
- **E2E tests use real store and persistence.** All three theme-flow tests clear `localStorage`, reload the page, and interact through actual UI controls — no direct `dark`-class toggling for persistence tests.

### Issues

#### Important

**P3-I1 — No test for initial live region content when store starts in non-system mode**
File: `apps/desktop/src/ui/App.test.tsx`, line 129

The test for the hidden live region asserts `"System mode"` because the fixture resets state to `mode: "system"`. There is no test for the case where the store initialises in `"dark"` mode and the live region should contain `"Dark mode"` on first render. This is a coverage gap, not a code defect.

**Recommendation:** Add one unit test to `App.test.tsx` that sets `mode: "dark"` before rendering and asserts the live region contains `"Dark mode"` in the initial static markup.

---

**P3-I2 — SpellEditor hash copy button retains hardcoded dark-only neutral classes**
File: `apps/desktop/src/ui/SpellEditor.tsx`, lines 2041 and 2049

```tsx
className="px-2 py1 text-xs bg-neutral-800 border border-neutral-700 rounded hover:bg-neutral-700"
```

`bg-neutral-800` and `border-neutral-700` are dark-palette colors. In light mode the button renders as a very dark element in a white container — not unreadable, but clearly unstyled for light mode. These classes pre-exist the Chunk 1 diff, but the Chunk 1 diff touched this element's `onClick`, making it part of this commit's reviewed surface. Chunk 3 `tasks.md` line 141 schedules removal of hardcoded dark-only classes.

**Recommendation:** No Chunk 1 action required. Confirm the Chunk 3 task explicitly covers `SpellEditor.tsx` lines 2041 and 2049. Consider adding an inline `// TODO(chunk-3): remove dark-only classes` comment.

---

**P3-I3 — `App.test.tsx` live region test uses `renderToStaticMarkup` which bypasses effects — dependency is implicit**
File: `apps/desktop/src/ui/App.test.tsx`, lines 117–131

`renderToStaticMarkup` bypasses all React effects. The announcement text `"System mode"` is present because it comes from the `useState` initialiser, not an effect. This is intentional and correct, but the dependency on `resetThemeState()` having run is implicit.

**Recommendation:** Add a comment at line 129 noting that the assertion depends on `resetThemeState()` and that the text comes from the `useState` initialiser, not an effect.

#### Minor

**P3-M1 — `Tab` component is defined inside the render function**
File: `apps/desktop/src/ui/App.tsx`, lines 117–130

`Tab` is declared as a `const` inside the `App` function body. A new function reference is created on every render, preventing React from reusing the previous element. This predates Chunk 1 and is not introduced here.

**Recommendation:** Move `Tab` to module scope or inline the `<Link>` elements directly. Not a Chunk 1 blocker.

---

**P3-M2 — `theme-announcement-live-region` uses `<div>` rather than `<div role="status">`**
File: `apps/desktop/src/ui/App.tsx`, line 258

The spec says "hidden `<div aria-live='polite'>`", so the implementation exactly matches. Using `role="status"` (implicit on `<output>`) would be consistent with the notification portal, but this is an observation only. No change required.

---

**P3-M3 — E2E test does not assert the live region is visually hidden**
File: `apps/desktop/tests/theme_and_feedback.spec.ts`

The unit test checks for `"sr-only"` in the HTML string, but the E2E test only reads the live region's text content. No `toBeHidden()` assertion.

**Recommendation:** Consider adding `await expect(themeLiveRegion).toBeHidden()` alongside the text assertions. Low priority.

---

**P3-M4 — E2E test does not assert toast auto-dismisses**
File: `apps/desktop/tests/theme_and_feedback.spec.ts`, lines 122–148

The test verifies the toast appears but does not wait to confirm it disappears. Auto-dismiss within 3000ms is a Chunk 1 requirement.

**Recommendation:** Add a `waitForHidden` assertion after the toast appears. Acceptable to defer to Chunk 6.

---

## Consolidated Action Items

### Before or during Chunk 2 (recommended)

| # | Priority | Action | File |
|---|---|---|---|
| A1 | Important | Add direct `syncResolvedTheme` unit test to `useTheme.test.ts` | P1-I3 |
| A2 | Important | Remove `aria-atomic="false"` from `<output>` in NotificationViewport | P2-I1 |
| A3 | Important | Add `toast-dismiss-button` to testid contract in `tasks.md` OR switch tests to `getByRole` | P2-I3 |
| A4 | Important | Add App.test.tsx test for live region in non-system initial mode | P3-I1 |
| A5 | Important | Expand `main.test.tsx` cross-reference tests to cover system-mode and invalid-stored-value scenarios | P1-I4 |

### Chunk 3 (already tracked or deferred)

| # | Priority | Action | File |
|---|---|---|---|
| A6 | Important | Confirm Chunk 3 task covers SpellEditor.tsx hardcoded dark classes | P3-I2 |
| A7 | Minor | Remove hardcoded `dark:` body classes from `index.html` | P1-M1 |

### Chunk 6 or later (low priority)

| # | Priority | Action | File |
|---|---|---|---|
| A8 | Minor | Add toast auto-dismiss E2E assertion | P3-M4 |
| A9 | Minor | Add manual-dismiss sibling-timer-independence test | P2-I2 |
| A10 | Minor | Add `createdAtMs > 0` assertion in notification enqueue test | P2-M2 |
| A11 | Minor | Add `toBeHidden()` E2E assertion for live region | P3-M3 |
| A12 | Minor | Remove deprecated `addListener`/`removeListener` fallback from main.tsx | P1-M3 |
| A13 | Minor | Move `Tab` component outside `App` render function | P3-M1 |

---

## Security

No issues found across all three passes.

- The inline `index.html` script reads from `localStorage`, validates against a hard-coded three-value allow-list, and writes only to `document.documentElement.classList` and `dataset.theme`. No `innerHTML`, `eval`, or arbitrary DOM injection from stored values.
- `data-theme` is set to either `"light"` or `"dark"` — never to an arbitrary stored value.
- Toast message rendering does not use `dangerouslySetInnerHTML`.
