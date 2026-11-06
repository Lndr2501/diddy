#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// mod menu;

use tauri::{webview::{NewWindowResponse, WebviewWindowBuilder}, Manager, WebviewUrl, TitleBarStyle};
mod app_icon;
mod diag;
mod connections;
mod myinstants;
#[cfg(target_os = "macos")]
mod system_audio;

use tauri::utils::config::BackgroundThrottlingPolicy;
use tauri_plugin_opener::OpenerExt;

const APP_PORT: u16 = 44548;

#[cfg(feature = "updater")]
use tauri_plugin_updater::UpdaterExt;
#[cfg(feature = "updater")]
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

/// macOS: WKWebView ships with `navigator.mediaDevices` (getUserMedia) switched off, which makes
/// Element Call hang forever on "Join", and fullscreen is off. Flip the WebKit switches before the page loads.
#[cfg(target_os = "macos")]
fn media_enabled_webview_configuration(profile: Option<[u8; 16]>) -> Result<objc2::rc::Retained<objc2_web_kit::WKWebViewConfiguration>, String> {
    use objc2::{msg_send, runtime::{Bool, NSObjectProtocol}, sel, MainThreadMarker};
    use objc2_web_kit::{WKWebViewConfiguration, WKWebsiteDataStore};
    use objc2_foundation::NSUUID;

    let mtm = MainThreadMarker::new().expect("webview setup must run on the main thread");
    // Private WKPreferences setters. Guard with respondsToSelector so a future WebKit that
    // drops them degrades to the old behaviour instead of crashing.
    unsafe {
        let config = WKWebViewConfiguration::new(mtm);
        if let Some(identifier) = profile {
            let supported: Bool = msg_send![objc2::class!(WKWebsiteDataStore), respondsToSelector: sel!(dataStoreForIdentifier:)];
            if !supported.as_bool() {
                return Err("Getrennte Anmeldungen benötigen macOS 14 oder neuer. Dein bisheriges Konto wurde nicht verändert.".into());
            }
            // Wry ignores data_store_identifier when a custom WK configuration is supplied.
            // Set the actual store here; never reuse the original account's default store.
            let identifier = NSUUID::from_bytes(identifier);
            let store = WKWebsiteDataStore::dataStoreForIdentifier(&identifier, mtm);
            config.setWebsiteDataStore(&store);
            let selected = config.websiteDataStore();
            let default_store = WKWebsiteDataStore::defaultDataStore(mtm);
            if std::ptr::eq(&*selected, &*default_store) || !std::ptr::eq(&*selected, &*store) {
                return Err("Getrennte Anmeldung konnte nicht sicher isoliert werden. Dein bisheriges Konto wurde nicht verändert.".into());
            }
        }
        let prefs = config.preferences();
        if prefs.respondsToSelector(sel!(_setMediaDevicesEnabled:)) {
            let _: () = msg_send![&*prefs, _setMediaDevicesEnabled: Bool::YES];
        }
        if prefs.respondsToSelector(sel!(_setPeerConnectionEnabled:)) {
            let _: () = msg_send![&*prefs, _setPeerConnectionEnabled: Bool::YES];
        }
        // Element fullscreen (a stream tile, videos). Off by default in WKWebView; Tauri only turns
        // it on with its `macos-private-api` feature, so do it here. Public API on macOS 12.3+,
        // the private setter covers older systems.
        if prefs.respondsToSelector(sel!(setElementFullscreenEnabled:)) {
            let _: () = msg_send![&*prefs, setElementFullscreenEnabled: Bool::YES];
        } else if prefs.respondsToSelector(sel!(_setFullScreenEnabled:)) {
            let _: () = msg_send![&*prefs, _setFullScreenEnabled: Bool::YES];
        }
        Ok(config)
    }
}

pub(crate) fn build_client_window(
    app: &tauri::AppHandle,
    label: &str,
    profile: Option<&connections::ConnectionProfile>,
) -> Result<(), String> {
    let port = APP_PORT;
    #[cfg(debug_assertions)]
    let window_url = WebviewUrl::App(Default::default());
    #[cfg(not(debug_assertions))]
    let window_url = WebviewUrl::External(format!("http://localhost:{port}").parse().unwrap());
    let app_handle = app.clone();
    let title = profile.map(|p| format!("Diddy · {}", p.server)).unwrap_or_else(|| "Diddy".into());
    let window_builder = WebviewWindowBuilder::new(app, label.to_string(), window_url)
        .title(title)
        .disable_drag_drop_handler()
        .background_throttling(BackgroundThrottlingPolicy::Disabled)
        .on_new_window(move |url, _features| {
            let _ = app_handle.opener().open_url(url.as_str(), None::<&str>);
            NewWindowResponse::Deny
        });
    let window_builder = if let Some(profile) = profile {
        let metadata = serde_json::to_string(profile).map_err(|_| "Verbindung konnte nicht vorbereitet werden.".to_string())?;
        window_builder.initialization_script(format!(
            "Object.defineProperty(window,'__DIDDY_CONNECTION__',{{value:Object.freeze({metadata})}});"
        ))
    } else { window_builder };
    #[cfg(not(target_os = "macos"))]
    let window_builder = if let Some(profile) = profile {
        use tauri::Manager;
        window_builder.data_directory(app.path().app_data_dir()
            .map_err(|_| "Profilverzeichnis nicht verfügbar.".to_string())?
            .join("connections").join(&profile.id))
    } else { window_builder };
    #[cfg(target_os = "macos")]
    let window_builder = {
        // Reopening a saved connection must not accumulate permanent bridge listener threads.
        // One bridge per saved window is reused; the connection registry is capped at 20 entries.
        let state = app.state::<connections::ConnectionState>();
        let mut bridges = state.audio_bridges.lock().map_err(|_| "Audio-Brücke ist belegt.".to_string())?;
        if !bridges.contains_key(label) {
            if let Ok(bridge) = system_audio::spawn(vec![format!("http://localhost:{port}"), "http://localhost:8080".to_string()]) {
                bridges.insert(label.to_string(), bridge);
            }
        }
        match bridges.get(label) {
            Some(bridge) => window_builder.initialization_script(bridge.init_script()),
            None => window_builder,
        }
    };
    #[cfg(target_os = "macos")]
    let window_builder = window_builder
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::Position::Logical(tauri::LogicalPosition::new(20.0, 23.0)))
        .with_webview_configuration(media_enabled_webview_configuration(
            profile.map(|p| connections::profile_identifier(&p.id)).transpose()?
        )?);
    window_builder.build().map_err(|_| "Verbindungsfenster konnte nicht geöffnet werden.".to_string())?;
    Ok(())
}

pub fn run() {
    
    for key in ["NO_PROXY", "no_proxy"] {
        let current_val = std::env::var(key).unwrap_or_default();
        if !current_val.contains("localhost") {
            let new_val = if current_val.is_empty() {
                "localhost,127.0.0.1".to_string()
            } else {
                format!("{},localhost,127.0.0.1", current_val)
            };
            std::env::set_var(key, new_val);
        }
    }

    let context = tauri::generate_context!();
    let builder = tauri::Builder::default();
    // Forward additional launches into the existing process instead of opening the same account
    // store in multiple app processes. The first plugin must handle this before localhost setup.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
        if !connections::handle_launch(app, &args) { connections::focus_or_reopen_main(app); }
    }));

    // #[cfg(target_os = "macos")]
    // {
    //     builder = builder.menu(menu::menu());
    // }

    #[cfg(feature = "updater")]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .invoke_handler(tauri::generate_handler![
            app_icon::set_app_icon,
            diag::diag_log,
            myinstants::myinstants_fetch_text,
            myinstants::myinstants_fetch_audio,
            connections::connection_profiles,
            connections::open_connection_profile
        ])
        .manage(connections::ConnectionState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_localhost::Builder::new(APP_PORT).build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            #[cfg(feature = "updater")]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    let updater = match handle.updater() {
                        Ok(u) => u,
                        Err(e) => {
                            eprintln!("Updater not available: {}", e);
                            return;
                        }
                    };
                    if let Ok(Some(update)) = updater.check().await {
                        let version = update.version.clone();

                        let should_update = handle
                            .dialog()
                            .message(format!(
                                "Version {} is available.\n\nWould you like to update now?",
                                version
                            ))
                            .title("Update Available")
                            .kind(MessageDialogKind::Info)
                            .buttons(MessageDialogButtons::YesNo)
                            .blocking_show();

                        if should_update {
                            if update.download_and_install(|_, _| {}, || {}).await.is_ok() {
                                handle.restart();
                            }
                        }
                    }
                });
            }

            build_client_window(app.handle(), "main", None)
                .map_err(|message| std::io::Error::new(std::io::ErrorKind::Other, message))?;
            app_icon::apply_saved(app.handle());
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            connections::handle_launch(app.handle(), &std::env::args().collect::<Vec<_>>());
            Ok(())
        })
        .run(context)
        .expect("error while building tauri application");
}
