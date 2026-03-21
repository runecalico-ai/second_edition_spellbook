# Chunk 2 Three-Pass Code Review

Branch head (review snapshot): `f947e11`  
Date: `2026-03-20`

Review target: Chunk 2 implementation from `docs/superpowers/plans/2026-03-19-add-spell-ui-design-and-accessibility-chunk-2.md`.

Review process:
- Pass 1 subagents: editor/runtime (`Darwin`), Library/notifications (`Hubble`), Playwright/verification (`Leibniz`)
- Pass 2 subagents: saturation sweep (`Herschel`, `Confucius`)
- Pass 3 subagent: final saturation check (`Sagan`)

Result:
- Pass 1 found 8 omissions
- Pass 2 found 3 additional omissions
- Pass 3 found no new omissions

The finding set appears saturated.

## Findings

1. High: switching tradition leaves the now-hidden school or sphere value in form state, which can trap the user in a conflict they cannot fix from the current UI.  
   Files: `apps/desktop/src/ui/SpellEditor.tsx:2375-2379`, `apps/desktop/src/ui/spellEditorValidation.ts:428-435`

   The tradition change handler only updates `tradition` and reveals validation. It does not clear the mutually exclusive hidden value. A user can start Arcane, fill `school`, switch to Divine, fill `sphere`, and immediately hit `error-tradition-conflict` while the School input is unmounted. That violates the plan requirement to clear stale errors for the hidden field and breaks the intended conditional-field flow.

2. Medium: the Playwright migration now locks in that stale hidden-field behavior as expected behavior, so the suite will resist the correct fix.  
   File: `apps/desktop/tests/spell_editor_structured_data.spec.ts:293-341`

   The migrated test explicitly asserts that switching from Arcane-with-school to Divine-with-sphere should surface `error-tradition-conflict`. That is not just missing the required seeded edit-path coverage; it also codifies the current runtime bug.

3. Medium: validation UI state is not reset when a different spell loads into the same editor component.  
   Files: `apps/desktop/src/ui/SpellEditor.tsx:664-665`, `apps/desktop/src/ui/SpellEditor.tsx:851-867`

   `hasAttemptedSubmit` and `fieldValidationVisible` are initialized once and never reset on `id` change. If React Router reuses the component for `/edit/:id`, a failed submit on one spell can leak inline errors and save-hint state into the next spell, violating the “pristine fields stay quiet until blur or failed submit” rule.

4. Medium: the save button is disabled in four cases, not the three cases the plan allows.  
   File: `apps/desktop/src/ui/SpellEditor.tsx:2146-2150`

   The implementation disables on `loading || parsersPending || savePending || (hasAttemptedSubmit && isInvalid)`. The plan explicitly allows only parser pending, save in flight, or post-submit blocking validation.

5. Medium: the required tradition-conflict migration to a seeded edit path was not completed.  
   Files: `apps/desktop/tests/spell_editor_structured_data.spec.ts:293-341`, `docs/superpowers/plans/2026-03-19-add-spell-ui-design-and-accessibility-chunk-2.md:458`

   The plan required using a concrete seeded record for conflict coverage after conditional School/Sphere rendering. The current tests still create the conflict live in a new-spell flow.

6. Medium: automated theme verification still misses the required save-progress state in both themes.  
   Files: `apps/desktop/tests/spell_editor_save_workflow.spec.ts:440-465`, `docs/superpowers/plans/2026-03-19-add-spell-ui-design-and-accessibility-chunk-2.md:596-603`

   The current light/dark test covers inline validation, disabled save, hint text, and no-modal behavior. It does not cover the delayed `Saving.` state or pending-button styling, which the plan called out explicitly.

7. Medium: the full Chunk 2 Playwright slice and the routine-modal audit remain open in the plan artifact.  
   Files: `docs/superpowers/plans/2026-03-19-add-spell-ui-design-and-accessibility-chunk-2.md:577-595`

   The plan still records only partial verification for `tests/spell_editor_save_workflow.spec.ts`. The broader migrated slice, smoke consumers, and explicit closure search for routine modal boundaries are still unchecked.

8. Medium: the required manual NVDA acceptance evidence block is still missing.  
   File: `docs/superpowers/plans/2026-03-19-add-spell-ui-design-and-accessibility-chunk-2.md:604-616`

   Step 7 requires recorded date, browser, NVDA version if known, exercised paths, and exact announced label and error text. None of that evidence has been appended.

9. Medium: the required `Chunk 6 documentation handoff` section was never appended to the plan file.  
   Files: `docs/superpowers/plans/2026-03-19-add-spell-ui-design-and-accessibility-chunk-2.md:61`, `docs/superpowers/plans/2026-03-19-add-spell-ui-design-and-accessibility-chunk-2.md:620-631`

   This handoff artifact is mandatory even though broader docs are deferred. The file still contains only the requirement text, not the handoff itself.

10. Low: valid controls render `aria-invalid="false"` instead of omitting `aria-invalid` when there is no error.  
    Files: `apps/desktop/src/ui/SpellEditor.tsx:1804-1805`, `apps/desktop/src/ui/components/structured/ScalarInput.tsx:127-128`

    The plan required setting `aria-invalid` only when a field currently has an error. Current tests only assert the invalid path, so this mismatch is unguarded.

11. Low: two Library toast tests do not prove focus stays on the triggering control.  
    File: `apps/desktop/src/ui/Library.test.tsx:176-192`, `apps/desktop/src/ui/Library.test.tsx:223-238`

    The save-search-failure and delete-saved-search-failure tests only assert that focus is not inside the notification viewport. They do not prove focus remained on the initiating control, which is what the plan requires.

## Verification

Observed during review:
- `pnpm --dir apps/desktop test:unit -- src/ui/SpellEditor.test.tsx` passed locally
- `pnpm --dir apps/desktop test:unit -- src/ui/Library.test.tsx` passed in subagent verification

Not observed during review:
- Full Chunk 2 Playwright slice
- Manual NVDA acceptance check
- `Chunk 6 documentation handoff` artifact

## Recommended Fix Order

1. Fix the tradition-switch runtime behavior in `SpellEditor.tsx` so hidden mutually exclusive data is cleared or otherwise made resolvable, then rewrite the conflicting Playwright contract in `spell_editor_structured_data.spec.ts`.
2. Reset submit/touched validation state whenever a different spell is loaded into the editor instance, and add a route-param/session-reset test.
3. Align save-button disable logic with the plan, or update the plan and tests if `loading` is intentionally part of the contract.
4. Close the remaining verification gates: seeded conflict path, light/dark slow-save coverage, full Playwright slice, modal audit, NVDA evidence, and the Chunk 6 handoff section.

## Pass Summary

- Pass 1 surfaced the main runtime bug, the main verification gaps, and the weaker Library focus assertions.
- Pass 2 found three additional omissions: the stale-conflict behavior is codified in Playwright, the NVDA evidence block is missing, and the Chunk 6 handoff section is missing.
- Pass 3 found no new omissions.

---

## Second Review Session — 2026-03-20

Three new parallel subagents (Tasks 1-2, Tasks 3-5, Tasks 6-8) re-reviewed the implementation independently against the plan.

One candidate new finding was evaluated: SpellbookApp.ts helper names differ from the plan's suggested names (`expectSpellSaveValidationHint` vs `expectSaveHint`, `expectToastSuccessInViewport` vs `expectSuccessToast`, `setTradition` integrated into `createSpell()` rather than standalone). The plan phrases these as "Useful helpers for Chunk 2" rather than a binding contract. The implementations are functionally equivalent or strictly enhanced (`expectToastSuccessInViewport` additionally validates the `aria-live="polite"` region, which is itself a plan requirement). **Not a genuine omission.**

**Result: no new omissions found. Finding set remains saturated at 11 items.**
