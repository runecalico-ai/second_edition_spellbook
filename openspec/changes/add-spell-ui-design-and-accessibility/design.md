## Context

The application currently uses Tailwind CSS with `darkMode: 'class'` configured, but lacks a theme switching mechanism. The UI is hardcoded to dark mode (e.g., `bg-neutral-950 text-neutral-100` in `index.html`), and Storybook has background addons configured but no theme switcher.

This design adds comprehensive theme support to enable users to switch between light and dark modes, with proper persistence and system preference detection. It also integrates theme switching into Storybook for component development and visual regression testing.

## Goals / Non-Goals

**Goals:**
- Implement a theme system (light/dark) that persists user preference
- Add theme toggle UI component accessible throughout the application
- Respect system preference on first load (prefers-color-scheme)
- Integrate theme switching into Storybook for component development
- Ensure theme changes apply consistently across all components
- Maintain WCAG 2.1 AA color contrast in both themes
- Support theme switching via keyboard navigation

**Non-Goals:**
- Custom theme color customization (beyond light/dark)
- Per-component theme overrides
- Theme transitions/animations (can be added later)
- Theme-aware images or illustrations (out of scope for this change)

## Decisions

### 1. Theme State Management: Zustand Store
**Decision**: Use Zustand store for theme state management.

**Rationale**:
- Application already uses Zustand for state management (`store/useModal`)
- Simple, lightweight solution for global theme state
- Easy to persist to localStorage
- No need for React Context overhead

**Alternatives Considered**:
- React Context: More boilerplate, potential re-render issues
- localStorage only: No reactive updates across components
- CSS custom properties: Less flexible for JavaScript-driven theme switching

### 2. Theme Persistence: localStorage + System Preference
**Decision**: Store theme preference in localStorage, but default to system preference (`prefers-color-scheme`) on first visit.

**Rationale**:
- Respects user's OS-level preference initially
- Persists user's explicit choice after first toggle
- Works offline (no server-side preference needed)
- Standard pattern for theme management

**Implementation**:
- Check `localStorage.getItem('theme')` first
- If not set, use `window.matchMedia('(prefers-color-scheme: dark)')`
- Apply theme class to `<html>` element (not `<body>` for better CSS cascade)

**Alternatives Considered**:
- Always use system preference: Doesn't persist user choice
- Always default to dark: Ignores user's system preference
- Server-side preference: Overkill for desktop app, adds complexity

### 3. Theme Application: HTML Element Class
**Decision**: Apply theme class (`dark`) to the `<html>` element, not `<body>`.

**Rationale**:
- Tailwind's `darkMode: 'class'` expects class on `<html>`
- Better CSS cascade (affects all descendants)
- Consistent with Tailwind best practices
- Works with Storybook's HTML structure

**Alternatives Considered**:
- `<body>` element: Works but less standard for Tailwind
- Data attribute: Requires Tailwind config change
- CSS custom properties: More complex, less Tailwind-native

### 4. Storybook Theme Integration: Decorator + Toolbar Addon
**Decision**: Use Storybook decorator to sync theme with application state, and add toolbar addon for manual theme switching.

**Rationale**:
- Decorator ensures Storybook components render with correct theme
- Toolbar addon provides visual theme switcher in Storybook UI
- Allows testing components in both themes during development
- Supports visual regression testing in both themes

**Implementation**:
- Create decorator that reads theme from Zustand store or localStorage
- Add `@storybook/addon-toolbars` (or use built-in theme addon if available)
- Sync toolbar selection with HTML class application

**Alternatives Considered**:
- Backgrounds addon only: Less intuitive, doesn't match app behavior
- Manual class toggling: No UI, developer-unfriendly
- Separate Storybook theme system: Diverges from app implementation

### 5. Theme Toggle Component: Icon Button with ARIA Label
**Decision**: Create a theme toggle button component with sun/moon icons and proper ARIA labels.

**Rationale**:
- Clear visual indicator of current theme
- Accessible via keyboard and screen readers
- Standard UX pattern (sun = light, moon = dark)
- Can be placed in navigation or settings

**Accessibility**:
- `aria-label` describing action ("Switch to light mode" / "Switch to dark mode")
- `aria-pressed` to indicate current state
- Keyboard accessible (Enter/Space to toggle)
- Visible focus indicator (2px outline per WCAG)

**Alternatives Considered**:
- Dropdown select: More verbose, less common pattern
- Toggle switch: Less intuitive for theme switching
- Text-only button: Less visually clear

### 6. Color Contrast: Verify Both Themes Meet WCAG 2.1 AA
**Decision**: Ensure all text and interactive elements meet WCAG 2.1 AA contrast ratios in both themes.

**Rationale**:
- Required by accessibility spec
- Prevents regressions when switching themes
- Critical for users with visual impairments

**Implementation**:
- Use Tailwind's built-in neutral colors (already high contrast)
- Test with contrast checker tools (e.g., Storybook a11y addon)
- Document contrast ratios in design system if custom colors added

**Alternatives Considered**:
- WCAG AAA: Stricter but may limit design flexibility
- Custom contrast ratios: Non-standard, harder to maintain

## Risks / Trade-offs

### Risk: Flash of Wrong Theme (FOIT)
**Mitigation**: 
- Apply theme class synchronously in `<head>` before React hydration
- Use inline script in `index.html` to set theme immediately
- Minimize delay between page load and theme application

### Risk: Theme State Desync Between App and Storybook
**Mitigation**:
- Use same Zustand store pattern in Storybook decorator
- Share localStorage key between app and Storybook
- Document that Storybook theme should match app theme for accurate previews

### Risk: Performance Impact of Theme Switching
**Mitigation**:
- Theme switching only changes CSS classes (minimal cost)
- No re-renders needed if using CSS variables or Tailwind classes
- Test with large component trees to verify performance

### Risk: Incomplete Theme Coverage
**Mitigation**:
- Audit all components for hardcoded colors
- Use Tailwind's theme-aware utilities (`bg-neutral-950` vs `bg-white`)
- Create theme testing checklist in tasks.md

### Trade-off: System Preference vs User Preference
**Decision**: Default to system preference, but persist user choice.

**Rationale**: Best of both worlds - respects system initially, but remembers explicit user choice.

## Migration Plan

### Phase 1: Theme Infrastructure
1. Create Zustand theme store (`store/useTheme.ts`)
2. Add theme initialization script to `index.html` (inline, before React)
3. Create theme toggle component (`ui/components/ThemeToggle.tsx`)
4. Update `main.tsx` to initialize theme store

### Phase 2: Application Integration
1. Add theme toggle to navigation/header (`ui/App.tsx`)
2. Remove hardcoded dark classes from `index.html`
3. Update all components to use theme-aware Tailwind classes
4. Test theme switching across all pages

### Phase 3: Storybook Integration
1. Install `@storybook/addon-toolbars` (if not using built-in theme addon)
2. Create Storybook decorator for theme application
3. Update `.storybook/preview.ts` with theme toolbar
4. Test components in both themes in Storybook

### Phase 4: Accessibility & Testing
1. Verify keyboard navigation for theme toggle
2. Test screen reader announcements
3. Verify color contrast in both themes (WCAG 2.1 AA)
4. Add E2E test for theme switching workflow

### Rollback Strategy
- If theme system causes issues, can revert to hardcoded dark mode
- Remove theme store, restore `index.html` classes
- Storybook changes are isolated, can be reverted independently

## Open Questions

1. **Theme Transition Animation**: Should theme changes animate (fade/transition)? Currently out of scope, but could be added later.

2. **Theme Persistence Scope**: Should theme preference sync across multiple app instances? Currently localStorage is per-instance (acceptable for desktop app).

3. **Storybook Theme Default**: Should Storybook default to system preference or app's persisted preference? Recommendation: Use app's persisted preference for consistency.

4. **Component Theme Testing**: Should visual regression tests run in both themes? Recommendation: Yes, add to tasks.md as follow-up work.
