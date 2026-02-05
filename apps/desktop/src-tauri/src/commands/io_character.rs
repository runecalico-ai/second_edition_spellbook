use crate::commands::spells::canonicalize_spell_detail;
use crate::db::Pool;
use crate::error::AppError;
use crate::models::{
    BundleClass, BundleClassSpell, Character, CharacterAbilities, CharacterBundle, CharacterClass,
    SpellDetail,
};
use rusqlite::params;
use rusqlite::OptionalExtension;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tauri::State;

// Helper to fetch bundle data (synchronous, for use in spawn_blocking)
fn fetch_character_bundle(
    conn: &rusqlite::Connection,
    character_id: i64,
) -> Result<CharacterBundle, AppError> {
    eprintln!("APP DB: Fetching character bundle for id {}", character_id);
    // 1. Get Character
    let mut stmt = conn.prepare("SELECT id, name, type, race, alignment, com_enabled, notes, created_at, updated_at FROM \"character\" WHERE id=?")?;
    let character = stmt.query_row(params![character_id], |row| {
        Ok(Character {
            id: row.get(0)?,
            name: row.get(1)?,
            character_type: row.get(2)?,
            race: row.get(3)?,
            alignment: row.get(4)?,
            com_enabled: row.get(5)?,
            notes: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;

    // 2. Get Abilities
    let mut stmt = conn.prepare(
        "SELECT id, character_id, str, dex, con, int, wis, cha, com
         FROM character_ability WHERE character_id = ?",
    )?;
    let abilities = stmt
        .query_row(params![character_id], |row| {
            Ok(CharacterAbilities {
                id: row.get(0)?,
                character_id: row.get(1)?,
                str: row.get(2)?,
                dex: row.get(3)?,
                con: row.get(4)?,
                int: row.get(5)?,
                wis: row.get(6)?,
                cha: row.get(7)?,
                com: row.get(8)?,
            })
        })
        .optional()?;

    // 3. Get Classes
    let mut stmt = conn.prepare(
        "SELECT id, class_name, class_label, level FROM character_class WHERE character_id = ?",
    )?;
    let class_rows = stmt.query_map(params![character_id], |row| {
        Ok(CharacterClass {
            id: row.get(0)?,
            character_id,
            class_name: row.get(1)?,
            class_label: row.get(2)?,
            level: row.get(3)?,
        })
    })?;

    let mut classes = vec![];
    for class_row in class_rows {
        let class_data = class_row?;

        // 4. Get Spells for this class
        let mut stmt = conn.prepare(
            "SELECT s.id, s.name, s.level, s.school, s.sphere, s.range, s.components,
                    s.material_components, s.casting_time, s.duration, s.area, s.saving_throw,
                    s.reversible, s.description, s.tags, s.source, s.edition, s.author,
                    s.license, s.is_quest_spell, s.is_cantrip, s.class_list,
                    s.damage, s.magic_resistance,
                    ccs.list_type, ccs.notes
             FROM character_class_spell ccs
             JOIN spell s ON s.id = ccs.spell_id
             WHERE ccs.character_class_id = ?",
        )?;

        let spell_rows = stmt.query_map(params![class_data.id], |row| {
            let spell = SpellDetail {
                id: None,
                name: row.get(1)?,
                level: row.get(2)?,
                school: row.get(3)?,
                sphere: row.get(4)?,
                range: row.get(5)?,
                components: row.get(6)?,
                material_components: row.get(7)?,
                casting_time: row.get(8)?,
                duration: row.get(9)?,
                area: row.get(10)?,
                saving_throw: row.get(11)?,
                reversible: row.get(12)?,
                description: row.get(13)?,
                tags: row.get(14)?,
                source: row.get(15)?,
                edition: row.get(16)?,
                author: row.get(17)?,
                license: row.get(18)?,
                is_quest_spell: row.get(19)?,
                is_cantrip: row.get(20)?,
                class_list: row.get(21)?,
                damage: row.get(22)?,
                magic_resistance: row.get(23)?,
                artifacts: None,
            };
            let list_type: String = row.get(24)?;
            let notes: Option<String> = row.get(25)?;

            Ok(BundleClassSpell {
                spell,
                list_type,
                notes,
            })
        })?;

        let mut spells = vec![];
        for spell in spell_rows {
            spells.push(spell?);
        }

        classes.push(BundleClass {
            class_name: class_data.class_name,
            class_label: class_data.class_label,
            level: class_data.level,
            spells,
        });
    }

    Ok(CharacterBundle {
        format: "adnd2e-character".to_string(),
        format_version: "1.0.0".to_string(),
        name: character.name,
        character_type: character.character_type,
        race: character.race,
        alignment: character.alignment,
        com_enabled: character.com_enabled,
        notes: character.notes,
        created_at: character.created_at,
        updated_at: character.updated_at,
        abilities,
        classes,
    })
}

#[tauri::command]
pub async fn export_character_bundle(
    state: State<'_, Arc<Pool>>,
    character_id: i64,
) -> Result<CharacterBundle, AppError> {
    eprintln!("APP CMD: export_character_bundle id={}", character_id);
    let pool = state.inner().clone();
    let bundle_res = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        fetch_character_bundle(&conn, character_id)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))?;
    let bundle = bundle_res?;

    eprintln!(
        "APP CMD: export_character_bundle SUCCESS for {}",
        bundle.name
    );
    Ok(bundle)
}

#[tauri::command]
pub async fn export_character_markdown_zip(
    state: State<'_, Arc<Pool>>,
    character_id: i64,
) -> Result<Vec<u8>, AppError> {
    eprintln!("APP CMD: export_character_markdown_zip id={}", character_id);
    let pool = state.inner().clone();

    // 1. Fetch data
    let bundle_res = tokio::task::spawn_blocking(move || {
        let conn = pool.get()?;
        fetch_character_bundle(&conn, character_id)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))?;
    let bundle = bundle_res?;

    eprintln!("APP CMD: bundle fetched for ZIP, starting generation...");

    // 2. Create ZIP in memory
    let zip_res = tokio::task::spawn_blocking(move || {
        use std::io::Write;
        use zip::write::{FileOptions, ZipWriter};

        let mut zip = ZipWriter::new(std::io::Cursor::new(Vec::new()));

        // Settings for files
        let options = FileOptions::<()>::default()
            .compression_method(zip::CompressionMethod::Stored)
            .unix_permissions(0o755);

        // Add character.yml
        let yaml_content = serde_yaml::to_string(&bundle).map_err(|e| AppError::Export(format!("YAML serialization error: {}", e)))?;
        zip.start_file("character.yml", options).map_err(|e| AppError::Export(format!("Zip error: {}", e)))?;
        zip.write_all(yaml_content.as_bytes()).map_err(AppError::Io)?;

        // Add spells
        for class in &bundle.classes {
            for entry in &class.spells {
                let s = &entry.spell;
                let filename = format!("spells/{}.md", sanitize_filename(&s.name));

                let md_content = format!(
                    "---\nname: \"{}\"\nlevel: {}\nschool: \"{}\"\n---\n\n# {}\n\n**Level:** {}\n**School:** {}\n**Range:** {}\n**Duration:** {}\n**Area:** {}\n**Casting Time:** {}\n**Components:** {}\n**Saving Throw:** {}\n\n{}\n",
                    s.name,
                    s.level,
                    s.school.as_deref().unwrap_or(""),
                    s.name,
                    s.level,
                    s.school.as_deref().unwrap_or(""),
                    s.range.as_deref().unwrap_or(""),
                    s.duration.as_deref().unwrap_or(""),
                    s.area.as_deref().unwrap_or(""),
                    s.casting_time.as_deref().unwrap_or(""),
                    s.components.as_deref().unwrap_or(""),
                    s.saving_throw.as_deref().unwrap_or(""),
                    s.description
                );

                zip.start_file(filename, options).map_err(|e| AppError::Export(format!("Zip error: {}", e)))?;
                zip.write_all(md_content.as_bytes()).map_err(AppError::Io)?;
            }
        }

        let cursor = zip.finish().map_err(|e| AppError::Export(format!("Zip finish error: {}", e)))?;
        Ok::<Vec<u8>, AppError>(cursor.into_inner())
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))?;
    let zip_data = zip_res?;

    eprintln!(
        "APP CMD: export_character_markdown_zip SUCCESS, bytes={}",
        zip_data.len()
    );
    Ok(zip_data)
}

fn sanitize_filename(name: &str) -> String {
    name.replace(|c: char| !c.is_alphanumeric() && c != ' ' && c != '-', "")
        .trim()
        .to_string()
}

#[derive(serde::Deserialize, serde::Serialize)]
pub struct ImportOptions {
    pub overwrite: bool,
}

// Core logic for importing a character bundle into the database
fn import_character_bundle_logic(
    tx: &rusqlite::Transaction,
    bundle: CharacterBundle,
    options: ImportOptions,
) -> Result<i64, AppError> {
    eprintln!("APP DB: Importing bundle logic for {}", bundle.name);
    // 1. Check/Insert Character
    let existing_id: Option<i64> = tx
        .query_row(
            "SELECT id FROM \"character\" WHERE name = ?",
            params![bundle.name],
            |row| row.get(0),
        )
        .optional()?;

    let character_id = if let Some(id) = existing_id {
        if options.overwrite {
            tx.execute(
                "UPDATE \"character\" SET type=?, race=?, alignment=?, com_enabled=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                params![bundle.character_type, bundle.race, bundle.alignment, bundle.com_enabled, bundle.notes, id],
            )?;
            tx.execute(
                "DELETE FROM character_class WHERE character_id=?",
                params![id],
            )?;
            tx.execute(
                "DELETE FROM character_ability WHERE character_id=?",
                params![id],
            )?;
            id
        } else {
            let new_name = format!("{} (Imported)", bundle.name);
            tx.execute(
                "INSERT INTO \"character\" (name, type, race, alignment, com_enabled, notes) VALUES (?, ?, ?, ?, ?, ?)",
                params![new_name, bundle.character_type, bundle.race, bundle.alignment, bundle.com_enabled, bundle.notes],
            )?;
            tx.last_insert_rowid()
        }
    } else {
        tx.execute(
            "INSERT INTO \"character\" (name, type, race, alignment, com_enabled, notes) VALUES (?, ?, ?, ?, ?, ?)",
            params![bundle.name, bundle.character_type, bundle.race, bundle.alignment, bundle.com_enabled, bundle.notes],
        )?;
        tx.last_insert_rowid()
    };

    // 2. Insert Abilities
    if let Some(abilities) = bundle.abilities {
        tx.execute(
            "INSERT INTO character_ability (character_id, str, dex, con, int, wis, cha, com) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            params![character_id, abilities.str, abilities.dex, abilities.con, abilities.int, abilities.wis, abilities.cha, abilities.com],
        )?;
    }

    // 3. Insert Classes & Spells
    for class in bundle.classes {
        tx.execute(
            "INSERT INTO character_class (character_id, class_name, class_label, level) VALUES (?, ?, ?, ?)",
            params![character_id, class.class_name, class.class_label, class.level],
        )?;
        let class_id = tx.last_insert_rowid();

        for spell_entry in class.spells {
            let s = &spell_entry.spell;
            let spell_id: Option<i64> = tx
                .query_row(
                    "SELECT id FROM spell WHERE name = ? AND level = ? AND IFNULL(source, '') = ?",
                    params![s.name, s.level, s.source.as_deref().unwrap_or("")],
                    |row| row.get(0),
                )
                .optional()?;

            let final_spell_id = if let Some(sid) = spell_id {
                sid
            } else {
                let (canonical, hash, json) = canonicalize_spell_detail(s.clone())?;
                tx.execute(
                    "INSERT INTO spell (name, level, school, sphere, range, components, material_components,
                                        casting_time, duration, area, saving_throw, damage, magic_resistance,
                                        reversible, description, tags, source, edition, author, license,
                                        is_quest_spell, is_cantrip, class_list, canonical_data, content_hash,
                                        schema_version)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    params![
                        s.name, s.level, s.school, s.sphere, s.range, s.components, s.material_components,
                        s.casting_time, s.duration, s.area, s.saving_throw, s.damage, s.magic_resistance,
                        s.reversible, s.description,
                        s.tags, s.source, s.edition, s.author, s.license, s.is_quest_spell, s.is_cantrip, s.class_list,
                        json, hash, canonical.schema_version
                    ],
                )?;
                tx.last_insert_rowid()
            };

            tx.execute(
               "INSERT INTO character_class_spell (character_class_id, spell_id, list_type, notes) VALUES (?, ?, ?, ?)",
                params![class_id, final_spell_id, spell_entry.list_type, spell_entry.notes],
            )?;
        }
    }

    Ok(character_id)
}

fn record_import_artifact(
    tx: &rusqlite::Transaction,
    hash: &str,
    name: &str,
) -> Result<(), AppError> {
    let metadata = serde_json::json!({
        "characterName": name,
        "importMethod": "bundle"
    })
    .to_string();

    tx.execute(
        "INSERT INTO artifact (type, hash, metadata) VALUES (?, ?, ?)",
        params!["IMPORT_BUNDLE", hash, metadata],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn import_character_bundle(
    state: State<'_, Arc<Pool>>,
    bundle: CharacterBundle,
    options: ImportOptions,
) -> Result<i64, AppError> {
    eprintln!("APP CMD: import_character_bundle {}", bundle.name);
    let pool = state.inner().clone();
    let import_res = tokio::task::spawn_blocking(move || {
        // Compute hash of the bundle
        let bundle_json =
            serde_json::to_string(&bundle).map_err(|e| AppError::Import(e.to_string()))?;
        let mut hasher = Sha256::new();
        hasher.update(bundle_json.as_bytes());
        let result = hasher.finalize();
        let hash = hex::encode(result);

        let mut conn = pool.get()?;
        let tx = conn.transaction()?;
        let character_id = import_character_bundle_logic(&tx, bundle.clone(), options)?; // Clone needed

        record_import_artifact(&tx, &hash, &bundle.name)?;

        tx.commit()?;
        Ok::<i64, AppError>(character_id)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))?;
    let id = import_res?;

    Ok(id)
}

#[tauri::command]
pub async fn preview_character_markdown_zip(bytes: Vec<u8>) -> Result<CharacterBundle, AppError> {
    eprintln!(
        "APP CMD: preview_character_markdown_zip bytes={}",
        bytes.len()
    );
    let preview_res = tokio::task::spawn_blocking(move || {
        use std::io::Read;
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes))
            .map_err(|e| AppError::Import(format!("Zip error: {}", e)))?;

        let mut file = archive
            .by_name("character.yml")
            .map_err(|_| AppError::Import("character.yml not found in ZIP".to_string()))?;

        let mut yaml_content = String::new();
        file.read_to_string(&mut yaml_content)?;

        let bundle: CharacterBundle = serde_yaml::from_str(&yaml_content)
            .map_err(|e| AppError::Import(format!("YAML parse error: {}", e)))?;

        Ok::<CharacterBundle, AppError>(bundle)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))?;
    preview_res
}

#[tauri::command]
pub async fn import_character_markdown_zip(
    state: State<'_, Arc<Pool>>,
    bytes: Vec<u8>,
    options: ImportOptions,
) -> Result<i64, AppError> {
    eprintln!(
        "APP CMD: import_character_markdown_zip bytes={}",
        bytes.len()
    );
    let bundle = preview_character_markdown_zip(bytes.clone()).await?;

    let pool = state.inner().clone();
    let import_res = tokio::task::spawn_blocking(move || {
        // Compute hash of raw zip bytes
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        let result = hasher.finalize();
        let hash = hex::encode(result);

        let mut conn = pool.get()?;
        let tx = conn.transaction()?;
        let character_id = import_character_bundle_logic(&tx, bundle.clone(), options)?;

        record_import_artifact(&tx, &hash, &bundle.name)?;

        tx.commit()?;
        Ok::<i64, AppError>(character_id)
    })
    .await
    .map_err(|e| AppError::Unknown(e.to_string()))?;
    let id = import_res?;

    Ok(id)
}
