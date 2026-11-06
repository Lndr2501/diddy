#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// mod menu;

use tauri::{webview::{NewWindowResponse, WebviewWindowBuilder}, WebviewUrl, TitleBarStyle};
mod app_icon;
mod diag;
mod myinstants;
#[cfg(target_os = "macos")]
mod system_audio;

use tauri::utils::config::BackgroundThrottlingPolicy;
use tauri_plugin_opener::OpenerExt;

#[cfg(feature = "updater")]
use tauri_plugin_updater::UpdaterExt;
#[cfg(feature = "updater")]
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};

/// macOS: WKWebView ships with `navigator.mediaDevices` (getUserMedia) switched off, which makes
/// Element Call hang forever on "Join", and fullscreen is off. Flip the WebKit switches before the page loads.
#[cfg(target_os = "macos")]
fn media_enabled_webview_configuration() -> objc2::rc::Retained<objc2_web_kit::WKWebViewConfiguration> {
    use objc2::{msg_send, runtime::{Bool, NSObjectProtocol}, sel, MainThreadMarker};
    use objc2_web_kit::WKWebViewConfiguration;

    let mtm = MainThreadMarker::new().expect("webview setup must run on the main thread");
    // Private WKPreferences setters. Guard with respondsToSelector so a future WebKit that
    // drops them degrades to the old behaviour instead of crashing.
    unsafe {
        let config = WKWebViewConfiguration::new(mtm);
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
        config
    }
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

    let port: u16 = 44548;
    let context = tauri::generate_context!();
    #[cfg(feature = "updater")]
    let mut builder = tauri::Builder::default();
    #[cfg(not(feature = "updater"))]
    let builder = tauri::Builder::default();

    // #[cfg(target_os = "macos")]
    // {
    //     builder = builder.menu(menu::menu());
    // }

    #[cfg(feature = "updater")]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .invoke_handler(tauri::generate_handler![
            app_icon::set_app_icon,
            diag::diag_log,
            myinstants::myinstants_fetch_text,
            myinstants::myinstants_fetch_audio
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_localhost::Builder::new(port).build())
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

            // Dev: use devUrl from tauri.conf.json (http://localhost:8080) to support HMR
            #[cfg(debug_assertions)]
            let window_url = WebviewUrl::App(Default::default());

            // Release: tauri-plugin-localhost serves bundled frontend assets on this port
            #[cfg(not(debug_assertions))]
            let window_url = {
                let url = format!("http://localhost:{}", port).parse().unwrap();
                WebviewUrl::External(url)
            };

            let app_handle = app.handle().clone();
            let window_builder = WebviewWindowBuilder::new(app, "main".to_string(), window_url)
                .title("Diddy")
                .disable_drag_drop_handler()
                // Keep timers/encoders at full speed while the window is hidden or behind a game,
                // otherwise WebKit throttles screen-share frame rate and quality.
                .background_throttling(BackgroundThrottlingPolicy::Disabled)
                .on_new_window(move |url, _features| {
                    let _ = app_handle.opener().open_url(url.as_str(), None::<&str>);
                    NewWindowResponse::Deny
                });

            // Screen-share audio: native capture bridged to the page (WebKit can't capture it).
            #[cfg(target_os = "macos")]
            let window_builder = match system_audio::spawn(vec![
                format!("http://localhost:{port}"),
                "http://localhost:8080".to_string(), // `tauri dev`
            ]) {
                Ok(bridge) => window_builder.initialization_script(bridge.init_script()),
                Err(e) => {
                    eprintln!("system audio bridge unavailable: {e}");
                    window_builder
                }
            };

            #[cfg(target_os = "macos")]
            let window_builder = window_builder
                // Overlay title bar: web content extends under the title bar and the traffic
                // lights sit inside the app's own ~44px top row (see components/titlebar).
                .title_bar_style(TitleBarStyle::Overlay)
                .hidden_title(true)
                .traffic_light_position(tauri::Position::Logical(tauri::LogicalPosition::new(
                    20.0, 23.0,
                )))
                .with_webview_configuration(media_enabled_webview_configuration());
            
            window_builder.build()?;
            app_icon::apply_saved(app.handle());
            Ok(())
        })
        .run(context)
        .expect("error while building tauri application");
}
