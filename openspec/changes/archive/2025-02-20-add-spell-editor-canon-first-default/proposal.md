# Spell Editor: Canon-First Default, Optional Structured Layer

## Why

Canon spells (e.g. from rulebooks) are authored as **text**: short lines like "Range: Touch", "Components: V, S", "Duration: 1 round/level", "Area of Effect: Special", "Saving Throw: None", plus a description paragraph. The **structured schema** (RangeSpec, DurationSpec, AreaSpec, etc.) is **derived** from that text—via parsing—for hashing, search, and mechanics. It is not the primary authoring format.

Today the Spell Editor exposes the full structured schema by default (StructuredFieldInput, AreaForm, DamageForm, SavingThrowInput, etc.). Users editing a canon-style spell are forced into the expanded form or a "special" fallback, which does not match the book-like experience they expect. The default should be **canon text first**, with the complex structured fields as an **optional** layer for power users or tooling.

## What Changes

1. **Default experience**: The Spell Editor’s default view MUST present **canon text fields**—the same lines users see in the book (Range, Components, Duration, Casting Time, Area of Effect, Saving Throw, Damage, Magic Resistance, and description). Damage and Magic Resistance are always shown (empty when no value). No structured controls (kind selectors, scalar inputs, AreaForm, DamageForm, etc.) in the default view.

2. **Optional structured layer**: Users MUST be able to **opt in** to structured editing (per field or globally). When opted in, the existing structured components (RangeSpec, DurationSpec, AreaForm, etc.) are used; when opted out, only the text fields are shown. Sync between text and structured data is defined in design (parse on expand, serialize on collapse, or hybrid).

3. **Persistence unchanged**: Flat text columns and `canonical_data` (derived structured JSON) remain as today. Hashing and search continue to use `canonical_data` when present; backend parsers still derive specs from text when building canonical form. The change is **editor UX only**—what is shown by default and how the optional structured layer is exposed.

4. **Chosen direction**: Option B (hybrid single-line + expand/collapse) is chosen and captured in `design.md`: one single-line text input per canon field with a per-field expand control that reveals the full structured form; sync on expand/collapse as described there.

## Scope

### In Scope

-   Spell Editor default view: canon text fields (Range, Components, Duration, Casting Time, Area, Saving Throw, Damage, Magic Resistance as text or single-line inputs).
-   Optional structured layer: mechanism to reveal and edit full schema (existing StructuredFieldInput, AreaForm, DamageForm, etc.) when the user opts in.
-   Sync and persistence rules: how text and structured state are kept in sync when switching between default and structured view; when to parse, when to serialize.
-   Spec updates: spell-editor spec updated to require canon-first default and to describe the optional structured layer.

### Out of Scope

-   The rest of the editor (name, level, school, sphere, class list, source, edition, author, license, tags, reversible, quest, cantrip) is unchanged and out of scope for canon-first UX—canon-first applies only to the details block (Range, Components, Duration, Casting Time, Area, Saving Throw, Damage, Magic Resistance, Description).
-   Changing the spell schema (RangeSpec, DurationSpec, etc.) or canonical serialization.
-   Changing backend parser behavior or storage shape (flat columns + `canonical_data`).
-   Changing Spell Detail (read-only) view behavior beyond any minor copy/consistency tweaks needed for the editor.

## Dependencies

-   **Existing Spell Editor** (and `openspec/specs/spell-editor/spec.md`): This change redefines the **default** UX and adds an optional structured layer; it builds on the current structured components and parser commands.
-   **Canonical hashing / `canonical_data`**: No change to hashing or storage; editor continues to persist text and, when applicable, structured data for canonicalization.
