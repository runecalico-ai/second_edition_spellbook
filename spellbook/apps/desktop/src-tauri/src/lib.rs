pub mod commands;
pub mod db;
pub mod error;
pub mod models;
pub mod sidecar;

use commands::*;
use db::init_db;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let resource_dir_override = std::env::var("SPELLBOOK_SQLITE_VEC_RESOURCE_DIR").ok();
            let resource_dir = resource_dir_override
                .as_deref()
                .map(PathBuf::from)
                .or_else(|| app.path().resource_dir().ok());

            let pool = init_db(resource_dir.as_deref())
                .map_err(|e| Box::new(e) as Box<dyn std::error::Error>)?;
            app.manage(Arc::new(pool));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_spell,
            list_spells,
            create_spell,
            update_spell,
            delete_spell,
            upsert_spell,
            list_characters,
            create_character,
            get_character_spellbook,
            update_character_spell,
            remove_character_spell,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
