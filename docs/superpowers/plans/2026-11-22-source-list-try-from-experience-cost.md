# Source-List `CanonicalSpell::try_from` & Experience Cost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Route source-list records (`map_source_list_record` in `apps/desktop/src-tauri/src/commands/source_list.rs`) through `CanonicalSpell::try_from(SpellDetail)` as required by `apps/desktop/src-tauri/AGENTS.md` so that `experience_cost` (e.g., `V, S, XP (500 XP)`) is extracted via `parse_experience_cost`, persisted in `canonical_data`, and included in `content_hash` while retaining all source-list-specific overrides.

**Architecture:** Build a `SpellDetail` from the validated and normalized `SourceListRecord` fields inside `map_source_list_record`, convert it via `CanonicalSpell::try_from(detail)` (which invokes `SpellParser::parse_experience_cost` on `detail.components` and populates `spell.experience_cost`), and then apply the source-list-specific overrides (`subschools`, editor-fallback specs for `range`/`duration`/`casting_time`/`area`/`damage`, legacy mappers for `saving_throw`/`magic_resistance`, explicit-only `components`/`material_components` synced with `experience_cost.is_some()`, `reversible`, `is_cantrip`, `is_quest_spell`, `source_refs`, and `CURRENT_SCHEMA_VERSION`).

**Tech Stack:** Rust (`tauri` backend, `serde_json`, `cargo test`, `cargo clippy`).

---

## File Structure

- **Modify:** `apps/desktop/src-tauri/src/commands/source_list.rs`
  - Import `SpellDetail` from `crate::models` (or `crate::models::spell::SpellDetail`).
  - Refactor `map_source_list_record` (lines `703-838`) to construct a `SpellDetail` from the resolved source-list fields, convert it via `CanonicalSpell::try_from(detail).map_err(&fail)?`, and apply the source-list-specific overrides while preserving `spell.experience_cost` extracted by `CanonicalSpell::try_from`.
  - Ensure that when `spell.experience_cost.is_some()` (e.g., a component string such as `"V, S, (500 XP)"` or `"V, S, XP (500 XP)"`), `spell.components.get_or_insert_with(Default::default).experience = true` is set even before `normalize()`, and all-false `SpellComponents` remain `None`.
  - Add unit tests in `commands::source_list::tests` verifying `experience_cost` extraction (`Fixed`, `PerUnit`, `DmAdjudicated`), distinct `content_hash` values for different XP amounts (`500 XP` vs `1000 XP`), and retention of all source-list overrides.
- **Modify:** `apps/desktop/src-tauri/src/commands/import.rs`
  - Add an integration test in `commands::import::tests` verifying that importing two source-list spells (SpellScribe JSON list and Markdown spell list) that differ only by XP cost (`V, S, XP (500 XP)` vs `V, S, XP (1000 XP)`) does not deduplicate them in preview, and persists `experience_cost` (`kind: Fixed`, `amount_xp: Some(500)`) in SQLite `canonical_data` and the exported vault JSON file.

---

### Task 1: Route `map_source_list_record` Through `CanonicalSpell::try_from(SpellDetail)` and Preserve `experience_cost`

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/source_list.rs:20-23`
- Modify: `apps/desktop/src-tauri/src/commands/source_list.rs:698-838`
- Test: `apps/desktop/src-tauri/src/commands/source_list.rs:1630-1634`

- [x] **Step 1: Write the failing unit tests in `apps/desktop/src-tauri/src/commands/source_list.rs`**

Append the following unit tests inside `mod tests` at the bottom of `apps/desktop/src-tauri/src/commands/source_list.rs`:

```rust
    #[test]
    fn test_source_list_extracts_experience_cost_via_try_from_and_distinguishes_hashes() {
        use crate::models::experience::ExperienceKind;

        let json_500 = r#"[{
            "name": "Permanency Variant",
            "tradition": "Arcane",
            "class_list": ["Wizard"],
            "level": 5,
            "school": "Alteration",
            "range": "Special",
            "components": "V, S, XP (500 XP)",
            "material_components": null,
            "casting_time": "2 rounds",
            "duration": "Permanent",
            "area_of_effect": "Special",
            "saving_throw": "None",
            "damage": null,
            "magic_resistance": "No",
            "reversible": false,
            "description": "Makes a spell effect permanent at an experience cost.",
            "edition": "AD&D 2e",
            "source_document": "Tome of Magic",
            "source_page": 42
        }]"#;

        let json_1000 = json_500.replace("V, S, XP (500 XP)", "V, S, XP (1,000 XP)");

        let parsed_500 = parse_spellscribe_json_list(json_500).expect("parse 500 XP list");
        let parsed_1000 = parse_spellscribe_json_list(&json_1000).expect("parse 1000 XP list");
        assert!(parsed_500.failures.is_empty());
        assert!(parsed_1000.failures.is_empty());

        let mut spell_500 = parsed_500.spells[0].spell.clone();
        let mut spell_1000 = parsed_1000.spells[0].spell.clone();

        // 1) Experience flag and structured experience_cost are both populated
        let comp_500 = spell_500.components.as_ref().expect("components present");
        assert!(comp_500.verbal);
        assert!(comp_500.somatic);
        assert!(!comp_500.material);
        assert!(comp_500.experience);

        let xp_500 = spell_500
            .experience_cost
            .as_ref()
            .expect("experience_cost must be populated by CanonicalSpell::try_from");
        assert_eq!(xp_500.kind, ExperienceKind::Fixed);
        assert_eq!(xp_500.amount_xp, Some(500));

        let xp_1000 = spell_1000
            .experience_cost
            .as_ref()
            .expect("experience_cost must be populated for 1000 XP");
        assert_eq!(xp_1000.kind, ExperienceKind::Fixed);
        assert_eq!(xp_1000.amount_xp, Some(1000));

        // 2) Source-list overrides remain intact alongside CanonicalSpell::try_from
        assert_eq!(
            spell_500
                .saving_throw
                .as_ref()
                .map(|st| (&st.kind, &st.raw_legacy_value)),
            Some((&SavingThrowKind::None, &None))
        );
        assert_eq!(
            spell_500.magic_resistance.as_ref().map(|mr| &mr.kind),
            Some(&MagicResistanceKind::IgnoresMr)
        );
        assert_eq!(spell_500.reversible, None);
        assert_eq!(spell_500.source_refs.len(), 1);
        assert_eq!(spell_500.source_refs[0].book, "Tome of Magic");
        assert_eq!(spell_500.source_refs[0].page, Some(serde_json::json!(42)));

        // 3) Content hashes and normalized canonical JSON differ for 500 XP vs 1000 XP
        let hash_500 = spell_500.compute_hash().expect("hash 500 XP");
        let hash_1000 = spell_1000.compute_hash().expect("hash 1000 XP");
        assert_ne!(
            hash_500, hash_1000,
            "spells differing only by experience_cost amount must produce distinct content_hash values"
        );

        // 4) Markdown spell list with XP cost matches JSON list hash
        let md_500 = "## Permanency Variant\n\
            - Tradition: Arcane\n\
            - Class: Wizard\n\
            - Level: 5\n\
            - School: Alteration\n\
            - Range: Special\n\
            - Components: V, S, XP (500 XP)\n\
            - Casting Time: 2 rounds\n\
            - Duration: Permanent\n\
            - Area of Effect: Special\n\
            - Saving Throw: None\n\
            - Magic Resistance: No\n\
            - Reversible: No\n\
            - Source: Tome of Magic, p. 42\n\n\
            Makes a spell effect permanent at an experience cost.\n";
        let md_parsed =
            parse_markdown_spell_list("Tome of Magic.md", md_500).expect("parse md 500 XP");
        assert!(md_parsed.failures.is_empty());
        let mut md_spell = md_parsed.spells[0].spell.clone();
        assert_eq!(
            md_spell
                .experience_cost
                .as_ref()
                .and_then(|xp| xp.amount_xp),
            Some(500)
        );
        let md_hash = md_spell.compute_hash().expect("hash md 500 XP");
        assert_eq!(hash_500, md_hash);
    }
```

- [x] **Step 2: Run the test to verify it fails**

Run:
```powershell
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml commands::source_list::tests::test_source_list_extracts_experience_cost_via_try_from_and_distinguishes_hashes -- --nocapture
```
Expected: FAIL with `"experience_cost must be populated by CanonicalSpell::try_from"` because `map_source_list_record` currently calls `CanonicalSpell::new(...)` directly and leaves `spell.experience_cost` as `None`.

- [x] **Step 3: Refactor `map_source_list_record` in `apps/desktop/src-tauri/src/commands/source_list.rs` to route through `CanonicalSpell::try_from(SpellDetail)`**

1. Update imports at lines `20-22` of `apps/desktop/src-tauri/src/commands/source_list.rs` to include `SpellDetail`:
```rust
use crate::models::{
    AreaSpec, DurationSpec, ImportSpellJsonFailure, RangeSpec, SpellCastingTime, SpellDamageSpec,
    SpellDetail,
};
```

2. In `map_source_list_record` (`apps/desktop/src-tauri/src/commands/source_list.rs:698-838`), construct a `SpellDetail` from the validated record fields, call `CanonicalSpell::try_from(detail).map_err(&fail)?`, and then apply the source-list-specific overrides while retaining `spell.experience_cost` extracted by `CanonicalSpell::try_from`:

```rust
    let class_list = split_comma_tokens(&record.class_list);
    let tags = split_comma_tokens(&record.tags);

    let parser = SpellParser::new();

    // Components + material components (never mine description prose).
    let raw_components = non_empty_trimmed(record.components.as_deref());
    let raw_materials = non_empty_trimmed(record.material_components.as_deref());

    let material_list = if let Some(mat_str) = raw_materials.as_deref() {
        parser.parse_material_components(mat_str)
    } else if let Some(comp_str) = raw_components.as_deref() {
        parser.extract_materials_from_components_line(comp_str)
    } else {
        Vec::new()
    };
    let material_components = if material_list.is_empty() {
        None
    } else {
        Some(material_list)
    };

    let range = non_empty_trimmed(record.range.as_deref())
        .map(|raw| parse_range_with_editor_fallback(&parser, &raw));
    let duration = non_empty_trimmed(record.duration.as_deref())
        .map(|raw| parse_duration_with_editor_fallback(&parser, &raw));
    let casting_time = non_empty_trimmed(record.casting_time.as_deref())
        .map(|raw| parse_casting_time_with_editor_fallback(&parser, &raw));
    let area = non_empty_trimmed(record.area_of_effect.as_deref())
        .map(|raw| parse_area_with_editor_fallback(&parser, &raw));
    let damage = non_empty_trimmed(record.damage.as_deref())
        .map(|raw| parse_damage_with_editor_fallback(&parser, &raw));
    let saving_throw =
        non_empty_trimmed(record.saving_throw.as_deref()).map(|raw| map_legacy_saving_throw(&raw));
    let magic_resistance = non_empty_trimmed(record.magic_resistance.as_deref())
        .map(|raw| map_legacy_magic_resistance(&raw));

    let reversible = match record.reversible {
        Some(true) => Some(1),
        _ => None,
    };

    // Review notes & needs_review warnings.
    let stored_note = if let Some(raw_note) = non_empty_trimmed(record.review_notes.as_deref()) {
        let normalized_note = normalize_newlines(&raw_note);
        let (truncated_note, was_truncated) =
            truncate_chars(&normalized_note, SOURCE_REF_NOTE_MAX_CHARS);
        if was_truncated {
            warnings.push(format!(
                "Review note exceeded {} characters and was truncated",
                SOURCE_REF_NOTE_MAX_CHARS
            ));
        }
        warnings.push(format!("Review note: {}", truncated_note));
        Some(truncated_note)
    } else {
        None
    };

    if record.needs_review {
        warnings.push("Needs review (flagged by source)".to_string());
    }

    // SourceRef book resolution: ignore placeholder `markdown.md` or empty, fall back to file stem, or "Unknown".
    let explicit_book = non_empty_trimmed(record.source_document.as_deref())
        .filter(|b| !b.eq_ignore_ascii_case("markdown.md"));
    let stem_book = non_empty_trimmed(file_stem);
    let resolved_book = explicit_book.or(stem_book);
    let page = match record.source_page {
        Some(serde_json::Value::Null) | None => None,
        Some(serde_json::Value::String(s)) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else if let Ok(n) = trimmed.parse::<i64>() {
                Some(serde_json::Value::Number(n.into()))
            } else {
                Some(serde_json::Value::String(trimmed.to_string()))
            }
        }
        Some(other) => Some(other),
    };

    let source_refs = if resolved_book.is_some() || page.is_some() || stored_note.is_some() {
        vec![SourceRef {
            system: None,
            book: resolved_book.unwrap_or_else(|| "Unknown".to_string()),
            page,
            note: stored_note,
            url: None,
        }]
    } else {
        Vec::new()
    };

    let flat_classes = if class_list.is_empty() {
        None
    } else {
        Some(class_list.join(", "))
    };
    let flat_tags = if tags.is_empty() {
        None
    } else {
        Some(tags.join(", "))
    };

    // Route through CanonicalSpell::try_from(SpellDetail) per apps/desktop/src-tauri/AGENTS.md
    // so shared conversions (such as parse_experience_cost -> spell.experience_cost) run,
    // then apply source-list-specific overrides.
    let detail = SpellDetail {
        id: None,
        name: name.clone(),
        school: primary_school,
        sphere,
        class_list: flat_classes.clone(),
        level,
        range: non_empty_trimmed(record.range.as_deref()),
        components: raw_components,
        material_components: raw_materials,
        casting_time: non_empty_trimmed(record.casting_time.as_deref()),
        duration: non_empty_trimmed(record.duration.as_deref()),
        area: non_empty_trimmed(record.area_of_effect.as_deref()),
        saving_throw: non_empty_trimmed(record.saving_throw.as_deref()),
        damage: non_empty_trimmed(record.damage.as_deref()),
        magic_resistance: non_empty_trimmed(record.magic_resistance.as_deref()),
        reversible,
        description,
        tags: flat_tags,
        source: None,
        edition: non_empty_trimmed(record.edition.as_deref()),
        author: non_empty_trimmed(record.author.as_deref()),
        license: non_empty_trimmed(record.license.as_deref()),
        is_quest_spell: is_quest_spell.unwrap_or(0),
        is_cantrip: is_cantrip.unwrap_or(0),
        schema_version: Some(CURRENT_SCHEMA_VERSION),
        artifacts: None,
        canonical_data: None,
        content_hash: None,
        range_spec: range,
        components_spec: None,
        material_components_spec: None,
        casting_time_spec: casting_time,
        duration_spec: duration,
        area_spec: area,
        saving_throw_spec: saving_throw,
        damage_spec: damage,
        magic_resistance_spec: magic_resistance,
    };

    let mut spell = CanonicalSpell::try_from(detail).map_err(&fail)?;
    spell.tradition = tradition;
    spell.subschools = subschools;
    spell.class_list = class_list;
    spell.tags = tags;
    spell.material_components = material_components;
    if spell.experience_cost.is_some() {
        spell
            .components
            .get_or_insert_with(Default::default)
            .experience = true;
    }
    spell.components = spell.components.filter(|parsed| {
        parsed.verbal
            || parsed.somatic
            || parsed.material
            || parsed.focus
            || parsed.divine_focus
            || parsed.experience
    });
    spell.reversible = reversible;
    spell.source_refs = source_refs;
    spell.is_quest_spell = is_quest_spell;
    spell.is_cantrip = is_cantrip;
    spell.schema_version = CURRENT_SCHEMA_VERSION;
```

*(Note: Because `CanonicalSpell::try_from(detail)` already calls `validate_tradition_school_sphere_consistency`, keeping or delegating that check is seamless, and `flat_classes` is already computed before `validate_epic_and_quest_spells` at line 845.)*

- [x] **Step 4: Run the `commands::source_list` unit test suite to verify it passes**

Run:
```powershell
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml commands::source_list::tests -- --nocapture
```
Expected: All `commands::source_list::tests` pass (`0 failed`), including `test_source_list_extracts_experience_cost_via_try_from_and_distinguishes_hashes` and `test_netheril_json_and_markdown_parity_and_validation_rules`.

---

### Task 2: Verify End-to-End Import Preview, Dedup, and Database/Vault Persistence for Source-List XP Costs

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/import.rs:6620-6628`
- Test: `apps/desktop/src-tauri/src/commands/import.rs`

- [x] **Step 1: Write the integration test in `apps/desktop/src-tauri/src/commands/import.rs`**

Add `test_source_list_import_preserves_experience_cost_and_prevents_false_dedup` inside `mod tests` at the end of `apps/desktop/src-tauri/src/commands/import.rs`:

```rust
    #[test]
    fn test_source_list_import_preserves_experience_cost_and_prevents_false_dedup() {
        use crate::models::experience::ExperienceKind;

        let temp_dir = VaultTestEnvGuard::new_temp().expect("create isolated vault env");
        let conn = setup_import_apply_test_db();
        create_change_log_table(&conn);
        create_hash_reference_tables(&conn);

        // Two otherwise-identical spells in a source-list JSON array differing only in XP cost
        let payload = r#"[
            {
                "name": "Limited Wish XP Test",
                "tradition": "Arcane",
                "class_list": ["Wizard"],
                "level": 7,
                "school": "Conjuration/Summoning",
                "range": "Unlimited",
                "components": "V, S, XP (500 XP)",
                "casting_time": "1 round",
                "duration": "Special",
                "area_of_effect": "Special",
                "saving_throw": "Special",
                "magic_resistance": "Yes",
                "reversible": false,
                "description": "Fulfills a limited request at an experience cost.",
                "source_document": "PHB",
                "source_page": 230
            },
            {
                "name": "Limited Wish XP Test",
                "tradition": "Arcane",
                "class_list": ["Wizard"],
                "level": 7,
                "school": "Conjuration/Summoning",
                "range": "Unlimited",
                "components": "V, S, XP (1000 XP)",
                "casting_time": "1 round",
                "duration": "Special",
                "area_of_effect": "Special",
                "saving_throw": "Special",
                "magic_resistance": "Yes",
                "reversible": false,
                "description": "Fulfills a limited request at an experience cost.",
                "source_document": "PHB",
                "source_page": 230
            }
        ]"#;

        let classified =
            classify_import_input(Some(payload.to_string()), None).expect("classify xp list");
        let preview = preview_classified_payload(classified, SourceRefUrlPolicy::DropRef);

        assert!(preview.failures.is_empty());
        assert_eq!(
            preview.spells.len(),
            2,
            "spells with different XP costs (500 XP vs 1000 XP) must not deduplicate in preview"
        );
        assert_ne!(
            preview.spells[0].content_hash,
            preview.spells[1].content_hash
        );

        // Apply the first spell (500 XP) and verify DB canonical_data and exported vault JSON retain experience_cost
        let first_item = preview.spells.into_iter().next().unwrap();
        let apply_res = apply_import_spell_json_impl(&conn, vec![first_item], None)
            .expect("apply 500 XP spell");
        assert_eq!(apply_res.imported_count, 1);

        let (db_canon, vault_canon, _) =
            read_persisted_spell_from_db_and_vault(&conn, temp_dir.path(), "Limited Wish XP Test");
        for canon in [&db_canon, &vault_canon] {
            let xp = canon
                .experience_cost
                .as_ref()
                .expect("persisted canonical spell must retain experience_cost");
            assert_eq!(xp.kind, ExperienceKind::Fixed);
            assert_eq!(xp.amount_xp, Some(500));
            assert_eq!(
                canon.components.as_ref().map(|c| c.experience),
                Some(true)
            );
        }
    }
```

- [x] **Step 2: Run the new integration test and full `commands::import` test suite**

Run:
```powershell
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml commands::import::tests::test_source_list_import_preserves_experience_cost_and_prevents_false_dedup -- --nocapture
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml commands::import::tests
```
Expected: PASS (`0 failed`).

- [x] **Step 3: Run formatting and Clippy lint checks**

Run:
```powershell
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
```
Expected: Both exit with code `0` and zero warnings.

- [x] **Step 4: Commit the changes**

Run:
```powershell
git add apps/desktop/src-tauri/src/commands/source_list.rs apps/desktop/src-tauri/src/commands/import.rs
git commit -m "fix(import): route source-list conversion through CanonicalSpell::try_from to preserve experience_cost"
```
