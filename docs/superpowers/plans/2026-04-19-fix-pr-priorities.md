# PR Review Remediation Implementation Plan (Refined)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve high and medium priority issues from the PR review, focusing on `SpellEditor` decomposition, library search consolidation, page object refactoring, and E2E flakiness.

**Architecture:** 
1. **Decompose `SpellEditor`**: Extract persistence and parsing into custom hooks.
2. **Isolate Testing Hooks**: Move production-embedded E2E logic to `src/ui/utils/testingHooks.ts`.
3. **Refactor Page Objects**: Split `SpellbookApp` into domain-specific objects to reduce coupling.
4. **Deterministic Synchronization**: Use state-based attributes instead of sleeps or monkeypatching.

**Tech Stack:** React, TypeScript, Playwright, Tauri.

---

### Task 1: Decompose `SpellEditor` and Fix Race Condition

**Files:**
- Create: `apps/desktop/src/ui/hooks/useSpellPersistence.ts`
- Create: `apps/desktop/src/ui/hooks/useSpellParser.ts`
- Modify: `apps/desktop/src/ui/SpellEditor.tsx`

- [ ] **Step 1: Create `useSpellPersistence` hook**
Extract `get_spell`, `save_spell`, and `delete_spell` logic. Implement synchronous state resets and robust `finally` block logic to prevent stale-write races.
- [ ] **Step 2: Create `useSpellParser` hook**
Consolidate the divergent parser hydration paths (legacy fallback vs. canonical data) into a single, well-typed transformation layer.
- [ ] **Step 3: Refactor `SpellEditor`**
Replace inline persistence and parsing logic with the new hooks. Ensure the editor UI state is cleared immediately when the `id` changes.
- [ ] **Step 4: Commit**
```bash
git add apps/desktop/src/ui/
git commit -m "refactor(ui): decompose SpellEditor and resolve load/save race conditions"
```

---

### Task 2: Fix Library Search Regression and Consolidate Filters

**Files:**
- Modify: `apps/desktop/src/ui/Library.tsx`

- [ ] **Step 1: Extract `SearchFilters` builder**
Create a helper function to construct the filter payload, shared by `handleSaveSearch` and the main `search` callback.
- [ ] **Step 2: Fix Search Auto-Execution**
Update `loadSearch` to ensure `search()` is triggered after the state updates.
- [ ] **Step 3: Commit**
```bash
git add apps/desktop/src/ui/Library.tsx
git commit -m "fix(ui): ensure library search triggers on saved search load and dedup filter logic"
```

---

### Task 3: Isolate Production E2E Hooks

**Files:**
- Create: `apps/desktop/src/ui/utils/testingHooks.ts`
- Modify: `apps/desktop/src/ui/SpellEditor.tsx`
- Modify: `apps/desktop/src/ui/CharacterEditor.tsx`

- [ ] **Step 1: Create Testing Utility**
Implement a clean wrapper that checks `window.__IS_PLAYWRIGHT__` and provides safe defaults for non-test environments.
```typescript
// apps/desktop/src/ui/utils/testingHooks.ts
export const isE2E = () => typeof window !== "undefined" && (window as any).__IS_PLAYWRIGHT__;
export const applyE2EFault = (fn: () => void) => { if (isE2E()) fn(); };
```
- [ ] **Step 2: Clean Production Components**
Replace all inline test-only branches in `SpellEditor` and `CharacterEditor` with calls to the utility.
- [ ] **Step 3: Commit**
```bash
git add apps/desktop/src/ui/
git commit -m "refactor(ui): isolate E2E fault-injection hooks from production paths"
```

---

### Task 4: Refactor Page Objects and Resolve Test Flakiness

**Files:**
- Create: `apps/desktop/tests/page-objects/LibraryPage.ts`
- Create: `apps/desktop/tests/page-objects/CharacterPage.ts`
- Modify: `apps/desktop/tests/spellbook_app_open_spell.spec.ts`
- Modify: `apps/desktop/tests/accessibility_and_resize.spec.ts`

- [ ] **Step 1: Decompose `SpellbookApp`**
Split the broad page object into per-domain classes to reduce scenario coupling.
- [ ] **Step 2: Replace Monkeypatching and Sleeps**
In `spellbook_app_open_spell.spec.ts`, remove the `invoke` override. Use the `LibraryPage` to wait for the `data-results-settled` attribute.
- [ ] **Step 3: Robust Resize Testing**
Replace `waitForTimeout(500)` in `accessibility_and_resize.spec.ts` with explicit visibility checks and a deterministic resize-settlement wait.
- [ ] **Step 4: Commit**
```bash
git add apps/desktop/tests/
git commit -m "test: refine page objects and resolve flakiness without sleeps or monkeypatching"
```

---

### Task 5: Compliance and Verification

- [ ] **Step 1: Run Full E2E Suite**
Execute all Playwright tests to ensure no regressions.
```bash
pnpm exec playwright test
```
- [ ] **Step 2: Verify Linting**
Ensure the new files meet repo standards.
```bash
pnpm lint
```
- [ ] **Step 3: Commit**
```bash
git commit -m "test: finalize PR priority fixes and verify compliance"
```
