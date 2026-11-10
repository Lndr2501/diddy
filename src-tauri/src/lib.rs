#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

// mod menu;

use tauri::{webview::{NewWindowResponse, PageLoadEvent, WebviewWindowBuilder}, Manager, WebviewUrl, TitleBarStyle};
mod agent_voice;
mod app_icon;
mod diag;
mod connections;
/// For tests/webkit_isolation.rs only.
#[cfg(target_os = "macos")]
#[doc(hidden)]
pub use connections::isolated_data_store;
mod myinstants;
mod updater;
mod window_guard;
#[cfg(target_os = "macos")]
mod audio_tap;
#[cfg(target_os = "macos")]
mod system_audio;

use tauri::utils::config::BackgroundThrottlingPolicy;
use tauri_plugin_opener::OpenerExt;

/// The local port the page is served on. A dev build (identifier ending in `.dev`) uses its own
/// port: both apps listen on `localhost`, and with a shared port `localhost` resolved to the
/// stable app (IPv6), so "Diddy Dev" silently showed the stable app's page.
const APP_PORT: u16 = 44548;
const DEV_APP_PORT: u16 = 44549;
static ACTIVE_PORT: std::sync::OnceLock<u16> = std::sync::OnceLock::new();

pub(crate) fn port_for_identifier(identifier: &str) -> u16 {
    if identifier.ends_with(".dev") {
        DEV_APP_PORT
    } else {
        APP_PORT
    }
}

pub(crate) fn app_port() -> u16 {
    *ACTIVE_PORT.get().unwrap_or(&APP_PORT)
}

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

    let mtm = MainThreadMarker::new().expect("webview setup must run on the main thread");
    // Private WKPreferences setters. Guard with respondsToSelector so a future WebKit that
    // drops them degrades to the old behaviour instead of crashing.
    unsafe {
        let config = WKWebViewConfiguration::new(mtm);
        if let Some(identifier) = profile {
            // Wry ignores data_store_identifier when a custom WK configuration is supplied.
            // Set the actual store here; never reuse the original account's default store.
            let store = connections::isolated_data_store(identifier, mtm)?;
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

/// Rebuilds a collapsed window (a few pixels wide: invisible, and the cause of the "window vanishes
/// when dragged" reports) and pulls a position outside every monitor back onto the primary one.
/// Saved state from an old session can hold either.
fn keep_window_on_screen(window: &tauri::WebviewWindow) {
    let (Ok(pos), Ok(size), Ok(monitors)) = (window.outer_position(), window.outer_size(), window.available_monitors()) else { return };
    if window.is_minimized().unwrap_or(false) || window.is_fullscreen().unwrap_or(false) {
        return;
    }
    let mut rects: Vec<window_guard::Rect> = monitors.iter()
        .map(|m| window_guard::Rect { x: m.position().x, y: m.position().y, w: m.size().width, h: m.size().height })
        .collect();
    // The primary monitor is the fallback target.
    if let Ok(Some(primary)) = window.primary_monitor() {
        let first = window_guard::Rect { x: primary.position().x, y: primary.position().y, w: primary.size().width, h: primary.size().height };
        rects.retain(|r| *r != first);
        rects.insert(0, first);
    }
    let scale = window.scale_factor().unwrap_or(1.0);
    let min = ((window_guard::MIN_LOGICAL_W * scale) as u32, (window_guard::MIN_LOGICAL_H * scale) as u32);
    let default = ((window_guard::DEFAULT_LOGICAL_W * scale) as u32, (window_guard::DEFAULT_LOGICAL_H * scale) as u32);
    let mut current = window_guard::Rect { x: pos.x, y: pos.y, w: size.width, h: size.height };
    if let Some(fixed) = window_guard::repair_collapsed(current, min, default, &rects) {
        diag::diag_log(format!("window: collapsed to {}x{} at {},{}, rebuilding as {}x{} at {},{}", current.w, current.h, current.x, current.y, fixed.w, fixed.h, fixed.x, fixed.y));
        if window.is_maximized().unwrap_or(false) {
            let _ = window.unmaximize();
        }
        let _ = window.set_size(tauri::PhysicalSize::new(fixed.w, fixed.h));
        let _ = window.set_position(tauri::PhysicalPosition::new(fixed.x, fixed.y));
        current = fixed;
    }
    if let Some((x, y)) = window_guard::fix_position(current, &rects) {
        diag::diag_log(format!("window: restored position {},{} is off screen, moving to {x},{y}", current.x, current.y));
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }
}

/// Opens the main window (after the update check, or at once when it is off or offline).
pub(crate) fn launch_main(app: &tauri::AppHandle) {
    if let Err(message) = build_client_window(app, "main", None) {
        diag::diag_log(format!("main window failed: {message}"));
        return;
    }
    app_icon::apply_saved(app);
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let args = std::env::args().collect::<Vec<_>>();
        // `--agent-voice` on a cold start (no running instance to forward to) must count too.
        agent_voice::handle_launch(&args);
        connections::handle_launch(app, &args);
    }
}

pub(crate) fn build_client_window(
    app: &tauri::AppHandle,
    label: &str,
    profile: Option<&connections::ConnectionProfile>,
) -> Result<(), String> {
    let port = app_port();
    #[cfg(debug_assertions)]
    let window_url = WebviewUrl::App(Default::default());
    #[cfg(not(debug_assertions))]
    let window_url = WebviewUrl::External(format!("http://localhost:{port}").parse().unwrap());
    let app_handle = app.clone();
    let title = profile.map(|p| format!("Diddy · {}", p.server)).unwrap_or_else(|| "Diddy".into());
    let window_builder = WebviewWindowBuilder::new(app, label.to_string(), window_url)
        .title(title)
        .disable_drag_drop_handler()
        .min_inner_size(window_guard::MIN_LOGICAL_W, window_guard::MIN_LOGICAL_H)
        // Stay hidden until the page has loaded; a small movable startup window covers the wait (#25).
        .visible(false)
        .on_page_load(move |window, payload| {
            if payload.event() == PageLoadEvent::Finished {
                reveal_window(window);
            }
        })
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
        window_builder.data_directory(connections::connection_data_dir(
            &app.path().app_data_dir().map_err(|_| "Profilverzeichnis nicht verfügbar.".to_string())?,
            &profile.id,
        )?)
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
            connections::store_identifier(profile)?
        )?);
    let window = window_builder.build().map_err(|_| "Verbindungsfenster konnte nicht geöffnet werden.".to_string())?;
    if label == "main" {
        show_startup_window(app, "Diddy startet...");
    }
    // If the page never finishes loading, show the window anyway so the problem is visible (#26).
    let fallback = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(10));
        reveal_window(fallback);
    });
    keep_window_on_screen(&window);
    // Dragging must never leave a collapsed window behind: repair it on every size change.
    {
        let guarded = window.clone();
        window.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::Resized(_)) {
                keep_window_on_screen(&guarded);
            }
        });
    }
    #[cfg(target_os = "linux")]
    enable_linux_media(&window);
    #[cfg(not(target_os = "linux"))]
    let _ = window;
    Ok(())
}

/// Fits a restored window rectangle into a screen area: never larger than the area, and the whole
/// window (title bar included) inside it. The saved window state can hold a size or position from a
/// different display setup, which left the window bigger than the screen and impossible to move (#26).
pub(crate) fn fit_into_area(
    pos: (i32, i32),
    size: (u32, u32),
    area: (i32, i32, u32, u32),
) -> ((i32, i32), (u32, u32)) {
    let (ax, ay, aw, ah) = area;
    let w = size.0.min(aw);
    let h = size.1.min(ah);
    let x = pos.0.clamp(ax, ax + (aw - w) as i32);
    let y = pos.1.clamp(ay, ay + (ah - h) as i32);
    ((x, y), (w, h))
}

fn fit_window_to_screen(window: &tauri::WebviewWindow) {
    let monitor = window.current_monitor().ok().flatten().or_else(|| window.primary_monitor().ok().flatten());
    let (Some(monitor), Ok(pos), Ok(size)) = (monitor, window.outer_position(), window.outer_size()) else { return };
    let area = monitor.work_area();
    let (new_pos, new_size) = fit_into_area(
        (pos.x, pos.y),
        (size.width, size.height),
        (area.position.x, area.position.y, area.size.width, area.size.height),
    );
    if new_size != (size.width, size.height) {
        let _ = window.set_size(tauri::PhysicalSize::new(new_size.0, new_size.1));
    }
    if new_pos != (pos.x, pos.y) {
        let _ = window.set_position(tauri::PhysicalPosition::new(new_pos.0, new_pos.1));
    }
    if new_pos != (pos.x, pos.y) || new_size != (size.width, size.height) {
        diag::diag_log(format!("window: restored rect {pos:?} {size:?} did not fit the screen, now {new_pos:?} {new_size:?}"));
    }
}

/// Shows a finished (or timed-out) client window, after fitting it to the screen, and closes the startup window.
fn reveal_window(window: tauri::WebviewWindow) {
    keep_window_on_screen(&window);
    fit_window_to_screen(&window);
    let _ = window.show();
    if window.label() == "main" {
        let _ = window.set_focus();
    }
    if let Some(splash) = window.app_handle().get_webview_window("startup") {
        let _ = splash.close();
    }
}

/// A small startup window that can be moved while the real window is still loading (#25).
fn show_startup_window(app: &tauri::AppHandle, message: &str) {
    if app.get_webview_window("startup").is_some() {
        return;
    }
    let html = format!("<body style='margin:0;height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 24px;box-sizing:border-box;background:#140812;color:#e8dfe6;font:600 17px -apple-system,sans-serif'>{message}</body>");
    let encoded = html.replace('%', "%25").replace('#', "%23").replace(' ', "%20").replace('\'', "%27");
    let Ok(url) = format!("data:text/html;charset=utf-8,{encoded}").parse() else { return };
    let _ = WebviewWindowBuilder::new(app, "startup", WebviewUrl::External(url))
        .title("Diddy")
        .inner_size(320.0, 180.0)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .center()
        .build();
}

/// macOS: WebKit's GPU process asks Core Audio for the default device while it connects to a page.
/// When coreaudiod is busy (after a quick quit and reopen, or after wake, it needed 25 to 60 s in
/// the logs of #124), that call blocks, WebKit kills its GPU process as unresponsive and the window
/// stays black (#26). Opening the window only once Core Audio answers avoids that: the user sees a
/// small startup window instead of a broken one, and nothing has to be repaired by hand (#124).
/// Returns when Core Audio answered, or after `GIVE_UP` (then the window opens anyway).
#[cfg(target_os = "macos")]
fn wait_for_core_audio(app: &tauri::AppHandle) {
    use std::sync::mpsc::RecvTimeoutError;
    use std::time::{Duration, Instant};
    const NOTICE_AFTER: Duration = Duration::from_secs(2);
    const GIVE_UP: Duration = Duration::from_secs(120);
    let (tx, rx) = std::sync::mpsc::channel();
    let started = Instant::now();
    // The probe thread may block forever when coreaudiod hangs; it is detached on purpose.
    let spawned = std::thread::Builder::new().name("coreaudio-probe".into()).spawn(move || {
        let _ = tx.send(audio_tap::probe_default_output());
    });
    if spawned.is_err() {
        return;
    }
    match rx.recv_timeout(NOTICE_AFTER) {
        Ok(Ok(_)) | Err(RecvTimeoutError::Disconnected) => return,
        Ok(Err(e)) => {
            diag::diag_log(format!("coreaudio: probe failed: {e}"));
            return;
        }
        Err(RecvTimeoutError::Timeout) => {}
    }
    diag::diag_log("coreaudio: slow to answer, opening the window once it does (#124)".into());
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        show_startup_window(&handle, "Diddy wartet auf das Audiosystem von macOS...")
    });
    match rx.recv_timeout(GIVE_UP - NOTICE_AFTER) {
        Ok(_) => {
            diag::diag_log(format!("coreaudio: answered after {:.1} s", started.elapsed().as_secs_f64()));
        }
        Err(_) => {
            diag::diag_log(format!(
                "coreaudio: no answer from coreaudiod after {} s; WebKit may not draw the window (#26)",
                GIVE_UP.as_secs()
            ));
            use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
            app.dialog()
                .message(
                    "Das Audiosystem von macOS (coreaudiod) antwortet seit über zwei Minuten nicht. \
                     Deshalb kann das Diddy-Fenster nicht gezeichnet werden. Andere Apps (z. B. Musik) \
                     hängen dann ebenfalls.\n\n\
                     Abhilfe: Im Terminal „sudo killall coreaudiod“ ausführen (oder den Mac neu starten) \
                     und Diddy danach neu öffnen.",
                )
                .title("Diddy kann nicht starten")
                .kind(MessageDialogKind::Warning)
                .show(|_| {});
        }
    }
}

/// Linux: WebKitGTK ships with media capture and WebRTC switched off and denies every permission
/// request that nobody handles, so Element Call can neither open the microphone nor connect.
/// Turn the media settings on and allow camera / microphone / screen and device-list requests.
#[cfg(target_os = "linux")]
fn enable_linux_media(window: &tauri::WebviewWindow) {
    // Test hook for machines without camera/microphone (CI, containers): mock capture devices and
    // a probe in the real page that reports through diag_log. Never set in normal use.
    let selftest = std::env::var_os("DIDDY_MEDIA_SELFTEST").is_some();
    let result = window.with_webview(move |webview| {
        use webkit2gtk::glib::prelude::ObjectExt;
        use webkit2gtk::{
            DeviceInfoPermissionRequest, PermissionRequestExt, SettingsExt, UserMediaPermissionRequest,
            WebViewExt,
        };
        let view = webview.inner();
        if let Some(settings) = WebViewExt::settings(&view) {
            settings.set_enable_media_stream(true);
            settings.set_enable_mediasource(true);
            settings.set_enable_media_capabilities(true);
            settings.set_enable_webrtc(true);
            settings.set_media_playback_requires_user_gesture(false);
            if selftest {
                settings.set_enable_mock_capture_devices(true);
            }
        }
        view.connect_permission_request(|_, request| {
            let media = request.is::<UserMediaPermissionRequest>()
                || request.is::<DeviceInfoPermissionRequest>();
            if media {
                request.allow();
            }
            media
        });
        eprintln!("diddy: linux media capture and WebRTC enabled");
        diag::diag_log("linux: media capture and WebRTC enabled".into());
    });
    if let Err(e) = result {
        eprintln!("diddy: linux media setup failed: {e}");
        diag::diag_log(format!("linux: media setup failed: {e}"));
    }
    if selftest {
        let window = window.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_secs(12));
            let _ = window.eval(include_str!("linux_media_selftest.js"));
        });
    }
}

/// The system-audio helper is this same executable started with a flag (see system_audio.rs).
/// Returns its exit code when this process is the helper; the app must then not start.
pub fn system_audio_helper(args: &[String]) -> Option<i32> {
    #[cfg(target_os = "macos")]
    {
        system_audio::helper_main(args)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = args;
        None
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

    diag::init(env!("CARGO_PKG_VERSION"));
    let context = tauri::generate_context!();
    let _ = ACTIVE_PORT.set(port_for_identifier(&context.config().identifier));
    let builder = tauri::Builder::default();
    // Forward additional launches into the existing process instead of opening the same account
    // store in multiple app processes. The first plugin must handle this before localhost setup.
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
        // Agent-voice triggers (#57) come in while the user dictates elsewhere: never focus Diddy.
        if agent_voice::handle_launch(&args) { return; }
        // The main window opens after the update check; a second launch meanwhile changes nothing.
        if updater::is_active(app) { return; }
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
            diag::log_path,
            diag::open_log_folder,
            myinstants::myinstants_fetch_text,
            myinstants::myinstants_fetch_audio,
            connections::connection_profiles,
            connections::open_connection_profile,
            connections::remove_connection_profile,
            agent_voice::agent_voice_state,
            updater::updater_state,
            updater::updater_action,
            updater::updater_open_release_page,
            updater::updater_set_config
        ])
        .manage(connections::ConnectionState::default())
        .manage(updater::UpdaterState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_localhost::Builder::new(app_port()).build())
        // Without VISIBLE: the plugin would show every restored window right away (on window ready),
        // which defeats the hidden-until-loaded start (#25); reveal_window shows it instead.
        // The startup window is temporary and has no state worth keeping.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(tauri_plugin_window_state::StateFlags::all() & !tauri_plugin_window_state::StateFlags::VISIBLE & !tauri_plugin_window_state::StateFlags::DECORATIONS)
                .with_denylist(&["startup", "updater"])
                .build(),
        )
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

            // Check for updates first (#120); the main window opens afterwards via launch_main.
            // On macOS this waits until Core Audio answers (usually at once, #124).
            #[cfg(target_os = "macos")]
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    wait_for_core_audio(&handle);
                    let start_handle = handle.clone();
                    let _ = handle.run_on_main_thread(move || updater::start(start_handle));
                });
            }
            #[cfg(not(target_os = "macos"))]
            updater::start(app.handle().clone());
            Ok(())
        })
        .run(context)
        .expect("error while building tauri application");
}

#[cfg(test)]
mod window_fit_tests {
    use super::fit_into_area;

    const SCREEN: (i32, i32, u32, u32) = (0, 30, 1920, 1050);

    #[test]
    fn leaves_a_fitting_window_alone() {
        assert_eq!(fit_into_area((100, 80), (1200, 800), SCREEN), ((100, 80), (1200, 800)));
    }

    #[test]
    fn shrinks_the_issue_26_window_to_the_screen() {
        // Saved state from #26: 2991 wide at x=742 on a 1920 wide display.
        assert_eq!(fit_into_area((742, 30), (2991, 1050), SCREEN), ((0, 30), (1920, 1050)));
    }

    #[test]
    fn pulls_an_offscreen_window_back() {
        assert_eq!(fit_into_area((-500, -200), (800, 600), SCREEN), ((0, 30), (800, 600)));
        assert_eq!(fit_into_area((5000, 4000), (800, 600), SCREEN), ((1120, 480), (800, 600)));
    }
}

#[cfg(test)]
mod port_tests {
    use super::*;

    #[test]
    fn dev_build_has_its_own_port() {
        assert_eq!(port_for_identifier("app.diddy.desktop"), 44548);
        assert_eq!(port_for_identifier("app.diddy.desktop.dev"), 44549);
        assert_ne!(port_for_identifier("app.diddy.desktop"), port_for_identifier("app.diddy.desktop.dev"));
    }
}
