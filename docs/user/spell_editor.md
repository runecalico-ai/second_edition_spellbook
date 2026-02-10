# Spell Editor Guide

## Overview

The Spell Editor lets you create and edit spells with **structured data**: range, duration, casting time, area, damage, saving throw, magic resistance, and components. Values are stored in a consistent format and a **content hash** is computed for each spell.

## Structured Fields

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

- **Structured data**: What you enter in the editor (kind, value, unit, etc.) is stored in a canonical form. The **text preview** is computed from that.
- **Legacy strings**: Spells imported or created before structured data may have plain text in range, duration, etc. When you open such a spell, the app tries to **parse** that text into structured fields. If parsing cannot fully interpret a field, it falls back to **"special"** and keeps the original text in **Original text** / `raw_legacy_value`.
- A **warning banner** at the top of the form lists any fields that fell back to special (e.g. "Range and Duration could not be fully parsed; original text preserved"). You can still edit and save; the original text is preserved where applicable.

## Content Hash

- For saved spells, the editor can show a **content hash**: a short fingerprint of the spell’s canonical data.
- **Display**: By default the first 8 characters and "..." are shown. Use **Expand** to see the full hash; **Copy** to copy it to the clipboard.
- The hash is computed by the backend from the structured spell data and is used for consistency checks and deduplication.

## Validation

- **Numeric fields**: Values are clamped (e.g. base value and per-level ≥ 0). Very large values (e.g. &gt; 999999) may show a warning but are allowed.
- **Epic spells (level 10–12)**: Must have **School** set (Arcane).
- **Quest spells (level 8, Quest checked)**: Must have **Sphere** set (Divine).
- Validation errors are shown inline and block saving until fixed.
