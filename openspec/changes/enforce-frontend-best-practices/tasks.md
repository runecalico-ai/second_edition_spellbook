## 1. Preparation
- [/] 1.1 Scaffold OpenSpec proposal (Done)

## 2. Refactor SpellEditor.tsx
- [ ] 2.1 Add `data-testid` to all inputs (name, level, school, sphere, etc.)
- [ ] 2.2 Add `data-testid` to all action buttons (save, cancel, delete, print)
- [ ] 2.3 Refactor Level input to use clamp-on-change pattern (0-12)
- [ ] 2.4 Ensure `<h1>` exists (replace `<h2>` if it acts as page title)
- [ ] 2.5 Verify "Cantrip" and "Quest" toggles interact correctly with clamped level

## 3. Update Library.tsx
- [ ] 3.1 Add `data-testid` to search input and mode select
- [ ] 3.2 Add `aria-label` to search inputs
- [ ] 3.3 Add `data-testid` to spell table rows (dynamic ID)
- [ ] 3.4 Add `data-testid` to filter controls

## 4. Update ImportWizard.tsx
- [ ] 4.1 Add `data-testid` to file selection inputs
- [ ] 4.2 Add `data-testid` to step navigation buttons
- [ ] 4.3 Add `data-testid` to conflict resolution controls

## 5. Update SpellbookBuilder.tsx
- [ ] 5.1 Add `data-testid` to layout controls
- [ ] 5.2 Add `data-testid` to printed spell entries

## 6. Update Chat.tsx
- [ ] 6.1 Add `data-testid` to chat input and send button

## 7. Verification
- [ ] 7.1 Run existing Playwright tests to ensure no regressions
## 8. Test Infrastructure Refactor
- [ ] 8.1 Update `SpellbookApp.ts` SELECTORS to use `data-testid`
- [ ] 8.2 Refactor `createSpell` in POM to use new IDs
- [ ] 8.3 Refactor `e2e.spec.ts` to use POM methods instead of direct locators where possible
- [ ] 8.4 Update custom matchers (if any) to support new validation patterns
- [ ] 8.5 Verify `character_negative_values.spec.ts` behavior remains valid for `SpellEditor` refactor

## 9. Documentation
- [ ] 9.1 Update `AGENTS.md` with "Atomic Update & Strict Clamping" pattern guidance
