# theme-and-feedback Specification

## Purpose
This specification defines application-wide theme behavior and transient feedback standards so visual state changes and routine status updates remain consistent, accessible, and non-disruptive.

## Requirements
### Requirement: Application Theme Modes
The application SHALL support explicit Light, Dark, and System theme modes.

#### Scenario: First load without saved preference
- **WHEN** the user has no previously saved theme preference
- **THEN** the application SHALL resolve the initial theme from the operating system preference

#### Scenario: Explicit theme selection
- **WHEN** the user changes the theme mode from the application UI
- **THEN** the application SHALL apply the selected mode immediately
- **AND** the selected preference SHALL persist across reloads

#### Scenario: System mode reacts to OS changes
- **WHEN** the theme mode is System and the operating system preference changes
- **THEN** the application SHALL update the active theme without requiring a reload

### Requirement: Theme Toggle Accessibility
The theme toggle SHALL expose a clear state transition and be operable by keyboard and assistive technology.

#### Scenario: Toggle activation
- **WHEN** the user focuses the theme toggle and activates it with keyboard or pointer input
- **THEN** the control SHALL move to the next supported theme mode
- **AND** the control SHALL expose an accessible name describing the action it will perform

#### Scenario: Theme change announcement
- **WHEN** the user changes the theme mode
- **THEN** assistive technology users SHALL receive a polite announcement confirming the new active mode
- **AND** the announcement SHALL use the hidden live region channel (see Live Region Announcements requirement)
- **AND** no visible toast SHALL be shown; the visual theme change is self-evident

### Requirement: Theme Coverage
Theme support SHALL apply consistently across application surfaces included in this change.

#### Scenario: Light and dark coverage
- **WHEN** the user switches between light and dark modes
- **THEN** edited surfaces included in this change SHALL render with intentional theme-aware colors
- **AND** muted text, borders, controls, and feedback states SHALL remain legible in both modes

### Requirement: Non-Modal Notification Pattern
Short-lived success, warning, and error feedback SHALL use a consistent transient notification pattern where appropriate.

#### Scenario: Routine status stays non-modal
- **WHEN** an operation completes and does not require an immediate user decision
- **THEN** the application SHALL use inline or transient non-modal feedback rather than a modal alert
- **AND** routine confirmations such as save success, clipboard success, and add-to-library or add-to-character success SHALL NOT require acknowledgment before the user can continue

#### Scenario: Modal reserved for decision points
- **WHEN** the user must confirm a destructive action, resolve a blocking choice, or acknowledge a rare high-severity error before continuing
- **THEN** the application SHALL use a modal or dialog pattern
- **AND** the modal SHALL not be used as the default mechanism for ordinary status updates

#### Scenario: Success notification
- **WHEN** an action completes successfully and does not require immediate user choice
- **THEN** the application SHALL use a transient non-modal status notification rather than interrupting the user with a modal

#### Scenario: Warning notification
- **WHEN** an operation completes with degraded or cautionary outcome that does not require immediate confirmation
- **THEN** the application SHALL communicate that outcome through a warning notification pattern

#### Scenario: Notification stacking
- **WHEN** multiple transient notifications are visible
- **THEN** the application SHALL keep them readable, ordered, and bounded rather than allowing unbounded accumulation

### Requirement: Tooltip Pattern
Tooltips SHALL be reserved for brief supplemental hints and SHALL not be the sole source of critical information.

#### Scenario: Supplemental hint
- **WHEN** a control benefits from a short explanatory hint
- **THEN** a tooltip MAY provide that hint
- **AND** the control SHALL remain understandable without hover-only interaction

#### Scenario: Disabled control explanation
- **WHEN** a disabled control needs explanation
- **THEN** the reason MAY be exposed through a tooltip or adjacent text
- **AND** the change SHALL ensure keyboard and assistive technology users can still discover the explanation

### Requirement: Live Region Announcements
Transient feedback that does not move focus SHALL still be perceivable to assistive technology users.

The application SHALL maintain two announcement channels:
- The **transient notification container** (carries `role="status"` and `aria-live="polite"`) serves as the live region for all visual toast events, including save success, clipboard copy, and any other transient notification.
- A **hidden `aria-live="polite"` region** mounted at the application root serves non-visual announcements where no visible toast is shown. Theme change confirmations use this channel.

#### Scenario: Clipboard success announcement
- **WHEN** the user copies a hash or completes another transient action that does not shift focus
- **THEN** the application SHALL announce the success through the toast channel
- **AND** the toast SHALL carry `role="status"` / `aria-live="polite"` so the announcement reaches assistive technology users alongside the visual confirmation

#### Scenario: Theme change announcement
- **WHEN** the user changes the theme mode
- **THEN** the application SHALL confirm the new active mode to assistive technology users through the hidden live region
- **AND** no visible toast notification SHALL be shown for theme changes
- **AND** the announcement SHALL be non-disruptive (polite, not assertive)

### Requirement: Theme and Feedback Verification
Theme and transient feedback behavior SHALL have explicit verification coverage.

#### Scenario: Theme persistence verification
- **WHEN** automated or manual verification runs
- **THEN** it SHALL include persistence across reload, first-load system preference behavior, and in-session theme switching

#### Scenario: Visual regression in themed views
- **WHEN** visual regression baselines are captured for this change
- **THEN** the targeted views SHALL be verified in both light and dark themes where the change affects appearance

> **Verification note**: Directly toggling the `dark` class may be used for screenshot isolation, but end-to-end coverage SHALL also verify the real theme selection and persistence flow.