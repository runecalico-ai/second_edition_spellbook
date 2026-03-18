# Chunk 1: Shared Theme and Feedback Foundations Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Chunk 1 of `add-spell-ui-design-and-accessibility`: root theme support, `/settings`, shared transient notifications, and the hidden theme-announcement live region.

**Architecture:** Build two small root-level infrastructures around the existing `App` shell: a persisted Zustand theme store that drives the `dark` class on `<html>`, and a persisted-in-memory notification store that renders a bounded toast viewport from `App.tsx`. Keep modal behavior isolated in the existing `useModal`/`Modal` pair, because modal implementation changes belong to Chunk 5.

**Tech Stack:** React 18, React Router 6, Zustand, Tailwind CSS, Vitest, Playwright, Tauri desktop runtime.

---

## File Map

**Modify**
- `apps/desktop/tailwind.config.js`
- `apps/desktop/index.html`
- `apps/desktop/src/main.tsx`
- `apps/desktop/src/ui/App.tsx`
- `apps/desktop/src/ui/App.test.tsx`

**Create**
- `apps/desktop/src/main.test.tsx`
- `apps/desktop/src/store/useTheme.ts`
- `apps/desktop/src/store/useTheme.test.ts`
- `apps/desktop/src/store/useNotifications.ts`
- `apps/desktop/src/store/useNotifications.test.ts`
- `apps/desktop/src/ui/SettingsPage.tsx`
- `apps/desktop/src/ui/SettingsPage.test.tsx`
- `apps/desktop/src/ui/components/NotificationViewport.tsx`
- `apps/desktop/src/ui/components/NotificationViewport.test.tsx`

**Test**
- `apps/desktop/tests/theme_and_feedback.spec.ts`

**Constraints**
- Reuse existing dependencies only. Do not add packages.
- Preserve existing modal flows in `useModal.ts` and `Modal.tsx`.
- Follow locator rules from `docs/LOCATOR_STRATEGY.md`: prefer `data-testid`, then role/label locators.

## Chunk 1: Theme Foundation

### Task 1: Enable class-based theme support

**Files:**
- Modify: `apps/desktop/tailwind.config.js`
- Modify: `apps/desktop/index.html`

- [ ] **Step 1: Write the failing bootstrap expectation down in the plan branch notes**

Expected behavior:
- Tailwind responds to the `dark` class on `<html>`.
- First paint uses the resolved theme before React hydration.
- `index.html` no longer hardcodes dark-only body styling.

- [ ] **Step 2: Update Tailwind config**

Change `apps/desktop/tailwind.config.js` to include:

```js
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
```

- [ ] **Step 3: Add the pre-hydration theme bootstrap script**

Insert an inline `<script>` in `<head>` of `apps/desktop/index.html` before the module script. The script should:
- read `localStorage.getItem("spellbook-theme")`
- treat missing/invalid values as `"system"`
- resolve `"system"` through `window.matchMedia("(prefers-color-scheme: dark)")`
- toggle `document.documentElement.classList.toggle("dark", resolvedTheme === "dark")`
- set `document.documentElement.dataset.theme = resolvedTheme`

- [ ] **Step 4: Remove hardcoded dark-only body classes**

Replace the current `<body class="bg-neutral-950 text-neutral-100">` with theme-aware classes or move base colors into the root app shell so the first paint and hydrated app agree.

- [ ] **Step 5: Run targeted verification**

Run: `pnpm --dir apps/desktop typecheck`
Expected: PASS

### Task 2: Add the persisted theme store

**Files:**
- Create: `apps/desktop/src/store/useTheme.ts`
- Test: `apps/desktop/src/store/useTheme.test.ts`

- [ ] **Step 1: Write failing unit tests for theme state**

Cover:
- default mode is `"system"` when storage is empty
- persisted `"light"` and `"dark"` are restored
- invalid stored values fall back to `"system"`
- `setTheme(value)` persists using key `"spellbook-theme"`
- helper for resolving active theme returns `"light"` or `"dark"`

- [ ] **Step 2: Run the new test to confirm failure**

Run: `pnpm --dir apps/desktop test:unit -- src/store/useTheme.test.ts`
Expected: FAIL because `useTheme.ts` does not exist yet

- [ ] **Step 3: Implement `useTheme.ts`**

Create a Zustand store with:

```ts
export type ThemeMode = "light" | "dark" | "system";

interface ThemeState {
  mode: ThemeMode;
  resolvedTheme: "light" | "dark";
  setTheme: (value: ThemeMode) => void;
  syncResolvedTheme: (systemPrefersDark: boolean) => void;
}
```

Implementation requirements:
- initialize from `localStorage`
- store under `spellbook-theme`
- compute `resolvedTheme` from `mode` plus system preference
- no direct React dependency inside the store

- [ ] **Step 4: Re-run the store test**

Run: `pnpm --dir apps/desktop test:unit -- src/store/useTheme.test.ts`
Expected: PASS

### Task 3: Wire theme runtime into the root router entry

**Files:**
- Modify: `apps/desktop/src/main.tsx`
- Test: `apps/desktop/src/main.test.tsx`

- [ ] **Step 1: Write failing router/runtime tests**

Cover:
- `/settings` resolves through the existing shell route tree
- when mode is `"system"`, a simulated `matchMedia("(prefers-color-scheme: dark)")` change updates the applied `<html>` class
- explicit `"light"` or `"dark"` mode ignores subsequent system-theme change events

- [ ] **Step 2: Run the router/runtime test to confirm failure**

Run: `pnpm --dir apps/desktop test:unit -- src/main.test.tsx`
Expected: FAIL because `/settings` and the theme runtime are not implemented yet

- [ ] **Step 3: Add a small root runtime component in `main.tsx`**

Create a component local to `main.tsx` that:
- subscribes to `useTheme`
- applies/removes the `dark` class on `document.documentElement`
- listens to `matchMedia("(prefers-color-scheme: dark)")`
- updates the store when OS theme changes and mode is `"system"`

- [ ] **Step 4: Keep routing in the same file and add `/settings`**

Update the router definition to include:

```tsx
{ path: "settings", element: <SettingsPage /> }
```

Do not change the existing parent shell route structure.

- [ ] **Step 5: Render the runtime wrapper around `RouterProvider`**

Mount the theme runtime inside `React.StrictMode` so the route tree and theme effect initialize together.

- [ ] **Step 6: Re-run the router/runtime test**

Run: `pnpm --dir apps/desktop test:unit -- src/main.test.tsx`
Expected: PASS

- [ ] **Step 7: Run targeted verification**

Run: `pnpm --dir apps/desktop typecheck`
Expected: PASS

## Chunk 2: Settings UI

### Task 4: Build the Settings page

**Files:**
- Create: `apps/desktop/src/ui/SettingsPage.tsx`
- Test: `apps/desktop/src/ui/SettingsPage.test.tsx`

- [ ] **Step 1: Write failing component tests**

Cover:
- page renders an Appearance section
- `settings-theme-select` and `settings-follow-system-checkbox` exist
- select is disabled when follow-system is checked
- unchecked follow-system enables the select and preserves the current resolved theme
- labels are discoverable through `getByLabelText`

- [ ] **Step 2: Run the component test to confirm failure**

Run: `pnpm --dir apps/desktop test:unit -- src/ui/SettingsPage.test.tsx`
Expected: FAIL because `SettingsPage.tsx` does not exist yet

- [ ] **Step 3: Implement `SettingsPage.tsx`**

Requirements:
- heading and `Appearance` section
- native `<select>` with `Light` and `Dark`
- checkbox labeled `Follow system preference`
- select `data-testid="settings-theme-select"`
- checkbox `data-testid="settings-follow-system-checkbox"`
- when checkbox is checked, store mode becomes `"system"` and the select displays the resolved theme while disabled
- when unchecked, set mode to the currently resolved theme before enabling the select to avoid visual flash

- [ ] **Step 4: Re-run the component test**

Run: `pnpm --dir apps/desktop test:unit -- src/ui/SettingsPage.test.tsx`
Expected: PASS

### Task 5: Add the settings entry point to the app shell

**Files:**
- Modify: `apps/desktop/src/ui/App.tsx`
- Modify: `apps/desktop/src/ui/App.test.tsx`

- [ ] **Step 1: Add failing shell tests**

Cover:
- header renders `settings-gear-button`
- icon button has an accessible name such as `Settings`
- clicking it navigates to `/settings`

- [ ] **Step 2: Implement the shell changes**

Update `App.tsx` to:
- keep the current title-left / controls-right header layout
- add a far-right settings button using `Link` or `useNavigate`
- apply `data-testid="settings-gear-button"`
- keep backup/vault/restore buttons and nav links intact
- add light-theme class pairs on the touched header shell so the page is legible in both modes

- [ ] **Step 3: Re-run the shell test**

Run: `pnpm --dir apps/desktop test:unit -- src/ui/App.test.tsx`
Expected: PASS

## Chunk 3: Shared Transient Feedback Infrastructure

### Task 6: Add the notification store

**Files:**
- Create: `apps/desktop/src/store/useNotifications.ts`
- Test: `apps/desktop/src/store/useNotifications.test.ts`

- [ ] **Step 1: Write failing store tests**

Cover:
- enqueue success/warning/error notifications
- visible list is capped at 3
- oldest entry is removed when a fourth toast is pushed
- each toast stores a duration by type, defaulting to 3000ms
- manual dismiss removes a toast by id

- [ ] **Step 2: Run the notification store test to confirm failure**

Run: `pnpm --dir apps/desktop test:unit -- src/store/useNotifications.test.ts`
Expected: FAIL because the store does not exist yet

- [ ] **Step 3: Implement `useNotifications.ts`**

Store shape:

```ts
export type NotificationKind = "success" | "warning" | "error";

interface NotificationItem {
  id: string;
  kind: NotificationKind;
  message: string;
  durationMs: number;
}
```

Required actions:
- `pushNotification(kind, message)`
- `dismissNotification(id)`
- internal max-visible enforcement of 3

- [ ] **Step 4: Re-run the store test**

Run: `pnpm --dir apps/desktop test:unit -- src/store/useNotifications.test.ts`
Expected: PASS

### Task 7: Build the notification viewport

**Files:**
- Create: `apps/desktop/src/ui/components/NotificationViewport.tsx`
- Test: `apps/desktop/src/ui/components/NotificationViewport.test.tsx`
- Modify: `apps/desktop/src/ui/App.tsx`

- [ ] **Step 1: Write failing component tests**

Cover:
- viewport container renders with `role="status"` and `aria-live="polite"`
- toasts stack upward from bottom-right
- toast testids match spec:
  - `toast-notification-success`
  - `toast-notification-warning`
  - `toast-notification-error`
- each toast has a close button
- auto-dismiss uses fake timers and the item duration

- [ ] **Step 2: Run the viewport test to confirm failure**

Run: `pnpm --dir apps/desktop test:unit -- src/ui/components/NotificationViewport.test.tsx`
Expected: FAIL because the component does not exist yet

- [ ] **Step 3: Implement `NotificationViewport.tsx`**

Requirements:
- fixed bottom-right container
- root semantics on the viewport, not per-toast
- render current store entries
- schedule dismiss timers with cleanup
- stack upward using flex column-reverse or equivalent
- do not steal focus

- [ ] **Step 4: Mount the viewport in `App.tsx`**

Render it beside the existing `<Modal />`, not inside page-specific screens.

- [ ] **Step 5: Re-run the viewport test**

Run: `pnpm --dir apps/desktop test:unit -- src/ui/components/NotificationViewport.test.tsx`
Expected: PASS

## Chunk 4: Shared Theme Announcement Live Region

### Task 8: Add the hidden root live region for theme changes

**Files:**
- Modify: `apps/desktop/src/ui/App.tsx`
- Modify: `apps/desktop/src/ui/App.test.tsx`

- [ ] **Step 1: Extend shell tests with theme announcement expectations**

Cover:
- `App.tsx` mounts a hidden polite live region at the root
- changing theme updates the live-region text to `Light mode`, `Dark mode`, or `System mode`
- theme changes do not enqueue a visible toast

- [ ] **Step 2: Implement the hidden live region**

In `App.tsx`:
- mount a visually hidden `<div aria-live="polite">`
- subscribe to theme store changes
- write mode announcements into that node
- keep toast usage out of the theme-change path

- [ ] **Step 3: Re-run shell tests**

Run: `pnpm --dir apps/desktop test:unit -- src/ui/App.test.tsx`
Expected: PASS

## Chunk 5: End-to-End Verification

### Task 9: Add Playwright coverage for Chunk 1

**Files:**
- Create: `apps/desktop/tests/theme_and_feedback.spec.ts`
- Modify: `apps/desktop/tests/page-objects/SpellbookApp.ts` only if repeated settings navigation logic becomes duplicated

- [ ] **Step 1: Write the failing E2E spec**

Scenarios:
- user opens `/settings` from the header gear button
- selecting Light or Dark applies immediately
- first load without saved preference follows the current system preference
- `page.reload()` preserves the choice within the same app session
- follow-system disables the select and reflects resolved theme
- in System mode, changing the browser color scheme in-session updates the applied theme
- theme changes update the hidden live region without rendering a visible theme toast
- notification viewport exposes `role="status"` / `aria-live="polite"` when a test notification-producing flow is triggered

- [ ] **Step 2: Run the new E2E spec to confirm failure**

Run: `pnpm --dir apps/desktop build`
Expected: PASS

Run: `pnpm --dir apps/desktop exec playwright test tests/theme_and_feedback.spec.ts`
Expected: FAIL because the route, controls, and shared infrastructure are not complete yet

- [ ] **Step 3: Implement any missing selectors or page-object helpers**

Only add a `SpellbookApp` helper if the settings workflow is reused in more than one test. Otherwise keep the interactions inline.

- [ ] **Step 4: Re-run the targeted E2E spec**

Run: `pnpm --dir apps/desktop build`
Expected: PASS

Run: `pnpm --dir apps/desktop exec playwright test tests/theme_and_feedback.spec.ts`
Expected: PASS

## Chunk 6: Final Verification

### Task 10: Run the full frontend verification set

**Files:**
- No code changes expected

- [ ] **Step 1: Run unit tests for touched files**

Run: `pnpm --dir apps/desktop test:unit -- src/store/useTheme.test.ts src/store/useNotifications.test.ts src/ui/SettingsPage.test.tsx src/ui/components/NotificationViewport.test.tsx src/ui/App.test.tsx`
Expected: PASS

- [ ] **Step 1a: Run router/runtime unit tests**

Run: `pnpm --dir apps/desktop test:unit -- src/main.test.tsx`
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `pnpm --dir apps/desktop typecheck`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `pnpm --dir apps/desktop lint:biome`
Expected: PASS

- [ ] **Step 4: Run targeted Playwright**

Run: `pnpm --dir apps/desktop build`
Expected: PASS

Run: `pnpm --dir apps/desktop exec playwright test tests/theme_and_feedback.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit Chunk 1**

```bash
git add apps/desktop/tailwind.config.js apps/desktop/index.html apps/desktop/src/main.tsx apps/desktop/src/main.test.tsx apps/desktop/src/ui/App.tsx apps/desktop/src/ui/App.test.tsx apps/desktop/src/store/useTheme.ts apps/desktop/src/store/useTheme.test.ts apps/desktop/src/store/useNotifications.ts apps/desktop/src/store/useNotifications.test.ts apps/desktop/src/ui/SettingsPage.tsx apps/desktop/src/ui/SettingsPage.test.tsx apps/desktop/src/ui/components/NotificationViewport.tsx apps/desktop/src/ui/components/NotificationViewport.test.tsx apps/desktop/tests/theme_and_feedback.spec.ts
git commit -m "feat: add shared theme and feedback foundations"
```
