use spellbook_desktop::db::{app_data_dir, init_db};
use spellbook_desktop::utils::migration_manager;
use std::env;
use tracing::{error, info};
use tracing_subscriber::{fmt, EnvFilter};

fn init_logging() {
    let _ = fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .try_init();
}

fn main() {
    init_logging();
    let args: Vec<String> = env::args().collect();

    if args.contains(&"--check-integrity".to_string()) {
        info!("Initializing DB for integrity check");
        let pool = init_db(None, false).expect("Failed to init DB");
        let conn = pool.get().expect("Failed to get connection");
        migration_manager::check_integrity(&conn).expect("Integrity check failed");
        return;
    }

    if args.contains(&"--detect-collisions".to_string()) {
        info!("Initializing DB for collision detection");
        let pool = init_db(None, false).expect("Failed to init DB");
        let conn = pool.get().expect("Failed to get connection");
        migration_manager::detect_collisions(&conn).expect("Collision detection failed");
        return;
    }

    if args.contains(&"--recompute-hashes".to_string()) {
        info!("Initializing DB for hash re-computation");
        let pool = init_db(None, false).expect("Failed to init DB");
        let conn = pool.get().expect("Failed to get connection");
        let data_dir = app_data_dir().expect("Failed to get data dir");
        migration_manager::recompute_all_hashes(&conn, &data_dir).expect("Recompute failed");
        return;
    }

    if args.contains(&"--export-migration-report".to_string()) {
        let pool = init_db(None, false).expect("Failed to init DB");
        let conn = pool.get().expect("Failed to get connection");
        let data_dir = app_data_dir().expect("Failed to get data dir");
        migration_manager::export_migration_report(&conn, &data_dir).expect("Export failed");
        return;
    }

    if args.contains(&"--list-backups".to_string()) {
        let data_dir = app_data_dir().expect("Failed to get data dir");
        let backups = migration_manager::list_backups(&data_dir).expect("Failed to list backups");
        info!("Available Backups");
        for backup in backups {
            info!(file = ?backup.file_name().unwrap_or_default(), "backup");
        }
        return;
    }

    if args.contains(&"--rollback-migration".to_string()) {
        info!("Rolling back to latest backup");
        let pool = init_db(None, false).expect("Failed to init DB");
        let mut conn = pool.get().expect("Failed to get connection");
        let data_dir = app_data_dir().expect("Failed to get data dir");
        migration_manager::rollback_migration(&mut conn, &data_dir).expect("Rollback failed");
        return;
    }

    if let Some(pos) = args.iter().position(|x| x == "--restore-backup") {
        if let Some(file_path) = args.get(pos + 1) {
            info!(file_path, "Restoring backup");
            let pool = init_db(None, false).expect("Failed to init DB");
            let mut conn = pool.get().expect("Failed to get connection");
            let path = std::path::PathBuf::from(file_path);
            migration_manager::restore_backup(&mut conn, &path).expect("Restore failed");
            return;
        } else {
            error!("--restore-backup requires a file path argument");
            return;
        }
    }

    spellbook_desktop::run();
}
