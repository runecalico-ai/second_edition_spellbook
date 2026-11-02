//! Guards the webview IPC ACL that `tauri-build` compiles from `capabilities/`.
//!
//! Without a capability, Tauri v2 rejects every core/plugin command from the
//! webview (`plugin:event|listen`, `plugin:dialog|open`, `plugin:fs|write_file`, ...)
//! while app-defined commands keep working, so chat streaming, file pickers and
//! character export fail only at runtime.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use tauri::http::{HeaderMap, HeaderValue};
use tauri::ipc::{CallbackFn, InvokeBody};
use tauri::test::{get_ipc_response, mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_fs::FsExt;

const MAIN_WINDOW: &str = "main";

const EXPECTED_PERMISSIONS: &[&str] = &[
    "core:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "fs:allow-write-file",
    "fs:allow-write-text-file",
];

fn capability_file() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("capabilities")
        .join("default.json")
}

fn build_app() -> (App<MockRuntime>, WebviewWindow<MockRuntime>) {
    let app = mock_builder()
        .plugin(tauri_plugin_fs::init())
        .build(tauri::generate_context!(test = true))
        .expect("failed to build ACL test app");
    let webview = WebviewWindowBuilder::new(&app, MAIN_WINDOW, WebviewUrl::default())
        .build()
        .expect("failed to build main webview");
    (app, webview)
}

fn invoke(
    webview: &WebviewWindow<MockRuntime>,
    cmd: &str,
    body: InvokeBody,
    headers: HeaderMap,
) -> Result<(), String> {
    let request = InvokeRequest {
        cmd: cmd.to_string(),
        callback: CallbackFn(0),
        error: CallbackFn(1),
        url: webview.url().expect("main webview url"),
        body,
        headers,
        invoke_key: INVOKE_KEY.to_string(),
    };
    get_ipc_response(webview, request)
        .map(|_| ())
        .map_err(|err| match err {
            serde_json::Value::String(message) => message,
            other => other.to_string(),
        })
}

fn is_acl_denial(message: &str) -> bool {
    message.contains("not allowed by ACL")
        || message.contains("not allowed on window")
        || message.contains("not allowed on origin")
        || message.contains(" not allowed. ")
        || message.contains("explicitly denied")
}

fn percent_encode_path(path: &Path) -> String {
    path.to_string_lossy()
        .bytes()
        .map(|byte| {
            if byte.is_ascii_alphanumeric() || b"-_.~".contains(&byte) {
                (byte as char).to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect()
}

fn write_text_file(webview: &WebviewWindow<MockRuntime>, path: &Path) -> Result<(), String> {
    let mut headers = HeaderMap::new();
    headers.insert(
        "path",
        HeaderValue::from_str(&percent_encode_path(path)).expect("ascii path header"),
    );
    invoke(
        webview,
        "plugin:fs|write_text_file",
        InvokeBody::Raw(b"{\"ok\":true}".to_vec()),
        headers,
    )
}

#[test]
fn default_capability_targets_main_window_with_minimal_permissions() {
    let raw = std::fs::read_to_string(capability_file())
        .expect("capabilities/default.json must exist so tauri-build grants webview IPC");
    let capability: serde_json::Value =
        serde_json::from_str(&raw).expect("capability file is valid JSON");

    let windows: Vec<&str> = capability["windows"]
        .as_array()
        .expect("capability lists windows")
        .iter()
        .filter_map(|w| w.as_str())
        .collect();
    assert!(
        windows.contains(&MAIN_WINDOW),
        "capability must cover the default `main` window, got {windows:?}"
    );

    let permissions: BTreeSet<&str> = capability["permissions"]
        .as_array()
        .expect("capability lists permissions")
        .iter()
        .map(|p| p.as_str().expect("permissions are plain identifiers"))
        .collect();
    let expected: BTreeSet<&str> = EXPECTED_PERMISSIONS.iter().copied().collect();
    assert_eq!(
        permissions, expected,
        "capability permissions changed; keep fs/dialog grants minimal"
    );
}

#[test]
fn main_window_may_listen_and_unlisten_events() {
    let (_app, webview) = build_app();

    invoke(
        &webview,
        "plugin:event|listen",
        InvokeBody::Json(serde_json::json!({
            "event": "llm://token/acl-test",
            "target": { "kind": "Any" },
            "handler": 7,
        })),
        HeaderMap::new(),
    )
    .expect("plugin:event|listen must be allowed for chat token streaming");

    invoke(
        &webview,
        "plugin:event|unlisten",
        InvokeBody::Json(serde_json::json!({
            "event": "llm://token/acl-test",
            "eventId": 0,
        })),
        HeaderMap::new(),
    )
    .expect("plugin:event|unlisten must be allowed");
}

#[test]
fn main_window_may_open_and_save_dialogs_but_not_message_dialogs() {
    // The dialog plugin is not registered here, so a request that clears the ACL
    // fails with "plugin dialog not found" instead of opening a native dialog.
    let (_app, webview) = build_app();

    for cmd in ["plugin:dialog|open", "plugin:dialog|save"] {
        let err = invoke(
            &webview,
            cmd,
            InvokeBody::Json(serde_json::json!({ "options": {} })),
            HeaderMap::new(),
        )
        .expect_err("unregistered dialog plugin cannot succeed");
        assert!(!is_acl_denial(&err), "{cmd} rejected by ACL: {err}");
        assert_eq!(err, "plugin dialog not found", "{cmd}");
    }

    let err = invoke(
        &webview,
        "plugin:dialog|message",
        InvokeBody::Json(serde_json::json!({ "message": "x" })),
        HeaderMap::new(),
    )
    .expect_err("message dialogs are not granted");
    assert!(is_acl_denial(&err), "expected ACL denial, got: {err}");
}

#[test]
fn fs_writes_are_limited_to_paths_granted_at_runtime() {
    let (app, webview) = build_app();
    let dir = std::env::temp_dir().join(format!("spellbook-acl-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let target = dir.join("export.json");

    let err = write_text_file(&webview, &target)
        .expect_err("static fs scope is empty; unpicked paths must be refused");
    assert!(
        err.contains("forbidden path"),
        "write_text_file must clear the ACL and stop at the fs scope, got: {err}"
    );
    assert!(!target.exists());

    // Mirrors what `plugin:dialog|save` does with the user-selected path.
    app.fs_scope().allow_file(&target).unwrap();
    write_text_file(&webview, &target).expect("dialog-granted path is writable");
    assert_eq!(std::fs::read_to_string(&target).unwrap(), "{\"ok\":true}");

    let err = invoke(
        &webview,
        "plugin:fs|read_text_file",
        InvokeBody::Json(serde_json::json!({ "path": target })),
        HeaderMap::new(),
    )
    .expect_err("fs reads are not granted");
    assert!(is_acl_denial(&err), "expected ACL denial, got: {err}");

    let _ = std::fs::remove_dir_all(&dir);
}
