pub mod commands;
pub mod db;
pub mod error;
pub mod models;
pub mod sidecar;
pub mod utils;

use commands::vault::VaultMaintenanceState;
use commands::ProvisioningState;
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
            app.manage(Arc::new(VaultMaintenanceState::default()));
            app.manage(Arc::new(ProvisioningState::default()));
            app.manage(Arc::new(LlmState::default()));
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
            remove_character_spell_by_hash,
            upgrade_character_class_spell,
            #[cfg(debug_assertions)]
            test_seed_character_with_upgradeable_spell,
            update_character_spell_notes,
            #[cfg(debug_assertions)]
            test_seed_spell,
            #[cfg(debug_assertions)]
            test_seed_conflicted_spell,
            #[cfg(debug_assertions)]
            test_seed_character_with_orphan_spell,
            get_character_spellbook,
            update_character_spell,
            search_keyword,
            search_semantic,
            list_facets,
            save_search,
            list_saved_searches,
            delete_saved_search,
            chat_answer,
            llm_status,
            llm_download_model,
            llm_import_model_file,
            llm_cancel_download,
            llm_cancel_generation,
            llm_chat,
            preview_import,
            preview_import_spell_json,
            import_spell_json,
            resolve_import_spell_json,
            import_files,
            resolve_import_conflicts,
            reparse_artifact,
            export_spells,
            export_spell_as_json,
            export_spell_bundle_json,
            print_spell,
            print_spellbook,
            backup_vault,
            restore_vault,
            get_vault_settings,
            run_vault_integrity_check,
            set_import_source_ref_url_policy,
            set_vault_integrity_check_on_open,
            optimize_vault,
            export_character_bundle,
            export_character_markdown_zip,
            import_character_bundle,
            preview_character_markdown_zip,
            import_character_markdown_zip,
            export_character_sheet,
            export_character_spellbook_pack,
            search_characters,
            // Prerequisite for ecosystem hash integration (Migration 0015, hash-based import/export).
            crate::models::canonical_spell::migrate_all_spells_to_v2,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
pub(crate) struct LlmCommandSmokeApp {
    _app: tauri::App<tauri::test::MockRuntime>,
    webview: tauri::WebviewWindow<tauri::test::MockRuntime>,
}

#[cfg(test)]
pub(crate) fn build_llm_command_smoke_app(
    llm_state: Arc<LlmState>,
    provisioning: Arc<ProvisioningState>,
) -> LlmCommandSmokeApp {
    let app = tauri::test::mock_builder()
        .manage(llm_state)
        .manage(provisioning)
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            chat_answer,
            llm_status,
            llm_download_model,
            llm_import_model_file,
            llm_cancel_download,
            llm_cancel_generation,
            llm_chat,
        ])
        .build(tauri::test::mock_context(tauri::test::noop_assets()))
        .expect("failed to build LLM smoke app");

    let webview = tauri::WebviewWindowBuilder::new(&app, "smoke-main", Default::default())
        .build()
        .expect("failed to build LLM smoke webview");

    LlmCommandSmokeApp { _app: app, webview }
}

#[cfg(test)]
pub(crate) async fn invoke_smoke_command<T>(
    webview: tauri::WebviewWindow<tauri::test::MockRuntime>,
    command: &str,
    body: serde_json::Value,
) -> Result<T, serde_json::Value>
where
    T: serde::de::DeserializeOwned + Send + 'static,
{
    let request = tauri::webview::InvokeRequest {
        cmd: command.to_string(),
        callback: tauri::ipc::CallbackFn(0),
        error: tauri::ipc::CallbackFn(1),
        url: "http://tauri.localhost".parse().unwrap(),
        body: tauri::ipc::InvokeBody::Json(body),
        headers: Default::default(),
        invoke_key: tauri::test::INVOKE_KEY.to_string(),
    };

    tokio::task::spawn_blocking(move || tauri::test::get_ipc_response(&webview, request))
        .await
        .unwrap()
        .map(|response_body| response_body.deserialize::<T>().unwrap())
}

#[cfg(test)]
pub(crate) fn listen_smoke_event<T>(
    webview: &tauri::WebviewWindow<tauri::test::MockRuntime>,
    event_name: &str,
) -> tokio::sync::mpsc::UnboundedReceiver<T>
where
    T: serde::de::DeserializeOwned + Send + 'static,
{
    use tauri::Listener;

    let (tx, rx) = tokio::sync::mpsc::unbounded_channel();
    webview.listen(event_name.to_string(), move |event| {
        let payload = serde_json::from_str::<T>(event.payload()).unwrap();
        tx.send(payload).unwrap();
    });
    rx
}

#[cfg(test)]
mod llm_command_smoke_tests {
    use super::{build_llm_command_smoke_app, invoke_smoke_command, listen_smoke_event};
    use crate::commands::llm::{
        install_test_download_driver, install_test_model_load_preflight,
        install_test_runtime_driver, DownloadTargetPrep, LlmDownloadDriver,
        LlmDownloadDriverFuture, LlmState, LlmSystemRequirementsSnapshot, ModelLoadPreflight,
        RecordingRuntimeDriver, StartedReprovisionResult,
    };
    use crate::commands::provisioning::{
        ProvisioningState, BASELINE_MIN_FREE_DISK_BYTES, BASELINE_MIN_FREE_RAM_BYTES,
    };
    use crate::models::{ChatResponse, DoneEvent, LlmStatus, LlmStatusResponse, TokenEvent};
    use std::sync::Arc;
    use tokio::time::{timeout, Duration};

    #[derive(Clone, Default)]
    struct PausedSmokeDownloadDriver {
        started_after_begin_download: Arc<tokio::sync::Notify>,
        release_result: Arc<tokio::sync::Notify>,
    }

    impl LlmDownloadDriver for PausedSmokeDownloadDriver {
        fn run_started_download(
            &self,
            _app: tauri::AppHandle,
            _state: Arc<LlmState>,
            mut cancel_rx: tokio::sync::watch::Receiver<bool>,
            _target_prep: DownloadTargetPrep,
            _temp_path: std::path::PathBuf,
            _final_path: std::path::PathBuf,
        ) -> LlmDownloadDriverFuture {
            let driver = self.clone();
            Box::pin(async move {
                driver.started_after_begin_download.notify_waiters();
                let _ = cancel_rx.changed().await;
                driver.release_result.notified().await;
                StartedReprovisionResult::Cancelled
            })
        }
    }

    #[derive(Clone, Default)]
    struct ReadySmokeDownloadDriver;

    impl LlmDownloadDriver for ReadySmokeDownloadDriver {
        fn run_started_download(
            &self,
            _app: tauri::AppHandle,
            _state: Arc<LlmState>,
            _cancel_rx: tokio::sync::watch::Receiver<bool>,
            _target_prep: DownloadTargetPrep,
            _temp_path: std::path::PathBuf,
            final_path: std::path::PathBuf,
        ) -> LlmDownloadDriverFuture {
            Box::pin(async move {
                if let Some(parent) = final_path.parent() {
                    std::fs::create_dir_all(parent).unwrap();
                }
                std::fs::write(&final_path, b"smoke").unwrap();
                StartedReprovisionResult::Ready
            })
        }
    }

    #[tokio::test]
    async fn llm_cancel_download_command_waits_for_in_flight_download_completion() {
        let llm_state = Arc::new(LlmState::default());
        let provisioning = Arc::new(ProvisioningState::default());
        let driver = PausedSmokeDownloadDriver::default();
        let _driver_guard = install_test_download_driver(Arc::new(driver.clone()));

        let smoke = build_llm_command_smoke_app(Arc::clone(&llm_state), Arc::clone(&provisioning));

        let started = driver.started_after_begin_download.notified();
        let download_future = tokio::spawn(invoke_smoke_command::<()>(
            smoke.webview.clone(),
            "llm_download_model",
            serde_json::json!({}),
        ));
        started.await;

        let mut cancel_future = tokio::spawn(invoke_smoke_command::<()>(
            smoke.webview.clone(),
            "llm_cancel_download",
            serde_json::json!({}),
        ));
        assert!(timeout(Duration::from_millis(10), &mut cancel_future)
            .await
            .is_err());

        driver.release_result.notify_waiters();

        assert!(download_future.await.unwrap().is_ok());
        cancel_future.await.unwrap().unwrap();

        let status = invoke_smoke_command::<LlmStatusResponse>(
            smoke.webview.clone(),
            "llm_status",
            serde_json::json!({}),
        )
        .await
        .unwrap();
        assert_ne!(status.status, LlmStatus::Downloading);
    }

    #[tokio::test]
    async fn llm_chat_command_emits_token_and_done_events_through_app_event_sink() {
        let llm_state = Arc::new(LlmState::default());
        let provisioning = Arc::new(ProvisioningState::default());
        let _preflight_guard = install_test_model_load_preflight(ModelLoadPreflight {
            model_path: std::path::PathBuf::from(
                "C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
            ),
            approved_model_present: true,
            requirements: LlmSystemRequirementsSnapshot {
                free_disk_bytes: BASELINE_MIN_FREE_DISK_BYTES,
                free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES,
            },
        });
        let _driver_guard =
            install_test_runtime_driver(Arc::new(RecordingRuntimeDriver::default()));

        let smoke = build_llm_command_smoke_app(Arc::clone(&llm_state), Arc::clone(&provisioning));
        let mut token_events =
            listen_smoke_event::<TokenEvent>(&smoke.webview, "llm://token/smoke-1");
        let mut done_events = listen_smoke_event::<DoneEvent>(&smoke.webview, "llm://done/smoke-1");

        invoke_smoke_command::<()>(
            smoke.webview.clone(),
            "llm_chat",
            serde_json::json!({
                "message": "hello",
                "streamId": "smoke-1",
            }),
        )
        .await
        .unwrap();

        let token = token_events.recv().await.unwrap();
        assert_eq!(token.token, "ok");

        let done = done_events.recv().await.unwrap();
        assert_eq!(done.full_response, "ok");
        assert!(!done.cancelled);
    }

    #[tokio::test]
    async fn registered_llm_commands_observe_same_app_managed_llm_state() {
        let llm_state = Arc::new(LlmState::default());
        let provisioning = Arc::new(ProvisioningState::default());
        let _download_driver_guard =
            install_test_download_driver(Arc::new(ReadySmokeDownloadDriver::default()));

        *llm_state.status.lock().unwrap() = LlmStatus::Error;
        *llm_state.last_error.lock().unwrap() = Some("sticky".to_string());

        let smoke = build_llm_command_smoke_app(Arc::clone(&llm_state), Arc::clone(&provisioning));

        let status = invoke_smoke_command::<LlmStatusResponse>(
            smoke.webview.clone(),
            "llm_status",
            serde_json::json!({}),
        )
        .await
        .unwrap();
        assert_eq!(status.status, LlmStatus::Error);

        let download_future = tokio::spawn(invoke_smoke_command::<()>(
            smoke.webview.clone(),
            "llm_download_model",
            serde_json::json!({}),
        ));
        assert!(download_future.await.unwrap().is_ok());

        let status_after_download = invoke_smoke_command::<LlmStatusResponse>(
            smoke.webview.clone(),
            "llm_status",
            serde_json::json!({}),
        )
        .await
        .unwrap();
        assert_eq!(status_after_download.status, LlmStatus::Ready);
    }

    #[tokio::test]
    async fn chat_answer_compat_wrapper_returns_expected_payload_shape() {
        let llm_state = Arc::new(LlmState::default());
        let provisioning = Arc::new(ProvisioningState::default());
        let _preflight_guard = install_test_model_load_preflight(ModelLoadPreflight {
            model_path: std::path::PathBuf::from(
                "C:/SpellbookVault/models/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf",
            ),
            approved_model_present: true,
            requirements: LlmSystemRequirementsSnapshot {
                free_disk_bytes: BASELINE_MIN_FREE_DISK_BYTES,
                free_ram_bytes: BASELINE_MIN_FREE_RAM_BYTES,
            },
        });
        let _driver_guard = install_test_runtime_driver(Arc::new(RecordingRuntimeDriver));

        let smoke = build_llm_command_smoke_app(Arc::clone(&llm_state), Arc::clone(&provisioning));

        let response = invoke_smoke_command::<ChatResponse>(
            smoke.webview.clone(),
            "chat_answer",
            serde_json::json!({
                "prompt": "hello",
            }),
        )
        .await
        .unwrap();

        assert_eq!(response.answer, "ok");
        assert!(response.citations.is_empty());
        assert_eq!(
            response.meta,
            serde_json::json!({"source": "llm_chat_compat"})
        );
    }
}
