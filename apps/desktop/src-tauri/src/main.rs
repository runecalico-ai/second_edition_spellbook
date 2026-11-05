#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

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

const MAINTENANCE_FLAGS: &[&str] = &[
    "--check-integrity",
    "--detect-collisions",
    "--recompute-hashes",
    "--export-migration-report",
    "--list-backups",
    "--rollback-migration",
    "--restore-backup",
];

fn is_maintenance_invocation(args: &[String]) -> bool {
    args.iter()
        .skip(1)
        .any(|arg| MAINTENANCE_FLAGS.contains(&arg.as_str()))
}

/// Windows release builds use the GUI subsystem and start without a console, so
/// maintenance flags attach to the console of the terminal that launched them.
#[cfg(all(windows, not(debug_assertions)))]
fn attach_parent_console() {
    use std::ffi::c_void;
    use std::os::windows::io::IntoRawHandle;

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn AttachConsole(process_id: u32) -> i32;
        fn GetStdHandle(std_handle: u32) -> *mut c_void;
        fn SetStdHandle(std_handle: u32, handle: *mut c_void) -> i32;
    }
    const ATTACH_PARENT_PROCESS: u32 = u32::MAX;
    const STD_OUTPUT_HANDLE: u32 = 0xFFFF_FFF5;
    const STD_ERROR_HANDLE: u32 = 0xFFFF_FFF4;

    // SAFETY: plain Win32 calls; the CONOUT$ handle is intentionally kept for the
    // life of the process because it becomes the process's stdout/stderr.
    unsafe {
        if AttachConsole(ATTACH_PARENT_PROCESS) == 0 {
            return;
        }
        for std_handle in [STD_OUTPUT_HANDLE, STD_ERROR_HANDLE] {
            let current = GetStdHandle(std_handle);
            if !current.is_null() && current as isize != -1 {
                continue;
            }
            if let Ok(console) = std::fs::OpenOptions::new().write(true).open("CONOUT$") {
                SetStdHandle(std_handle, console.into_raw_handle());
            }
        }
    }
}

#[cfg(not(all(windows, not(debug_assertions))))]
fn attach_parent_console() {}

fn main() {
    let args: Vec<String> = env::args().collect();
    if is_maintenance_invocation(&args) {
        attach_parent_console();
    }
    init_logging();

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

#[cfg(test)]
mod tests {
    use super::{is_maintenance_invocation, MAINTENANCE_FLAGS};

    fn args(list: &[&str]) -> Vec<String> {
        list.iter().map(|arg| arg.to_string()).collect()
    }

    #[test]
    fn maintenance_flags_request_a_console() {
        for flag in MAINTENANCE_FLAGS {
            assert!(
                is_maintenance_invocation(&args(&["spellbook-desktop.exe", flag])),
                "{flag} must attach to the parent console"
            );
        }
    }

    #[test]
    fn normal_launch_does_not_request_a_console() {
        assert!(!is_maintenance_invocation(&args(&[
            "spellbook-desktop.exe"
        ])));
        assert!(!is_maintenance_invocation(&args(&[
            "spellbook-desktop.exe",
            "--unknown"
        ])));
    }

    #[test]
    fn program_path_is_not_treated_as_a_flag() {
        assert!(!is_maintenance_invocation(&args(&["--list-backups"])));
    }

    #[test]
    fn every_flag_main_handles_is_a_maintenance_flag() {
        let source = include_str!("main.rs")
            .split("#[cfg(test)]")
            .next()
            .expect("main.rs source");
        for (index, _) in source.match_indices("\"--") {
            let flag: String = source[index + 1..]
                .chars()
                .take_while(|c| *c != '"' && !c.is_whitespace())
                .collect();
            assert!(
                MAINTENANCE_FLAGS.contains(&flag.as_str()),
                "{flag} is handled in main() but missing from MAINTENANCE_FLAGS"
            );
        }
    }
}
