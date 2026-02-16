pub mod commands;
pub mod db;
pub mod error;
pub mod models;
pub mod sidecar;
pub mod utils;

use commands::*;
use db::init_db;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use tracing_subscriber::{fmt, EnvFilter};

fn init_logging() {
    let _ = fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .try_init();
}

pub fn run() {
    init_logging();
    tauri::Builder::default()
        .setup(|app| {
            let resource_dir_override = std::env::var("SPELLBOOK_SQLITE_VEC_RESOURCE_DIR").ok();
            let resource_dir = resource_dir_override
                .as_deref()
                .map(PathBuf::from)
                .or_else(|| app.path().resource_dir().ok());

            let pool = init_db(resource_dir.as_deref(), true)
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
            app.manage(Arc::new(pool));
            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            get_spell,
            parse_spell_range,
            parse_spell_duration,
            parse_spell_casting_time,
            parse_spell_area,
            parse_spell_damage,
            parse_spell_components,
            parse_spell_components_with_migration,
            parse_spell_material_components,
            extract_materials_from_components_line,
            list_spells,
            create_spell,
            update_spell,
            delete_spell,
            upsert_spell,
            list_characters,
            create_character,
            update_character_details,
            delete_character,
            get_character,
            get_character_abilities,
            update_character_abilities,
            get_character_classes,
            add_character_class,
            update_character_class_level,
            remove_character_class,
            get_character_class_spells,
            add_character_spell,
            remove_character_spell,
            update_character_spell_notes,
            get_character_spellbook,
            update_character_spell,
            search_keyword,
            search_semantic,
            list_facets,
            save_search,
            list_saved_searches,
            delete_saved_search,
            chat_answer,
            preview_import,
            import_files,
            resolve_import_conflicts,
            reparse_artifact,
            export_spells,
            print_spell,
            print_spellbook,
            backup_vault,
            restore_vault,
            export_character_bundle,
            export_character_markdown_zip,
            import_character_bundle,
            preview_character_markdown_zip,
            import_character_markdown_zip,
            export_character_sheet,
            export_character_spellbook_pack,
            search_characters,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
