# Chunk 4 Code Review: Structured Editor Visual Polish

- Review date: 2026-03-22
- Review target: Chunk 4 implementation from `docs/superpowers/plans/2026-03-21-add-spell-ui-design-and-accessibility-chunk-4.md`
- Method: Three-pass parallel subagent review with iterative remediation
- Pass 1: Correctness, regressions, save-path behavior
- Pass 2: Spec alignment, theme coverage, visual contract
- Pass 3: Accessibility, focus behavior, test robustness

---

## Final Outcome

No remaining Critical, High, or Medium findings were substantiated in the reviewed Chunk 4 scope after remediation and re-review.

The review loop was repeated until all Critical/High/Medium issues raised by the subagent passes were either:

1. fixed in code and tests, or
2. downgraded to non-blocking process notes after direct verification.

---

## Verification Evidence

Fresh verification run after the final fixes:

```powershell
pnpm test:unit --run -- src/ui/components/structured/StructuredFieldInput.test.tsx src/ui/components/structured/ComponentCheckboxes.test.tsx src/ui/SpellEditor.test.tsx
```

Result:

- 3 test files passed
- 87 tests passed
- 0 failures

Additional verification:

- IDE diagnostics on all touched files: clean
- Playwright specs were reviewed statically, but not executed in this review pass

---

## Remediation Summary

The review process identified and closed the following blocking issues during iteration:

### Closed correctness issues

- Structured component save payload now includes `componentsSpec` and `materialComponentsSpec` on both create and update saves.
- Invalid structured fields that are collapsed at submit time now expand and receive focus correctly.
- Structured-detail expand/collapse buttons now expose field-specific accessible names.
- Material row keys no longer churn on every value edit.

### Closed test/coverage issues

- Structured group tests now rely more on stable selectors and smaller targeted class assertions instead of broad token inventories.
- Visual contract tests now include explicit dark-mode screenshot coverage for range, duration, and casting-time panels.
- Chunk 4 material-edit E2E steps replaced several fixed sleeps with state-based waits on the touched flow.
- Misleading screenshot helper/test naming was corrected to match the actual components-expanded state under capture.

---

## Severity Summary

### Critical (75-100)

None.

### High (50-74)

None.

### Medium (25-49)

None.

### Low (1-24)

#### CR-L1 — Screenshot helper mixes setup and assertion

**Score: 20**

**Files:** `apps/desktop/tests/spell_editor_visual.spec.ts`

`prepareComponentsExpandedEditorScreenshot()` still performs a content assertion before taking screenshots. If the assertion fails, the light/dark screenshot tests do not produce image output, which reduces failure diagnosability.

**Suggested follow-up:** Move the preview-text assertion into the individual tests or a named `test.step()` before screenshot capture.

---

#### CR-L2 — One material-row test name over-claims containment

**Score: 14**

**Files:** `apps/desktop/src/ui/components/structured/ComponentCheckboxes.test.tsx`

One test name says the row renders “inside root container,” but the assertion only checks count. This is a naming/expectation mismatch, not a behavioral defect.

**Suggested follow-up:** Rename the test or add the explicit containment assertion.

---

#### CR-L3 — Panel fallback focus path still lacks visible focus styling

**Score: 14**

**Files:** `apps/desktop/src/ui/SpellEditor.tsx`

If an expanded panel has no focusable descendant and focus falls back to the section element itself, there is still no visible focus treatment on that fallback target.

**Suggested follow-up:** Add `focus-visible` outline/ring styling to the section wrapper.

---

#### CR-L4 — Material-row identity is stable across edits, but still index-based across removals

**Score: 12**

**Files:** `apps/desktop/src/ui/components/structured/ComponentCheckboxes.tsx`

The remount-on-edit bug was fixed, but row identity still uses index-based keys. That is acceptable for the current add/remove-only flow, but it remains less robust than a true stable row id if reordering or richer row-level interactions are introduced later.

**Suggested follow-up:** Add an internal stable row id if the material editor grows more complex.

---

## Review Conclusion

Chunk 4 now meets the requested stop condition for this review cycle:

**No Critical, High, or Medium findings remain in the reviewed scope.**