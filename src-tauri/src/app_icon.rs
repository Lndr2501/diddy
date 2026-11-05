//! Switchable app icon. The page calls `set_app_icon` (see
//! `cinny/src/app/plugins/appIcon.ts`); the choice itself is stored by the page and re-applied on
//! every start. The bundle icon (Finder, installer) always stays the default pink one.

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
        crate::system_audio::log(&format!("app icon set: {id}"));
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

    Ok(())
}
