# Code Review — Chunk 3: Library Presentation, Hash UX, and Empty States

**Date:** 2026-03-24
**Change:** `add-spell-ui-design-and-accessibility`
**Scope:** Chunk 3 only (hash display, spell detail loading boundaries, empty states, theme coverage on touched surfaces)
**Method:** Three independent review passes (Spec Completeness · Spec Accuracy · Edge Cases & Gaps), then triage merge.

---

## Summary

Total: **14 findings** — 0 Critical, 4 High, 6 Medium, 4 Low

The core feature deliverables are well-implemented: exact copy matches spec, all required `data-testid` attributes are present on correct elements, the shared `EmptyState` skeleton is clean, and the modal-to-toast migration is architecturally sound. Failures are concentrated in four areas: (1) a loading-state race on fresh navigation, (2) residual dark-only styling on edited surfaces, (3) a logic bug that can briefly show the wrong empty state after resetting filters, and (4) AT-announcement reliability across all three empty states.

## Resolution Update

**Status after implementation and verification:** All original Critical/High/Medium findings in this review are resolved.

- Resolved original findings: `[H-001]`, `[H-002]`, `[H-003]`, `[H-004]`, `[M-001]`, `[M-002]`, `[M-003]`, `[M-004]`, `[M-005]`, `[M-006]`
- Introduced during verification and resolved in the same fix loop: `[NEW-1]`, `[NEW-2]`
- Remaining low-priority findings not addressed in this chunk: `[L-001]`, `[L-002]`, `[L-003]`, `[L-004]`

Verification snapshot at closure:

- Reviewer gate result: `=== LOOP COMPLETE — All Critical/High/Medium findings resolved ===`
- Targeted unit verification: `107 passed, 0 failed`

This document retains the original review text below for historical traceability; statuses have been annotated inline for the resolved High and Medium findings.

---

## Findings

### High

**[H-001] RESOLVED (72) — Loading indicator flickers on fresh spell-detail navigation**
Plan ref: "A fast spell-detail route transition does not briefly flash a loading-only state before the editor content appears."
Location: `apps/desktop/src/ui/SpellEditor.tsx` (loading guard, ~line 653 and 2102) · `apps/desktop/src/main.tsx` (key={id} reset)
Detail: The guard `if (loading && !form.name)` prevents the loading indicator during same-editor data refreshes (form carries the prior spell's name). However, `SpellEditorWrapper` uses `key={id}`, forcing a full component remount on every navigation. After remount, `loading` initialises to `false` and `form.name` to `""`, so the first painted frame is an empty editor form. The subsequent `useEffect` fires `setLoading(true)`, producing the loading indicator. For sub-perceptible loads this sequence is: empty-editor flash → loading-indicator flash → real content — three transitions instead of zero. No `startTransition`, `Suspense` boundary, or debounce mechanism suppresses the loading indicator for loads that complete within a threshold. The requirement is unmet for the fast-navigation case.

---

**[H-002] RESOLVED (65) — Dark-only classes on SpellEditor print controls and Cancel button in edited surfaces**
Plan ref: "Remove hardcoded dark-only classes from `apps/desktop/index.html` and edited surfaces. Verify muted text, borders, controls, and feedback states stay legible in both light and dark modes for the views changed in this chunk."
Location: `apps/desktop/src/ui/SpellEditor.tsx` (~lines 2148 and 2202), header control area
Detail: SpellEditor.tsx was edited in this chunk to add the hash card. The plan requires removing dark-only classes from edited surfaces. The print page-size `<select>` carries `bg-neutral-800 text-neutral-100 border-neutral-700` with no light-mode counterparts. The "Print Compact" and "Print Stat-block" buttons carry `text-neutral-100 bg-neutral-800 hover:bg-neutral-700`. The Cancel button carries `text-neutral-100 bg-neutral-700 hover:bg-neutral-600`. In light theme all of these render as dark-coloured controls on a light background — the inverse of intended. The `index.html` body was fixed correctly (has proper light/dark pairs); the in-file SpellEditor controls were not.

---

**[H-003] RESOLVED (62) — "Reset Filters" briefly shows a false empty-library state when the library is not empty**
Plan ref: Empty-library state — accurate representation of "your spell library is empty"; empty states must reflect actual library content.
Location: `apps/desktop/src/ui/Library.tsx` — `handleResetFilters` function and `resultsSettledForCurrentSearch` state
Detail: `handleResetFilters` clears all filter state setters but does not re-trigger `search()` and does not reset `resultsSettledForCurrentSearch` to `false`. After the call: `spells` remains `[]` (stale filtered result), `hasActiveFilters` becomes `false`, and `resultsSettledForCurrentSearch` is still `true`. The three conditions `resultsSettledForCurrentSearch && spells.length === 0 && !hasActiveFilters` are simultaneously satisfied, so the empty-library state renders with heading "No Spells Yet" and CTAs "Create Spell" / "Import Spells" — even though the library contains spells. The user must manually re-issue a search to see their data. A user could plausibly believe their library was deleted and follow one of the CTAs.

---

**[H-004] RESOLVED (58) — EmptyState live regions are freshly mounted; AT may not announce them reliably**
Plan ref: Polite live-region announcement for all three empty states (empty-library, empty-search, empty-character-spellbook).
Location: `apps/desktop/src/ui/components/EmptyState.tsx` · `apps/desktop/src/ui/Library.tsx` · `apps/desktop/src/ui/SpellbookBuilder.tsx`
Detail: WCAG and AT vendor implementations (NVDA, JAWS, VoiceOver) require a live region to be present in the DOM *before* content is injected. Inserting a pre-populated live region container does not reliably fire an announcement. `EmptyState` with `announce=true` renders `role="status"` on its own container element. That container is conditionally mounted (it does not exist in the DOM until the empty state is triggered). The same problem exists in SpellbookBuilder's `<output className="sr-only">` at ~line 358 — it is also conditionally rendered. None of the three empty states use a persistent, pre-mounted live region. Automated tests only verify DOM structure; no test exercises an AT runtime announcement. Screen reader users may hear nothing when any empty state first appears.

---

### Medium

**[M-001] RESOLVED (48) — Hash copy button has no accessible description of what it copies**
Plan ref: Hash display — accessibility; "Remove the `title` attribute from the hash `<code>` element" (implies the copy context must still be conveyed).
Location: `apps/desktop/src/ui/SpellEditor.tsx` copy button (~line 2255) · `apps/desktop/src/ui/SpellEditor.test.tsx` (~line 183, asserts `aria-label` is `null`)
Detail: The copy button's accessible name is only "Copy". There is no `aria-label`, `aria-describedby`, or `aria-labelledby` that connects the button to the content hash field. A keyboard or AT user navigating by tab order hears "Copy, button" with no indication this copies the canonical content hash. By contrast the Expand button uses `aria-controls="spell-detail-hash-value"`, providing AT context. The existing test explicitly asserts that `aria-label` is `null`, locking in this accessibility gap. Adding a second copy-like control anywhere in the editor in the future would produce indistinguishable "Copy, button" labels.

---

**[M-002] RESOLVED (42) — Missing test: hash card rendered for a spell loaded without contentHash**
Plan ref: Hash display — "Restyle the existing hash display"; the guard must correctly suppress the card for spells that have no hash.
Location: `apps/desktop/src/ui/SpellEditor.test.tsx` — hash display describe block
Detail: All tests in the hash display describe block call `baseLoadedSpell({ contentHash: HASH_FIXTURE })`. No test calls `renderEditSpell(baseLoadedSpell())` (no contentHash) and asserts that `queryByTestId("spell-detail-hash-card")` returns `null`. The guard `!isNew && form.contentHash` is only exercised on the truthy branch. If the guard were changed (e.g., to `!isNew && form.id` by mistake), the hash card would render with `undefined` as the hash string and `form.contentHash.slice(0, 16)` would throw a TypeError, crashing the editor for any legacy spell.

---

**[M-003] RESOLVED (38) — SpellbookBuilder spell-count label shows 0 during spellbook load**
Plan ref: Spell detail loading boundaries — "Loading state persists until data ready, then resolves directly to final content." (Extended to character spellbook loading state.)
Location: `apps/desktop/src/ui/SpellbookBuilder.tsx` (~line 355)
Detail: `<div className="text-sm text-neutral-500">{spellbook.length} spells in spellbook</div>` renders unconditionally whenever `characterLoaded && character` is truthy. `spellbook` initialises to `[]`, so during the entire window while `get_character_spellbook` is in flight, the page header announces "0 spells in spellbook." For a character with 20 spells, the count is visibly wrong during the loading phase. AT users navigating by header or landmark will hear "0 spells in spellbook" and may form an incorrect model of the character's data before the table settles. No test exercises the `spellbookLoaded === false` phase.

---

**[M-004] RESOLVED (36) — SpellbookBuilder sr-only live region omits the "No Spells Added" heading**
Plan ref: empty-character-spellbook — heading "No Spells Added" is a required first-class affordance.
Location: `apps/desktop/src/ui/SpellbookBuilder.tsx` (~line 358)
Detail: The compensating `<output className="sr-only">` rendered when the spellbook is empty contains only the description text: `"This character's spellbook is empty."` The heading "No Spells Added" is visible in the `EmptyState` component but is not included in the live-region announcement. A screen reader user relying on the polite status announcement hears only the description, never the heading, unless they navigate the DOM. The accessible experience is inconsistent with the visual design which features the heading as primary text.

---

**[M-005] RESOLVED (34) — EmptyState re-mount on rapid filter cycling may cause duplicate AT announcements**
Plan ref: empty-search "polite live-region announcement"; the announcement should be stable, not repeated on every search.
Location: `apps/desktop/src/ui/Library.tsx` — search settle logic · `apps/desktop/src/ui/components/EmptyState.tsx`
Detail: Each search invocation sets `resultsSettledForCurrentSearch=false` (unmounting the EmptyState), then re-sets it to `true` after settling (remounting). Rapid filter changes that each return empty results cause the EmptyState to mount, unmount, and remount N times. AT implementations that announce freshly-inserted `role="status"` elements would announce N times. AT implementations that don't would announce zero times. Neither behaviour matches a single, stable polite announcement. This is a steady-state correctness concern distinct from the initial-mount reliability issue in H-004.

---

**[M-006] RESOLVED (32) — Missing test: Reset Filters regression guard for non-empty library**
Plan ref: Empty states accuracy for the reset-filters-on-non-empty-library scenario.
Location: `apps/desktop/src/ui/Library.test.tsx`
Detail: No test in Library.test.tsx constructs the sequence: (1) search returns spells (non-empty library), (2) apply filter → filtered results are empty → empty-search state appears, (3) click "Reset Filters", (4) assert that the empty-library state does NOT appear and the stale empty result is not treated as the truth. Without this test, any fix for H-003 has no regression guard. Every existing test that exercises the reset action mocks `search_keyword` to always return `[]`, meaning the false-empty condition cannot be observed.

---

### Low

**[L-001] (20) — Hash card is a sibling of the header div, not contained within it**
Plan ref: "Restyle the existing hash display in `apps/desktop/src/ui/SpellEditor.tsx` as a dedicated card in the **spell detail header area**."
Location: `apps/desktop/src/ui/SpellEditor.tsx` (~line 2239)
Detail: The card is rendered after the header `<div className="flex justify-between items-center">` closes — it is a sibling in the vertical stacking order, not contained within the header container. The visual placement is still above the form fieldset, so it reads as "header area" visually. The plan's phrasing "header area" is ambiguous — it may mean the visual zone (satisfied) or the DOM container (not satisfied). No functional defect, but worth documenting in case accessibility tools depend on the DOM containment for header-region semantics.

---

**[L-002] (18) — SpellbookBuilder uses sr-only output + announce=false pattern inconsistently**
Plan ref: "All three empty states share a common skeleton" — same announcement mechanism implied.
Location: `apps/desktop/src/ui/SpellbookBuilder.tsx` (~lines 358, 486) vs. `apps/desktop/src/ui/Library.tsx` empty states
Detail: `Library.tsx` uses `EmptyState` with default `announce` behaviour (uses the component's built-in `role="status"` when the flag is set). `SpellbookBuilder.tsx` passes `announce={false}` to `EmptyState` and instead uses a separately-rendered `<output className="sr-only">` for the announcement. The two patterns are inconsistent: one centralises the announcement in EmptyState, the other externalises it. The external pattern also separates the announcement from the visible component, making it easier for future edits to accidentally leave one in place but remove the other.

---

**[L-003] (15) — Empty-search state fires when the library is empty and filters are active**
Plan ref: Empty-library state — "your spell library is empty"; empty-search state — "no spells match your current search or filters" (implied: spells exist, none match).
Location: `apps/desktop/src/ui/Library.tsx` conditional rendering logic
Detail: When the library contains zero spells and the user has applied a filter (e.g., tradition=Arcane), the code evaluates `spells.length === 0 && hasActiveFilters` as `true` and shows "No Results / Reset Filters" instead of "No Spells Yet / Create Spell." The plan's intent is that empty-search reflects a non-empty library being filtered to nothing; empty-library reflects the library itself being empty. The intersection case (empty library + active filters) shows misleading copy and an unhelpful "Reset Filters" CTA rather than guiding the new user to create or import spells.

---

**[L-004] (12) — Collapsed hash appends "..." to hashes shorter than 16 characters**
Plan ref: "Show 16 characters in the collapsed state."
Location: `apps/desktop/src/ui/SpellEditor.tsx` (~line 2251)
Detail: The collapsed display is: `` `${form.contentHash.slice(0, 16)}...` ``. The ellipsis is appended unconditionally, even when `contentHash.length <= 16`. If a hash is, say, 6 characters, the user sees `"abc123..."` in collapsed state, implying there is more content — but expanding reveals only `"abc123"` (same 6 characters, no ellipsis). This looks like a display glitch. All test fixtures use 64-character hex strings, so no test exercises this path. Fix: only append `...` when `form.contentHash.length > 16`.

---

## Appendix: Plan Items Fully Covered (No Findings)

For completeness, the following requirements were reviewed across all three passes and found to be correctly and completely implemented:

- Hash 16-character slice in collapsed state (`form.contentHash.slice(0, 16)`)
- No `title` attribute on hash `<code>` element
- `spell-detail-hash-display` data-testid on `<code>`, `spell-detail-hash-copy` on copy button, `spell-detail-hash-expand` on expand/collapse button
- Toast + polite `<output>` element satisfying "transient non-modal success + polite live-region" for clipboard copy
- Empty-library heading/description/CTA text (character-for-character correct)
- Empty-search heading/description/CTA text (character-for-character correct)
- Empty-character-spellbook heading/description/CTA text (character-for-character correct)
- `empty-library-create-button`, `empty-library-import-button`, `empty-search-reset-button`, `empty-character-add-spell-button` on correct elements
- `EmptyState` renders no icon; skeleton is heading + description `<p>` + optional children slot only
- `index.html` body has proper light/dark pairs — dark-only classes removed correctly at this layer
- Same-editor data refresh does not show loading indicator (form.name guard works correctly for this case)
- Perceptible load shows a single, stable `Loading...` indicator (no intermediate content flicker)
