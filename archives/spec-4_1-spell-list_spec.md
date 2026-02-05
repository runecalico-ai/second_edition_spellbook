# Capability: Spell List (AD&D 2E)

## Purpose
Provide a canonical, reusable, and versioned definition of spell lists that can be
owned by a class, inherited, or overlaid—supporting arcane schools, divine spheres,
and conditional availability—without encoding spell mechanics.

## Scope
In-scope:
- CRUD for spell lists
- Explicit bindings to spells
- Arcane school and divine sphere metadata
- Conditional inclusion rules (machine-validated)
- Versioning, diffing, and export/import

Out-of-scope:
- Spell mechanics, casting rules, or balance logic
- Character progression math

## Entities

### SpellList
- id
- name
- description
- paradigm: ARCANE | DIVINE | MIXED
- owner_type: CLASS | DEITY | DOMAIN | GENERIC
- owner_ref_id (nullable)
- status: DRAFT | PUBLISHED | DEPRECATED
- version
- entries[]: SpellListEntry
- created_at, updated_at

### SpellListEntry
- spell_id
- availability: INCLUDED | EXCLUDED | CONDITIONAL
- arcane_school (optional)
- divine_sphere (optional)
- min_level (optional; metadata only)
- condition_expr (optional; validated DSL)
- notes

## ADDED Requirements

### Requirement: Deterministic Spell Binding
Each spell list MUST explicitly enumerate spell bindings.

#### Scenario
- WHEN a spell is added
- THEN its availability MUST be one of INCLUDED / EXCLUDED / CONDITIONAL
- AND spell_id MUST resolve to a known spell

---

### Requirement: Paradigm Validation
Spell lists MUST validate against their paradigm.

#### Scenario: Arcane list
- WHEN paradigm = ARCANE
- THEN divine_sphere MUST be null for all entries

#### Scenario: Divine list
- WHEN paradigm = DIVINE
- THEN arcane_school MUST be null for all entries

#### Scenario: Mixed list
- WHEN paradigm = MIXED
- THEN entries MAY use either field but not both

---

### Requirement: Conditional Rules
The system MUST support conditional inclusion with a safe DSL.

#### Scenario
- WHEN availability = CONDITIONAL
- THEN condition_expr MUST parse and type-check
- AND condition_expr MUST be side-effect free
- AND reference only whitelisted attributes (e.g., level, kit_id, deity_id)

---

### Requirement: Versioning & Publishing
Published spell lists MUST be immutable.

#### Scenario
- WHEN publishing
- THEN version MUST increment
- AND future edits require “Create New Version”

---

### Requirement: Diff & Audit
Spell lists MUST provide entry-level diffs.

#### Scenario
- WHEN comparing versions
- THEN the diff MUST show:
  - added/removed spells
  - availability changes
  - condition changes

---

### Requirement: Import / Export
Spell lists MUST be portable.

#### Scenario
- WHEN exporting
- THEN a single file MUST include:
  - metadata
  - all entries
  - version + status
