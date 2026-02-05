# Proposal: Class Editor for AD&D 2E

## Summary
This proposal introduces a **Class Editor capability** that enables deterministic creation, validation, versioning, and publication of AD&D 2E character classes. The editor explicitly models arcane and divine spellcasting paradigms, spell list inheritance, barred schools, divine spheres, and kit attachment, while ensuring backward compatibility for existing characters.

The Class Editor is intended to be **rules-faithful**, **machine-validated**, and **campaign-extensible**, supporting both core AD&D 2E classes and highly customized homebrew or deity-specific variants.

---

## Problem Statement
AD&D 2E class design is structurally complex:

- Spell lists may be owned, inherited, or mixed.
- Arcane spellcasters rely on school restrictions.
- Divine spellcasters rely on sphere access (major/minor/special).
- Hybrid or exceptional classes exist but must be carefully constrained.
- Classes evolve over time, yet existing characters must remain valid.

Most existing tools treat classes as static text or loosely structured data, making:
- Validation inconsistent
- Versioning unsafe
- Spell list inheritance opaque
- Divine sphere modeling implicit or incomplete

This results in errors, regressions, and manual adjudication.

---

## Goals
The Class Editor must:

1. **Model AD&D 2E spellcasting rules explicitly**
   - Arcane schools
   - Divine spheres
   - Hybrid edge cases

2. **Enable deterministic validation**
   - Prevent contradictory or incomplete class definitions
   - Produce machine-readable validation errors

3. **Support safe evolution**
   - Draft → publish → deprecate lifecycle
   - Immutable published versions
   - Non-breaking upgrades for characters

4. **Enable reuse and composition**
   - Spell list inheritance
   - Class bundles and variants
   - Kit attachment without duplication

5. **Remain system-agnostic**
   - Store references to progression tables rather than encoding rules logic
   - Allow other capabilities to consume class definitions

---

## Non-Goals
This proposal does **not** attempt to:

- Implement a spell editor or spell rules engine
- Encode XP tables, THAC0, or saving throw math
- Define kit rules beyond reference linkage
- Enforce deity-specific dogma or RP constraints

Those concerns belong to separate capabilities.

---

## Stakeholders
- **Dungeon Masters** – primary designers and publishers of classes
- **Campaign Designers** – maintain evolving rule sets
- **Tooling / Automation** – validators, character builders, AI agents
- **Players (indirect)** – benefit from consistency and safety

---

## Design Principles
- **Explicit over implicit**: spheres and schools are first-class data
- **Immutability of published rules**
- **Fail-fast validation**
- **Composable inheritance**
- **Auditability and diffability**

---

## Success Criteria
This proposal is successful if:

- A DM can define a full divine or arcane class without ambiguity
- Invalid configurations are rejected deterministically
- Published classes can evolve without breaking characters
- External systems can consume exported class definitions reliably

---

## Dependencies
- Spell identifiers and spell list definitions (external capability)
- Divine sphere registry (static or external)
- Kit definitions (external capability)
- Character system (consumer of this data)

---

## Risks and Mitigations
| Risk | Mitigation |
|----|----|
| Overly rigid modeling | Allow CUSTOM sphere policies and MIXED spell list policies |
| Breaking existing characters | Enforce immutability and deprecation instead of deletion |
| Hybrid class complexity | Explicit BOTH spellcasting mode with independent validation |

---

## Rollout Strategy
1. Implement editor and validation in parallel
2. Enable draft-only usage initially
3. Gate publishing behind full validation
4. Migrate existing classes as imported PUBLISHED versions
