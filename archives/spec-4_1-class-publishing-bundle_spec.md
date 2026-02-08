# Capability: Class Bundle Publishing (Deity & Specialty Priest)

## Purpose
Publish deity-aligned class bundles (e.g., Specialty Priests) that combine a base class,
spell lists, divine spheres, and portfolio constraints into a single consumable artifact.

## Entities

### ClassBundle
- id
- name
- base_class_id
- deity_id
- portfolio_tags[]
- spell_list_bindings[]
- divine_sphere_overrides[]
- granted_powers_refs[]
- restrictions[]
- status: DRAFT | PUBLISHED | DEPRECATED
- version

### PortfolioConstraint
- tag (e.g., death, healing, war)
- rule: REQUIRED | FORBIDDEN | CONDITIONAL
- notes

## ADDED Requirements

### Requirement: Base Class Integrity
Bundles MUST be derived from exactly one published base class.

#### Scenario
- WHEN selecting a base class
- THEN it MUST be PUBLISHED
- AND its spellcasting paradigm MUST be DIVINE or BOTH

---

### Requirement: Deity Alignment
Bundles MUST align to a deity portfolio.

#### Scenario
- WHEN selecting a deity
- THEN at least one portfolio tag MUST be REQUIRED
- AND FORBIDDEN tags MUST NOT appear in granted powers or spell lists

---

### Requirement: Specialty Priest Spell Resolution
Bundles MUST resolve spells deterministically.

Resolution order:
1. Base class spell list
2. Deity spell list
3. Bundle overlays

#### Scenario
- WHEN conflicts occur
- THEN later layers override earlier layers

---

### Requirement: Divine Sphere Overrides
Bundles MAY override sphere access.

#### Scenario
- WHEN overriding a sphere
- THEN the override MUST be stricter or equal to the base
- (MAJOR → MINOR allowed, MINOR → MAJOR forbidden)

---

### Requirement: Publication Safety
Bundles MUST not invalidate characters.

#### Scenario
- WHEN deprecating a bundle
- THEN existing characters MAY continue using it
- BUT new character creation MUST hide it by default
