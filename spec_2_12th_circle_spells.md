# SPEC-2-12th Circle Spells & Quest Spells

## Background

This specification extends the AD&D 2nd Edition Spellbook application to support **spell levels 10, 11, and 12** (10th through 12th circle spells) for Arcane casters, and **Quest spells** for Divine casters. These represent epic-level magic used in high-level campaigns, custom settings, or homebrew content.

### Arcane Epic Magic (Levels 10-12)

Traditional AD&D 2e caps wizard spells at 9th level (9th circle), but many campaign settings and homebrew content extend this to include:
- **10th Level**: Epic spells, "True Dweomers", or equivalent high-magic constructs
- **11th Level**: Mythic-tier spells from advanced campaign settings  
- **12th Level**: Deity-level or artifact-tier magic

> [!IMPORTANT]
> **Arcane Magic Only**: Spell levels 10-12 are restricted to **Arcane (Wizard/Mage) spells only**. Divine magic (Priest/Cleric spells) remains capped at 7th level per AD&D 2e rules.

### Cantrips (Level 0)

**Cantrips** are minor magical effects that represent the basics of spellcasting. In AD&D 2e, cantrips are level 0 spells that are simpler and less powerful than 1st-level spells.

- Available to both **Arcane and Divine** casters
- Represent minor magical tricks, simple effects, or preparatory magic
- Examples: *Light*, *Detect Magic*, *Mending*, *Prestidigitation*

> [!NOTE]
> The application already supports level 0 spells in the data model and validation. This specification adds explicit "Cantrip" terminology and visual distinction in the UI.

### Divine Quest Spells

**Quest spells** are special divine magic granted directly by a deity to their faithful servants. Unlike standard priest spells (which cap at 7th level), Quest spells represent divine intervention and miracles beyond mortal priestly power.

- **Quest spells** are not categorized by standard levels but are flagged separately
- They are **Divine (Priest/Cleric) only** — Arcane casters cannot access Quest spells
- Typically granted for specific missions, holy crusades, or divine purposes
- Examples: *True Resurrection*, *Divine Wrath*, *Deity's Blessing*

> [!NOTE]
> Quest spells use the existing `level` field (typically set to 0 or a nominal value) combined with a new `is_quest_spell` flag to distinguish them from standard spells.

This feature update ensures the application can accommodate extended Arcane spell levels and Divine Quest spells while maintaining backwards compatibility with standard spells.


## Requirements

### Must Have

1. **Data Model Support**
   - The `spell.level` field must accept values 0-12 (currently accepts 0+, but UI limits to 0-9)
   - **New field**: `is_quest_spell` (INTEGER/BOOLEAN, default 0) to flag Quest spells
   - No other database schema changes required

2. **Level Filter UI Updates**
   - Update the **Library** page level range slider to support 0-12 (currently 0-9)
   - Update the **Spellbook Builder** level filter dropdowns to include levels 10, 11, 12

3. **Arcane-Only Restriction for Levels 10-12**
   - Spells with level 10, 11, or 12 must be **Arcane (Wizard/Mage) class only**
   - Validation must reject attempts to save level 10+ spells with Priest/Cleric/Divine classes
   - Display clear error message when restriction is violated

4. **Quest Spell Support (Divine Only)**
   - Add `is_quest_spell` checkbox/toggle in the Spell Editor
   - Quest spells must be **Divine (Priest/Cleric) class only**
   - Validation must reject attempts to save Quest spells with Arcane classes
   - Quest spells display as "Quest" instead of a level number in spell lists
   - Quest spell filter option in Library and Spellbook Builder

5. **Spell Editor Validation**
   - Update the level input validation to enforce Arcane-only for levels 10+
   - Add Quest spell toggle with Divine-only enforcement
   - Display warning/indicator for epic spell levels (10-12) and Quest spells
   - Disable level 10+ when class is Divine; disable Quest when class is Arcane

6. **Search & Facets**
   - Ensure the `list_facets` command returns levels 10-12 when present in the database
   - Add Quest spell facet/filter option
   - Level range filters must work correctly for levels 10-12

7. **Import/Export Support**
   - Import wizard must accept spells with levels 10-12 **only if class is Arcane**
   - Import wizard must accept Quest spells **only if class is Divine**
   - Display validation error during import for class/level mismatches
   - Exported spells and spellbooks must preserve levels 10-12 and `is_quest_spell` flag

### Should Have

1. **Visual Distinction for Epic/Quest/Cantrip Spells**
   - Badge or color indicator for spells level 10+ (e.g., purple "Epic" badge)
   - Badge or color indicator for Quest spells (e.g., gold "Quest" badge)
   - Badge or color indicator for cantrips (e.g., gray "Cantrip" or "0" badge)
   - Help users distinguish epic/quest/cantrip content from standard spells

2. **Level/Quest/Cantrip Terminology**
   - Display "10th Circle", "11th Circle", "12th Circle" for Arcane epic spells
   - Display "Quest" for divine Quest spells (no level number)
   - Display "Cantrip" or "0" for level 0 spells
   - Maintain "1st-9th Circle" terminology for standard spells

3. **Filter Presets**
   - Quick-filter for "Cantrips (Level 0)" in the Library
   - Quick-filter for "Epic Spells (10+)" in the Library
   - Quick-filter for "Quest Spells" in the Library

4. **Level Grouping in Exports**
   - Group spells by tier (Cantrips, 1-9 Standard, 10-12 Epic, Quest) in printed spellbooks
   - Optional section headers for cantrip, epic, and quest spell content

5. **Epic/Quest Spell Warning on Import**
   - Display a notice when importing non-standard spells
   - Add a checkbox to the import dialog to disable the notice


## Method

### Component Analysis

The following components require updates to support levels 10-12:

#### Frontend (React/TypeScript)

| Component | File | Current State | Required Changes |
|-----------|------|---------------|------------------|
| Library | `Library.tsx` | Slider max=9 | Change max to 12, update display label |
| Library | `Library.tsx` | Default levelMax="9" | Update default display to 12 |
| Spellbook Builder | `SpellbookBuilder.tsx` | Level options from facets | No change needed (dynamic) |
| Spell Editor | `SpellEditor.tsx` | No max limit | Optionally add epic-level indicator |
| Import Wizard | `ImportWizard.tsx` | Accepts any level | No change needed |
| Field Mapper | `FieldMapper.tsx` | Accepts any level | No change needed |

#### Backend (Rust/Tauri)

| Component | File | Current State | Required Changes |
|-----------|------|---------------|------------------|
| Validation | `main.rs` | Only validates level ≥ 0 | Add max validation (≤12) + Arcane-only check for 10+ |
| Facets | `main.rs` | Dynamic from DB | No change needed |
| Search Filters | `main.rs` | No max level limit | No change needed |

#### Database (SQLite)

| Table | Column | Current State | Required Changes |
|-------|--------|---------------|------------------|
| spell | level | INTEGER, no constraints | No change needed |
| spell | is_quest_spell | **NEW COLUMN** | Add `is_quest_spell INTEGER DEFAULT 0` |


### UI/UX Changes

#### Library Page - Level Range Slider

**Current Implementation** (`Library.tsx`, lines 270-294):
```tsx
<span>Level range: {levelMin || 0} - {levelMax || 9}</span>
<Slider.Root
  value={[levelMin ? parseInt(levelMin) : 0, levelMax ? parseInt(levelMax) : 9]}
  max={9}
  step={1}
  ...
>
```

**Proposed Implementation**:
```tsx
<span>Level range: {levelMin || 0} - {levelMax || 12}</span>
<Slider.Root
  value={[levelMin ? parseInt(levelMin) : 0, levelMax ? parseInt(levelMax) : 12]}
  max={12}
  step={1}
  ...
>
```

#### Quest Spell Filter

Add a Quest spell filter checkbox/toggle:
```tsx
<label className="flex items-center gap-2">
  <input
    type="checkbox"
    checked={showQuestSpells}
    onChange={(e) => setShowQuestSpells(e.target.checked)}
  />
  <span className="text-xs text-neutral-400">Include Quest Spells</span>
</label>
```

#### Visual Indicators for Epic/Quest/Cantrip Spells

In the spell list table, display badges:
```tsx
<td className="p-2 text-center">
  {s.is_quest_spell ? (
    <span className="px-2 py-0.5 bg-amber-600/30 text-amber-400 rounded text-xs">Quest</span>
  ) : s.level >= 10 ? (
    <span className="px-2 py-0.5 bg-purple-600/30 text-purple-400 rounded text-xs">Epic {s.level}</span>
  ) : s.level === 0 ? (
    <span className="px-2 py-0.5 bg-neutral-600/30 text-neutral-400 rounded text-xs">Cantrip</span>
  ) : (
    s.level
  )}
</td>
```


## Implementation

### Files to Modify

---

#### Frontend

##### [MODIFY] [Library.tsx](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/spellbook/apps/desktop/src/ui/Library.tsx)

1. **Line 270**: Update default display from 9 to 12
   ```tsx
   // Before
   <span>Level range: {levelMin || 0} - {levelMax || 9}</span>
   // After
   <span>Level range: {levelMin || 0} - {levelMax || 12}</span>
   ```

2. **Lines 274-276**: Update Slider.Root max and default values
   ```tsx
   // Before
   value={[levelMin ? Number.parseInt(levelMin) : 0, levelMax ? Number.parseInt(levelMax) : 9]}
   max={9}
   // After
   value={[levelMin ? Number.parseInt(levelMin) : 0, levelMax ? Number.parseInt(levelMax) : 12]}
   max={12}
   ```

---

##### [MODIFY] [SpellEditor.tsx](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/spellbook/apps/desktop/src/ui/SpellEditor.tsx)

1. Add `is_quest_spell` field to the form state and SpellDetail type
2. Add Quest spell toggle in the form:
   ```tsx
   <div className="flex items-center gap-2">
     <input
       id="spell-quest"
       type="checkbox"
       className="h-4 w-4"
       checked={Boolean(form.is_quest_spell)}
       onChange={(e) => handleChange("is_quest_spell", e.target.checked ? 1 : 0)}
       disabled={isArcaneClass} // Disable for Arcane classes
     />
     <label htmlFor="spell-quest" className="text-xs text-neutral-400">
       Quest Spell (Divine Only)
     </label>
   </div>
   ```
3. Add validation to show error if Quest spell with Arcane class
4. Add visual indicator badge for Epic (level 10+) and Quest spells

---

##### [MODIFY] [SpellbookBuilder.tsx](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/spellbook/apps/desktop/src/ui/SpellbookBuilder.tsx)

The level filter dropdowns in the spell picker modal dynamically populate from `facets.levels`, which comes from the database. No changes needed if levels 10-12 exist in the database. 

However, to ensure levels 10-12 are always available as filter options even when no such spells exist:

1. **Lines 415-426** and **Lines 427-438**: Consider updating the level selectors to include 10, 11, 12 as options even when not in facets.

---

#### Backend (Optional)

##### [MODIFY] [main.rs](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/spellbook/apps/desktop/src-tauri/src/main.rs)

1. **Lines 665-670**: Add max level validation and Arcane-only restriction
   ```rust
   // Before
   if level < 0 {
       return Err("level must be 0 or greater".into());
   }
   // After
   if level < 0 || level > 12 {
       return Err("level must be between 0 and 12".into());
   }
   ```

2. **New validation function**: Add Arcane-only check for levels 10+ and Divine-only for Quest
   ```rust
   fn validate_epic_and_quest_spells(
       level: i64, 
       class_list: &Option<String>,
       is_quest_spell: bool
   ) -> Result<(), String> {
       let divine_classes = ["priest", "cleric", "druid", "paladin", "ranger"];
       let classes_lower = class_list.as_ref()
           .map(|c| c.to_lowercase())
           .unwrap_or_default();
       
       let has_divine = divine_classes.iter().any(|c| classes_lower.contains(c));
       
       // Epic spells (10+) are Arcane only
       if level >= 10 && has_divine {
           return Err("Spell levels 10-12 are restricted to Arcane (Wizard/Mage) classes only".into());
       }
       
       // Quest spells are Divine only
       if is_quest_spell && !has_divine {
           return Err("Quest spells are restricted to Divine (Priest/Cleric) classes only".into());
       }
       
       // Cannot be both epic level and quest spell
       if level >= 10 && is_quest_spell {
           return Err("A spell cannot be both Epic (level 10+) and a Quest spell".into());
       }
       
       Ok(())
   }
   ```

3. **Database Migration**: Add `is_quest_spell` column
   ```sql
   ALTER TABLE spell ADD COLUMN is_quest_spell INTEGER DEFAULT 0;
   ```

---

### Testing

#### Unit Tests

- Verify spell creation with levels 10, 11, 12 (Arcane class)
- Verify spell creation **fails** for level 10+ with Priest/Cleric class
- Verify Quest spell creation with Priest/Cleric class
- Verify Quest spell creation **fails** with Wizard/Mage class
- Verify a spell cannot be both level 10+ and Quest
- Verify search filters work correctly with extended levels and Quest flag
- Verify facet aggregation includes levels 10-12 and Quest spells

#### E2E Tests

Add new test cases to existing Playwright test files:

##### [MODIFY] [milestone_3.spec.ts](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/spellbook/apps/desktop/tests/milestone_3.spec.ts)

Add tests for:
1. Creating a level 10 spell with Wizard class (should succeed)
2. Creating a level 10 spell with Cleric class (should fail with error)
3. Creating a Quest spell with Cleric class (should succeed)
4. Creating a Quest spell with Wizard class (should fail with error)
5. Filtering by epic spell levels using the slider
6. Filtering by Quest spells
7. Verifying the slider range extends to 12

##### [MODIFY] [e2e.spec.ts](file:///c:/Users/vitki/OneDrive/GitHub/runecalico-ai/second_edition_spellbook/spellbook/apps/desktop/tests/e2e.spec.ts)

Add tests for:
1. Importing an Arcane spell with level 10+ (should succeed)
2. Importing a Priest spell with level 10+ (should fail validation)
3. Importing a Quest spell with Divine class (should succeed)
4. Importing a Quest spell with Arcane class (should fail validation)
5. Exporting a spellbook containing epic and quest spells


## Milestones

**M2.6 – 12th Circle & Quest Spell Support (1-2 days)**

- [ ] Add `is_quest_spell` column to database schema
- [ ] Update SpellDetail/SpellCreate types in frontend and backend
- [ ] Update Library.tsx level slider max from 9 to 12
- [ ] Update Library.tsx default level display from 9 to 12
- [ ] Add Quest spell filter toggle in Library
- [ ] Add Quest spell checkbox in SpellEditor
- [ ] Add visual badges for Epic (purple) and Quest (gold) spells
- [ ] Add backend validation for Arcane-only (10+) and Divine-only (Quest)
- [ ] Verify SpellbookBuilder level filters work with 10-12 and Quest
- [ ] Update ImportWizard to handle Quest spell field
- [ ] Add E2E tests for epic and quest spell support
- [ ] Manual verification with level 10-12 and Quest spells


## Verification Plan

### Automated Tests

1. **Create Epic Spell Test**
   - Create a Wizard spell with level 10, 11, and 12
   - Verify it appears in the library with "Epic" badge
   - Verify level displays correctly

2. **Create Quest Spell Test**
   - Create a Cleric Quest spell
   - Verify it appears in the library with "Quest" badge
   - Verify it displays "Quest" instead of level number

3. **Level/Quest Restriction Tests**
   - Attempt to create Cleric spell level 10 (should fail)
   - Attempt to create Wizard Quest spell (should fail)

4. **Level Filter Test**
   - Create spells at levels 1, 9, 10, 12 and a Quest spell
   - Use the level slider to filter 10-12
   - Verify only level 10 and 12 spells appear (not Quest)
   - Use Quest filter to show only Quest spells

5. **Import Test**
   - Import markdown with level 11 Arcane spell (succeed)
   - Import markdown with Quest Divine spell (succeed)
   - Import markdown with level 10 Divine spell (fail)
   - Import markdown with Quest Arcane spell (fail)

### Manual Verification

1. **UI Verification**
   - Verify slider visually shows 0-12 range
   - Verify slider thumbs can be dragged to level 12
   - Verify Quest spell checkbox appears and works
   - Verify Epic badge (purple) displays for level 10+ Arcane spells
   - Verify Quest badge (gold) displays for Quest Divine spells

2. **Spellbook Builder Verification**
   - Add a level 12 Arcane spell to a character's spellbook
   - Add a Quest spell to a character's spellbook
   - Verify both appear in the spellbook list with proper badges
   - Verify print output includes the spells correctly


## Risks & Considerations

1. **Backwards Compatibility**: Existing users with spells at level 0-9 should see no change in functionality
2. **Database Migration**: Adding `is_quest_spell` column requires migration; existing spells default to 0 (not quest)
3. **UI Clarity**: The slider range 0-12 is slightly wider; ensure it remains usable on smaller screens
4. **Validation Complexity**: Must handle edge cases (class changes after setting level/quest, import conflicts)
5. **Content Licensing**: Level 10+ and Quest spells are typically homebrew/custom content; this aligns with the app's focus on user-created collections


## Appendix A — AD&D 2e Epic & Quest Magic Context

### Arcane Epic Magic

While standard AD&D 2e limits wizard spells to 9th level and priest spells to 7th level, several supplements and campaign settings introduced higher-level arcane magic:

- **High-Level Campaigns** (TSR 2156): Introduced "True Dweomers" as 10th-level equivalents for wizards
- **Forgotten Realms**: Epic arcane magic (via Karsus, Netherese Arcanists, Mystra's Ban scenarios)  
- **Homebrew**: Many campaigns extend arcane spell progression for epic-level play

### Divine Quest Spells

**Quest spells** appear in various AD&D 2e supplements:

- **Tome of Magic**: Introduced Quest spells as deity-granted abilities
- **Faiths & Avatars** (Forgotten Realms): Specific Quest spells for various deities
- **Player's Option: Spells & Magic**: Expanded Quest spell mechanics

Quest spells are granted directly by a deity for a specific purpose and are not "learned" in the traditional sense. They represent divine intervention beyond the normal priest spell progression.

> [!NOTE]
> This feature supports both Arcane epic magic (levels 10-12) and Divine Quest spells, providing complete high-level magic support for all caster types while respecting the distinct nature of Arcane vs Divine magic in AD&D 2e.
