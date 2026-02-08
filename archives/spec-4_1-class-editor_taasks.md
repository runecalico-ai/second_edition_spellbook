# Tasks: Class Editor (AD&D 2E)

## Phase 1: Data Model & Storage
- [ ] Define Class entity schema
- [ ] Define DivineSphereAccess schema
- [ ] Define SpellListBinding schema
- [ ] Define ClassBundle schema
- [ ] Implement stable ID generation
- [ ] Add status + version fields
- [ ] Implement reference integrity constraints

---

## Phase 2: Validation Engine
- [ ] Core required-field validation
- [ ] Spellcasting paradigm validation
  - [ ] ARCANE enables schools only
  - [ ] DIVINE enables spheres only
  - [ ] BOTH enables both
- [ ] Spell list policy validation
  - [ ] OWN requires ≥1 INCLUDED binding
  - [ ] INHERIT requires parent class
  - [ ] Detect circular inheritance
- [ ] Arcane school validation
  - [ ] No overlap between barred and allowed
- [ ] Divine sphere validation
  - [ ] No duplicate sphere entries
  - [ ] Valid access level required
- [ ] Deterministic error format
  - [ ] Field path
  - [ ] Error code
  - [ ] Message

---

## Phase 3: Editor UI / API
- [ ] Class list view (search/filter/status)
- [ ] Create/edit class form
- [ ] Spellcasting paradigm selector
- [ ] Spell list policy selector
- [ ] Arcane school editor
- [ ] Divine sphere table editor
- [ ] Kit reference selector
- [ ] Unsaved-changes protection

---

## Phase 4: Versioning & Lifecycle
- [ ] Draft → Publish workflow
- [ ] Immutable published versions
- [ ] “Create New Version” cloning
- [ ] Deprecation support
- [ ] Visibility rules for deprecated classes

---

## Phase 5: Diff & Audit
- [ ] Version comparison engine
- [ ] Field-level diff rendering
- [ ] Highlight spell list changes
- [ ] Highlight sphere/school changes
- [ ] Store predecessor relationships

---

## Phase 6: Import / Export
- [ ] Define portable class file format
- [ ] Export class (single-file)
- [ ] Import with validation
- [ ] ID conflict resolution flow
- [ ] Version preservation on import

---

## Phase 7: Character Safety
- [ ] Prevent deletion of referenced classes
- [ ] Enforce deprecation instead
- [ ] Validate inheritance safety on deprecation
- [ ] Ensure existing characters resolve spell lists correctly

---

## Phase 8: Tooling & Automation
- [ ] Batch “Validate All Classes” action
- [ ] Machine-readable validation output (JSON)
- [ ] Lint-mode (no persistence)
- [ ] CI-friendly validation command

---

## Phase 9: Documentation
- [ ] Class Editor user guide (DM-focused)
- [ ] Data model reference
- [ ] Validation error reference
- [ ] Import/export format documentation

---

## Traceability
Each task MUST map back to at least one requirement in:
- `specs/class-editor/spec.md`

No task may introduce behavior not described by the spec.
