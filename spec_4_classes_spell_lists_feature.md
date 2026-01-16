# SPEC-4-Classes & Spell Lists Feature

## Background

We’re adding a **Classes** system that integrates with Characters and spell lists in an AD&D 2e‑accurate way. From your guidance:

- **Class types**: classes are typically **Arcane** (e.g., Mage, Bard) or **Divine** (e.g., Cleric, Druid/specialty priests). A rare class can be **both** (hybrid).
- **Spell list models** supported:
  - **Universal/Generalist** (Mage): class uses the wizard list with all 8 schools (Abjuration, Conjuration/Summoning, Divination, Enchantment/Charm, Evocation, Illusion, Necromancy, Alteration).
  - **School‑restricted Specialist** (e.g., Illusionist): gains benefits in a specialty school and is **barred** from one or more opposition schools (cannot learn/cast from them).
  - **Curated Class List** (Bard): class‑specific subset of arcane spells; narrower, thematically focused.
  - **Sphere‑based Divine** (Cleric, Specialty Priests): access defined by **spheres** (full/limited/none), deity doctrine, and possibly **granted/forbidden** spells.
  - **Theme‑enforced** (Druid): its own tightly curated list (nature/elemental focus).
  - **Kit/Setting modifiers** (optional/future): kits/settings can add/remove access, grant uniques, or enforce bans.
- **Inheritance & reuse**: a class may use another class’s spell list (e.g., use Wizard list) with optional deltas (adds/removes).
- **Barred schools**: a class definition may **forbid** learning specific wizard schools.
- **Out of scope for spells**: **Psionics** (not spells), included here only for contrast.

**Design intent**: treat spell lists as world‑building and identity: restrictions define doctrine and tradition, not just balance knobs. This feature should enable per‑class spell list definition, reuse, and enforcement—cleanly interoperating with Characters and their per‑class Known/Prepared lists from SPEC‑2.


## Requirements

### Must Have
- **Class registry** persisted locally; each class has: name, type (**Arcane**, **Divine**, or **Hybrid**), description/notes.
- **Spell list strategy** per class:
  - **Own list**: explicit includes (by spell id/key) with optional excludes.
  - **Inherit**: reuse another class’s list with **delta rules** (adds/removes).
  - **Specialist bans**: for Arcane classes, mark **barred schools** (cannot learn/cast from these).
  - **Divine spheres**: per-class **sphere access** with values **Full / Limited / None**; optional granted/forbidden spell overrides.
- **Compatibility with Characters (SPEC-2)**: Character classes reference class definitions to validate **Known/Prepared** lists.
- **Search/Filter** classes by type, barred schools, sphere access pattern.
- **Import/Export** open bundles for classes (JSON/Markdown).
- **Placeholder**: keep a `Psionics` type value reserved (no behavior in v1).

### Should Have
- Versioning of class definitions; audit of changes affecting characters.
- UI diff/preview when changing class rules (shows impacted character spells).

### Could Have
- Kit/Setting modifiers as layered class variants.
- Rule presets for common specialists.

### Won’t Have (v1)
- Psionics mechanics or powers.
- Automatic slot/point progression logic.

### Acceptance Criteria
- Define a Mage Generalist, an Illusionist Specialist, a Bard (curated), a Cleric (sphere-based), and a Druid; attach to characters; validation prevents adding barred spells.
- Export/import classes round-trip intact.

## Method

### Data Model (SQLite add-ons)

```sql
-- Core class registry
CREATE TABLE IF NOT EXISTS class_definition (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  type TEXT CHECK(type IN ('Arcane','Divine','Hybrid','PsionicsPlaceholder')) NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at TEXT
);

-- Inherit another class’s list (reuse) with deltas
CREATE TABLE IF NOT EXISTS class_inherits (
  class_id INTEGER REFERENCES class_definition(id) ON DELETE CASCADE,
  from_class_id INTEGER REFERENCES class_definition(id) ON DELETE RESTRICT,
  PRIMARY KEY(class_id)
);

-- Explicit includes/excludes by spell (own list or deltas for inherited)
CREATE TABLE IF NOT EXISTS class_spell_rule (
  class_id INTEGER REFERENCES class_definition(id) ON DELETE CASCADE,
  spell_id INTEGER REFERENCES spell(id) ON DELETE CASCADE,
  rule TEXT CHECK(rule IN ('INCLUDE','EXCLUDE')) NOT NULL,
  reason TEXT,
  PRIMARY KEY(class_id, spell_id)
);

-- Arcane: barred wizard schools
CREATE TABLE IF NOT EXISTS class_school_ban (
  class_id INTEGER REFERENCES class_definition(id) ON DELETE CASCADE,
  school TEXT NOT NULL, -- e.g., Evocation, Necromancy
  PRIMARY KEY(class_id, school)
);

-- Divine spheres
CREATE TABLE IF NOT EXISTS sphere (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

-- Many spells belong to many spheres (refines existing single-field `spell.sphere`)
CREATE TABLE IF NOT EXISTS spell_sphere (
  spell_id INTEGER REFERENCES spell(id) ON DELETE CASCADE,
  sphere_id INTEGER REFERENCES sphere(id) ON DELETE CASCADE,
  PRIMARY KEY(spell_id, sphere_id)
);

-- Per-class access to spheres (Full/Limited/None) with optional overrides
CREATE TABLE IF NOT EXISTS class_sphere_access (
  class_id INTEGER REFERENCES class_definition(id) ON DELETE CASCADE,
  sphere_id INTEGER REFERENCES sphere(id) ON DELETE CASCADE,
  access TEXT CHECK(access IN ('Full','Limited','None')) NOT NULL,
  PRIMARY KEY(class_id, sphere_id)
);

-- Optional overrides for divine classes (grant or forbid specific spells irrespective of sphere access)
CREATE TABLE IF NOT EXISTS class_divine_override (
  class_id INTEGER REFERENCES class_definition(id) ON DELETE CASCADE,
  spell_id INTEGER REFERENCES spell(id) ON DELETE CASCADE,
  action TEXT CHECK(action IN ('GRANT','FORBID')) NOT NULL,
  note TEXT,
  PRIMARY KEY(class_id, spell_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_class_type ON class_definition(type);
CREATE INDEX IF NOT EXISTS idx_rule_include ON class_spell_rule(class_id, rule);
CREATE INDEX IF NOT EXISTS idx_sphere_access ON class_sphere_access(class_id, access);
```

> Note: keep legacy `spell.sphere` for compatibility, but prefer `spell_sphere` for multi-sphere accuracy.

### Effective Spell List Resolution

```plantuml
@startuml
skinparam componentStyle rectangle
rectangle "ResolveEffectiveSpellSet(class_id)" {
  () Load class_definition
  () BaseSet ← Own Includes
  () If inherits: BaseSet ← Effective(from_class) then apply deltas
  () If type in {Arcane,Hybrid}: remove spells whose school ∈ class_school_ban
  () If type in {Divine,Hybrid}: apply spheres
  () Apply overrides: GRANT add; FORBID remove
}
@enduml
```

**Arcane rules**
1) Start with **Own Includes** (if any) or inherited base.
2) **Remove** any spell where `spell.school` matches `class_school_ban`.
3) Apply **EXCLUDE** rules.

**Divine rules**
1) Build set from **spheres**: include spells where any `spell_sphere` has `Full`; if `Limited`, include but flag as Limited (UI badge). `None` excludes.
2) Apply overrides `GRANT/FORBID`.
3) Add explicit **INCLUDE/EXCLUDE** rules for exceptions (e.g., deity-granted spells).

### Validation with Characters (SPEC-3)
- On add to **Known/Prepared**, check membership in `ResolveEffectiveSpellSet(class_id)`.
- If not allowed, show reason: barred school, sphere=none, explicit forbid, or not in curated list.

### UI/UX
- **Classes Index**: list with type (Arcane/Divine/Hybrid), inheritance badge, barred schools, sphere profile, rule counts.
- **Class Editor Tabs**:
  1) **Identity**: name, type, description.
  2) **Inheritance**: select parent class (optional).
  3) **Arcane**: manage barred schools (multi-select) and explicit includes/excludes.
  4) **Divine**: manage sphere access grid (Full/Limited/None) and overrides.
  5) **Preview**: computed effective spell list with filters; diff vs parent; export.

### Import/Export (Class Bundles)
- **JSON** (single file):
```json
{
  "format":"adnd2e-class","format_version":"1.0.0",
  "class": {"name":"Illusionist","type":"Arcane","description":"Specialist wizard"},
  "inherits": {"from":"Mage"},
  "barred_schools": ["Necromancy","Evocation"],
  "includes": [{"name":"Color Spray","class":"Mage","level":1}],
  "excludes": [{"name":"Fireball","class":"Mage","level":3}],
  "spheres": null,
  "overrides": []
}
```
- **Markdown** (folder): `class.yml` with same fields; optional `spells/*.md` for inline includes.

### APIs (Rust/Tauri)

Commands follow the application's pattern: `pub async fn name(state: State<'_, Arc<Pool>>, ...) -> Result<T, AppError>` and use `tokio::task::spawn_blocking` for database access.

- `create_class(name: String, class_type: String, description: Option<String>) -> Result<i64, AppError>`
- `update_class(id: i64, name: String, class_type: String, description: Option<String>) -> Result<(), AppError>`
- `delete_class(id: i64) -> Result<(), AppError>`
- `list_classes() -> Result<Vec<ClassDefinition>, AppError>`
- `get_class(id: i64) -> Result<ClassDefinitionFull, AppError>`
- `set_inheritance(class_id: i64, from_class_id: Option<i64>) -> Result<(), AppError>`
- `set_school_bans(class_id: i64, schools: Vec<String>) -> Result<(), AppError>`
- `set_sphere_access(class_id: i64, entries: Vec<ClassSphereAccessInput>) -> Result<(), AppError>`
- `set_spell_rules(class_id: i64, rules: Vec<ClassSpellRuleInput>) -> Result<(), AppError>`
- `set_divine_overrides(class_id: i64, overrides: Vec<ClassDivineOverrideInput>) -> Result<(), AppError>`
- `resolve_class_spells(class_id: i64) -> Result<Vec<i64>, AppError>`
- `import_class_bundle(path: String) -> Result<i64, AppError>`
- `export_class_bundle(id: i64, format: String) -> Result<String, AppError>`

### Migration Strategy
1) Add new tables; keep `spell.sphere` but start writing to `spell_sphere` when importing.
2) Seed core spheres from `spheres.json` in `sphere_bundle_examples.zip`.
3) Seed baseline classes (Mage, Cleric, Druid, Bard, Illusionist) as examples.


## Implementation

### Milestones

**CL0 – Schema & Seeding**
- Create tables: `class_definition`, `class_inherits`, `class_spell_rule`, `class_school_ban`, `sphere`, `spell_sphere`, `class_sphere_access`, `class_divine_override`.
- Seed core **spheres** and baseline **classes** (Mage, Illusionist, Bard, Cleric, Druid).

**CL1 – Class Editor & Preview**
- React UI: Identity, Inheritance, Arcane (barred schools & rules), Divine (sphere grid & overrides), Preview tabs.
- Rust resolver `resolve_class_spells(class_id)` with diff vs parent and filters.

**CL2 – Character Validation Hook**
- On add to Known/Prepared, enforce class rules with reason codes (barred school, sphere none, explicit forbid, not-in-list).

**CL3 – Import/Export**
- JSON and Markdown bundles; round-trip tests; artifact provenance.

**CL4 – Search & UX Polish**
- Class list filters (type, barred schools, sphere patterns); preview performance.

**CL5 – Hardening**
- Large list handling; caching of resolved sets; migration tests.

### Test Plan Highlights
- Unit tests for resolution algorithm (inheritance, bans, spheres, overrides).
- Golden tests for bundle import/export.
- Performance asserts: resolve effective list for 10k spells < 300ms on CPU.

### Appendix A — Sample Class Bundles

Three sample definitions (JSON + Markdown) are provided for import testing:

1) **Illusionist** — Arcane Specialist, inherits Mage, barred from Necromancy/Evocation; includes a few iconic illusions and excludes Fireball.
2) **Bard** — Arcane Curated: inherits Mage with curated adds/removes (utility, charm, illusion; excludes heavy evocations/necromancy).
3) **Cleric (Generic)** — Divine with sphere access grid (Full: Healing/Protection/Divination; Limited: Combat, etc.), plus example granted/forbid overrides.

See local file `class_bundle_examples.zip`.

