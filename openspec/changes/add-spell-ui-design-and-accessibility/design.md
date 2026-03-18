## Context

This change originally centered on theme support, but the finalized spec split is broader and cleaner:
- `library` owns spell-editor and library-facing UX behavior
- `frontend-standards` owns cross-app accessibility and resize behavior
- `theme-and-feedback` owns global theme and transient feedback patterns

The application is currently dark-first, with many hardcoded dark-mode utility classes in edited surfaces and no explicit light/system theme flow. It also mixes modal and inline feedback patterns, and some accessibility expectations are implied in task lists rather than expressed as formal requirements.

This design aligns the implementation plan with the rewritten specs so that proposal, design, tasks, verification, and spec files all describe the same change boundaries.

## Goals / Non-Goals

**Goals:**
- Make spell creation and editing feedback clearer and more consistent
- Distinguish empty-library, empty-search, and empty-character-spellbook states
- Formalize cross-app accessibility behavior for labels, errors, focus, and keyboard navigation
- Add a consistent Light / Dark / System theme model with persistence
- Replace interruptive feedback in targeted flows with a non-modal notification pattern where appropriate
- Keep application documentation aligned with the finalized user-visible behavior and shared UI conventions introduced by this change
- Ensure verification covers both real interaction flows and screenshot isolation flows

**Non-Goals:**
- Redefining backend save or hash contracts
- Reworking structured data semantics from the dependent structured-data change
- Full application-wide redesign beyond touched surfaces
- Adding new external UI dependencies for icons, notifications, or tooltips unless separately justified

## Design Overview

### 1. `library`: Spell Editor and Library UX
This spec area covers what users experience directly while creating, editing, searching, and reviewing spells.

Key decisions:
- Validation becomes **field-level and inline**, not modal-driven.
- Save feedback becomes **in-context**, with transient success messaging after completion.
- Empty states are separated by cause:
  - no spells in the library
  - no search/filter matches
  - no spells in a character spellbook
- The existing hash display is retained but refined into a clearer card-like presentation with non-modal clipboard confirmation.
- Loading guidance is phrased in terms of **user-visible behavior**, not assumptions about synchronous implementation.

Why this split matters:
- It keeps spell-flow UX requirements close to the components they change.
- It avoids leaking backend assumptions into UI requirements.

### 2. `frontend-standards`: Cross-App Accessibility and Resize Rules
This spec area covers rules that should be applied consistently across touched flows, rather than only in the spell editor.

Key decisions:
- Visible labels remain the default accessible naming mechanism.
- `aria-label` is reserved for controls lacking sufficient visible naming.
- Error/help associations must be explicit and programmatic.
- Keyboard behavior, focus trapping, and focus return are treated as platform-level expectations.
- Resize handling is defined around the supported desktop minimum width of 900px, with wrapping or stacking for grouped controls rather than horizontal overflow.

Why this split matters:
- It avoids repeating accessibility rules inside feature-specific specs.
- It gives implementation and review work a stable place to anchor cross-app interaction expectations.

### 3. `theme-and-feedback`: Global Theme and Transient Feedback
This spec area covers theme state, theme controls, and transient feedback mechanisms that are broader than the library itself.

Key decisions:
- Theme state is `light | dark | system`.
- First load resolves from OS preference when no explicit preference exists.
- Explicit theme choice persists locally and updates immediately.
- Theme preference is set through a dedicated Settings page (`/settings`) reached via a gear icon in the app header. The page exposes a native `<select>` for Light / Dark choice and a "Follow system preference" checkbox. When the checkbox is checked the select is disabled and reflects the current OS-resolved theme; when unchecked the select is active and defaults to the currently-resolved theme so no visual flash occurs on transition.
- Short-lived success/warning/error feedback uses a non-modal notification pattern where no immediate decision is required.
- Focus-preserving events such as clipboard copy use live-region announcements.
- Tooltip infrastructure is out of scope for this change (see Decision 10).

Why this split matters:
- Theme, notifications, and live regions are shared UI patterns, not library-only behavior.
- This keeps global behavior out of feature-specific specs.

## Decisions

### 1. Theme State Management: Zustand Store
**Decision**: Use a Zustand store for theme state.

**Rationale**:
- The application already uses Zustand.
- Theme changes need reactive UI state plus local persistence.
- This avoids introducing another state mechanism for a small global concern.

**Alternatives considered**:
- React Context: workable, but more boilerplate for a simple shared state
- localStorage only: persistence without reactive state

### 2. Theme Resolution: Persisted Preference with System Fallback
**Decision**: Persist explicit theme choice, but resolve to OS preference when no choice exists or when mode is `system`.

**Rationale**:
- It respects operating-system preference by default.
- It preserves explicit user intent after selection.
- It keeps first-load behavior and later interaction behavior coherent.

### 3. Theme Application: Class on `<html>`
**Decision**: Apply theme state through the `dark` class on the root HTML element.

**Rationale**:
- Aligns with Tailwind's `darkMode: 'class'`
- Minimizes implementation complexity
- Supports immediate pre-hydration theme application

### 4. Non-Modal Feedback Preferred for Short-Lived Status
**Decision**: For successful save, clipboard copy, and similar non-decision outcomes, prefer transient non-modal feedback over modal interruption.

**Rationale**:
- These events do not require user confirmation
- Modal interruption is unnecessarily disruptive for high-frequency actions
- The feedback can remain accessible through role/status and live-region support

**Boundary**:
- Confirmations and destructive decisions still belong in modal/dialog patterns where appropriate

### 4a. Toast Renders on Destination View After Navigation
**Decision**: When a save (or other navigating action) succeeds, the handler triggers the notification store and then navigates. The notification renders on the destination view (Library), not on the editor.

**Rationale**:
- The Zustand notification store persists across route changes — no special timing or delay logic is needed
- Avoids "navigate on dismiss" or "delay-before-nav" complexity
- Standard SPA flash-message pattern; matches how modals are already queued globally

### 5. Feedback Decision Policy
**Decision**: Standardize on a feedback decision model rather than standardizing on modal alerts.

**Use modals for**:
- destructive or irreversible confirmations
- blocking choices the user must make before work can continue
- rare high-severity errors that require explicit acknowledgment

**Use non-modal feedback for**:
- successful saves
- clipboard copy success
- add-to-library or add-to-character confirmation
- validation guidance that can be resolved in place
- other transient status updates that do not require an immediate decision

**Rationale**:
- Modal alerts are appropriate for decisions, not routine status
- Repeated modal interruption degrades flow in editor-heavy workflows
- Non-modal feedback preserves context while remaining accessible through status and live-region patterns

### 6. Loading and Save Guidance Must Stay User-Facing
**Decision**: The design describes when feedback should appear to users, not backend contracts such as null-hash fallback persistence.

**Rationale**:
- This change is about UX and interaction quality
- Backend timeout behavior belongs in a backend or persistence-oriented change if it needs to exist at all
- A 300ms threshold keeps the "Saving…" state out of the fast path while providing a safety net on slow machines

### 7. Two-Channel Live-Region Model
**Decision**: Maintain two distinct announcement channels rather than a single mechanism.

| Channel | Implementation | Used for |
|---------|---------------|---------|
| Toast container | `role="status"` / `aria-live="polite"` on the notification portal | Save success, clipboard copy, all visual toasts |
| Hidden live region | A single `<div aria-live="polite">` mounted in `App.tsx`, visually hidden | Theme change announcements only |

**Rationale**:
- Theme changes are intentionally silent-visual — the user can see the theme change, so no toast is needed. AT users still require an announcement.
- Adding `aria-live` to the toast container handles all other cases because every toast is a meaningful status event.
- Validation errors on first submit are announced by moving focus to the first invalid field — the AT reads the field label and its associated error text naturally via `aria-invalid` + `aria-describedby`. No third live region is needed.
- Two small, purpose-scoped mechanisms are cleaner than a single mechanism that requires per-event routing logic.

**Alternatives considered**:
- Single hidden live region for everything: loses the visual + AT alignment for toasts
- Toast container only with `aria-live`: works for all cases except the silent-visual theme announcement
- Third live region for validation summary ("N errors found"): replaced by focus-to-first-field, which is more immediately actionable

### 8. Settings Route Replaces Theme Toggle
**Decision**: Theme preference is surfaced through a dedicated `/settings` route rather than a cycling toggle in the app header.

**Rationale**:
- A single-purpose toggle is limited to the current three-state cycle and cannot grow without redesign
- A settings route is the conventional pattern for Tauri/Electron desktop apps (VS Code, Obsidian) and scales naturally when Backup/Vault/Restore move in later
- Backup/Vault/Restore remain in the header for this change and will be consolidated into Settings in a dedicated follow-up

**Entry point**: A gear icon (⚙) button at the far right of the app header navigates directly to `/settings`.

### 9. Settings Page Theme Selection Interaction
**Decision**: The Appearance section uses a native `<select>` for Light / Dark choice paired with a "Follow system preference" checkbox.

**Rationale**:
- The app has no existing custom dropdown/popover component; native `<select>` is accessible out of the box and consistent with the no-new-dependencies policy
- Separating "Follow system" as a checkbox (rather than a third select option) makes the distinction between a *preference* (follow OS) and a *theme* (Light / Dark) semantically clearer
- When the checkbox is checked: select is disabled and reflects the current OS-resolved theme (read-only context)
- When the checkbox is unchecked: select is active and defaults to the currently-resolved theme, ensuring no visual flash on transition

**Store**: `useTheme` Zustand store retains `'light' | 'dark' | 'system'` state. The cycle function is removed; state is set explicitly via `setTheme(value: ThemeMode)`.

### 10. Tooltips Out of Scope
**Decision**: Tooltip infrastructure is not implemented in this change.

**Rationale**:
- Every originally-identified tooltip use case was resolved by another mechanism (toast, inline text, settings page)
- Building tooltip infrastructure for zero concrete uses would be premature

### 11. Validation Submit Behavior: Focus to First Invalid Field
**Decision**: On a failed first submit attempt, focus moves to the first invalid field.

**Rationale**:
- The AT reads the field label and its `aria-describedby` error text naturally — more immediately actionable than an abstract count announcement
- Eliminates the need for a third live region; the two-channel model is preserved
- Standard browser/AT pattern for accessible form validation

**Hybrid model**:
- Every field always carries `aria-invalid` + `aria-describedby` pointing to its error element (field-level)
- On first submit: focus moves to first invalid field (replaces global live region announcement)
- Blur/change: errors appear and clear inline; dependent fields revalidate immediately

### 12. Disabled Save Hint Timing
**Decision**: The save button hint ("Fix the errors above to save") appears only after the first failed submit attempt, not whenever the button is in a disabled state.

**Rationale**:
- The hint is only meaningful in context — when the user has already seen the inline errors
- Showing it unconditionally while the form is pristine would be noisy and premature

### 13. Conditional Field Animation: Enter Only
**Decision**: Conditional fields use `animate-in fade-in` on mount; unmount is instant with no exit animation.

**Rationale**:
- Only `fade-in` and `zoom-in-95` keyframes exist in `index.css`; no exit keyframe is defined and no animation plugin is installed
- Adding exit animation infrastructure for this use case would exceed the scope of a polish change
- Instant unmount is visually acceptable for conditional field hide behavior

### 14. Hash Display: 16-Character Truncation, No Native Tooltip
**Decision**: Collapsed hash state shows 16 characters (up from 8). The `title` attribute is removed from the hash `<code>` element.

**Rationale**:
- 8 characters is barely a fingerprint; 16 provides meaningful visual identity without overwhelming the card
- Tooltip infrastructure is out of scope; the Expand button is the explicit mechanism for viewing the full hash
- Removing `title` is consistent with the decision to avoid hover-only patterns

### 15. Empty State Skeleton: Heading + Description + CTAs
**Decision**: All three empty states (empty library, empty search, empty character spellbook) share a common skeleton: heading, one-line description, and CTA buttons. No icon or illustration.

**Rationale**:
- A shared skeleton is easier to implement and maintain than distinct layouts
- Icons would require inline SVG authoring with no existing icon library; the description line provides sufficient context without them

**Copy**:
| State | Heading | Description | CTAs |
|-------|---------|-------------|------|
| Empty library | "No Spells Yet" | "Your spell library is empty. Create your first spell or import spells from a file." | Create Spell, Import Spells |
| Empty search | "No Results" | "No spells match your current search or filters." | Reset Filters |
| Empty character spellbook | "No Spells Added" | "This character's spellbook is empty." | Add Spell from Library |

## Verification Strategy

### Real Interaction Verification
These behaviors should be tested through actual flows:
- theme preference persistence
- system theme fallback and in-session system-mode updates
- save success feedback
- empty-library, empty-search, and empty-character-spellbook states
- keyboard navigation and focus behavior

### Screenshot Isolation Verification
Direct theme-class toggling is acceptable for visual regression isolation, because it lets tests capture:
- light and dark presentation of the same screen
- hash-display states
- empty-state layouts
- structured-input presentation states

This screenshot strategy supplements, but does not replace, testing the real theme-selection flow.

## Risks / Trade-offs

### Risk: Incomplete Theme Coverage
Hardcoded dark-only classes are already present in edited surfaces.

**Mitigation**:
- Audit touched components for light-mode counterparts
- Treat muted text and border colors as explicit contrast risks
- Verify both themes for the specific surfaces covered by this change

### Risk: Feedback Pattern Fragmentation
The app already mixes alerts, modals, and inline feedback.

**Mitigation**:
- Apply the non-modal notification pattern only where the specs now require it
- Avoid broad unrelated notification refactors outside this change

### Risk: Accessibility Rules Drift Between Features
If accessibility guidance remains embedded in feature-specific docs only, implementations will diverge.

**Mitigation**:
- Centralize shared rules in `frontend-standards`
- Keep feature-specific specs focused on behavior unique to the spell/library flows

## Migration / Implementation Shape

### Phase 1: Spec-Aligned Infrastructure
1. Add root theme support (`darkMode: 'class'`, theme store, theme bootstrap script)
2. Add reusable non-modal notification support
3. Add hidden live-region utility for theme change announcements
4. Create `/settings` route and `SettingsPage` with Appearance section (theme select + follow-system checkbox)
5. Add gear icon entry point to app header

### Phase 2: Spell and Library UX
1. Refine spell-editor validation presentation
2. Refine save feedback and success flow
3. Refine hash display and clipboard feedback
4. Implement distinct empty states

### Phase 3: Cross-App Accessibility and Resize Work
1. Update modal focus trapping and focus return
2. Audit accessible names, field associations, and error wiring
3. Adjust constrained-width layouts for touched structured/grouped controls

### Phase 4: Verification
1. Add E2E coverage for the revised workflows
2. Add theme-flow verification
3. Capture light/dark screenshot baselines for affected views

### Phase 5: Documentation Sync
1. Update affected user documentation, including `docs/user/spell_editor.md` for spell-editor behavior and `README.md` for any user-visible application overview changes introduced by theme, feedback, or library-state UX.
2. Update affected developer and architecture documentation, including `docs/dev/spell_editor_components.md` and `docs/ARCHITECTURE.md`, for theme, notification, live-region, accessibility, and structured-editor conventions introduced by this change.
3. Update testing documentation, including `docs/TESTING.md`, if verification expectations, accessibility guidance, or visual-regression workflow change.

## Open Questions

1. **Theme transition motion**
   Should theme changes remain instant, or should they animate in a future change? Current decision: out of scope.

2. **Feedback scope**
   Should the non-modal notification pattern stay limited to the flows in this change, or become the default application-wide feedback model later? Current decision: limit scope to touched flows.

3. **Theme coverage breadth**
   This change covers edited surfaces and targeted flows, not necessarily every page in the application. If broader theme rollout is needed later, it should be scoped as follow-up work.

---

## Light Theme Palette Guidance

These palette guidelines remain relevant to the `theme-and-feedback` spec area and should be applied to surfaces touched by this change.

| Role | Light class | Dark class | Notes |
|------|-------------|------------|-------|
| bg-base | `bg-neutral-50` | `dark:bg-neutral-900` | Main app background |
| bg-surface | `bg-white` | `dark:bg-neutral-800` | Cards, panels, modals |
| bg-elevated | `bg-neutral-100` | `dark:bg-neutral-700` | Inputs and secondary surfaces |
| bg-hover | `bg-neutral-200` | `dark:bg-neutral-700` | Hover states |
| border | `border-neutral-300` | `dark:border-neutral-700` | Default borders |
| border-strong | `border-neutral-400` | `dark:border-neutral-600` | Input borders |
| border-focus | `border-blue-600` | `dark:border-blue-500` | Focus ring |
| text-primary | `text-neutral-900` | `dark:text-neutral-100` | Primary text |
| text-secondary | `text-neutral-700` | `dark:text-neutral-300` | Secondary text |
| text-muted | `text-neutral-600` | `dark:text-neutral-400` | Minimum muted text target for light mode |
| accent | `bg-blue-600` | `dark:bg-blue-600` | Primary actions |
| accent-text | `text-blue-700` | `dark:text-blue-400` | Links and interactive text |
| success-text | `text-green-700` | `dark:text-green-500` | Success state text |
| warning-text | `text-amber-700` | `dark:text-yellow-500` | Warning state text |
| error-text | `text-red-700` | `dark:text-red-500` | Error state text |
| error-bg | `bg-red-50` | `dark:bg-red-950` | Error backgrounds |

**Implementation note**: Any text currently using `text-neutral-400` or `text-neutral-500` on surfaces that will become light-theme visible should be reviewed carefully for contrast.
