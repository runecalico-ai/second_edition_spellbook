# Code Review — Chunk 1: Shared Theme and Feedback Foundations

> **Branch:** `add-spell-ui-design-and-accessibility`
> **Plan document:** `openspec/changes/add-spell-ui-design-and-accessibility/tasks.md` (Chunk 1 section)
> **Spec document:** `openspec/changes/add-spell-ui-design-and-accessibility/specs/theme-and-feedback/spec.md`
> **Review date:** 2026-03-24
> **Three independent review passes conducted:** Pass 1 (Spec Completeness), Pass 2 (Spec Accuracy), Pass 3 (Edge Cases & Gaps)

---

## Summary

Total: **10 findings — 0 Critical, 2 High, 5 Medium, 3 Low**

All 33 enumerated Chunk 1 plan requirements are implemented. No required file is missing. All `data-testid` attributes from the plan table are present. The findings are confined to subtle behavioral edge cases in the theme-change announcement coordination, and missing test coverage for plan-specified failure paths and boundary conditions.

---

## Resolution Update

Update recorded: **2026-03-24**

The following findings were fixed and verified in implementation commit `fcc8c9b` (`Fix chunk 1 theme feedback review findings`):

- **[H-001] RESOLVED** — Added targeted coverage for the explicit light -> system transition after staging a dark OS preference so the hidden live region confirms **"System mode"** rather than being overwritten by the resolved dark theme.
- **[H-002] RESOLVED** — Added cleanup coverage proving `attachThemeRuntime` ignores OS theme change events after `detach()` removes the listener/subscription.
- **[M-001] RESOLVED** — Updated the hidden theme live region to initialize empty and announce only on real theme transitions, with additional StrictMode regression coverage.
- **[M-002] RESOLVED** — Added store coverage for `localStorage.setItem` failure during `setTheme`, verifying in-memory theme state still updates while persisted storage remains unchanged.
- **[M-003] RESOLVED** — Added notification timer coverage for the past-due `Math.max(0, ...)` clamp and verified zero-delay dismissal on the next timer turn.
- **[M-004] RESOLVED** — Added a combined-render App-shell test proving the hidden theme live region and toast live region are separate DOM nodes outside the inert shell.

Additional verification notes:

- The implementation/verification loop also surfaced and resolved a follow-up test-quality gap while tightening **[H-001]** coverage.
- Final targeted verification passed: `pnpm vitest run src/ui/App.test.tsx src/main.test.tsx src/store/useTheme.test.ts src/ui/components/NotificationViewport.test.tsx`.

Remaining out of scope for this pass:

- **[L-001]** Not fixed
- **[L-002]** Not fixed
- **[L-003]** Not fixed

---

## Findings

### High

---

**[H-001] (62) — Skip-guard race: switching to 'system' when `_systemPrefersDark` is `true` has no test — both `mode` and `resolvedTheme` change in the same store update**

Plan ref: tasks.md — "When the user switches from an explicit mode back to system, effect 1 must announce 'System mode' without effect 2 immediately overwriting that with the resolved OS theme on the same transition." (`App.tsx` comment lines 227–232 also documents this contract.)

Location: `apps/desktop/src/ui/App.tsx:233–259`; `apps/desktop/src/ui/App.test.tsx:200–211`

Detail: Effect 1 sets `skipNextResolvedThemeAnnouncement.current = true` when transitioning from a non-system mode to `'system'`. Effect 2 checks and clears that flag. The existing test at `App.test.tsx` line 200–211 verifies this guard by starting from `{ mode: 'light', resolvedTheme: 'light' }` and calling `setTheme('system')` — but in that test the store's `_systemPrefersDark` is `false`, so `resolvedTheme` remains `'light'` after the switch; it does not change in the same update. The critical scenario — user is in explicit `'light'` mode, OS is currently dark, and they check "Follow system preference" — causes both `mode` and `resolvedTheme` to change in the same `setTheme('system')` call (`resolvedTheme` immediately becomes `'dark'`). This fires both effects in the same React commit. No test verifies that the skip guard prevents Effect 2 from overwriting "System mode" with "Dark mode" in this scenario. If the guard were removed or incorrectly ordered, a user switching to system mode while their OS is dark would hear "Dark mode" instead of "System mode".

---

**[H-002] (52) — No test verifying OS change events are ignored after `attachThemeRuntime` cleanup (`detach`) is called**

Plan ref: tasks.md — "Update `apps/desktop/src/main.tsx` to react to OS theme changes when theme is `'system'`." The complementary cleanup requirement is implicit in the `useEffect` return contract.

Location: `apps/desktop/src/main.tsx:53–78`; `apps/desktop/src/main.test.tsx`

Detail: `attachThemeRuntime` registers a `"change"` listener on `window.matchMedia(...)` and returns a `detach` function that calls both `unsubscribe()` and `removeEventListener`. The `ThemeRuntime` component wraps this in a `useEffect` cleanup. The existing test suite (`main.test.tsx`) calls `detach()` and asserts state before any subsequent emit, but never emits a MediaQueryList `change` event *after* calling `detach()` and confirms the store does not update. In the Tauri desktop environment, OS `prefers-color-scheme` change events can queue before the React cleanup fully executes. Without this test, a future refactor that reorders `unsubscribe()` and `removeEventListener` inside `detach()` would pass all current tests while silently leaving a stale listener.

---

### Medium

---

**[M-001] (38) — Live region initialized with non-empty text; may cause a spurious AT announcement on first paint**

Plan ref: tasks.md — "When the theme changes, write the new mode name to the hidden live region... without showing a visible toast."
Spec ref: theme-and-feedback/spec.md — "WHEN the user changes the theme mode, THEN assistive technology users SHALL receive a polite announcement."

Location: `apps/desktop/src/ui/App.tsx:117`

Detail: The live region state is initialized with content immediately:
```typescript
const [themeAnnouncement, setThemeAnnouncement] = useState(() => getThemeAnnouncement(themeMode));
```
On first render `themeAnnouncement` is e.g. `"System mode"` and is present in the DOM at mount. The ARIA specification says content already present when a live region first attaches is typically not announced, but this is not guaranteed — browser/AT combinations vary, and React StrictMode's double-invoke in development can cause a DOM mutation that some AT treat as a new insertion. The plan specifies announcements only on user-triggered mode changes, not on page load. A more spec-compliant implementation initializes the state to `""` and relies solely on the `useEffect` on `themeMode` to write on change.

---

**[M-002] (30) — No test for `localStorage.setItem` throwing during `setTheme` — in-memory state recovery path is undocumented by tests**

Plan ref: tasks.md — "Persist to localStorage with key `'spellbook-theme'`."
Code comment: `useTheme.ts:59` — "Ignore storage write failures and keep the in-memory theme state."

Location: `apps/desktop/src/store/useTheme.ts:55–61`

Detail: `persistThemeMode` wraps `setItem` in a `try/catch` that silently swallows failures. The in-memory `mode` and `resolvedTheme` are set by the subsequent `set(...)` call regardless of whether the persistence succeeded. The `readStoredThemeMode` throw path is tested (`useTheme.test.ts:178–189`), but there is no test that stubs `localStorage.setItem` to throw and then verifies: (a) the store's `mode` and `resolvedTheme` still update correctly, and (b) a subsequent `readStoredThemeMode` call returns the old persisted value (not the new one). The comment documents the intended behavior but no test enforces it.

---

**[M-003] (28) — No test for the `Math.max(0, ...)` clamp in `scheduleNotificationDismissals` when `createdAtMs` is already in the past**

Plan ref: tasks.md — "Auto-dismiss each toast after its type duration (default 3000ms for success, warning, and error)."

Location: `apps/desktop/src/ui/components/NotificationViewport.tsx:23`; `apps/desktop/src/ui/components/NotificationViewport.test.tsx`

Detail: `scheduleNotificationDismissals` computes `Math.max(0, createdAtMs + durationMs - Date.now())`. When `createdAtMs` is sufficiently in the past, this clamps to `0`, meaning the timer fires on the next event-loop turn. The test suite verifies remaining-time precision and list-change reschedule (lines 100–164 of `NotificationViewport.test.tsx`) but never passes a `createdAtMs` value already past deadline and asserts that the dismiss callback fires immediately. Without this test, the `Math.max(0, ...)` guard has no behavioral contract. If it were removed, `setTimeout` with a negative value would also fire immediately — so the tests cannot detect the regression.

---

**[M-004] (27) — No combined-render test verifying the two live-region channels are structurally independent DOM nodes outside the inert shell**

Plan ref: theme-and-feedback/spec.md lines 77–80 — "The application SHALL maintain two announcement channels: the transient notification container (`<output aria-live='polite'>`) ... and a hidden `aria-live='polite'` region mounted at the application root."

Location: `apps/desktop/src/ui/App.tsx:270,345–346`; `apps/desktop/src/ui/App.test.tsx`

Detail: The theme live region (`<div aria-live="polite" class="sr-only">`) is rendered at `App.tsx:270` — before the `modalInertShellRef` div — and `NotificationViewport` is rendered at line 345 — after the inert shell closes. Both channels are therefore correctly excluded from inert scope. The existing tests check each channel in isolation. No test renders both channels together and asserts: (a) they are separate DOM nodes, and (b) `NotificationViewport` is outside the inert shell. If `NotificationViewport` were accidentally moved inside the inert div in a future refactor, modal interactions would silence the toast live region with no test failure.

---

### Low

---

**[L-001] (18) — `preHydrationTheme.ts` duplicates the inline script logic from `index.html` without sharing code — dual-maintenance surface**

Plan ref: Not a direct plan requirement — `preHydrationTheme.ts` is not mentioned in the Chunk 1 task list; the plan specifies only the inline `<head>` script in `index.html`.

Location: `apps/desktop/src/theme/preHydrationTheme.ts:1–23` vs `apps/desktop/index.html:7–27`

Detail: The inline IIFE in `index.html` and `applyPreHydrationTheme` in `preHydrationTheme.ts` implement the same resolution logic independently. The TypeScript module exists to make the logic unit-testable (it cannot be imported by the inline script). However, if the `index.html` logic changes (e.g., the storage key is renamed, or a new theme value is added), `preHydrationTheme.ts` must be updated in parallel or the tests will diverge from the actual runtime behavior. This is unplanned technical debt with no spec violation today.

---

**[L-002] (15) — `getThemeAnnouncement` is typed to accept `ThemeMode` but is called with `ResolvedTheme` at `App.tsx:255` — creates a type-call-site inconsistency**

Plan ref: tasks.md — "write the new mode name to the hidden live region (for example: 'Dark mode', 'Light mode', 'System mode')."

Location: `apps/desktop/src/ui/App.tsx:255`

Detail: The primary call at line 239 passes `themeMode` (a `ThemeMode` = `"light" | "dark" | "system"`). The secondary call at line 255 passes `resolvedTheme` (a `ResolvedTheme` = `"light" | "dark"`). Behavioral output is correct — when the OS flips while in system mode, announcing "Dark mode" or "Light mode" is the right active mode. However, `getThemeAnnouncement` is typed to accept the full `ThemeMode` union, while this call site only supplies the `ResolvedTheme` subset. If `ResolvedTheme` is ever extended with a new value not handled by the function, the call site would silently fall through to the final return value.

---

**[L-003] (10) — `readStoredThemeModeValue` in `preHydrationTheme.ts` has no test for `localStorage` being `undefined` (not just throwing)**

Plan ref: tasks.md — "Initialize from localStorage or fall back to `'system'`."

Location: `apps/desktop/src/theme/preHydrationTheme.ts:4–6`; `apps/desktop/src/theme/preHydrationTheme.test.ts`

Detail: `readStoredThemeModeValue` guards with `typeof localStorage === "undefined"` before calling `getItem`. The test at `preHydrationTheme.test.ts:31–39` stubs `localStorage` with an object whose `getItem` throws, but does not stub it as `undefined` via `vi.stubGlobal('localStorage', undefined)`. The `typeof` branch is therefore untested. Given the Tauri environment always provides `localStorage`, this is very low risk, but the plan-required initialization fallback for missing storage has no test coverage in this module.

---

## Coverage Confirmed Correct

The following plan requirements were verified as correctly implemented across all three passes:

- `darkMode: 'class'` in `tailwind.config.js` ✓
- Zustand theme store: `ThemeMode` type, `setTheme`, localStorage persistence, fallback to `'system'` ✓
- `index.html` inline `<head>` script: resolves `prefers-color-scheme`, applies class before hydration ✓
- `SettingsPage`: "Appearance" section, Light/Dark `<select>`, "Follow system preference" checkbox ✓
- Checkbox checked → select disabled, shows OS-resolved value (`getSelectableThemeValue`) ✓
- Checkbox unchecked → select active, defaults to resolved theme (no flash: same value shown before and after toggle) ✓
- Accessible `<label>` elements for both controls ✓
- `/settings` route registered in `main.tsx` router ✓
- Gear `<Link>` at far right of `App.tsx` header; `data-testid="settings-gear-button"` ✓
- `main.tsx` OS theme change reaction: `matchMedia("change")` listener calls `syncResolvedTheme` ✓
- `NotificationViewport`: `<output aria-live="polite">` portal ✓
- Fixed bottom-right positioning (`fixed inset-x-0 bottom-0 flex justify-end`) ✓
- Toasts stack upward (`flex-col-reverse`) ✓
- Max 3 visible; oldest removed on fourth (`slice(-MAX_VISIBLE_NOTIFICATIONS)`) ✓
- Auto-dismiss per-type duration (`NOTIFICATION_DURATION_BY_KIND` Record, all 3000ms default) ✓
- Manual dismiss × button; `data-testid="toast-dismiss-button"` ✓
- `NotificationViewport` mounted in `App.tsx` outside the inert shell ✓
- Hidden `<div aria-live="polite" class="sr-only">` for AT-only theme announcements ✓
- Theme change writes to live region; announcement text: "Light mode", "Dark mode", "System mode" ✓
- Theme change does NOT push a visible toast ✓
- Two announcement channels are separate DOM elements ✓
- All Chunk 1 `data-testid` values from the plan table present ✓
- `getThemeAnnouncement` announces OS-resolved mode when OS flips in system mode (correct per spec) ✓
