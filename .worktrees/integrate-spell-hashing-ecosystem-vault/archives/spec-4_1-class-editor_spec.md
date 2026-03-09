# Capability: Class Editor (AD&D 2E)

## Purpose
Provide a Class Editor that lets a DM/designer define, validate, version, and publish AD&D 2E character classes,
including spellcasting paradigms (arcane/divine), spell list sources, barred schools, divine spheres, kits/variants,
and campaign-specific extensions—while remaining deterministic and machine-validated.

## Scope
In-scope:
- CRUD for classes and class “bundles” (class + its spell list rules + restrictions).
- Validation rules strong enough to prevent inconsistent class definitions.
- Versioning, diffing, export/import, and safe migration of characters already using a class.
- Explicit modeling for divine spheres and arcane school restrictions.
- “Uses another class’s spell list” and “own spell list” patterns.
- Barred schools, allowed schools, and per-school learnability controls.
- Publication state (draft → published → deprecated) with backward compatibility semantics.

Out-of-scope (unless another capability spec adds them):
- Full character advancement rules (XP tables, THAC0, saving throws) beyond storing references/metadata.
- Full kit editor (only attach/reference kits here).
- Spell editor itself (this consumes spell IDs/metadata).

## Entities (Conceptual Model)
- Class
  - id (stable, globally unique)
  - name, description, tags
  - category: ARCANE | DIVINE | PSIONIC | MARTIAL | HYBRID
  - spellcasting: NONE | ARCANE | DIVINE | BOTH (rare)
  - spell_list_policy: OWN | INHERIT | MIXED
  - inherit_from_class_id (nullable)
  - barred_arcane_schools[] (for ARCANE/BOTH)
  - allowed_arcane_schools[] (optional allowlist)
  - divine_sphere_policy: NONE | CORE_SPHERES | CUSTOM
  - divine_spheres[] (for DIVINE/BOTH; with access level)
  - progression_refs (optional links to tables; not interpreted here)
  - kits[] (references)
  - status: DRAFT | PUBLISHED | DEPRECATED
  - version: semver-like string (e.g., 1.2.0)
  - created_at, updated_at

- DivineSphereAccess
  - sphere_id (e.g., "Healing")
  - access: MAJOR | MINOR | NONE | SPECIAL
  - notes (optional)

- SpellListBinding
  - spell_list_id
  - rule: INCLUDED | EXCLUDED | CONDITIONAL
  - condition_expr (optional, must be machine-validated if present)

- ClassBundle
  - id
  - class_id
  - bundle_name
  - overrides (partial overlay of Class fields)
  - published_as (optional alias name)

## ADDED Requirements

### Requirement: Class List View
The system MUST provide a searchable, filterable list of all classes.

#### Scenario: Search and filter
- WHEN the user types a search query
- THEN the list filters by name and tags
- WHEN the user filters by category or status
- THEN the list updates without losing the search query

#### Scenario: Safe navigation
- WHEN the user has unsaved edits in an open class
- THEN navigating away MUST prompt to save/discard

---

### Requirement: Create/Edit Class (Core Fields)
The system MUST allow creating and editing a Class with required core fields and deterministic defaults.

#### Scenario: Create new class
- WHEN the user selects “New Class”
- THEN the system creates a DRAFT class with:
  - status = DRAFT
  - version = 0.1.0
  - spellcasting = NONE
  - spell_list_policy = OWN (if spellcasting != NONE), else NONE-equivalent

#### Scenario: Required fields
- WHEN saving a class
- THEN id, name, category, status, and version MUST be present
- AND name MUST be unique among non-deprecated classes (case-insensitive)

---

### Requirement: Spellcasting Paradigm Controls
The system MUST model arcane vs divine spellcasting as explicit, validated state.

#### Scenario: Arcane class
- WHEN category implies ARCANE (or spellcasting=ARCANE)
- THEN arcane school restriction controls MUST be enabled
- AND divine sphere controls MUST be disabled (unless spellcasting=BOTH)

#### Scenario: Divine class
- WHEN category implies DIVINE (or spellcasting=DIVINE)
- THEN divine sphere controls MUST be enabled
- AND arcane school restriction controls MUST be disabled (unless spellcasting=BOTH)

#### Scenario: Hybrid class
- WHEN spellcasting=BOTH
- THEN both arcane school and divine sphere controls MUST be enabled
- AND validation MUST ensure each subsystem is internally consistent

---

### Requirement: Spell List Policy (Own / Inherit / Mixed)
The system MUST support defining how a class obtains its spell list.

#### Scenario: Own spell list
- WHEN spell_list_policy = OWN
- THEN the user MUST be able to bind one or more SpellListBinding rows
- AND validation MUST ensure at least one INCLUDED binding exists

#### Scenario: Inherit spell list
- WHEN spell_list_policy = INHERIT
- THEN inherit_from_class_id MUST be set
- AND SpellListBinding controls MUST be read-only (derived)
- AND validation MUST reject circular inheritance (A→B→A)

#### Scenario: Mixed policy
- WHEN spell_list_policy = MIXED
- THEN inherit_from_class_id MUST be set
- AND the user MUST be able to add additional SpellListBinding overlays
- AND overlays MUST evaluate after inherited bindings

---

### Requirement: Arcane School Restrictions (Barred / Allowed)
The system MUST support barred and/or allowed arcane schools for ARCANE/BOTH classes.

#### Scenario: Barred schools
- WHEN the user adds a barred school
- THEN the same school MUST NOT appear in allowed_arcane_schools
- AND barred schools MUST be stored explicitly on the class version

#### Scenario: Allowed schools allowlist
- WHEN allowed_arcane_schools is non-empty
- THEN any school not in the allowlist MUST be treated as not learnable
- AND validation MUST reject overlap with barred schools

---

### Requirement: Divine Spheres (Explicit Modeling)
The system MUST model divine spheres explicitly with access levels.

#### Scenario: Add a sphere access row
- WHEN the user adds a divine sphere
- THEN the user MUST select sphere_id and access (MAJOR/MINOR/SPECIAL/NONE)
- AND validation MUST reject duplicate sphere_id entries

#### Scenario: Sphere policy enforcement
- WHEN divine_sphere_policy = CORE_SPHERES
- THEN the UI MUST provide a “seed core spheres” action that pre-populates sphere rows
- WHEN divine_sphere_policy = CUSTOM
- THEN the user can add arbitrary sphere rows

---

### Requirement: Kits / Variants Attachment
The system MUST allow associating kits (or class variants) to a Class by reference.

#### Scenario: Attach kit
- WHEN the user attaches a kit reference
- THEN the kit reference MUST resolve to a known kit ID
- AND removing a kit MUST NOT delete the kit entity itself

---

### Requirement: Validation and Linting
The system MUST validate a Class deterministically and provide actionable error messages.

#### Scenario: Prevent invalid save
- WHEN the user attempts to save an invalid class
- THEN the save MUST be blocked
- AND each validation error MUST include:
  - field path (e.g., divine_spheres[2].access)
  - error code
  - human message

#### Scenario: Batch validation
- WHEN the user runs “Validate All”
- THEN the system MUST validate all classes
- AND present a list of failures grouped by class

---

### Requirement: Versioning and Publishing Workflow
The system MUST support draft/publish/deprecate states and version bumps.

#### Scenario: Publish
- WHEN a DRAFT class is published
- THEN status MUST change to PUBLISHED
- AND version MUST be bumped (at least patch)
- AND published classes MUST be immutable except via “Create New Version”

#### Scenario: Create new version
- WHEN the user selects “Create New Version”
- THEN the system clones the class to a new DRAFT version
- AND links it to the prior version as its predecessor

#### Scenario: Deprecate
- WHEN a class is deprecated
- THEN it remains selectable for existing characters
- BUT is hidden by default from “new character” flows

---

### Requirement: Diff and Auditability
The system MUST provide a human-readable diff between two class versions.

#### Scenario: View diff
- WHEN the user selects two versions
- THEN the system shows field-level diffs, including:
  - spell_list_policy changes
  - inheritance target changes
  - sphere access changes
  - barred/allowed school changes

---

### Requirement: Import/Export (Portable Format)
The system MUST support importing and exporting class definitions in a stable, documented format.

#### Scenario: Export class
- WHEN the user exports a class
- THEN the system outputs a single file containing:
  - class core fields
  - spell list bindings
  - arcane restrictions
  - divine spheres
  - kit references
  - version + status metadata

#### Scenario: Import class
- WHEN the user imports a class file
- THEN the system validates it
- AND if id conflicts, the user MUST choose:
  - overwrite (new version)
  - import as new id

---

### Requirement: Character Safety (Reference Integrity)
The system MUST prevent breaking changes to characters using a class.

#### Scenario: Class deletion protections
- WHEN a class is referenced by any character
- THEN the system MUST prevent hard deletion
- AND MUST offer “Deprecate” instead

#### Scenario: Inheritance target safety
- WHEN a class inherits spell lists from another class
- THEN deprecating the parent MUST warn if children exist
- AND MUST NOT break derived spell list resolution for existing characters

---

## MODIFIED Requirements
(None)

## REMOVED Requirements
(None)
