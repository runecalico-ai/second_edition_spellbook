# Spell Editor Guide

## Overview

The Spell Editor lets you create and edit spells with **structured data**: range, duration, casting time, area, damage, saving throw, magic resistance, and components. Values are stored in a consistent format and a **content hash** is computed for each spell.

## Default View (Canon-First)

By default the editor shows **canon text** for the Details block: one single-line text input per field (Range, Components, Duration, Casting Time, Area of Effect, Saving Throw, Damage, Magic Resistance) in that order. The Details block may also include an optional **Material Component** row (single-line input + expand control) after the eight standard fields; when present, it uses the same expand/collapse and dirty serialization behavior as the other fields. **Components** and **Material Component** are shown as **separate canon lines** when both exist: Components displays the spell components (e.g. "V, S, M") and Material Component displays the material description (e.g. "ruby dust 50 gp"). **Damage** and **Magic Resistance** are always shown; when the spell has no value, the input is empty so you can see the field exists and fill it. Below or next to each line there is an **Expand** control. No structured controls (kind selectors, scalar inputs, area/damage forms, etc.) are visible until you expand a field.

- **Expanding** a field reveals the full structured form. The editor fills it from saved structured data if present, otherwise it parses the current canon line. Parsing can take a moment (you may see “Loading…”).
- **Collapsing** updates the canon line **only if you edited** the structured form; if you only expanded to view, the canon line is left unchanged.
- **Saving** is always explicit (click **Save Spell**). If you have unsaved changes (edited canon lines and/or an expanded field you edited) and you navigate away or close the editor, a warning asks you to confirm; there is no auto-save or auto-serialize on leave.

### “Special” Indicator

When a field could not be fully parsed (or was stored as “special”), the structured form shows a “could not be fully parsed; original text preserved” hint when expanded. When the field is **collapsed**, a subtle **(special)** indicator appears next to the expand control so you know the line is stored but not fully structured for hashing.

## Structured Fields (Expanded)

When you **expand** a detail field, the following structured controls appear.

### Range, Duration, and Casting Time

These fields use a shared pattern:

- **Kind** (where applicable): Choose the type (e.g. Distance, Touch, Personal for Range; Instant, Time, Concentration for Duration).
- **Base value / Per level**: For numeric kinds, enter a number. You can switch between a fixed value and a per-level value (e.g. "10 + 5/level").
- **Unit**: Select the unit (e.g. yards, feet, rounds, actions). Stored values use canonical abbreviations (e.g. `yd`, `ft`, `round`); the UI may show full labels (e.g. "Yards").
- **Text preview**: A read-only line below the inputs shows the computed text (e.g. "10 yd", "1 round/level"). This is what will be used for display and export.

**Examples:**

- **Range**: Kind "Distance" → base value `10`, unit "Yards" → preview "10 yd".
- **Duration**: Kind "Time" → value `1`, unit "Round", per-level → preview "1 round/level".
- **Casting time**: Base value `1`, unit "Action" → preview "1 action".

### Area

- Choose an **Area kind** (e.g. Cone, Cube, Radius, Line). The form shows only the inputs relevant to that kind (e.g. radius + shape unit, or length + width + shape unit).
- Dimensions use the same scalar pattern (fixed or per-level) and a **shape unit** (e.g. feet, yards).

### Damage

- **Kind**: None, Modeled, or DM Adjudicated.
- **Modeled**: Add one or more damage parts. Each part has damage type, dice formula, and optional save/application. Use **Combine mode** (sum, max, choose one, sequence) when there are multiple parts.
- **DM Adjudicated**: Enter guidance text for the DM.

### Saving Throw and Magic Resistance

- Select the **kind** (e.g. None, Single, Multiple, DM Adjudicated for Saving Throw; Unknown, Normal, Ignores MR, Partial, Special for Magic Resistance).
- When the kind allows it, fill in the extra fields (e.g. save type, applies to, DM guidance, special rule).

## Components (V, S, M)

- **Verbal**, **Somatic**, **Material**: Check the components the spell requires. A text preview (e.g. "V, S, M") updates as you change the checkboxes.
- When **Material** is checked, a sub-form appears:
  - **Name** (required)
  - **Quantity** (default 1.0; must be ≥ 1)
  - **GP value** (optional)
  - **Consumed** (checkbox)
  - **Description** (optional)
  - **Unit** (optional)
- You can add multiple material components; order is preserved.

If you uncheck Material while material components are present, a confirmation dialog asks whether to clear that data.

## Legacy String vs Structured Data

- **Canon text**: The default view shows one line per detail field. What you type there is stored as flat text. When you **expand** a field, the app uses saved structured data for that field if present, otherwise it **parses** the current line.
- **Structured data**: What you enter in the **expanded** form (kind, value, unit, etc.) is stored in a canonical form. When you collapse (or save), the canon line is updated from the structured value **only if you edited** the structured form.
- **Legacy / unparseable**: If parsing cannot fully interpret a line, the field falls back to **"special"** and keeps the original text. You can still edit in the structured form to fix it; on collapse the canon line is updated with the serialized value. When collapsed, a **(special)** indicator shows that the line is stored but not fully structured for hashing.

## Content Hash

- For saved spells, the editor can show a **content hash**: a short fingerprint of the spell’s canonical data.
- **Display**: By default the first 8 characters and "..." are shown. Use **Expand** to see the full hash; **Copy** to copy it to the clipboard.
- The hash is computed by the backend from the structured spell data and is used for consistency checks and deduplication.

## Validation and Saving

### Inline validation

Validation errors are shown **inline** next to the relevant field rather than in a popup dialog. Behaviour by field type:

- **Text inputs** (e.g. spell name, description): errors appear on blur (when you leave the field).
- **Select controls** (e.g. Tradition, School, Sphere): errors appear immediately on change.
- **Pristine required fields**: stay quiet until you either blur them or attempt to save.

On the **first failed save attempt**, all blocking errors are surfaced at once and focus jumps to the first invalid field. A hint reading **Fix the errors above to save** appears near the Save button. The Save button stays disabled until all blocking errors are resolved.

### Tradition-conditional fields

The **School** and **Sphere** fields are shown conditionally based on the selected **Tradition**:

- **Arcane** tradition: the School field is displayed; the Sphere field is hidden.
- **Divine** tradition: the Sphere field is displayed; the School field is hidden.

Switching tradition immediately revalidates the newly relevant field and clears stale errors for the hidden field. The newly mounted field container appears with a fade-in animation.

### Validation rules

- **Name**: required.
- **Description**: required.
- **Level**: must be within the valid range.
- **Arcane tradition without School**: blocked by `error-school-required-arcane-tradition`.
- **Epic spell (level 10–12) without School**: blocked by `error-school-required-arcane`.
- **Epic spell with non-Wizard classes**: blocked by `error-epic-arcane-class-restriction` — *Epic spells are Arcane only and require Wizard/Mage class access.*
- **Divine tradition without Sphere**: blocked by `error-sphere-required-divine-tradition`.
- **Quest spell (level 8, Quest checked) without Sphere**: blocked by `error-sphere-required-divine`.
- **School + Sphere conflict**: blocked by `error-tradition-conflict`.
- **Numeric fields**: values are clamped (e.g. base value and per-level ≥ 0). Very large values (e.g. > 999999) may show a warning but are allowed.

### Save progress and success feedback

- Clicking **Save Spell** with a valid form initiates the save immediately.
- The save button label stays **Save Spell** for fast saves (< 300 ms).
- If the save takes longer than 300 ms, the label changes to **Saving…** and the button remains disabled until the operation completes.
- A second click while a save is in flight is ignored — double-submit cannot occur.
- Editor inputs are frozen for the duration of the save so the submitted payload cannot change.
- On success, a **Spell saved.** toast notification appears in the global notification bar and the editor navigates back to the Library. The toast does not steal keyboard focus.
- Real persistence failures (e.g. disk errors) still surface as a **Save Error** modal dialog rather than an inline error.
