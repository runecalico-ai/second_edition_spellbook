# Capability: Wizard Bundle Publishing (Specialist Wizards)

## ADDED Requirements

### Requirement: Base Class Integrity
Bundles MUST be derived from exactly one published base class.

#### Scenario
- WHEN selecting base_class_id
- THEN it MUST be PUBLISHED
- AND spellcasting MUST be ARCANE or BOTH

---

### Requirement: Specialist School Required
A specialist wizard bundle MUST specify a specialist_school.

#### Scenario
- WHEN bundle type is SPECIALIST_WIZARD
- THEN specialist_school MUST be non-null

---

### Requirement: Spell Layering Determinism
Spell resolution MUST be deterministic with fixed precedence.

Precedence:
1) base class list
2) specialist overlay
3) kit overlay (optional)
4) bundle overlay

#### Scenario
- WHEN the same spell appears in multiple layers
- THEN later layers override earlier layers

---

### Requirement: Barred School Enforcement
Bundles MUST exclude spells from barred schools.

#### Scenario
- WHEN a spell’s school is in barred_schools
- THEN its resolved availability MUST be EXCLUDED
- AND publishing MUST fail if any such spell is INCLUDED after resolution

---

### Requirement: Conditional DSL Conformance
Conditional entries MUST conform to the Condition DSL spec.

#### Scenario
- WHEN a conditional entry is present
- THEN it MUST parse, typecheck, and evaluate within limits
