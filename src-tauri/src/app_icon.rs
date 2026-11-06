//! Switchable app icon. The page calls `set_app_icon` (see `cinny/src/app/plugins/appIcon.ts`).
//! The choice is also saved in a small file in the app config dir, so it is applied as soon as the
//! app starts (before the page has loaded) and, on macOS, set as the custom icon of Diddy.app so
//! the Dock shows it while the app is not running. Without a choice the bundle icon (pink) is used.

// (id, window icon for Linux/Windows, Dock icon for macOS with the macOS icon-grid margin)
const ICONS: &[(&str, &[u8], &[u8])] = &[
    ("pink", include_bytes!("../app-icons/pink.png"), include_bytes!("../app-icons/pink-mac.png")),
    ("blue", include_bytes!("../app-icons/blue.png"), include_bytes!("../app-icons/blue-mac.png")),
    ("purple", include_bytes!("../app-icons/purple.png"), include_bytes!("../app-icons/purple-mac.png")),
    ("black", include_bytes!("../app-icons/black.png"), include_bytes!("../app-icons/black-mac.png")),
    ("magenta", include_bytes!("../app-icons/magenta.png"), include_bytes!("../app-icons/magenta-mac.png")),
];

#[cfg(target_os = "macos")]
fn set_dock_icon(png: &[u8]) {
    use objc2::{AnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let data = NSData::with_bytes(png);
    let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) else {
        return;
    };
    // SAFETY: called on the main thread (checked above) with a valid image.
    unsafe { NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&image)) };
}

#[tauri::command]
pub fn set_app_icon(app: tauri::AppHandle, id: String) -> Result<(), String> {
    set_app_icon_inner(&app, &id, true)
}

fn set_app_icon_inner(app: &tauri::AppHandle, id: &str, persist: bool) -> Result<(), String> {
    let (_, window_png, dock_png) = ICONS
        .iter()
        .find(|(name, _, _)| *name == id)
        .ok_or_else(|| format!("unknown icon: {id}"))?;

    #[cfg(target_os = "macos")]
    {
        let _ = window_png;
        let dock_png: &'static [u8] = dock_png;
        app.run_on_main_thread(move || set_dock_icon(dock_png))
            .map_err(|e| e.to_string())?;
        if persist {
            // Dock icon while the app is not running; the default pink one needs no custom icon.
            let bundle_png: Option<&'static [u8]> = if id == "pink" { None } else { Some(dock_png) };
            set_bundle_icon(bundle_png);
            crate::system_audio::log(&format!("app icon set: {id}"));
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        use tauri::Manager;
        let _ = dock_png;
        if let Some(window) = app.get_webview_window("main") {
            let image = tauri::image::Image::from_bytes(window_png).map_err(|e| e.to_string())?;
            window.set_icon(image).map_err(|e| e.to_string())?;
        }
    }

    if persist {
        save_choice(app, id);
    }
    Ok(())
}

fn config_file(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    use tauri::Manager;
    app.path().app_config_dir().ok().map(|dir| dir.join("app-icon"))
}

fn save_choice(app: &tauri::AppHandle, id: &str) {
    if let Some(path) = config_file(app) {
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(path, id);
    }
}

#[cfg(target_os = "macos")]
fn set_bundle_icon(png: Option<&'static [u8]>) {
    use objc2::AnyThread;
    use objc2_app_kit::{NSImage, NSWorkspace, NSWorkspaceIconCreationOptions};
    use objc2_foundation::{NSData, NSString};

    // .../Diddy.app/Contents/MacOS/diddy -> .../Diddy.app
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let Some(bundle) = exe.ancestors().nth(3) else {
        return;
    };
    if bundle.extension().and_then(|e| e.to_str()) != Some("app") {
        return;
    }
    let image = png.and_then(|bytes| {
        let data = NSData::with_bytes(bytes);
        NSImage::initWithData(NSImage::alloc(), &data)
    });
    let path = NSString::from_str(&bundle.to_string_lossy());
    let ok = NSWorkspace::sharedWorkspace().setIcon_forFile_options(
        image.as_deref(),
        &path,
        NSWorkspaceIconCreationOptions(0),
    );
    crate::system_audio::log(&format!("bundle icon set: {ok}"));
}

/// Applies the saved choice right at startup. Done a few times because the window system may
/// reset the Dock icon while the app finishes launching.
pub fn apply_saved(app: &tauri::AppHandle) {
    let Some(id) = config_file(app).and_then(|p| std::fs::read_to_string(p).ok()) else {
        return;
    };
    let id = id.trim().to_string();
    if !ICONS.iter().any(|(name, _, _)| *name == id) {
        return;
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        for delay_ms in [0u64, 1500, 5000] {
            std::thread::sleep(std::time::Duration::from_millis(delay_ms));
            let _ = set_app_icon_inner(&handle, &id, false);
        }
    });
}
