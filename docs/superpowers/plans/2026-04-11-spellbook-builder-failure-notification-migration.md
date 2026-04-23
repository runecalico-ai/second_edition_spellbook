# Spellbook Builder Failure Notification Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Spellbook Builder's add/remove failure browser alerts with shared `NotificationViewport` error toasts and update the regression tests and docs that still describe the alert-based exception.

**Architecture:** Keep the existing Tauri `update_character_spell` and `remove_character_spell` flows, picker-dialog lifecycle, and focus restoration behavior intact. Only swap the routine failure feedback boundary from `window.alert()` to the existing Zustand-backed notification store, then update the jsdom harness to render the real toast viewport and remove the stale exception from documentation.

**Tech Stack:** React 18, React Router 6, Zustand, Vitest, Playwright, Tauri desktop runtime.

**Implementation status (completed 2026-04-12):** All steps and the final verification checklist below are done. Delivered as a single commit (`feat: toast spellbook builder add/remove IPC failures`) covering add/remove toasts, tests, docs, and verification—rather than three separate commits as originally sketched. Failure tests assert toast text via `expect(toast.textContent).toMatch(...)` because the project does not use `@testing-library/jest-dom` matchers such as `toHaveTextContent`.

---

## Execution Notes

- Execute this plan in a dedicated git worktree.
- Use @subagent-driven-development or @executing-plans for implementation.
- Use @playwright-e2e-spellbook for the existing builder smoke test command patterns.
- Use @verification-before-completion before claiming the migration is done.
- No new packages.
- Do not broaden scope to success toasts, picker-modal rewrites, or new backend/debug hooks.
- Deterministic failure-path coverage belongs in jsdom by mocking `invoke`; keep Playwright to smoke/regression coverage of the existing builder flow.

## File Map

**Modify**
- `apps/desktop/src/ui/SpellbookBuilder.tsx`
  Responsibility: replace the current add/remove `alert(...)` calls near the failure catches with shared `useNotifications` error toasts while leaving focus and dialog state unchanged.
- `apps/desktop/src/ui/SpellbookBuilder.test.tsx`
  Responsibility: render the real `NotificationViewport`, reset `useNotifications` between tests, and add regression coverage for add/remove failures no longer calling `window.alert()`.
- `README.md`
  Responsibility: remove the user-facing note that Spellbook Builder add/remove failures still use blocking alerts.
- `docs/ARCHITECTURE.md`
  Responsibility: update every notification-architecture reference so Spellbook Builder add/remove failures are described as `NotificationViewport` toasts, not an exception.
- `docs/TESTING.md`
  Responsibility: document the new `SpellbookBuilder.test.tsx` toast regressions and the focused verification commands for this migration.
- `docs/dev/spell_editor_components.md`
  Responsibility: remove the stale shared-feedback exception note that still says Spellbook Builder add/remove failures use blocking alerts.

**Reuse Without Modification**
- `apps/desktop/src/store/useNotifications.ts`
  Responsibility: existing shared toast store with `pushNotification(kind, message)` and bounded notification stacking.
- `apps/desktop/src/ui/components/NotificationViewport.tsx`
  Responsibility: existing shared live-region toast viewport that should surface the new builder error toasts without any component-level duplication.

**Verify / Smoke Only**
- `apps/desktop/tests/spell_editor_save_workflow.spec.ts`
  Responsibility: existing empty-character-spellbook builder smoke path; run it after the unit migration to ensure the picker entry flow still works.

## Task 1: Route Add-Spell Failure Through the Shared Toast Viewport

**Files:**
- Modify: `apps/desktop/src/ui/SpellbookBuilder.test.tsx`
- Modify: `apps/desktop/src/ui/SpellbookBuilder.tsx`
- Reuse: `apps/desktop/src/ui/components/NotificationViewport.tsx`

- [x] **Step 1: Write the failing add-failure regression test**

Update the `SpellbookBuilder.test.tsx` harness so it renders the real notification viewport and resets the singleton notification store:

```tsx
import { useNotifications } from "../store/useNotifications";
import { NotificationViewport } from "./components/NotificationViewport";

function renderSpellbookBuilder(characterId: number) {
  const router = createMemoryRouter([{ path: "/spellbook/:id", element: <SpellbookBuilder /> }], {
    initialEntries: [`/spellbook/${characterId}`],
  });

  return render(
    <>
      <RouterProvider router={router} />
      <NotificationViewport />
    </>,
  );
}

beforeEach(() => {
  useNotifications.setState({ notifications: [] });
});

afterEach(() => {
  useNotifications.setState({ notifications: [] });
});
```

Then add a focused failure-path test:

```tsx
it("add failure shows notification-viewport error toast and does not call window.alert", async () => {
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_characters":
        return [{ id: 1, name: "Raistlin", type: "PC" }];
      case "get_character_spellbook":
        return [];
      case "list_facets":
        return { schools: [], levels: [] };
      case "search_keyword":
        return [{ id: 10, name: "Fireball", school: "Evocation", level: 3, isQuestSpell: 0 }];
      case "update_character_spell":
        throw new Error("ipc failed");
      default:
        return undefined;
    }
  });

  renderSpellbookBuilder(1);
  fireEvent.click(await screen.findByRole("button", { name: "Add Spell from Library" }));
  const dialog = await screen.findByRole("dialog", { name: "Add spells" });
  const addButton = await within(dialog).findByTestId("btn-add-picker-fireball");
  addButton.focus();

  fireEvent.click(addButton);

  await waitFor(() => {
    const viewport = screen.getByTestId("notification-viewport");
    expect(within(viewport).getByTestId("toast-notification-error")).toHaveTextContent(
      /Failed to add spell: ipc failed/,
    );
  });

  expect(alertSpy).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(addButton);
});
```

- [x] **Step 2: Run the focused test to confirm it fails**

Run: `pnpm --dir apps/desktop exec vitest run src/ui/SpellbookBuilder.test.tsx -t "add failure shows notification-viewport error toast and does not call window.alert"`

Expected: FAIL because `SpellbookBuilder.tsx` still calls `alert(...)` and no shared error toast is rendered.

- [x] **Step 3: Write the minimal add-failure implementation**

In `apps/desktop/src/ui/SpellbookBuilder.tsx`, import the notification store and add a local formatter so the message stays stable without pulling in unrelated app-shell code:

```tsx
import { useNotifications } from "../store/useNotifications";

function formatBuilderError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
```

Wire the shared store once inside the component:

```tsx
const pushNotification = useNotifications((state) => state.pushNotification);
```

Replace the add-path catch:

```tsx
    } catch (e) {
      pushNotification("error", `Failed to add spell: ${formatBuilderError(e)}`);
    }
```

Do not close the picker, do not move focus manually, and do not change the success path. `NotificationViewport` already preserves focus by design.

- [x] **Step 4: Re-run the focused test to verify it passes**

Run: `pnpm --dir apps/desktop exec vitest run src/ui/SpellbookBuilder.test.tsx -t "add failure shows notification-viewport error toast and does not call window.alert"`

Expected: PASS.

- [x] **Step 5: Commit the add-failure slice**

```bash
git add apps/desktop/src/ui/SpellbookBuilder.tsx apps/desktop/src/ui/SpellbookBuilder.test.tsx
git commit -m "feat: toast spellbook builder add failures"
```

## Task 2: Route Remove-Spell Failure Through the Shared Toast Viewport

**Files:**
- Modify: `apps/desktop/src/ui/SpellbookBuilder.test.tsx`
- Modify: `apps/desktop/src/ui/SpellbookBuilder.tsx`

- [x] **Step 1: Write the failing remove-failure regression test**

Add a second focused jsdom test that starts with an existing spellbook row and asserts the remove action shows an error toast instead of a blocking alert:

```tsx
it("remove failure shows notification-viewport error toast and does not call window.alert", async () => {
  const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

  vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_characters":
        return [{ id: 1, name: "Raistlin", type: "PC" }];
      case "get_character_spellbook":
        return [
          {
            spellId: 10,
            spellName: "Fireball",
            spellLevel: 3,
            spellSchool: "Evocation",
            prepared: 0,
            known: 1,
            notes: "",
          },
        ];
      case "list_facets":
        return { schools: [], levels: [] };
      case "remove_character_spell":
        throw new Error("delete failed");
      default:
        return undefined;
    }
  });

  renderSpellbookBuilder(1);
  const removeButton = await screen.findByTestId("btn-remove-fireball");
  removeButton.focus();

  fireEvent.click(removeButton);

  await waitFor(() => {
    const viewport = screen.getByTestId("notification-viewport");
    expect(within(viewport).getByTestId("toast-notification-error")).toHaveTextContent(
      /Failed to remove spell: delete failed/,
    );
  });

  expect(alertSpy).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(removeButton);
});
```

- [x] **Step 2: Run the focused test to confirm it fails**

Run: `pnpm --dir apps/desktop exec vitest run src/ui/SpellbookBuilder.test.tsx -t "remove failure shows notification-viewport error toast and does not call window.alert"`

Expected: FAIL because `SpellbookBuilder.tsx` still calls `alert(...)` in the remove failure catch.

- [x] **Step 3: Write the minimal remove-failure implementation**

Reuse the Task 1 formatter/store wiring and replace the remove-path catch in `apps/desktop/src/ui/SpellbookBuilder.tsx`:

```tsx
    } catch (e) {
      pushNotification("error", `Failed to remove spell: ${formatBuilderError(e)}`);
    }
```

Leave the row state untouched on failure; the existing behavior already keeps the current spellbook row rendered when the backend delete fails.

- [x] **Step 4: Re-run both focused builder tests**

Run: `pnpm --dir apps/desktop exec vitest run src/ui/SpellbookBuilder.test.tsx -t "failure shows notification-viewport error toast and does not call window.alert"`

Expected: PASS for both add and remove failure tests.

- [x] **Step 5: Commit the remove-failure slice**

```bash
git add apps/desktop/src/ui/SpellbookBuilder.tsx apps/desktop/src/ui/SpellbookBuilder.test.tsx
git commit -m "feat: toast spellbook builder remove failures"
```

## Task 3: Remove the Alert Exception From Docs and Run the Regression Bundle

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/dev/spell_editor_components.md`
- Verify: `apps/desktop/src/ui/SpellbookBuilder.test.tsx`
- Verify: `apps/desktop/tests/spell_editor_save_workflow.spec.ts`

- [x] **Step 1: Update every stale doc reference to remove the alert exception**

In `README.md`, replace the current exception note with copy that matches the migrated behavior:

```md
- **Modal boundaries preserved**: unsaved-changes confirmation and delete confirmation still open blocking dialogs. Real backend save failures surface as a **Save Error** modal. Routine status feedback (save success, add-to-character from the Library, search operations, and Spellbook Builder add/remove failures) is toast-based rather than a dialog.
```

In `docs/ARCHITECTURE.md`, update the notification architecture note so the builder is no longer listed as an exception:

```md
- **Versus notifications:** Theme changes never use the stacked toast viewport; routine toasts (`NotificationViewport`) remain separate for save success, hash copy, Library add-to-character, and Spellbook Builder add/remove failures.
```

Also sweep the remaining stale references before closing the task:

- update the notification summary table in `docs/ARCHITECTURE.md` so the builder row no longer says `window.alert`
- update `docs/TESTING.md` where the current builder note still says add/remove failures are alert-based
- update `docs/dev/spell_editor_components.md` where the shared feedback table still lists builder failures under the alert exception

- [x] **Step 2: Update the testing guide for the new builder regressions**

Add a small `SpellbookBuilder.test.tsx` note to `docs/TESTING.md` alongside the other jsdom frontend suites:

```md
**`src/ui/SpellbookBuilder.test.tsx`** — jsdom coverage for the character spellbook builder. Includes empty-state CTA behavior, picker focus restoration, and add/remove failure regressions that must surface through `NotificationViewport` error toasts instead of `window.alert()`.
```

Also add the focused verification command so future maintainers re-run the right file:

```md
pnpm --dir apps/desktop exec vitest run src/ui/SpellbookBuilder.test.tsx src/ui/components/NotificationViewport.test.tsx
```

- [x] **Step 3: Run formatting/lint checks on the touched UI files**

Run: `pnpm --dir apps/desktop exec biome lint src/ui/SpellbookBuilder.tsx src/ui/SpellbookBuilder.test.tsx`

Expected: PASS with no lint errors.

- [x] **Step 4: Run typecheck for the desktop app**

Run: `pnpm --dir apps/desktop typecheck`

Expected: PASS.

- [x] **Step 5: Run the targeted unit regression bundle**

Run: `pnpm --dir apps/desktop exec vitest run src/ui/SpellbookBuilder.test.tsx src/ui/components/NotificationViewport.test.tsx`

Expected: PASS. `SpellbookBuilder.test.tsx` should prove both failure paths use the real notification viewport and never call `window.alert()`.

- [x] **Step 6: Rebuild the frontend bundle used by the Playwright smoke test**

Run: `pnpm --dir apps/desktop build`

Expected: PASS. This smoke test must run against a fresh frontend bundle, not stale built assets.

- [x] **Step 7: Run the existing builder Playwright smoke test**

Run: `cd apps/desktop && npx playwright test tests/spell_editor_save_workflow.spec.ts --grep "empty character spellbook workflow shows explanatory copy and add-spell CTA"`

Expected: PASS. This is only a smoke check that the empty-state CTA still opens the picker cleanly after the failure-toast migration.

- [x] **Step 8: Commit the docs and verification slice**

```bash
git add README.md docs/ARCHITECTURE.md docs/TESTING.md docs/dev/spell_editor_components.md apps/desktop/src/ui/SpellbookBuilder.tsx apps/desktop/src/ui/SpellbookBuilder.test.tsx
git commit -m "docs: sync spellbook builder notification migration"
```

## Final Verification Checklist

- [x] `pnpm --dir apps/desktop exec vitest run src/ui/SpellbookBuilder.test.tsx src/ui/components/NotificationViewport.test.tsx`
- [x] `pnpm --dir apps/desktop exec biome lint src/ui/SpellbookBuilder.tsx src/ui/SpellbookBuilder.test.tsx`
- [x] `pnpm --dir apps/desktop typecheck`
- [x] `pnpm --dir apps/desktop build`
- [x] `cd apps/desktop && npx playwright test tests/spell_editor_save_workflow.spec.ts --grep "empty character spellbook workflow shows explanatory copy and add-spell CTA"`
- [x] Verify there are no remaining `alert(` calls in `apps/desktop/src/ui/SpellbookBuilder.tsx`
- [x] Verify `README.md`, `docs/ARCHITECTURE.md`, `docs/TESTING.md`, and `docs/dev/spell_editor_components.md` no longer describe the builder alert exception
