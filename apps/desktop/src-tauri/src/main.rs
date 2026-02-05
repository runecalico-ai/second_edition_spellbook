use spellbook_desktop::db::{app_data_dir, init_db};
use spellbook_desktop::utils::migration_manager;
use std::env;

fn main() {
    let args: Vec<String> = env::args().collect();

    if args.contains(&"--check-integrity".to_string()) {
        println!("Initializing DB for integrity check...");
        let pool = init_db(None, false).expect("Failed to init DB");
        let conn = pool.get().expect("Failed to get connection");
        migration_manager::check_integrity(&conn).expect("Integrity check failed");
        return;
    }

    if args.contains(&"--detect-collisions".to_string()) {
        println!("Initializing DB for collision detection...");
        let pool = init_db(None, false).expect("Failed to init DB");
        let conn = pool.get().expect("Failed to get connection");
        migration_manager::detect_collisions(&conn).expect("Collision detection failed");
        return;
    }

    if args.contains(&"--recompute-hashes".to_string()) {
        println!("Initializing DB for hash re-computation...");
        let pool = init_db(None, false).expect("Failed to init DB");
        let conn = pool.get().expect("Failed to get connection");
        let data_dir = app_data_dir().expect("Failed to get data dir");
        migration_manager::recompute_all_hashes(&conn, &data_dir).expect("Recompute failed");
        return;
    }

    if args.contains(&"--export-migration-report".to_string()) {
        let data_dir = app_data_dir().expect("Failed to get data dir");
        migration_manager::export_migration_report(&data_dir).expect("Export failed");
        return;
    }

    if args.contains(&"--list-backups".to_string()) {
        let data_dir = app_data_dir().expect("Failed to get data dir");
        let backups = migration_manager::list_backups(&data_dir).expect("Failed to list backups");
        println!("Available Backups:");
        for backup in backups {
            println!(" - {:?}", backup.file_name().unwrap_or_default());
        }
        return;
    }

    if args.contains(&"--rollback-migration".to_string()) {
        println!("Rolling back to latest backup...");
        let pool = init_db(None, false).expect("Failed to init DB");
        let mut conn = pool.get().expect("Failed to get connection");
        let data_dir = app_data_dir().expect("Failed to get data dir");
        migration_manager::rollback_migration(&mut conn, &data_dir).expect("Rollback failed");
        return;
    }

    if let Some(pos) = args.iter().position(|x| x == "--restore-backup") {
        if let Some(file_path) = args.get(pos + 1) {
            println!("Restoring backup: {}...", file_path);
            let pool = init_db(None, false).expect("Failed to init DB");
            let mut conn = pool.get().expect("Failed to get connection");
            let path = std::path::PathBuf::from(file_path);
            migration_manager::restore_backup(&mut conn, &path).expect("Restore failed");
            return;
        } else {
            eprintln!("Error: --restore-backup requires a file path argument.");
            return;
        }
    }

    spellbook_desktop::run();
}
